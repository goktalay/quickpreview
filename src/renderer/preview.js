'use strict';

// Önizleme penceresi. Ana süreç "preview:open" ile dosya yolunu gönderir; tanım preload'da üretilir
// (window.api.load) ve burada türüne göre çizilir. Pencere kapatılınca gizlenir ve içerik temizlenir.

const $ = (s) => document.querySelector(s);
const view = $('#view');
const tools = $('#tools');
const infoEl = $('#info');
const side = $('#side');

let prefs = { types: {}, defaultZoom: 'fit', psdLayers: true, infoPanel: false, textWrap: false, mediaAutoplay: true };
let cur = null;        // { d, ctl } — ctl: görünüm denetleyicisi (zoom, fit, actual, rotate, page, destroy)
let sib = null;        // { dir, files, index }
let token = 0;
let extraInfo = {};    // görünümden sonradan gelen bilgiler (boyutlar, süre, sayfa sayısı…)

const VIEW_ICON = { image: 'image', raster: 'image', psd: 'layers', pdf: 'pdf', svg: 'image', text: 'fileCode', markdown: 'markdown',
  media: 'film', office: 'fileText', archive: 'archive', info: 'file' };
const OFFICE_ICON = { docx: 'fileText', xlsx: 'table', pptx: 'slides' };

// --- Üst çubuk düğmeleri ---------------------------------------------------------------
function setBtn(id, ic, title, fn) {
  const b = $(id);
  b.innerHTML = icon(ic);
  b.title = title;
  b.onclick = fn;
}
setBtn('#btnOpen', 'open', `${t('pv.openDefault')} (Enter)`, () => cur && window.api.openDefault(cur.d.path));
setBtn('#btnReveal', 'reveal', t('pv.reveal'), () => cur && window.api.reveal(cur.d.path));
setBtn('#btnInfo', 'panel', `${t('pv.infoPanel')} (I)`, () => toggleInfo());
setBtn('#btnClose', 'x', `${t('pv.close')} (Esc)`, () => closePreview());
function paintThemeBtn() {
  const dark = !matchMedia('(prefers-color-scheme: light)').matches;
  setBtn('#btnTheme', dark ? 'sun' : 'moon', dark ? t('set.toLight') : t('set.toDark'), () => window.api.setSettings({ appTheme: dark ? 'light' : 'dark' }));
}
matchMedia('(prefers-color-scheme: light)').addEventListener('change', paintThemeBtn);
paintThemeBtn();

$('#navPrev').innerHTML = icon('chevronLeft');
$('#navNext').innerHTML = icon('chevronRight');
$('#navPrev').title = `${t('pv.prev')} (←)`;
$('#navNext').title = `${t('pv.next')} (→)`;
$('#navPrev').onclick = () => go(-1);
$('#navNext').onclick = () => go(1);

// --- Yardımcılar -------------------------------------------------------------------
const exactBytes = (n) => `${Number(n).toLocaleString(LANG)} ${t('unit.bytes')}`;
const dims = (w, hgt) => `⁦${w} × ${hgt}⁩`;
function typeLabel(d) {
  const sub = (d.sub || d.ext || '').toUpperCase();
  if (d.view === 'office' || d.kind === 'office') return t('kind.' + d.sub);
  if (d.kind === 'text') return `${sub || 'TXT'} · ${t(d.lang ? 'kind.code' : 'kind.plain')}`;
  if (d.kind === 'media') return `${sub} · ${t(d.media === 'audio' ? 'kind.audio' : 'kind.video')}`;
  if (d.kind === 'unknown') return d.ext ? `${d.ext.toUpperCase()} · ${t('kind.file')}` : t('kind.file');
  return `${sub} · ${t('kind.' + d.kind)}`;
}
function fmtDuration(sec) {
  if (!Number.isFinite(sec)) return '';
  const s = Math.round(sec);
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return hh ? `${hh}:${String(mm).padStart(2, '0')}:${ss}` : `${mm}:${ss}`;
}
const loading = () => h('<div class="loading"><div class="spin"></div></div>');

// --- Açma, gezinme, kapatma ----------------------------------------------------------
window.api.onOpen(({ path, settings }) => {
  if (settings) prefs = { ...prefs, ...settings };
  open(path, { fresh: true });
});
window.api.onSettingsChanged((s) => {
  if (s && s.preview) prefs = { ...prefs, ...s.preview };
});
window.api.onHidden(() => clearAll());
window.api.getSettings().then((s) => { if (s && s.preview) prefs = { ...prefs, ...s.preview }; });

async function open(path, { fresh = false } = {}) {
  const my = ++token;
  teardown();
  extraInfo = {};
  const name = path.split(/[\\/]/).pop();
  $('#fileName').textContent = name;
  $('#fileName').title = path;
  $('#fileSub').textContent = '';
  $('#fileIcon').innerHTML = icon('file');
  tools.innerHTML = '';
  view.innerHTML = '';
  view.appendChild(loading());
  infoEl.classList.toggle('hidden', !prefs.infoPanel);
  $('#btnInfo').classList.toggle('on', !!prefs.infoPanel);
  window.api.setTitle(name);
  if (fresh || !sib || !sib.files.includes(path)) refreshSiblings(path, my);
  else { sib.index = sib.files.indexOf(path); paintNav(); }

  let d = null;
  try {
    d = await window.api.load(path, prefs);
  } catch (e) {
    d = { path, name, ext: '', size: 0, kind: 'unknown', view: 'info', reason: 'error', error: String(e && e.message || e) };
  }
  if (!d || my !== token) return;
  render(d);
}

async function refreshSiblings(path, my) {
  sib = null;
  paintNav();
  try {
    const r = await window.api.siblings(path);
    if (my !== token) return;
    sib = r;
    paintNav();
    paintSub();
  } catch { /* klasör okunamadı: gezinme yok */ }
}

