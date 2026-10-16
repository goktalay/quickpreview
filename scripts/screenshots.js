// 1600×1000 tanıtım ekran görüntüleri (gece + gündüz) ve manifest.json: Türkçe set docs/screenshots/,
// İngilizce set docs/screenshots/en/ (aynı dosya adları).
// Arayüz gerçek dosyalardan (src/renderer) yüklenir; önizleme tanımları gerçek çözücülerle (src/preview) üretilir.
// window.api yalnızca preload köprüsünün yerine geçer; dosyalar scripts/make-samples.js ile kodla çizilen örneklerdir
// (gerçek hesap, sunucu ya da kişisel veri yok). Gezgin sağ tık menüsü Windows'un yerel menüsüdür; burada aynı içerikle çizilir.
//
// Kullanım: npm run screenshots   (Chromium yolu: CHROMIUM_PATH ya da Playwright'ın varsayılanı)
'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright-core');
const I18N = require('../src/i18n');
const { loadPreview, listSiblings } = require('../src/preview');
const samples = require('./make-samples');
const sharp = require('sharp');
const { decodePsd } = require('../src/preview/psd');

const ROOT = path.join(__dirname, '..');
const OUT_BASE = path.join(ROOT, 'docs', 'screenshots');
const W = 1600;
const H = 1000;
// Görüntülerde Windows'taki gibi yollar görünsün: örnek klasör ↔ C:\\Users\\…
const WIN_DIR = { tr: 'C:\\Users\\Ornek\\Belgeler\\Tasarım', en: 'C:\\Users\\Sample\\Documents\\Design' };
const SAMPLE_USER = { tr: { email: 'ornek@example.com', name: 'Örnek Kullanıcı' }, en: { email: 'sample@example.com', name: 'Sample User' } };

const DEFAULT_PREVIEW = { types: { image: true, psd: true, pdf: true, svg: true, text: true, markdown: true, media: true, office: true, archive: true },
  defaultZoom: 'fit', psdLayers: true, infoPanel: false, textWrap: false, mediaAutoplay: false };

