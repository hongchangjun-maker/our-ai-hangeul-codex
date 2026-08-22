'use client';

import { useState } from 'react';
import type { EditorDocument } from '../../domain/document';
import { exportDocx, exportHtml, exportHwpx, exportMarkdown, exportOdt, exportPdf, exportRtf, exportSource, exportText } from '../../infrastructure/export-service';

export type ExportType = 'pdf' | 'hwpx' | 'docx' | 'odt' | 'rtf' | 'markdown' | 'txt' | 'html' | 'source' | 'print';

export function useDocumentExport(document: EditorDocument) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const runExport = async (type: ExportType) => {
    setMessage('');
    try {
      if (type === 'source') exportSource(document);
      else if (type === 'txt') exportText(document);
      else if (type === 'markdown') exportMarkdown(document);
      else if (type === 'rtf') exportRtf(document);
      else if (type === 'html') { const pages = Array.from(globalThis.document.querySelectorAll<HTMLElement>('.exportable-page .page-margin')).map((element) => element.innerHTML); exportHtml(document, pages); }
      else if (type === 'print') globalThis.print();
      else if (type === 'docx' || type === 'hwpx' || type === 'odt') {
        setBusy(true);
        setMessage(`${type.toUpperCase()} 문서를 준비하는 중…`);
        if (type === 'docx') await exportDocx(document);
        else if (type === 'hwpx') await exportHwpx(document);
        else await exportOdt(document);
        setMessage(`${type.toUpperCase()} 저장이 완료되었습니다.`);
      } else {
        setBusy(true);
        const pages = Array.from(globalThis.document.querySelectorAll<HTMLElement>('.exportable-page'))
          .map((page) => ({ page, pageIndex: Number(page.dataset.pageIndex ?? 0) }));
        const transforms = pages.map((entry) => entry.page.style.transform);
        pages.forEach(({ page }) => { page.style.transform = 'none'; });
        try { await exportPdf(document, pages, setMessage); } finally { pages.forEach((entry, index) => { entry.page.style.transform = transforms[index]; }); }
      }
      if (!['pdf', 'docx', 'hwpx', 'odt'].includes(type)) setMessage('파일 저장을 시작했습니다.');
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : '내보내기에 실패했습니다.'); }
    finally { setBusy(false); }
  };

  return { busy, message, clearMessage: () => setMessage(''), runExport };
}
