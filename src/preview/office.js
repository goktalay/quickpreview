'use strict';

// Office Open XML önizlemesi (docx / xlsx / pptx): biçimlendirme yerine içerik — paragraflar ve başlıklar,
// tablolar, çalışma sayfaları, slayt metinleri. Dosya zip.js ile açılır, XML aşağıdaki küçük ayrıştırıcıyla okunur.

const zip = require('./zip');

// Önizleme sınırları (çok büyük belgelerde pencere anında açılsın)
const LIMITS = { paragraphs: 4000, sheets: 30, rows: 500, cols: 60, slides: 300, xmlBytes: 48 * 1024 * 1024 };

// ---------------------------------------------------------------------------
// Küçük XML ayrıştırıcı: { name, attrs, children: [düğüm | metin] }. Ad alanı öneki korunur (w:p, a:t…).
// ---------------------------------------------------------------------------
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return String.fromCodePoint(n); } catch { return m; }
    }
    return ENT[e] ?? m;
  });
}

function parseXml(xml) {
  const root = { name: '#root', attrs: {}, children: [] };
  const stack = [root];
  const re = /<(\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|([^<]+)/g;
  let m;
  while ((m = re.exec(xml))) {
    const top = stack[stack.length - 1];
    if (m[6] !== undefined) { top.children.push(decodeEntities(m[6])); continue; }
    if (m[5] !== undefined) { top.children.push(m[5]); continue; }
    if (!m[2]) continue; // yorum, işlem talimatı
    if (m[1]) {
      // kapanış: eşleşen açılışa kadar çık (bozuk iç içelikte dayanıklı)
      for (let i = stack.length - 1; i > 0; i--) if (stack[i].name === m[2]) { stack.length = i; break; }
      continue;
    }
    const attrs = {};
    for (const a of m[3].matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1]] = decodeEntities(a[2] ?? a[3]);
    const el = { name: m[2], attrs, children: [] };
    top.children.push(el);
    if (!m[4]) stack.push(el);
  }
  return root;
}

const isEl = (n) => n && typeof n === 'object';
const kids = (el, name) => (el ? el.children.filter((c) => isEl(c) && (!name || c.name === name)) : []);
const kid = (el, name) => kids(el, name)[0] || null;
// Ağaçta derinlemesine ara (ilk eşleşme ya da hepsi)
function find(el, name) {
  if (!el) return null;
  for (const c of el.children) {
    if (!isEl(c)) continue;
    if (c.name === name) return c;
    const r = find(c, name);
    if (r) return r;
  }
  return null;
}
function findAll(el, name, out = []) {
  if (!el) return out;
  for (const c of el.children) {
    if (!isEl(c)) continue;
    if (c.name === name) out.push(c);
    else findAll(c, name, out);
  }
  return out;
}
const textOf = (el) => (el ? el.children.map((c) => (isEl(c) ? textOf(c) : c)).join('') : '');

// ---------------------------------------------------------------------------
// Ortak: zip içinden XML okuma, ilişkiler (rels), belge özellikleri
// ---------------------------------------------------------------------------
function opener(source) {
  const list = zip.listEntries(source);
  const byName = new Map(list.entries.map((e) => [e.name, e]));
  const read = (name) => {
    const e = byName.get(name);
    if (!e) return null;
    return zip.readEntry(source, e, { maxBytes: LIMITS.xmlBytes }).toString('utf8');
  };
  const xml = (name) => { const s = read(name); return s == null ? null : parseXml(s); };
  return { read, xml, has: (n) => byName.has(n), names: () => [...byName.keys()] };
}

// "word/_rels/document.xml.rels" → { rId: "word/media/x.png" }
function rels(z, partName) {
  const i = partName.lastIndexOf('/');
  const dir = partName.slice(0, i + 1);
  const doc = z.xml(`${dir}_rels/${partName.slice(i + 1)}.rels`);
  const out = {};
  for (const r of findAll(doc, 'Relationship')) {
    const target = r.attrs.Target || '';
    out[r.attrs.Id] = target.startsWith('/') ? target.slice(1) : normalize(dir + target);
  }
  return out;
}
function normalize(p) {
  const out = [];
  for (const s of p.split('/')) { if (s === '..') out.pop(); else if (s && s !== '.') out.push(s); }
  return out.join('/');
}

function coreProps(z) {
  const doc = z.xml('docProps/core.xml');
  if (!doc) return {};
  const pick = (n) => { const el = find(doc, n); const s = textOf(el).trim(); return s || undefined; };
  const app = z.xml('docProps/app.xml');
  const pages = app ? Number(textOf(find(app, 'Pages'))) || undefined : undefined;
  return { title: pick('dc:title'), author: pick('dc:creator'), lastModifiedBy: pick('cp:lastModifiedBy'),
    created: pick('dcterms:created'), modified: pick('dcterms:modified'), pages };
}

