'use strict';

// Ana süreç akışları — sahte "electron" modülüyle (pencere açılmaz). Sağ tık isteği girişsizken bekletilir, girişten
// sonra önceden hazırlanan önizleme penceresine iletilir; tepsi "Gizle", ikinci örnek, ayarlar ve çıkış.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const path = require('path');
const fs = require('fs');
const EventEmitter = require('events');
const { memoryKeyring, tmpDir, makePng } = require('./helpers');

const KDF = { alg: 'PBKDF2-SHA256', iter: 1000, salt: 'AAECAwQFBgcICQoLDA0ODw==' };
const server = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (d) => (raw += d));
  req.on('end', () => {
    const body = raw ? JSON.parse(raw) : {};
    const routes = {
      '/api/qp/auth/prelogin': [200, { kdf: KDF }],
      '/api/qp/auth/login': [200, { token: 't1', sso_token: body.sso ? 's1' : undefined, user: { id: 1, email: 'ornek@example.com', name: 'Örnek' }, sync_enabled: true, kdf: KDF }],
      '/api/qp/auth/logout': [200, { ok: true }],
      '/api/qp/me': [200, { user: { id: 1, email: 'ornek@example.com' }, sync_enabled: false, kdf: KDF }],
      '/api/qp/releases/latest': [200, { version: '1.0.0' }],
    };
    const [st, json] = routes[req.url] || [404, { code: 'not_found' }];
    res.writeHead(st, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(json));
  });
});

// --- Sahte electron ---------------------------------------------------------------------------
const dataDir = tmpDir('qp-main-');
const windows = [];
const trays = [];
const notes = [];
const handlers = new Map();
const listeners = new Map();
let readyResolve;

class FakeWebContents extends EventEmitter {
  constructor(win) { super(); this.win = win; this.id = Math.random(); this.sent = []; this.reloads = 0; }
  send(ch, data) { this.sent.push([ch, data]); }
  reload() { this.reloads++; }
  setWindowOpenHandler() {}
}
class BrowserWindow extends EventEmitter {
  constructor(opts) {
    super();
    this.opts = opts;
    this.visible = opts.show !== false;
    this.destroyed = false;
    this.webContents = new FakeWebContents(this);
    this.title = opts.title;
    windows.push(this);
  }
  static getAllWindows() { return windows.filter((w) => !w.destroyed); }
  static fromWebContents(wc) { return wc.win; }
  loadFile(file, opts) { this.file = path.basename(file); this.query = opts && opts.query; }
  setMenuBarVisibility() {}
  show() { this.visible = true; }
  hide() { this.visible = false; }
  focus() {}
  moveTop() {}
  setAlwaysOnTop() {}
  isVisible() { return this.visible; }
  isMinimized() { return false; }
  restore() {}
  isMaximized() { return false; }
  isFullScreen() { return false; }
  setFullScreen() {}
  setBounds(b) { this.bounds = b; }
  getSize() { return [1000, 700]; }
  setTitle(t) { this.title = t; }
  isDestroyed() { return this.destroyed; }
  destroy() { this.destroyed = true; this.emit('closed'); }
  close() { const e = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } }; this.emit('close', e); if (!e.defaultPrevented) this.destroy(); }
}
class Tray extends EventEmitter {
  constructor() { super(); this.destroyed = false; trays.push(this); }
  setToolTip(t) { this.tip = t; }
  setContextMenu(m) { this.menu = m; }
  destroy() { this.destroyed = true; }
}
class Notification {
  static isSupported() { return true; }
  constructor(o) { this.o = o; }
  on() {}
  show() { notes.push(this.o); }
}
const app = Object.assign(new EventEmitter(), {
  isPackaged: false,
  requestSingleInstanceLock: () => true,
  getPath: (n) => path.join(dataDir, n),
  getLocale: () => 'tr-TR',
  getVersion: () => '1.0.0',
  whenReady: () => new Promise((r) => { readyResolve = r; }),
  setAppUserModelId() {},
  setLoginItemSettings() {},
  getLoginItemSettings: () => ({ openAtLogin: false }),
  quitCalled: 0,
  quit() { this.quitCalled++; },
  exit() { throw new Error('exit beklenmiyordu'); },
});
const fake = {
  app, BrowserWindow, Tray, Notification,
  ipcMain: { handle: (ch, fn) => handlers.set(ch, fn), on: (ch, fn) => listeners.set(ch, fn) },
  safeStorage: { isEncryptionAvailable: () => false },
  shell: { openExternal() {}, openPath: async () => '', showItemInFolder() {} },
  dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
  clipboard: { writeText() {} },
  nativeTheme: { themeSource: 'system', shouldUseDarkColors: false },
  Menu: { buildFromTemplate: (t) => t },
  nativeImage: { createFromPath: () => ({ resize: () => ({}) }) },
  screen: { getCursorScreenPoint: () => ({ x: 0, y: 0 }), getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }) },
};
const kr = memoryKeyring();
require.cache[require.resolve('electron')] = { id: 'electron', filename: 'electron', loaded: true, exports: fake };
require.cache[require.resolve('@napi-rs/keyring')] = { id: 'kr', filename: 'kr', loaded: true,
  exports: { Entry: class { getPassword() { return kr.get(); } setPassword(v) { kr.set(v); } deletePassword() { kr.del(); } } } };

