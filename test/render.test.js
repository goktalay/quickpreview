'use strict';

// PSD / PDF / resim işleme ve önizleme yükleyicisi (preview/index.js): her tür için pencereye giden tanım
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { writePsdBuffer } = require('ag-psd');
const UTIF = require('utif');
const { decodePsd } = require('../src/preview/psd');
const { decodeTiff, decodeHeic } = require('../src/preview/raster');
const { loadPreview, listSiblings } = require('../src/preview');
const text = require('../src/preview/text');
const { makePng, makePdf, makeZip, makeDocx, makeXlsx, makePptx, tmpDir } = require('./helpers');

const solid = (w, h, c) => { const d = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < w * h; i++) d.set(c, i * 4); return { width: w, height: h, data: d }; };
const px = (img, x, y) => Array.from(img.data.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 4));

function samplePsd({ composite = true } = {}) {
  const psd = {
    width: 40, height: 30,
    children: [
      { name: 'Arka plan', left: 0, top: 0, imageData: solid(40, 30, [255, 0, 0, 255]) },
      { name: 'Mavi kutu', left: 5, top: 5, opacity: 0.5, imageData: solid(10, 10, [0, 0, 255, 255]) },
      { name: 'Grup', children: [{ name: 'Gizli', hidden: true, left: 0, top: 0, imageData: solid(4, 4, [0, 255, 0, 255]) }] },
    ],
  };
  if (composite) {
    // Photoshop'un kaydettiği birleşik görüntü (düz renk olmasın: tek renk "uyumluluk kapalı" sayılır)
    psd.imageData = solid(40, 30, [10, 20, 30, 255]);
    psd.imageData.data.set([200, 100, 50, 255], (29 * 40 + 39) * 4);
  }
  return Buffer.from(writePsdBuffer(psd, {}));
}

test('PSD: düzleştirilmiş birleşik görüntü ve katman listesi (üstten alta, derinlik, gizlilik, opaklık)', () => {
  const r = decodePsd(samplePsd(), { layers: true });
  assert.equal(r.width, 40);
  assert.equal(r.height, 30);
  assert.equal(r.approximate, false);
  assert.deepEqual(px(r, 0, 0), [10, 20, 30, 255]);
  assert.deepEqual(r.layers.map((l) => [l.name, l.depth, l.effectiveHidden]), [
    ['Grup', 0, false], ['Gizli', 1, true], ['Mavi kutu', 0, false], ['Arka plan', 0, false]]);
  assert.ok(Math.abs(r.layers[2].opacity - 0.5) < 0.01);
  assert.equal(r.info.colorMode, 'RGB');
  assert.equal(r.info.layerCount, 3);
});

test('PSD: birleşik görüntü yoksa görünür katmanlardan yaklaşık görüntü (gizli katman çizilmez)', () => {
  const r = decodePsd(samplePsd({ composite: false }));
  assert.equal(r.approximate, true);
  assert.deepEqual(px(r, 0, 0), [255, 0, 0, 255]);          // gizli yeşil katman çizilmedi
  const [rr, , bb, a] = px(r, 6, 6);                         // %50 mavi kırmızının üstünde
  assert.ok(rr > 100 && rr < 160 && bb > 100 && bb < 160 && a === 255, `${rr},${bb}`);
  assert.equal(r.layers.length, 0);                          // katman listesi istenmedi
});

test('TIFF: çözülür, sayfa sayısı bildirilir; HEIC olmayan veri anlaşılır hata', async () => {
  const d = new Uint8Array(6 * 4 * 4);
  for (let i = 0; i < 24; i++) d.set([0, 128, 255, 255], i * 4);
  const r = decodeTiff(Buffer.from(UTIF.encodeImage(d, 6, 4)));
  assert.deepEqual([r.width, r.height, r.pages], [6, 4, 1]);
  assert.deepEqual(Array.from(r.data.slice(0, 4)), [0, 128, 255, 255]);
  await assert.rejects(decodeHeic(Buffer.from('heic değil, düz metin')));
});

