'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

// Bellek içi kimlik deposu (@napi-rs/keyring Entry ile aynı arayüz)
function memoryKeyring() {
  let value = null;
  return { get: () => value, set: (v) => { value = String(v); }, del: () => { value = null; }, peek: () => value };
}

// Aynı depoyu ve klasörü paylaşan iki "uygulama" için ortak ortam
function tmpDir(prefix = 'mt-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// --- Test için küçük ZIP yazıcı (stored / deflate, UTF-8 adlar) ------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// files: [{ name | nameBytes, data (Buffer|string), method: 0|8, encrypted?, utf8Flag? (vars. true) }]
function makeZip(files, { comment = '' } = {}) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  const dosDate = ((2026 - 1980) << 9) | (10 << 5) | 16; // 16.10.2026
  const dosTime = (12 << 11) | (30 << 5);
  for (const f of files) {
    const name = f.nameBytes || Buffer.from(f.name, 'utf8');
    const raw = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data || '', 'utf8');
    const method = f.method ?? 8;
    const comp = method === 8 ? zlib.deflateRawSync(raw) : raw;
    const flags = (f.utf8Flag === false ? 0 : 0x800) | (f.encrypted ? 1 : 0);
    const crc = crc32(raw);
    const loc = Buffer.alloc(30);
    loc.writeUInt32LE(0x04034b50, 0); loc.writeUInt16LE(20, 4); loc.writeUInt16LE(flags, 6); loc.writeUInt16LE(method, 8);
    loc.writeUInt16LE(dosTime, 10); loc.writeUInt16LE(dosDate, 12); loc.writeUInt32LE(crc, 14);
    loc.writeUInt32LE(comp.length, 18); loc.writeUInt32LE(raw.length, 22); loc.writeUInt16LE(name.length, 26); loc.writeUInt16LE(0, 28);
    locals.push(loc, name, comp);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(flags, 8); cen.writeUInt16LE(method, 10);
    cen.writeUInt16LE(dosTime, 12); cen.writeUInt16LE(dosDate, 14); cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(comp.length, 20);
    cen.writeUInt32LE(raw.length, 24); cen.writeUInt16LE(name.length, 28); cen.writeUInt32LE(offset, 42);
    centrals.push(cen, name);
    offset += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const c = Buffer.from(comment, 'utf8');
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16); end.writeUInt16LE(c.length, 20);
  return Buffer.concat([...locals, cd, end, c]);
}

