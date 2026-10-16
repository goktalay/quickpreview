'use strict';

// Quick Preview — ana süreç.
// Uygulama tepside bekler. Gezgin'deki "Hızlı Önizleme" yeni bir süreç başlatır; o süreç tek örnek kilidini
// alamayınca dosya yolunu bekleyen örneğe iletip kapanır (bkz. instance.js). Bekleyen örnekte önizleme penceresi
// önceden yüklenmiş ve gizli durur; istek gelince içerik gönderilir ve pencere anında gösterilir.

const { app, BrowserWindow, ipcMain, safeStorage, shell, dialog, clipboard, nativeTheme, Tray, Menu, nativeImage, Notification, screen } = require('electron');
const { setupSingleInstance } = require('./instance');

// ---------------------------------------------------------------------------
// Tek örnek: her şeyden önce. İkinci örnek isteğini iletir ve hiçbir şey yüklemeden çıkar (hız).
// ---------------------------------------------------------------------------
let ready = false;
const queued = [];
const inst = setupSingleInstance(app, {
  argv: process.argv,
  cwd: process.cwd(),
  onRequest: (req) => (ready ? handleRequest(req, { first: false }) : queued.push(req)),
});

if (!inst.primary) {
  app.exit(0);
} else {
  main();
}

function main() {
  const path = require('path');
  const fs = require('fs');
  const I18N = require('./i18n');
  const { KINDS } = require('./preview/detect');
  const { createAccount, API_BASE } = require('./account');
  const { createSso } = require('./sso');
  const { createShellMenu, isWindows11, MODERN_MENU } = require('./shellmenu');

  const ICON = path.join(__dirname, '..', 'build', 'icon.png');
  const APP_NAME = 'Quick Preview';

  // Arayüz dili: ayarlarda seçilen ya da sistem dili (desteklenmiyorsa İngilizce)
  let t = I18N.createT('en');
  const currentLang = () => (store && store.settings.language) || I18N.resolveLanguage(app.getLocale());
  function applyLanguage() { t = I18N.createT(currentLang()); }

  // -------------------------------------------------------------------------
  // Kalıcı depo (userData/store.json)
  // -------------------------------------------------------------------------
  const storePath = () => path.join(app.getPath('userData'), 'store.json');

  const defaultPreview = () => ({
    types: Object.fromEntries(KINDS.map((k) => [k, true])), // Ayarlar › Önizleme › Türler
    defaultZoom: 'fit',   // 'fit' | 'actual' — resim, PSD ve PDF açılışta
    psdLayers: true,      // PSD katman listesi (bilgi panelinde)
    infoPanel: false,     // dosya bilgisi paneli açık başlasın
    textWrap: false,      // metin/kod satır kaydırma
    mediaAutoplay: true,  // video/ses açılınca oynasın
  });

  const defaultStore = () => ({
    syncMeta: {},
    settings: {
      appTheme: 'system', // 'dark' | 'light' | 'system' (Mastertool standardı: varsayılan Sistem)
      language: null,     // null = sistem dili
      preview: defaultPreview(),
      // cihaza özgü (senkronlanmaz)
      openAtLogin: true,  // Windows oturumu açılınca tepside başlat (varsayılan açık)
      showTray: true,     // tepsi simgesi; "Gizle" ile kapanır, uygulama arka planda kalır
      shellMenu: true,    // Gezgin sağ tık menüsünde "Hızlı Önizleme"
      checkUpdates: true, // açılışta yeni sürüm denetimi
      shellMenuLast: null,
      previewBounds: null,
      firstRunDone: false,
      trayHiddenHintShown: false,
    },
  });

  let store = null;

  function sanitizePreview(p) {
    const d = defaultPreview();
    const v = p && typeof p === 'object' ? p : {};
    const types = {};
    for (const k of KINDS) types[k] = !(v.types && v.types[k] === false);
    return {
      types,
      defaultZoom: v.defaultZoom === 'actual' ? 'actual' : 'fit',
      psdLayers: v.psdLayers !== undefined ? !!v.psdLayers : d.psdLayers,
      infoPanel: !!v.infoPanel,
      textWrap: !!v.textWrap,
      mediaAutoplay: v.mediaAutoplay !== undefined ? !!v.mediaAutoplay : d.mediaAutoplay,
    };
  }

  function loadStore() {
    try {
      store = { ...defaultStore(), ...JSON.parse(fs.readFileSync(storePath(), 'utf8')) };
      store.settings = { ...defaultStore().settings, ...(store.settings || {}) };
      if (!store.syncMeta) store.syncMeta = {};
    } catch {
      store = defaultStore();
    }
    store.settings.preview = sanitizePreview(store.settings.preview);
    applyAppTheme();
    applyLanguage();
  }

  let saveTimer = null;
  // Ayar değişikliği kaydedilir ve (3 sn sonra) senkron tetiklenir; cihaza özgü kayıtlar için { sync: false }
  function saveStore({ sync = true } = {}) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(writeStore, 150);
    if (sync && account) account.onLocalChange();
  }
  function writeStore() {
    clearTimeout(saveTimer);
    saveTimer = null;
    fs.mkdirSync(path.dirname(storePath()), { recursive: true });
    fs.writeFileSync(storePath(), JSON.stringify(store, null, 2), 'utf8');
  }

  // Gece / Gündüz / Sistem: tüm pencerelerin prefers-color-scheme'ini ve başlık çubuklarını belirler
  function applyAppTheme() {
    const v = store.settings.appTheme;
    nativeTheme.themeSource = v === 'dark' || v === 'light' ? v : 'system';
  }
  const windowBg = () => (nativeTheme.shouldUseDarkColors ? '#0b0f17' : '#eef2f7');

  function encrypt(text) {
    if (!text) return '';
    if (safeStorage.isEncryptionAvailable()) return 'enc:' + safeStorage.encryptString(text).toString('base64');
    return 'b64:' + Buffer.from(text, 'utf8').toString('base64');
  }
  function decrypt(value) {
    if (!value) return '';
    if (value.startsWith('enc:')) return safeStorage.decryptString(Buffer.from(value.slice(4), 'base64'));
    if (value.startsWith('b64:')) return Buffer.from(value.slice(4), 'base64').toString('utf8');
    return value;
  }

  // Arayüze giden ayarlar (cihaza özgü iç kayıtlar hariç)
  function publicSettings() {
    const { shellMenuLast, previewBounds, ...rest } = store.settings;
    return { ...rest, language: store.settings.language || currentLang() };
  }

  function broadcastSettings() {
    const data = publicSettings();
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send('settings:changed', data);
    if (tray) tray.setContextMenu(buildTrayMenu());
  }

  // -------------------------------------------------------------------------
  // Çalıştırılabilir dosya: taşınabilir sürümde geçici klasördeki değil, kullanıcının çalıştırdığı exe
  // -------------------------------------------------------------------------
  const exePath = () => process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
  const isPortable = () => !!process.env.PORTABLE_EXECUTABLE_FILE;

  // -------------------------------------------------------------------------
  // Gezgin sağ tık menüsü (yalnız paketlenmiş uygulamada; geliştirmede electron.exe kaydedilmesin)
  // -------------------------------------------------------------------------
  const shellMenu = createShellMenu({ exe: exePath(), platform: app.isPackaged ? process.platform : 'dev' });

  async function applyShellMenu() {
    if (!shellMenu.supported) return { ok: false, code: 'unsupported' };
    const r = await shellMenu.ensure(!!store.settings.shellMenu, t('shell.verb'), store.settings.shellMenuLast);
    if ((r.last || null) !== store.settings.shellMenuLast) {
      store.settings.shellMenuLast = r.last || null;
      saveStore({ sync: false });
    }
    return r;
  }

  // Windows oturumu açılınca tepside başlat (Run kaydının adı sabit: kaldırıcı da bu adla siler, bkz. installer.nsh)
  const LOGIN_ITEM = 'MastertoolQuickPreview';
  function applyOpenAtLogin() {
    if (!app.isPackaged || process.platform !== 'win32') return;
    app.setLoginItemSettings({ openAtLogin: !!store.settings.openAtLogin, path: exePath(), args: ['--hidden'], name: LOGIN_ITEM });
  }
  const openAtLoginState = () => (app.isPackaged && process.platform === 'win32'
    ? app.getLoginItemSettings({ path: exePath(), args: ['--hidden'] }).openAtLogin
    : !!store.settings.openAtLogin);

  // -------------------------------------------------------------------------
  // Mastertool hesabı (mastertool.download, /api/qp) ve uçtan uca şifreli ayar senkronu
  // -------------------------------------------------------------------------
  let account = null;
  let loginWindow = null;
  let loginNotice = null;    // giriş ekranında gösterilecek bilgi (ör. oturum süresi doldu, önizleme için giriş)
  let pendingPreview = null; // girişten önce sağ tıkla istenen dosya; girişten sonra açılır
  let updateInfo = null;     // { version, notes } — yeni sürüm varsa

  function initSso() {
    try {
      return createSso({ stateDir: path.join(app.getPath('appData'), 'Mastertool') });
    } catch {
      return null;
    }
  }

  function initAccount() {
    account = createAccount({
      sso: initSso(),
      onSharedSignIn: () => enterApp(),
      onSharedSignOut: (code) => showLogin(code === 'app_disabled' ? t('auth.errAppDisabled') : null),
      userDataDir: app.getPath('userData'),
      appVersion: app.getVersion(),
      encrypt,
      decrypt,
      getStore: () => store,
      // Senkrondan gelen ayarları uygula (yeni senkron tetiklemeden)
      replaceLibrary: ({ settings, syncMeta }) => {
        const prevLang = currentLang();
        store.syncMeta = syncMeta;
        Object.assign(store.settings, settings);
        store.settings.preview = sanitizePreview(store.settings.preview);
        writeStore();
        applyAppTheme();
        applyLanguage();
        if (currentLang() !== prevLang) onLanguageChanged();
        else broadcastSettings();
      },
      persistStore: writeStore,
      resetSyncMeta: () => { store.syncMeta = {}; writeStore(); },
      onStatus: (st) => {
        for (const w of BrowserWindow.getAllWindows()) w.webContents.send('account:status', st);
      },
      onSessionExpired: (code) =>
        showLogin(t(code === 'app_disabled' ? 'auth.errAppDisabled' : code === 'wrong_app' ? 'auth.errWrongApp' : 'auth.errSessionExpired')),
      onUpdate: (info) => {
        updateInfo = info;
        notifyUpdate(info);
        for (const w of BrowserWindow.getAllWindows()) w.webContents.send('app:update', info);
      },
    });
  }

  function notifyUpdate(info) {
    if (!Notification.isSupported()) return;
    const n = new Notification({ title: t('update.available', { version: info.version }), body: t('update.hint'), icon: ICON, silent: true });
    n.on('click', () => openWeb('account'));
    n.show();
  }

  // Giriş yapıldı (şifreyle ya da ortak oturumla): giriş ekranı kapanır, uygulama tepside çalışır
  function enterApp() {
    loginNotice = null;
    ensureTray();
    createPreviewWindow();
    const file = pendingPreview;
    pendingPreview = null;
    if (loginWindow) loginWindow.destroy();
    if (file) openPreview(file);
    else if (!store.settings.firstRunDone) showSettings('general');
    account.start().then(() => store.settings.checkUpdates && account.checkUpdate()).catch(() => {});
  }

  const webPreferences = { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false };

  function createLoginWindow() {
    loginWindow = new BrowserWindow({
      width: 440,
      height: 640,
      resizable: false,
      maximizable: false,
      backgroundColor: windowBg(),
      title: APP_NAME,
      icon: ICON,
      autoHideMenuBar: true,
      webPreferences,
    });
    loginWindow.setMenuBarVisibility(false);
    loginWindow.loadFile(path.join(__dirname, 'renderer', 'login.html'));
    loginWindow.on('closed', () => {
      loginWindow = null;
      // Girişsiz çalışılmaz: giriş ekranı kapatılırsa uygulama kapanır (sağ tık yeniden başlatır)
      if (!account || !account.isLoggedIn()) quit();
    });
  }

  // Oturum yoksa ya da düştüyse: giriş ekranını aç, diğer tüm pencereleri ve tepsiyi kapat
  function showLogin(notice) {
    loginNotice = notice || null;
    destroyTray();
    if (!loginWindow) createLoginWindow();
    else {
      loginWindow.webContents.reload();
      if (loginWindow.isMinimized()) loginWindow.restore();
      loginWindow.show();
      loginWindow.focus();
    }
    for (const w of BrowserWindow.getAllWindows()) if (w !== loginWindow) w.destroy();
    previewWindow = null;
    settingsWindow = null;
  }

  // -------------------------------------------------------------------------
  // Önizleme penceresi: bir kez oluşturulur ve gizli bekler (anında açılış için)
  // -------------------------------------------------------------------------
  let previewWindow = null;
  let previewReady = false;
  let previewQueued = null;

  function previewSize() {
    const b = store.settings.previewBounds;
    const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    const width = Math.min(area.width, Math.max(640, (b && b.width) || Math.round(area.width * 0.72)));
    const height = Math.min(area.height, Math.max(420, (b && b.height) || Math.round(area.height * 0.8)));
    return { width, height, area };
  }

  function createPreviewWindow() {
    if (previewWindow && !previewWindow.isDestroyed()) return previewWindow;
    previewReady = false;
    const { width, height } = previewSize();
    previewWindow = new BrowserWindow({
      width,
      height,
      minWidth: 520,
      minHeight: 360,
      show: false,
      backgroundColor: windowBg(),
      title: APP_NAME,
      icon: ICON,
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, 'preview-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,          // preload dosyaları yerelde okur ve çözer (PSD, TIFF, Office…)
        spellcheck: false,
        backgroundThrottling: false,
      },
    });
    previewWindow.setMenuBarVisibility(false);
    previewWindow.loadFile(path.join(__dirname, 'renderer', 'preview.html'));
    previewWindow.webContents.once('did-finish-load', () => {
      previewReady = true;
      if (previewQueued) { const f = previewQueued; previewQueued = null; openPreview(f); }
    });
    // Kapat düğmesi pencereyi yok etmez, gizler (bir sonraki önizleme anında açılsın)
    previewWindow.on('close', (e) => {
      if (isQuitting) return;
      e.preventDefault();
      hidePreview();
    });
    const remember = () => {
      if (!previewWindow || previewWindow.isMaximized() || previewWindow.isFullScreen()) return;
      const [w, h] = previewWindow.getSize();
      store.settings.previewBounds = { width: w, height: h };
      saveStore({ sync: false });
    };
    previewWindow.on('resized', remember);
    previewWindow.on('closed', () => { previewWindow = null; previewReady = false; });
    return previewWindow;
  }

  function hidePreview() {
    if (!previewWindow || previewWindow.isDestroyed()) return;
    previewWindow.webContents.send('preview:hidden');
    if (previewWindow.isFullScreen()) previewWindow.setFullScreen(false);
    previewWindow.hide();
  }

  function openPreview(file) {
    if (!account || !account.isLoggedIn()) {
      pendingPreview = file;
      showLogin(t('auth.needLogin'));
      return;
    }
    let st = null;
    try { st = fs.statSync(file); } catch { /* yok */ }
    if (!st || st.isDirectory()) {
      notify(t('main.fileMissing'), file);
      return;
    }
    const win = createPreviewWindow();
    if (!previewReady) { previewQueued = file; return; }
    win.webContents.send('preview:open', { path: file, settings: store.settings.preview });
    if (!win.isVisible()) {
      // İmlecin bulunduğu ekranda ortala
      const { width, height, area } = previewSize();
      if (!win.isMaximized()) {
        win.setBounds({ x: Math.round(area.x + (area.width - width) / 2), y: Math.round(area.y + (area.height - height) / 2), width, height });
      }
    }
    if (win.isMinimized()) win.restore();
    win.show();
    // Windows ön plan kilidi: sağ tıktan gelen istekte pencere öne gelsin
    win.setAlwaysOnTop(true);
    win.focus();
    win.moveTop();
    setTimeout(() => { if (!win.isDestroyed()) win.setAlwaysOnTop(false); }, 150);
  }

  function notify(title, body) {
    if (Notification.isSupported()) new Notification({ title, body: body || '', icon: ICON, silent: true }).show();
  }

  async function pickAndPreview(parent) {
    const res = await dialog.showOpenDialog(parent || undefined, { title: t('tray.openFile'), properties: ['openFile'] });
    if (!res.canceled && res.filePaths[0]) openPreview(res.filePaths[0]);
  }

  // -------------------------------------------------------------------------
  // Ayarlar penceresi (Genel · Hesap · Önizleme · Hakkında)
  // -------------------------------------------------------------------------
  let settingsWindow = null;

  function showSettings(tab) {
    if (!account || !account.isLoggedIn()) return showLogin();
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      if (tab) settingsWindow.webContents.send('settings:tab', tab);
      if (settingsWindow.isMinimized()) settingsWindow.restore();
      settingsWindow.show();
      settingsWindow.focus();
      return;
    }
    settingsWindow = new BrowserWindow({
      width: 960,
      height: 680,
      minWidth: 720,
      minHeight: 520,
      backgroundColor: windowBg(),
      title: `${t('set.title')} — ${APP_NAME}`,
      icon: ICON,
      autoHideMenuBar: true,
      webPreferences,
    });
    settingsWindow.setMenuBarVisibility(false);
    settingsWindow.loadFile(path.join(__dirname, 'renderer', 'settings.html'), { query: { tab: tab || 'general', welcome: store.settings.firstRunDone ? '' : '1' } });
    if (!store.settings.firstRunDone) {
      store.settings.firstRunDone = true;
      saveStore({ sync: false });
    }
    settingsWindow.on('closed', () => (settingsWindow = null));
  }

  // -------------------------------------------------------------------------
  // Sistem tepsisi: Dosya önizle… · Ayarlar · Gizle · Çıkış
  // -------------------------------------------------------------------------
  let tray = null;
  let isQuitting = false;

  function buildTrayMenu() {
    return Menu.buildFromTemplate([
      { label: t('tray.openFile'), click: () => pickAndPreview() },
      { label: t('tray.settings'), click: () => showSettings() },
      { type: 'separator' },
      { label: t('tray.hide'), click: hideTrayIcon },
      { label: t('tray.quit'), click: quit },
    ]);
  }

  function ensureTray() {
    if (!store.settings.showTray || !account || !account.isLoggedIn()) return destroyTray();
    if (tray) {
      tray.setContextMenu(buildTrayMenu());
      return;
    }
    const img = nativeImage.createFromPath(ICON).resize({ width: 16, height: 16, quality: 'best' });
    tray = new Tray(img);
    tray.setToolTip(`${APP_NAME} — ${t('tray.tooltip')}`);
    tray.setContextMenu(buildTrayMenu());
    tray.on('click', () => showSettings());
    tray.on('double-click', () => showSettings());
  }

  function destroyTray() {
    if (tray) {
      tray.destroy();
      tray = null;
    }
  }

  // "Gizle": simge kalkar, uygulama arka planda sağ tık isteklerini beklemeye devam eder.
  // Geri getirmek: Ayarlar › Genel ya da uygulamayı yeniden çalıştırmak (Başlat menüsü).
  function hideTrayIcon() {
    store.settings.showTray = false;
    saveStore({ sync: false });
    destroyTray();
    broadcastSettings();
    if (!store.settings.trayHiddenHintShown) {
      store.settings.trayHiddenHintShown = true;
      saveStore({ sync: false });
      notify(t('tray.hiddenTitle'), t('tray.hiddenBody'));
    }
  }

  function quit() {
    isQuitting = true;
    if (saveTimer) writeStore();
    app.quit();
  }

  // -------------------------------------------------------------------------
  // İstekler: ilk açılış ya da ikinci örnekten iletilen (sağ tık, Başlat menüsü, Windows oturumu)
  // -------------------------------------------------------------------------
  global.handleRequest = handleRequest; // üstteki iletici (main() dışında tanımlı) bu işlevi çağırır
  function handleRequest(req, { first }) {
    if (req.preview) return openPreview(req.preview);
    if (!account.isLoggedIn()) return showLogin(loginNotice);
    if (first && req.hidden) return; // Windows oturumuyla başladı: yalnız tepside bekle
    // Uygulama elle yeniden çalıştırıldı: gizlenmiş tepsi simgesi geri gelir, Ayarlar açılır
    if (!store.settings.showTray) {
      store.settings.showTray = true;
      saveStore({ sync: false });
      broadcastSettings();
    }
    ensureTray();
    showSettings(req.settings ? 'general' : undefined);
  }

  // -------------------------------------------------------------------------
  // IPC — ortak
  // -------------------------------------------------------------------------
  ipcMain.on('app:lang', (e) => { e.returnValue = currentLang(); });
  ipcMain.on('app:version', (e) => { e.returnValue = app.getVersion(); });

  ipcMain.handle('settings:get', () => publicSettings());

  // Senkronlanan ayarlar (tema, dil, önizleme) senkron tetikler; cihaza özgüler sessiz kaydedilir
  const DEVICE_SETTINGS = ['openAtLogin', 'showTray', 'shellMenu', 'checkUpdates'];
  ipcMain.handle('settings:set', async (_e, patch) => {
    const p = { ...(patch || {}) };
    const allowed = ['appTheme', 'language', 'preview', ...DEVICE_SETTINGS];
    for (const k of Object.keys(p)) if (!allowed.includes(k)) delete p[k];
    if ('appTheme' in p) p.appTheme = ['dark', 'light', 'system'].includes(p.appTheme) ? p.appTheme : 'system';
    if ('language' in p) p.language = I18N.LANGUAGES[p.language] ? p.language : null;
    if ('preview' in p) p.preview = sanitizePreview({ ...store.settings.preview, ...p.preview, types: { ...store.settings.preview.types, ...((p.preview && p.preview.types) || {}) } });
    for (const k of DEVICE_SETTINGS) if (k in p) p[k] = !!p[k];
    const prevLang = currentLang();
    Object.assign(store.settings, p);
    const loud = Object.keys(p).some((k) => !DEVICE_SETTINGS.includes(k));
    saveStore({ sync: loud });
    if ('appTheme' in p) applyAppTheme();
    if ('openAtLogin' in p) applyOpenAtLogin();
    if ('showTray' in p) ensureTray();
    let menu = null;
    if ('language' in p) {
      applyLanguage();
      if (currentLang() !== prevLang) { onLanguageChanged(); return { ok: true }; }
    }
    if ('shellMenu' in p) menu = await applyShellMenu();
    broadcastSettings();
    return { ok: !menu || menu.ok, code: menu && menu.code };
  });

  // Dil değişince: sağ tık etiketi, tepsi menüsü ve açık pencereler yeni dille
  function onLanguageChanged() {
    applyShellMenu().catch(() => {});
    if (tray) { tray.setContextMenu(buildTrayMenu()); tray.setToolTip(`${APP_NAME} — ${t('tray.tooltip')}`); }
    for (const w of BrowserWindow.getAllWindows()) {
      if (w === previewWindow) { if (!w.isVisible()) { previewReady = false; w.webContents.once('did-finish-load', () => { previewReady = true; }); w.webContents.reload(); } else w.webContents.send('settings:changed', publicSettings()); }
      else w.webContents.reload();
    }
    if (settingsWindow) settingsWindow.setTitle(`${t('set.title')} — ${APP_NAME}`);
  }

  ipcMain.handle('account:state', () => ({ ...account.state(), notice: loginNotice, appVersion: app.getVersion(), pending: !!pendingPreview }));

  ipcMain.handle('account:login', async (_e, { email, password, remember }) => {
    try {
      await account.login(email, password, remember);
      enterApp();
      return { ok: true };
    } catch (e) {
      return { ok: false, code: e.code || 'error', message: e.message };
    }
  });

  ipcMain.handle('account:logout', async () => {
    await account.logout();
    showLogin();
  });

  ipcMain.handle('account:syncNow', () => account.syncNow());
  ipcMain.handle('account:setSync', async (_e, on) => {
    try { await account.setSyncEnabled(on); return { ok: true }; } catch (e) { return { ok: false, code: e.code }; }
  });
  ipcMain.handle('account:deleteRemote', async () => {
    try { await account.deleteRemote(); return { ok: true }; } catch (e) { return { ok: false, code: e.code }; }
  });

  // Mastertool düğmesi: portal, uygulamanın dili ve o anki gece/gündüz temasıyla tarayıcıda açılır
  ipcMain.handle('app:openMastertool', () => {
    const theme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
    shell.openExternal(`https://mastertool.download/?lang=${encodeURIComponent(currentLang())}&theme=${theme}`);
  });

  // Hesap sayfaları ve araç tanıtım sayfası varsayılan tarayıcıda (yalnız bu adresler)
  function openWeb(page) {
    const allowed = { forgot: '/sifremi-unuttum', register: '/kayit', account: '/hesabim', tool: '/araclar/quick-preview' };
    if (!allowed[page]) return;
    const q = new URLSearchParams({ lang: currentLang(), theme: nativeTheme.shouldUseDarkColors ? 'dark' : 'light', app: 'qp' });
    shell.openExternal(`${API_BASE}${allowed[page]}?${q}`);
  }
  ipcMain.handle('account:openWeb', (_e, page) => openWeb(page));

  ipcMain.handle('app:about', () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    openAtLogin: openAtLoginState(),
    portable: isPortable(),
    packaged: app.isPackaged,
    update: updateInfo,
  }));

  ipcMain.handle('app:checkUpdate', async () => {
    try {
      return { ok: true, ...(await account.checkUpdate({ manual: true })) };
    } catch (e) {
      return { ok: false, code: e.code || 'error', message: e.message };
    }
  });

  // Chromium/Electron lisans dosyaları kurulum klasöründe durur
  ipcMain.handle('app:openLicenses', () => {
    const file = path.join(path.dirname(process.execPath), 'LICENSES.chromium.html');
    if (fs.existsSync(file)) return shell.openPath(file);
    return shell.openExternal('https://www.electronjs.org/docs/latest#license');
  });

  ipcMain.handle('app:quit', () => quit());
  ipcMain.handle('app:pickAndPreview', (e) => pickAndPreview(BrowserWindow.fromWebContents(e.sender)));

  ipcMain.handle('shell:status', async () => {
    const st = await shellMenu.status();
    return { ...st, enabled: !!store.settings.shellMenu, win11: st.win11 ?? isWindows11(), modern: MODERN_MENU, label: t('shell.verb'), portable: isPortable() };
  });

  // -------------------------------------------------------------------------
  // IPC — önizleme penceresi
  // -------------------------------------------------------------------------
  const fromPreview = (e) => previewWindow && e.sender === previewWindow.webContents;

  ipcMain.handle('preview:close', (e) => { if (fromPreview(e)) hidePreview(); });
  ipcMain.handle('preview:openDefault', async (e, p) => {
    if (!fromPreview(e) || typeof p !== 'string') return;
    const err = await shell.openPath(p);
    if (!err) hidePreview();
    return err || null;
  });
  ipcMain.handle('preview:reveal', (e, p) => { if (fromPreview(e) && typeof p === 'string') shell.showItemInFolder(p); });
  ipcMain.handle('preview:copyPath', (e, p) => { if (fromPreview(e)) clipboard.writeText(String(p || '')); });
  // Markdown bağlantıları: yalnız http/https/mailto, tarayıcıda
  ipcMain.handle('preview:openExternal', (e, url) => {
    if (fromPreview(e) && /^(https?:|mailto:)/i.test(String(url || ''))) shell.openExternal(String(url));
  });
  ipcMain.on('preview:title', (e, title) => { if (fromPreview(e)) previewWindow.setTitle(title ? `${title} — ${APP_NAME}` : APP_NAME); });
  ipcMain.handle('preview:setPrefs', (e, patch) => {
    // Pencereden değişen kalıcı tercihler (bilgi paneli, satır kaydırma)
    if (!fromPreview(e) || !patch) return;
    const p = {};
    for (const k of ['infoPanel', 'textWrap']) if (k in patch) p[k] = !!patch[k];
    store.settings.preview = sanitizePreview({ ...store.settings.preview, ...p });
    saveStore();
  });
  ipcMain.handle('preview:toggleFullscreen', (e) => { if (fromPreview(e)) previewWindow.setFullScreen(!previewWindow.isFullScreen()); });
  ipcMain.handle('preview:showSettings', (e) => { if (fromPreview(e)) showSettings('preview'); });

  // -------------------------------------------------------------------------
  app.setAppUserModelId('com.mastertool.quickpreview');

  app.on('web-contents-created', (_e, wc) => {
    wc.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
      return { action: 'deny' };
    });
    wc.on('will-navigate', (e) => e.preventDefault());
  });

  app.on('before-quit', () => (isQuitting = true));
  // Pencereler kapansa da tepside çalışmaya devam edilir; çıkış yalnız "Çıkış" ile (ya da girişsizken)
  app.on('window-all-closed', () => {
    if (!account || !account.isLoggedIn()) quit();
  });

  app.whenReady().then(async () => {
    loadStore();
    initAccount();
    applyOpenAtLogin();
    applyShellMenu().catch(() => {});
    // Uygulama girişsiz kullanılamaz. "Beni hatırla" ile saklı oturum varsa doğrudan; yoksa ve başka bir
    // Mastertool uygulamasında giriş yapılmışsa ortak oturumla şifresiz açılır.
    if (!account.isLoggedIn()) {
      const r = await account.trySharedSignIn();
      if (r.code === 'app_disabled') loginNotice = t('auth.errAppDisabled');
    }
    account.watchShared();
    ready = true;
    const reqs = [inst.request, ...queued.splice(0)];
    if (account.isLoggedIn()) {
      ensureTray();
      createPreviewWindow();
      account.start().then(() => store.settings.checkUpdates && account.checkUpdate()).catch(() => {});
      for (const r of reqs) handleRequest(r, { first: r === inst.request });
    } else {
      const file = reqs.map((r) => r.preview).filter(Boolean).pop();
      if (file) pendingPreview = file;
      showLogin(file ? t('auth.needLogin') : loginNotice);
    }
  });
}

// main() içinde tanımlanan işleyici; tek örnek iletici main()'den önce kurulduğu için global üzerinden çağrılır
function handleRequest(req, opts) {
  if (typeof global.handleRequest === 'function') global.handleRequest(req, opts);
}