test('PDF: pdf.js ile sayfa sayısı, sayfa boyutu ve üst veri (Node, legacy derleme)', async () => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(makePdf(3, { width: 612, height: 792, title: 'Rapor' })), isEvalSupported: false, disableFontFace: true }).promise;
  assert.equal(doc.numPages, 3);
  const page = await doc.getPage(2);
  const vp = page.getViewport({ scale: 96 / 72 });
  assert.deepEqual([Math.round(vp.width), Math.round(vp.height)], [816, 1056]);
  const meta = await doc.getMetadata();
  assert.equal(meta.info.Title, 'Rapor');
  await doc.destroy();
});

// --- loadPreview: dosyadan pencere tanımına ---------------------------------------------------
const dir = tmpDir('qp-load-');
const put = (name, data) => { const p = path.join(dir, name); fs.writeFileSync(p, data); return p; };

test('loadPreview: resim (file URL), PNG boyutu, bilgi alanları', async () => {
  const f = put('foto 1.png', makePng(4, 3));
  const d = await loadPreview(f);
  assert.equal(d.view, 'image');
  assert.equal(d.kind, 'image');
  assert.equal(d.sub, 'png');
  assert.match(d.url, /^file:\/\/.*foto%201\.png$/);
  assert.equal(d.name, 'foto 1.png');
  assert.equal(d.size, fs.statSync(f).size);
  assert.ok(d.mtime > 0);
});

test('loadPreview: PSD ve TIFF piksel olarak; PDF bayt olarak', async () => {
  const psd = await loadPreview(put('tasarim.psd', samplePsd()), { psdLayers: true });
  assert.equal(psd.view, 'psd');
  assert.equal(psd.data.length, 40 * 30 * 4);
  assert.equal(psd.layers.length, 4);
  const noLayers = await loadPreview(put('tasarim2.psd', samplePsd()), { psdLayers: false });
  assert.equal(noLayers.layers.length, 0);

  const d = new Uint8Array(2 * 2 * 4).fill(200);
  const tif = await loadPreview(put('tarama.tif', Buffer.from(UTIF.encodeImage(d, 2, 2))));
  assert.equal(tif.view, 'raster');
  assert.equal(tif.width, 2);

  const pdf = await loadPreview(put('belge.pdf', makePdf(2)));
  assert.equal(pdf.view, 'pdf');
  assert.ok(pdf.data instanceof Uint8Array);
  assert.equal(Buffer.from(pdf.data.subarray(0, 5)).toString(), '%PDF-');
});

