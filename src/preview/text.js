'use strict';

// Metin, kod ve Markdown önizlemesi: kodlama algılama, söz dizimi renklendirme (highlight.js) ve güvenli
// Markdown (marked). Önizleme salt okunurdur. Markdown'daki ham HTML çalıştırılmaz (metin olarak gösterilir),
// bağlantılar yalnız http/https/mailto olabilir ve uzak resimler yüklenmez: dosya içeriği hiçbir yere istek yaptırmaz.

const path = require('path');
const { pathToFileURL } = require('url');

const MAX_TEXT_BYTES = 2 * 1024 * 1024;     // daha büyük dosyaların başı gösterilir
const MAX_HIGHLIGHT_BYTES = 512 * 1024;     // daha büyükte renklendirme yapılmaz (hız)
const AUTO_DETECT_BYTES = 64 * 1024;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Kodlama: BOM → geçerli UTF-8 → Windows-1254 (Türkçe; Batı Avrupa karakterlerini de kapsar)
function decodeText(buf) {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return { text: buf.toString('utf8', 3), encoding: 'UTF-8 BOM' };
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return { text: new TextDecoder('utf-16le').decode(buf.subarray(2)), encoding: 'UTF-16 LE' };
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) return { text: new TextDecoder('utf-16be').decode(buf.subarray(2)), encoding: 'UTF-16 BE' };
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(buf), encoding: 'UTF-8' };
  } catch {
    // Kesilmiş dosyada son karakter yarım kalmış olabilir
    try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(trimPartialUtf8(buf)), encoding: 'UTF-8' }; } catch { /* değil */ }
  }
  try { return { text: new TextDecoder('windows-1254').decode(buf), encoding: 'Windows-1254' }; } catch { /* ICU yoksa */ }
  return { text: buf.toString('latin1'), encoding: 'ISO-8859-1' };
}

function trimPartialUtf8(buf) {
  let end = buf.length;
  for (let i = 1; i <= 3 && end - i >= 0; i++) {
    const b = buf[end - i];
    if ((b & 0xc0) === 0x80) continue;           // devam baytı
    if ((b & 0xc0) === 0xc0) return buf.subarray(0, end - i); // yarım kalan başlangıç baytı
    break;
  }
  return buf;
}

let hljs = null;
const highlighter = () => (hljs = hljs || require('highlight.js/lib/common'));
// common paketinde olmayan ama uzantı tablosunda geçen diller
const EXTRA_LANGS = ['powershell', 'dos', 'dockerfile', 'cmake', 'fsharp', 'vbnet', 'vbscript', 'x86asm', 'latex', 'protobuf', 'erb', 'elixir',
  'erlang', 'haskell', 'clojure', 'nim', 'apache', 'nginx', 'properties', 'groovy', 'scala', 'dart', 'gradle'];
function ensureLanguage(lang) {
  const h = highlighter();
  if (!lang || h.getLanguage(lang)) return !!lang;
  if (!EXTRA_LANGS.includes(lang)) return false;
  try { h.registerLanguage(lang, require(`highlight.js/lib/languages/${lang}`)); return true; } catch { return false; }
}

// Kod/metin → { html, lines, lang } (html satır satır değil, <pre><code> içine konur)
function highlight(text, lang, { auto = false } = {}) {
  if (text.length > MAX_HIGHLIGHT_BYTES) return { html: esc(text), lang: lang || '' };
  const h = highlighter();
  if (lang && ensureLanguage(lang)) {
    try { return { html: h.highlight(text, { language: lang, ignoreIllegals: true }).value, lang }; } catch { /* düz metne düş */ }
  }
  if (auto && text.length <= AUTO_DETECT_BYTES) {
    const r = h.highlightAuto(text, ['json', 'xml', 'javascript', 'python', 'bash', 'ini', 'yaml', 'sql', 'css', 'cpp', 'csharp', 'java', 'php']);
    if (r.relevance >= 8) return { html: r.value, lang: r.language };
  }
  return { html: esc(text), lang: '' };
}

// Satır sayısı (Gezgin/editörler gibi: sondaki satır sonu yeni bir satır sayılmaz)
const countLines = (s) => { let n = 1; for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10) n++; return s.endsWith('\n') && n > 1 ? n - 1 : n; };

// buf: dosyanın başı (en çok MAX_TEXT_BYTES), size: gerçek boyut
function renderText(buf, { lang = '', size = buf.length, auto = false } = {}) {
  const truncated = size > buf.length;
  const { text, encoding } = decodeText(truncated ? trimPartialUtf8(buf) : buf);
  const clean = text.replace(/\r\n?/g, '\n');
  const out = highlight(clean, lang, { auto: auto && !lang });
  return { html: out.html, lang: out.lang, lines: countLines(clean), chars: clean.length, encoding, truncated };
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------
const SAFE_LINK = /^(https?:|mailto:|#)/i;

function safeHref(href) {
  const h = String(href || '').trim();
  return SAFE_LINK.test(h) ? h : null;
}

// Yerel resim: Markdown dosyasının klasörüne göre çözülür; uzak (http) resim yüklenmez
function localImage(src, baseDir) {
  const s = String(src || '').trim();
  if (/^data:image\/(png|jpe?g|gif|webp|svg\+xml);/i.test(s)) return s;
  if (!s || /^[a-z][a-z0-9+.-]*:/i.test(s) && !/^[a-z]:[\\/]/i.test(s)) return null; // http, file, javascript… (C:\ yolu hariç)
  if (!baseDir) return null;
  const p = path.resolve(baseDir, decodeURI(s.split(/[?#]/)[0]));
  return pathToFileURL(p).href;
}

function renderMarkdown(text, { baseDir = null } = {}) {
  const { Marked } = require('marked');
  const md = new Marked({ gfm: true, breaks: false, async: false });
  const toc = [];
  md.use({
    renderer: {
      heading(token) {
        const id = `h-${toc.length + 1}`;
        toc.push({ id, depth: token.depth, text: token.text.replace(/[*_`]/g, '') });
        return `<h${token.depth} id="${id}">${this.parser.parseInline(token.tokens)}</h${token.depth}>\n`;
      },
      html(token) { return esc(token.text || token.raw || ''); },
      link(token) {
        const inner = this.parser.parseInline(token.tokens);
        const href = safeHref(token.href);
        if (!href) return inner;
        return `<a href="${esc(href)}"${token.title ? ` title="${esc(token.title)}"` : ''} data-external="1">${inner}</a>`;
      },
      image(token) {
        const src = localImage(token.href, baseDir);
        const alt = esc(token.text || '');
        if (!src) return `<span class="md-img-blocked" title="${esc(token.href || '')}">🖼 ${alt || esc(token.href || '')}</span>`;
        return `<img src="${esc(src)}" alt="${alt}"${token.title ? ` title="${esc(token.title)}"` : ''}>`;
      },
      code(token) {
        const lang = String(token.lang || '').trim().split(/\s+/)[0].toLowerCase();
        const out = highlight(token.text || '', lang);
        return `<pre><code class="hljs${out.lang ? ` language-${esc(out.lang)}` : ''}">${out.html}</code></pre>\n`;
      },
    },
  });
  const html = md.parse(String(text).replace(/^\uFEFF/, ''));
  // Başlık listesi (yan panelde içindekiler)
  return { html, toc: toc.filter((x) => x.depth <= 3).slice(0, 200) };
}

module.exports = { decodeText, renderText, renderMarkdown, highlight, safeHref, localImage, esc, MAX_TEXT_BYTES };