function paintNav() {
  const n = sib ? sib.files.length : 0;
  const i = sib ? sib.index : 0;
  $('#navPrev').classList.toggle('hidden', n < 2);
  $('#navNext').classList.toggle('hidden', n < 2);
  $('#navPrev').disabled = i <= 0;
  $('#navNext').disabled = i >= n - 1;
}

function go(delta) {
  if (!sib) return;
  const i = sib.index + delta;
  if (i < 0 || i >= sib.files.length) return;
  sib.index = i;
  open(sib.files[i]);
}

function closePreview() { window.api.close(); }

function teardown() {
  if (cur && cur.ctl && cur.ctl.destroy) { try { cur.ctl.destroy(); } catch { /* yok say */ } }
  cur = null;
  side.classList.add('hidden');
  side.innerHTML = '';
}

function clearAll() {
  token++;
  teardown();
  view.innerHTML = '<div class="empty"></div>';
  tools.innerHTML = '';
  infoEl.innerHTML = '';
  $('#fileName').textContent = '';
  $('#fileSub').textContent = '';
  sib = null;
  paintNav();
  window.api.setTitle('');
}

// --- Alt başlık (tür · boyutlar · dosya boyutu · sıra) --------------------------------
function paintSub() {
  if (!cur) return;
  const d = cur.d;
  const parts = [`<b>${esc(typeLabel(d))}</b>`];
  if (extraInfo.width) parts.push(esc(dims(extraInfo.width, extraInfo.height)));
  if (extraInfo.pages) parts.push(esc(t('pv.pagesN', { n: extraInfo.pages })));
  if (extraInfo.duration) parts.push(esc(fmtDuration(extraInfo.duration)));
  if (d.view === 'text' && d.lines) parts.push(esc(t('pv.linesN', { n: d.lines.toLocaleString(LANG) })));
  parts.push(esc(formatSize(d.size)));
  if (sib && sib.files.length > 1) parts.push(esc(`${sib.index + 1} / ${sib.files.length}`));
  $('#fileSub').innerHTML = parts.join(' · ');
}

// --- Çizim -----------------------------------------------------------------------------
function render(d) {
  teardown();
  view.innerHTML = '';
  tools.innerHTML = '';
  cur = { d, ctl: null };
  $('#fileIcon').innerHTML = icon(d.view === 'office' ? OFFICE_ICON[d.sub] || 'fileText' : VIEW_ICON[d.view] || 'file');
  const fn = RENDER[d.view] || RENDER.info;
  try {
    cur.ctl = fn(d) || null;
  } catch (e) {
    cur.ctl = RENDER.info({ ...d, view: 'info', reason: 'error', error: e.message });
  }
  paintSub();
  paintInfo();
}

// Sahne tabanlı görünümlerin araç çubuğu: −  %  +  | sığdır  1:1  döndür
function zoomTools(stage, extra = []) {
  const bar = document.createDocumentFragment();
  const btn = (ic, title, fn) => { const b = h(`<button class="icon-btn" title="${esc(title)}">${icon(ic)}</button>`); b.onclick = fn; return b; };
  const val = h(`<span class="zoom-val" title="${esc(t('pv.zoomFit'))} (0)"></span>`);
  val.onclick = () => stage.fit();
  bar.append(btn('zoomOut', `${t('pv.zoomOut')} (−)`, () => stage.zoomStep(-1)), val, btn('zoomIn', `${t('pv.zoomIn')} (+)`, () => stage.zoomStep(1)),
    h('<span class="sep"></span>'), btn('fit', `${t('pv.zoomFit')} (0)`, () => stage.fit()), btn('actual', `${t('pv.zoomActual')} (1)`, () => stage.actual()),
    btn('rotate', `${t('pv.rotate')} (R)`, () => stage.rotate(90)));
  for (const x of extra) bar.append(x);
  tools.appendChild(bar);
  const paint = () => { val.textContent = `${Math.round(stage.scale * 100)}%`; };
  return paint;
}

const stageCtl = (stage, more = {}) => ({
  zoom: (dir) => stage.zoomStep(dir),
  fit: () => stage.fit(),
  actual: () => stage.actual(),
  rotate: () => stage.rotate(90),
  destroy: () => stage.destroy(),
  ...more,
});

function newStage(opts) {
  let paint = () => {};
  const stage = new Stage(view, { mode: prefs.defaultZoom, ...opts, onChange: (s) => { paint(); if (opts.onChange) opts.onChange(s); } });
  paint = zoomTools(stage, opts.extraTools || []);
  return stage;
}

const RENDER = {};

// Resim (Chromium'un açtıkları): <img>
RENDER.image = (d) => {
  const stage = newStage({ checker: true, pixelate: true });
  const img = new Image();
  img.decoding = 'async';
  img.draggable = false;
  view.firstElementChild && view.appendChild(loading());
  img.onload = () => {
    view.querySelectorAll('.loading').forEach((x) => x.remove());
    stage.setContent(img, img.naturalWidth, img.naturalHeight);
    extraInfo.width = img.naturalWidth;
    extraInfo.height = img.naturalHeight;
    paintSub();
    paintInfo();
  };
  img.onerror = () => { stage.destroy(); render({ ...d, view: 'info', reason: 'error', error: 'image_decode' }); };
  img.src = d.url;
  return stageCtl(stage);
};

// Çözülmüş pikseller (TIFF, HEIC, PSD): tuvale çiz
function rasterCanvas(d) {
  const c = document.createElement('canvas');
  c.width = d.width;
  c.height = d.height;
  const data = d.data instanceof Uint8ClampedArray ? d.data : new Uint8ClampedArray(d.data);
  c.getContext('2d').putImageData(new ImageData(data, d.width, d.height), 0, 0);
  return c;
}

