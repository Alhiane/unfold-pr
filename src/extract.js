// Language-agnostic, file-scoped function + call extraction using tree-sitter.
const Parser = require('web-tree-sitter');

// Where grammar .wasm files come from. Node default: the tree-sitter-wasms package on disk.
// Other hosts (browser extension, workers) call configure({ grammarUrl }) before analyze().
let grammarUrl = (lang) => {
  const path = require('path');
  return path.join(path.dirname(require.resolve('tree-sitter-wasms/package.json')), 'out', `tree-sitter-${lang}.wasm`);
};
let initOptions;
function configure(opts = {}) {
  if (opts.grammarUrl) grammarUrl = opts.grammarUrl;
  if (opts.initOptions) initOptions = opts.initOptions; // e.g. { locateFile } for tree-sitter.wasm
}

// extension -> grammar name
const LANGS = {
  '.js': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript', '.jsx': 'javascript',
  '.ts': 'typescript', '.tsx': 'tsx', '.vue': 'vue',
  '.py': 'python', '.php': 'php', '.go': 'go', '.rb': 'ruby', '.rs': 'rust',
  '.java': 'java', '.kt': 'kotlin', '.cs': 'c_sharp', '.swift': 'swift',
  '.sh': 'bash', '.bash': 'bash',
  '.c': 'c', '.h': 'c', '.cpp': 'cpp', '.cc': 'cpp', '.hpp': 'cpp',
};

const FUNC_TYPES = new Set([
  'function_declaration', 'function_definition', 'method_definition', 'method_declaration',
  'constructor_declaration', 'function_item', 'method', 'singleton_method',
  'generator_function_declaration', 'local_function_statement',
]);
// value nodes that turn `const name = <value>` / `name: <value>` into a function
const FUNC_VALUES = new Set(['arrow_function', 'function_expression', 'function', 'generator_function']);
const CALL_TYPES = new Set([
  'call_expression', 'call', 'function_call_expression', 'member_call_expression',
  'scoped_call_expression', 'nullsafe_member_call_expression', 'method_invocation',
  'invocation_expression', 'new_expression', 'object_creation_expression',
  'command', // bash: `helper "$1"`
]);

let ready = null;
const langCache = {};

async function getParser(lang) {
  if (!ready) ready = Parser.init(initOptions);
  await ready;
  if (!langCache[lang]) langCache[lang] = await Parser.Language.load(grammarUrl(lang));
  const p = new Parser();
  p.setLanguage(langCache[lang]);
  return p;
}

function langFor(file) {
  const m = /\.[^./\\]+$/.exec(file);
  return (m && LANGS[m[0].toLowerCase()]) || null;
}

const isIdent = (n) => /identifier|^name$|^constant$|property_identifier|field_identifier/.test(n.type);

// Rightmost "name" of a callee expression: foo(), a.b.foo(), $this->foo(), Foo::bar(), pkg.Foo()
function calleeName(n) {
  if (!n) return null;
  if (isIdent(n)) return n.text;
  for (const f of ['property', 'field', 'attribute', 'name', 'method']) {
    const c = n.childForFieldName(f);
    if (c) return calleeName(c);
  }
  const kids = n.namedChildren;
  for (let i = kids.length - 1; i >= 0; i--) {
    if (kids[i].type === 'arguments' || kids[i].type === 'argument_list' || kids[i].type === 'type_arguments') continue;
    const r = calleeName(kids[i]);
    if (r) return r;
  }
  return null;
}

function callTarget(node) {
  const fn = node.childForFieldName('function') || node.childForFieldName('constructor') || node.childForFieldName('type');
  if (fn) return calleeName(fn);
  const name = node.childForFieldName('name') || node.childForFieldName('method');
  if (name) return name.text;
  return calleeName(node.namedChildren[0]);
}

function funcName(node) {
  const n = node.childForFieldName('name');
  if (n) return n.text;
  const p = node.parent;
  if (p && FUNC_VALUES.has(node.type)) {
    const k = p.childForFieldName('name') || p.childForFieldName('key') || p.childForFieldName('left');
    if (k) return k.text;
  }
  return null;
}

