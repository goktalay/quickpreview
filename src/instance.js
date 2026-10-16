'use strict';

// Tek örnek ve sağ tık iletimi. Gezgin'de "Hızlı Önizleme" her seferinde yeni bir süreç başlatır:
//   "…\Quick Preview.exe" --preview "C:\…\dosya.psd"
// Tepside bekleyen bir örnek varsa yeni süreç kilidi alamaz; isteğini kilit verisiyle (additionalData) iletip
// hemen kapanır, bekleyen örnek önceden hazırlanmış önizleme penceresini anında gösterir. Kilit verisi
// kullanılır çünkü Chromium ikinci örneğin komut satırına kendi anahtarlarını ekleyip sırasını değiştirebilir.

const path = require('path');

const PROTOCOL = 1;

// argv → { preview: yol | null, hidden, settings }
//   --preview <yol>  : dosyayı önizle (sağ tık menüsü)
//   <yol>            : "Birlikte aç" ya da exe'nin üzerine sürükleme
//   --hidden         : Windows oturumuyla başlatıldı (pencere açma, tepside bekle)
//   --settings       : Ayarlar penceresini aç
// cwd verilirse göreli yollar ona göre çözülür. Electron'un kendisi (geliştirmede "electron ." ) atlanır.
function parseArgs(argv, { cwd = null, skip = 1 } = {}) {
  const out = { preview: null, hidden: false, settings: false };
  const args = (argv || []).slice(skip);
  for (let i = 0; i < args.length; i++) {
    const a = String(args[i] ?? '');
    if (a === '--preview' || a === '-p') {
      if (i + 1 < args.length) out.preview = String(args[++i]);
      continue;
    }
    if (a.startsWith('--preview=')) { out.preview = a.slice(10); continue; }
    if (a === '--hidden') { out.hidden = true; continue; }
    if (a === '--settings') { out.settings = true; continue; }
    if (a.startsWith('-') || a === '.') continue; // Chromium/Electron anahtarları, geliştirmedeki "."
    if (!out.preview) out.preview = a;
  }
  if (out.preview) {
    out.preview = out.preview.replace(/^"(.*)"$/, '$1');
    if (cwd && !isAbsolute(out.preview)) out.preview = (isWinPath(cwd) ? path.win32 : path).resolve(cwd, out.preview);
  }
  return out;
}

// Windows yolları (C:\…, \\sunucu\…) her platformda mutlak sayılır (testler Linux'ta da çalışır)
const isWinPath = (p) => /^[a-z]:[\\/]|^\\\\/i.test(p);
const isAbsolute = (p) => isWinPath(p) || path.isAbsolute(p);

// Kilit verisi: yalnız düz alanlar (Electron yapılandırılmış klonlama ile taşır)
const toLockData = (req) => ({ qp: PROTOCOL, preview: req.preview || null, hidden: !!req.hidden, settings: !!req.settings });

function fromSecondInstance(argv, cwd, data, skip) {
  if (data && data.qp === PROTOCOL) return { preview: data.preview || null, hidden: !!data.hidden, settings: !!data.settings };
  return parseArgs(argv, { cwd, skip });
}

// app: Electron app (testte sahtesi). onRequest(req, { first }) her istek için çağrılır.
// Dönüş: { primary: false } → bu süreç kapanmalı (istek iletildi); { primary: true, request } → ilk örnek.
function setupSingleInstance(app, { argv = process.argv, cwd = process.cwd(), skip = 1, onRequest }) {
  const request = parseArgs(argv, { cwd, skip });
  const primary = app.requestSingleInstanceLock(toLockData(request));
  if (!primary) return { primary: false, request };
  app.on('second-instance', (_e, argv2, cwd2, data) => {
    onRequest(fromSecondInstance(argv2, cwd2, data, skip), { first: false });
  });
  return { primary: true, request };
}

module.exports = { parseArgs, setupSingleInstance, toLockData, fromSecondInstance, PROTOCOL };