RENDER.raster = (d) => {
  const stage = newStage({ checker: true, pixelate: true });
  stage.setContent(rasterCanvas(d), d.width, d.height);
  extraInfo.width = d.width;
  extraInfo.height = d.height;
  if (d.pages > 1) extraInfo.tiffPages = d.pages;
  return stageCtl(stage);
};

RENDER.psd = (d) => {
  const ctl = RENDER.raster(d);
  extraInfo.psd = d.info;
  return ctl;
};

// SVG: resim olarak (betik çalışmaz) ya da kaynak kodu
RENDER.svg = (d) => {
  let mode = 'image';
  let inner = null;
  const seg = h(`<div class="seg"><button data-v="image">${esc(t('pv.image'))}</button><button data-v="source">${esc(t('pv.source'))}</button></div>`);
  const show = () => {
    seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === mode));
    if (inner && inner.destroy) inner.destroy();
    view.innerHTML = '';
    tools.innerHTML = '';
    tools.appendChild(seg);
    tools.appendChild(h('<span class="sep"></span>'));
    if (mode === 'image') {
      const stage = newStage({ upscale: true, checker: true });
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth || 512;
        const hh = img.naturalHeight || 512;
        stage.setContent(img, w, hh);
        extraInfo.width = img.naturalWidth || null;
        extraInfo.height = img.naturalHeight || null;
        paintSub();
        paintInfo();
      };
      img.onerror = () => { mode = 'source'; show(); };
      img.src = d.url;
      inner = stageCtl(stage);
    } else {
      inner = textView(d.source);
    }
  };
  seg.querySelectorAll('button').forEach((b) => (b.onclick = () => { mode = b.dataset.v; show(); }));
  show();
  return {
    zoom: (x) => inner.zoom && inner.zoom(x), fit: () => inner.fit && inner.fit(), actual: () => inner.actual && inner.actual(),
    rotate: () => inner.rotate && inner.rotate(), destroy: () => inner.destroy && inner.destroy(),
  };
};

// --- Metin ve kod ----------------------------------------------------------------------
function textView(src, { wrapTool = true } = {}) {
  let size = 13;
  let wrap = !!prefs.textWrap;
  const box = h('<div class="with-banner"><div class="grow"></div></div>');
  if (src.truncated) box.insertBefore(h(`<div class="banner">${icon('alert')}<span>${esc(t('pv.truncated', { size: formatSize(2 * 1024 * 1024) }))}</span></div>`), box.firstChild);
  const tv = h('<div class="text-view" tabindex="0"><pre class="gutter"></pre><pre class="code"><code class="hljs"></code></pre></div>');
  const n = Math.max(1, src.lines || 1);
  let g = '';
  for (let i = 1; i <= n; i++) g += i + '\n';
  tv.querySelector('.gutter').textContent = g;
  tv.querySelector('code').innerHTML = src.html;
  box.querySelector('.grow').appendChild(tv);
  view.appendChild(box);
  const apply = () => { tv.style.setProperty('--code-size', `${size}px`); tv.classList.toggle('wrap', wrap); if (wb) wb.classList.toggle('on', wrap); };
  let wb = null;
  if (wrapTool) {
    wb = h(`<button class="icon-btn" title="${esc(t('pv.textWrap'))} (W)">${icon('wrap')}</button>`);
    wb.onclick = () => { wrap = !wrap; apply(); window.api.setPrefs({ textWrap: wrap }); prefs.textWrap = wrap; };
    const zo = h(`<button class="icon-btn" title="${esc(t('pv.zoomOut'))} (−)">${icon('zoomOut')}</button>`);
    const zi = h(`<button class="icon-btn" title="${esc(t('pv.zoomIn'))} (+)">${icon('zoomIn')}</button>`);
    zo.onclick = () => ctl.zoom(-1);
    zi.onclick = () => ctl.zoom(1);
    tools.append(zo, zi, wb);
  }
  apply();
  const ctl = {
    zoom: (dir) => { size = Math.min(32, Math.max(8, size + dir)); apply(); },
    fit: () => { size = 13; apply(); },
    actual: () => { size = 13; apply(); },
    wrap: () => wb && wb.click(),
    destroy: () => box.remove(),
  };
  return ctl;
}

RENDER.text = (d) => {
  extraInfo.encoding = d.encoding;
  return textView(d);
};

