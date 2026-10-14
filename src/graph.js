// Build a file-scoped call graph and assign tiers (entry points -> helpers).

const CTORS = new Set(['constructor', '__init__', '__construct', 'new', 'init', 'initialize']);

function buildGraph(parsed, changedLines, { all = false, keep: keepExtra = [] } = {}) {
  const fns = parsed.functions;
  // Prefer innermost match: nested helpers shouldn't swallow outer function names.
  const byName = new Map();
  for (const f of fns) {
    if (!byName.has(f.name)) byName.set(f.name, []);
    byName.get(f.name).push(f);
  }
  const consts = new Map(parsed.consts.map((c, i) => [c.name, { id: `c${i}`, kind: 'const', ...c }]));

  const edges = [];
  const srcLines = parsed.src.split('\n');
  for (const f of fns) {
    f.kind = f.kind || 'fn';
    f.added = 0; f.changedLineSet = new Set();
    for (let l = f.start; l <= f.end; l++) if (changedLines.has(l)) { f.added++; f.changedLineSet.add(l); }
    f.changed = f.added > 0;
    for (const name of f.calls) {
      let targets = (byName.get(name) || []).filter((t) => t !== f && !(t.start >= f.start && t.end <= f.end));
      // `Foo(...)` / `new Foo(...)` where Foo is a class in this file: link to its constructor
      if (!targets.length) targets = fns.filter((t) => t.cls === name && CTORS.has(t.name));
      // same-class method wins when names collide
      const t = targets.find((x) => x.cls === f.cls) || targets[0];
      if (t) edges.push({ from: f.id, to: t.id });
    }
    // constant references: plain text scan of the body is good enough for UPPER_CASE names
    const body = srcLines.slice(f.start - 1, f.end).join('\n');
    for (const [name, c] of consts) if (new RegExp(`\\b${name}\\b`).test(body)) edges.push({ from: f.id, to: c.id });
  }
  const uniq = new Map(edges.map((e) => [`${e.from}>${e.to}`, e]));
  let allEdges = [...uniq.values()];
  const constNodes = [...consts.values()].map((c) => {
    const set = new Set();
    for (let l = c.start; l <= c.end; l++) if (changedLines.has(l)) set.add(l);
    return { ...c, changedLineSet: set, changed: set.size > 0, added: set.size };
  });
  let nodes = [...fns, ...constNodes.filter((c) => allEdges.some((e) => e.to === c.id))];

  // Scope: changed functions + their direct in-file neighbours (unless --all)
  if (!all) {
    const keep = new Set(nodes.filter((n) => n.changed).map((n) => n.id));
    for (const e of allEdges) {
      if (keep.has(e.from) || keep.has(e.to)) { keep.add(e.from); keep.add(e.to); }
    }
    // functions another changed file links to (or from), so cross-file arrows have both ends
    for (const id of keepExtra) keep.add(id);
    // drop nested functions whose parent is kept (they render inside the parent block)
    nodes = nodes.filter((n) => keep.has(n.id));
    allEdges = allEdges.filter((e) => keep.has(e.from) && keep.has(e.to));
  }
  // Nested functions are shown inside their parent; don't render them twice
  const fnNodes = nodes.filter((n) => n.kind === 'fn');
  // (only real functions count as parents: a top-level block containing a callback keeps it as its own block)
  nodes = nodes.filter((n) => !(n.kind === 'fn' && fnNodes.some((o) => o !== n && o.kind === 'fn' && o.start <= n.start && o.end >= n.end && (o.start !== n.start || o.end !== n.end))));
  const ids = new Set(nodes.map((n) => n.id));
  allEdges = allEdges.filter((e) => ids.has(e.from) && ids.has(e.to));

  // Tier = longest path from any root, cycle-safe.
  const out = new Map(nodes.map((n) => [n.id, []]));
  const indeg = new Map(nodes.map((n) => [n.id, 0]));
  for (const e of allEdges) { out.get(e.from).push(e.to); indeg.set(e.to, indeg.get(e.to) + 1); }
  const tier = new Map();
  const visiting = new Set();
  function depthFrom(id, d) {
    if (visiting.has(id)) return; // cycle (recursion) — stop
    if ((tier.get(id) ?? -1) >= d) return;
    tier.set(id, d);
    visiting.add(id);
    for (const t of out.get(id)) depthFrom(t, d + 1);
    visiting.delete(id);
  }
  const roots = nodes.filter((n) => indeg.get(n.id) === 0);
  for (const r of roots) depthFrom(r.id, 0);
  for (const n of nodes) if (!tier.has(n.id)) depthFrom(n.id, 0); // pure cycles
  // constants always sit in the last column
  const maxFnTier = Math.max(0, ...nodes.filter((n) => n.kind === 'fn').map((n) => tier.get(n.id)));
  for (const n of nodes) if (n.kind === 'const') tier.set(n.id, maxFnTier + 1);

  // CommonJS exports count as exported: module.exports = { a, b }, module.exports.a = …, exports.a = …
  const cjsExports = new Set();
  for (const m of parsed.src.matchAll(/module\.exports\s*=\s*\{([^}]*)\}/g))
    for (const part of m[1].split(',')) { const k = part.split(':')[0].trim(); if (/^\w+$/.test(k)) cjsExports.add(k); }
  for (const m of parsed.src.matchAll(/(?:module\.)?exports\.(\w+)\s*=/g)) cjsExports.add(m[1]);
  for (const m of parsed.src.matchAll(/module\.exports\s*=\s*(\w+)\s*;?\s*$/gm)) cjsExports.add(m[1]);

  // Vue: functions bound in the <template> (@click="save", {{ format(x) }}) are called from there
  const usedInTemplate = (name) => !!parsed.template && new RegExp(`(^|[^\\w$.])${name.replace(/\$/g, '\\$')}([^\\w$]|$)`).test(parsed.template);

  // Review flags tuned for AI-generated code
  for (const n of nodes) {
    n.flags = [];
    if (n.kind !== 'fn') continue; // top-level code and constants get no flags
    const callers = allEdges.filter((e) => e.to === n.id).length;
    const callees = allEdges.filter((e) => e.from === n.id).length;
    n.callers = callers; n.callees = callees;
    const len = n.end - n.start + 1;
    const head = srcLines.slice(n.start - 1, Math.min(n.end, n.start + 4)).join(' ');
    // Python dunders (__init__) and PHP magic methods (__construct, __invoke) are called by the runtime
    const isDunder = /^__\w+__$/.test(n.name) || (parsed.lang === 'php' && /^__[a-z]\w*$/i.test(n.name));
    const isPrivate = !isDunder && (/\bprivate\b|#\w/.test(head.split('(')[0]) || /^_/.test(n.name));
    // Class members are API unless private; entry points from outside the file are expected.
    const isExported = /\bexport\b|\bpublic\b|\bpub\b/.test(head) || (/^[A-Z]/.test(n.name) && parsed.lang === 'go') || (n.cls && !isPrivate) || isDunder || cjsExports.has(n.name) || usedInTemplate(n.name);
    if (n.changed && callers === 0) {
      if (isPrivate) n.flags.push('private · never called');
      else if (!isExported && n.added >= len * 0.8 && roots.length > 1 && !/^(main|__init__|constructor|setup|handle|render)$/.test(n.name))
        n.flags.push('new · no in-file callers');
    }
    if (callees >= 8) n.flags.push(`fan-out ${callees}`);
    if (n.end - n.start + 1 > 80) n.flags.push(`${n.end - n.start + 1} lines`);
  }
  return { nodes: nodes.map((n) => ({ ...n, tier: tier.get(n.id) })), edges: allEdges };
}

module.exports = { buildGraph };
