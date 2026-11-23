// The live-site check: is the deployed site serving exactly this commit?
//
//   LIVE_URL=https://slingshot-dev.andreizimin.com node scripts/live-check.mjs
//
// Compares every file under site/ with what the address serves, and retries for a while so a
// deploy that is still propagating is not reported as a failure.
// @spec HOST-015

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const sameBytes = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

// One pass over the site. Returns a list of problems; empty means the site matches.
// files: [{ path: 'cockpit/main.js', bytes: Uint8Array }]
export async function checkSite({ baseUrl, files, fetchImpl = fetch }) {
  const problems = [];
  const base = baseUrl.replace(/\/+$/, '');

  const get = async (path) => {
    try {
      const res = await fetchImpl(`${base}/${path}`, { cache: 'no-store', redirect: 'follow' });
      const bytes = new Uint8Array(await res.arrayBuffer());
      return { res, bytes };
    } catch (err) {
      problems.push(`${path || '/'}: could not be fetched (${err?.cause?.code ?? err?.message ?? err})`);
      return null;
    }
  };

  for (const file of files) {
    const got = await get(file.path);
    if (!got) continue;
    const { res, bytes } = got;
    if (res.status !== 200) {
      problems.push(`${file.path}: status ${res.status}`);
      continue;
    }
    const cacheControl = res.headers.get('cache-control') ?? '';
    if (!/\bno-cache\b/.test(cacheControl)) problems.push(`${file.path}: Cache-Control is "${cacheControl}", not no-cache`);
    if (!sameBytes(bytes, file.bytes)) problems.push(`${file.path}: content differs from the commit`);
    const type = res.headers.get('content-type') ?? '';
    if (file.path.endsWith('.js') && !/javascript/i.test(type)) {
      problems.push(`${file.path}: content type "${type}" is not JavaScript`);
    }
  }

  // The page itself, as a visitor asks for it.
  const page = await get('');
  if (page) {
    if (page.res.status !== 200) problems.push(`/: status ${page.res.status}`);
    const html = new TextDecoder().decode(page.bytes);
    if (!html.includes('https://cloud.umami.is/script.js')) problems.push('/: the Umami tag is missing');
    if (!html.includes('https://feedback.andreizimin.com/widget.js')) problems.push('/: the feedback widget tag is missing');
  }
  return problems;
}

// Every file under a folder, as { path (forward slashes, relative), bytes }.
export function readSite(dir) {
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d).sort()) {
      if (name === '.DS_Store') continue;
      const full = join(d, name);
      if (statSync(full).isDirectory()) walk(full);
      else out.push({ path: relative(dir, full).split(sep).join('/'), bytes: new Uint8Array(readFileSync(full)) });
    }
  };
  walk(dir);
  return out;
}

async function main() {
  const baseUrl = process.env.LIVE_URL;
  if (!baseUrl) {
    console.error('Set LIVE_URL to the deployed address, e.g. LIVE_URL=https://slingshot-dev.andreizimin.com');
    process.exit(2);
  }
  const files = readSite(fileURLToPath(new URL('../site', import.meta.url)));
  const deadline = Date.now() + 3 * 60 * 1000;
  let problems = [];
  for (let attempt = 1; ; attempt++) {
    problems = await checkSite({ baseUrl, files });
    if (problems.length === 0) {
      console.log(`Live check passed: ${baseUrl} serves all ${files.length} files of this commit, no-cache, with both tags.`);
      return;
    }
    if (Date.now() >= deadline) break;
    console.log(`Attempt ${attempt}: ${problems.length} problem(s); retrying in 10 s…`);
    await new Promise((r) => setTimeout(r, 10_000));
  }
  console.error(`Live check FAILED for ${baseUrl}:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
