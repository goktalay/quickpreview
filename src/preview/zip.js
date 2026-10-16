'use strict';

// Bağımlılıksız ZIP okuyucu. Yalnız dosyanın sonundaki merkez dizin okunur; böylece çok büyük arşivlerin
// içeriği de belleğe almadan anında listelenir. Office (docx/xlsx/pptx) parçaları da buradan açılır.
// Desteklenen: ZIP64, UTF-8 adlar (bayrak 11), "stored" (0) ve "deflate" (8). Şifreli girdiler listelenir, açılmaz.

const fs = require('fs');
const zlib = require('zlib');

const EOCD_SIG = 0x06054b50;
const EOCD64_LOC_SIG = 0x07064b50;
const EOCD64_SIG = 0x06064b50;
const CEN_SIG = 0x02014b50;
const LOC_SIG = 0x04034b50;
const MAX_ENTRIES = 200000;

// Kaynak: dosya yolu ya da Buffer. Her ikisi için aynı "read(konum, uzunluk)" arayüzü.
function openSource(src) {
  if (Buffer.isBuffer(src)) {
    return { size: src.length, read: (pos, len) => src.subarray(pos, Math.min(src.length, pos + len)), close() {} };
  }
  const fd = fs.openSync(src, 'r');
  const size = fs.fstatSync(fd).size;
  return {
    size,
    read(pos, len) {
      const out = Buffer.alloc(Math.max(0, Math.min(len, size - pos)));
      let off = 0;
      while (off < out.length) {
        const n = fs.readSync(fd, out, off, out.length - off, pos + off);
        if (!n) break;
        off += n;
      }
      return out.subarray(0, off);
    },
    close() { try { fs.closeSync(fd); } catch { /* zaten kapalı */ } },
  };
}

const err = (code) => Object.assign(new Error(code), { code });

// DOS tarih/saat → ms
function dosTime(date, time) {
  if (!date) return null;
  const d = new Date(1980 + (date >> 9), ((date >> 5) & 15) - 1, date & 31, time >> 11, (time >> 5) & 63, (time & 31) * 2);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

// CP437 (eski Windows zip araçları UTF-8 bayrağı koymadan bu kod sayfasıyla yazar)
const CP437_HI = 'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ';
function decodeName(buf, utf8) {
  if (utf8) return buf.toString('utf8');
  // Geçerli UTF-8 ise (çoğu yeni araç bayraksız da UTF-8 yazar) öyle oku
  const s = buf.toString('utf8');
  if (!s.includes('�')) return s;
  let out = '';
  for (const b of buf) out += b < 128 ? String.fromCharCode(b) : CP437_HI[b - 128];
  return out;
}

function findEocd(src) {
  const tail = Math.min(src.size, 22 + 65535);
  const buf = src.read(src.size - tail, tail);
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return { buf, at: i, abs: src.size - tail + i };
  }
  return null;
}

