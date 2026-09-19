import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BaseController, actions } from './modules/jaspe2d/v12/base-controller.js';

const advance = (controller, milliseconds) => {
  for (let elapsed = 0; elapsed < milliseconds; elapsed += 25) controller.advance(25);
};
test('une parole prolongée garde ses gestes existants puis cède à l’écoute', () => {
  const controller = new BaseController();
  controller.request('guide', { continuous: true });
  advance(controller, actions.guide.duration * 3 + 300);
  assert.equal(controller.sample().action, 'guide');
  controller.request('attentive');
  advance(controller, 1800);
  assert.equal(controller.sample().action, 'attentive');
});
test('le geste ordinaire de connexion conserve sa durée finie', () => {
  const controller = new BaseController();
  controller.request('guide');
  advance(controller, actions.guide.duration + 50);
  assert.equal(controller.sample().action, 'idle');
});
