// The platforms a page can be on (server/src/utils/pages.js). `tone` colours the
// small badge that marks them across the tool.
export const PLATFORMS = [
  { id: 'onlyfans', name: 'OnlyFans', short: 'OF', tone: 'bg-sky-500' },
  { id: 'fanvue', name: 'Fanvue', short: 'FV', tone: 'bg-emerald-600' },
  { id: 'fansly', name: 'Fansly', short: 'FS', tone: 'bg-indigo-500' },
];

export const platformInfo = (id) => PLATFORMS.find(p => p.id === id) || PLATFORMS[0];
// Pages from before platforms existed are OnlyFans.
export const pagePlatform = (page) => page?.platform || 'onlyfans';
export const pagesText = (n) => (n ? `${n} page${n === 1 ? '' : 's'}` : 'no pages yet');
