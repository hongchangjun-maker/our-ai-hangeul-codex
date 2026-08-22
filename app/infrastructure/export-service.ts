import type { EditorDocument, RichTextDocument } from '../domain/document';

function safeName(name: string) {
  return (name.trim() || '새 문서').replace(/[\\/:*?"<>|]/g, '_');
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = globalThis.document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function textFromNode(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const value = node as { type?: string; text?: string; content?: unknown[] };
  if (value.type === 'text') return value.text ?? '';
  const content = value.content?.map(textFromNode).join('') ?? '';
  return ['paragraph', 'heading', 'listItem', 'tableRow'].includes(value.type ?? '') ? `${content}\n` : content;
}

export function documentToText(document: EditorDocument) {
  return document.pages.map((page, index) => `${document.pages.length > 1 ? `[${index + 1}쪽]\n` : ''}${textFromNode(page.textFlow)}`.trim()).join('\n\n');
}

export function exportSource(document: EditorDocument) {
  download(new Blob([JSON.stringify(document, null, 2)], { type: 'application/json' }), `${safeName(document.name)}.oah.json`);
}

export function exportText(document: EditorDocument) {
  download(new Blob([documentToText(document)], { type: 'text/plain;charset=utf-8' }), `${safeName(document.name)}.txt`);
}

export function exportHtml(document: EditorDocument, pageHtml: string[]) {
  const pages = pageHtml.map((html, index) => `<section class="page" aria-label="${index + 1}쪽">${html}</section>`).join('\n');
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${escapeHtml(document.name)}</title><style>body{margin:0;background:#eee;font-family:"Noto Sans KR","Malgun Gothic",sans-serif}.page{box-sizing:border-box;width:210mm;min-height:297mm;margin:10mm auto;padding:24mm 22mm;background:white;line-height:1.7}@media print{body{background:white}.page{margin:0;page-break-after:always}}</style></head><body>${pages}</body></html>`;
  download(new Blob([html], { type: 'text/html;charset=utf-8' }), `${safeName(document.name)}.html`);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
}

export async function exportPdf(document: EditorDocument, pages: HTMLElement[], onProgress?: (message: string) => void) {
  if (!pages.length) throw new Error('내보낼 페이지를 찾지 못했습니다.');
  onProgress?.('PDF 페이지를 준비하는 중…');
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  for (let index = 0; index < pages.length; index += 1) {
    onProgress?.(`${index + 1}/${pages.length}쪽을 변환하는 중…`);
    const canvas = await html2canvas(pages[index], { scale: 1.6, useCORS: true, backgroundColor: '#ffffff', logging: false });
    if (index > 0) pdf.addPage('a4', 'portrait');
    const image = canvas.toDataURL('image/jpeg', 0.92);
    const ratio = Math.min(210 / canvas.width, 297 / canvas.height);
    const width = canvas.width * ratio;
    const height = canvas.height * ratio;
    pdf.addImage(image, 'JPEG', (210 - width) / 2, 0, width, height, undefined, 'FAST');
  }
  pdf.save(`${safeName(document.name)}.pdf`);
  onProgress?.('PDF 저장이 완료되었습니다.');
}

export function richTextToPlainText(value: RichTextDocument) {
  return textFromNode(value).trim();
}