const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const invoke = (ch, sender, arg) => handlers.get(ch)({ sender }, arg);
const live = (file) => windows.filter((w) => !w.destroyed && w.file === file);
const tray = () => trays.filter((t) => !t.destroyed)[0] || null;
const store = () => JSON.parse(fs.readFileSync(path.join(dataDir, 'userData', 'store.json'), 'utf8'));

const sample = path.join(dataDir, 'foto.png');
fs.writeFileSync(sample, makePng());

test.before(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  process.env.QP_API = `http://127.0.0.1:${server.address().port}`;
  process.argv = ['electron', '.', '--preview', sample];
  require('../src/main');
  readyResolve();
  await tick(80);
});
// Uygulama gerçekte hep çalışır (SSO izleyicisi, senkron zamanlayıcıları); test bitince süreç kapatılır.
// process.exit() başarısız testte node:test'in koyduğu çıkış kodunu korur.
test.after(() => { server.close(); setTimeout(() => process.exit(), 100); });

test('girişsiz açılış: sağ tıkla istenen dosya bekletilir, giriş ekranı "giriş yapın" notuyla açılır', async () => {
  const login = live('login.html');
  assert.equal(login.length, 1);
  const st = await invoke('account:state', login[0].webContents);
  assert.equal(st.loggedIn, false);
  assert.equal(st.pending, true);
  assert.match(st.notice, /Mastertool/);
  assert.equal(live('preview.html').length, 0);
  assert.equal(tray(), null, 'girişsizken tepsi yok');
});

test('giriş: tepsi kurulur, önizleme penceresi hazırlanır ve bekleyen dosya gösterilir', async () => {
  const login = live('login.html')[0];
  const r = await invoke('account:login', login.webContents, { email: 'ornek@example.com', password: 'Test1234!', remember: true });
  assert.equal(r.ok, true);
  assert.ok(login.destroyed);
  assert.ok(tray());
  assert.deepEqual(tray().menu.map((m) => m.label || m.type), ['Dosya önizle…', 'Ayarlar', 'separator', 'Gizle (simgeyi kaldır)', 'Çıkış']);
  const pv = live('preview.html')[0];
  assert.ok(pv, 'önizleme penceresi');
  assert.equal(pv.opts.webPreferences.sandbox, false);
  assert.equal(pv.visible, false, 'yüklenene kadar gizli');
  pv.webContents.emit('did-finish-load');
  await tick();
  const open = pv.webContents.sent.find(([ch]) => ch === 'preview:open');
  assert.equal(open[1].path, sample);
  assert.equal(open[1].settings.defaultZoom, 'fit');
  assert.equal(pv.visible, true);
  // ortak oturum yazıldı (SSO)
  assert.equal(JSON.parse(kr.peek()).sso_token, 's1');
});