function enclosingClass(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (/class|impl_item|interface|trait|struct|module/.test(p.type)) {
      const n = p.childForFieldName('name') || p.childForFieldName('type');
      if (n) return n.text;
    }
  }
  return null;
}

// ---- Top-level code ----------------------------------------------------------------------
// Statements outside any function or class: script bodies, `if __name__ == "__main__"`, route
// registrations, Express app setup. Each gets its own calls so a "top-level code" block can show
// what it calls. Declarations (functions, classes, imports, constants) are skipped: they have
// their own blocks or none.

const SKIP_TOP = new Set([
  'function_declaration', 'function_definition', 'generator_function_declaration', 'decorated_definition',
  'class_declaration', 'class_definition', 'abstract_class_declaration', 'interface_declaration', 'trait_declaration',
  'enum_declaration', 'type_alias_declaration', 'import_statement', 'import_from_statement', 'future_import_statement',
  'namespace_use_declaration', 'php_tag', 'text', 'comment', 'package_clause', 'import_declaration',
  'function_item', 'impl_item', 'struct_item', 'use_declaration', 'method_declaration', 'type_declaration',
]);

function topLevelStatements(root, lineOffset) {
  const out = [];
  const isNamedFuncValue = (n) => FUNC_VALUES.has(n.type) && n.parent && /variable_declarator|pair|assignment/.test(n.parent.type);
  const declaresOnly = (n) => {
    // const f = () => {}, const LIMIT = 3, export function x() {}: not "code that runs"
    let d = n.type === 'export_statement' ? (n.childForFieldName('declaration') || n.namedChildren.find((c) => /declaration|definition/.test(c.type))) : n;
    if (!d) return false;
    if (SKIP_TOP.has(d.type)) return true;
    if (/lexical_declaration|variable_declaration|const_declaration/.test(d.type)) {
      return d.namedChildren.filter((c) => c.type === 'variable_declarator').every((v) => {
        const name = v.childForFieldName('name'), value = v.childForFieldName('value');
        if (value && FUNC_VALUES.has(value.type)) return true;
        if (name && /^[A-Z][A-Z0-9_]+$/.test(name.text)) return true;
        if (value && value.type === 'call_expression' && value.childForFieldName('function')?.text === 'require') return true;
        return false;
      });
    }
    return false;
  };
  const collect = (n, calls, qcalls) => {
    if (FUNC_TYPES.has(n.type) || (isNamedFuncValue(n) && funcName(n))) return; // has its own block
    if (CALL_TYPES.has(n.type)) {
      const t = callTarget(n); if (t) calls.add(t);
      const q = qualifiedCall(n); if (q) qcalls.add(q);
    }
    if (n.type === 'identifier' && n.parent && /arguments|argument_list/.test(n.parent.type)) calls.add(n.text);
    for (const c of n.namedChildren) collect(c, calls, qcalls);
  };
  const visit = (parent) => {
    for (const n of parent.namedChildren) {
      if (n.type === 'namespace_definition') { const body = n.childForFieldName('body'); if (body) visit(body); continue; }
      if (SKIP_TOP.has(n.type) || declaresOnly(n)) continue;
      const calls = new Set(), qcalls = new Set();
      collect(n, calls, qcalls);
      // Only code that does something: calls something, or is control flow. `let cache = null`,
      // `module.exports = { a }` or an exported object of methods is not a block of its own.
      const controlFlow = /^(if|for|for_in|while|do|try|switch|with)_statement$|^if_statement$/.test(n.type);
      if (!calls.size && !qcalls.size && !controlFlow) continue;
      out.push({ start: n.startPosition.row + 1 + lineOffset, end: n.endPosition.row + 1 + lineOffset, calls, qcalls });
    }
  };
  visit(root);
  return out;
}

// ---- Cross-file facts (used by src/links.js) --------------------------------------------

const strip = (s) => s.replace(/^\\+/, '');

