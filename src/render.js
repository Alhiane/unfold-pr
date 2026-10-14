// Renders the map as one self-contained HTML page.

function render(data, { fragment = false } = {}) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  const body = `<title>${esc(data.meta.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;600&display=swap">
<style>
/* Layout: blueprint canvas — call tiers as columns, left (entry points) to right (helpers), wires between blocks */
:root{
  --bg:#f3f5f7; --panel:#ffffff; --ink:#16202a; --muted:#5d6b78; --line:#d5dde4;
  --wire:#2f8fb8; --wire-dim:#bccbd6; --label:#1b4f8a; --label-ink:#ffffff;
  --add:#e3f6e8; --add-bar:#2c9a52; --flag:#a2581b; --flag-bg:#fbefe2; --focus:#d6336c;
  --sans:"IBM Plex Sans",ui-sans-serif,system-ui,sans-serif;
  --mono:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --bg:#0d1117; --panel:#121923; --ink:#dbe4ec; --muted:#8696a6; --line:#25303c;
  --wire:#5cc3e8; --wire-dim:#2b3a47; --label:#1f4f99; --label-ink:#e8f1ff;
  --add:#12301e; --add-bar:#3fbf6a; --flag:#f0a65a; --flag-bg:#33230f; --focus:#f06595; color-scheme:dark}}
:root[data-theme="dark"]{
  --bg:#0d1117; --panel:#121923; --ink:#dbe4ec; --muted:#8696a6; --line:#25303c;
  --wire:#5cc3e8; --wire-dim:#2b3a47; --label:#1f4f99; --label-ink:#e8f1ff;
  --add:#12301e; --add-bar:#3fbf6a; --flag:#f0a65a; --flag-bg:#33230f; --focus:#f06595; color-scheme:dark}
*{box-sizing:border-box}
body{background:var(--bg);color:var(--ink);font-family:var(--sans);font-size:14px;margin:0}
.wrap{padding-inline:16px;padding-block:20px 40px;max-width:1800px;margin:0 auto;display:flex;flex-direction:column;gap:20px}
header{display:flex;flex-wrap:wrap;gap:12px 24px;align-items:baseline;justify-content:space-between}
h1{font-size:20px;margin:0;font-weight:600;letter-spacing:-.01em;text-wrap:balance}
h1 small{font-family:var(--mono);font-size:12px;color:var(--muted);font-weight:400;margin-left:8px}
.sub{color:var(--muted);font-size:13px;margin-top:4px}
.stats{display:flex;gap:18px;font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums}
.stats b{color:var(--ink);font-size:16px;display:block;font-weight:600}
.legend{display:flex;flex-wrap:wrap;gap:14px;font-size:12px;color:var(--muted);align-items:center}
.sw{display:inline-block;width:12px;height:12px;border-radius:2px;vertical-align:-2px;margin-right:5px}
.files{display:flex;flex-wrap:wrap;gap:6px}
.files button{font:500 12px var(--mono);background:var(--panel);color:var(--ink);border:1px solid var(--line);border-radius:6px;padding:6px 10px;cursor:pointer}
.files button[aria-pressed="true"]{border-color:var(--wire);box-shadow:inset 0 0 0 1px var(--wire)}
.files button:focus-visible,.node:focus-visible,.more:focus-visible{outline:2px solid var(--focus);outline-offset:2px}
.files .n{color:var(--muted);margin-left:6px}
.file h2{font:600 14px var(--mono);margin:0 0 4px;word-break:break-all}
.file .fsub{font-size:12px;color:var(--muted);margin-bottom:10px}
.canvas{position:relative;overflow-x:auto;border:1px solid var(--line);border-radius:10px;
  background-color:var(--bg);background-image:radial-gradient(var(--line) 1px,transparent 1px);background-size:18px 18px}
.cols{position:relative;display:flex;gap:72px;padding:28px 28px 36px;width:max-content;align-items:flex-start;z-index:1}
.col{display:flex;flex-direction:column;gap:28px;width:min(440px,78vw)}
.colhead{font:600 10.5px var(--sans);letter-spacing:.09em;text-transform:uppercase;color:var(--muted)}
svg.wires{position:absolute;inset:0;pointer-events:none;z-index:0;overflow:visible}
.node{position:relative;background:var(--panel);border:1.5px solid var(--wire);border-radius:4px;cursor:pointer;transition:opacity .15s}
.node.unchanged{border-style:dashed;border-color:var(--wire-dim)}
.node.const{border-color:var(--wire-dim)}
.label{position:absolute;top:-13px;left:10px;background:var(--label);color:var(--label-ink);font:600 13px var(--mono);padding:2px 8px;border-radius:2px;max-width:calc(100% - 20px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.label .cls{opacity:.7;font-weight:400}
.meta{display:flex;flex-wrap:wrap;gap:6px;padding:16px 10px 6px;font:11px var(--mono);color:var(--muted);align-items:center}
.pill{border-radius:3px;padding:1px 6px;font-size:10.5px}
.pill.add{background:var(--add);color:var(--add-bar)}
.pill.flag{background:var(--flag-bg);color:var(--flag)}
pre{margin:0;font:12px/1.55 var(--mono);overflow:auto;max-height:290px;border-top:1px solid var(--line)}
.node.open pre{max-height:none}
pre .ln{display:flex;min-width:max-content}
pre .no{flex:0 0 3.4em;text-align:right;padding-right:10px;color:var(--muted);opacity:.6;user-select:none;font-variant-numeric:tabular-nums}
pre .tx{white-space:pre;padding-right:12px}
pre .ln.a{background:var(--add);box-shadow:inset 3px 0 0 var(--add-bar)}
pre .cm{color:var(--muted)}
.more{display:block;width:100%;border:0;border-top:1px solid var(--line);background:transparent;color:var(--wire);font:500 11px var(--sans);padding:6px;cursor:pointer}
.focusing .node{opacity:.28}
.focusing .node.hot{opacity:1}
.focusing .node.sel{border-color:var(--focus)}
path.w{fill:none;stroke:var(--wire);stroke-width:1.6;opacity:.75}
path.w.dim{stroke:var(--wire-dim)}
.focusing path.w{opacity:.12}
.focusing path.w.hot{opacity:1;stroke:var(--focus);stroke-width:2.2}
marker path{fill:var(--wire)}
.empty{color:var(--muted);padding:24px;font-size:13px}
@media (prefers-reduced-motion:reduce){.node{transition:none}}
</style>
<div class="wrap">
  <header>
    <div>
      <h1 id="title"></h1>
      <div class="sub" id="sub"></div>
    </div>
    <div class="stats" id="stats"></div>
  </header>
  <div class="legend">
    <span><i class="sw" style="border:1.5px solid var(--wire)"></i>changed function</span>
    <span><i class="sw" style="border:1.5px dashed var(--wire-dim)"></i>unchanged, called by or calling a change</span>
    <span><i class="sw" style="background:var(--add);box-shadow:inset 3px 0 0 var(--add-bar)"></i>added / edited line</span>
    <span>Tap a block to trace its callers and callees.</span>
  </div>
  <nav class="files" id="files" aria-label="Changed files"></nav>
  <main id="maps"></main>
</div>
<script>
const DATA = ${json};
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const m = DATA.meta;
$('#title').innerHTML = esc(m.repo) + '<small>' + esc(m.base) + ' … ' + esc(m.head) + (m.headSha ? ' @' + esc(m.headSha) : '') + '</small>';
$('#sub').textContent = m.subject || 'Each changed file split into its functions, ordered by who calls whom.';
const fnCount = DATA.files.reduce((a, f) => a + f.nodes.filter((n) => n.kind === 'fn' && n.changed).length, 0);
const flagCount = DATA.files.reduce((a, f) => a + f.nodes.reduce((b, n) => b + n.flags.length, 0), 0);
$('#stats').innerHTML = [['files', DATA.files.length], ['changed functions', fnCount], ['flags', flagCount]]
  .map(([k, v]) => '<div><b>' + v + '</b>' + k + '</div>').join('');

function codeHtml(f, n) {
  const lines = f.lines.slice(n.start - 1, n.end);
  const added = new Set(n.changedLines);
  return lines.map((t, i) => {
    const no = n.start + i;
    const isCm = /^\\s*(\\/\\/|#|\\*|\\/\\*)/.test(t);
    return '<div class="ln' + (added.has(no) ? ' a' : '') + '"><span class="no">' + no + '</span><span class="tx' + (isCm ? ' cm' : '') + '">' + (esc(t) || ' ') + '</span></div>';
  }).join('');
}

function renderFile(f, idx) {
  const sec = document.createElement('section');
  sec.className = 'file'; sec.id = 'file' + idx; sec.hidden = idx !== 0;
  const changed = f.nodes.filter((n) => n.changed && n.kind === 'fn').length;
  sec.innerHTML = '<h2>' + esc(f.file) + '</h2><div class="fsub">' + f.status + ' · ' + f.lang + ' · ' + changed + ' changed function' + (changed === 1 ? '' : 's') + ' · ' + f.edges.length + ' in-file call' + (f.edges.length === 1 ? '' : 's') + '</div>';
  const canvas = document.createElement('div'); canvas.className = 'canvas';
  if (!f.nodes.length) { canvas.innerHTML = '<div class="empty">No functions touched in this file (changes are top-level code, imports or markup).</div>'; sec.append(canvas); return sec; }
  const cols = document.createElement('div'); cols.className = 'cols';
  const tiers = Math.max(...f.nodes.map((n) => n.tier)) + 1;
  for (let t = 0; t < tiers; t++) {
    const col = document.createElement('div'); col.className = 'col';
    const inTier = f.nodes.filter((n) => n.tier === t).sort((a, b) => a.start - b.start);
    if (!inTier.length) continue;
    const allConst = inTier.every((n) => n.kind === 'const');
    col.innerHTML = '<div class="colhead">' + (allConst ? 'constants' : t === 0 ? 'entry points' : 'tier ' + (t + 1)) + '</div>';
    for (const n of inTier) {
      const el = document.createElement('div');
      el.className = 'node' + (n.changed ? '' : ' unchanged') + (n.kind === 'const' ? ' const' : '');
      el.dataset.id = n.id; el.tabIndex = 0;
      const pills = [];
      if (n.changed) pills.push('<span class="pill add">+' + n.added + '</span>');
      for (const fl of n.flags) pills.push('<span class="pill flag">' + esc(fl) + '</span>');
      const len = n.end - n.start + 1;
      el.innerHTML = '<div class="label">' + (n.cls ? '<span class="cls">' + esc(n.cls) + '.</span>' : '') + esc(n.name) + '</div>' +
        '<div class="meta"><span>L' + n.start + '–' + n.end + '</span>' + (n.kind === 'fn' ? '<span>· ' + (n.callers || 0) + ' in / ' + (n.callees || 0) + ' out</span>' : '') + pills.join('') + '</div>' +
        '<pre>' + codeHtml(f, n) + '</pre>' + (len > 18 ? '<button class="more" type="button">Show all ' + len + ' lines</button>' : '');
      col.append(el);
    }
    cols.append(col);
  }
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'wires');
  canvas.append(svg, cols); sec.append(canvas);

  const draw = () => {
    const box = canvas.getBoundingClientRect();
    const W = cols.scrollWidth, H = cols.scrollHeight;
    svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    const mk = 'arrow' + idx;
    let out = '<defs><marker id="' + mk + '" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z"/></marker></defs>';
    const pos = (id) => { const r = cols.querySelector('[data-id="' + id + '"]').getBoundingClientRect(); return { l: r.left - box.left + canvas.scrollLeft, r: r.right - box.left + canvas.scrollLeft, t: r.top - box.top, b: r.bottom - box.top }; };
    const fanOut = {}, fanIn = {};
    for (const e of f.edges) { (fanOut[e.from] ||= []).push(e); (fanIn[e.to] ||= []).push(e); }
    for (const e of f.edges) {
      const a = pos(e.from), b = pos(e.to);
      const oi = fanOut[e.from].indexOf(e), on = fanOut[e.from].length;
      const ii = fanIn[e.to].indexOf(e), inn = fanIn[e.to].length;
      const y1 = a.t + 24 + (Math.min(a.b - a.t - 40, 26 * on)) * (on > 1 ? oi / (on - 1) : 0);
      const y2 = b.t + 18 + Math.min(18, 8 * inn) * (inn > 1 ? ii / (inn - 1) : 0);
      let d;
      if (b.l > a.r) { const x1 = a.r, x2 = b.l - 2, dx = Math.max(30, (x2 - x1) / 2); d = 'M' + x1 + ',' + y1 + ' C' + (x1 + dx) + ',' + y1 + ' ' + (x2 - dx) + ',' + y2 + ' ' + x2 + ',' + y2; }
      else { const x1 = a.r, x2 = b.r + 2, bulge = Math.max(x1, x2) + 46; d = 'M' + x1 + ',' + y1 + ' C' + bulge + ',' + y1 + ' ' + bulge + ',' + y2 + ' ' + x2 + ',' + y2; }
      const tgt = f.nodes.find((n) => n.id === e.to);
      out += '<path class="w' + (tgt && tgt.changed ? '' : ' dim') + '" data-from="' + e.from + '" data-to="' + e.to + '" d="' + d + '" marker-end="url(#' + mk + ')"/>';
    }
    svg.innerHTML = out;
  };
  sec._draw = draw;
  let sel = null;
  cols.addEventListener('click', (ev) => {
    const more = ev.target.closest('.more');
    if (more) { const nd = more.closest('.node'); nd.classList.toggle('open'); more.textContent = nd.classList.contains('open') ? 'Collapse' : 'Show all ' + (nd.querySelectorAll('.ln').length) + ' lines'; draw(); applyFocus(); return; }
    const nd = ev.target.closest('.node');
    sel = nd && nd.dataset.id !== sel ? nd.dataset.id : null;
    applyFocus();
  });
  cols.addEventListener('keydown', (ev) => { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.classList.contains('node')) { ev.preventDefault(); ev.target.click(); } });
  function applyFocus() {
    canvas.classList.toggle('focusing', !!sel);
    canvas.querySelectorAll('.node').forEach((n) => n.classList.remove('hot', 'sel'));
    svg.querySelectorAll('path.w').forEach((p) => p.classList.remove('hot'));
    if (!sel) return;
    const hot = new Set([sel]);
    svg.querySelectorAll('path.w').forEach((p) => { if (p.dataset.from === sel || p.dataset.to === sel) { p.classList.add('hot'); hot.add(p.dataset.from); hot.add(p.dataset.to); } });
    hot.forEach((id) => canvas.querySelector('[data-id="' + id + '"]').classList.add('hot'));
    canvas.querySelector('[data-id="' + sel + '"]').classList.add('sel');
  }
  return sec;
}

const nav = $('#files'), maps = $('#maps');
DATA.files.forEach((f, i) => {
  const b = document.createElement('button');
  b.type = 'button'; b.setAttribute('aria-pressed', i === 0 ? 'true' : 'false');
  b.innerHTML = esc(f.file.split('/').pop()) + '<span class="n">' + f.nodes.filter((n) => n.changed && n.kind === 'fn').length + '</span>';
  b.title = f.file;
  b.onclick = () => { nav.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', 'false')); b.setAttribute('aria-pressed', 'true');
    maps.querySelectorAll('.file').forEach((s, j) => { s.hidden = j !== i; if (j === i) s._draw(); }); };
  nav.append(b);
  maps.append(renderFile(f, i));
});
if (!DATA.files.length) maps.innerHTML = '<div class="empty">No supported source files changed in this range.</div>';
const redraw = () => maps.querySelectorAll('.file').forEach((s) => { if (!s.hidden && s._draw) s._draw(); });
(document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(redraw);
addEventListener('resize', redraw); redraw();
</script>`;
  if (fragment) return body;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${body.replace('</style>', '</style></head><body>')}</body></html>`;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

module.exports = { render };