// Sahneler: [dosya adı, tema, tür, başlık/açıklama (tr, en)]
const SCENES = [
  { file: '01-sag-tik-menusu-gece.png', theme: 'dark', kind: 'explorer',
    tr: ['Gezgin\'de sağ tık: Hızlı Önizleme', 'Dosyaya sağ tıklayın, “Hızlı Önizleme”yi seçin; pencere anında açılır'],
    en: ['Right-click in File Explorer: Quick Preview', 'Right-click a file, choose “Quick Preview” and the window opens instantly'] },
  { file: '02-resim-gece.png', theme: 'dark', kind: 'preview', sample: 'photo', info: true, nav: true,
    tr: ['Resimler: yakınlaştır, sığdır, döndür', 'JPG, PNG, WebP, GIF, BMP, TIFF, ICO, HEIC; dosya bilgisi paneliyle'],
    en: ['Images: zoom, fit, rotate', 'JPG, PNG, WebP, GIF, BMP, TIFF, ICO, HEIC with a file info panel'] },
  { file: '03-psd-katmanlar-gece.png', theme: 'dark', kind: 'preview', sample: 'psd', info: true, nav: true,
    tr: ['Photoshop PSD: birleşik görüntü ve katmanlar', 'Photoshop olmadan PSD/PSB: görüntü, renk modu, katman listesi'],
    en: ['Photoshop PSD: composite image and layers', 'PSD/PSB without Photoshop: image, color mode and layer list'] },
  { file: '04-pdf-gunduz.png', theme: 'light', kind: 'preview', sample: 'pdf', wait: 1800, nav: true,
    tr: ['PDF: sayfa sayfa, küçük resim şeridiyle', 'Sayfalar resim gibi; PgUp/PgDn ile gezinme, yakınlaştırma'],
    en: ['PDF: page by page with a thumbnail strip', 'Pages shown as images; PgUp/PgDn to browse, zoom in and out'] },
  { file: '05-kod-gece.png', theme: 'dark', kind: 'preview', sample: 'code',
    tr: ['Metin ve kod: söz dizimi renkli', '55\'ten fazla dil; salt okunur, satır numaralı, kodlama algılamalı'],
    en: ['Text and code with syntax colors', 'Over 55 languages; read-only, line numbers, encoding detection'] },
  { file: '06-markdown-gunduz.png', theme: 'light', kind: 'preview', sample: 'md',
    tr: ['Markdown: biçimli görünüm ve içindekiler', 'Tablolar, kod blokları, bağlantılar; uzak resimler yüklenmez'],
    en: ['Markdown: formatted view with contents', 'Tables, code blocks and links; remote images are never loaded'] },
  { file: '07-excel-gece.png', theme: 'dark', kind: 'preview', sample: 'xlsx',
    tr: ['Excel: sayfalar ve hücreler', 'docx, xlsx ve pptx içeriği Office kurulu olmadan görünür'],
    en: ['Excel: sheets and cells', 'See docx, xlsx and pptx content without Office installed'] },
  { file: '08-word-gunduz.png', theme: 'light', kind: 'preview', sample: 'docx',
    tr: ['Word: başlıklar, listeler ve tablolar', 'Belgenin metni ve tabloları sade, okunaklı bir görünümde'],
    en: ['Word: headings, lists and tables', 'The document text and tables in a clean, readable view'] },
  { file: '09-arsiv-gunduz.png', theme: 'light', kind: 'preview', sample: 'zip',
    tr: ['ZIP arşivi: içerik listesi', 'Açmadan bakın: dosyalar, boyutlar, tarihler, arama'],
    en: ['ZIP archive: list of contents', 'Look inside without extracting: files, sizes, dates, search'] },
  { file: '10-video-gece.png', theme: 'dark', kind: 'preview', sample: 'video', nav: true,
    tr: ['Video ve ses', 'MP4, WebM, MOV, MP3, WAV, FLAC… yerleşik oynatıcıda'],
    en: ['Video and audio', 'MP4, WebM, MOV, MP3, WAV, FLAC… in the built-in player'] },
  { file: '11-ayarlar-genel-gece.png', theme: 'dark', kind: 'settings', tab: 'general', welcome: true,
    tr: ['Ayarlar: tepsi, Windows ile başlat, sağ tık', 'Tepside bekler; “Gizle” ile simge kalkar, sağ tık çalışmaya devam eder'],
    en: ['Settings: tray, start with Windows, right-click', 'Waits in the tray; “Hide” removes the icon, right-click keeps working'] },
  { file: '12-ayarlar-onizleme-gunduz.png', theme: 'light', kind: 'settings', tab: 'preview',
    tr: ['Ayarlar › Önizleme', 'Türleri seçin, varsayılan yakınlaştırma, kısayollar; her şey yerel'],
    en: ['Settings › Preview', 'Choose file types, default zoom and shortcuts; everything stays local'] },
];

// Önizleme tanımındaki ikili alanlar (Uint8Array / Uint8ClampedArray) sayfaya base64 olarak taşınır
function serialize(d) {
  return JSON.stringify(d, (k, v) => {
    if (v instanceof Uint8Array || v instanceof Uint8ClampedArray) return { __b64: Buffer.from(v.buffer, v.byteOffset, v.byteLength).toString('base64'), clamped: v instanceof Uint8ClampedArray };
    return v;
  });
}

const PDFJS = path.dirname(require.resolve('pdfjs-dist/package.json'));

