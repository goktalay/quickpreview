'use strict';

// Önizleme yükleyicisi: bir dosya yolundan pencerenin çizeceği tanımı üretir. Önizleme penceresinin preload'unda
// (renderer süreci) çalışır; ana süreci (tepsi, sağ tık iletimi) hiç bekletmez. Her şey yerel: dosya okunur,
// çözülür, gösterilir — hiçbir yere gönderilmez.
//
// Tanım: { path, name, dir, ext, size, mtime, btime, kind, sub, view, ...türe özgü alanlar }
//   view: 'image' | 'raster' | 'psd' | 'pdf' | 'svg' | 'text' | 'markdown' | 'media' | 'office' | 'archive' | 'info'

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { detect, extOf, KINDS } = require('./detect');

const HEAD_BYTES = 8192;
const MAX_DECODE_BYTES = 1.5 * 1024 * 1024 * 1024; // PSD/TIFF/HEIC/PDF belleğe alınır; daha büyüğü yalnız bilgi
const MAX_ARCHIVE_ROWS = 5000;

function readHead(file, n = HEAD_BYTES) {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(n);
    const got = fs.readSync(fd, buf, 0, n, 0);
    return buf.subarray(0, got);
  } finally {
    fs.closeSync(fd);
  }
}

function readStart(file, n) {
  const st = fs.statSync(file);
  return st.size <= n ? fs.readFileSync(file) : readHead(file, n);
}

const fileUrl = (p) => pathToFileURL(p).href;

function baseInfo(file) {
  const st = fs.statSync(file);
  if (st.isDirectory()) throw Object.assign(new Error('is_directory'), { code: 'is_directory' });
  return {
    path: file,
    name: path.basename(file),
    dir: path.dirname(file),
    ext: extOf(file),
    size: st.size,
    mtime: st.mtimeMs,
    btime: st.birthtimeMs || st.ctimeMs,
    readonly: !(st.mode & 0o200),
  };
}

// Ayarlar › Önizleme: kapatılan türler yalnız dosya bilgisiyle gösterilir
function enabledKinds(settings) {
  const t = (settings && settings.types) || {};
  return new Set(KINDS.filter((k) => t[k] !== false));
}

const err = (code) => Object.assign(new Error(code), { code });

// settings: { types, psdLayers } — async: HEIC çözücüsü async
async function loadPreview(file, settings = {}) {
  const info = baseInfo(file);
  const head = info.size ? readHead(file) : Buffer.alloc(0);
  const type = detect(info.name, head);
  const d = { ...info, kind: type.kind, sub: type.sub };
  if (type.kind === 'unknown' || !enabledKinds(settings).has(type.kind)) {
    return { ...d, view: 'info', reason: type.kind === 'unknown' ? 'unknown' : 'disabled' };
  }
  try {
    switch (type.kind) {
      case 'image':
        if (type.sub === 'tiff' || type.sub === 'heic') {
          if (info.size > MAX_DECODE_BYTES) return { ...d, view: 'info', reason: 'too_large' };
          const { decodeTiff, decodeHeic } = require('./raster');
          const buf = fs.readFileSync(file);
          const img = type.sub === 'tiff' ? decodeTiff(buf) : await decodeHeic(buf);
          return { ...d, view: 'raster', ...img };
        }
        return { ...d, view: 'image', url: fileUrl(file) };

      case 'psd': {
        if (info.size > MAX_DECODE_BYTES) return { ...d, view: 'info', reason: 'too_large' };
        const { decodePsd } = require('./psd');
        const r = decodePsd(fs.readFileSync(file), { layers: settings.psdLayers !== false });
        return { ...d, view: 'psd', ...r };
      }

      case 'pdf':
        if (info.size > MAX_DECODE_BYTES) return { ...d, view: 'info', reason: 'too_large' };
        return { ...d, view: 'pdf', data: new Uint8Array(fs.readFileSync(file)) };

      case 'svg': {
        const src = readStart(file, 4 * 1024 * 1024);
        const { text } = require('./text').decodeText(src);
        // <img> içinde gösterilir: SVG'deki betikler çalışmaz, dış kaynaklar yüklenmez
        return { ...d, view: 'svg', url: `data:image/svg+xml;base64,${Buffer.from(text, 'utf8').toString('base64')}`,
          source: require('./text').renderText(src, { lang: 'xml', size: info.size }) };
      }

      case 'text': {
        const { renderText, MAX_TEXT_BYTES } = require('./text');
        return { ...d, view: 'text', ...renderText(readStart(file, MAX_TEXT_BYTES), { lang: type.lang, size: info.size, auto: !type.lang && !['txt', 'log'].includes(info.ext) }) };
      }

      case 'markdown': {
        const { renderMarkdown, renderText, decodeText, MAX_TEXT_BYTES } = require('./text');
        const buf = readStart(file, MAX_TEXT_BYTES);
        const { text, encoding } = decodeText(buf);
        return { ...d, view: 'markdown', encoding, truncated: info.size > buf.length, ...renderMarkdown(text, { baseDir: info.dir }),
          source: renderText(buf, { lang: 'markdown', size: info.size }) };
      }

      case 'media':
        return { ...d, view: 'media', media: type.media || 'video', url: fileUrl(file) };

      case 'office': {
        const { readOffice } = require('./office');
        return { ...d, view: 'office', office: readOffice(file, type.sub) };
      }

      case 'archive': {
        const zip = require('./zip');
        const list = zip.listEntries(file);
        const summary = zip.summarize(list);
        const entries = list.entries.slice(0, MAX_ARCHIVE_ROWS).map(({ name, dir, size, csize, mtime, encrypted }) => ({ name, dir, size, csize, mtime, encrypted }));
        return { ...d, view: 'archive', entries, summary, total: list.entries.length, truncated: list.truncated || list.entries.length > MAX_ARCHIVE_ROWS, comment: list.comment };
      }

      default:
        return { ...d, view: 'info', reason: 'unknown' };
    }
  } catch (e) {
    // Bozuk ya da desteklenmeyen dosya: bilgi görünümü ve hata nedeni
    return { ...d, view: 'info', reason: 'error', error: e.code || e.message || String(e) };
  }
}

// ---------------------------------------------------------------------------
// Aynı klasördeki dosyalar (← / → ile gezinme). Gezgin gibi doğal sıralama: "resim2" < "resim10".
// ---------------------------------------------------------------------------
function makeCollator(lang) {
  try { return new Intl.Collator(lang || undefined, { numeric: true, sensitivity: 'base' }); } catch { return new Intl.Collator(undefined, { numeric: true }); }
}

async function listSiblings(file, { lang, includeHidden = false } = {}) {
  const dir = path.dirname(file);
  const name = path.basename(file);
  let dirents = [];
  try { dirents = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return { files: [file], index: 0 }; }
  const col = makeCollator(lang);
  const names = dirents
    .filter((e) => (e.isFile() || e.isSymbolicLink()) && (includeHidden || !e.name.startsWith('.') || e.name === name))
    .filter((e) => !/^(desktop\.ini|thumbs\.db)$/i.test(e.name) || e.name === name)
    .map((e) => e.name)
    .sort(col.compare);
  if (!names.includes(name)) names.push(name);
  const files = names.map((n) => path.join(dir, n));
  return { files, index: names.indexOf(name) };
}

module.exports = { loadPreview, listSiblings, baseInfo, readHead, enabledKinds };
