import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';

function argumentsMap(values) {
  const result = new Map();
  for (let index = 0; index < values.length; index += 2) result.set(values[index], values[index + 1]);
  return result;
}

const args = argumentsMap(process.argv.slice(2));
const url = args.get('--url');
const docxPath = args.get('--docx');
const outputDir = path.resolve(args.get('--output') || 'tmp/document-fidelity/browser');
const expectedPages = Number(args.get('--expected-pages') || 0);
const executablePath = args.get('--edge') || process.env.QA_EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
if (!url || !docxPath) throw new Error('Usage: node capture-document-pages.mjs --url <url> --docx <file> --output <dir> [--expected-pages 221]');

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext({ viewport: { width: 1920, height: 1400 }, deviceScaleFactor: 1, locale: 'ko-KR' });
const page = await context.newPage();
const startedAt = Date.now();
try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 120_000 });
  const input = page.locator('input[type="file"][accept*=".docx"]').first();
  await input.setInputFiles(path.resolve(docxPath));
  await page.waitForSelector('article.paper', { timeout: 180_000 });
  await page.waitForFunction((minimum) => document.querySelectorAll('article.paper').length >= minimum, expectedPages || 2, { timeout: 180_000 });
  const papers = page.locator('article.paper');
  const pageCount = await papers.count();
  if (expectedPages && pageCount !== expectedPages) throw new Error(`Expected ${expectedPages} pages, found ${pageCount}.`);
  await page.addStyleTag({ content: `
    .active-frame-size,.page-activate-overlay,.remote-selection,.selection-box,.resize-handle,.floating-object-toolbar,.toast,.recovery-banner{display:none!important}
    .paper{box-shadow:none!important;outline:0!important;border:0!important}
    .document-editor{caret-color:transparent!important}
  ` });
  await page.evaluate(() => document.fonts?.ready);
  const pages = [];
  for (let index = 0; index < pageCount; index += 1) {
    const paper = papers.nth(index);
    await paper.scrollIntoViewIfNeeded();
    await paper.click({ position: { x: 6, y: 6 }, force: true });
    await page.waitForFunction((target) => document.querySelector(`article.paper[data-page-index="${target}"]`)?.getAttribute('aria-current') === 'page', index, { timeout: 15_000 });
    await page.evaluate(() => document.fonts?.ready);
    await page.waitForTimeout(30);
    const target = path.join(outputDir, `page-${String(index + 1).padStart(3, '0')}.png`);
    const box = await paper.boundingBox();
    if (!box) throw new Error(`Page ${index + 1} has no bounding box.`);
    await paper.screenshot({ path: target, animations: 'disabled' });
    pages.push({ page: index + 1, width: Math.round(box.width), height: Math.round(box.height) });
  }
  const report = { url, docxPath: path.resolve(docxPath), pageCount, elapsedMs: Date.now() - startedAt, pages };
  await writeFile(path.join(outputDir, 'capture.json'), JSON.stringify(report, null, 2));
  process.stdout.write(`${JSON.stringify(report)}\n`);
} finally {
  await browser.close();
}
