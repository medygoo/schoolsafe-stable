import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INTENT_DEFINITIONS,
  normalizeIntent,
  createPresentationController,
} from './modules/jaspe2d/presentation-controller.js';

const expected = {
  idle: ['idle', 'IDLE', 0.35, 0],
  listen: ['attentive', 'LISTENING', 0.55, 20],
  think: ['deepThink', 'THINKING', 0.65, 30],
  speak: ['guide', 'SPEAKING', 0.60, 40],
  explain: ['guide', 'SPEAKING', 0.75, 40],
  reassure: ['attentive', 'IDLE', 0.45, 70],
  success: ['thumbsUp', 'CONGRATULATE', 0.80, 70],
  refuse: ['worried', 'ERROR', 0.65, 100],
  error: ['worried', 'ERROR', 0.75, 100],
};

test('les neuf intentions gardent leur contrat v12/WebP', () => {
  assert.deepEqual(Object.keys(INTENT_DEFINITIONS), Object.keys(expected));
  for (const [kind, values] of Object.entries(expected)) {
    const definition = INTENT_DEFINITIONS[kind];
    assert.deepEqual(
      [definition.action, definition.fallback, definition.intensity, definition.priority],
      values,
    );
  }
});

test('normalizeIntent rejette les entrées inconnues et borne les nombres', () => {
  assert.equal(normalizeIntent({ kind: 'dance' }), null);
  assert.equal(normalizeIntent(null), null);
  assert.deepEqual(normalizeIntent({ kind: 'think', intensity: 4, holdMs: 20_000, source: 42 }), {
    kind: 'think', action: 'deepThink', fallback: 'THINKING',
    intensity: 1, holdMs: 15_000, priority: 30, source: '42',
  });
});

function harness() {
  const calls = [];
  const timers = [];
  const adapter = name => ({
    play(command) { calls.push([name, 'play', command]); return true; },
    stop() { calls.push([name, 'stop']); return true; },
    destroy() { calls.push([name, 'destroy']); },
    getState() { return { name }; },
  });
  const controller = createPresentationController({
    createPrimary: async () => adapter('primary'),
    createFallback: () => adapter('fallback'),
    setTimer(fn) { timers.push(fn); return timers.length; },
    clearTimer() {},
  });
  return { controller, calls, timers };
}

test('une alerte refuse idle et les intentions moins prioritaires', async () => {
  const { controller, calls } = harness();
  await controller.mount({ host: {}, surface: 'auth', isVisible: () => true });
  assert.equal(controller.dispatch({ kind: 'refuse' }), true);
  assert.equal(controller.dispatch({ kind: 'idle' }), false);
  assert.equal(controller.dispatch({ kind: 'listen' }), false);
  assert.equal(controller.getState().current.kind, 'refuse');
  assert.equal(calls.some(call => call[1] === 'play' && call[2].action === 'worried'), true);
});

test('destroy est idempotent et interdit les commandes suivantes', async () => {
  const { controller, calls } = harness();
  await controller.mount({ host: {}, surface: 'auth', isVisible: () => true });
  controller.destroy();
  controller.destroy();
  assert.equal(controller.dispatch({ kind: 'success' }), false);
  assert.equal(calls.filter(call => call[1] === 'destroy').length, 2);
});

test('un refus du moteur principal conserve le repli WebP', async () => {
  const fallback = { play() { return true; }, stop() { return true; }, destroy() {}, getState() { return {}; } };
  const primary = { play() { return false; }, stop() { return true; }, destroy() {}, getState() { return {}; } };
  const controller = createPresentationController({ createPrimary: async () => primary, createFallback: () => fallback });
  await controller.mount({ host: {}, surface: 'auth', isVisible: () => true });
  assert.equal(controller.getState().engine, 'webp');
});
