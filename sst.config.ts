/// <reference path="./.sst/platform/config.d.ts" />

// @spec HOST-005, HOST-006, HOST-007
export default $config({
  app(input) {
    return {
      name: "slingshot",
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",
      providers: { aws: { region: "us-east-1" } },
    };
  },
  async run() {
    // @spec HOST-001
    const site = new sst.aws.StaticSite("Slingshot", {
      path: "site",
      assets: {
        fileOptions: [{ files: "**", cacheControl: "no-cache" }],
      },
      domain:
        $app.stage === "production"
          ? { name: "slingshot.andreizimin.com" }
          : undefined,
    });

    return { url: site.url };
  },
});
