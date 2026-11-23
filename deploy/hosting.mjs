// Hosting rules used by sst.config.ts. Kept free of SST imports so they can be unit-tested.

export const DOMAIN = 'slingshot.andreizimin.com';
export const DEV_DOMAIN = 'slingshot-dev.andreizimin.com';

// Which custom domain a stage gets; any stage but production and dev gets none
// (a throwaway CloudFront URL).
// @spec HOST-006
export function domainFor(stage) {
  if (stage === 'production') return DOMAIN;
  if (stage === 'dev') return DEV_DOMAIN;
  return undefined;
}
