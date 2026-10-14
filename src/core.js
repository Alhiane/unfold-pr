// The Unfold core: turns changed files into the map data contract
// (see `--json` output). No git, no filesystem, no network:
// every surface (CLI, local server, GitHub App, extension) gathers the files its own way
// and calls analyze().
const { extract, langFor, configure } = require('./extract');
const { buildGraph } = require('./graph');
const { crossFileLinks } = require('./links');

const MAX_SOURCE = 1_500_000; // larger files are almost always generated or vendored

/**
 * @param {{ files: Array<{ path: string, source: string, changedLines: Iterable<number>, status?: string }> }} input
 * @param {{ all?: boolean }} [options]  all: show every function, not only changed ones and their neighbours
 * @returns {Promise<{ files: Array<object>, links: Array<{ from: { file, id }, to: { file, id } }>, skipped: Array<{ file, reason }> }>}
 *   files sorted by number of changed functions, most first; links are calls between changed files;
 *   skipped lists supported files that couldn't be mapped ({ file, reason })
 */
async function analyze(input, { all = false } = {}) {
  // Pass 1: parse every file, so links between files can be resolved.
  const entries = [];
  const skipped = []; // supported files that couldn't be mapped, with the reason
  for (const f of input.files) {
    if (!langFor(f.path) || typeof f.source !== 'string') continue;
    if (f.source.length > MAX_SOURCE) { skipped.push({ file: f.path, reason: 'too large (likely generated)' }); continue; }
    let parsed;
    try {
      parsed = await extract(f.path, f.source);
    } catch (err) {
      // One unparseable file must never sink the whole map (e.g. bash `case` crashes its grammar).
      skipped.push({ file: f.path, reason: 'parser error' });
      continue;
    }
    if (!parsed) continue;
    const changed = new Set(f.changedLines);
    addTopLevelBlocks(parsed, changed);
    entries.push({ file: f.path, input: f, parsed, changed });
  }

  // Cross-file links, kept only when at least one end is a changed function.
  const isChanged = (file, id) => {
    const e = entries.find((x) => x.file === file);
    const fn = e && e.parsed.functions.find((x) => x.id === id);
    if (!fn) return false;
    for (let l = fn.start; l <= fn.end; l++) if (e.changed.has(l)) return true;
    return false;
  };
  const candidates = crossFileLinks(entries).filter((l) => isChanged(l.from.file, l.from.id) || isChanged(l.to.file, l.to.id));
  const keepByFile = new Map();
  for (const l of candidates) for (const end of [l.from, l.to]) {
    if (!keepByFile.has(end.file)) keepByFile.set(end.file, new Set());
    keepByFile.get(end.file).add(end.id);
  }

  // Pass 2: per-file graphs, keeping linked functions in scope.
  const files = [];
  for (const e of entries) {
    const g = buildGraph(e.parsed, e.changed, { all, keep: keepByFile.get(e.file) || [] });
    files.push({
      file: e.file,
      status: e.input.status || 'modified',
      lang: e.parsed.lang,
      lines: e.input.source.split('\n'),
      nodes: g.nodes.map(({ calls, qcalls, paramTypes, changedLineSet, ...n }) => ({ ...n, changedLines: [...changedLineSet] })),
      edges: g.edges,
    });
  }

  // Drop links whose ends didn't survive (e.g. nested functions render inside their parent).
  const present = new Set(files.flatMap((f) => f.nodes.map((n) => `${f.file}#${n.id}`)));
  const links = candidates.filter((l) => present.has(`${l.from.file}#${l.from.id}`) && present.has(`${l.to.file}#${l.to.id}`));

  // A function called from another changed file isn't "uncalled"; count cross-file callers too.
  const node = (end) => files.find((f) => f.file === end.file).nodes.find((n) => n.id === end.id);
  for (const l of links) {
    const to = node(l.to), from = node(l.from);
    to.callers = (to.callers || 0) + 1;
    from.callees = (from.callees || 0) + 1;
    to.flags = to.flags.filter((f) => f !== 'new · no in-file callers' && f !== 'private · never called');
  }

  const changed = (f) => f.nodes.filter((n) => n.kind === 'fn' && n.changed).length;
  files.sort((a, b) => changed(b) - changed(a));
  return { files, links, skipped };
}

// Changed top-level statements become "top-level code" blocks, merged while they're adjacent
// (no unchanged statement or declaration in between). They behave like functions from here on:
// they can call functions in the same file and, through links.js, in other files.
function addTopLevelBlocks(parsed, changed) {
  const fns = parsed.functions;
  const insideFn = (l) => fns.some((f) => l >= f.start && l <= f.end);
  // changed lines that belong to the statement itself, not to a function defined inside it
  const touched = (st) => { for (let l = st.start; l <= st.end; l++) if (changed.has(l) && !insideFn(l)) return true; return false; };
  const groups = [];
  let cur = null;
  for (const st of parsed.topLevel || []) {
    if (!touched(st)) { cur = null; continue; }
    const between = cur && parsed.functions.some((f) => f.start > cur.end && f.start < st.start);
    if (!cur || between) { cur = { start: st.start, end: st.end, calls: new Set(), qcalls: new Set() }; groups.push(cur); }
    cur.end = st.end;
    for (const c of st.calls) cur.calls.add(c);
    for (const q of st.qcalls) cur.qcalls.add(q);
  }
  groups.forEach((g, i) => parsed.functions.push({ id: `t${i}`, kind: 'top', name: 'top-level code', cls: null, ...g, paramTypes: {} }));
}

module.exports = { analyze, configure, langFor };
