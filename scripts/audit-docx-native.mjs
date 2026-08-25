import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';

const source = path.resolve(process.argv[2] || '');
const reportPath = process.argv[3] ? path.resolve(process.argv[3]) : null;
if (!source) throw new Error('Usage: node audit-docx-native.mjs <docx> [report.json]');
const zip = await JSZip.loadAsync(await readFile(source));
const xml = await zip.file('word/document.xml')?.async('text');
if (!xml) throw new Error('word/document.xml is missing.');
const count = (pattern) => (xml.match(pattern) || []).length;
const decodeXml = (value) => value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const textBoxText = (xml.match(/<wps:txbx\b[\s\S]*?<\/wps:txbx>|<v:textbox\b[\s\S]*?<\/v:textbox>/g) || [])
  .map((segment) => [...segment.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)].map((match) => decodeXml(match[1])).join(''))
  .join('\n');
const report = {
  source,
  tables: count(/<w:tbl[ >]/g),
  floatingAnchors: count(/<wp:anchor[ >]/g),
  imageBlips: count(/<a:blip[ >]/g),
  textBoxes: count(/<(?:wps:wsp|v:textbox)[ >]/g),
  editableTextBoxText: textBoxText.includes('편집 가능한 네이티브 글상자'),
  mediaParts: Object.keys(zip.files).filter((name) => /^word\/media\//.test(name)).length,
};
report.passed = report.tables > 0 && report.floatingAnchors >= 2 && report.imageBlips > 0 && report.textBoxes > 0 && report.editableTextBoxText && report.mediaParts > 0;
if (reportPath) await writeFile(reportPath, JSON.stringify(report, null, 2));
process.stdout.write(`${JSON.stringify(report)}\n`);
if (!report.passed) process.exitCode = 2;
