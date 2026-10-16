'use strict';

// Dosya türü algılama: önce içerikteki imza (ilk baytlar), sonra uzantı. Uzantısı yanlış ya da hiç olmayan
// dosyalar da doğru gösterilsin diye imza önceliklidir (ör. ".jpg" adlı bir PNG, uzantısız bir PDF).
// Sonuç: { kind, sub, lang? }  kind: önizleyicinin adı (bkz. preview/index.js), sub: biçim, lang: metinde söz dizimi.

const path = require('path');

// Önizleme türleri (Ayarlar › Önizleme'de tek tek kapatılabilir)
const KINDS = ['image', 'psd', 'pdf', 'svg', 'text', 'markdown', 'media', 'office', 'archive'];

// Chromium'un kendisinin gösterdiği resimler
const IMAGE_EXT = { jpg: 'jpeg', jpeg: 'jpeg', jpe: 'jpeg', jfif: 'jpeg', png: 'png', apng: 'png', gif: 'gif', webp: 'webp',
  bmp: 'bmp', dib: 'bmp', ico: 'ico', cur: 'ico', avif: 'avif' };
const TIFF_EXT = { tif: 'tiff', tiff: 'tiff' };
const HEIC_EXT = { heic: 'heic', heif: 'heic', hif: 'heic' };
const PSD_EXT = { psd: 'psd', psb: 'psb' };
const VIDEO_EXT = { mp4: 'mp4', m4v: 'mp4', mov: 'mov', webm: 'webm', ogv: 'ogg', mkv: 'mkv' };
const AUDIO_EXT = { mp3: 'mp3', wav: 'wav', ogg: 'ogg', oga: 'ogg', opus: 'opus', flac: 'flac', m4a: 'm4a', aac: 'aac', weba: 'webm' };
const OFFICE_EXT = { docx: 'docx', docm: 'docx', xlsx: 'xlsx', xlsm: 'xlsx', pptx: 'pptx', pptm: 'pptx' };
const ARCHIVE_EXT = { zip: 'zip', jar: 'zip', apk: 'zip', nupkg: 'zip', vsix: 'zip', xpi: 'zip', epub: 'zip', odt: 'zip', ods: 'zip', odp: 'zip' };
const MARKDOWN_EXT = { md: 'markdown', markdown: 'markdown', mdown: 'markdown', mkd: 'markdown' };

// Metin ve kod: uzantı → highlight.js dili ('' = düz metin)
const CODE_EXT = {
  txt: '', text: '', log: '', csv: '', tsv: '', nfo: '', me: '',
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
  json: 'json', jsonc: 'json', json5: 'json', map: 'json', webmanifest: 'json',
  html: 'xml', htm: 'xml', xhtml: 'xml', xml: 'xml', xsl: 'xml', xsd: 'xml', plist: 'xml', csproj: 'xml', vbproj: 'xml', resx: 'xml', config: 'xml', manifest: 'xml',
  css: 'css', scss: 'scss', sass: 'scss', less: 'less',
  py: 'python', pyw: 'python', rb: 'ruby', php: 'php', java: 'java', kt: 'kotlin', kts: 'kotlin', scala: 'scala', groovy: 'groovy', gradle: 'groovy',
  c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp', hh: 'cpp', hxx: 'cpp', ino: 'cpp', cs: 'csharp', fs: 'fsharp',
  go: 'go', rs: 'rust', swift: 'swift', m: 'objectivec', mm: 'objectivec', dart: 'dart', lua: 'lua', pl: 'perl', pm: 'perl', r: 'r',
  sh: 'bash', bash: 'bash', zsh: 'bash', ps1: 'powershell', psm1: 'powershell', psd1: 'powershell', bat: 'dos', cmd: 'dos',
  sql: 'sql', yml: 'yaml', yaml: 'yaml', toml: 'ini', ini: 'ini', cfg: 'ini', conf: 'ini', properties: 'properties', env: 'bash', reg: 'ini',
  dockerfile: 'dockerfile', makefile: 'makefile', mk: 'makefile', cmake: 'cmake', diff: 'diff', patch: 'diff',
  vb: 'vbnet', vbs: 'vbscript', asm: 'x86asm', s: 'x86asm', tex: 'latex', graphql: 'graphql', gql: 'graphql', proto: 'protobuf',
  vue: 'xml', svelte: 'xml', twig: 'xml', erb: 'erb', ex: 'elixir', exs: 'elixir', erl: 'erlang', hs: 'haskell', clj: 'clojure', nim: 'nim',
  srt: '', vtt: '', gitignore: 'bash', gitattributes: 'bash', editorconfig: 'ini', htaccess: 'apache', nginx: 'nginx',
};
// Uzantısız ama tanınan dosya adları
const CODE_NAMES = { dockerfile: 'dockerfile', makefile: 'makefile', gnumakefile: 'makefile', cmakelists: 'cmake', license: '', readme: '',
  '.gitignore': 'bash', '.gitattributes': 'bash', '.editorconfig': 'ini', '.htaccess': 'apache', '.env': 'bash', '.npmrc': 'ini', '.bashrc': 'bash' };

