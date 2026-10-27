import { expect, test } from 'vitest';
import { loadData } from '../src/data';
import { createFeedback } from '../src/hud/feedback';
import { Sim } from '../src/sim/sim';

test('wave transitions, rewards, temporary castle warnings and terminal feedback have clear priority', () => {
  const game = new Sim(loadData('classic'), 1).game;
  const feedback = createFeedback(game);
  expect(feedback.afterStep()).toBeUndefined();
  game.phase = 'wave';
  expect(feedback.afterStep()).toBe('wave');
  expect(feedback.notice.value.text).toContain('Wave 1 started');
  game.events = [
    { type: 'kill', id: 1, gold: 5 },
    { type: 'kill', id: 2, gold: 5 },
  ];
  expect(feedback.afterStep()).toBe('kill');
  expect(feedback.reward.value).toEqual({ gold: 10, kills: 2 });
  game.castleHp = 94;
  game.events = [
    { type: 'leak', id: 3, damage: 2 },
    { type: 'leak', id: 4, damage: 4 },
  ];
  expect(feedback.afterStep()).toBe('leak');
  expect(feedback.notice.value).toEqual({
    text: 'Castle hit: −6 HP. 94 HP remaining.',
    danger: true,
  });
  game.events = [];
  for (let i = 0; i < 90; i++) feedback.afterStep();
  expect(feedback.notice.value.danger).toBe(false);
  expect(feedback.notice.value.text).toContain('Wave 1 started');
  game.phase = 'build';
  game.level = 2;
  expect(feedback.afterStep()).toBe('clear');
  expect(feedback.notice.value.text).toContain('Wave 1 cleared');
  game.phase = 'wave';
  feedback.afterStep();
  expect(feedback.reward.value).toEqual({ gold: 0, kills: 0 });
  game.phase = 'lost';
  game.events = [{ type: 'leak', id: 5, damage: 100 }];
  expect(feedback.afterStep()).toBe('lost');
  expect(feedback.notice.value.text).toBe('The castle fell.');
  game.phase = 'won';
  expect(feedback.afterStep()).toBe('won');
});

test('a final leak reports both castle damage and wave clearance, and opening-tick kills count', () => {
  const game = new Sim(loadData('classic'), 1).game;
  const feedback = createFeedback(game);
  game.phase = 'wave';
  game.events = [{ type: 'kill', id: 1, gold: 5 }];
  feedback.afterStep();
  expect(feedback.reward.value).toEqual({ gold: 5, kills: 1 });
  game.phase = 'build';
  game.level = 2;
  game.castleHp = 98;
  game.events = [{ type: 'leak', id: 2, damage: 2 }];
  expect(feedback.afterStep()).toBe('clear-leak');
  expect(feedback.notice.value.text).toBe('Wave 1 cleared. Castle hit: −2 HP. 98 HP remaining.');
  game.events = [];
  for (let i = 0; i < 90; i++) feedback.afterStep();
  expect(feedback.notice.value.text).toContain('Place five gems for wave 2');
});
