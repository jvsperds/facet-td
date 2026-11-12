import { expect, test } from 'vitest';
import { loadData } from '../src/data';
import { DEFAULT_CONFIG } from '../src/sim/config';
import { completedQuests, QUESTS, questMet, questTitle, SKIPPED_QUESTS } from '../src/sim/quests';
import { emptyStats, type RunStats } from '../src/sim/stats';
import { TICK_HZ } from '../src/sim/game';

const data = loadData('classic');
const minutes = (m: number) => m * 60 * TICK_HZ;
const passed = (over: Partial<RunStats> = {}): RunStats => ({
  ...emptyStats(10),
  wavesCleared: 50,
  ticks: minutes(70),
  ...over,
});

test('a plain cleared run completes the "without" quests and nothing else', () => {
  expect(completedQuests(passed(), DEFAULT_CONFIG)).toEqual([
    'q101',
    'q102',
    'q103',
    'q106',
    'q201',
    'q202',
    'q203',
    'q204',
    'q205',
    'q206',
    'q207',
    'q208',
    'q211',
  ]);
});

test('quests count only after wave 50, and never in sandbox runs', () => {
  expect(completedQuests(passed({ wavesCleared: 49 }), DEFAULT_CONFIG)).toEqual([]);
  expect(completedQuests(passed(), { ...DEFAULT_CONFIG, sandbox: true })).toEqual([]);
});

test('each quest condition', () => {
  const met = (id: string, over: Partial<RunStats>) => questMet(id, passed(over));
  expect(met('q101', { combined: { gemtd_baiyin: 1 } })).toBe(false);
  expect(met('q102', { combined: { gemtd_kongqueshi: 1 } })).toBe(false);
  expect(met('q103', { combined: { gemtd_xingcaihongbaoshi: 1 } })).toBe(false);
  expect(met('q201', { combined: { gemtd_yu: 1 } })).toBe(false);
  expect(met('q105', { ticks: minutes(65) })).toBe(true);
  expect(met('q105', { ticks: minutes(65) + 1 })).toBe(false);
  expect(met('q209', { ticks: minutes(55) })).toBe(true);
  expect(met('q302', { ticks: minutes(45) + 1 })).toBe(false);
  expect(met('q106', { draftCombined: { gemtd_haibao: 1 } })).toBe(true);
  expect(met('q106', { draftCombined: { gemtd_baiyinqishi: 1 } })).toBe(false);
  expect(met('q109', { maxWaveEnemyCount: 19 })).toBe(false);
  expect(met('q109', { maxWaveEnemyCount: 20 })).toBe(true);
  expect(met('q110', { tabletUpgrades: 1 })).toBe(true);
  expect(met('q202', { kept: { gemtd_d111: 1 } })).toBe(false);
  expect(met('q202', { kept: { gemtd_b111: 1 } })).toBe(true);
  expect(met('q207', { kept: { gemtd_q1: 1 } })).toBe(false);
  expect(met('q208', { kept: { gemtd_g111111: 1 } })).toBe(false);
  expect(met('q210', { combined: { gemtd_sililankazhixing: 1 } })).toBe(true);
  expect(met('q211', { heroCasts: { gemtd_hero_kuaisusheji: 3 } })).toBe(true);
  expect(met('q211', { heroCasts: { gemtd_hero_lanse: 1 } })).toBe(false);
  expect(met('q304', { mvpMaxTowers: 5 })).toBe(true);
  expect(met('q104', { killsByUnit: { gemtd_zard_boss_fly: 1 } })).toBe(true);
  expect(met('q303', { killsByUnit: { gemtd_roushan_boss_fly_jin: 1 } })).toBe(true);
  expect(met('q107', { castleHpEnd: 100 })).toBe(true);
  expect(met('q108', { draftCombined: { gemtd_manao: 1 } })).toBe(true);
});

test('retired quests are left out unless asked for', () => {
  const s = passed({ castleHpEnd: 100 });
  expect(completedQuests(s, DEFAULT_CONFIG)).not.toContain('q107');
  expect(completedQuests(s, DEFAULT_CONFIG, { includeRetired: true })).toContain('q107');
});

test('every quest has an English title; co-op and challenge quests are skipped', () => {
  for (const q of QUESTS) expect(questTitle(data, q.id)).toMatch(/^Complete all levels/);
  expect(questTitle(data, 'q109')).toBe('Complete all levels with a wave at least 20 enemies.');
  expect(QUESTS.map((q) => q.id)).not.toContain('q111');
  expect(SKIPPED_QUESTS).toEqual(['q111', 'q398', 'q399']);
});
