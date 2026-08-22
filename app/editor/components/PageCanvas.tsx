'use client';

/* eslint-disable @next/next/no-img-element -- user-owned local Blob URLs cannot use the Next image optimizer */

import type { Editor } from '@tiptap/react';
import { EditorContent } from '@tiptap/react';
import { FileText, Plus } from 'lucide-react';
import { Fragment, useEffect, useRef, useState } from 'react';
import type { DocumentObject, DocumentPage, EditorDocument } from '../../domain/document';
import { mmToPx, pageGeometry } from '../../domain/geometry';
import { getAsset } from '../../infrastructure/local-storage';
import { ObjectLayer } from './ObjectLayer';

function applyMarks(content: React.ReactNode, marks: unknown[] = []) {
  return marks.reduce<React.ReactNode>((node, raw, index) => {
    const mark = raw as { type?: string; attrs?: Record<string, unknown> };
    if (mark.type === 'bold') return <strong key={index}>{node}</strong>;
    if (mark.type === 'italic') return <em key={index}>{node}</em>;
    if (mark.type === 'underline') return <u key={index}>{node}</u>;
    if (mark.type === 'strike') return <s key={index}>{node}</s>;
    if (mark.type === 'highlight') return <mark key={index} style={{ backgroundColor: String(mark.attrs?.color || '#fff3a3') }}>{node}</mark>;
    if (mark.type === 'textStyle') return <span key={index} style={{ color: mark.attrs?.color as string, fontFamily: mark.attrs?.fontFamily as string, fontSize: mark.attrs?.fontSize as string }}>{node}</span>;
    return node;
  }, content);
}

function RichNode({ node, nodeKey }: { node: unknown; nodeKey: string | number }) {
  if (!node || typeof node !== 'object') return null;
  const value = node as { type?: string; text?: string; content?: unknown[]; marks?: unknown[]; attrs?: Record<string, unknown> };
  if (value.type === 'text') return <Fragment key={nodeKey}>{applyMarks(value.text || '', value.marks)}</Fragment>;
  if (value.type === 'hardBreak') return <br key={nodeKey} />;
  const keyText = String(nodeKey);
  const children = value.content?.map((child, index) => <RichNode key={`${keyText}-${index}`} nodeKey={`${keyText}-${index}`} node={child} />);
  const blockStyle = { textAlign: value.attrs?.textAlign as React.CSSProperties['textAlign'], lineHeight: value.attrs?.lineHeight as string };
  if (value.type === 'heading') { const level = Number(value.attrs?.level || 1); if (level === 1) return <h1 key={nodeKey} style={blockStyle}>{children}</h1>; if (level === 2) return <h2 key={nodeKey} style={blockStyle}>{children}</h2>; return <h3 key={nodeKey} style={blockStyle}>{children}</h3>; }
  if (value.type === 'paragraph') return <p key={nodeKey} style={blockStyle}>{children || <br />}</p>;
  if (value.type === 'bulletList') return <ul key={nodeKey}>{children}</ul>;
  if (value.type === 'orderedList') return <ol key={nodeKey}>{children}</ol>;
  if (value.type === 'listItem') return <li key={nodeKey}>{children}</li>;
  if (value.type === 'blockquote') return <blockquote key={nodeKey}>{children}</blockquote>;
  if (value.type === 'table') return <table key={nodeKey}><tbody>{children}</tbody></table>;
  if (value.type === 'tableRow') return <tr key={nodeKey}>{children}</tr>;
  if (value.type === 'tableHeader') return <th key={nodeKey} colSpan={Number(value.attrs?.colspan || 1)}>{children}</th>;
  if (value.type === 'tableCell') return <td key={nodeKey} colSpan={Number(value.attrs?.colspan || 1)}>{children}</td>;
  return <Fragment key={nodeKey}>{children}</Fragment>;
}

export function ReadOnlyRichText({ page }: { page: DocumentPage }) {
  return <div className="document-editor read-only">{page.textFlow.content?.map((node, index) => <RichNode key={index} nodeKey={index} node={node} />)}</div>;
}

