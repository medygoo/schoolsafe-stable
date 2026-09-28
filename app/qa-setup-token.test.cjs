const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { chromium, expect } = require('@playwright/test');

// Run with: node --test app/qa-setup-token.test.cjs
// Only synthetic tokens and local HTTP fixtures are used.
let browser, preview, fixture;
let version = 1;
const uiURL = 'http://127.0.0.1:4189/';
let swURL;
const chromePath = process.env.CHROME_PATH || [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
].find(fs.existsSync);

before(async () => {
  preview = spawn(process.execPath, [path.join(__dirname, 'server.mjs'), '--port', '4189'], {
    stdio: 'ignore', windowsHide: true,
  });
  for (let attempt = 0; ; attempt++) {
    if (preview.exitCode !== null) throw new Error('Preview server exited');
    try { await fetch(uiURL); break; } catch (error) {
      if (attempt >= 50) throw error;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  fixture = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    res.setHeader('Cache-Control', 'no-store');
    if (pathname === '/sw.js') {
      res.setHeader('Content-Type', 'application/javascript');
      res.end(fs.readFileSync(path.join(__dirname, 'sw.js')));
    } else if (pathname === '/' || pathname === '/index.html') {
      res.setHeader('Content-Type', 'text/html');
      res.end('<!doctype html><title>Offline fixture</title><script src="./app.js"></script><p>Cached shell</p>');
    } else if (pathname === '/app.js') {
      res.setHeader('Content-Type', 'application/javascript');
      res.end('window.fixtureVersion = ' + version + ';');
    } else if (pathname === '/missing.js') {
      res.writeHead(404); res.end('Missing');
    } else {
      res.setHeader('Content-Type', 'text/plain');
      res.end('fixture-' + version);
    }
  });
  fixture.listen(0, '127.0.0.1');
  await once(fixture, 'listening');
  swURL = 'http://127.0.0.1:' + fixture.address().port + '/';
  browser = await chromium.launch({ executablePath: chromePath, headless: true });
});

after(async () => {
  if (browser) await browser.close();
  if (fixture) { fixture.closeAllConnections(); await new Promise(resolve => fixture.close(resolve)); }
  if (preview && preview.exitCode === null) { preview.kill(); await once(preview, 'exit'); }
});

const applicant = {first_name:'Ada',last_name:'Test',email:'ada@example.test',phone:'+243812345678'};
const syntheticToken = 'a'.repeat(43);
async function openUI(t, viewport, options = {}) {
  const context = await browser.newContext({serviceWorkers:'block',viewport});
  t.after(() => context.close());
  if (options.draft) await context.addInitScript(draft => localStorage.setItem('schoolsafe-v2-setup', JSON.stringify(draft)), options.draft);
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  const calls = [];
  await page.route('**/config', r => options.configError ? r.abort() : r.fulfill({json:{auth_mode:'native',account_registration_available:options.available !== false}}));
  await page.route('**/auth/native/me', r => r.fulfill({status:401,json:{message:'Session required'}}));
  await page.route('**/auth/onboarding/me', r => r.fulfill(options.resume ? {json:{...applicant,status:'onboarding'}} : {status:401,json:{message:'Session required'}}));
  page.on('request', r => { if (r.url().includes(':8787')) calls.push({url:r.url(),method:r.method()}); });
  if (options.prepare) await options.prepare(page);
  await page.goto(uiURL + (options.fragment || ''), {waitUntil:'networkidle'});
  return {page,context,calls};
}
async function noSensitiveStorage(page) {
  const stored=await page.evaluate(()=>JSON.stringify([Object.entries(localStorage),Object.entries(sessionStorage)]));
  for(const forbidden of [syntheticToken,'synthetic-password-123','legacy-secret','data:image','officialLogoData','adminPassword']) assert.ok(!stored.includes(forbidden),'Sensitive storage: '+forbidden);
}
for (const [size,viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]) {
 test(size+': Control login, seven steps without code, validation failure and retry',async t=>{
  const {page,calls}=await openUI(t,viewport,{draft:{schoolName:'Brouillon',setupToken:'legacy-secret',adminPassword:'legacy-secret'}});
  await noSensitiveStorage(page);await expect(page.locator('#createAccount')).toHaveCount(0);
  await page.route('**/auth/native/login',r=>r.fulfill({json:{code:'ONBOARDING_REQUIRED'}}));
  await page.route('**/auth/onboarding/me',r=>r.fulfill({json:{...applicant,status:'onboarding'}}));
  let submissions=[];
  await page.route('**/auth/onboarding/school',r=>{submissions.push(r.request().postDataJSON());return r.fulfill({status:503,json:{message:'Création temporairement indisponible.'}});});
  await page.locator('#enterSplash').click();await page.locator('#emailIdentifier').fill(applicant.email);await page.locator('#password').fill('synthetic-password-123');await page.locator('#loginForm button[type=submit]').click();
  await expect(page.locator('#setup.active')).toBeVisible();await expect(page.locator('#password')).toHaveValue('');
  await expect(page.locator('#stepNav button')).toHaveCount(7);
  await expect(page.locator('#stepNav button span:nth-child(2)')).toHaveText(['Identité','Cycles','Année scolaire','Coordonnées','Identité visuelle','Administrateur','Vérification']);
  await page.locator('#schoolName').fill('École Test');await page.locator('#nextStep').click();await page.locator('#nextStep').click();await page.locator('#nextStep').click();
  await page.locator('#email').fill('school@example.test');await page.locator('#phone').fill('+243812345678');await page.locator('#nextStep').click();await page.locator('#nextStep').click();
  await expect(page.locator('#stepTitle')).toHaveText('Administrateur principal');
  await page.locator('#adminFirstName').fill('Ada');await page.locator('#adminLastName').fill('Test');
  await expect(page.locator('#adminEmail')).toHaveAttribute('readonly','');await page.locator('#nextStep').click();
  await expect(page.locator('#stepTitle')).toHaveText('Vérification');
  await expect(page.getByLabel('Code d’activation SchoolSafe')).toHaveCount(0);
  await expect(page.locator('#nextStep')).toContainText('ACTIVER MON ÉCOLE');
  await page.locator('#nextStep').click();
  await expect(page.locator('#nextStep')).toBeEnabled();assert.equal(submissions.length,1);
  await expect(page.getByText('Création temporairement indisponible.',{exact:true})).toBeVisible();
  assert.equal(submissions[0].identity.name_fr,'École Test');assert.ok(!Object.hasOwn(submissions[0],'activation_code'));
  assert.deepEqual(submissions[0].admin,{first_name:'Ada',last_name:'Test'});
  await expect(page.locator('#setup.active')).toBeVisible();await noSensitiveStorage(page);
  assert.ok(!calls.some(c=>c.url.includes('/auth/registrations')));
  const bootstrap={profile:{id:'profile',display_name:'Ada Test'},schoolId:'school',school:{id:'school',code:'SCH-TEST',name:'École Test'},roles:['admin'],permissions:['roles.manage'],scopes:[{permission:'roles.manage',type:'school',target:null}],deniedPermissions:[],deniedRules:[]};
  await page.route('**/auth/native/me',r=>r.fulfill({json:{profile_id:'profile'}}));
  await page.route('**/native/session/bootstrap',r=>r.fulfill({json:{data:bootstrap}}));
  await page.route('**/auth/onboarding/school',r=>{submissions.push(r.request().postDataJSON());return r.fulfill({status:201,json:{school_id:'school',profile_id:'profile',status:'completed'}});});
  await page.locator('#nextStep').click();await expect(page.locator('#workspace.active')).toBeVisible();
  assert.equal(submissions.length,2);await noSensitiveStorage(page);
  assert.equal(await page.evaluate(()=>localStorage.getItem('schoolsafe-v2-setup')),null);
  await page.reload();await expect(page.locator('#workspace.active')).toBeVisible();
 });
 test(size+': refresh resumes onboarding and logout revokes cookie',async t=>{
  const {page}=await openUI(t,viewport,{resume:true});await expect(page.locator('#setup.active')).toBeVisible();
  let logout=0;await page.route('**/auth/onboarding/logout',r=>{logout++;return r.fulfill({json:{status:'logged_out'}});});
  await page.locator('#closeSetup').click();await expect(page.locator('#auth.active')).toBeVisible();assert.equal(logout,1);await noSensitiveStorage(page);
 });
}
async function controlledPage(t) {
  version = 1;
  const context = await browser.newContext({ serviceWorkers: 'allow' });
  t.after(() => context.close());
  const page = await context.newPage();
  await page.goto(swURL);
  await page.evaluate(async () => {
    await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise(resolve => {
      navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
    });
  });
  return { page, context };
}

