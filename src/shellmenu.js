'use strict';

// Gezgin sağ tık menüsü: "Hızlı Önizleme" (yalnız dosyalarda; klasörlerde görünmez).
//
// Şimdiki yol — klasik menü (kayıt defteri, yönetici izni gerekmez):
//   HKCU\Software\Classes\*\shell\MastertoolQuickPreview
//     MUIVerb = "Hızlı Önizleme"   (uygulamanın dili; dil değişince güncellenir)
//     Icon    = "…\Quick Preview.exe",0
//     command\(Varsayılan) = "…\Quick Preview.exe" --preview "%1"
// Kurulum (build/installer.nsh) aynı kaydı yazar, kaldırma siler; uygulama da açılışta kaydı kendi exe yoluna
// göre doğrular (taşınabilir sürüm, başka bir kullanıcı hesabı, dil değişikliği).
//
// Bilinen sınır — Windows 11: klasik kayıtlar yeni (kısa) menüde değil, "Daha fazla seçenek göster" altında
// (ya da Shift+F10 / Shift+sağ tık) görünür. Yeni menüye girmek için uygulamanın paket kimliği olmalı:
// imzalı bir MSIX (ya da "sparse package" + harici konum) içinde IExplorerCommand uygulayan bir COM sunucusu
// ve AppxManifest'te windows.fileExplorerContextMenus uzantısı. Bunun için kod imzalama sertifikası gerekir;
// sertifika gelince MODERN_MENU uygulanır (bkz. docs/site-teknik.md › Bilinen sınırlar). Arayüz o zaman da
// aynı kalır: status() / register() / unregister() — yalnız strateji değişir.

const { execFile } = require('child_process');
const os = require('os');

const VERB = 'MastertoolQuickPreview';
const KEY = `HKCU\\Software\\Classes\\*\\shell\\${VERB}`;
const COMMAND_KEY = `${KEY}\\command`;

// Yeni (Windows 11) menü için ayrılmış yer: paket kimliği + IExplorerCommand. Henüz yok.
const MODERN_MENU = Object.freeze({
  available: false,
  reason: 'needs_signed_msix', // imzalı MSIX / sparse package olmadan Windows yeni menüye izin vermez
  // İleride: { clsid: '{…}', packageFamilyName: 'Mastertool.QuickPreview_…', verb: VERB }
});

const commandLine = (exe) => `"${exe}" --preview "%1"`;
const iconValue = (exe) => `"${exe}",0`;

// reg.exe ile yazılacak kayıtlar (saf işlev; testte doğrulanır)
function registerArgs(exe, label) {
  return [
    ['add', KEY, '/v', 'MUIVerb', '/t', 'REG_SZ', '/d', label, '/f'],
    ['add', KEY, '/v', 'Icon', '/t', 'REG_SZ', '/d', iconValue(exe), '/f'],
    ['add', COMMAND_KEY, '/ve', '/t', 'REG_SZ', '/d', commandLine(exe), '/f'],
  ];
}
const unregisterArgs = () => [['delete', KEY, '/f']];
const queryArgs = () => [['query', KEY, '/v', 'MUIVerb'], ['query', COMMAND_KEY, '/ve']];


// "reg query" çıktısından değer: "    MUIVerb    REG_SZ    Hızlı Önizleme"
function parseRegValue(stdout, name) {
  const label = name === '' ? '(?:\\(Default\\)|\\(Varsayılan\\)|\\([^)]*\\))' : name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`^\\s*${label}\\s+REG_(?:EXPAND_)?SZ\\s+(.*)$`, 'mi').exec(String(stdout || ''));
  return m ? m[1].trim() : null;
}

// Kayıt bu exe'yi mi gösteriyor? reg.exe çıktısı konsol kod sayfasındadır (ör. CP857): ASCII olmayan yollar ve
// etiketler bozuk okunur. Bu yüzden etiket karşılaştırılmaz (son yazılan etiket depoda tutulur) ve exe yolu
// yalnız ASCII ise karşılaştırılır; değilse "emin değiliz" sayılıp kayıt yeniden yazılır (zararsız, ~50 ms).
const isAscii = (s) => /^[\x20-\x7e]*$/.test(s);
function evaluate({ command }, exe) {
  const registered = !!command;
  const pointsHere = registered && isAscii(exe) && command.toLowerCase() === commandLine(exe).toLowerCase();
  return { registered, pointsHere };
}

function runReg(args) {
  return new Promise((resolve) => {
    execFile('reg.exe', args, { windowsHide: true, encoding: 'utf8', timeout: 10000 }, (error, stdout, stderr) => resolve({ ok: !error, stdout, stderr }));
  });
}

// Windows 11 (derleme ≥ 22000) mi? Ayarlarda "Daha fazla seçenek göster" notu için
function isWindows11(release = os.release()) {
  const build = Number(String(release).split('.')[2] || 0);
  return process.platform === 'win32' && build >= 22000;
}

function createShellMenu({ exe, run = runReg, platform = process.platform } = {}) {
  const supported = platform === 'win32';

  async function status() {
    if (!supported) return { supported, registered: false, pointsHere: false, modern: MODERN_MENU, win11: false };
    const c = await run(queryArgs()[1]);
    return { supported, ...evaluate({ command: c.ok ? parseRegValue(c.stdout, '') : null }, exe), modern: MODERN_MENU, win11: isWindows11() };
  }

  async function register(label) {
    if (!supported) return { ok: false, code: 'unsupported' };
    for (const args of registerArgs(exe, label)) {
      const r = await run(args);
      if (!r.ok) return { ok: false, code: 'reg_failed', message: (r.stderr || '').trim() };
    }
    return { ok: true };
  }

  async function unregister() {
    if (!supported) return { ok: false, code: 'unsupported' };
    const r = await run(unregisterArgs()[0]);
    // Kayıt zaten yoksa reg.exe hata verir; sonuç yine "kayıtlı değil"
    return { ok: true, existed: r.ok };
  }

  // Açılışta: kayıt açık olmalıysa ve bu exe'yi göstermiyorsa ya da etiket (dil) değiştiyse yaz; kapalı olmalıysa
  // ve kayıt bu exe'ye aitse kaldır. last: depodaki son yazım { exe, label }. Dönüş: { ok, last } (yeni kayıt bilgisi)
  async function ensure(enabled, label, last = null) {
    if (!supported) return { ok: false, code: 'unsupported', last };
    const st = await status();
    if (enabled) {
      const same = st.pointsHere && last && last.exe === exe && last.label === label;
      if (same) return { ok: true, unchanged: true, last };
      const r = await register(label);
      return { ...r, last: r.ok ? { exe, label } : last };
    }
    if (st.registered && (st.pointsHere || (last && last.exe === exe))) {
      await unregister();
      return { ok: true, last: null };
    }
    return { ok: true, unchanged: true, last: null };
  }

  return { status, register, unregister, ensure, supported };
}

module.exports = { createShellMenu, registerArgs, unregisterArgs, queryArgs, parseRegValue, evaluate, commandLine, iconValue, isWindows11,
  KEY, COMMAND_KEY, VERB, MODERN_MENU };
