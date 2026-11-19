// `?wip` enables development sandbox commands. Normal runs use the owned profile.

export const WIP =
  typeof location !== 'undefined' && new URLSearchParams(location.search).has('wip');