test('loadPreview: metin (renkli, satır sayısı, kodlama), Markdown (güvenli), SVG (data URL + kaynak)', async () => {
  const js = await loadPreview(put('app.js', 'const x = 1;\n// yorum\n'));
  assert.equal(js.view, 'text');
  assert.equal(js.lines, 2);
  assert.equal(js.encoding, 'UTF-8');
  assert.match(js.html, /hljs-keyword/);

  const md = await loadPreview(put('BENİOKU.md', '# Başlık\n\n<script>alert(1)</script>\n\n[site](https://example.com) ![uzak](https://example.com/x.png) ![yerel](resim.png)\n\n## İki\n\n### Üç\n'));
  assert.equal(md.view, 'markdown');
  assert.ok(!/<script/i.test(md.html), 'ham HTML çalıştırılmamalı');
  assert.match(md.html, /&lt;script&gt;/);
  assert.match(md.html, /href="https:\/\/example.com" data-external="1"/);
  assert.ok(!/src="https:/.test(md.html), 'uzak resim yüklenmemeli');
  assert.match(md.html, /src="file:\/\/.*resim\.png"/);
  assert.deepEqual(md.toc.map((x) => x.text), ['Başlık', 'İki', 'Üç']);
  assert.equal(md.source.lang, 'markdown');

  const svg = await loadPreview(put('logo.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>'));
  assert.equal(svg.view, 'svg');
  assert.match(svg.url, /^data:image\/svg\+xml;base64,/);
  assert.match(svg.source.html, /hljs-tag/);
});

test('metin: Windows-1254 ve UTF-16 kodlamaları; büyük dosyanın başı', () => {
  assert.equal(text.decodeText(Buffer.from([0x47, 0xfc, 0x7a, 0x65, 0x6c, 0xfd])).text, 'Güzelı');
  assert.equal(text.decodeText(Buffer.from([0xff, 0xfe, 0x31, 0x01])).text, 'ı');
  const big = Buffer.from('a'.repeat(10));
  const r = text.renderText(big, { size: 100 });
  assert.equal(r.truncated, true);
  assert.equal(text.safeHref('javascript:alert(1)'), null);
  assert.equal(text.safeHref('mailto:a@b.c'), 'mailto:a@b.c');
  assert.equal(text.localImage('file:///etc/passwd', '/tmp'), null);
});

test('loadPreview: Office, arşiv, video/ses, bilinmeyen, kapalı tür, bozuk dosya', async () => {
  const docx = await loadPreview(put('teklif.docx', makeDocx()));
  assert.equal(docx.view, 'office');
  assert.equal(docx.office.type, 'docx');
  const xlsx = await loadPreview(put('satis.xlsx', makeXlsx()));
  assert.equal(xlsx.office.sheets[0].name, 'Satışlar');
  const pptx = await loadPreview(put('sunum.pptx', makePptx()));
  assert.equal(pptx.office.slides.length, 2);

  const arc = await loadPreview(put('yedek.zip', makeZip([{ name: 'a/', data: '', method: 0 }, { name: 'a/b.txt', data: 'merhaba' }])));
  assert.equal(arc.view, 'archive');
  assert.equal(arc.summary.files, 1);
  assert.equal(arc.entries.length, 2);

  const mp3 = await loadPreview(put('sarki.mp3', Buffer.concat([Buffer.from('ID3\x04\0\0\0\0\0\0', 'latin1'), Buffer.alloc(64)])));
  assert.deepEqual([mp3.view, mp3.media], ['media', 'audio']);
  assert.match(mp3.url, /^file:/);

  const bin = await loadPreview(put('veri.bin', Buffer.from([0, 1, 2, 0, 0, 255])));
  assert.deepEqual([bin.view, bin.reason], ['info', 'unknown']);

  const off = await loadPreview(put('kapali.pdf', makePdf(1)), { types: { pdf: false } });
  assert.deepEqual([off.view, off.reason], ['info', 'disabled']);

  const broken = await loadPreview(put('bozuk.docx', makeZip([{ name: 'x.xml', data: '<x/>' }])));
  assert.deepEqual([broken.view, broken.reason, broken.error], ['info', 'error', 'office_invalid']);

  await assert.rejects(loadPreview(dir), { code: 'is_directory' });
});

test('aynı klasördeki dosyalar: doğal sıralama, gizli dosyalar ve klasörler hariç', async () => {
  const d2 = tmpDir('qp-sib-');
  for (const n of ['resim10.png', 'resim2.png', 'Resim1.png', '.gizli', 'desktop.ini']) fs.writeFileSync(path.join(d2, n), 'x');
  fs.mkdirSync(path.join(d2, 'alt klasör'));
  const r = await listSiblings(path.join(d2, 'resim2.png'), { lang: 'tr' });
  assert.deepEqual(r.files.map((f) => path.basename(f)), ['Resim1.png', 'resim2.png', 'resim10.png']);
  assert.equal(r.index, 1);
  const h = await listSiblings(path.join(d2, '.gizli'), { lang: 'tr' });
  assert.equal(path.basename(h.files[h.index]), '.gizli');
});
