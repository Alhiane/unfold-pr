// Local output: `unfold` with no -o writes .unfold/ at the repo root and keeps it out of git.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const CLI = path.join(__dirname, '..', 'bin', 'cli.js');
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8' });

test('writes map.html, map.md and map.json to .unfold/ and ignores it locally', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'unfold-local-'));
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', 'user.email', 't@unfold.test'); git(repo, 'config', 'user.name', 't');
  fs.mkdirSync(path.join(repo, 'src'));
  fs.writeFileSync(path.join(repo, 'src/a.js'), 'function a() {\n  return 1;\n}\n');
  git(repo, 'add', '-A'); git(repo, 'commit', '-qm', 'one');
  fs.writeFileSync(path.join(repo, 'src/a.js'), 'function a() {\n  return b();\n}\nfunction b() {\n  return 2;\n}\nmodule.exports = { a };\n');
  git(repo, 'commit', '-qam', 'two');

  const sub = path.join(repo, 'src'); // run from a subfolder: output still goes to the root
  execFileSync('node', [CLI, 'HEAD~1', 'HEAD'], { cwd: sub, stdio: 'pipe' });
  execFileSync('node', [CLI, 'HEAD~1', 'HEAD'], { cwd: sub, stdio: 'pipe' }); // twice: exclude stays single

  for (const f of ['map.html', 'map.md', 'map.json']) assert.ok(fs.existsSync(path.join(repo, '.unfold', f)), f);
  const md = fs.readFileSync(path.join(repo, '.unfold/map.md'), 'utf8');
  assert.match(md, /## Reading order/);
  assert.match(md, /- `a` · src\/a\.js:1-3 · \+1\n  - `b` · src\/a\.js:4-6/);
  const json = JSON.parse(fs.readFileSync(path.join(repo, '.unfold/map.json'), 'utf8'));
  assert.equal(json.files[0].lines, undefined, 'map.json leaves file contents out');

  const exclude = fs.readFileSync(path.join(repo, '.git/info/exclude'), 'utf8');
  assert.equal(exclude.match(/^\.unfold\/$/gm).length, 1);
  assert.equal(git(repo, 'status', '--porcelain'), '', '.unfold/ must not show as untracked');
  fs.rmSync(repo, { recursive: true, force: true });
});
