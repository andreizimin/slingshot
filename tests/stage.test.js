import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stageForHost, stageMarks, PRODUCTION_HOST, DEV_HOST } from '../site/cockpit/stage.js';
import { DOMAIN, DEV_DOMAIN } from '../deploy/hosting.mjs';

const html = readFileSync(new URL('../site/index.html', import.meta.url), 'utf8');

// @spec HOST-012
test('the page works out its stage from the hostname', () => {
  assert.equal(stageForHost('slingshot.andreizimin.com'), 'production');
  assert.equal(stageForHost('SLINGSHOT.andreizimin.com'), 'production', 'hostnames are case-insensitive');
  assert.equal(stageForHost('slingshot-dev.andreizimin.com'), 'dev');
  for (const h of ['localhost', '127.0.0.1', '192.168.0.12', '10.0.0.5', 'my-mac.local', '']) {
    assert.equal(stageForHost(h), 'local', h);
  }
  assert.equal(stageForHost('d1234abcd.cloudfront.net'), 'preview');
  assert.equal(stageForHost('slingshot.andreizimin.com.evil.example'), 'preview', 'only an exact match is production');
});

// @spec HOST-012
test('every stage except production shows the DEV badge and asks not to be indexed', () => {
  assert.deepEqual(stageMarks('slingshot.andreizimin.com'), { stage: 'production', badge: null, noindex: false });
  assert.deepEqual(stageMarks('slingshot-dev.andreizimin.com'), { stage: 'dev', badge: 'DEV', noindex: true });
  assert.deepEqual(stageMarks('localhost'), { stage: 'local', badge: 'DEV', noindex: true });
  assert.deepEqual(stageMarks('abc.cloudfront.net'), { stage: 'preview', badge: 'DEV', noindex: true });
});

// @spec HOST-012
test('the page and the hosting config agree on the two hostnames, and the badge starts hidden', () => {
  assert.equal(PRODUCTION_HOST, DOMAIN);
  assert.equal(DEV_HOST, DEV_DOMAIN);
  assert.match(html, /id="stage-badge"[^>]*hidden/);
  assert.doesNotMatch(html, /name="robots"/, 'noindex is added at runtime, never baked into the page');
});
