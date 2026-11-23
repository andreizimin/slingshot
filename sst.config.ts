/// <reference path="./.sst/platform/config.d.ts" />

// @spec HOST-005, HOST-006, HOST-007
export default $config({
  app(input) {
    return {
      name: "slingshot",
      // Keep production's resources on accidental removal; tear down other stages.
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",
      providers: { aws: { region: "us-east-1" } },
    };
  },
  async run() {
    const { domainFor } = await import("./deploy/hosting.mjs");

    // `production` and `dev` get their own domains; any other stage deploys to a
    // throwaway CloudFront URL. SST provisions the certificate and the Route 53
    // record in the existing andreizimin.com zone.
    const domain = domainFor($app.stage);

    // @spec HOST-001
    const site = new sst.aws.StaticSite("Slingshot", {
      path: "site",
      assets: {
        fileOptions: [{ files: "**", cacheControl: "no-cache" }],
      },
      // The deploy ends only once the CDN serves the new files, so the live-site
      // check that follows sees what players will get.
      invalidation: { paths: "all", wait: true },
      domain: domain ? { name: domain } : undefined,
    });

    return { url: site.url };
  },
});
