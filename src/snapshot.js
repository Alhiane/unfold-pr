// Screenshots each file's map from the generated HTML, so the code-block view
// can be embedded as images where scripts can't run (PR comments).
const fs = require('fs');
const path = require('path');

const CANDIDATES = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
];

function findChrome() {
  for (const p of CANDIDATES) if (p && fs.existsSync(p)) return p;
  // Playwright-managed browsers
  for (const root of ['/opt/pw-browsers', path.join(require('os').homedir(), '.cache/ms-playwright')]) {
    if (!fs.existsSync(root)) continue;
    for (const d of fs.readdirSync(root).filter((x) => x.startsWith('chromium')).sort().reverse()) {
      const p = path.join(root, d, 'chrome-linux', 'chrome');
      if (fs.existsSync(p)) return p;
    }
  }
  throw new Error('No Chrome/Chromium found. Set CHROME_PATH to a Chrome binary.');
}

const SNAP_CSS = `
  .wrap > header, .legend, .files { display: none !important }
  .wrap { padding: 0 !important; gap: 0 !important; max-width: none !important }
  .file h2, .file .fsub { padding: 14px 18px 0; margin: 0 }
  .file .fsub { padding-bottom: 12px }
  .canvas { border-radius: 0 !important; border-width: 1px 0 0 !important; overflow: visible !important }
  .col { width: 400px !important }
  .more { display: none !important }
  .node.open pre, .node pre { overflow: hidden !important }
  pre .ln { min-width: 0 !important }
  pre .tx { white-space: pre-wrap !important; overflow-wrap: anywhere; min-width: 0; flex: 1 }
  .clip { font: 500 11px var(--mono); color: var(--muted); padding: 4px 10px 6px; border-top: 1px dashed var(--line) }
`;

/**
 * @param {string} htmlFile path to a full (non-fragment) unfold HTML page
 * @param {string} outDir   directory for <index>.png files
 * @param {{theme?: 'dark'|'light', maxLines?: number, scale?: number}} opts
 * @returns {Promise<Array<{file: string, png: string, width: number, height: number}>>}
 */
async function snapshot(htmlFile, outDir, { theme = 'dark', maxLines = 45, scale = 2 } = {}) {
  const puppeteer = require('puppeteer-core');
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: scale });
    await page.goto('file://' + path.resolve(htmlFile), { waitUntil: 'networkidle0', timeout: 60000 }).catch(() => {});
    await page.evaluate((css, t, maxLines) => {
      document.documentElement.dataset.theme = t;
      const s = document.createElement('style'); s.textContent = css; document.head.append(s);
      // Show each function in full up to maxLines; clip longer ones with a note.
      document.querySelectorAll('.node').forEach((n) => {
        const lines = [...n.querySelectorAll('.ln')];
        n.classList.add('open');
        if (lines.length > maxLines) {
          lines.slice(maxLines).forEach((l) => l.remove());
          const c = document.createElement('div'); c.className = 'clip';
          c.textContent = `… ${lines.length - maxLines} more lines in the full map`;
          n.append(c);
        }
      });
    }, SNAP_CSS, theme, maxLines);
    const count = await page.$$eval('#files button', (b) => b.length);
    const shots = [];
    for (let i = 0; i < count; i++) {
      const info = await page.evaluate((i) => {
        document.querySelectorAll('#files button')[i].click();
        const sec = document.getElementById('file' + i);
        sec._draw && sec._draw();
        const cols = sec.querySelector('.cols');
        return { file: sec.querySelector('h2').textContent, width: cols ? cols.scrollWidth : 600 };
      }, i);
      await page.setViewport({ width: Math.max(800, Math.ceil(info.width) + 2), height: 1000, deviceScaleFactor: scale });
      await page.evaluate((i) => { const s = document.getElementById('file' + i); s._draw && s._draw(); }, i);
      await new Promise((r) => setTimeout(r, 120));
      const el = await page.$('#file' + i);
      const box = await el.boundingBox();
      const png = path.join(outDir, `${i}.png`);
      await el.screenshot({ path: png });
      shots.push({ file: info.file, png, width: Math.round(box.width), height: Math.round(box.height) });
    }
    return shots;
  } finally {
    await browser.close();
  }
}

module.exports = { snapshot, findChrome };