// Arşivdeki girdiler: [{ name, dir, size, csize, method, mtime, encrypted, offset }]
function listEntries(source, { limit = MAX_ENTRIES } = {}) {
  const src = openSource(source);
  try {
    const e = findEocd(src);
    if (!e) throw err('zip_invalid');
    const { buf, at } = e;
    let count = buf.readUInt16LE(at + 10);
    let cdSize = buf.readUInt32LE(at + 12);
    let cdOffset = buf.readUInt32LE(at + 16);
    const comment = buf.toString('utf8', at + 22, at + 22 + buf.readUInt16LE(at + 20));
    // ZIP64: EOCD alanları 0xFFFF/0xFFFFFFFF ise gerçek değerler ZIP64 kaydındadır
    if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
      const loc = src.read(e.abs - 20, 20);
      if (loc.length === 20 && loc.readUInt32LE(0) === EOCD64_LOC_SIG) {
        const rec = src.read(Number(loc.readBigUInt64LE(8)), 56);
        if (rec.length === 56 && rec.readUInt32LE(0) === EOCD64_SIG) {
          count = Number(rec.readBigUInt64LE(32));
          cdSize = Number(rec.readBigUInt64LE(40));
          cdOffset = Number(rec.readBigUInt64LE(48));
        }
      }
    }
    if (cdOffset + cdSize > src.size) throw err('zip_invalid');
    const cd = src.read(cdOffset, cdSize);
    const entries = [];
    let p = 0;
    let truncated = false;
    for (let i = 0; i < count && p + 46 <= cd.length; i++) {
      if (cd.readUInt32LE(p) !== CEN_SIG) break;
      if (entries.length >= limit) { truncated = true; break; }
      const flags = cd.readUInt16LE(p + 8);
      const method = cd.readUInt16LE(p + 10);
      const time = cd.readUInt16LE(p + 12);
      const date = cd.readUInt16LE(p + 14);
      let csize = cd.readUInt32LE(p + 20);
      let size = cd.readUInt32LE(p + 24);
      const nameLen = cd.readUInt16LE(p + 28);
      const extraLen = cd.readUInt16LE(p + 30);
      const commentLen = cd.readUInt16LE(p + 32);
      let offset = cd.readUInt32LE(p + 42);
      const name = decodeName(cd.subarray(p + 46, p + 46 + nameLen), (flags & 0x800) !== 0).replace(/\\/g, '/');
      // ZIP64 ek alanı (0x0001)
      let x = p + 46 + nameLen;
      const xEnd = x + extraLen;
      while (x + 4 <= xEnd) {
        const id = cd.readUInt16LE(x);
        const len = cd.readUInt16LE(x + 2);
        if (id === 0x0001) {
          let q = x + 4;
          if (size === 0xffffffff && q + 8 <= x + 4 + len) { size = Number(cd.readBigUInt64LE(q)); q += 8; }
          if (csize === 0xffffffff && q + 8 <= x + 4 + len) { csize = Number(cd.readBigUInt64LE(q)); q += 8; }
          if (offset === 0xffffffff && q + 8 <= x + 4 + len) { offset = Number(cd.readBigUInt64LE(q)); q += 8; }
        }
        x += 4 + len;
      }
      entries.push({ name, dir: name.endsWith('/'), size, csize, method, mtime: dosTime(date, time), encrypted: (flags & 1) !== 0, offset });
      p += 46 + nameLen + extraLen + commentLen;
    }
    return { entries, count, truncated, comment };
  } finally {
    src.close();
  }
}

// Bir girdinin içeriği (Buffer). maxBytes aşılırsa 'zip_too_large'.
function readEntry(source, entry, { maxBytes = 64 * 1024 * 1024 } = {}) {
  if (entry.encrypted) throw err('zip_encrypted');
  if (entry.size > maxBytes) throw err('zip_too_large');
  const src = openSource(source);
  try {
    const loc = src.read(entry.offset, 30);
    if (loc.length < 30 || loc.readUInt32LE(0) !== LOC_SIG) throw err('zip_invalid');
    const start = entry.offset + 30 + loc.readUInt16LE(26) + loc.readUInt16LE(28);
    const data = src.read(start, entry.csize);
    if (entry.method === 0) return Buffer.from(data);
    if (entry.method === 8) return zlib.inflateRawSync(data, { maxOutputLength: Math.max(1, maxBytes) });
    throw err('zip_method');
  } finally {
    src.close();
  }
}

// Ada göre girdiyi bul ve oku; yoksa null
function readFile(source, name, opts) {
  const { entries } = listEntries(source);
  const e = entries.find((x) => x.name === name);
  return e ? readEntry(source, e, opts) : null;
}

// Liste görünümü için: klasörleri ağaca dökmeden düz liste + özet
function summarize(list) {
  const files = list.entries.filter((e) => !e.dir);
  return {
    files: files.length,
    dirs: list.entries.filter((e) => e.dir).length,
    size: files.reduce((a, e) => a + e.size, 0),
    csize: files.reduce((a, e) => a + e.csize, 0),
    encrypted: files.some((e) => e.encrypted),
  };
}

module.exports = { listEntries, readEntry, readFile, summarize, openSource };