// --- Markdown -----------------------------------------------------------------------
RENDER.markdown = (d) => {
  let mode = 'preview';
  let inner = null;
  let size = 15;
  const seg = h(`<div class="seg"><button data-v="preview">${esc(t('pv.rendered'))}</button><button data-v="source">${esc(t('pv.source'))}</button></div>`);
  extraInfo.encoding = d.encoding;
  const toc = (d.toc || []);
  const show = () => {
    seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === mode));
    if (inner && inner.destroy) inner.destroy();
    view.innerHTML = '';
    tools.innerHTML = '';
    tools.appendChild(seg);
    tools.appendChild(h('<span class="sep"></span>'));
    if (mode === 'preview') {
      const dv = h(`<div class="doc-view" tabindex="0"><article class="doc md">${d.html}</article></div>`);
      dv.style.setProperty('--doc-size', `${size}px`);
      dv.addEventListener('click', (e) => {
        const a = e.target.closest('a');
        if (!a) return;
        e.preventDefault();
        const href = a.getAttribute('href') || '';
        if (href.startsWith('#')) {
          const target = dv.querySelector(`[id="${CSS.escape(href.slice(1))}"]`) || [...dv.querySelectorAll('h1,h2,h3,h4')].find((x) => slug(x.textContent) === href.slice(1));
          if (target) target.scrollIntoView({ behavior: 'smooth' });
        } else if (a.dataset.external) window.api.openExternal(href);
      });
      view.appendChild(dv);
      if (toc.length >= 3) {
        side.innerHTML = `<div class="side-title">${esc(t('pv.contents'))}</div><nav class="toc">${toc.map((x) => `<a class="d${x.depth}" data-id="${esc(x.id)}">${esc(x.text)}</a>`).join('')}</nav>`;
        side.querySelectorAll('a').forEach((a) => (a.onclick = () => { const el = dv.querySelector(`#${CSS.escape(a.dataset.id)}`); if (el) el.scrollIntoView({ behavior: 'smooth' }); }));
        side.classList.remove('hidden');
      }
      const zo = h(`<button class="icon-btn" title="${esc(t('pv.zoomOut'))} (−)">${icon('zoomOut')}</button>`);
      const zi = h(`<button class="icon-btn" title="${esc(t('pv.zoomIn'))} (+)">${icon('zoomIn')}</button>`);
      zo.onclick = () => inner.zoom(-1);
      zi.onclick = () => inner.zoom(1);
      tools.append(zo, zi);
      inner = {
        zoom: (dir) => { size = Math.min(28, Math.max(10, size + dir)); dv.style.setProperty('--doc-size', `${size}px`); },
        fit: () => { size = 15; dv.style.setProperty('--doc-size', '15px'); },
        actual: () => { size = 15; dv.style.setProperty('--doc-size', '15px'); },
        destroy: () => { dv.remove(); side.classList.add('hidden'); side.innerHTML = ''; },
      };
    } else {
      side.classList.add('hidden');
      inner = textView(d.source);
    }
  };
  seg.querySelectorAll('button').forEach((b) => (b.onclick = () => { mode = b.dataset.v; show(); }));
  show();
  return { zoom: (x) => inner.zoom(x), fit: () => inner.fit(), actual: () => inner.actual(), destroy: () => inner.destroy() };
};
const slug = (s) => String(s).trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');

// --- PDF (pdf.js): sayfa sayfa resim görünümü + küçük resim şeridi ------------------------
let pdfjsPromise = null;
function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('../../node_modules/pdfjs-dist/build/pdf.mjs').then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('../../node_modules/pdfjs-dist/build/pdf.worker.mjs', location.href).href;
      return pdfjs;
    });
  }
  return pdfjsPromise;
}
// Karakter eşlemleri ve standart yazı tipleri ağdan değil, uygulama paketinden (preload) okunur
class QPCMapReader { constructor() {} async fetch({ name }) { return { cMapData: await window.api.pdfAsset('cmap', `${name}.bcmap`), isCompressed: true }; } }
class QPFontReader { constructor() {} async fetch({ filename }) { return window.api.pdfAsset('font', filename); } }

const PDF_BASE = 96 / 72;                 // %100 = ekranda gerçek boyut
const PDF_MAX_PIXELS = 24 * 1024 * 1024;  // tek sayfa tuvali için üst sınır

