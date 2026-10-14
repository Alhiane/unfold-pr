// The core must work without git or a filesystem: surfaces pass files in directly.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { analyze } = require('../src/core');

const source = [
  'export function total(items) {',   // 1
  '  return round(sum(items));',      // 2
  '}',                                // 3
  'function sum(items) {',            // 4
  '  return items.reduce((a, b) => a + b, 0);', // 5
  '}',                                // 6
  'function round(n) {',              // 7
  '  return Math.round(n);',          // 8
  '}',                                // 9
].join('\n');

test('analyze() works on in-memory files', async () => {
  const { files } = await analyze({ files: [{ path: 'src/total.js', source, changedLines: [2] }] });
  assert.equal(files.length, 1);
  const f = files[0];
  const name = (id) => f.nodes.find((n) => n.id === id).name;
  assert.deepEqual(f.nodes.filter((n) => n.changed).map((n) => n.name), ['total']);
  assert.deepEqual(f.edges.map((e) => `${name(e.from)}>${name(e.to)}`).sort(), ['total>round', 'total>sum']);
  assert.equal(f.status, 'modified');
  assert.deepEqual(f.nodes.find((n) => n.name === 'total').changedLines, [2]);
});

test('analyze() skips unsupported and oversized files', async () => {
  const { files } = await analyze({ files: [
    { path: 'README.md', source: '# hi', changedLines: [1] },
    { path: 'big.js', source: 'x'.repeat(1_500_001), changedLines: [1] },
  ] });
  assert.equal(files.length, 0);
});

test('a file the parser chokes on is skipped, the rest still maps', async () => {
  const { files, skipped } = await analyze({ files: [
    { path: 'bin/run.sh', source: 'case "$1" in\n  a) echo a ;;\nesac\n', changedLines: [1, 2, 3] },
    { path: 'src/ok.js', source: 'function a() {\n  return 1;\n}\n', changedLines: [2] },
  ] });
  assert.deepEqual(files.map((f) => f.file), ['src/ok.js']);
  assert.deepEqual(skipped, [{ file: 'bin/run.sh', reason: 'parser error' }]);
});
