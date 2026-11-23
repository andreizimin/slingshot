// Which stage is this page served from? The same files are deployed everywhere, so the page
// works it out from its hostname at runtime. Pure: no DOM.

export const PRODUCTION_HOST = 'slingshot.andreizimin.com';
export const DEV_HOST = 'slingshot-dev.andreizimin.com';

const PRIVATE_ADDRESS = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

// 'production' | 'dev' | 'local' | 'preview'
// @spec HOST-012
export function stageForHost(hostname) {
  const h = String(hostname ?? '').toLowerCase();
  if (h === PRODUCTION_HOST) return 'production';
  if (h === DEV_HOST) return 'dev';
  if (h === '' || h === 'localhost' || h.endsWith('.local') || PRIVATE_ADDRESS.test(h)) return 'local';
  return 'preview';
}

// What the page shows for its stage: a DEV badge and a noindex tag everywhere but production.
// @spec HOST-012
export function stageMarks(hostname) {
  const stage = stageForHost(hostname);
  const live = stage === 'production';
  return { stage, badge: live ? null : 'DEV', noindex: !live };
}
