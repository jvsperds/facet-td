import { expect, test } from 'vitest';
import { loadData } from '../src/data';
import { qualityOf, type Game } from '../src/sim/game';
import { SaveError, Sim, SIM_VERSION, type SaveEnvelope } from '../src/sim/sim';

const data = loadData('classic');
const quality = (g: Game, id: number) => qualityOf(g.gems.find((x) => x.id === id)!.name);

/** A run with a hero that builds, casts and keeps, saved at `stopAt`. */
function play(stopAt: (sim: Sim) => boolean) {
  const sim = new Sim(data, 21, { hero: 'h101', skills: { a308: 4, a201: 2 } });
  let cast = false;
  while (!stopAt(sim)) {
    const g = sim.game;
    if (sim.tick > 40 * 60 * 30) throw new Error('run did not reach the save point');
    if (g.phase === 'build' && g.draft.length < 5) {
      // Build beside the creeps' route, so the kept gems earn kill gold.
      const spot = g.route
        .slice(4)
        .flatMap((c) => [
          { x: c.x + 1, y: c.y },
          { x: c.x, y: c.y + 1 },
        ])
        .find((c) => g.canBuild(c).ok);
      sim.send(0, { type: 'build', cell: spot! });
    } else if (g.phase === 'build') {
      const best = [...g.draft].sort((a, b) => quality(g, b) - quality(g, a))[0];
      sim.send(0, { type: 'keep', id: best, upgrade: 0 });
    }
    // Gold only changes through commands and play: setting it directly would not replay.
    if (!cast && g.canHeroAction('gemtd_hero_xuanfeng', undefined, { x: 20, y: 19 }).ok) {
      sim.send(0, { type: 'hero-cast', action: 'gemtd_hero_xuanfeng', point: { x: 20, y: 19 } });
      cast = true;
    }
    sim.step();
    if (g.phase === 'lost' || g.phase === 'won')
      throw new Error(`run ended at level ${g.level}, gold ${g.gold}`);
  }
  return sim;
}

const roundTrip = (sim: Sim) => {
  const save = JSON.parse(JSON.stringify(sim.save())) as SaveEnvelope;
  const back = Sim.restore(data, save);
  expect(back.stateHash()).toBe(sim.stateHash());
  // Both continue identically.
  for (let i = 0; i < 200; i++) {
    sim.step();
    back.step();
  }
  expect(back.stateHash()).toBe(sim.stateHash());
  return save;
};

test('save and restore mid-wave, including hero casts', () => {
  const sim = play(
    (s) =>
      !!s.game.stats.heroCasts.gemtd_hero_xuanfeng &&
      s.game.phase === 'wave' &&
      s.game.creeps.length > 3,
  );
  expect(sim.game.phase).toBe('wave');
  const save = roundTrip(sim);
  expect(sim.game.stats.heroCasts.gemtd_hero_xuanfeng).toBe(1);
  expect(save).toMatchObject({ simVersion: SIM_VERSION, seed: 21, dataVersion: data.version });
});

test('save and restore mid-draft, with a command still queued', () => {
  const sim = play(
    (s) => s.game.level === 2 && s.game.phase === 'build' && s.game.draft.length === 2,
  );
  sim.send(0, { type: 'build', cell: { x: 30, y: 20 } });
  roundTrip(sim);
});

test('mismatched or tampered saves fail with a typed error', () => {
  const sim = play((s) => s.tick >= 60);
  const save = sim.save();
  const code = (s: unknown) => {
    try {
      Sim.restore(data, s as SaveEnvelope);
    } catch (e) {
      expect(e).toBeInstanceOf(SaveError);
      return (e as SaveError).code;
    }
    return 'ok';
  };
  expect(code(save)).toBe('ok');
  expect(code({ ...save, simVersion: SIM_VERSION + 1 })).toBe('sim-version');
  expect(code({ ...save, dataVersion: 'other' })).toBe('data-version');
  expect(code({ ...save, format: 'x' })).toBe('format');
  expect(code({ ...save, config: { ...save.config, difficulty: 9 } })).toBe('config');
  expect(code({ ...save, seed: 22 })).toBe('desync');
  expect(code({ ...save, log: save.log.slice(1) })).toBe('desync');
});