// window.api taklidi — preview-preload.js ile aynı yüzey
function previewStub(lang) {
  return `(() => {
    const cbs = {};
    const on = (name) => (cb) => { cbs[name] = cb; return () => {}; };
    const revive = (s) => JSON.parse(s, (k, v) => {
      if (v && v.__b64 !== undefined) { const bin = atob(v.__b64); const u = v.clamped ? new Uint8ClampedArray(bin.length) : new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
      return v;
    });
    window.api = {
      lang: ${JSON.stringify(lang)}, version: '1.0.0',
      load: async (p, s) => revive(await window.qpLoad(p, s)),
      siblings: (p) => window.qpSiblings(p),
      pdfAsset: async (kind, name) => { const b = await window.qpAsset(kind, name); const bin = atob(b); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; },
      close: async () => {}, openDefault: async () => null, reveal: async () => {}, copyPath: async () => {}, openExternal: async () => {},
      setTitle: () => {}, setPrefs: async () => {}, toggleFullscreen: async () => {}, showSettings: async () => {},
      getSettings: async () => ({ preview: window.__prefs }), setSettings: async () => ({ ok: true }),
      onOpen: on('open'), onHidden: on('hidden'), onSettingsChanged: on('settings'),
    };
    window.__qpOpen = (req) => cbs.open(req);
  })();`;
}

function settingsStub(lang, theme) {
  const u = SAMPLE_USER[lang];
  const settings = { appTheme: theme, language: lang, preview: { ...DEFAULT_PREVIEW, mediaAutoplay: true }, openAtLogin: true, showTray: true, shellMenu: true, checkUpdates: true };
  return `(() => {
    const noop = () => () => {};
    window.api = {
      lang: ${JSON.stringify(lang)}, version: '1.0.0',
      accountState: async () => ({ loggedIn: true, user: { id: 1, email: ${JSON.stringify(u.email)}, name: ${JSON.stringify(u.name)} }, email: ${JSON.stringify(u.email)},
        syncEnabled: true, state: 'ok', lastSyncAt: Date.parse('2026-10-16T09:41:00Z'), appVersion: '1.0.0' }),
      login: async () => ({ ok: true }), logout: async () => {}, syncNow: async () => {}, setSyncEnabled: async () => ({ ok: true }),
      deleteRemoteLibrary: async () => ({ ok: true }), openWeb: async () => {}, onAccountStatus: noop, onUpdateAvailable: noop,
      openMastertool: async () => {}, checkUpdate: async () => ({ ok: true, latest: '1.0.0', newer: false }), openLicenses: async () => {},
      about: async () => ({ version: '1.0.0', electron: '33.4.11', chrome: '130.0.6723.191', openAtLogin: true, portable: false, packaged: true, update: null }),
      quit: async () => {}, pickAndPreview: async () => {},
      getSettings: async () => (${JSON.stringify(settings)}), setSettings: async () => ({ ok: true }), onSettingsChanged: noop, onTab: noop,
      shellStatus: async () => ({ supported: true, registered: true, pointsHere: true, win11: true, enabled: true, label: ${JSON.stringify(I18N.STRINGS[lang]['shell.verb'])} }),
    };
  })();`;
}

