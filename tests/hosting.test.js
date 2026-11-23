import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { domainFor, DOMAIN, DEV_DOMAIN } from '../deploy/hosting.mjs';
import { checkSite } from '../scripts/live-check.mjs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const sst = read('sst.config.ts');
const ci = read('.github/workflows/ci.yml');
const pkg = JSON.parse(read('package.json'));

// @spec HOST-001, HOST-005, HOST-007
test('one static site named Slingshot serves site/ as it is, no-cache, and waits for the CDN', () => {
  assert.match(sst, /new sst\.aws\.StaticSite\(\s*"Slingshot"/);
  assert.match(sst, /path:\s*"site"/);
  assert.doesNotMatch(sst, /\bbuild\s*:/, 'no build command');
  assert.match(sst, /region:\s*"us-east-1"/);
  assert.match(sst, /files:\s*"\*\*",\s*cacheControl:\s*"no-cache"/);
  assert.match(sst, /invalidation:\s*\{[^}]*wait:\s*true/);
});

// @spec HOST-006
test('production and dev get their own domains; any other stage gets none', () => {
  assert.equal(DOMAIN, 'slingshot.andreizimin.com');
  assert.equal(DEV_DOMAIN, 'slingshot-dev.andreizimin.com');
  assert.equal(domainFor('production'), DOMAIN);
  assert.equal(domainFor('dev'), DEV_DOMAIN);
  assert.equal(domainFor('someone'), undefined);
  assert.equal(domainFor(undefined), undefined);
  assert.match(sst, /domainFor\(\$app\.stage\)/);
  assert.match(sst, /removal:\s*input\?\.stage === "production" \? "retain" : "remove"/);
});

// @spec HOST-002, HOST-003, HOST-004, HOST-008
test('npm scripts: local preview, tests, and fallback deploys gated by tests', () => {
  assert.equal(pkg.scripts.dev, 'npx -y serve@14 site -l 5173');
  assert.equal(pkg.scripts.test, 'node --test tests/*.test.js');
  assert.equal(pkg.scripts['deploy:dev'], 'npm test && sst deploy --stage dev');
  assert.equal(pkg.scripts['deploy:prod'], 'npm test && sst deploy --stage production');
  assert.equal(pkg.scripts.deploy, undefined, 'no unnamed-stage deploy');
  assert.equal(pkg.scripts.coherence, 'node bin/coherence-check.mjs');
  assert.equal(pkg.scripts['test:live'], 'node scripts/live-check.mjs');
  assert.match(pkg.devDependencies.sst, /^\^3\.17/);
});

// @spec HOST-011
test('pipeline tests every push and fork pull requests, on Node 22, with no credentials for the test job', () => {
  assert.match(ci, /on:\s*\n\s*push:\s*\n\s*branches:\s*\['\*\*'\]\s*\n\s*pull_request:/);
  assert.match(ci, /^permissions:\s*\n\s*contents: read\s*$/m, 'read-only by default');
  const testJob = ci.slice(ci.indexOf('  test:'), ci.indexOf('  deploy:'));
  assert.match(testJob, /github\.event_name == 'push' \|\| github\.event\.pull_request\.head\.repo\.full_name != github\.repository/);
  assert.match(testJob, /node-version: 22/);
  assert.match(testJob, /- run: npm test/);
  assert.match(testJob, /- run: npm run coherence/);
  assert.doesNotMatch(testJob, /id-token|secrets\.|sst deploy/);
});

// @spec HOST-013, HOST-014
test('pipeline deploys branches to dev and main to production, then checks the live site', () => {
  const deploy = ci.slice(ci.indexOf('  deploy:'));
  assert.match(deploy, /needs: test/);
  assert.match(deploy, /if: github\.event_name == 'push'/, 'never on pull requests');
  assert.match(deploy, /STAGE: \$\{\{ github\.ref == 'refs\/heads\/main' && 'production' \|\| 'dev' \}\}/);
  assert.match(deploy, /LIVE_URL: \$\{\{ github\.ref == 'refs\/heads\/main' && 'https:\/\/slingshot\.andreizimin\.com' \|\| 'https:\/\/slingshot-dev\.andreizimin\.com' \}\}/);
  assert.match(deploy, /name: \$\{\{ github\.ref == 'refs\/heads\/main' && 'production' \|\| 'dev' \}\}/, 'GitHub environment per stage');
  const order = ['npm ci', 'configure-aws-credentials', 'npx sst deploy --stage "$STAGE"', 'npm run test:live'].map((s) => deploy.indexOf(s));
  assert.ok(order.every((i) => i > 0), 'all deploy steps present');
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'credentials, deploy, then live check');
});

