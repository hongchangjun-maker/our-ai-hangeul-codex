import type { DocumentPage, EditorDocument } from '../domain/document';
import { pageGeometry } from '../domain/geometry';

const HWPX_MIME = 'application/hwp+zip';
const HWPUNIT_PER_MM = 7200 / 25.4;

// 본 제품은 한컴의 HWP 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.

type RichNode = { type?: string; text?: string; attrs?: Record<string, unknown>; content?: RichNode[] };

function xml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&apos;', '"': '&quot;' })[character] ?? character);
}

function nodeText(node: RichNode): string {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return '\n';
  return (node.content ?? []).map(nodeText).join('');
}

function blocks(page: DocumentPage) {
  const root = page.textFlow as RichNode;
  return (root.content ?? []).flatMap((node) => {
    if (node.type === 'bulletList' || node.type === 'orderedList') {
      return (node.content ?? []).map((child) => ({ text: `• ${nodeText(child).trim()}`, heading: false }));
    }
    const text = nodeText(node).trim();
    return [{ text, heading: node.type === 'heading' }];
  });
}

function unit(mm: number) {
  return Math.round(mm * HWPUNIT_PER_MM);
}

function sectionProperties(page: DocumentPage) {
  const geometry = pageGeometry(page);
  return `<hp:secPr id="" textDirection="HORIZONTAL" spaceColumns="1134" tabStop="8000" outlineShapeIDRef="0" memoShapeIDRef="0" textVerticalWidthHead="0" masterPageCnt="0"><hp:grid lineGrid="0" charGrid="0" wonggojiFormat="0"/><hp:startNum pageStartsOn="BOTH" page="0" pic="0" tbl="0" equation="0"/><hp:visibility hideFirstHeader="0" hideFirstFooter="0" hideFirstMasterPage="0" border="SHOW_ALL" fill="SHOW_ALL" hideFirstPageNum="0" hideFirstEmptyLine="0" showLineNumber="0"/><hp:lineNumberShape restartType="CONTINUOUS" countBy="0" distance="0" startNumber="0"/><hp:pagePr landscape="${page.orientation === 'portrait' ? 'NARROWLY' : 'WIDELY'}" width="${unit(geometry.widthMm)}" height="${unit(geometry.heightMm)}" gutterType="LEFT_ONLY"><hp:margin header="${unit(Math.min(15, page.margins.top))}" footer="${unit(Math.min(15, page.margins.bottom))}" gutter="0" left="${unit(page.margins.left)}" right="${unit(page.margins.right)}" top="${unit(page.margins.top)}" bottom="${unit(page.margins.bottom)}"/></hp:pagePr><hp:footnotePr><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/><hp:noteLine length="14692344" type="SOLID" width="0.12 mm" color="#000000"/><hp:noteSpacing betweenNotes="283" belowLine="567" aboveLine="850"/><hp:numbering type="CONTINUOUS" newNum="1"/></hp:footnotePr><hp:endnotePr><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/><hp:noteLine length="14692344" type="SOLID" width="0.12 mm" color="#000000"/><hp:noteSpacing betweenNotes="0" belowLine="567" aboveLine="850"/><hp:numbering type="CONTINUOUS" newNum="1"/></hp:endnotePr><hp:pageBorderFill type="BOTH" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER"><hp:offset left="0" right="0" top="0" bottom="0"/></hp:pageBorderFill></hp:secPr>`;
}

function sectionXml(page: DocumentPage) {
  const content = blocks(page);
  const first = content[0] ?? { text: '', heading: false };
  const paragraph = (block: { text: string; heading: boolean }, id: number, section = false) => `<hp:p id="${id}" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">${section ? `<hp:run charPrIDRef="0">${sectionProperties(page)}<hp:t/></hp:run>` : ''}<hp:run charPrIDRef="${block.heading ? 1 : 0}"><hp:t>${xml(block.text)}</hp:t></hp:run></hp:p>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core">${paragraph(first, 0, true)}${content.slice(1).map((block, index) => paragraph(block, index + 1)).join('')}</hs:sec>`;
}