RENDER.pdf = (d) => {
  let doc = null;
  let pageNo = 1;
  let destroyed = false;
  let task = null;
  let timer = null;
  const canvas = document.createElement('canvas');
  const pageVal = h('<span class="page-val"></span>');
  const prevB = h(`<button class="icon-btn" title="${esc(t('pv.prevPage'))} (PgUp)">${icon('chevronUp')}</button>`);
  const nextB = h(`<button class="icon-btn" title="${esc(t('pv.nextPage'))} (PgDn)">${icon('chevronDown')}</button>`);
  const stage = newStage({ upscale: true, shadow: true, page: true, extraTools: [h('<span class="sep"></span>'), prevB, pageVal, nextB],
    onChange: () => schedule() });
  view.appendChild(loading());

  async function draw() {
    if (!doc || destroyed) return;
    const page = await doc.getPage(pageNo);
    if (destroyed) return;
    const base = page.getViewport({ scale: PDF_BASE });
    let s = stage.scale * (window.devicePixelRatio || 1);
    const px = base.width * base.height * s * s;
    if (px > PDF_MAX_PIXELS) s *= Math.sqrt(PDF_MAX_PIXELS / px);
    const vp = page.getViewport({ scale: PDF_BASE * s });
    if (task) { try { task.cancel(); } catch { /* yok */ } }
    const off = document.createElement('canvas');
    off.width = Math.max(1, Math.floor(vp.width));
    off.height = Math.max(1, Math.floor(vp.height));
    task = page.render({ canvasContext: off.getContext('2d'), viewport: vp, background: '#ffffff' });
    try { await task.promise; } catch { return; }
    if (destroyed) return;
    canvas.width = off.width;
    canvas.height = off.height;
    canvas.getContext('2d').drawImage(off, 0, 0);
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(draw, 90); }

  async function showPage(n, { keepView = false } = {}) {
    if (!doc) return;
    pageNo = Math.min(doc.numPages, Math.max(1, n));
    const page = await doc.getPage(pageNo);
    if (destroyed) return;
    const base = page.getViewport({ scale: PDF_BASE });
    stage.setContent(canvas, base.width, base.height, { keepView });
    pageVal.textContent = `${pageNo} / ${doc.numPages}`;
    prevB.disabled = pageNo <= 1;
    nextB.disabled = pageNo >= doc.numPages;
    side.querySelectorAll('.thumb').forEach((x) => x.classList.toggle('on', Number(x.dataset.p) === pageNo));
    const on = side.querySelector('.thumb.on');
    if (on) on.scrollIntoView({ block: 'nearest' });
    if (!extraInfo.width) { extraInfo.width = Math.round(base.width * 72 / 96); extraInfo.height = Math.round(base.height * 72 / 96); extraInfo.pdfUnits = true; }
    draw();
  }
  prevB.onclick = () => showPage(pageNo - 1, { keepView: true });
  nextB.onclick = () => showPage(pageNo + 1, { keepView: true });

  // Küçük resimler: görününce sırayla çizilir
  function buildThumbs() {
    side.innerHTML = '';
    const n = Math.min(doc.numPages, 2000);
    const queue = [];
    let busy = false;
    const pump = async () => {
      if (busy || destroyed) return;
      const btn = queue.shift();
      if (!btn) return;
      busy = true;
      try {
        const page = await doc.getPage(Number(btn.dataset.p));
        const vp1 = page.getViewport({ scale: 1 });
        const vp = page.getViewport({ scale: (136 * (window.devicePixelRatio || 1)) / vp1.width });
        const c = document.createElement('canvas');
        c.width = Math.floor(vp.width);
        c.height = Math.floor(vp.height);
        await page.render({ canvasContext: c.getContext('2d'), viewport: vp, background: '#ffffff' }).promise;
        if (!destroyed) btn.querySelector('.ph').replaceWith(c);
      } catch { /* küçük resim çizilemedi */ }
      busy = false;
      pump();
    };
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting && !e.target.dataset.q) { e.target.dataset.q = '1'; queue.push(e.target); io.unobserve(e.target); }
      }
      pump();
    }, { root: side, rootMargin: '200px' });
    for (let i = 1; i <= n; i++) {
      const b = h(`<button class="thumb" data-p="${i}"><div class="ph"></div><span>${i}</span></button>`);
      b.onclick = () => showPage(i, { keepView: false });
      side.appendChild(b);
      io.observe(b);
    }
    side.classList.remove('hidden');
    cleanupIo = () => io.disconnect();
  }
  let cleanupIo = () => {};

  (async () => {
    try {
      const pdfjs = await loadPdfjs();
      const loadingTask = pdfjs.getDocument({
        data: d.data, isEvalSupported: false, useWorkerFetch: false, disableAutoFetch: true,
        CMapReaderFactory: QPCMapReader, StandardFontDataFactory: QPFontReader, cMapUrl: 'qp:', cMapPacked: true, standardFontDataUrl: 'qp:',
      });
      ctl.loadingTask = loadingTask;
      doc = await loadingTask.promise;
      if (destroyed) { doc.destroy(); return; }
      view.querySelectorAll('.loading').forEach((x) => x.remove());
      extraInfo.pages = doc.numPages;
      try {
        const meta = await doc.getMetadata();
        const inf = (meta && meta.info) || {};
        extraInfo.pdf = { title: inf.Title || '', author: inf.Author || '', producer: inf.Producer || '', creator: inf.Creator || '', version: inf.PDFFormatVersion || '' };
      } catch { /* üst veri yok */ }
      if (doc.numPages > 1) buildThumbs();
      await showPage(1);
      paintSub();
      paintInfo();
    } catch (e) {
      if (destroyed) return;
      stage.destroy();
      render({ ...d, data: null, view: 'info', reason: 'error', error: e && e.name === 'PasswordException' ? 'pdf_password' : (e && e.message) || 'pdf_error' });
    }
  })();

  const ctl = stageCtl(stage, {
    page: (dir) => showPage(pageNo + dir, { keepView: true }),
    pageTo: (n) => showPage(n),
    destroy: () => {
      destroyed = true;
      clearTimeout(timer);
      cleanupIo();
      if (task) { try { task.cancel(); } catch { /* yok */ } }
      if (doc) doc.destroy();
      else if (ctl.loadingTask) ctl.loadingTask.destroy();
      stage.destroy();
    },
  });
  return ctl;
};

// --- Video ve ses -------------------------------------------------------------------
RENDER.media = (d) => {
  const isVideo = d.media === 'video';
  const box = h(`<div class="media-view ${isVideo ? '' : 'audio'}"></div>`);
  let el;
  if (isVideo) {
    el = h('<video controls preload="metadata"></video>');
    box.appendChild(el);
  } else {
    const card = h(`<div class="audio-card"><div class="art">${icon('music')}</div><div class="ttl ltr"></div><audio controls preload="metadata"></audio></div>`);
    card.querySelector('.ttl').textContent = d.name;
    box.appendChild(card);
    el = card.querySelector('audio');
  }
  el.autoplay = !!prefs.mediaAutoplay;
  el.onloadedmetadata = () => {
    extraInfo.duration = el.duration;
    if (isVideo && el.videoWidth) { extraInfo.width = el.videoWidth; extraInfo.height = el.videoHeight; }
    paintSub();
    paintInfo();
  };
  el.onerror = () => render({ ...d, view: 'info', reason: 'media_unsupported' });
  el.src = d.url;
  view.appendChild(box);
  return {
    destroy: () => { try { el.pause(); el.removeAttribute('src'); el.load(); } catch { /* yok */ } box.remove(); },
    toggle: () => (el.paused ? el.play() : el.pause()),
  };
};

