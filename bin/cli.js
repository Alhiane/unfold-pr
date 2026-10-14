#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { changedFiles, readAt, meta } = require('../src/git');
const { analyze, langFor } = require('../src/core');
const { render } = require('../src/render');
const { toMarkdown } = require('../src/mermaid');
const { writeLocal, openInBrowser } = require('../src/local');

const HELP = `unfold — see a diff as the functions it touches, ordered by who calls whom

Usage
  unfold [base] [head] [options]

  base      ref to compare against (default: origin/main, then main, then HEAD~1)
  head      ref with the changes (default: HEAD). Use --worktree for uncommitted changes.

By default the map is written to .unfold/ at the repository root (kept out of git):
  .unfold/map.html   interactive map: open it in a browser (or pass --open)
  .unfold/map.md     reading order, cross-file calls and flags, for AI agents
  .unfold/map.json   full map data, for tools

Options
  -o, --out <file>   write only a single HTML file here instead of .unfold/
  --open             open the map in the browser when done
  -C <dir>           run inside this repository (default: cwd)
  --all              show every function in each changed file, not only changed ones and their neighbours
  --worktree         compare base against the working tree
  --json             print the graph as JSON instead of writing HTML
  --mermaid <file>   also write a Markdown summary with Mermaid call graphs (for PR comments)
  --png <dir>        also screenshot each file's map to <dir>/<n>.png + manifest.json (needs Chrome; CHROME_PATH)
  --theme <t>        theme for --png: dark (default) or light
  --fragment         write the page without <html>/<head> wrappers (for embedding)
  -h, --help         show this help
`;

function parseArgs(argv) {
  const o = { pos: [], out: null, open: false, cwd: process.cwd(), all: false, worktree: false, json: false, fragment: false, mermaid: null, png: null, theme: 'dark' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') { process.stdout.write(HELP); process.exit(0); }
    else if (a === '-o' || a === '--out') o.out = argv[++i];
    else if (a === '--open') o.open = true;
    else if (a === '-C') o.cwd = path.resolve(argv[++i]);
    else if (a === '--all') o.all = true;
    else if (a === '--worktree') o.worktree = true;
    else if (a === '--json') o.json = true;
    else if (a === '--mermaid') o.mermaid = argv[++i];
    else if (a === '--png') o.png = argv[++i];
    else if (a === '--theme') o.theme = argv[++i];
    else if (a === '--fragment') o.fragment = true;
    else o.pos.push(a);
  }
  return o;
}

function defaultBase(cwd) {
  const { execFileSync } = require('child_process');
  for (const ref of ['origin/main', 'origin/master', 'main', 'master']) {
    try { execFileSync('git', ['rev-parse', '--verify', '--quiet', ref], { cwd, stdio: 'ignore' }); return ref; } catch {}
  }
  return 'HEAD~1';
}

(async () => {
  const o = parseArgs(process.argv.slice(2));
  const base = o.pos[0] || defaultBase(o.cwd);
  const head = o.worktree ? null : (o.pos[1] || 'HEAD');
  // Gather changed files from git, then hand them to the core.
  const input = [];
  const allChanged = changedFiles(o.cwd, base, head);
  for (const ch of allChanged) {
    if (!langFor(ch.file)) continue;
    let source;
    try { source = readAt(o.cwd, head, ch.file); } catch { continue; }
    input.push({ path: ch.file, source, changedLines: ch.addedLines, status: ch.status });
  }
  const { files, links, skipped } = await analyze({ files: input }, { all: o.all });
  const m = meta(o.cwd, base, head);
  // Everything the diff touched, so summaries can say what wasn't mapped and why.
  const mapped = new Set(files.filter((f) => f.nodes.length).map((f) => f.file));
  m.changedFiles = allChanged.length;
  m.notMapped = allChanged.filter((c) => !mapped.has(c.file)).map((c) => ({
    file: c.file,
    reason: (skipped.find((x) => x.file === c.file) || {}).reason || (langFor(c.file) ? 'no code changes outside declarations' : 'language not supported'),
  }));
  m.title = `Unfold · ${m.repo}`;
  const data = { meta: m, files, links };
  if (o.json) { process.stdout.write(JSON.stringify(data, null, 2)); return; }
  let mapFile = o.out;
  let local = null;
  if (o.out) fs.writeFileSync(o.out, render(data, { fragment: o.fragment }));
  else { local = writeLocal(o.cwd, data); mapFile = local.files.html; }
  if (o.mermaid) fs.writeFileSync(o.mermaid, toMarkdown(data));
  if (o.png) {
    const { snapshot } = require('../src/snapshot');
    const htmlFile = o.fragment || !o.out ? path.join(o.png, '.full.html') : o.out;
    if (o.fragment || !o.out) { fs.mkdirSync(o.png, { recursive: true }); fs.writeFileSync(htmlFile, render(data)); }
    const shots = await snapshot(htmlFile, o.png, { theme: o.theme });
    const manifest = shots.map((s) => {
      const f = files.find((x) => x.file === s.file) || {};
      const nodes = f.nodes || [];
      return { ...s, png: path.basename(s.png), changed: nodes.filter((n) => n.kind === 'fn' && n.changed).length,
        flags: nodes.filter((n) => n.flags.length).map((n) => ({ name: n.name, line: n.start, flags: n.flags })) };
    });
    fs.writeFileSync(path.join(o.png, 'manifest.json'), JSON.stringify({ meta: m, files: manifest }, null, 2));
    if (o.fragment || !o.out) fs.unlinkSync(htmlFile);
    console.error(`unfold: ${shots.length} snapshot(s) → ${o.png}/`);
  }
  const fnTotal = files.reduce((a, f) => a + f.nodes.filter((n) => n.kind === 'fn' && n.changed).length, 0);
  const rel = (p) => path.relative(process.cwd(), p) || p;
  if (local) {
    console.error(`unfold: ${files.length} file(s), ${fnTotal} changed function(s), ${links.length} cross-file call(s)`);
    console.error(`  map for you:     ${rel(local.files.html)}`);
    console.error(`  map for agents:  ${rel(local.files.md)}   (point your agent at this file)`);
  } else {
    console.error(`unfold: ${files.length} file(s), ${fnTotal} changed function(s) → ${o.out}`);
  }
  if (o.open && mapFile) openInBrowser(path.resolve(mapFile));
})().catch((e) => { console.error('unfold:', process.env.UNFOLD_DEBUG ? e.stack : e.message); process.exit(1); });
