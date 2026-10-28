import type { GameData } from '../data';
import type { TowerAbility } from '../sim/abilities';
import { isBasicGem, qualityOf } from '../sim/game';

// Display names and short labels from the original localization, shared by the HUD panels.

const tokensOf = (data: GameData) =>
  (data.files['localization/english.json'] as { lang: { Tokens: Record<string, string> } }).lang
    .Tokens;

/** English display name, e.g. "chipped sapphire/B1" -> "Chipped sapphire". */
export function displayName(data: GameData, unit: string) {
  const text = (tokensOf(data)[unit] ?? unit.replace(/^gemtd_/, '').replaceAll('_', ' ')).split(
    '/',
  )[0];
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Type and quality stamp: "B3" for a normal sapphire, "★" for combined towers. */
export const code = (name: string) =>
  isBasicGem(name) ? `${name[6].toUpperCase()}${qualityOf(name)}` : '★';
/** Basic gem letter (d, b, y, r, g, e, q, p), or undefined for combined towers. */
export const gemType = (name: string) => (isBasicGem(name) ? name[6] : undefined);
export const isTablet = (name: string) => name.includes('shiban');

export const QUALITY = ['', 'Chipped', 'Flawed', 'Normal', 'Flawless', 'Perfect', 'Huge'];

/** One short phrase for what a tower does, from its abilities (inspector subtitle). */
export function roleOf(abilities: readonly TowerAbility[]) {
  const has = (kind: TowerAbility['kind']) => abilities.some((a) => a.kind === kind);
  if (abilities.some((a) => a.kind === 'script' && /Shock|jn_D3_00/.test(a.fn)))
    return 'Chain lightning';
  if (has('poison')) return 'Poisons enemies';
  if (has('slow')) return 'Slows enemies';
  if (has('splash')) return 'Splash damage';
  if (has('split')) return 'Hits several targets';
  if (has('armor')) return 'Shreds armour';
  if (has('critical')) return 'Critical hits';
  if (has('aura') || abilities.some((a) => a.kind === 'field' && a.ally))
    return 'Empowers nearby towers';
  if (abilities.some((a) => a.kind === 'field')) return 'Weakens enemies nearby';
  if (has('speed')) return 'Rapid attacks';
  if (has('damage')) return 'Heavy damage';
  return 'Single target';
}

/** Compact number: 950, 1.2k, 34k, 1.5M. */
export function compact(n: number) {
  const a = Math.abs(n);
  if (a >= 1e6) return `${(n / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k`;
  return `${Math.round(n)}`;
}