// ---------------------------------------------------------------------------
// Word (docx)
// ---------------------------------------------------------------------------
function runText(el) {
  let s = '';
  for (const c of el.children) {
    if (!isEl(c)) continue;
    if (c.name === 'w:t' || c.name === 'w:delText') s += c.name === 'w:t' ? textOf(c) : '';
    else if (c.name === 'w:tab') s += '\t';
    else if (c.name === 'w:br' || c.name === 'w:cr') s += '\n';
    else if (c.name === 'w:noBreakHyphen') s += '‑';
    else if (['w:r', 'w:hyperlink', 'w:ins', 'w:smartTag', 'w:sdt', 'w:sdtContent', 'w:fldSimple', 'w:customXml'].includes(c.name)) s += runText(c);
  }
  return s;
}

function paraStyle(p) {
  const pPr = kid(p, 'w:pPr');
  const st = kid(pPr, 'w:pStyle');
  const v = (st && st.attrs['w:val']) || '';
  const outline = kid(pPr, 'w:outlineLvl');
  if (/^title$/i.test(v)) return 'title';
  const h = v.match(/^(?:heading|başlık|titre|überschrift|título|заголовок)\s*([1-6])$/i) || (outline && [null, Number(outline.attrs['w:val']) + 1]);
  if (h) return `h${Math.min(6, Number(h[1]) || 1)}`;
  if (kid(pPr, 'w:numPr') || /^list/i.test(v)) return 'li';
  return 'p';
}

function docx(source) {
  const z = opener(source);
  const doc = z.xml('word/document.xml');
  if (!doc) throw Object.assign(new Error('office_invalid'), { code: 'office_invalid' });
  const body = find(doc, 'w:body');
  const blocks = [];
  let count = 0;
  let truncated = false;
  const walk = (parent) => {
    for (const c of kids(parent)) {
      if (count >= LIMITS.paragraphs) { truncated = true; return; }
      if (c.name === 'w:p') {
        const text = runText(c);
        blocks.push({ type: paraStyle(c), text });
        count++;
      } else if (c.name === 'w:tbl') {
        const rows = kids(c, 'w:tr').slice(0, LIMITS.rows).map((tr) =>
          kids(tr, 'w:tc').slice(0, LIMITS.cols).map((tc) => findAll(tc, 'w:p').map(runText).join('\n')));
        blocks.push({ type: 'table', rows });
        count += rows.length;
      } else if (c.name === 'w:sdt' || c.name === 'w:sdtContent' || c.name === 'w:customXml') {
        walk(c);
      }
    }
  };
  walk(body);
  // Arka arkaya boş paragrafları tek boşluğa indir
  const out = blocks.filter((b, i) => b.type !== 'p' || b.text.trim() || (i > 0 && (blocks[i - 1].type !== 'p' || blocks[i - 1].text.trim())));
  return { type: 'docx', props: coreProps(z), blocks: out, truncated };
}

