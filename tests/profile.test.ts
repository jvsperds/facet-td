import { describe, expect, it } from 'vitest';
import { loadData } from '../src/data';
import { ECONOMY } from '../src/profile/economy';
import {
  buySkillSlot,
  claimRunReward,
  defaultProfile,
  normalizeProfile,
  openBox,
  profileRunConfig,
} from '../src/profile/profile';

const data = loadData('classic');

describe('offline hero profile', () => {
  it('starts with one valid hero, skill and slot and builds a RunConfig', () => {
    const profile = defaultProfile(data);
    expect(profile.heroes).toHaveLength(1);
    expect(Object.keys(profile.skills)).toHaveLength(1);
    expect(profile.slots).toBe(1);
    expect(profileRunConfig(data, profile)).toEqual({
      difficulty: 1,
      endless: true,
      hero: profile.selectedHero,
      skills: { [profile.selectedSkills[0]]: 1 },
    });
  });

  it('repairs malformed and unowned selections', () => {
    const profile = normalizeProfile(data, {
      shells: -20,
      heroes: ['bad'],
      skills: { bad: 9 },
      slots: 99,
      selectedHero: 'bad',
      selectedSkills: ['bad'],
    });
    expect(profile.shells).toBe(0);
    expect(profile.heroes).toHaveLength(1);
    expect(Object.keys(profile.skills)).toHaveLength(1);
    expect(profile.selectedSkills).toHaveLength(0);
  });

  it('uses the centralized shell prices for duplicate boxes and slots', () => {
    const profile = defaultProfile(data);
    profile.shells = 500;
    const hero = openBox(data, profile, 'hero', 1, 0);
    expect(hero.duplicate).toBe(true);
    expect(profile.shells).toBe(500 - ECONOMY.boxes.hero.cost + ECONOMY.boxes.hero.duplicateRefund);

    const skill = openBox(data, profile, 'skill', 1, 0);
    expect(skill.duplicate).toBe(true);
    expect(skill.level).toBe(2);
    expect(profile.skills[skill.id]).toBe(2);

    const before = profile.shells;
    expect(buySkillSlot(profile)).toBe(ECONOMY.slotCosts[0]);
    expect(profile.slots).toBe(2);
    expect(profile.shells).toBe(before - ECONOMY.slotCosts[0]);
  });

  it('pays a completed run once at the configured difficulty multiplier', () => {
    const profile = defaultProfile(data);
    expect(claimRunReward(profile, 'run-1', 50, 2)).toBe(22);
    expect(profile.shells).toBe(22);
    expect(claimRunReward(profile, 'run-1', 50, 2)).toBe(0);
    expect(profile.shells).toBe(22);
  });
});
