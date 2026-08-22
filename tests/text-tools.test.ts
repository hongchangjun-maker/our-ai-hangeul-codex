import { describe, expect, it } from 'vitest';
import { createDocument } from '../app/domain/document';
import { applyKoreanCorrections, findDocumentText, inspectKorean, replaceDocumentText } from '../app/domain/text-tools';

describe('whole-document text tools', () => {
  it('finds and replaces body, header, footer and text-box text', () => {
    const document = createDocument(); document.pages[0].header = '찾기 머리말'; document.pages[0].footer = '찾기 꼬리말';
    document.pages[0].textFlow = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '찾기 본문' }] }] };
    document.pages[0].objects.push({ id: 'box', type: 'text-box', x: 0, y: 0, width: 100, height: 40, rotation: 0, zIndex: 1, locked: false, opacity: 1, text: '찾기 글상자' });
    expect(findDocumentText(document, '찾기')[0].count).toBe(4);
    expect(JSON.stringify(replaceDocumentText(document, '찾기', '교체'))).not.toContain('찾기');
  });

  it('applies deterministic Korean spacing and spelling rules', () => {
    const document = createDocument(); document.pages[0].textFlow = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '몇일 안되면 할수 없어요  .' }] }] };
    expect(inspectKorean(document).length).toBeGreaterThan(2);
    expect(JSON.stringify(applyKoreanCorrections(document))).toContain('며칠 안 되면 할 수 없어요.');
  });
});
