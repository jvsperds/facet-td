import type { GameData } from '../data';
import type { RunConfig } from './config';
import { TICK_HZ } from './game';
import type { RunStats } from './stats';

// Single-player quests of the original (quest_status, line 839; SetQuest and quest_status writes
// across the script). The original server assigned one quest per player per week; offline every
// quest is evaluated. Like send_ranking (line 4581), a quest only counts once the run has passed
// wave 50. Skipped: q111_* (co-op hero-in-team), q398 and q399 (Night and Bush challenge tickets).

export interface Quest {
  id: string;
  /** Marked "--deleted" in the original's quest table; still evaluated, but not offered there. */
  retired?: boolean;
}

export const QUESTS: readonly Quest[] = [
  { id: 'q101' },
  { id: 'q102' },
  { id: 'q103' },
  { id: 'q104', retired: true },
  { id: 'q105' },
  { id: 'q106' },
  { id: 'q107', retired: true },
  { id: 'q108', retired: true },
  { id: 'q109' },
  { id: 'q110' },
  { id: 'q201' },
  { id: 'q202' },
  { id: 'q203' },
  { id: 'q204' },
  { id: 'q205' },
  { id: 'q206' },
  { id: 'q207' },
  { id: 'q208' },
  { id: 'q209' },
  { id: 'q210' },
  { id: 'q211' },
  { id: 'q301', retired: true },
  { id: 'q302' },
  { id: 'q303', retired: true },
  { id: 'q304' },
];
export const SKIPPED_QUESTS = ['q111', 'q398', 'q399'] as const;

/** Towers whose combination fails a quest (gemtd_baiyin etc., lines 10026-10120). */
const NEVER_COMBINE: Record<string, string> = {
  q101: 'gemtd_baiyin',
  q102: 'gemtd_kongqueshi',
  q103: 'gemtd_xingcaihongbaoshi',
  q201: 'gemtd_yu',
  q301: 'gemtd_shenhaizhenzhu',
};
/** Basic gem colours whose keeping fails a quest (stone_quest, line 7864). */
const NEVER_KEEP: Record<string, string> = {
  q202: 'd',
  q203: 'b',
  q204: 'r',
  q205: 'y',
  q206: 'p',
  q207: 'q',
  q208: 'g',
};
/** Run time limits in minutes (send_ranking, line 4528). */
const WITHIN_MINUTES: Record<string, number> = { q105: 65, q209: 55, q302: 45 };
/** Top towers: combining any sets q210 (lines 10156-10200). */
const TOP_TOWERS = [
  'gemtd_keyinuoerguangmingzhishan',
  'gemtd_shuaibiankaipayou',
  'gemtd_heiwangzihuangguanhongbaoshi',
  'gemtd_xingguanglanbaoshi',
  'gemtd_yijiazhishi',
  'gemtd_huguoshenyishi',
  'gemtd_jingangshikulinan',
  'gemtd_sililankazhixing',
];
/** Single-round-only towers: combining any in a draft sets q108 (lines 10450-10530). */
const SINGLE_ROUND_ONLY = [
  'gemtd_yijiazhishi',
  'gemtd_huguoshenyishi',
  'gemtd_jingangshikulinan',
  'gemtd_sililankazhixing',
  'gemtd_geluanshi',
  'gemtd_heiyaoshi',
  'gemtd_manao',
  'gemtd_ranshaozhishi',
  'gemtd_xiameishi',
];
/** Hero skills whose scripts clear q211 (SetQuest('q211', false), lines 8212-9243). */
const Q211_SKILLS = [
  'huichun',
  'shanbi',
  'shouhu',
  'huidaoguoqu',
  'lanse',
  'danbai',
  'baise',
  'hongse',
  'zise',
  'lvse',
  'fense',
  'huangse',
  'putong',
  'wuxia',
  'wanmei',
  'yixinghuanwei',
  'qingyi',
  'shitou',
  'xuanfeng',
  'guangzhudaobiao',
].map((s) => `gemtd_hero_${s}`);

const has = (table: Record<string, number>, key: string) => (table[key] ?? 0) > 0;

/** Whether one quest's condition holds for these stats (ignoring the wave-50 requirement). */
export function questMet(id: string, s: Readonly<RunStats>): boolean {
  if (id in NEVER_COMBINE) return !has(s.combined, NEVER_COMBINE[id]);
  if (id in NEVER_KEEP) {
    const kept = new RegExp(`^gemtd_${NEVER_KEEP[id]}1+$`);
    return !Object.keys(s.kept).some((name) => kept.test(name) && s.kept[name] > 0);
  }
  if (id in WITHIN_MINUTES) return s.ticks / TICK_HZ / 60 <= WITHIN_MINUTES[id];
  switch (id) {
    case 'q104':
      return has(s.killsByUnit, 'gemtd_zard_boss_fly');
    case 'q106':
      // Every single-round combination clears it except Haibao's (gemtd_haibao1, line 10443).
      return !Object.keys(s.draftCombined).some((n) => n !== 'gemtd_haibao' && s.draftCombined[n]);
    case 'q107':
      return (s.castleHpEnd ?? 0) >= 100;
    case 'q108':
      return SINGLE_ROUND_ONLY.some((n) => has(s.draftCombined, n));
    case 'q109':
      return s.maxWaveEnemyCount >= 20;
    case 'q110':
      return s.tabletUpgrades > 0;
    case 'q210':
      return TOP_TOWERS.some((n) => has(s.combined, n));
    case 'q211':
      return !Q211_SKILLS.some((n) => has(s.heroCasts, n));
    case 'q303':
      return has(s.killsByUnit, 'gemtd_roushan_boss_fly_jin');
    case 'q304':
      return s.mvpMaxTowers >= 5;
  }
  return false;
}

/**
 * Quests this run completed. Needs wave 50 cleared (the original lists quests only when
 * `_G.level > 50`); sandbox runs complete none, like the original's cheat flag.
 */
export function completedQuests(
  stats: Readonly<RunStats>,
  config: Readonly<RunConfig>,
  options: { includeRetired?: boolean } = {},
): string[] {
  if (config.sandbox || stats.wavesCleared < 50) return [];
  return QUESTS.filter((q) => (options.includeRetired || !q.retired) && questMet(q.id, stats)).map(
    (q) => q.id,
  );
}

/** English quest titles from the baseline localization. */
export function questTitle(data: GameData, id: string): string {
  const tokens = (
    data.files['localization/english.json'] as { lang: { Tokens: Record<string, string> } }
  ).lang.Tokens;
  return tokens[id] ?? id;
}
