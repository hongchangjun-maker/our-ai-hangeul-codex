import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';

const chunks = path.resolve('dist/client/_next/static/chunks');
const files = (await readdir(chunks)).filter((name) => name.endsWith('.js'));
const editorName = files.find((name) => /^EditorApp-.*\.js$/.test(name));
if (!editorName) throw new Error('EditorApp client chunk was not emitted.');
const editorPath = path.join(chunks, editorName);
const rawBytes = (await stat(editorPath)).size;
const gzipBytes = gzipSync(readFileSync(editorPath)).byteLength;
const maximumRawBytes = Number(process.env.EDITOR_CHUNK_BUDGET_BYTES || 600 * 1024);
const chunkSizes = await Promise.all(files.map(async (name) => ({ name, bytes: (await stat(path.join(chunks, name))).size })));
const lazyChunks = chunkSizes.filter((item) => item.name !== editorName && item.bytes > 15 * 1024).length;
const report = { editorChunk: editorName, rawBytes, gzipBytes, maximumRawBytes, lazyChunks, passed: rawBytes <= maximumRawBytes && lazyChunks >= 4 };
process.stdout.write(`${JSON.stringify(report)}\n`);
if (!report.passed) process.exitCode = 2;