// --- Office ---------------------------------------------------------------------------
RENDER.office = (d) => {
  const o = d.office;
  extraInfo.office = o.props || {};
  if (o.type === 'xlsx') return sheetView(o);
  const dv = h('<div class="doc-view" tabindex="0"></div>');
  let size = 15;
  const props = [];
  if (o.props && o.props.title) props.push(`<span>${icon('fileText')} ${esc(o.props.title)}</span>`);
  if (o.props && o.props.author) props.push(`<span>${icon('user')} ${esc(o.props.author)}</span>`);
  if (o.type === 'docx') {
    const html = o.blocks.map((b) => {
      if (b.type === 'table') return `<table>${b.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table>`;
      if (b.type === 'title') return `<div class="title">${esc(b.text)}</div>`;
      if (/^h[1-6]$/.test(b.type)) return `<${b.type}>${esc(b.text)}</${b.type}>`;
      if (b.type === 'li') return `<div class="li">${esc(b.text)}</div>`;
      return `<p>${esc(b.text) || '&nbsp;'}</p>`;
    }).join('');
    dv.innerHTML = `<article class="doc paper">${props.length ? `<div class="doc-props">${props.join('')}</div>` : ''}${html || `<p class="slide-empty">${esc(t('pv.emptyDoc'))}</p>`}${o.truncated ? `<p class="slide-empty">${esc(t('pv.officeTruncated'))}</p>` : ''}</article>`;
  } else {
    extraInfo.slides = o.slideCount;
    const html = o.slides.map((s, i) => `<div class="slide"><div class="slide-head"><b>${i + 1}</b><span>${esc(t('pv.slideN', { n: i + 1 }))}</span></div>
      <div class="slide-body">${s.title ? `<h2>${esc(s.title)}</h2>` : ''}${s.items.map((it) => `<div class="it l${Math.min(2, it.level)}">${esc(it.text)}</div>`).join('')}
      ${!s.title && !s.items.length ? `<div class="slide-empty">${esc(t('pv.slideEmpty'))}</div>` : ''}</div>
      ${s.notes ? `<div class="slide-notes">${esc(s.notes)}</div>` : ''}</div>`).join('');
    dv.innerHTML = `<div class="slides">${props.length ? `<div class="doc-props">${props.join('')}</div>` : ''}${html}</div>`;
  }
  view.appendChild(dv);
  const apply = () => dv.style.setProperty('--doc-size', `${size}px`);
  const zo = h(`<button class="icon-btn" title="${esc(t('pv.zoomOut'))} (−)">${icon('zoomOut')}</button>`);
  const zi = h(`<button class="icon-btn" title="${esc(t('pv.zoomIn'))} (+)">${icon('zoomIn')}</button>`);
  const ctl = {
    zoom: (dir) => { size = Math.min(28, Math.max(10, size + dir)); apply(); dv.style.zoom = o.type === 'pptx' ? String(size / 15) : ''; },
    fit: () => { size = 15; apply(); dv.style.zoom = ''; },
    actual: () => { size = 15; apply(); dv.style.zoom = ''; },
    destroy: () => dv.remove(),
  };
  zo.onclick = () => ctl.zoom(-1);
  zi.onclick = () => ctl.zoom(1);
  tools.append(zo, zi);
  apply();
  return ctl;
};

function sheetView(o) {
  const box = h('<div class="sheet-view"><div class="sheet-scroll" tabindex="0"></div><div class="sheet-tabs"></div></div>');
  const scroll = box.querySelector('.sheet-scroll');
  const tabs = box.querySelector('.sheet-tabs');
  let idx = 0;
  const isNum = (v) => /^-?\d+([.,]\d+)?(e[+-]?\d+)?$/i.test(v);
  const show = (i) => {
    idx = i;
    const s = o.sheets[i];
    tabs.querySelectorAll('button').forEach((b, j) => b.classList.toggle('on', j === i));
    if (!s || !s.rows.length) { scroll.innerHTML = `<div class="empty">${esc(t('pv.emptySheet'))}</div>`; return; }
    const head = `<thead><tr><th></th>${s.cols.map((c) => `<th>${c}</th>`).join('')}</tr></thead>`;
    const body = s.rows.map((r, ri) => `<tr><th>${ri + 1}</th>${r.map((c) => `<td class="${isNum(c) ? 'num' : ''}" title="${esc(c)}">${esc(c)}</td>`).join('')}</tr>`).join('');
    scroll.innerHTML = `<table class="sheet">${head}<tbody>${body}</tbody></table>${s.truncated ? `<div class="banner">${icon('alert')}<span>${esc(t('pv.sheetTruncated'))}</span></div>` : ''}`;
    scroll.scrollTop = 0;
    scroll.scrollLeft = 0;
  };
  o.sheets.forEach((s, i) => {
    const b = h(`<button type="button"></button>`);
    b.textContent = s.name;
    b.onclick = () => show(i);
    tabs.appendChild(b);
  });
  if (o.sheetCount > o.sheets.length) tabs.appendChild(h(`<span class="pv-sub" style="align-self:center;padding:0 8px">+${o.sheetCount - o.sheets.length}</span>`));
  view.appendChild(box);
  extraInfo.sheets = o.sheetCount;
  show(0);
  return { page: (dir) => show(Math.min(o.sheets.length - 1, Math.max(0, idx + dir))), destroy: () => box.remove() };
}

// --- Arşiv (zip içeriği) -------------------------------------------------------------
RENDER.archive = (d) => {
  const s = d.summary;
  extraInfo.archive = { files: s.files, dirs: s.dirs, size: s.size, csize: s.csize, encrypted: s.encrypted, total: d.total };
  const box = h(`<div class="arc-view"><div class="arc-bar">
      <input class="input" type="search" spellcheck="false" placeholder="${esc(t('pv.filter'))}">
      <span class="spacer"></span>
      <span>${esc(t('pv.archiveSummary', { files: s.files.toLocaleString(LANG), dirs: s.dirs.toLocaleString(LANG), size: formatSize(s.size) }))}</span>
    </div>
    ${d.truncated ? `<div class="banner">${icon('alert')}<span>${esc(t('pv.archiveTruncated', { n: d.entries.length.toLocaleString(LANG), total: d.total.toLocaleString(LANG) }))}</span></div>` : ''}
    <div class="arc-scroll"><table class="arc"><thead><tr><th>${esc(t('pv.colName'))}</th><th>${esc(t('pv.colSize'))}</th><th>${esc(t('pv.colPacked'))}</th><th>${esc(t('pv.colModified'))}</th></tr></thead><tbody></tbody></table></div></div>`);
  const tbody = box.querySelector('tbody');
  const rowHtml = (e) => {
    const i = e.name.replace(/\/$/, '').lastIndexOf('/');
    const dir = i >= 0 ? e.name.slice(0, i + 1) : '';
    const base = e.name.slice(i + 1);
    return `<tr><td class="name"><span class="${e.dir ? 'dir' : ''}">${icon(e.dir ? 'folder' : 'file')}</span><span class="path">${esc(dir)}</span>${esc(base)}${e.encrypted ? ` <span class="lock" title="${esc(t('pv.encrypted'))}">${icon('lock')}</span>` : ''}</td>
      <td class="num">${e.dir ? '' : esc(formatSize(e.size))}</td><td class="num">${e.dir ? '' : esc(formatSize(e.csize))}</td><td class="num">${e.mtime ? esc(formatDate(e.mtime)) : ''}</td></tr>`;
  };
  const paint = (q) => {
    const list = q ? d.entries.filter((e) => e.name.toLowerCase().includes(q)) : d.entries;
    tbody.innerHTML = list.slice(0, 5000).map(rowHtml).join('') || `<tr><td colspan="4" class="empty-note">${esc(t('pv.noMatch'))}</td></tr>`;
  };
  const input = box.querySelector('input');
  input.oninput = () => paint(input.value.trim().toLowerCase());
  paint('');
  view.appendChild(box);
  return { destroy: () => box.remove() };
};

