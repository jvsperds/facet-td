// Features kept out of the HUD for now: the offline hero (loadout, skills on E D F R) and tower
// aim modes. They still work in the sim; `?wip` in the URL shows them for development and tests.

export const WIP =
  typeof location !== 'undefined' && new URLSearchParams(location.search).has('wip');
