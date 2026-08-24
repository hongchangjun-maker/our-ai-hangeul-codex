import type { DocumentPage, EditorDocument } from '../domain/document';
import { pageGeometry } from '../domain/geometry';
import { getAsset } from './local-storage';

const HWPX_MIME = 'application/hwp+zip';
const HWPX_PACKAGE_MIME = 'application/hwpml-package+xml';
const HWPX_VERSION_NAMESPACE = 'http://www.hancom.co.kr/hwpml/2011/version';
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
  const paragraph = (block: { text: string; heading: boolean }, id: number, section = false) => `<hp:p id="${id}" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">${section ? `<hp:run charPrIDRef="0">${sectionProperties(page)}<hp:t/></hp:run>` : ''}<hp:run charPrIDRef="${block.heading ? 1 : 0}"><hp:t>${xml(block.text)}</hp:t></hp:run></hp:p>`;
  const table = (node: RichNode, id: number) => {
    const rows = (node.content ?? []).filter((item) => item.type === 'tableRow'); const columns = Math.max(1, ...rows.map((row) => row.content?.length ?? 0));
    return `<hp:tbl id="${id}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="1" rowCnt="${rows.length}" colCnt="${columns}" cellSpacing="0" borderFillIDRef="1"><hp:sz width="${unit(160)}" widthRelTo="ABSOLUTE" height="${unit(Math.max(10, rows.length * 10))}" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:inMargin left="141" right="141" top="141" bottom="141"/>${rows.map((row, rowIndex) => `<hp:tr>${(row.content ?? []).map((cell, colIndex) => `<hp:tc name="" header="${cell.type === 'tableHeader' ? 1 : 0}" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="1"><hp:subList id="${id}-${rowIndex}-${colIndex}" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">${paragraph({ text: nodeText(cell), heading: false }, id * 1000 + rowIndex * 100 + colIndex)}</hp:subList><hp:cellAddr colAddr="${colIndex}" rowAddr="${rowIndex}"/><hp:cellSpan colSpan="${Number(cell.attrs?.colspan ?? 1)}" rowSpan="${Number(cell.attrs?.rowspan ?? 1)}"/><hp:cellSz width="${unit(160 / columns)}" height="${unit(10)}"/><hp:cellMargin left="141" right="141" top="141" bottom="141"/></hp:tc>`).join('')}</hp:tr>`).join('')}</hp:tbl>`;
  };
  const root = page.textFlow as RichNode; let id = 1;
  const body = (root.content ?? []).map((node) => node.type === 'table' ? table(node, id++) : paragraph({ text: nodeText(node).trim(), heading: node.type === 'heading' }, id++)).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core">${paragraph({ text: '', heading: false }, 0, true)}${body}</hs:sec>`;
}