function extOf(name) {
  const base = path.basename(String(name || '')).toLowerCase();
  const i = base.lastIndexOf('.');
  return i > 0 ? base.slice(i + 1) : '';
}

const ascii = (buf, start, end) => (buf.length >= end ? buf.toString('latin1', start, end) : '');
const startsWith = (buf, bytes, at = 0) => buf.length >= at + bytes.length && bytes.every((b, i) => buf[at + i] === b);

// İçerik imzası → { kind, sub } | null
function sniff(buf) {
  if (!buf || !buf.length) return null;
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { kind: 'image', sub: 'png' };
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return { kind: 'image', sub: 'jpeg' };
  if (ascii(buf, 0, 6) === 'GIF87a' || ascii(buf, 0, 6) === 'GIF89a') return { kind: 'image', sub: 'gif' };
  if (ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 12) === 'WEBP') return { kind: 'image', sub: 'webp' };
  if (ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 12) === 'WAVE') return { kind: 'media', sub: 'wav', media: 'audio' };
  if (ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 12) === 'AVI ') return { kind: 'media', sub: 'avi', media: 'video' };
  if (ascii(buf, 0, 2) === 'BM' && buf.length >= 26) return { kind: 'image', sub: 'bmp' };
  if (startsWith(buf, [0, 0, 1, 0]) || startsWith(buf, [0, 0, 2, 0])) {
    // ICO/CUR: 0,0,(1|2),0, resim sayısı > 0
    const n = buf.length >= 6 ? buf.readUInt16LE(4) : 0;
    if (n > 0 && n < 256) return { kind: 'image', sub: 'ico' };
  }
  if (startsWith(buf, [0x49, 0x49, 0x2a, 0x00]) || startsWith(buf, [0x4d, 0x4d, 0x00, 0x2a])) return { kind: 'image', sub: 'tiff' };
  if (ascii(buf, 0, 4) === '8BPS') return { kind: 'psd', sub: buf.length > 5 && buf[5] === 2 ? 'psb' : 'psd' };
  if (ascii(buf, 0, 5) === '%PDF-') return { kind: 'pdf', sub: 'pdf' };
  if (ascii(buf, 4, 8) === 'ftyp') {
    const brand = ascii(buf, 8, 12);
    if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1', 'heim', 'heis'].includes(brand)) return { kind: 'image', sub: 'heic' };
    if (brand === 'avif' || brand === 'avis') return { kind: 'image', sub: 'avif' };
    if (brand.startsWith('M4A') || brand === 'M4B ') return { kind: 'media', sub: 'm4a', media: 'audio' };
    if (brand === 'qt  ') return { kind: 'media', sub: 'mov', media: 'video' };
    return { kind: 'media', sub: 'mp4', media: 'video' };
  }
  if (startsWith(buf, [0x1a, 0x45, 0xdf, 0xa3])) return { kind: 'media', sub: 'webm', media: 'video' }; // Matroska / WebM
  if (ascii(buf, 0, 4) === 'OggS') return { kind: 'media', sub: 'ogg', media: 'audio' };
  if (ascii(buf, 0, 4) === 'fLaC') return { kind: 'media', sub: 'flac', media: 'audio' };
  if (ascii(buf, 0, 3) === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0 && buf.length > 3 && (buf[1] & 0x06) !== 0)) {
    return { kind: 'media', sub: 'mp3', media: 'audio' };
  }
  if (startsWith(buf, [0x50, 0x4b, 0x03, 0x04]) || startsWith(buf, [0x50, 0x4b, 0x05, 0x06])) return { kind: 'archive', sub: 'zip' };
  return null;
}