// --- Test için en küçük geçerli PDF (n sayfa) -------------------------------------------------
function makePdf(pages = 2, { width = 595, height = 842, title = 'Sample' } = {}) {
  const objs = [];
  const kids = [];
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  let id = 4;
  for (let p = 1; p <= pages; p++) {
    const content = `BT /F1 36 Tf 72 ${height - 120} Td (Page ${p}) Tj ET`;
    objs[id] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
    objs[id + 1] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${id} 0 R >>`;
    kids.push(`${id + 1} 0 R`);
    id += 2;
  }
  objs[2] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages} >>`;
  objs[id] = `<< /Title (${title}) /Producer (Quick Preview test) >>`;
  const infoId = id;
  let out = '%PDF-1.4\n';
  const offsets = [];
  for (let i = 1; i < objs.length; i++) {
    offsets[i] = Buffer.byteLength(out, 'latin1');
    out += `${i} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objs.length; i++) out += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R /Info ${infoId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

// --- Test için PNG (düz renk) -----------------------------------------------------------------
function makePng(w = 4, h = 3, rgba = [255, 0, 0, 255]) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const rows = [];
  for (let y = 0; y < h; y++) { rows.push(Buffer.from([0])); for (let x = 0; x < w; x++) rows.push(Buffer.from(rgba)); }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}

// --- Office Open XML örnekleri ------------------------------------------------------------------
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const CORE = (title, author) => `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"><dc:title>${title}</dc:title><dc:creator>${author}</dc:creator><cp:lastModifiedBy>${author}</cp:lastModifiedBy><dcterms:modified>2026-10-16T09:00:00Z</dcterms:modified></cp:coreProperties>`;

function makeDocx({ title = 'Teklif', author = 'Örnek Yazar', paragraphs = [] } = {}) {
  const p = (text, style) => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
  const body = [
    p(title, 'Title'),
    p('Giriş', 'Heading1'),
    '<w:p><w:r><w:t>Bu belge </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>örnek</w:t></w:r><w:r><w:tab/><w:t>metindir &amp; &lt;güvenlidir&gt;.</w:t></w:r></w:p>',
    '<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Madde bir</w:t></w:r></w:p>',
    ...paragraphs.map((x) => p(x)),
    '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Ürün</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Adet</w:t></w:r></w:p></w:tc></w:tr>',
    '<w:tr><w:tc><w:p><w:r><w:t>Kalem</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>12</w:t></w:r></w:p></w:tc></w:tr></w:tbl>',
  ].join('');
  return makeZip([
    { name: '[Content_Types].xml', data: `${XML}<Types/>` },
    { name: 'word/document.xml', data: `${XML}<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr/></w:body></w:document>` },
    { name: 'docProps/core.xml', data: CORE(title, author) },
  ]);
}

function makeXlsx() {
  return makeZip([
    { name: '[Content_Types].xml', data: `${XML}<Types/>` },
    { name: 'xl/workbook.xml', data: `${XML}<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Satışlar" sheetId="1" r:id="rId1"/><sheet name="Boş" sheetId="2" r:id="rId2"/></sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: `${XML}<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>` },
    { name: 'xl/sharedStrings.xml', data: `${XML}<sst><si><t>Ürün</t></si><si><t>Tutar</t></si><si><r><t>Kal</t></r><r><t>em</t></r></si></sst>` },
    { name: 'xl/styles.xml', data: `${XML}<styleSheet><numFmts count="1"><numFmt numFmtId="164" formatCode="dd.mm.yyyy"/></numFmts><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="164"/></cellXfs></styleSheet>` },
    { name: 'xl/worksheets/sheet1.xml', data: `${XML}<worksheet><sheetData>
      <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="inlineStr"><is><t>Tarih</t></is></c></row>
      <row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>1250.5</v></c><c r="C2" s="1"><v>46311</v></c></row>
      <row r="4"><c r="D4" t="b"><v>1</v></c></row></sheetData></worksheet>` },
    { name: 'xl/worksheets/sheet2.xml', data: `${XML}<worksheet><sheetData/></worksheet>` },
  ]);
}

function makePptx() {
  const slide = (title, items) => `${XML}<p:sld xmlns:a="a" xmlns:p="p"><p:cSld><p:spTree>
    <p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>${title}</a:t></a:r></a:p></p:txBody></p:sp>
    <p:sp><p:nvSpPr><p:nvPr><p:ph idx="1"/></p:nvPr></p:nvSpPr><p:txBody>${items.map(([t, l]) => `<a:p><a:pPr lvl="${l}"/><a:r><a:t>${t}</a:t></a:r></a:p>`).join('')}</p:txBody></p:sp>
  </p:spTree></p:cSld></p:sld>`;
  return makeZip([
    { name: '[Content_Types].xml', data: `${XML}<Types/>` },
    { name: 'ppt/presentation.xml', data: `${XML}<p:presentation xmlns:p="p" xmlns:r="r"><p:sldIdLst><p:sldId id="256" r:id="rId3"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst></p:presentation>` },
    { name: 'ppt/_rels/presentation.xml.rels', data: `${XML}<Relationships><Relationship Id="rId2" Target="slides/slide2.xml"/><Relationship Id="rId3" Target="slides/slide1.xml"/></Relationships>` },
    { name: 'ppt/slides/slide1.xml', data: slide('Yıllık Plan', [['Hedefler', 0], ['Büyüme %20', 1]]) },
    { name: 'ppt/slides/slide2.xml', data: slide('Sonuç', [['Teşekkürler', 0]]) },
    { name: 'ppt/slides/_rels/slide1.xml.rels', data: `${XML}<Relationships><Relationship Id="rId1" Target="../notesSlides/notesSlide1.xml"/></Relationships>` },
    { name: 'ppt/notesSlides/notesSlide1.xml', data: `${XML}<p:notes xmlns:a="a" xmlns:p="p"><p:cSld><p:spTree><p:sp><p:nvSpPr><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>Konuşmacı notu</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:notes>` },
  ]);
}

module.exports = { memoryKeyring, tmpDir, makeZip, makePdf, makePng, makeDocx, makeXlsx, makePptx, crc32 };