// --- Bilgi kartı: tanınmayan tür, kapalı tür, hata, çok büyük -------------------------
RENDER.info = (d) => {
  const reasonText = {
    unknown: t('pv.reasonUnknown'),
    disabled: t('pv.reasonDisabled'),
    too_large: t('pv.reasonTooLarge'),
    media_unsupported: t('pv.reasonMedia'),
    error: d.error === 'pdf_password' ? t('pv.reasonPassword') : t('pv.reasonError', { msg: d.error || '' }),
  }[d.reason] || t('pv.reasonUnknown');
  const card = h(`<div class="info-view"><div class="info-card">
    <div class="big"><div class="ext">${icon('file')}<span>${esc((d.ext || '?').slice(0, 5))}</span></div>
      <div><div class="nm ltr"></div><div class="ty">${esc(typeLabel(d))} · ${esc(formatSize(d.size))}</div></div></div>
    <dl class="kv">
      <dt>${esc(t('info.size'))}</dt><dd>${esc(exactBytes(d.size))}</dd>
      ${d.mtime ? `<dt>${esc(t('info.modified'))}</dt><dd>${esc(formatDate(d.mtime))}</dd>` : ''}
      ${d.btime ? `<dt>${esc(t('info.created'))}</dt><dd>${esc(formatDate(d.btime))}</dd>` : ''}
    </dl>
    <div class="reason ${d.reason === 'error' || d.reason === 'media_unsupported' ? 'err' : ''}">${icon(d.reason === 'error' ? 'alert' : 'info')}<span></span></div>
    <div class="acts">
      <button class="btn primary" type="button" data-a="open">${icon('open')}${esc(t('pv.openDefault'))}</button>
      <button class="btn" type="button" data-a="reveal">${icon('reveal')}${esc(t('pv.reveal'))}</button>
    </div></div></div>`);
  card.querySelector('.nm').textContent = d.name;
  const rs = card.querySelector('.reason span');
  rs.textContent = reasonText;
  if (d.reason === 'disabled') {
    const a = h(`<a> ${esc(t('pv.openSettings'))}</a>`);
    a.onclick = () => window.api.showSettings();
    rs.appendChild(a);
  }
  card.querySelector('[data-a="open"]').onclick = () => window.api.openDefault(d.path);
  card.querySelector('[data-a="reveal"]').onclick = () => window.api.reveal(d.path);
  view.appendChild(card);
  return { destroy: () => card.remove() };
};

// --- Bilgi paneli ---------------------------------------------------------------------
function toggleInfo(force) {
  const on = force === undefined ? infoEl.classList.contains('hidden') : force;
  infoEl.classList.toggle('hidden', !on);
  $('#btnInfo').classList.toggle('on', on);
  prefs.infoPanel = on;
  window.api.setPrefs({ infoPanel: on });
  paintInfo();
}

