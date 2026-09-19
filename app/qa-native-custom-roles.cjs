/* Permission editing races/failure proof. The live API/PG path is tested separately. */
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<main id="editor"></main>');
    await page.addScriptTag({ path: path.join(__dirname, 'modules/administration/access-role-editor.js') });
    await page.evaluate(() => {
      window.denials = []; window.saved = []; window.writes = []; window.generation = 0;
      window.data = (id, name) => ({ schoolId: 'school', revision: '1', templates: [],
        catalog: [{ code: 'staff.read', label: 'Personnel', scopes: ['school'] }, { code: 'finance.fee.read', label: 'Frais scolaires', scopes: ['school'] }],
        detail: { role: { id, label: name + ' test', is_active: true }, editable: true, memberCount: 2, members: [{ display_name: '<img src=x onerror=alert(1)>' }],
          grants: [{ permission: 'staff.read', effect: 'allow', is_active: true, scopes: [{ type: 'school' }], conditions: [] }] } });
      window.SchoolSafeAccessNative = {
        roleEditor: async id => window.data(id, id),
        saveRole: async (id, input) => { window.writes.push({ id, input }); return new Promise(resolve => { window.releaseWrite = resolve; }); },
      };
      window.openEditor = id => {
        const ticket = ++window.generation;
        return SchoolSafeRoleEditor.open(document.getElementById('editor'), id, {
          isCurrent: () => ticket === window.generation,
          checkSchool: d => { if (d.schoolId !== 'school') throw Object.assign(new Error('wrong school'), { status: 401 }); },
          onDenied: e => window.denials.push(e.status), onSaved: id => window.saved.push(id),
        });
      };
    });
    // Late A cannot replace the chosen B or inject an unescaped name.
    await page.evaluate(() => {
      SchoolSafeAccessNative.roleEditor = id => id === 'A' ? new Promise(resolve => { window.releaseRead = resolve; }) : Promise.resolve(data(id, id));
      openEditor('A');
    });
    await page.evaluate(() => openEditor('B'));
    await page.evaluate(() => releaseRead(data('A', 'Old A')));
    assert.equal(await page.locator('h3').innerText(), 'Poste : B test');
    assert.equal(await page.locator('img').count(), 0);

    // Filtering must not remove checked permissions hidden by the search.
    await page.locator('[data-composition-search]').fill('Frais');
    await page.locator('[data-composition-row="finance.fee.read"] [data-permission-check]').check();
    await page.locator('[data-composition-row="finance.fee.read"] [data-permission-scope]').selectOption('school');
    await page.locator('[name="reason"]').fill('Confirmation des permissions');
    await page.locator('[name="confirmed"]').check();
    await page.locator('button[type="submit"]').click();
    await page.evaluate(() => document.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    const writes = await page.evaluate(() => window.writes);
    assert.equal(writes.length, 1, 'only one write while pending');
    assert.deepEqual(writes[0].input.grants, [
      { permission: 'staff.read', effect: 'allow' },
      { permission: 'finance.fee.read', effect: 'allow', scope: 'school' },
    ]);
    // A delayed success for a closed editor cannot navigate or update a new view.
    await page.evaluate(async () => { await openEditor('C'); releaseWrite({ schoolId: 'school', roleId: 'B' }); });
    assert.deepEqual(await page.evaluate(() => window.saved), []);
    assert.equal(await page.locator('h3').innerText(), 'Poste : C test');

    await page.evaluate(() => { SchoolSafeAccessNative.saveRole = async () => { throw Object.assign(new Error('Les accès ont changé.'), { status: 409 }); }; });
    await page.locator('[name="reason"]').fill('Mon motif conservé');
    await page.locator('[name="confirmed"]').check();
    await page.locator('button[type="submit"]').click();
    await page.getByRole('alert').waitFor();
    assert.equal(await page.locator('[name="reason"]').inputValue(), 'Mon motif conservé');
    assert.equal(await page.locator('button[type="submit"]').isDisabled(), true);
    // Reload with a mismatched tenant clears the editor instead of showing it.
    await page.evaluate(() => { SchoolSafeAccessNative.roleEditor = async id => ({ ...data(id, id), schoolId: 'other' }); });
    await page.getByText('Recharger le poste', { exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.denials), [401]);
    assert.equal(await page.locator('form').count(), 0);
    console.log('PASS custom role UI: stale reads/writes, escaped names, hidden grants retained, single submit, frozen conflict, tenant change');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