// Metin mi? (NUL bayt yok, kontrol karakteri az; UTF-16 BOM da metin sayılır)
function looksText(buf) {
  if (!buf || !buf.length) return true;
  if (startsWith(buf, [0xff, 0xfe]) || startsWith(buf, [0xfe, 0xff])) return true;
  let ctrl = 0;
  const n = Math.min(buf.length, 8192);
  for (let i = 0; i < n; i++) {
    const b = buf[i];
    if (b === 0) return false;
    if (b < 9 || (b > 13 && b < 32 && b !== 27)) ctrl++;
  }
  return ctrl / n < 0.02;
}

const isSvgText = (buf) => /^\s*(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*(?:<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(buf.toString('utf8', 0, Math.min(buf.length, 4096)).replace(/^﻿/, ''));

// name: dosya adı ya da yolu, head: dosyanın ilk baytları (en az 4 KB önerilir)
function detect(name, head) {
  const ext = extOf(name);
  const base = path.basename(String(name || '')).toLowerCase();
  const buf = head ? Buffer.from(head.buffer ? head.buffer : head, head.byteOffset || 0, head.byteLength ?? head.length) : Buffer.alloc(0);
  const s = sniff(buf);

  if (s) {
    // ZIP tabanlı biçimler (Office, EPUB…) uzantıdan ayırt edilir
    if (s.kind === 'archive') {
      if (OFFICE_EXT[ext]) return { kind: 'office', sub: OFFICE_EXT[ext] };
      return { kind: 'archive', sub: 'zip' };
    }
    // mp4 kabı ses de taşıyabilir
    if (s.kind === 'media' && s.sub === 'mp4' && AUDIO_EXT[ext]) return { kind: 'media', sub: AUDIO_EXT[ext], media: 'audio' };
    if (s.kind === 'media' && s.sub === 'webm' && AUDIO_EXT[ext]) return { kind: 'media', sub: 'webm', media: 'audio' };
    if (s.kind === 'media' && s.sub === 'ogg' && VIDEO_EXT[ext]) return { kind: 'media', sub: 'ogg', media: 'video' };
    if (s.kind === 'media' && s.sub === 'mp3' && !AUDIO_EXT[ext] && looksText(buf)) {
      // 0xFFE… ile başlayan bir metin dosyası çok olası değil; yine de metin gibi görünüyorsa metin say
      return textKind(ext, base);
    }
    return s;
  }
  // İmzası olmayan türler: uzantı
  if (ext === 'svg' || ext === 'svgz') return { kind: 'svg', sub: 'svg' };
  if (IMAGE_EXT[ext]) return { kind: 'image', sub: IMAGE_EXT[ext] };
  if (TIFF_EXT[ext]) return { kind: 'image', sub: 'tiff' };
  if (HEIC_EXT[ext]) return { kind: 'image', sub: 'heic' };
  if (PSD_EXT[ext]) return { kind: 'psd', sub: PSD_EXT[ext] };
  if (ext === 'pdf') return { kind: 'pdf', sub: 'pdf' };
  if (OFFICE_EXT[ext]) return { kind: 'office', sub: OFFICE_EXT[ext] };
  if (ARCHIVE_EXT[ext]) return { kind: 'archive', sub: 'zip' };
  if (VIDEO_EXT[ext]) return { kind: 'media', sub: VIDEO_EXT[ext], media: 'video' };
  if (AUDIO_EXT[ext]) return { kind: 'media', sub: AUDIO_EXT[ext], media: 'audio' };
  if (looksText(buf)) {
    if (isSvgText(buf)) return { kind: 'svg', sub: 'svg' };
    return textKind(ext, base);
  }
  return { kind: 'unknown', sub: ext || '' };
}

function textKind(ext, base) {
  if (MARKDOWN_EXT[ext]) return { kind: 'markdown', sub: 'markdown' };
  if (ext in CODE_EXT) return { kind: 'text', sub: ext, lang: CODE_EXT[ext] };
  const bare = base.replace(/\.[^.]*$/, '');
  if (base in CODE_NAMES) return { kind: 'text', sub: base, lang: CODE_NAMES[base] };
  if (bare in CODE_NAMES && !ext) return { kind: 'text', sub: bare, lang: CODE_NAMES[bare] };
  return { kind: 'text', sub: ext || 'txt', lang: '' };
}

module.exports = { detect, sniff, looksText, extOf, KINDS };
