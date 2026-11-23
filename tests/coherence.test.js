import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { checkCoherence, readRepo } from '../bin/coherence-check.mjs';

// Fixture annotations are assembled here so this file's own text never looks like a real one.
const ann = (...ids) => `// @${'spec'} ${ids.join(', ')}`;
const design = (prefix) => `---\nparent: high-level-design\n${prefix ? `prefix: ${prefix}\n` : ''}---\n\n# Node\n`;
const spec = (mark, id, text = 'The thing shall work.') => `- [${mark}] **${id}**: ${text}`;

// A tiny coherent project: one node, two specs, one tested and one verified by hand.
const good = () => ({
  'docs/intent/engine/engine-design.md': design('ENG'),
  'docs/intent/engine/engine-specs.md': [
    '# Engine',
    spec('x', 'ENG-001'),
    spec('x', 'ENG-002'),
    spec(' ', 'ENG-003'),
    spec('D', 'ENG-004'),
    '',
    '## Verified by hand',
    'Needs a browser: `ENG-002`.',
  ].join('\n'),
  'site/engine.js': `${ann('ENG-001', 'ENG-002')}\nexport const run = () => 1;\n`,
  'tests/engine.test.js': `${ann('ENG-001')}\ntest('runs', () => {});\n`,
});
// "<file>: (annotation) <id> names no spec", built so this file holds no literal annotation.
const namesNoSpec = (file, id) => new RegExp(`${file.replace(/[.\/]/g, '\\$&')}: @${'spec'} ${id} names no spec`);
const problemsFor = (change) => {
  const files = good();
  change(files);
  return checkCoherence(files).problems.join('\n');
};

// @spec LID-005
test('a coherent project has no problems and reports its counts', () => {
  const result = checkCoherence(good());
  assert.deepEqual(result.problems, []);
  assert.equal(result.specs, 4);
  assert.equal(result.nodes, 1);
});

// @spec LID-001
test('an annotation that names no spec is a problem, wherever it is', () => {
  assert.match(problemsFor((f) => { f['site/engine.js'] += `${ann('ENG-099')}\n`; }), namesNoSpec('site/engine.js', 'ENG-099'));
  assert.match(problemsFor((f) => { f['tests/engine.test.js'] += `${ann('NOPE-001')}\n`; }), namesNoSpec('tests/engine.test.js', 'NOPE-001'));
  assert.match(problemsFor((f) => { f['.github/workflows/ci.yml'] = `# @${'spec'} ENG-777\n`; }), namesNoSpec('.github/workflows/ci.yml', 'ENG-777'));
});

// @spec LID-002
test('a spec ID defined twice is a problem, in one file or across files', () => {
  assert.match(problemsFor((f) => { f['docs/intent/engine/engine-specs.md'] += `\n${spec(' ', 'ENG-003')}`; }), /ENG-003 is defined more than once/);
  assert.match(problemsFor((f) => {
    f['docs/intent/other/other-design.md'] = design('ENG');
    f['docs/intent/other/other-specs.md'] = spec(' ', 'ENG-001');
  }), /ENG-001 is defined more than once/);
});

// @spec LID-003
test('IDs must carry their node prefix, and every node needs a well-formed design doc', () => {
  assert.match(problemsFor((f) => { f['docs/intent/engine/engine-specs.md'] += `\n${spec(' ', 'MOTOR-001')}`; }), /MOTOR-001 does not start with its node's prefix "ENG-"/);
  assert.match(problemsFor((f) => { delete f['docs/intent/engine/engine-design.md']; }), /docs\/intent\/engine: no engine-design\.md/);
  assert.match(problemsFor((f) => { f['docs/intent/engine/engine-design.md'] = design(null); }), /engine-design\.md: no "prefix:" in frontmatter/);
  assert.match(problemsFor((f) => { f['docs/intent/engine/engine-design.md'] = '# No frontmatter\n'; }), /engine-design\.md: no "parent:" in frontmatter/);
});

// @spec LID-004
test('an implemented spec must be cited by a test or listed as verified by hand', () => {
  assert.match(problemsFor((f) => { f['tests/engine.test.js'] = "test('nothing', () => {});\n"; }), /ENG-001 is marked \[x\] but no test cites it/);
  assert.match(problemsFor((f) => {
    f['docs/intent/engine/engine-specs.md'] = f['docs/intent/engine/engine-specs.md'].replace('`ENG-002`', 'nothing');
  }), /ENG-002 is marked \[x\] but no test cites it/);
  // A citation in site/ alone is not a test; gaps and deferred specs need nothing.
  const result = checkCoherence(good());
  assert.ok(!result.problems.some((p) => /ENG-003|ENG-004/.test(p)));
  // Being listed under another file's heading does not count.
  assert.match(problemsFor((f) => {
    f['docs/intent/engine/engine-specs.md'] = f['docs/intent/engine/engine-specs.md'].replace('`ENG-002`', 'nothing');
    f['docs/intent/other/other-design.md'] = design('OTH');
    f['docs/intent/other/other-specs.md'] = `${spec(' ', 'OTH-001')}\n\n## Verified by hand\n\`ENG-002\`\n`;
  }), /ENG-002 is marked \[x\] but no test cites it/);
});

// @spec LID-005
test('this repository is coherent', () => {
  const result = checkCoherence(readRepo(new URL('..', import.meta.url)));
  assert.deepEqual(result.problems, []);
  assert.ok(result.specs > 100, `found ${result.specs} specs`);
});

// ---------- the rest of the LID setup ----------

const root = new URL('..', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

// @spec LID-006
test('both LID skills are vendored with licence and source, at the version AGENTS.md declares', () => {
  const version = read('AGENTS.md').match(/^## LID\n(?:- .*\n)*?- Version: (\S+)/m)?.[1];
  assert.ok(version, 'AGENTS.md declares a LID version');
  for (const skill of ['linked-intent-dev', 'update-lid']) {
    const dir = `.claude/skills/${skill}/`;
    assert.ok(existsSync(new URL(`${dir}SKILL.md`, root)), `${skill} SKILL.md`);
    assert.ok(existsSync(new URL(`${dir}LICENSE`, root)), `${skill} LICENSE`);
    assert.match(read(`${dir}SOURCE.md`), new RegExp(`\\| Tag \\| \`v${version.replace(/\./g, '\\.')}\``), `${skill} SOURCE.md names v${version}`);
  }
});

// @spec LID-007
test('every change order has a row in the index, and the template exists', () => {
  const dir = new URL('docs/change-orders/', root);
  const index = read('docs/change-orders/README.md');
  const orders = readdirSync(dir).filter((n) => /^CO-\d{3}-.+\.md$/.test(n));
  assert.ok(orders.length >= 1);
  for (const name of orders) assert.ok(index.includes(`](${name})`), `${name} is in the index`);
  assert.ok(existsSync(new URL('TEMPLATE.md', dir)));
});