for (const asset of ['app.js', 'styles.css', 'page.html', 'manifest.webmanifest']) {
  test('PWA refreshes online ' + asset + ' and retains its offline fallback', async t => {
    const { page, context } = await controlledPage(t);
    const read = () => page.evaluate(async asset => (await fetch('/' + asset)).text(), asset);
    const first = await read();
    version = 2;
    const fresh = await read();
    assert.notEqual(fresh, first, 'Online asset must use the new server version');
    await context.setOffline(true);
    assert.equal(await read(), fresh, 'Offline must return latest cached asset');
  });
}

test('PWA retains navigation offline and does not substitute HTML for missing JS', async t => {
  const { page, context } = await controlledPage(t);
  version = 2;
  await page.reload();
  assert.equal(await page.evaluate(() => window.fixtureVersion), 2);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('p')).toHaveText('Cached shell');
  assert.equal(await page.evaluate(() => window.fixtureVersion), 2);
  assert.equal(await page.evaluate(async () => {
    try { await fetch('/missing.js'); return 'unexpected response'; } catch { return 'network error'; }
  }), 'network error');
});

test('PWA keeps immutable fonts, images and icons cache-first', async t => {
  const { page } = await controlledPage(t);
  for (const asset of ['assets/fonts/test.woff2', 'photo.png', 'icons/icon-192.png']) {
    version = 1;
    const first = await page.evaluate(async p => (await fetch('/' + p)).text(), asset);
    version = 2;
    assert.equal(await page.evaluate(async p => (await fetch('/' + p)).text(), asset), first);
  }
});

test('PWA never caches API, config or setup responses, including offline', async t => {
  const { page, context } = await controlledPage(t);
  for (const endpoint of ['/auth/me', '/native/students', '/api/private', '/config', '/setup/status']) {
    await context.setOffline(false);
    version = 1;
    await page.evaluate(async p => (await fetch(p)).text(), endpoint);
    version = 2;
    assert.equal(await page.evaluate(async p => (await fetch(p)).text(), endpoint), 'fixture-2');
    assert.equal(await page.evaluate(async p => Boolean(await caches.match(p)), endpoint), false);
    await context.setOffline(true);
    assert.equal(await page.evaluate(async p => {
      try { await fetch(p); return 'cached'; } catch { return 'network error'; }
    }, endpoint), 'network error');
  }
});
