import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

function argumentsMap(values) {
  const result = new Map();
  for (let index = 0; index < values.length; index += 2) result.set(values[index], values[index + 1]);
  return result;
}

const args = argumentsMap(process.argv.slice(2));
const source = path.resolve(args.get('--pdf') || '');
const output = path.resolve(args.get('--output') || 'tmp/pdf-pages');
const dpi = Number(args.get('--dpi') || 96);
if (!source) throw new Error('Usage: node render-pdf-pages.mjs --pdf <pdf> --output <dir> [--dpi 96]');

await mkdir(output, { recursive: true });
const loadingTask = getDocument({ data: new Uint8Array(await readFile(source)), useWorkerFetch: false, isEvalSupported: false });
const document = await loadingTask.promise;
const pages = [];
try {
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const viewport = page.getViewport({ scale: dpi / 72 });
    const width = Math.ceil(viewport.width); const height = Math.ceil(viewport.height);
    const canvas = createCanvas(width, height); const context = canvas.getContext('2d');
    await page.render({ canvasContext: context, viewport }).promise;
    await writeFile(path.join(output, `page-${String(pageNumber).padStart(3, '0')}.png`), canvas.toBuffer('image/png'));
    pages.push({ page: pageNumber, width, height });
    page.cleanup();
  }
} finally {
  await document.cleanup();
  await loadingTask.destroy();
}
await writeFile(path.join(output, 'render.json'), JSON.stringify({ source, dpi, pageCount: pages.length, pages }, null, 2));
process.stdout.write(`${JSON.stringify({ pageCount: pages.length, output })}\n`);
