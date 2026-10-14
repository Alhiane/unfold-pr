// Cross-file links between changed files.
//
// Rule: only link when the target is unambiguous. A missing arrow is better than a wrong one.
//
// TS/JS: imports are resolved to another changed file by relative path, or by path suffix for
//        aliases such as `@/services/auth` (no tsconfig or bundler config needed). A call to an
//        imported name, or to a member of an imported binding (`authService.logOut()`), links to
//        the function of that name in the target file, if exactly one exists.
// PHP:   classes are indexed by fully qualified name (namespace + class). A receiver's class comes
//        from `use` statements or the current namespace, and its type from typed or promoted
//        properties (`$this->auth->x()`), typed parameters (`$svc->x()`), `Foo::x()` and `new Foo`.

const JS_LANGS = new Set(['javascript', 'typescript', 'tsx', 'vue']);
const JS_EXT = /\.(d\.ts|tsx?|jsx?|mjs|cjs|vue)$/;
const ALIAS = /^(@|~|#|@@)\//;

const posix = {
  dirname: (p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : ''),
  normalize(p) {
    const out = [];
    for (const part of p.split('/')) {
      if (!part || part === '.') continue;
      if (part === '..') out.pop(); else out.push(part);
    }
    return out.join('/');
  },
};

const moduleKey = (file) => file.replace(JS_EXT, '').replace(/\/index$/, '');

function resolveImport(fromFile, source, jsFiles) {
  let key = null;
  if (source.startsWith('.')) key = posix.normalize(`${posix.dirname(fromFile)}/${source}`).replace(JS_EXT, '').replace(/\/index$/, '');
  if (key !== null) return jsFiles.get(key) || null;
  if (ALIAS.test(source)) {
    const rest = source.replace(ALIAS, '').replace(JS_EXT, '').replace(/\/index$/, '');
    const hits = [...jsFiles.entries()].filter(([k]) => k === rest || k.endsWith(`/${rest}`));
    return hits.length === 1 ? hits[0][1] : null;
  }
  return null; // bare package import
}

/**
 * @param {Array<{ file: string, parsed: object }>} entries  every changed file with its extract() result
 * @returns {Array<{ from: { file, id }, to: { file, id } }>}  links between parsed function ids
 */
function crossFileLinks(entries) {
  const links = new Map();
  const add = (fromFile, fromId, toFile, toFn) => {
    if (!toFn || fromFile === toFile) return;
    links.set(`${fromFile}#${fromId}>${toFile}#${toFn.id}`, { from: { file: fromFile, id: fromId }, to: { file: toFile, id: toFn.id } });
  };
  const only = (list) => (list.length === 1 ? list[0] : null);

  // ---- TS / JS / Vue ----
  const js = entries.filter((e) => JS_LANGS.has(e.parsed.lang) || e.file.endsWith('.vue'));
  const jsFiles = new Map(js.map((e) => [moduleKey(e.file), e]));
  for (const e of js) {
    const imports = new Map();
    for (const im of e.parsed.module?.imports || []) {
      if (!im.source) continue;
      const target = resolveImport(e.file, im.source, jsFiles);
      if (target && target !== e) imports.set(im.local, { target, imported: im.imported });
    }
    if (!imports.size) continue;
    for (const fn of e.parsed.functions) {
      for (const name of fn.calls) {
        const im = imports.get(name);
        if (!im || im.imported === '*') continue;
        const want = im.imported === 'default' ? name : im.imported;
        add(e.file, fn.id, im.target.file, only(im.target.parsed.functions.filter((t) => t.name === want)));
      }
      for (const q of fn.qcalls || []) {
        const [kind, rest] = q.split(':');
        const [root, method] = rest.split('\u0001');
        if (kind !== 'id' && kind !== 'new') continue;
        const im = imports.get(root);
        if (!im) continue;
        const fns = im.target.parsed.functions;
        if (kind === 'new') add(e.file, fn.id, im.target.file, only(fns.filter((t) => t.cls === (im.imported === 'default' || im.imported === '*' ? root : im.imported) && t.name === 'constructor')));
        else add(e.file, fn.id, im.target.file, only(fns.filter((t) => t.name === method)));
      }
    }
  }

  // ---- PHP ----
  const php = entries.filter((e) => e.parsed.lang === 'php');
  const classes = new Map(); // FQN -> { entry, cls }
  for (const e of php) {
    const ns = e.parsed.module?.namespace;
    for (const cls of new Set(e.parsed.functions.map((f) => f.cls).filter(Boolean))) classes.set(ns ? `${ns}\\${cls}` : cls, { entry: e, cls });
  }
  for (const e of php) {
    const mod = e.parsed.module || {};
    const uses = new Map((mod.imports || []).filter((i) => i.fqn).map((i) => [i.local, i.fqn]));
    const fqnOf = (name) => {
      if (!name) return null;
      if (name.includes('\\')) { const [head, ...tail] = name.split('\\'); return uses.has(head) ? [uses.get(head), ...tail].join('\\') : name; }
      if (uses.has(name)) return uses.get(name);
      return mod.namespace ? `${mod.namespace}\\${name}` : name;
    };
    const method = (typeName, name) => {
      const c = classes.get(fqnOf(typeName));
      if (!c) return null;
      return { file: c.entry.file, fn: only(c.entry.parsed.functions.filter((t) => t.cls === c.cls && t.name === name)) };
    };
    for (const fn of e.parsed.functions) {
      const props = (mod.propTypes || {})[fn.cls] || {};
      for (const q of fn.qcalls || []) {
        const [kind, rest] = q.split(/:(.*)/s);
        const [root, name] = rest.split('\u0001');
        const type = kind === 'prop' ? props[root] : kind === 'var' ? (fn.paramTypes || {})[root] : (kind === 'cls' || kind === 'new') ? root : null;
        const hit = method(type, name);
        if (hit) add(e.file, fn.id, hit.file, hit.fn);
      }
    }
  }
  return [...links.values()];
}

module.exports = { crossFileLinks, resolveImport, moduleKey };