function ReadOnlyObject({ object }: { object: DocumentObject }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let active = true; let objectUrl: string | undefined;
    if (object.assetId) getAsset(object.assetId).then((asset) => { if (!asset || !active) return; objectUrl = URL.createObjectURL(asset.blob); setUrl(objectUrl); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [object.assetId]);
  return <div className="document-object read-only-object" style={{ left: object.x, top: object.y, width: object.width, height: object.height, transform: `rotate(${object.rotation}deg)`, zIndex: object.zIndex, opacity: object.opacity, borderRadius: object.style?.borderRadius, boxShadow: object.style?.shadow ? '0 10px 26px rgba(23,45,38,.18)' : undefined }}>{object.type === 'image' && url ? <img src={url} alt="" /> : <div className="attachment-card"><span><FileText size={22} /></span><span><strong>{object.name || '첨부 파일'}</strong><small>문서 첨부</small></span></div>}</div>;
}

export function PageCanvas({
  document,
  editor,
  currentPage,
  zoom,
  pageNavOpen,
  selectedObjectId,
  onCurrentPage,
  onAddPage,
  onSelectObject,
  onFiles,
  onGestureStart,
  onGestureEnd,
  onObjectChange,
}: {
  document: EditorDocument;
  editor: Editor | null;
  currentPage: number;
  zoom: number;
  pageNavOpen: boolean;
  selectedObjectId: string | null;
  onCurrentPage: (page: number) => void;
  onAddPage: () => void;
  onSelectObject: (id: string | null) => void;
  onFiles: (files: FileList, page: number, position: { x: number; y: number }) => void;
  onGestureStart: () => void;
  onGestureEnd: () => void;
  onObjectChange: (id: string, patch: Partial<DocumentObject>) => void;
}) {
  const scale = zoom / 100;
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasWidth, setCanvasWidth] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const measure = () => setCanvasWidth(canvas.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  const fittedScale = (page: DocumentPage) => {
    if (!canvasWidth || canvasWidth > 720) return scale;
    const availableWidth = Math.max(220, canvasWidth - 28);
    return Math.max(0.25, Math.min(scale, availableWidth / pageGeometry(page).widthPx));
  };
  const visibleScale = fittedScale(document.pages[currentPage]);

  return <>
    {pageNavOpen && <aside className="page-nav" aria-label="페이지 탐색"><div className="panel-title"><strong>쪽</strong><button type="button" onClick={onAddPage} aria-label="페이지 추가"><Plus size={15} /></button></div><div className="page-thumb-list">{document.pages.map((page, index) => <button className={index === currentPage ? 'page-thumb selected' : 'page-thumb'} type="button" key={page.id} onClick={() => onCurrentPage(index)}><span className="thumb-paper"><i /><i /><i /></span><small>{index + 1}</small></button>)}</div></aside>}
    <div className="canvas-area" ref={canvasRef} onDragOver={(event) => event.preventDefault()}>
      <div className="canvas-tools"><span>{document.pages[currentPage].preset} · {document.pages[currentPage].orientation === 'portrait' ? '세로' : '가로'}</span><span>{visibleScale < scale ? `화면 맞춤 ${Math.round(visibleScale * 100)}%` : `${zoom}%`}</span></div>
      <div className="page-stack">
        {document.pages.map((page, index) => {
          const geometry = pageGeometry(page);
          const pageScale = fittedScale(page);
          const padding = `${mmToPx(page.margins.top)}px ${mmToPx(page.margins.right)}px ${mmToPx(page.margins.bottom)}px ${mmToPx(page.margins.left)}px`;
          return <div className={index === currentPage ? 'paper-wrapper current' : 'paper-wrapper'} key={page.id} style={{ width: geometry.widthPx * pageScale, height: geometry.heightPx * pageScale }} onClick={() => onCurrentPage(index)}>
            <article className="paper exportable-page" data-page-index={index} aria-label={`A4 문서 ${index + 1}쪽`} style={{ width: geometry.widthPx, minHeight: geometry.heightPx, transform: `scale(${pageScale})`, background: page.background }} onDrop={(event) => { event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); onFiles(event.dataTransfer.files, index, { x: (event.clientX - rect.left) / pageScale, y: (event.clientY - rect.top) / pageScale }); }}>
              <div className="page-margin" style={{ width: geometry.widthPx, minHeight: geometry.heightPx, padding }}>
                {index === currentPage ? <EditorContent editor={editor} /> : <ReadOnlyRichText page={page} />}
              </div>
              {index === currentPage ? <ObjectLayer objects={page.objects} pageWidth={geometry.widthPx} pageHeight={geometry.heightPx} selectedId={selectedObjectId} snapEnabled={document.settings.snapEnabled} guidesEnabled={document.settings.guidesEnabled} onSelect={onSelectObject} onGestureStart={onGestureStart} onGestureEnd={onGestureEnd} onChange={onObjectChange} /> : <div className="object-layer read-only-layer">{page.objects.map((object) => <ReadOnlyObject key={object.id} object={object} />)}</div>}
              <span className="page-number">{index + 1}</span>
            </article>
          </div>;
        })}
      </div>
    </div>
  </>;
}
