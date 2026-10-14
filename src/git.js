const { execFileSync } = require('child_process');

const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

// Returns [{ file, status, addedLines:Set<number>, removed:number }] for the new side of base...head
function changedFiles(cwd, base, head) {
  const range = head ? [`${base}...${head}`] : [base]; // no head = compare against working tree
  const diff = git(cwd, ['diff', '--unified=0', '--no-color', '--no-ext-diff', '--diff-filter=AMR', '-M', ...range]);
  const files = [];
  let cur = null;
  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git')) { cur = null; continue; }
    if (line.startsWith('new file mode')) { if (cur) cur.status = 'added'; continue; }
    if (line.startsWith('+++ ')) {
      const p = line.slice(4);
      if (p === '/dev/null') { cur = null; continue; }
      cur = { file: p.replace(/^b\//, ''), status: 'modified', addedLines: new Set(), removed: 0 };
      files.push(cur);
      continue;
    }
    const m = line.match(/^@@ -\d+(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (m && cur) {
      const removed = m[1] === undefined ? 1 : +m[1];
      const start = +m[2]; const count = m[3] === undefined ? 1 : +m[3];
      cur.removed += removed;
      for (let i = 0; i < count; i++) cur.addedLines.add(start + i);
      // pure deletion: mark the line after so the enclosing function still counts as changed
      if (count === 0 && removed > 0) cur.addedLines.add(Math.max(1, start));
    }
  }
  // fix status for new files (header order: diff, new file mode, ---, +++)
  const statusOut = git(cwd, ['diff', '--name-status', '--diff-filter=AMR', '-M', ...range]);
  const added = new Set(statusOut.split('\n').filter((l) => l.startsWith('A\t')).map((l) => l.slice(2)));
  for (const f of files) if (added.has(f.file)) f.status = 'added';
  return files;
}

function readAt(cwd, ref, file) {
  if (!ref) return require('fs').readFileSync(require('path').join(cwd, file), 'utf8');
  return git(cwd, ['show', `${ref}:${file}`]);
}

function meta(cwd, base, head) {
  const safe = (a) => { try { return git(cwd, a).trim(); } catch { return ''; } };
  return {
    repo: require('path').basename(safe(['rev-parse', '--show-toplevel']) || cwd),
    base, head: head || 'working tree',
    headSha: head ? safe(['rev-parse', '--short', head]) : '',
    subject: head ? safe(['log', '-1', '--format=%s', head]) : '',
  };
}

module.exports = { changedFiles, readAt, meta };