test('ikinci örnek (sağ tık): aynı pencereye iletilir; kapat gizler, yok etmez', async () => {
  const pv = live('preview.html')[0];
  await invoke('preview:close', pv.webContents);
  assert.equal(pv.visible, false);
  assert.ok(pv.webContents.sent.some(([ch]) => ch === 'preview:hidden'));
  const other = path.join(dataDir, 'ikinci.png');
  fs.writeFileSync(other, makePng());
  app.emit('second-instance', {}, ['x'], dataDir, { qp: 1, preview: other, hidden: false, settings: false });
  assert.equal(pv.visible, true);
  assert.equal(pv.webContents.sent.filter(([ch]) => ch === 'preview:open').pop()[1].path, other);
  // pencerenin kapat düğmesi: gizlenir
  pv.close();
  assert.equal(pv.destroyed, false);
  assert.equal(pv.visible, false);
  // olmayan dosya: bildirim, pencere açılmaz
  app.emit('second-instance', {}, ['x'], dataDir, { qp: 1, preview: path.join(dataDir, 'yok.png') });
  assert.equal(pv.visible, false);
  assert.equal(notes.pop().title, 'Dosya bulunamadı');
  // başka pencereden gelen önizleme komutları yok sayılır
  await invoke('preview:close', { id: 'baska' });
});

test('tepsi "Gizle": simge kalkar, uygulama çalışır; yeniden çalıştırınca simge geri gelir ve Ayarlar açılır', async () => {
  const hide = tray().menu.find((m) => m.label === 'Gizle (simgeyi kaldır)');
  hide.click();
  await tick(200);
  assert.equal(tray(), null);
  assert.equal(store().settings.showTray, false);
  assert.equal(notes.pop().title, 'Quick Preview arka planda çalışıyor');
  assert.equal(app.quitCalled, 0);
  app.emit('second-instance', {}, ['x'], dataDir, { qp: 1, preview: null, hidden: false, settings: false });
  await tick(200);
  assert.ok(tray());
  assert.equal(store().settings.showTray, true);
  assert.equal(live('settings.html').length, 1);
  assert.equal(live('settings.html')[0].query.welcome, '1', 'ilk açılışta karşılama');
});

test('ayarlar: tema ve önizleme senkronlanır, cihaza özgüler doğrulanır; dil değişince pencereler yenilenir', async () => {
  const sw = live('settings.html')[0];
  let r = await invoke('settings:set', sw.webContents, { appTheme: 'dark', preview: { types: { psd: false }, defaultZoom: 'actual' }, hacker: 1, showTray: 'evet' });
  assert.equal(r.ok, true);
  const s = await invoke('settings:get', sw.webContents);
  assert.equal(s.appTheme, 'dark');
  assert.equal(fake.nativeTheme.themeSource, 'dark');
  assert.equal(s.preview.types.psd, false);
  assert.equal(s.preview.types.pdf, true);
  assert.equal(s.preview.defaultZoom, 'actual');
  assert.equal(s.showTray, true);
  assert.equal('hacker' in s, false);
  assert.equal('shellMenuLast' in s, false, 'iç kayıt arayüze gitmez');
  // geliştirmede sağ tık kaydı yapılmaz (electron.exe kaydedilmesin)
  const shell = await invoke('shell:status', sw.webContents);
  assert.equal(shell.supported, false);
  r = await invoke('settings:set', sw.webContents, { language: 'en' });
  assert.equal(r.ok, true);
  assert.ok(sw.webContents.reloads >= 1);
  assert.deepEqual(tray().menu.map((m) => m.label || m.type), ['Preview a file…', 'Settings', 'separator', 'Hide (remove icon)', 'Quit']);
  assert.equal(listeners.get('app:lang') && (() => { const e = {}; listeners.get('app:lang')(e); return e.returnValue; })(), 'en');
});

test('çıkış yap: tüm pencereler ve tepsi kapanır, giriş ekranı açılır; ortak oturum silinir', async () => {
  const sw = live('settings.html')[0];
  await invoke('account:logout', sw.webContents);
  assert.equal(live('preview.html').length, 0);
  assert.equal(live('settings.html').length, 0);
  assert.equal(live('login.html').length, 1);
  assert.equal(tray(), null);
  assert.equal(kr.peek(), null);
  // girişsizken sağ tık isteği yine bekletilir
  app.emit('second-instance', {}, ['x'], dataDir, { qp: 1, preview: sample });
  const st = await invoke('account:state', live('login.html')[0].webContents);
  assert.equal(st.pending, true);
  // giriş ekranı kapatılırsa uygulama kapanır
  live('login.html')[0].destroy();
  assert.ok(app.quitCalled >= 1);
});
