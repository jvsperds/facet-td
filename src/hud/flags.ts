// `?wip` keeps the development-only free hero loadout editor. Normal runs use the owned profile.

export const WIP =
  typeof location !== 'undefined' && new URLSearchParams(location.search).has('wip');
