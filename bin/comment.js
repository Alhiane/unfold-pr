#!/usr/bin/env node
// Builds the PR comment body.
// Usage: comment.js [--manifest <dir/manifest.json> --image-base <url>] [--fallback <mermaid.md> | --summary-only <mermaid.md>]
//                   [--map-url <hosted interactive map>] [--artifact <url>]
// With --image-base, each file's map is embedded as an image; otherwise the Mermaid summary is used.
const fs = require('fs');

const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];

const out = ['<!-- unfold -->', '### Unfold map', ''];
let manifest = null;
try { manifest = JSON.parse(fs.readFileSync(args.manifest, 'utf8')); } catch {}

if (manifest && args['image-base']) {
  const files = manifest.files;
  const total = files.reduce((a, f) => a + f.changed, 0);
  const flags = files.flatMap((f) => f.flags.map((x) => ({ file: f.file, ...x })));
  out.push(`**${files.length} file${files.length === 1 ? '' : 's'} · ${total} changed function${total === 1 ? '' : 's'} · ${flags.length} flag${flags.length === 1 ? '' : 's'}**`);
  if (flags.length) out.push('', ...flags.slice(0, 15).map((f) => `- \`${f.file}\` **${f.name}** (L${f.line}): ${f.flags.join(', ')}`));
  files.forEach((f, i) => {
    const url = `${args['image-base'].replace(/\/$/, '')}/${f.png}?raw=true`;
    out.push('', `<details${i < 3 ? ' open' : ''}>`, `<summary><code>${f.file}</code> · ${f.changed} changed</summary>`, '',
      `<a href="${url}"><img src="${url}" alt="Function map of ${f.file}" width="100%"></a>`, '', '</details>');
  });
  out.push('', '<sub>Tap an image for full size. Entry points on the left, the functions they call to the right; green lines are added or edited.</sub>');
} else if (args['summary-only'] && fs.existsSync(args['summary-only'])) {
  // counts + flags from the Markdown summary, without the graphs
  out.push(fs.readFileSync(args['summary-only'], 'utf8').split('\n\n\n<details')[0]);
} else if (args.fallback && fs.existsSync(args.fallback)) {
  out.push(fs.readFileSync(args.fallback, 'utf8'));
} else {
  out.push('No map was generated for this PR.');
}
if (args['map-url']) {
  out.push('', `**[Open the interactive map](${args['map-url']})**: every changed function as a block with its code, arrows for who calls whom. Updates on each push; can take a minute to appear.`);
  if (args['pages-missing']) out.push(`> GitHub Pages isn't enabled for this repo yet, so the link won't work until it is: **Settings → Pages → Deploy from a branch → \`${args['pages-missing']}\` / root**.`);
  if (args.artifact) out.push(`<sub>Not loading? [Download it](${args.artifact}) instead.</sub>`);
} else if (args.artifact) {
  out.push('', `[Interactive map](${args.artifact}): download, unzip, open \`unfold.html\` to trace callers and expand every block.`);
}
process.stdout.write(out.join('\n') + '\n');
