import { readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { readFileSync, writeFileSync } from 'node:fs';

function argumentsMap(values) {
  const result = new Map();
  for (let index = 0; index < values.length; index += 2) result.set(values[index], values[index + 1]);
  return result;
}

const args = argumentsMap(process.argv.slice(2));
const referenceDir = path.resolve(args.get('--reference') || '');
const candidateDir = path.resolve(args.get('--candidate') || '');
const outputDir = path.resolve(args.get('--output') || 'tmp/document-fidelity/diff');
const threshold = Number(args.get('--threshold') || 0.18);
const allowedRatio = Number(args.get('--allowed-ratio') || 0.2);
const maxDiffImages = Number(args.get('--max-diff-images') || 20);
if (!referenceDir || !candidateDir) throw new Error('Usage: node pixel-diff-pages.mjs --reference <dir> --candidate <dir> --output <dir>');

const pageFiles = async (directory) => (await readdir(directory)).filter((name) => /^page-\d+\.png$/i.test(name)).sort();
const referenceFiles = await pageFiles(referenceDir);
const candidateFiles = await pageFiles(candidateDir);
if (referenceFiles.length !== candidateFiles.length) throw new Error(`Page count mismatch: reference=${referenceFiles.length}, candidate=${candidateFiles.length}`);
await mkdir(outputDir, { recursive: true });

const results = [];
const diffCandidates = [];
const croppedData = (image, width, height) => {
  if (image.width === width && image.height === height) return image.data;
  const output = Buffer.alloc(width * height * 4);
  for (let row = 0; row < height; row += 1) image.data.copy(output, row * width * 4, row * image.width * 4, row * image.width * 4 + width * 4);
  return output;
};
for (let index = 0; index < referenceFiles.length; index += 1) {
  const reference = PNG.sync.read(readFileSync(path.join(referenceDir, referenceFiles[index])));
  const candidate = PNG.sync.read(readFileSync(path.join(candidateDir, candidateFiles[index])));
  const widthDifference = Math.abs(reference.width - candidate.width); const heightDifference = Math.abs(reference.height - candidate.height);
  if (widthDifference > 2 || heightDifference > 2) {
    results.push({ page: index + 1, mismatchRatio: 1, mismatchPixels: null, widthMismatch: `${reference.width}x${reference.height} vs ${candidate.width}x${candidate.height}` });
    continue;
  }
  const width = Math.min(reference.width, candidate.width); const height = Math.min(reference.height, candidate.height);
  const diff = new PNG({ width, height });
  const mismatchPixels = pixelmatch(croppedData(reference, width, height), croppedData(candidate, width, height), diff.data, width, height, { threshold, includeAA: false, diffColor: [220, 38, 38], alpha: 0.65 });
  const mismatchRatio = mismatchPixels / (width * height);
  const result = { page: index + 1, mismatchRatio, mismatchPixels, width, height, sizeAdjusted: widthDifference > 0 || heightDifference > 0 };
  results.push(result);
  if (mismatchRatio > allowedRatio) diffCandidates.push({ ...result, diff });
}

for (const item of diffCandidates.sort((left, right) => right.mismatchRatio - left.mismatchRatio).slice(0, maxDiffImages)) {
  writeFileSync(path.join(outputDir, `diff-page-${String(item.page).padStart(3, '0')}.png`), PNG.sync.write(item.diff));
}
const ratios = results.map((item) => item.mismatchRatio);
const report = {
  pageCount: results.length,
  threshold,
  allowedRatio,
  passed: results.every((item) => item.mismatchRatio <= allowedRatio),
  averageMismatchRatio: ratios.reduce((sum, value) => sum + value, 0) / Math.max(1, ratios.length),
  maximumMismatchRatio: Math.max(0, ...ratios),
  failedPages: results.filter((item) => item.mismatchRatio > allowedRatio).map((item) => item.page),
  pages: results,
};
await writeFile(path.join(outputDir, 'pixel-diff-report.json'), JSON.stringify(report, null, 2));
await writeFile(path.join(outputDir, 'pixel-diff-summary.html'), `<!doctype html><meta charset="utf-8"><title>문서 픽셀 비교</title><style>body{font:14px system-ui;margin:32px}table{border-collapse:collapse}td,th{padding:7px 10px;border:1px solid #ddd}.fail{background:#fee2e2}</style><h1>문서 픽셀 비교</h1><p>${report.pageCount}쪽 · 평균 ${(report.averageMismatchRatio * 100).toFixed(2)}% · 최대 ${(report.maximumMismatchRatio * 100).toFixed(2)}%</p><table><tr><th>쪽</th><th>불일치</th><th>결과</th></tr>${results.map((item) => `<tr class="${item.mismatchRatio > allowedRatio ? 'fail' : ''}"><td>${item.page}</td><td>${(item.mismatchRatio * 100).toFixed(2)}%</td><td>${item.mismatchRatio <= allowedRatio ? '통과' : '검토'}</td></tr>`).join('')}</table>`);
process.stdout.write(`${JSON.stringify({ ...report, pages: undefined })}\n`);
if (!report.passed) process.exitCode = 2;