// ---------------------------------------------------------------------------
// Excel (xlsx)
// ---------------------------------------------------------------------------
// "AB12" → [satır 11, sütun 27] (0 tabanlı)
function cellRef(ref) {
  const m = /^([A-Z]+)(\d+)$/i.exec(ref || '');
  if (!m) return null;
  let col = 0;
  for (const ch of m[1].toUpperCase()) col = col * 26 + (ch.charCodeAt(0) - 64);
  return [Number(m[2]) - 1, col - 1];
}
function colName(i) {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

// Excel seri tarihi → "YYYY-MM-DD[ hh:mm]" (1900 sistemi; 1904 sistemi workbookPr'den)
function excelDate(serial, date1904) {
  const ms = Math.round((serial + (date1904 ? 1462 : 0) - 25569) * 86400000);
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return String(serial);
  const iso = d.toISOString();
  return serial % 1 ? `${iso.slice(0, 10)} ${iso.slice(11, 16)}` : iso.slice(0, 10);
}
const BUILTIN_DATE_FMT = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);
const isDateFormat = (code) => /[dmyhs]/i.test(String(code).replace(/"[^"]*"|\[[^\]]*\]|\\./g, '')) && !/^(General|0|#)/i.test(code);

function xlsx(source) {
  const z = opener(source);
  const wb = z.xml('xl/workbook.xml');
  if (!wb) throw Object.assign(new Error('office_invalid'), { code: 'office_invalid' });
  const date1904 = ['1', 'true'].includes((find(wb, 'workbookPr') || { attrs: {} }).attrs.date1904);
  const r = rels(z, 'xl/workbook.xml');
  const shared = findAll(z.xml('xl/sharedStrings.xml'), 'si').map((si) => findAll(si, 't').map(textOf).join(''));

  // Stil → tarih biçimi mi?
  const styles = z.xml('xl/styles.xml');
  const custom = {};
  for (const f of findAll(find(styles, 'numFmts'), 'numFmt')) custom[f.attrs.numFmtId] = f.attrs.formatCode || '';
  const xfDate = kids(find(styles, 'cellXfs'), 'xf').map((xf) => {
    const id = Number(xf.attrs.numFmtId || 0);
    return BUILTIN_DATE_FMT.has(id) || (custom[id] !== undefined && isDateFormat(custom[id]));
  });

  const sheetEls = findAll(find(wb, 'sheets'), 'sheet');
  const sheets = [];
  for (const s of sheetEls.slice(0, LIMITS.sheets)) {
    const part = r[s.attrs['r:id']];
    const doc = part ? z.xml(part) : null;
    const rows = [];
    let maxCol = 0;
    let truncated = false;
    for (const row of findAll(find(doc, 'sheetData'), 'row')) {
      const ri = Number(row.attrs.r || rows.length + 1) - 1;
      if (ri >= LIMITS.rows) { truncated = true; break; }
      const cells = [];
      let ci = -1;
      for (const c of kids(row, 'c')) {
        const pos = cellRef(c.attrs.r);
        ci = pos ? pos[1] : ci + 1;
        if (ci >= LIMITS.cols) { truncated = true; continue; }
        const t = c.attrs.t || 'n';
        const v = textOf(kid(c, 'v'));
        let val = '';
        if (t === 's') val = shared[Number(v)] ?? '';
        else if (t === 'inlineStr') val = findAll(kid(c, 'is'), 't').map(textOf).join('');
        else if (t === 'b') val = v === '1' ? 'TRUE' : 'FALSE';
        else if (t === 'str' || t === 'e') val = v;
        else if (v !== '') val = xfDate[Number(c.attrs.s || 0)] && Number.isFinite(Number(v)) ? excelDate(Number(v), date1904) : v;
        if (val !== '') { cells[ci] = val; maxCol = Math.max(maxCol, ci + 1); }
      }
      if (cells.length) rows[ri] = cells;
    }
    // Boş satırları doldur (görünümde satır numaraları doğru olsun), sondaki boşları at
    const dense = [];
    for (let i = 0; i < rows.length; i++) dense.push(Array.from({ length: maxCol }, (_, j) => (rows[i] && rows[i][j]) ?? ''));
    sheets.push({ name: s.attrs.name || `Sheet${sheets.length + 1}`, cols: Array.from({ length: maxCol }, (_, i) => colName(i)), rows: dense, truncated });
  }
  return { type: 'xlsx', props: coreProps(z), sheets, sheetCount: sheetEls.length };
}

// ---------------------------------------------------------------------------
// PowerPoint (pptx)
// ---------------------------------------------------------------------------
function pptx(source) {
  const z = opener(source);
  const pres = z.xml('ppt/presentation.xml');
  if (!pres) throw Object.assign(new Error('office_invalid'), { code: 'office_invalid' });
  const r = rels(z, 'ppt/presentation.xml');
  const ids = findAll(find(pres, 'p:sldIdLst'), 'p:sldId').map((x) => r[x.attrs['r:id']]).filter(Boolean);
  const slides = [];
  for (const part of ids.slice(0, LIMITS.slides)) {
    const doc = z.xml(part);
    if (!doc) continue;
    let title = '';
    const items = [];
    for (const sp of findAll(doc, 'p:sp')) {
      const ph = find(sp, 'p:ph');
      const isTitle = ph && ['title', 'ctrTitle'].includes(ph.attrs.type);
      const paras = findAll(find(sp, 'p:txBody'), 'a:p')
        .map((p) => ({ text: findAll(p, 'a:t').map(textOf).join(''), level: Number((kid(p, 'a:pPr') || { attrs: {} }).attrs.lvl || 0) }))
        .filter((p) => p.text.trim());
      if (isTitle && !title) title = paras.map((p) => p.text).join(' ');
      else items.push(...paras);
    }
    // Tablolar (a:tbl) düz metin satırı olarak
    for (const tbl of findAll(doc, 'a:tbl')) {
      for (const tr of findAll(tbl, 'a:tr')) items.push({ text: findAll(tr, 'a:tc').map((tc) => findAll(tc, 'a:t').map(textOf).join('')).join('  ·  '), level: 0 });
    }
    // Konuşmacı notları
    const notesPart = Object.values(rels(z, part)).find((p) => /notesSlides\//.test(p));
    const notesDoc = notesPart ? z.xml(notesPart) : null;
    const notes = notesDoc ? findAll(notesDoc, 'p:sp').filter((sp) => { const ph = find(sp, 'p:ph'); return ph && ph.attrs.type === 'body'; })
      .map((sp) => findAll(sp, 'a:p').map((p) => findAll(p, 'a:t').map(textOf).join('')).join('\n')).join('\n').trim() : '';
    slides.push({ title, items, notes });
  }
  return { type: 'pptx', props: coreProps(z), slides, slideCount: ids.length };
}

function readOffice(source, sub) {
  if (sub === 'docx') return docx(source);
  if (sub === 'xlsx') return xlsx(source);
  if (sub === 'pptx') return pptx(source);
  throw Object.assign(new Error('office_unsupported'), { code: 'office_unsupported' });
}

module.exports = { readOffice, docx, xlsx, pptx, parseXml, textOf, cellRef, colName, excelDate, LIMITS };