function headerXml(sectionCount: number) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" version="1.4.0" secCnt="${sectionCount}"><hh:beginNum page="1" footnote="1" endnote="1" pic="1" tbl="1" equation="1"/><hh:refList><hh:fontfaces itemCnt="7"><hh:fontface lang="HANGUL" fontCnt="1"><hh:font id="0" face="함초롬바탕" type="TTF" isEmbedded="0"/></hh:fontface><hh:fontface lang="LATIN" fontCnt="1"><hh:font id="0" face="Arial" type="TTF" isEmbedded="0"/></hh:fontface><hh:fontface lang="HANJA" fontCnt="1"><hh:font id="0" face="함초롬바탕" type="TTF" isEmbedded="0"/></hh:fontface><hh:fontface lang="JAPANESE" fontCnt="1"><hh:font id="0" face="함초롬바탕" type="TTF" isEmbedded="0"/></hh:fontface><hh:fontface lang="OTHER" fontCnt="1"><hh:font id="0" face="함초롬바탕" type="TTF" isEmbedded="0"/></hh:fontface><hh:fontface lang="SYMBOL" fontCnt="1"><hh:font id="0" face="함초롬바탕" type="TTF" isEmbedded="0"/></hh:fontface><hh:fontface lang="USER" fontCnt="1"><hh:font id="0" face="함초롬바탕" type="TTF" isEmbedded="0"/></hh:fontface></hh:fontfaces><hh:borderFills itemCnt="2"><hh:borderFill id="1" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0"><hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/><hh:leftBorder type="NONE" width="0.1 mm" color="#000000"/><hh:rightBorder type="NONE" width="0.1 mm" color="#000000"/><hh:topBorder type="NONE" width="0.1 mm" color="#000000"/><hh:bottomBorder type="NONE" width="0.1 mm" color="#000000"/><hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/></hh:borderFill><hh:borderFill id="2" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0"><hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/><hh:leftBorder type="NONE" width="0.1 mm" color="#000000"/><hh:rightBorder type="NONE" width="0.1 mm" color="#000000"/><hh:topBorder type="NONE" width="0.1 mm" color="#000000"/><hh:bottomBorder type="NONE" width="0.1 mm" color="#000000"/><hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/></hh:borderFill></hh:borderFills><hh:charProperties itemCnt="2"><hh:charPr id="0" height="1000" textColor="#000000" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="2"><hh:fontRef hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/><hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/><hh:spacing hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/><hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/><hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/><hh:underline type="NONE" shape="SOLID" color="#000000"/><hh:strikeout shape="NONE" color="#000000"/><hh:outline type="NONE"/><hh:shadow type="NONE" color="#B2B2B2" offsetX="10" offsetY="10"/></hh:charPr><hh:charPr id="1" height="1600" textColor="#173B32" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="2"><hh:fontRef hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/><hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/><hh:spacing hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/><hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/><hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/><hh:bold/><hh:underline type="NONE" shape="SOLID" color="#000000"/><hh:strikeout shape="NONE" color="#000000"/><hh:outline type="NONE"/><hh:shadow type="NONE" color="#B2B2B2" offsetX="10" offsetY="10"/></hh:charPr></hh:charProperties><hh:tabProperties itemCnt="1"><hh:tabPr id="0" autoTabLeft="0" autoTabRight="0"/></hh:tabProperties><hh:numberings itemCnt="0"/><hh:bullets itemCnt="0"/><hh:paraProperties itemCnt="1"><hh:paraPr id="0" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1"><hh:align horizontal="JUSTIFY" vertical="BASELINE"/><hh:heading type="NONE" idRef="0" level="0"/><hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="BREAK_WORD" widowOrphan="0" keepWithNext="0" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/><hh:autoSpacing eAsianEng="0" eAsianNum="0"/><hh:switch/></hh:paraPr></hh:paraProperties><hh:styles itemCnt="1"><hh:style id="0" type="PARA" name="바탕글" engName="Normal" paraPrIDRef="0" charPrIDRef="0" nextStyleIDRef="0" langID="1042" lockForm="0"/></hh:styles><hh:memoProperties itemCnt="0"/><hh:trackChanges itemCnt="0"/><hh:trackChangeAuthors itemCnt="0"/></hh:refList><hh:compatibleDocument targetProgram="HWP201X"><hh:layoutCompatibility/></hh:compatibleDocument><hh:docOption><hh:linkinfo path="" pageInherit="0" footnoteInherit="0"/></hh:docOption></hh:head>`;
}

