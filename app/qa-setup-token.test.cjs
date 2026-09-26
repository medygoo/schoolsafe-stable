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
  await page.route('**/auth/onboarding/me', r => r.fulfill(options.resume ? {json:{...applicant,status:'approved'}} : {status:401,json:{message:'Session required'}}));
  page.on('request', r => { if (r.url().includes(':8787')) calls.push({url:r.url(),method:r.method()}); });
  if (options.prepare) await options.prepare(page);
  await page.goto(uiURL + (options.fragment || ''), {waitUntil:'networkidle'});
  return {page,context,calls};
}
async function registration(t, viewport, options) {
  const result = await openUI(t,viewport,options);
  await result.page.locator('#enterSplash').click();
  await result.page.locator('.auth-other-access summary').click();
  await result.page.locator('#createAccount').click();
  const modal=result.page.locator('.ss-modal-overlay.is-open');
  await expect(modal).toBeVisible();
  return {...result,modal,form:modal.locator('#accountRegistrationForm')};
}
async function fillAccount(form) {
  for (const [key,value] of Object.entries({...applicant,password:'synthetic-password-123',confirmation:'synthetic-password-123'})) await form.locator('[name="'+key+'"]').fill(value);
}
async function noSensitiveStorage(page) {
  const stored=await page.evaluate(()=>JSON.stringify([Object.entries(localStorage),Object.entries(sessionStorage)]));
  for(const forbidden of [syntheticToken,'synthetic-password-123','legacy-secret','data:image','officialLogoData','adminPassword']) assert.ok(!stored.includes(forbidden),'Sensitive storage: '+forbidden);
}
for(const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
 const size=viewport.width===390?'mobile':'desktop';
 test(size+': account registration validates, waits and creates only pending account',async t=>{
  const {page,modal,form,calls}=await registration(t,viewport);
  let sent=[],release;const gate=new Promise(r=>release=r);t.after(()=>release());
  await page.route('**/auth/registrations',async r=>{sent.push(r.request().postDataJSON());assert.equal(r.request().method(),'POST');await gate;r.fulfill({status:202,json:{request_id:'request',status:'pending'}});});
  const submit=modal.locator('[type=submit]');
  await submit.click();assert.equal(sent.length,0);
  await fillAccount(form);await form.locator('[name=confirmation]').fill('different-password');await submit.click();
  await expect(modal.locator('.ss-modal__error')).toContainText('correspondent');assert.equal(sent.length,0);
  await form.locator('[name=confirmation]').fill('synthetic-password-123');await form.locator('[name=phone]').fill('123');await submit.click();assert.equal(sent.length,0);
  await form.locator('[name=phone]').fill('0812345678');await submit.click();await expect(submit).toBeDisabled();
  await page.keyboard.press('Escape');await expect(modal).toBeVisible();
  await expect.poll(()=>sent.length).toBe(1); assert.deepEqual(sent,[{...applicant,password:'synthetic-password-123'}]);release();
  await expect(modal).toContainText('Votre demande a été envoyée.');await expect(modal).toContainText('Votre compte reste verrouillé jusqu’à validation SchoolSafe.');
  await expect(page.locator('#setup')).not.toHaveClass(/active/);await expect(modal.locator('input[type=password]')).toHaveCount(0);
  assert.ok(!calls.some(c=>c.url.includes('/setup/')));await noSensitiveStorage(page);
 });
 for(const scenario of ['duplicate','delivery failure','network failure','config unavailable','disabled']) test(size+': registration '+scenario+' stays visible',async t=>{
  const {page,modal,form}=await registration(t,viewport,{configError:scenario==='config unavailable',available:scenario!=='disabled'});
  let submissions=0;await page.route('**/auth/registrations',r=>{submissions++;return scenario==='network failure'?r.abort():r.fulfill({status:scenario==='duplicate'?409:503,json:{message:'Inscription indisponible'}});});
  await fillAccount(form);await modal.locator('[type=submit]').click();await expect(modal.locator('.ss-modal__error')).toBeVisible();
  await expect(modal.locator('[type=submit]')).toBeEnabled();await expect(page.locator('#setup')).not.toHaveClass(/active/);
  if(['disabled','config unavailable'].includes(scenario))assert.equal(submissions,0);await noSensitiveStorage(page);
 });
 for(const decision of ['approve','reject'])test(size+': fragment approval '+decision+' is scrubbed and requires explicit POST',async t=>{
  let reviews=0,decisions=0,release;const gate=new Promise(r=>release=r);t.after(()=>release());
  const {page}=await openUI(t,viewport,{fragment:'#account-approval='+syntheticToken,prepare:async page=>{
   await page.route('**/auth/registrations/review',async r=>{reviews++;assert.equal(new URL(page.url()).hash,'');assert.equal(r.request().method(),'POST');assert.deepEqual(r.request().postDataJSON(),{token:syntheticToken});await r.fulfill({json:{...applicant,first_name:'<img src=x onerror=alert(1)>',request_id:'request',status:'pending'}});});
   await page.route('**/auth/registrations/decision',async r=>{decisions++;assert.equal(r.request().method(),'POST');assert.deepEqual(r.request().postDataJSON(),{token:syntheticToken,decision});await gate;await r.fulfill({json:{request_id:'request',status:decision==='approve'?'approved':'rejected'}});});
  }});
  const modal=page.locator('.ss-modal-overlay.is-open');await expect(modal).toContainText(applicant.email);assert.equal(reviews,1);assert.equal(decisions,0);
  await expect(modal.locator('img')).toHaveCount(0);assert.equal(new URL(page.url()).hash,'');
  await modal.getByRole('button',{name:decision==='approve'?'APPROUVER':'REFUSER',exact:true}).click();
  await expect(modal.getByRole('button',{name:'APPROUVER',exact:true})).toBeDisabled();await expect(modal.getByRole('button',{name:'REFUSER',exact:true})).toBeDisabled();
  await page.keyboard.press('Escape');await expect(modal).toBeVisible();assert.equal(decisions,1);release();
  await expect(modal).toContainText(decision==='approve'?'Compte approuvé':'Compte refusé');await noSensitiveStorage(page);
 });
 for(const invalid of [false,true])test(size+': expired or malformed approval '+invalid+' reveals no account',async t=>{
  let reviews=0;const {page}=await openUI(t,viewport,{fragment:'#account-approval='+(invalid?'invalid':syntheticToken),prepare:async page=>{
   await page.route('**/auth/registrations/review',r=>{reviews++;return r.fulfill({status:403,json:{message:'Approval unavailable'}});});
  }});
  const modal=page.locator('.ss-modal-overlay.is-open');await expect(modal).toContainText('Lien invalide ou expiré.');await expect(modal).not.toContainText(applicant.email);
  assert.equal(reviews,invalid?0:1);assert.equal(new URL(page.url()).hash,'');await noSensitiveStorage(page);
 });
 test(size+': approved login resumes seven steps, keeps administrator and submits one school',async t=>{
  const {page,calls}=await openUI(t,viewport,{draft:{schoolName:'Brouillon',setupToken:'legacy-secret',adminPassword:'legacy-secret',officialLogoData:'data:image/png;base64,legacy-secret'}});
  await noSensitiveStorage(page);
  await page.route('**/auth/native/login',r=>r.fulfill({json:{code:'ONBOARDING_REQUIRED'}}));
  await page.route('**/auth/onboarding/me',r=>r.fulfill({json:{...applicant,status:'approved'}}));
  let submissions=[];await page.route('**/auth/onboarding/school',r=>{submissions.push(r.request().postDataJSON());return r.fulfill({status:201,json:{school_id:'school',profile_id:'profile',status:'completed'}});});
  await page.locator('#enterSplash').click();await page.locator('#emailIdentifier').fill(applicant.email);await page.locator('#password').fill('synthetic-password-123');await page.locator('#loginForm button[type=submit]').click();
  await expect(page.locator('#setup.active')).toBeVisible();await expect(page.locator('#password')).toHaveValue('');
  await expect(page.locator('#stepNav button')).toHaveCount(7);for(const button of await page.locator('#stepNav button').all())await expect(button).toBeVisible();
  await page.locator('#schoolName').fill('École Test');await page.locator('#nextStep').click();await page.locator('#nextStep').click();await page.locator('#nextStep').click();
  await page.locator('#email').fill('school@example.test');await page.locator('#phone').fill('+243812345678');await page.locator('#nextStep').click();await page.locator('#nextStep').click();
  await expect(page.locator('#stepTitle')).toHaveText('Administrateur principal');await expect(page.locator('#stepContent')).toContainText('Ce compte deviendra l’Administrateur principal de cette école.');
  for(const [id,key] of [['adminFirstName','first_name'],['adminLastName','last_name'],['adminEmail','email'],['adminPhone','phone']]){await expect(page.locator('#'+id)).toHaveValue(applicant[key]);await expect(page.locator('#'+id)).toHaveAttribute('readonly','');}
  await expect(page.locator('#stepContent input[type=password]')).toHaveCount(0);await page.locator('#nextStep').click();await page.locator('#nextStep').click();
  await expect(page.locator('#auth.active')).toBeVisible();assert.equal(submissions.length,1);
  assert.deepEqual(Object.keys(submissions[0]).sort(),['identity','cycles','academic_year','contact','brand'].sort());assert.equal(submissions[0].identity.name_fr,'École Test');
  assert.ok(!JSON.stringify(submissions[0]).includes('data:'));assert.ok(!JSON.stringify(submissions[0]).includes('admin'));assert.ok(!calls.some(c=>c.url.includes('/setup/')));
  assert.equal(await page.evaluate(()=>localStorage.getItem('schoolsafe-v2-setup')),null);await noSensitiveStorage(page);
 });
 test(size+': refresh resumes only validated onboarding and logout revokes cookie',async t=>{
  const {page}=await openUI(t,viewport,{resume:true});await expect(page.locator('#setup.active')).toBeVisible();
  let logout=0;await page.route('**/auth/onboarding/logout',r=>{logout++;assert.equal(r.request().method(),'POST');return r.fulfill({json:{status:'logged_out'}});});
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