// A call's receiver, in a form links.js can resolve across files:
//   id:<name>      TS/JS  authService.logOut()      → imported binding
//   prop:<name>    PHP    $this->auth->logOut()      → typed property of the class
//   var:<name>     PHP    $svc->logOut()             → typed parameter
//   cls:<Name>     PHP    AuthService::make()        → class name
//   new:<Name>     any    new Token() / Token()      → constructor
// Returned as "<kind>:<root>\u0001<method>".
function qualifiedCall(node) {
  const Q = (kind, root, name) => (root && name ? `${kind}:${root}\u0001${name}` : null);
  if (node.type === 'call_expression') {
    const fn = node.childForFieldName('function');
    if (fn && fn.type === 'member_expression') {
      let obj = fn.childForFieldName('object');
      while (obj && obj.type === 'member_expression') obj = obj.childForFieldName('object');
      const prop = fn.childForFieldName('property');
      if (obj && obj.type === 'identifier') return Q('id', obj.text, prop && prop.text);
    }
    return null;
  }
  if (node.type === 'member_call_expression' || node.type === 'nullsafe_member_call_expression') {
    const obj = node.childForFieldName('object');
    const name = node.childForFieldName('name');
    if (!obj || !name) return null;
    if (obj.type === 'member_access_expression' || obj.type === 'nullsafe_member_access_expression') {
      const base = obj.childForFieldName('object');
      const prop = obj.childForFieldName('name');
      if (base && base.text === '$this' && prop) return Q('prop', prop.text, name.text);
    }
    if (obj.type === 'variable_name' && obj.text !== '$this') return Q('var', obj.text.replace(/^\$/, ''), name.text);
    return null;
  }
  if (node.type === 'scoped_call_expression') {
    const scope = node.childForFieldName('scope');
    const name = node.childForFieldName('name');
    if (scope && name && !/^(self|static|parent)$/.test(scope.text)) return Q('cls', strip(scope.text), name.text);
    return null;
  }
  if (node.type === 'object_creation_expression' || node.type === 'new_expression') {
    const t = node.namedChildren.find((c) => /^(name|qualified_name|identifier)$/.test(c.type)) || node.childForFieldName('constructor');
    if (t) return Q('new', strip(t.text), '__construct');
  }
  return null;
}

// PHP parameter types: function f(AuthService $svc) → { svc: 'AuthService' }
function paramTypes(fnNode) {
  const params = fnNode.childForFieldName('parameters');
  const out = {};
  if (!params) return out;
  for (const p of params.namedChildren) {
    if (!/simple_parameter|property_promotion_parameter/.test(p.type)) continue;
    const type = p.childForFieldName('type');
    const name = p.childForFieldName('name');
    const named = type && (type.type === 'named_type' ? type : type.namedChildren.find((c) => c.type === 'named_type'));
    if (named && name) out[name.text.replace(/^\$/, '')] = strip(named.text);
  }
  return out;
}