// Gezgin penceresi ve klasik sağ tık menüsü (Windows 11 “Daha fazla seçenek göster” görünümü) — yalnız tanıtım çizimi
function explorerHtml(lang, dir, L) {
  const t = I18N.createT(lang);
  const tr = lang === 'tr';
  const icon = fs.readFileSync(path.join(ROOT, 'build', 'icon.svg'), 'utf8');
  const thumb = (name) => pathToFileURL(path.join(dir, name)).href;
  const files = [
    { n: L.photo, img: thumb(L.photo) }, { n: L.psd, sel: true, img: thumb('_poster.png'), tall: true }, { n: L.pdf, ic: 'PDF', c: '#ef4444' },
    { n: L.xlsx, ic: 'XLS', c: '#16a34a' }, { n: L.docx, ic: 'DOC', c: '#2563eb' }, { n: L.pptx, ic: 'PPT', c: '#ea580c' },
    { n: L.md, ic: 'MD', c: '#64748b' }, { n: L.code, ic: 'JS', c: '#ca8a04' }, { n: L.zip, ic: 'ZIP', c: '#a16207' }, { n: L.video, ic: '▶', c: '#7c3aed' },
  ];
  const menu = tr
    ? ['Aç', '*', 'Birlikte aç', '-', 'Paylaş', 'Erişim ver', '-', 'Kes', 'Kopyala', '-', 'Kısayol oluştur', 'Sil', 'Yeniden adlandır', '-', 'Özellikler']
    : ['Open', '*', 'Open with', '-', 'Share', 'Give access to', '-', 'Cut', 'Copy', '-', 'Create shortcut', 'Delete', 'Rename', '-', 'Properties'];
  const nav = tr ? ['Giriş', 'Galeri', 'Masaüstü', 'İndirilenler', 'Belgeler', 'Resimler', 'Müzik', 'Videolar', 'Bu bilgisayar'] : ['Home', 'Gallery', 'Desktop', 'Downloads', 'Documents', 'Pictures', 'Music', 'Videos', 'This PC'];
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body { margin: 0; width: ${W}px; height: ${H}px; font: 13px 'Segoe UI', 'DejaVu Sans', sans-serif; color: #e5e7eb; overflow: hidden;
      background: radial-gradient(900px 600px at 80% 10%, #4338ca 0%, transparent 60%), radial-gradient(800px 600px at 10% 90%, #0e7490 0%, transparent 60%), #0b1020; }
    .win { position: absolute; left: 70px; top: 50px; width: 1180px; height: 760px; background: #1c1c1c; border: 1px solid #3a3a3a; border-radius: 10px; box-shadow: 0 30px 80px rgba(0,0,0,.6); overflow: hidden; }
    .tb { height: 44px; display: flex; align-items: center; padding: 0 14px; gap: 10px; background: #202020; border-bottom: 1px solid #2d2d2d; }
    .tab { padding: 8px 16px; background: #2b2b2b; border-radius: 8px 8px 0 0; margin-top: 8px; display: flex; gap: 8px; align-items: center; }
    .fold { width: 16px; height: 12px; background: #fbbf24; border-radius: 2px; display: inline-block; }
    .addr { height: 44px; display: flex; align-items: center; gap: 10px; padding: 0 14px; border-bottom: 1px solid #2d2d2d; color: #cbd5e1; }
    .addr .box { flex: 1; height: 30px; background: #2b2b2b; border-radius: 6px; display: flex; align-items: center; padding: 0 12px; }
    .addr .srch { width: 240px; height: 30px; background: #2b2b2b; border-radius: 6px; display: flex; align-items: center; padding: 0 12px; color: #94a3b8; }
    .body { display: flex; height: calc(100% - 88px); }
    .nav { width: 190px; padding: 10px 8px; border-inline-end: 1px solid #2d2d2d; color: #cbd5e1; }
    .nav div { padding: 7px 12px; border-radius: 6px; } .nav .on { background: #2d2d2d; }
    .grid { flex: 1; display: grid; grid-template-columns: repeat(5, 1fr); gap: 18px; padding: 22px; align-content: start; }
    .f { display: grid; justify-items: center; gap: 8px; padding: 10px 6px; border-radius: 6px; text-align: center; font-size: 12.5px; }
    .f.sel { background: rgba(96,165,250,.25); outline: 1px solid rgba(96,165,250,.6); }
    .f img { width: 150px; height: 100px; object-fit: cover; border-radius: 4px; }
    .f img.tall { width: 76px; }
    .doc { width: 76px; height: 100px; border-radius: 6px; background: #f8fafc; position: relative; display: grid; place-items: end center; padding-bottom: 10px; box-sizing: border-box; }
    .doc b { font-size: 13px; color: #fff; padding: 2px 8px; border-radius: 4px; }
    .menu { position: absolute; left: 520px; top: 300px; width: 330px; padding: 6px; background: #2b2b2b; border: 1px solid #454545; border-radius: 8px; box-shadow: 0 16px 40px rgba(0,0,0,.55); }
    .menu div { display: flex; align-items: center; gap: 12px; padding: 7px 12px; border-radius: 4px; color: #f1f5f9; }
    .menu hr { border: none; border-top: 1px solid #454545; margin: 5px 4px; }
    .menu .qp { background: #3b3b3b; outline: 1px solid #5b5b5b; }
    .menu .qp svg { width: 18px; height: 18px; } .menu .sp { width: 18px; }
    .hint { position: absolute; left: 880px; top: 330px; width: 330px; padding: 14px 16px; border-radius: 12px; background: rgba(15,23,42,.92); border: 1px solid #22d3ee; color: #e2e8f0; line-height: 1.5; box-shadow: 0 10px 30px rgba(0,0,0,.5); }
    .hint b { color: #22d3ee; }
    .pv { position: absolute; right: 60px; bottom: 70px; width: 360px; height: 470px; border-radius: 12px; overflow: hidden; border: 1px solid #334155; box-shadow: 0 24px 70px rgba(0,0,0,.6); background: #0b0f17; }
    .pv .bar { height: 40px; display: flex; align-items: center; gap: 10px; padding: 0 12px; background: rgba(11,15,23,.9); border-bottom: 1px solid #243047; font-weight: 600; }
    .pv .bar svg { width: 22px; height: 22px; } .pv img { width: 100%; height: calc(100% - 41px); object-fit: contain; background: #0b0f17; }
    .task { position: absolute; left: 0; right: 0; bottom: 0; height: 48px; background: rgba(32,32,32,.92); border-top: 1px solid #333; display: flex; align-items: center; justify-content: flex-end; padding: 0 16px; gap: 14px; color: #cbd5e1; }
    .task .tray svg { width: 18px; height: 18px; } .task .tray { display: flex; gap: 10px; align-items: center; padding: 6px 8px; border-radius: 6px; background: #2d2d2d; }
  </style></head><body>
    <div class="win">
      <div class="tb"><div class="tab"><span class="fold"></span>${tr ? 'Tasarım' : 'Design'}</div></div>
      <div class="addr">← → ↑ ⟳ <div class="box">${tr ? 'Bu bilgisayar › Belgeler › Tasarım' : 'This PC › Documents › Design'}</div><div class="srch">${tr ? 'Tasarım içinde ara' : 'Search Design'}</div></div>
      <div class="body"><div class="nav">${nav.map((n, i) => `<div class="${i === 4 ? 'on' : ''}">${n}</div>`).join('')}</div>
        <div class="grid">${files.map((f) => `<div class="f ${f.sel ? 'sel' : ''}">${f.img ? `<img class="${f.tall ? 'tall' : ''}" src="${f.img}">` : `<div class="doc"><b style="background:${f.c}">${f.ic}</b></div>`}<span>${f.n}</span></div>`).join('')}</div></div>
    </div>
    <div class="menu">${menu.map((m) => (m === '-' ? '<hr>' : m === '*' ? `<div class="qp">${icon}<span>${t('shell.verb')}</span></div>` : `<div><span class="sp"></span><span>${m}</span></div>`)).join('')}</div>
    <div class="hint"><b>${t('shell.verb')}</b><br>${t('welcome.body')}</div>
    <div class="pv"><div class="bar">${icon}<span>${L.psd}</span></div><img src="${thumb('_poster.png')}"></div>
    <div class="task"><span>${tr ? 'TR' : 'EN'}</span><div class="tray">${icon}<span>Quick Preview</span></div><span>10:42</span></div>
  </body></html>`;
}

async function shoot(browser, lang, dir, L, scene, outDir) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, colorScheme: scene.theme, locale: lang === 'tr' ? 'tr-TR' : 'en-US',
    timezoneId: 'Europe/Istanbul' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.warn(`[${scene.file}] sayfa hatası:`, e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.warn(`[${scene.file}] konsol:`, m.text()); });
  try {
    if (scene.kind === 'explorer') {
      const psd = decodePsd(fs.readFileSync(path.join(dir, L.psd)));
      await sharp(Buffer.from(psd.data.buffer, psd.data.byteOffset, psd.data.byteLength), { raw: { width: psd.width, height: psd.height, channels: 4 } })
        .resize(600).png().toFile(path.join(dir, '_poster.png'));
      const f = path.join(dir, '_explorer.html');
      fs.writeFileSync(f, explorerHtml(lang, dir, L));
      await page.goto(pathToFileURL(f).href);
      await page.waitForTimeout(300);
    } else if (scene.kind === 'settings') {
      await page.addInitScript(settingsStub(lang, scene.theme));
      const q = new URLSearchParams({ tab: scene.tab, welcome: scene.welcome ? '1' : '' });
      await page.goto(`${pathToFileURL(path.join(ROOT, 'src', 'renderer', 'settings.html')).href}?${q}`);
      await page.waitForSelector('.set-pages section:not(.hidden)');
      await page.waitForTimeout(400);
      // Mastertool düğmesinin dönen kenarlığı: kareyi sabitle
      await page.addStyleTag({ content: '*{animation-play-state:paused!important}' });
    } else {
      const toWin = (p) => `${WIN_DIR[lang]}\\${path.basename(p)}`;
      const toReal = (p) => path.join(dir, p.split('\\').pop());
      const file = toWin(L[scene.sample]);
      const prefs = { ...DEFAULT_PREVIEW, infoPanel: !!scene.info };
      await page.exposeFunction('qpLoad', async (p, s) => serialize({ ...(await loadPreview(toReal(p), s)), path: p, dir: WIN_DIR[lang] }));
      await page.exposeFunction('qpSiblings', async (p) => {
        const r = await listSiblings(toReal(p), { lang });
        const files = r.files.filter((f) => !path.basename(f).startsWith('_'));
        return { files: files.map(toWin), index: files.indexOf(toReal(p)) };
      });
      await page.exposeFunction('qpAsset', (kind, name) => fs.readFileSync(path.join(PDFJS, kind === 'cmap' ? 'cmaps' : 'standard_fonts', path.basename(name))).toString('base64'));
      await page.addInitScript(`window.__prefs = ${JSON.stringify(prefs)};`);
      await page.addInitScript(previewStub(lang));
      await page.goto(pathToFileURL(path.join(ROOT, 'src', 'renderer', 'preview.html')).href);
      await page.evaluate(({ p, s }) => window.__qpOpen({ path: p, settings: s }), { p: file, s: prefs });
      await page.waitForFunction(() => !document.querySelector('.loading') && document.querySelector('#fileSub').textContent.length > 0, null, { timeout: 15000 });
      if (scene.sample === 'video') {
        await page.waitForFunction(() => { const v = document.querySelector('video'); return v && v.readyState >= 2; }, null, { timeout: 10000 });
        await page.evaluate(() => { const v = document.querySelector('video'); v.pause(); v.currentTime = 1.6; });
        await page.waitForTimeout(600);
      }
      if (scene.sample === 'md') await page.evaluate(() => { const a = document.querySelectorAll('.toc a')[3]; if (a) a.dispatchEvent(new MouseEvent('mouseover')); });
      await page.waitForTimeout(scene.wait || 700);
      // Önceki/sonraki düğmeleri imleç önizlemenin üstündeyken görünür
      await page.mouse.move(scene.nav ? W / 2 + 300 : W / 2 + 120, scene.nav ? H / 2 : 26);
      await page.waitForTimeout(250);
    }
    await page.screenshot({ path: path.join(outDir, scene.file) });
  } finally {
    await ctx.close();
  }
}

async function main() {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required'] });
  try {
    for (const lang of ['tr', 'en']) {
      const dir = path.join(ROOT, 'samples', `shots-${lang}`);
      fs.rmSync(dir, { recursive: true, force: true });
      const L = await samples.main(dir, lang);
      const outDir = lang === 'tr' ? OUT_BASE : path.join(OUT_BASE, 'en');
      fs.mkdirSync(outDir, { recursive: true });
      const manifest = [];
      for (const s of SCENES) {
        await shoot(browser, lang, dir, L, s, outDir);
        const [title, caption] = s[lang];
        if (caption.length > 80 || title.length > 80) throw new Error(`80 karakteri aşıyor: ${s.file} (${lang})`);
        manifest.push({ file: s.file, theme: s.theme, title, caption });
        console.log(`${lang} ${s.file}`);
      }
      fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
