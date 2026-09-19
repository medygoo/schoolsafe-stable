/* Browser lifecycle proof with a deterministic Web Speech adapter, not real audio. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const base = process.env.SCHOOLSAFE_URL || 'http://127.0.0.1:4176/';
const output = process.env.JASPE_QA_OUTPUT;
async function capture(page, name) {
  if (!output) return;
  fs.mkdirSync(output, { recursive: true });
  await page.screenshot({ path: path.join(output, name + '.png') });
}

async function checkVoice(page, width) {
  await page.goto(base);
  await page.evaluate(() => {
    schoolSafeShow('auth');
    const mount = SchoolSafeJaspe2d.mountShowcase;
    SchoolSafeJaspe2d.mountShowcase = (...args) => (window.qaShowcase = mount(...args));
    window.qaAudio = { spoken: [], cancels: 0, aborts: 0 };
    window.SpeechRecognition = class {
      start() { window.qaRecognition = this; this.onstart?.(); }
      abort() { qaAudio.aborts++; }
    };
    speechSynthesis.speak = utterance => {
      qaAudio.spoken.push(utterance.text);
      window.qaUtterance = utterance;
      utterance.onstart?.();
    };
    speechSynthesis.cancel = () => { qaAudio.cancels++; };
  });
  await page.locator('#demoRole').selectOption('admin');
  await page.locator('#previewWorkspace').evaluate(el => el.click());
  await page.locator('#jaspeHeroMic').waitFor({ state: 'visible' });
  await page.evaluate(width => document.documentElement.dataset.theme = width === 390 ? 'dark' : 'light', width);
  const mic = page.locator('#jaspeHeroMic');
  const status = page.locator('#jaspeHeroAudioStatus');
  const voice = page.locator('#jaspeHeroVoice');
  const field = page.locator('[data-jaspe-chat-input]');
  const send = page.locator('[data-jaspe-chat-send]');
  const pose = name => page.waitForFunction(name => qaShowcase.getState()?.current.kind === name, name);

  await mic.click();
  await page.evaluate(() => qaRecognition.onend());
  assert.equal(await mic.getAttribute('aria-pressed'), 'false');
  assert.doesNotMatch(await status.innerText(), /Je vous écoute/, 'finished microphone must not keep listening status');
  for (const [error, message] of [['not-allowed', /refusé/], ['no-speech', /Aucune parole/], ['network', /connexion/]]) {
    await mic.click();
    await page.evaluate(error => qaRecognition.onerror({ error }), error);
    assert.match(await status.innerText(), message);
    assert.equal(await mic.getAttribute('aria-pressed'), 'false');
  }

  // A typed question interrupts the microphone; repeating it still gets read aloud.
  await mic.click();
  await page.evaluate(() => { window.qaLateResult = qaRecognition.onresult; });
  await field.fill('merci');
  await send.click();
  assert.equal(await mic.getAttribute('aria-pressed'), 'false');
  await pose('speak');
  assert.match(await voice.innerText(), /Couper/);
  await page.evaluate(() => qaLateResult({ results: [[{ transcript: 'bonjour' }]] }));
  assert.equal(await page.evaluate(() => SafeAssistant.getCurrentMessage()), 'Avec plaisir !', 'late microphone result ignored');
  await field.fill('merci');
  await field.press('Enter');
  assert.deepEqual(await page.evaluate(() => qaAudio.spoken), ['Avec plaisir !', 'Avec plaisir !']);

  // Stop and replay only the current response; microphone takes over immediately.
  await voice.click();
  await pose('idle');
  assert.match(await voice.innerText(), /Écouter/);
  await voice.click();
  await pose('speak');
  await page.evaluate(() => { window.qaLateEnd = qaUtterance.onend; });
  await mic.click();
  await pose('listen');
  await page.evaluate(() => qaLateEnd());
  await pose('listen');
  await mic.click();
  await pose('idle');

  // The same V12 renderer explains in the banner and rests when speech finishes.
  await field.fill('qui es tu');
  await send.click();
  await pose('explain');
  await page.evaluate(() => qaUtterance.onend());
  await pose('idle');

  // Floating character stops speaking and adopts listening without its old hold timer.
  await page.locator('#jaspeHeroLauncher').click();
  await page.locator('[data-jaspe-mode="audio"]').click();
  await page.locator('#jaspePanelInput').fill('bonjour');
  await page.locator('#jaspePanelSend').click();
  await page.waitForFunction(() => qaShowcase.getState()?.current.kind === 'explain').catch(async error => {
    console.error(await page.evaluate(() => ({ current: qaShowcase.getState(), response: SafeAssistant.getCurrentMessage(), spoken: qaAudio.spoken, status: document.getElementById('jaspePanelStatus').textContent })));
    throw error;
  });
  await page.waitForTimeout(4800);
  assert.equal(await page.evaluate(() => qaShowcase.getState().current.kind), 'explain', 'speaking continues beyond the former fixed gesture duration');
  assert.equal(await page.evaluate(() => qaShowcase.getState().engine), 'v12', 'speech keeps the original character renderer');
  await capture(page, 'jaspe-voice-' + width);
  await page.locator('#jaspePanelMic').click();
  assert.equal(await page.evaluate(() => qaShowcase.getState().current.kind), 'listen');
  await page.locator('#jaspePanelMic').click();
  assert.equal(await page.evaluate(() => qaShowcase.getState().current.kind), 'idle');
  await page.locator('#jaspePanelVoice').click();
  await page.evaluate(() => qaUtterance.onend());
  assert.equal(await page.evaluate(() => qaShowcase.getState().current.kind), 'idle');

  // Reduced viewport height models the space left above a mobile keyboard.
  if (width === 390) {
    await page.setViewportSize({ width: 390, height: 360 });
    for (const id of ['jaspePanelClose', 'jaspePanelInput', 'jaspePanelSend', 'jaspePanelMic', 'jaspePanelVoice']) {
      assert.equal(await page.locator('#' + id).evaluate(el => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.y >= 0 && r.bottom <= innerHeight && el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
      }), true, id + ' remains reachable above the keyboard');
    }
    await capture(page, 'jaspe-voice-keyboard');
    await page.setViewportSize({ width, height: 844 });
  }
  await page.locator('#jaspePanelClose').click();
  await page.waitForFunction(() => document.querySelector('#jaspeHeroLauncher #jaspeDashboardCharacter'));

  // An allowed-to-allowed account change also invalidates old audio callbacks.
  await mic.click();
  await page.evaluate(() => {
    window.qaLateResult = qaRecognition.onresult;
    window.qaSessionDescriptor = Object.getOwnPropertyDescriptor(window, 'currentSession');
    Object.defineProperty(window, 'currentSession', { configurable: true, value: {
      token: 'qa-fictional', userId: 'qa-other', profileId: 'qa-other', schoolId: 'qa-other',
      role: 'admin', permissions: ['safe.assistant.use'], scopes: []
    } });
    SafeAssistant.refreshAccess();
    qaLateResult({ results: [[{ transcript: 'merci' }]] });
  });
  assert.equal(await mic.getAttribute('aria-pressed'), 'false');
  assert.equal(await page.evaluate(() => SafeAssistant.getCurrentMessage()), '');
  assert.deepEqual(await page.evaluate(() => SafeAssistant.getHistory()), []);
  await page.evaluate(() => Object.defineProperty(window, 'currentSession', qaSessionDescriptor));
  await page.evaluate(() => SafeAssistant.refreshAccess());

  // Real synthesis failures and missing recognition keep the written path usable.
  await field.fill('bonjour'); await send.click();
  await voice.click();
  await page.evaluate(() => qaUtterance.onerror({ error: 'synthesis-unavailable' }));
  assert.match(await status.innerText(), /voix.*indisponible/i);
  await pose('idle');
  await page.evaluate(() => { window.SpeechRecognition = window.webkitSpeechRecognition = undefined; });
  await mic.click();
  assert.match(await status.innerText(), /écoute.*pas disponible/i);
  assert.equal(await field.isEnabled(), true);
  assert.equal(await page.evaluate(() => Object.keys(localStorage).some(k => /history|conversation/i.test(k))), false);
  console.log(`PASS voice ${width}px: stop/replay, mic lifecycle, repeat, stale callbacks, context, fallback, keyboard controls.`);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await checkVoice(page, width);
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