// Imports, PHP namespace and per-class property types for one file.
function moduleInfo(root, lang) {
  const info = { imports: [], namespace: null, propTypes: {} };
  const str = (n) => { const f = n && n.descendantsOfType('string_fragment')[0]; return f ? f.text : null; };
  (function walk(n) {
    // ES modules: import a, { b as c }, * as ns from 'src'
    if (n.type === 'import_statement') {
      const source = str(n.childForFieldName('source') || n.namedChildren.find((c) => c.type === 'string'));
      const clause = n.namedChildren.find((c) => c.type === 'import_clause');
      if (source && clause) for (const c of clause.namedChildren) {
        if (c.type === 'identifier') info.imports.push({ local: c.text, imported: 'default', source });
        else if (c.type === 'namespace_import') { const id = c.namedChildren[0]; if (id) info.imports.push({ local: id.text, imported: '*', source }); }
        else if (c.type === 'named_imports') for (const sp of c.namedChildren.filter((x) => x.type === 'import_specifier')) {
          const name = sp.childForFieldName('name'); const alias = sp.childForFieldName('alias');
          if (name) info.imports.push({ local: (alias || name).text, imported: name.text, source });
        }
      }
    }
    // CommonJS: const x = require('src'), const { a, b: c } = require('src')
    if (n.type === 'variable_declarator') {
      const value = n.childForFieldName('value'); const name = n.childForFieldName('name');
      if (value && value.type === 'call_expression' && value.childForFieldName('function')?.text === 'require') {
        const source = str(value.childForFieldName('arguments'));
        if (source && name && name.type === 'identifier') info.imports.push({ local: name.text, imported: '*', source });
        if (source && name && name.type === 'object_pattern') for (const p of name.namedChildren) {
          if (p.type === 'shorthand_property_identifier_pattern') info.imports.push({ local: p.text, imported: p.text, source });
          if (p.type === 'pair_pattern') { const k = p.childForFieldName('key'); const v = p.childForFieldName('value'); if (k && v) info.imports.push({ local: v.text, imported: k.text, source }); }
        }
      }
    }
    // PHP
    if (n.type === 'namespace_definition') { const nm = n.childForFieldName('name'); if (nm) info.namespace = nm.text; }
    if (n.type === 'namespace_use_declaration') {
      const group = n.namedChildren.find((c) => c.type === 'namespace_use_group');
      if (group) {
        const prefix = n.namedChildren.find((c) => c.type === 'namespace_name');
        for (const g of group.namedChildren) {
          const nm = g.namedChildren.find((c) => c.type === 'namespace_name' || c.type === 'name');
          const alias = g.namedChildren.find((c) => c.type === 'namespace_aliasing_clause');
          if (!nm) continue;
          const fqn = `${prefix ? prefix.text + '\\' : ''}${nm.text}`;
          info.imports.push({ local: alias ? alias.namedChildren[0].text : fqn.split('\\').pop(), fqn: strip(fqn) });
        }
      } else for (const cl of n.namedChildren.filter((c) => c.type === 'namespace_use_clause')) {
        const q = cl.namedChildren.find((c) => c.type === 'qualified_name' || c.type === 'name');
        const alias = cl.namedChildren.find((c) => c.type === 'namespace_aliasing_clause') || (cl.childForFieldName('alias'));
        if (!q) continue;
        const fqn = strip(q.text);
        const aliasName = alias ? (alias.type === 'name' ? alias.text : alias.namedChildren[0]?.text) : null;
        info.imports.push({ local: aliasName || fqn.split('\\').pop(), fqn });
      }
    }
    if (n.type === 'class_declaration' && lang === 'php') {
      const cls = n.childForFieldName('name')?.text;
      if (cls) {
        const props = (info.propTypes[cls] ||= {});
        for (const pd of n.descendantsOfType('property_declaration')) {
          const type = pd.childForFieldName('type');
          const named = type && (type.type === 'named_type' ? type : type.namedChildren.find((c) => c.type === 'named_type'));
          if (!named) continue;
          for (const el of pd.descendantsOfType('property_element')) { const v = el.namedChildren.find((c) => c.type === 'variable_name'); if (v) props[v.text.replace(/^\$/, '')] = strip(named.text); }
        }
        for (const pp of n.descendantsOfType('property_promotion_parameter')) {
          const type = pp.childForFieldName('type'); const name = pp.childForFieldName('name');
          const named = type && (type.type === 'named_type' ? type : type.namedChildren.find((c) => c.type === 'named_type'));
          if (named && name) props[name.text.replace(/^\$/, '')] = strip(named.text);
        }
      }
    }
    for (const c of n.namedChildren) walk(c);
  })(root);
  return info;
}

/**
 * Returns { functions: [{id,name,cls,start,end,calls:Set<name>}], lang }
 * Lines are 1-based, inclusive.
 */
