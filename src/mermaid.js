// Markdown summary with one Mermaid call graph per changed file.
// GitHub renders ```mermaid blocks natively in PR comments.

const MAX_FILES = 8;
const MAX_NODES = 40;
const MAX_CHARS = 60000; // GitHub comment limit is 65,536

const label = (s) => s.replace(/["`]/g, "'").replace(/[<>]/g, '');

function fileGraph(f) {
  const nodes = f.nodes.slice(0, MAX_NODES);
  const ids = new Set(nodes.map((n) => n.id));
  const out = ['flowchart LR'];
  const tiers = [...new Set(nodes.map((n) => n.tier))].sort((a, b) => a - b);
  for (const t of tiers) {
    const inTier = nodes.filter((n) => n.tier === t).sort((a, b) => a.start - b.start);
    const allConst = inTier.every((n) => n.kind === 'const');
    const title = allConst ? 'constants' : t === 0 ? 'entry points' : `tier ${t + 1}`;
    out.push(`  subgraph T${t}["${title}"]`, '    direction TB');
    for (const n of inTier) {
      const name = label((n.cls ? `${n.cls}.` : '') + n.name);
      const extra = n.changed ? ` +${n.added}` : '';
      const flags = n.flags.length ? `<br/>⚠ ${label(n.flags.join(', '))}` : '';
      const shape = n.kind === 'const' ? [`[/"`, `"/]`] : [`["`, `"]`];
      out.push(`    ${n.id}${shape[0]}${name}${extra}${flags}${shape[1]}`);
    }
    out.push('  end');
  }
  for (const e of f.edges) if (ids.has(e.from) && ids.has(e.to)) out.push(`  ${e.from} --> ${e.to}`);
  const cls = (pred) => nodes.filter(pred).map((n) => n.id).join(',');
  const changed = cls((n) => n.changed && !n.flags.length);
  const flagged = cls((n) => n.flags.length);
  const ctx = cls((n) => !n.changed);
  out.push('  classDef changed stroke:#2f8fb8,stroke-width:2px');
  out.push('  classDef flagged stroke:#d9822b,stroke-width:2px');
  out.push('  classDef ctx stroke-dasharray:4 3,opacity:0.7');
  if (changed) out.push(`  class ${changed} changed`);
  if (flagged) out.push(`  class ${flagged} flagged`);
  if (ctx) out.push(`  class ${ctx} ctx`);
  return { text: out.join('\n'), truncated: f.nodes.length > MAX_NODES };
}

function toMarkdown(data) {
  const fnCount = (f) => f.nodes.filter((n) => (n.kind === 'fn' || n.kind === 'top') && n.changed).length;
  const files = data.files.filter((f) => f.nodes.length);
  const total = files.reduce((a, f) => a + f.nodes.filter((n) => n.kind === 'fn' && n.changed).length, 0);
  const tops = files.reduce((a, f) => a + f.nodes.filter((n) => n.kind === 'top').length, 0);
  const flags = files.flatMap((f) => f.nodes.filter((n) => n.flags.length).map((n) => ({ f, n })));
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const m = data.meta || {};
  const head = m.changedFiles != null
    ? `**${plural(m.changedFiles, 'file')} changed · ${files.length} mapped · ${plural(total, 'changed function')}${tops ? ` · ${plural(tops, 'top-level block')}` : ''} · ${plural(flags.length, 'flag')}**`
    : `**${plural(files.length, 'file')} · ${plural(total, 'changed function')} · ${plural(flags.length, 'flag')}**`;
  const parts = [head];
  if (m.notMapped && m.notMapped.length) {
    // group skipped files by extension: "Not mapped: 4 .md, 2 .yml (language not supported)"
    const byReason = {};
    for (const x of m.notMapped) {
      const ext = (x.file.match(/\.[^./]+$/) || [x.file.split('/').pop()])[0];
      ((byReason[x.reason] ||= {})[ext] ||= 0);
      byReason[x.reason][ext]++;
    }
    const lines = Object.entries(byReason).map(([reason, exts]) => `${Object.entries(exts).sort((a, b) => b[1] - a[1]).map(([e, n]) => `${n} ${e}`).join(', ')} (${reason})`);
    parts.push('', `<sub>Not mapped: ${lines.join('; ')}</sub>`);
  }
  if (flags.length) {
    parts.push('', flags.slice(0, 15).map(({ f, n }) => `- \`${f.file}\` **${n.name}** (L${n.start}): ${n.flags.join(', ')}`).join('\n'));
  }
  let used = parts.join('\n').length;
  let shown = 0;
  for (const f of files.slice(0, MAX_FILES)) {
    const g = fileGraph(f);
    const block = `\n\n<details${shown === 0 ? ' open' : ''}>\n<summary><code>${f.file}</code> · ${fnCount(f)} changed</summary>\n\n\`\`\`mermaid\n${g.text}\n\`\`\`\n${g.truncated ? `\n_Showing the first ${MAX_NODES} blocks._\n` : ''}</details>`;
    if (used + block.length > MAX_CHARS) break;
    parts.push(block);
    used += block.length;
    shown++;
  }
  if (shown < files.length) parts.push(`\n\n_${files.length - shown} more file(s) in the full map._`);
  if (!files.length) parts.push('', m.changedFiles ? 'Nothing to map: no code changes in a supported language. See "Not mapped" above.' : 'No functions changed in supported files.');
  return parts.join('\n');
}

module.exports = { toMarkdown };