function paintInfo() {
  if (!cur || infoEl.classList.contains('hidden')) return;
  const d = cur.d;
  const x = extraInfo;
  const rows = [];
  const row = (k, v, cls = '') => v !== undefined && v !== null && v !== '' && rows.push(`<dt>${esc(k)}</dt><dd class="${cls}">${esc(v)}</dd>`);
  row(t('info.type'), typeLabel(d));
  row(t('info.size'), `${formatSize(d.size)} (${exactBytes(d.size)})`);
  if (x.width) row(x.pdfUnits ? t('info.pageSize') : t('info.dimensions'), `${dims(x.width, x.height)}${x.pdfUnits ? ' pt' : ' px'}`);
  if (x.pages) row(t('info.pages'), x.pages);
  if (x.tiffPages) row(t('info.pages'), x.tiffPages);
  if (x.duration) row(t('info.duration'), fmtDuration(x.duration));
  if (x.encoding) row(t('info.encoding'), x.encoding);
  if (d.view === 'text' || (d.view === 'markdown' && d.source)) row(t('info.lines'), (d.lines || (d.source && d.source.lines) || 0).toLocaleString(LANG));
  if (d.view === 'text' && d.lang) row(t('info.language'), d.lang);
  row(t('info.modified'), d.mtime ? formatDate(d.mtime) : '');
  row(t('info.created'), d.btime ? formatDate(d.btime) : '');
  if (d.readonly) row(t('info.attributes'), t('info.readonly'));

  const secs = [`<div class="info-sec"><h3>${icon('info')}${esc(t('info.file'))}</h3><dl class="kv">${rows.join('')}</dl></div>`];
  secs.push(`<div class="info-sec"><h3>${icon('folder')}${esc(t('info.location'))}</h3><div class="path-box"><span class="ltr" id="ipath"></span>
    <button class="icon-btn" id="icopy" title="${esc(t('info.copyPath'))}">${icon('copy')}</button></div></div>`);

  const extra = [];
  const xrow = (k, v) => v !== undefined && v !== null && v !== '' && extra.push(`<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`);
  if (x.psd) {
    xrow(t('info.colorMode'), x.psd.colorMode);
    xrow(t('info.bitDepth'), `${x.psd.bitsPerChannel}-bit`);
    xrow(t('info.layers'), x.psd.layerCount);
    if (x.psd.resolution) xrow(t('info.resolution'), `${x.psd.resolution} ppi`);
  }
  if (x.pdf) {
    xrow(t('info.title'), x.pdf.title);
    xrow(t('info.author'), x.pdf.author);
    xrow(t('info.producer'), x.pdf.producer || x.pdf.creator);
    xrow('PDF', x.pdf.version);
  }
  if (x.office) {
    xrow(t('info.title'), x.office.title);
    xrow(t('info.author'), x.office.author);
    xrow(t('info.lastModifiedBy'), x.office.lastModifiedBy);
    if (x.office.pages) xrow(t('info.pages'), x.office.pages);
    if (x.sheets) xrow(t('info.sheets'), x.sheets);
    if (x.slides) xrow(t('info.slides'), x.slides);
  }
  if (x.archive) {
    xrow(t('info.files'), x.archive.files.toLocaleString(LANG));
    xrow(t('info.folders'), x.archive.dirs.toLocaleString(LANG));
    xrow(t('info.unpacked'), formatSize(x.archive.size));
    if (x.archive.size) xrow(t('info.ratio'), `${Math.round((1 - x.archive.csize / x.archive.size) * 100)}%`);
    if (x.archive.encrypted) xrow(t('info.attributes'), t('pv.encrypted'));
  }
  if (extra.length) secs.push(`<div class="info-sec"><h3>${icon('sliders')}${esc(t('info.details'))}</h3><dl class="kv">${extra.join('')}</dl></div>`);

  if (d.view === 'psd') {
    if (d.layers && d.layers.length) {
      secs.push(`<div class="info-sec"><h3>${icon('layers')}${esc(t('info.layerList'))}</h3><ul class="layers">${d.layers.slice(0, 1000).map((l) => `
        <li class="${l.effectiveHidden ? 'off' : ''} ${l.group ? 'group' : ''}" style="padding-inline-start:${8 + l.depth * 14}px">
          ${icon(l.group ? 'folder' : l.text ? 'fileText' : l.hidden ? 'eyeOff' : 'image')}<span class="ln" title="${esc(l.name)}">${esc(l.name || '—')}</span>
          ${l.opacity < 1 ? `<span class="op">${Math.round(l.opacity * 100)}%</span>` : ''}</li>`).join('')}</ul>
        ${d.approximate ? `<div class="note-sm warn">${esc(t('info.psdApprox'))}</div>` : ''}</div>`);
    } else if (d.approximate) {
      secs.push(`<div class="note-sm warn">${esc(t('info.psdApprox'))}</div>`);
    }
  }
  secs.push(`<div class="note-sm">${icon('shield')} ${esc(t('privacy.short'))}</div>`);
  infoEl.innerHTML = secs.join('');
  infoEl.querySelector('#ipath').textContent = d.path;
  infoEl.querySelector('#icopy').onclick = () => { window.api.copyPath(d.path); toast(t('info.copied'), { type: 'ok', timeout: 1400 }); };
}

// --- Klavye ------------------------------------------------------------------------------
document.addEventListener('keydown', (e) => {
  const tag = (e.target && e.target.tagName) || '';
  const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  const c = cur && cur.ctl;
  if (e.key === 'Escape') {
    if (typing && e.target.value) return; // arama kutusunu önce boşalt
    e.preventDefault();
    return closePreview();
  }
  if (typing) return;
  if (e.ctrlKey && (e.key === '+' || e.key === '=' || e.key === '-' || e.key === '0')) {
    e.preventDefault();
    if (!c) return;
    if (e.key === '0') return c.fit && c.fit();
    return c.zoom && c.zoom(e.key === '-' ? -1 : 1);
  }
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  switch (e.key) {
    case ' ':
    case 'Spacebar':
      e.preventDefault();
      return closePreview();
    case 'ArrowLeft': e.preventDefault(); return go(document.dir === 'rtl' ? 1 : -1);
    case 'ArrowRight': e.preventDefault(); return go(document.dir === 'rtl' ? -1 : 1);
    case 'PageUp': if (c && c.page) { e.preventDefault(); c.page(-1); } return;
    case 'PageDown': if (c && c.page) { e.preventDefault(); c.page(1); } return;
    case 'Home': if (c && c.pageTo) { e.preventDefault(); c.pageTo(1); } return;
    case 'End': if (c && c.pageTo) { e.preventDefault(); c.pageTo(Infinity); } return;
    case '+': case '=': if (c && c.zoom) { e.preventDefault(); c.zoom(1); } return;
    case '-': case '_': if (c && c.zoom) { e.preventDefault(); c.zoom(-1); } return;
    case '0': if (c && c.fit) { e.preventDefault(); c.fit(); } return;
    case '1': if (c && c.actual) { e.preventDefault(); c.actual(); } return;
    case 'r': case 'R': if (c && c.rotate) { e.preventDefault(); c.rotate(); } return;
    case 'w': case 'W': if (c && c.wrap) { e.preventDefault(); c.wrap(); } return;
    case 'i': case 'I': e.preventDefault(); return toggleInfo();
    case 'f': case 'F': case 'F11': e.preventDefault(); return window.api.toggleFullscreen();
    case 'Enter': if (cur) { e.preventDefault(); window.api.openDefault(cur.d.path); } return;
    default:
  }
});

// Fare: geri/ileri düğmeleri önceki/sonraki dosya
window.addEventListener('mouseup', (e) => {
  if (e.button === 3) go(-1);
  if (e.button === 4) go(1);
});

view.innerHTML = '<div class="empty"></div>';