async function extract(file, source) {
  let lang = langFor(file);
  if (!lang) return null;
  let lineOffset = 0;
  if (lang === 'vue') {
    // Parse the <script> block as TypeScript, keeping original line numbers.
    var template = (source.match(/<template\b[^>]*>([\s\S]*)<\/template>/) || [])[1] || '';
    const m = source.match(/<script\b[^>]*>([\s\S]*?)<\/script>/);
    if (!m) return { lang, functions: [], consts: [], src: source, template };
    lineOffset = source.slice(0, m.index + m[0].indexOf('>') + 1).split('\n').length - 1;
    source = m[1];
    lang = 'typescript';
  }
  const parser = await getParser(lang);
  const tree = parser.parse(source);
  const functions = [];

  // `stack` holds every enclosing named function, innermost last. A call is credited to all of them,
  // so calls made inside a nested helper still show up on the outer function that renders it.
  const credit = (stack, name) => { for (const f of stack) f.calls.add(name); };
  const creditQ = (stack, q) => { for (const f of stack) f.qcalls.add(q); };
  (function walk(node, stack) {
    let inner = stack;
    const isFunc = FUNC_TYPES.has(node.type) ||
      (FUNC_VALUES.has(node.type) && node.parent && /variable_declarator|pair|assignment|public_field_definition|field_definition|property/.test(node.parent.type));
    if (isFunc) {
      const name = funcName(node);
      if (name) {
        // For `const x = () => {}` span the whole declaration so the block reads naturally.
        let span = node;
        if (FUNC_VALUES.has(node.type)) {
          span = node.parent;
          if (span.parent && /lexical_declaration|variable_declaration/.test(span.parent.type)) span = span.parent;
          if (span.parent && span.parent.type === 'export_statement') span = span.parent;
        } else if (node.parent && node.parent.type === 'export_statement') span = node.parent;
        // Python decorators live on a wrapping `decorated_definition`: include them in the block
        // and count `@name` as a reference from the decorated function.
        const decorated = node.parent && node.parent.type === 'decorated_definition' ? node.parent : null;
        if (decorated) span = decorated;
        // include leading doc comment
        let start = span.startPosition.row;
        let prev = span.previousNamedSibling;
        while (prev && prev.type === 'comment' && prev.endPosition.row >= start - 1) { start = prev.startPosition.row; prev = prev.previousNamedSibling; }
        const fn = {
          id: `f${functions.length}`, name, cls: enclosingClass(node),
          start: start + 1 + lineOffset, end: span.endPosition.row + 1 + lineOffset,
          calls: new Set(), qcalls: new Set(), paramTypes: paramTypes(node),
        };
        if (decorated) for (const d of decorated.namedChildren.filter((c) => c.type === 'decorator')) {
          const t = calleeName(d.namedChildren[0]);
          if (t) fn.calls.add(t);
        }
        functions.push(fn);
        inner = [...stack, fn];
      }
    } else if (CALL_TYPES.has(node.type) && stack.length) {
      const t = callTarget(node);
      if (t) credit(stack, t);
      const q = qualifiedCall(node);
      if (q) creditQ(stack, q);
    } else if (node.type === 'decorator' && stack.length) {
      // TS/JS decorators sit inside the decorated member; a bare `@name` is a reference.
      const t = calleeName(node.namedChildren[0]);
      if (t) credit(stack, t);
    }
    // identifiers passed as callbacks (arr.map(normalize)) count as references
    if (stack.length && node.type === 'identifier' && node.parent && /arguments|argument_list/.test(node.parent.type)) credit(stack, node.text);
    for (const c of node.namedChildren) walk(c, inner);
  })(tree.rootNode, []);

  // Top-level constants that functions reference (LINE_PATTERN, LEVEL_ORDER in the reel)
  const consts = [];
  for (const n of tree.rootNode.namedChildren) {
    let decl = n.type === 'export_statement' ? n.namedChildren.find((c) => /declaration/.test(c.type)) : n;
    if (!decl || !/lexical_declaration|variable_declaration|const_declaration|const_item/.test(decl.type)) continue;
    for (const d of decl.namedChildren) {
      const nm = d.childForFieldName && d.childForFieldName('name');
      const val = d.childForFieldName && d.childForFieldName('value');
      if (nm && /^[A-Z][A-Z0-9_]+$/.test(nm.text) && !(val && FUNC_VALUES.has(val.type))) {
        consts.push({ name: nm.text, start: n.startPosition.row + 1 + lineOffset, end: n.endPosition.row + 1 + lineOffset });
      }
    }
  }
  return { lang, functions, consts, src: tree.rootNode.text, module: moduleInfo(tree.rootNode, lang), topLevel: topLevelStatements(tree.rootNode, lineOffset), template: typeof template === 'string' ? template : '' };
}

module.exports = { extract, langFor, configure, LANGS };