export async function validateHwpxPackage(source: Blob | ArrayBuffer | Uint8Array) {
  const bytes = source instanceof Blob ? new Uint8Array(await source.arrayBuffer()) : source instanceof Uint8Array ? source : new Uint8Array(source);
  const fail = (detail: string): never => { throw new Error(`HWPX 호환성 검증 실패: ${detail}`); };
  if (bytes.byteLength < 30) fail('ZIP 패키지가 비어 있습니다.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x04034b50) fail('첫 ZIP 항목을 찾을 수 없습니다.');
  if (view.getUint16(8, true) !== 0) fail('mimetype 항목은 압축하지 않아야 합니다.');
  const nameLength = view.getUint16(26, true);
  if (new TextDecoder().decode(bytes.slice(30, 30 + nameLength)) !== 'mimetype') fail('mimetype 항목이 ZIP의 첫 번째 항목이 아닙니다.');

  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(bytes);
  const required = ['mimetype', 'META-INF/container.xml', 'META-INF/manifest.xml', 'Contents/content.hpf', 'Contents/header.xml', 'settings.xml', 'version.xml'];
  for (const path of required) if (!zip.file(path)) fail(`${path} 항목이 없습니다.`);
  const read = async (path: string) => zip.file(path)!.async('text');
  if ((await read('mimetype')) !== HWPX_MIME) fail('mimetype 값이 올바르지 않습니다.');
  const sections = Object.keys(zip.files).filter((path) => /^Contents\/section\d+\.xml$/.test(path));
  if (!sections.length) fail('본문 section XML이 없습니다.');

  const xmlEntries = ['META-INF/container.xml', 'META-INF/manifest.xml', 'Contents/content.hpf', 'Contents/header.xml', 'settings.xml', 'version.xml', ...sections];
  const sources = new Map<string, string>();
  for (const path of xmlEntries) {
    const sourceXml = await read(path);
    sources.set(path, sourceXml);
    if (typeof DOMParser !== 'undefined' && new DOMParser().parseFromString(sourceXml, 'application/xml').querySelector('parsererror')) fail(`${path} XML이 올바르지 않습니다.`);
  }
  const container = sources.get('META-INF/container.xml')!;
  const manifest = sources.get('META-INF/manifest.xml')!;
  const content = sources.get('Contents/content.hpf')!;
  const header = sources.get('Contents/header.xml')!;
  const settings = sources.get('settings.xml')!;
  const version = sources.get('version.xml')!;
  if (!container.includes(`full-path="Contents/content.hpf"`) || !container.includes(`media-type="${HWPX_PACKAGE_MIME}"`)) fail('container.xml의 주 문서 선언이 올바르지 않습니다.');
  if (!manifest.includes(`manifest:full-path="Contents/content.hpf" manifest:media-type="${HWPX_PACKAGE_MIME}"`)) fail('manifest.xml의 content.hpf 형식이 올바르지 않습니다.');
  if (!content.includes('<opf:itemref idref="header"')) fail('content.hpf spine에 header가 없습니다.');
  if (!content.includes('id="version" href="../version.xml"')) fail('content.hpf에 version.xml 참조가 없습니다.');
  for (let index = 0; index < sections.length; index += 1) if (!content.includes(`<opf:itemref idref="section${index}"`)) fail(`content.hpf spine에 section${index}이 없습니다.`);
  if (!header.includes(`secCnt="${sections.length}"`)) fail('header.xml의 section 개수가 실제 본문과 다릅니다.');
  if (!settings.includes('<ha:HWPApplicationSetting') || !settings.includes('http://www.hancom.co.kr/hwpml/2011/app')) fail('settings.xml의 한컴 응용 프로그램 설정 구조가 올바르지 않습니다.');
  if (!version.includes(`xmlns:hv="${HWPX_VERSION_NAMESPACE}"`) || !version.includes('targetApplication="WORDPROCESSOR"')) fail('version.xml의 네임스페이스 또는 대상 프로그램이 올바르지 않습니다.');
}

export async function buildHwpxBlob(document: EditorDocument) {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const assets: Array<{ id: string; blob: Blob; mediaType: string }> = [];
  for (const page of document.pages) for (const object of page.objects) if (object.assetId && !assets.some((item) => item.id === object.assetId)) { const asset = await getAsset(object.assetId); if (asset) assets.push({ id: object.assetId, blob: asset.blob, mediaType: asset.mediaType }); }
  const sections = document.pages.map((page, index) => ({ id: `section${index}`, path: `Contents/section${index}.xml`, xml: sectionXml(page) }));
  const manifestItems = sections.map((section) => `<opf:item id="${section.id}" href="${section.id}.xml" media-type="application/xml"/>`).join('') + assets.map((asset, index) => `<opf:item id="asset${index}" href="../BinData/${asset.id}" media-type="${xml(asset.mediaType)}"/>`).join('');
  const spine = sections.map((section) => `<opf:itemref idref="${section.id}"/>`).join('');
  const content = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><opf:package xmlns:opf="http://www.idpf.org/2007/opf" xmlns:dc="http://purl.org/dc/elements/1.1/"><opf:metadata><dc:title>${xml(document.name)}</dc:title><dc:language>ko</dc:language><dc:identifier>${xml(document.id)}</dc:identifier></opf:metadata><opf:manifest><opf:item id="header" href="header.xml" media-type="application/xml"/><opf:item id="settings" href="../settings.xml" media-type="application/xml"/><opf:item id="version" href="../version.xml" media-type="application/xml"/>${manifestItems}</opf:manifest><opf:spine><opf:itemref idref="header"/>${spine}</opf:spine></opf:package>`;
  const container = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf"><ocf:rootfiles><ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/></ocf:rootfiles></ocf:container>';
  const xmlEntries = ['Contents/header.xml', 'settings.xml', ...sections.map((section) => section.path), 'version.xml'];
  const manifest = `<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"><manifest:file-entry manifest:full-path="/" manifest:media-type="${HWPX_MIME}"/><manifest:file-entry manifest:full-path="Contents/content.hpf" manifest:media-type="${HWPX_PACKAGE_MIME}"/>${xmlEntries.map((path) => `<manifest:file-entry manifest:full-path="${path}" manifest:media-type="application/xml"/>`).join('')}<manifest:file-entry manifest:full-path="Contents/our-ai-document.json" manifest:media-type="application/json"/>${assets.map((asset) => `<manifest:file-entry manifest:full-path="BinData/${asset.id}" manifest:media-type="${xml(asset.mediaType)}"/>`).join('')}</manifest:manifest>`;
  zip.file('mimetype', HWPX_MIME, { compression: 'STORE' });
  zip.file('META-INF/container.xml', container);
  zip.file('META-INF/manifest.xml', manifest);
  zip.file('Contents/content.hpf', content);
  zip.file('Contents/header.xml', headerXml(sections.length));
  zip.file('settings.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><ha:HWPApplicationSetting xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"><ha:CaretPosition listIDRef="0" paraIDRef="0" pos="0"/></ha:HWPApplicationSetting>');
  sections.forEach((section) => zip.file(section.path, section.xml));
  zip.file('Contents/our-ai-document.json', JSON.stringify({ format: 'our-ai-hangeul-objects-v1', settings: document.settings.pageNumber, pages: document.pages.map((page) => ({ header: page.header, footer: page.footer, objects: page.objects })) }));
  assets.forEach((asset) => zip.file(`BinData/${asset.id}`, asset.blob, { compression: 'STORE' }));
  zip.file('Preview/PrvText.txt', document.pages.flatMap((page) => blocks(page).map((block) => block.text)).join('\n'));
  zip.file('version.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><hv:HCFVersion xmlns:hv="${HWPX_VERSION_NAMESPACE}" targetApplication="WORDPROCESSOR" major="5" minor="0" micro="5" buildNumber="0" os="1" xmlVersion="1.4" application="우리의 AI 한글" appVersion="1.4.0"/>`);
  const blob = await zip.generateAsync({ type: 'blob', mimeType: HWPX_MIME, compression: 'DEFLATE', compressionOptions: { level: 6 } });
  await validateHwpxPackage(blob);
  return blob;
}
