'use client';

import { useState } from 'react';
import type { EditorDocument } from '../../domain/document';

export type ExportType = 'pdf' | 'png' | 'hwpx' | 'docx' | 'odt' | 'rtf' | 'markdown' | 'txt' | 'html' | 'source' | 'print';

async function withCleanOutput<T>(task: () => Promise<T>) {
  const root = globalThis.document.documentElement;
  root.classList.add('document-output-mode');
  dispatchEvent(new CustomEvent('our-ai-hangeul:render-all-pages', { detail: { enabled: true } }));
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  try { return await task(); }
  finally { root.classList.remove('document-output-mode'); dispatchEvent(new CustomEvent('our-ai-hangeul:render-all-pages', { detail: { enabled: false } })); }
}

export async function printWithOriginalImages() {
  dispatchEvent(new CustomEvent('our-ai-hangeul:render-all-pages', { detail: { enabled: true } }));
  dispatchEvent(new CustomEvent('our-ai-hangeul:image-output-mode', { detail: { original: true } }));
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  globalThis.print();
  setTimeout(() => { dispatchEvent(new CustomEvent('our-ai-hangeul:image-output-mode', { detail: { original: false } })); dispatchEvent(new CustomEvent('our-ai-hangeul:render-all-pages', { detail: { enabled: false } })); }, 500);
}

export function useDocumentExport(document: EditorDocument) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const runExport = async (type: ExportType) => {
    setMessage('');
    try {
      if (type === 'print') await printWithOriginalImages();
      else {
        const service = await import('../../infrastructure/export-service');
        if (type === 'source') { setBusy(true); setMessage('원본 이미지가 포함된 OAH 패키지를 준비하는 중…'); await service.exportSource(document); }
        else if (type === 'txt') service.exportText(document);
        else if (type === 'markdown') service.exportMarkdown(document);
        else if (type === 'rtf') service.exportRtf(document);
        else if (type === 'html') await withCleanOutput(async () => { const pages = Array.from(globalThis.document.querySelectorAll<HTMLElement>('.exportable-page .page-margin')).map((element) => element.innerHTML); service.exportHtml(document, pages); });
      else if (type === 'docx' || type === 'hwpx' || type === 'odt') {
        setBusy(true);
        setMessage(`${type.toUpperCase()} 문서를 준비하는 중…`);
        if (type === 'docx') await service.exportDocx(document);
        else if (type === 'hwpx') await service.exportHwpx(document);
        else await service.exportOdt(document);
        setMessage(`${type.toUpperCase()} 다운로드를 시작했습니다.`);
      } else {
        setBusy(true);
        const pages = Array.from(globalThis.document.querySelectorAll<HTMLElement>('.exportable-page'))
          .map((page) => ({ page, pageIndex: Number(page.dataset.pageIndex ?? 0) }));
        const transforms = pages.map((entry) => entry.page.style.transform);
        await withCleanOutput(async () => {
          pages.forEach(({ page }) => { page.style.transform = 'none'; });
          try { if (type === 'png') await service.exportPng(document, pages, setMessage); else await service.exportPdf(document, pages, setMessage); }
          finally { pages.forEach((entry, index) => { entry.page.style.transform = transforms[index]; }); }
        });
      }
      }
      if (!['pdf', 'docx', 'hwpx', 'odt', 'source'].includes(type)) setMessage('파일 저장을 시작했습니다.');
      else if (type === 'source') setMessage('무손실 원본 OAH 다운로드를 시작했습니다.');
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : '내보내기에 실패했습니다.'); }
    finally { setBusy(false); }
  };

  return { busy, message, clearMessage: () => setMessage(''), runExport };
}