function headerXml(sectionCount: number) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" version="1.4.0" secCnt="${sectionCount}"><hh:beginNum page="1" footnote="1" endnote="1" pic="1" tbl="1" equation="1"/><hh:refList><hh:fontfaces itemCnt="7"><hh:fontface lang="HANGUL" fontCnt="1"><hh:font id="0" face="함초롬바탕" type="TTF" isEmbedded="0"/></hh:fontface><hh:fontface lang="LATIN" fontCnt="1"><hh:font id="0" face="Arial" type="TTF" isEmbedded="0"/></hh:fontface><hh:fontface lang="HANJA" fontCnt="1"><hh:font id="0" face="함초롬바탕" type="TTF" isEmbedded="0"/></hh:fontface><hh:fontface lang="JAPANESE" fontCnt="1"><hh:font id="0" face="함초롬바탕" type="TTF" isEmbedded="0"/></hh:fontface><hh:fontface lang="OTHER" fontCnt="1"><hh:font id="0" face="함초롬바탕" type="TTF" isEmbedded="0"/></hh:fontface><hh:fontface lang="SYMBOL" fontCnt="1"><hh:font id="0" face="함초롬바탕" type="TTF" isEmbedded="0"/></hh:fontface><hh:fontface lang="USER" fontCnt="1"><hh:font id="0" face="함초롬바탕" type="TTF" isEmbedded="0"/></hh:fontface></hh:fontfaces><hh:borderFills itemCnt="2"><hh:borderFill id="0" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0"><hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/><hh:leftBorder type="NONE" width="0.1 mm" color="#000000"/><hh:rightBorder type="NONE" width="0.1 mm" color="#000000"/><hh:topBorder type="NONE" width="0.1 mm" color="#000000"/><hh:bottomBorder type="NONE" width="0.1 mm" color="#000000"/><hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/></hh:borderFill><hh:borderFill id="1" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0"><hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/><hh:leftBorder type="NONE" width="0.1 mm" color="#000000"/><hh:rightBorder type="NONE" width="0.1 mm" color="#000000"/><hh:topBorder type="NONE" width="0.1 mm" color="#000000"/><hh:bottomBorder type="NONE" width="0.1 mm" color="#000000"/><hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/></hh:borderFill></hh:borderFills><hh:charProperties itemCnt="2"><hh:charPr id="0" height="1000" textColor="#000000" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="0"><hh:fontRef hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/><hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/><hh:spacing hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/><hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/><hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/><hh:underline type="NONE" shape="SOLID" color="#000000"/><hh:strikeout shape="NONE" color="#000000"/><hh:outline type="NONE"/><hh:shadow type="NONE" color="#B2B2B2" offsetX="10" offsetY="10"/></hh:charPr><hh:charPr id="1" height="1600" textColor="#173B32" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="0"><hh:fontRef hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/><hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/><hh:spacing hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/><hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/><hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/><hh:bold/><hh:underline type="NONE" shape="SOLID" color="#000000"/><hh:strikeout shape="NONE" color="#000000"/><hh:outline type="NONE"/><hh:shadow type="NONE" color="#B2B2B2" offsetX="10" offsetY="10"/></hh:charPr></hh:charProperties><hh:tabProperties itemCnt="1"><hh:tabPr id="0" autoTabLeft="0" autoTabRight="0"/></hh:tabProperties><hh:numberings itemCnt="0"/><hh:bullets itemCnt="0"/><hh:paraProperties itemCnt="1"><hh:paraPr id="0" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1"><hh:align horizontal="JUSTIFY" vertical="BASELINE"/><hh:heading type="NONE" idRef="0" level="0"/><hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="BREAK_WORD" widowOrphan="0" keepWithNext="0" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/><hh:autoSpacing eAsianEng="0" eAsianNum="0"/><hh:switch/></hh:paraPr></hh:paraProperties><hh:styles itemCnt="1"><hh:style id="0" type="PARA" name="바탕글" engName="Normal" paraPrIDRef="0" charPrIDRef="0" nextStyleIDRef="0" langID="1042" lockForm="0"/></hh:styles><hh:memoProperties itemCnt="0"/><hh:trackChanges itemCnt="0"/><hh:trackChangeAuthors itemCnt="0"/></hh:refList><hh:compatibleDocument targetProgram="HWP201X"><hh:layoutCompatibility/></hh:compatibleDocument><hh:docOption><hh:linkinfo path="" pageInherit="0" footnoteInherit="0"/></hh:docOption></hh:head>`;
}

export async function buildHwpxBlob(document: EditorDocument) {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const sections = document.pages.map((page, index) => ({ id: `section${index}`, path: `Contents/section${index}.xml`, xml: sectionXml(page) }));
  const manifestItems = sections.map((section) => `<opf:item id="${section.id}" href="${section.id}.xml" media-type="application/xml"/>`).join('');
  const spine = sections.map((section) => `<opf:itemref idref="${section.id}"/>`).join('');
  const content = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><opf:package xmlns:opf="http://www.idpf.org/2007/opf" xmlns:dc="http://purl.org/dc/elements/1.1/" version="3.0" unique-identifier="uuid_id"><opf:metadata><dc:title>${xml(document.name)}</dc:title><dc:language>ko</dc:language><dc:identifier id="uuid_id">${xml(document.id)}</dc:identifier></opf:metadata><opf:manifest><opf:item id="header" href="header.xml" media-type="application/xml"/><opf:item id="settings" href="settings.xml" media-type="application/xml"/>${manifestItems}</opf:manifest><opf:spine>${spine}</opf:spine></opf:package>`;
  const container = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf"><ocf:rootfiles><ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/></ocf:rootfiles></ocf:container>';
  const entries = ['Contents/content.hpf', 'Contents/header.xml', 'Contents/settings.xml', ...sections.map((section) => section.path), 'version.xml'];
  const manifest = `<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3"><manifest:file-entry manifest:full-path="/" manifest:media-type="${HWPX_MIME}"/>${entries.map((path) => `<manifest:file-entry manifest:full-path="${path}" manifest:media-type="application/xml"/>`).join('')}</manifest:manifest>`;
  zip.file('mimetype', HWPX_MIME, { compression: 'STORE' });
  zip.file('META-INF/container.xml', container);
  zip.file('META-INF/manifest.xml', manifest);
  zip.file('Contents/content.hpf', content);
  zip.file('Contents/header.xml', headerXml(sections.length));
  zip.file('Contents/settings.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><hs:settings xmlns:hs="http://www.hancom.co.kr/hwpml/2011/settings"><hs:caretPosition listIDRef="0" paraIDRef="0" pos="0"/></hs:settings>');
  sections.forEach((section) => zip.file(section.path, section.xml));
  zip.file('Preview/PrvText.txt', document.pages.flatMap((page) => blocks(page).map((block) => block.text)).join('\n'));
  zip.file('version.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><hv:HCFVersion xmlns:hv="http://www.hancom.co.kr/hwpml/2011/app" targetApplication="WORDPROC" major="5" minor="1" micro="0" buildNumber="1" os="1" xmlVersion="1.4" application="우리의 AI 한글" appVersion="1.1.0"/>');
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}
