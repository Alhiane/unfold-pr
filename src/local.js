// Local output: the map written into the repo, in .unfold/ at the root.
//   map.html  interactive map for people
//   map.md    reading order, cross-file calls and flags for AI agents
//   map.json  the full data contract, for tools
// .unfold/ is added to .git/info/exclude (local only, never the user's .gitignore).
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { render } = require('./render');
const { toAgentMarkdown } = require('./agent');

const DIR = '.unfold';

function repoRoot(cwd) {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' }).trim();
}

function ignoreLocally(cwd) {
  try {
    const rel = execFileSync('git', ['rev-parse', '--git-path', 'info/exclude'], { cwd, encoding: 'utf8' }).trim();
    const file = path.resolve(cwd, rel);
    const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    if (current.split('\n').some((l) => l.trim() === `${DIR}/` || l.trim() === DIR)) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `${current && !current.endsWith('\n') ? '\n' : ''}# Unfold maps (local)\n${DIR}/\n`);
  } catch { /* not fatal: worst case the folder shows as untracked */ }
}

function writeLocal(cwd, data) {
  const root = repoRoot(cwd);
  const dir = path.join(root, DIR);
  fs.mkdirSync(dir, { recursive: true });
  ignoreLocally(root);
  const files = {
    html: path.join(dir, 'map.html'),
    md: path.join(dir, 'map.md'),
    json: path.join(dir, 'map.json'),
  };
  fs.writeFileSync(files.html, render(data));
  fs.writeFileSync(files.md, toAgentMarkdown(data));
  // map.json drops file contents: agents and tools read the files from the repo itself
  const slim = { ...data, files: data.files.map(({ lines, ...f }) => f) };
  fs.writeFileSync(files.json, JSON.stringify(slim, null, 2));
  return { root, dir, files };
}

function openInBrowser(file) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', file] : [file];
  try {
    const child = require('child_process').spawn(cmd, args, { stdio: 'ignore', detached: true });
    child.on('error', () => {}); // no browser opener (CI, containers): just skip
    child.unref();
    return true;
  } catch { return false; }
}

module.exports = { writeLocal, openInBrowser, DIR };