// @spec HOST-016
test('one deploy per stage at a time; a later push waits and does not cancel', () => {
  const deploy = ci.slice(ci.indexOf('  deploy:'));
  assert.match(deploy, /concurrency:\s*\n\s*group: deploy-\$\{\{ github\.ref == 'refs\/heads\/main' && 'production' \|\| 'dev' \}\}\s*\n\s*cancel-in-progress: false/);
});

// @spec HOST-017
test('deploy credentials come only from OIDC, with the role in a secret and the account masked', () => {
  const deploy = ci.slice(ci.indexOf('  deploy:'));
  assert.match(deploy, /permissions:\s*\n\s*id-token: write\s*\n\s*contents: read/);
  assert.match(deploy, /role-to-assume: \$\{\{ secrets\.AWS_ROLE_ARN \}\}/);
  assert.match(deploy, /mask-aws-account-id: true/);
  assert.doesNotMatch(ci, /AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|vars\.AWS_ROLE_ARN/);
  assert.doesNotMatch(ci, /\b\d{12}\b/, 'no account id in the workflow');
});

// ---------- the live-site check, against a pretend site ----------

const enc = (s) => new TextEncoder().encode(s);
const PAGE = '<html><script defer src="https://cloud.umami.is/script.js"></script><script src="https://feedback.andreizimin.com/widget.js" data-project="slingshot"></script></html>';
const FILES = [
  { path: 'index.html', bytes: enc(PAGE) },
  { path: 'cockpit/main.js', bytes: enc('export const a = 1;\n') },
  { path: 'style.css', bytes: enc('body{}') },
];
const TYPES = { html: 'text/html; charset=utf-8', js: 'application/javascript', css: 'text/css' };

// A pretend CDN: serves `files`, with per-path overrides of status, headers or body.
function fakeSite(files, overrides = {}) {
  return async (url) => {
    let path = new URL(url).pathname.replace(/^\//, '') || 'index.html';
    const file = files.find((f) => f.path === path);
    const o = overrides[path] ?? {};
    if (!file) return new Response('nope', { status: 404 });
    return new Response(o.body ?? file.bytes, {
      status: o.status ?? 200,
      headers: {
        'cache-control': o.cacheControl ?? 'no-cache',
        'content-type': o.contentType ?? TYPES[path.split('.').pop()],
      },
    });
  };
}
const run = (overrides, files = FILES) => checkSite({ baseUrl: 'https://example.test', files: FILES, fetchImpl: fakeSite(files, overrides) });

// @spec HOST-015
test('live check passes when every file is served, no-cache, byte-identical and tagged', async () => {
  assert.deepEqual(await run({}), []);
});

// @spec HOST-015
test('live check reports a missing file, a wrong status, stale bytes, caching, a wrong script type and missing tags', async () => {
  const one = async (overrides, files) => (await run(overrides, files)).join('\n');
  assert.match(await one({}, FILES.slice(0, 2)), /style\.css: status 404/);
  assert.match(await one({ 'style.css': { status: 500 } }), /style\.css: status 500/);
  assert.match(await one({ 'cockpit/main.js': { body: enc('export const a = 2;\n') } }), /cockpit\/main\.js: content differs from the commit/);
  assert.match(await one({ 'style.css': { cacheControl: 'max-age=3600' } }), /style\.css: Cache-Control is "max-age=3600"/);
  assert.match(await one({ 'cockpit/main.js': { contentType: 'text/plain' } }), /cockpit\/main\.js: content type "text\/plain" is not JavaScript/);
  const untagged = enc('<html></html>');
  const files = [{ path: 'index.html', bytes: untagged }, ...FILES.slice(1)];
  const problems = await checkSite({ baseUrl: 'https://example.test', files, fetchImpl: fakeSite(files) });
  assert.ok(problems.some((p) => /Umami tag/.test(p)));
  assert.ok(problems.some((p) => /feedback widget tag/.test(p)));
});
