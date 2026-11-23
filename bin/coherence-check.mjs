#!/usr/bin/env node
// The LID coherence check: is the chain from spec to test to code still whole?
//
//   node bin/coherence-check.mjs        (npm run coherence)
//
// It reads the spec files under docs/intent/ and the spec annotations in the source folders,
// and lists every break in the chain. No dependencies; the logic is a pure function over file
// contents so it can be unit-tested on small fixtures.

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ID = /[A-Z][A-Z0-9]*(?:-[A-Z][A-Z0-9]*)*-\d{3}\b/g;
const SPEC_LINE = /^- \[( |x|D)\] \*\*([A-Z][A-Z0-9]*(?:-[A-Z][A-Z0-9]*)*-\d{3})\*\*:/;
const ANNOTATION = /@spec\b(.*)$/;
const SOURCE_ROOTS = ['site/', 'tests/', 'deploy/', 'scripts/', 'bin/', '.github/'];
const SOURCE_FILES = ['sst.config.ts'];

const isSource = (path) => SOURCE_FILES.includes(path) || SOURCE_ROOTS.some((r) => path.startsWith(r));

function frontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---/.exec(text);
  const out = {};
  if (m) for (const line of m[1].split('\n')) {
    const kv = /^([a-z]+):\s*(.+)$/.exec(line.trim());
    if (kv) out[kv[1]] = kv[2].trim();
  }
  return out;
}

// IDs named under a "Verified by hand" heading, up to the next heading.
function handVerified(text) {
  const ids = new Set();
  let inside = false;
  for (const line of text.split('\n')) {
    if (/^#{1,6}\s/.test(line)) inside = /^#{1,6}\s*Verified by hand\b/i.test(line);
    else if (inside) for (const id of line.match(ID) ?? []) ids.add(id);
  }
  return ids;
}

// files: { 'relative/path': 'text' }. Returns { problems: string[], specs, nodes, annotations }.
export function checkCoherence(files) {
  const problems = [];
  const paths = Object.keys(files).sort();

  // ---- nodes: one folder per node under docs/intent/ ----
  const nodes = new Map(); // dir -> { name, design, specs }
  for (const path of paths) {
    const m = /^(docs\/intent\/(?:[^/]+\/)*([^/]+))\/([^/]+)$/.exec(path);
    if (!m) continue;
    const [, dir, name, file] = m;
    const node = nodes.get(dir) ?? { name, design: null, specs: null };
    if (file === `${name}-design.md`) node.design = path;
    if (file === `${name}-specs.md`) node.specs = path;
    nodes.set(dir, node);
  }

  // ---- specs: defined once, carrying their node's prefix ----
  const defined = new Map(); // id -> { mark, file }
  for (const [dir, node] of nodes) {
    // @spec LID-003
    if (!node.design) {
      problems.push(`${dir}: no ${node.name}-design.md`);
    }
    const fm = node.design ? frontmatter(files[node.design]) : {};
    if (node.design && !fm.parent) problems.push(`${node.design}: no "parent:" in frontmatter`);
    if (node.design && node.specs && !fm.prefix) problems.push(`${node.design}: no "prefix:" in frontmatter`);
    if (!node.specs) continue;

    const byHand = handVerified(files[node.specs]);
    for (const line of files[node.specs].split('\n')) {
      const m = SPEC_LINE.exec(line);
      if (!m) continue;
      const [, mark, id] = m;
      // @spec LID-002
      if (defined.has(id)) {
        problems.push(`${node.specs}: ${id} is defined more than once (also in ${defined.get(id).file})`);
        continue;
      }
      defined.set(id, { mark, file: node.specs, byHand: byHand.has(id) });
      // @spec LID-003
      if (fm.prefix && !id.startsWith(`${fm.prefix}-`)) {
        problems.push(`${node.specs}: ${id} does not start with its node's prefix "${fm.prefix}-"`);
      }
    }
  }

  // ---- annotations: every one names a real spec ----
  const citedByTests = new Set();
  let annotations = 0;
  for (const path of paths) {
    if (!isSource(path)) continue;
    for (const line of files[path].split('\n')) {
      const m = ANNOTATION.exec(line);
      if (!m) continue;
      for (const id of m[1].match(ID) ?? []) {
        annotations += 1;
        // @spec LID-001
        if (!defined.has(id)) problems.push(`${path}: @spec ${id} names no spec`);
        if (path.startsWith('tests/')) citedByTests.add(id);
      }
    }
  }

  // ---- implemented specs: tested, or said to be verified by hand ----
  // @spec LID-004
  for (const [id, spec] of defined) {
    if (spec.mark === 'x' && !citedByTests.has(id) && !spec.byHand) {
      problems.push(`${spec.file}: ${id} is marked [x] but no test cites it and it is not listed under "Verified by hand"`);
    }
  }

  return { problems, specs: defined.size, nodes: nodes.size, annotations };
}

// Read the parts of the repository the check looks at, as { path: text }.
export function readRepo(rootUrl) {
  const root = fileURLToPath(rootUrl);
  const files = {};
  const skip = new Set(['node_modules', '.sst', '.git']);
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      if (skip.has(name) || name === '.DS_Store') continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else files[relative(root, full).split(sep).join('/')] = readFileSync(full, 'utf8');
    }
  };
  for (const top of ['docs/intent', ...SOURCE_ROOTS]) {
    const full = join(root, top);
    if (existsSync(full)) walk(full);
  }
  for (const f of SOURCE_FILES) {
    const full = join(root, f);
    if (existsSync(full)) files[f] = readFileSync(full, 'utf8');
  }
  return files;
}

// @spec LID-005
function main() {
  const result = checkCoherence(readRepo(new URL('..', import.meta.url)));
  if (result.problems.length === 0) {
    console.log(`Coherent: ${result.specs} specs in ${result.nodes} nodes, ${result.annotations} annotations, no problems.`);
    return;
  }
  console.error(`Coherence check found ${result.problems.length} problem(s):`);
  for (const p of result.problems) console.error(`  - ${p}`);
  process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
