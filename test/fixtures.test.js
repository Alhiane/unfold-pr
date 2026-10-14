// Fixture suite: each folder in test/fixtures has before/ and after/ trees and an expected.json.
// The test commits before → after in a throwaway git repo, reads the diff with src/git.js,
// runs it through the core's analyze(),
// and compares a readable summary with expected.json.
//
//   npm test                 run
//   UPDATE=1 npm test        rewrite expected.json from current output (review the diff!)

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { changedFiles, readAt } = require('../src/git');
const { analyze: analyzeCore } = require('../src/core');

const FIXTURES = path.join(__dirname, 'fixtures');
const UPDATE = process.env.UPDATE === '1';

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function copyTree(src, dst) {
  if (!fs.existsSync(src)) return;
  fs.cpSync(src, dst, { recursive: true });
}

function clearTree(dir) {
  for (const e of fs.readdirSync(dir)) if (e !== '.git') fs.rmSync(path.join(dir, e), { recursive: true, force: true });
}

function makeRepo(fixtureDir) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'unfold-fixture-'));
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', 'user.email', 'fixture@unfold.test');
  git(repo, 'config', 'user.name', 'fixture');
  git(repo, 'config', 'commit.gpgsign', 'false');
  copyTree(path.join(fixtureDir, 'before'), repo);
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '--allow-empty', '-m', 'before');
  clearTree(repo);
  copyTree(path.join(fixtureDir, 'after'), repo);
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '--allow-empty', '-m', 'after');
  return repo;
}

const label = (n) => (n.kind === 'top' ? `(top-level code L${n.start})` : (n.cls ? `${n.cls}.` : '') + n.name);

// Summary that is stable and easy to read in a diff: names, not internal ids or line numbers.
async function analyze(repo) {
  const input = changedFiles(repo, 'HEAD~1', 'HEAD').map((ch) => ({
    path: ch.file, source: readAt(repo, 'HEAD', ch.file), changedLines: ch.addedLines, status: ch.status,
  }));
  const { files, links } = await analyzeCore({ files: input }, { all: true });
  const out = {};
  for (const f of [...files].sort((a, b) => a.file.localeCompare(b.file))) {
    const byId = new Map(f.nodes.map((n) => [n.id, n]));
    const sorted = [...f.nodes].sort((a, b) => a.start - b.start);
    out[f.file] = {
      status: f.status,
      changed: sorted.filter((n) => n.kind === 'fn' && n.changed).map(label),
      unchanged: sorted.filter((n) => n.kind === 'fn' && !n.changed).map(label),
      constants: sorted.filter((n) => n.kind === 'const').map(label),
      topLevel: sorted.filter((n) => n.kind === 'top').map(label),
      edges: f.edges.map((e) => `${label(byId.get(e.from))} > ${label(byId.get(e.to))}`).sort(),
      tiers: Object.fromEntries(sorted.map((n) => [label(n), n.tier])),
      flags: Object.fromEntries(sorted.filter((n) => n.flags.length).map((n) => [label(n), n.flags])),
    };
  }
  if (links.length) {
    const nodeOf = (end) => files.find((f) => f.file === end.file).nodes.find((n) => n.id === end.id);
    out['(cross-file links)'] = links.map((l) => `${l.from.file}: ${label(nodeOf(l.from))} > ${l.to.file}: ${label(nodeOf(l.to))}`).sort();
  }
  return out;
}

for (const name of fs.readdirSync(FIXTURES).filter((d) => fs.statSync(path.join(FIXTURES, d)).isDirectory()).sort()) {
  test(`fixture: ${name}`, async () => {
    const dir = path.join(FIXTURES, name);
    const repo = makeRepo(dir);
    try {
      const actual = await analyze(repo);
      const expectedFile = path.join(dir, 'expected.json');
      if (UPDATE || !fs.existsSync(expectedFile)) {
        fs.writeFileSync(expectedFile, JSON.stringify(actual, null, 2) + '\n');
        if (!UPDATE) assert.fail(`wrote new ${path.relative(process.cwd(), expectedFile)}; review it and re-run`);
        return;
      }
      assert.deepEqual(actual, JSON.parse(fs.readFileSync(expectedFile, 'utf8')));
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });
}
