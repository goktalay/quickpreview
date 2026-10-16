'use strict';

// Önizleme penceresinin preload'u. Dosyalar burada (renderer sürecinde) okunur ve çözülür; sayfa yalnız
// hazır tanımı alır, Node'a erişemez. Ana süreç (tepsi, sağ tık iletimi) çözme işiyle hiç meşgul olmaz.

const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');
const { loadPreview, listSiblings } = require('./preview');

const on = (channel) => (cb) => {
  const listener = (_e, data) => cb(data);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

// pdf.js yardımcı dosyaları (karakter eşlemleri, standart yazı tipleri) uygulama paketinden okunur
const PDFJS_DIR = path.dirname(require.resolve('pdfjs-dist/package.json'));
function pdfAsset(kind, name) {
  const dir = kind === 'cmap' ? 'cmaps' : 'standard_fonts';
  const file = path.join(PDFJS_DIR, dir, path.basename(String(name)));
  return new Uint8Array(fs.readFileSync(file));
}

let lastToken = 0;

contextBridge.exposeInMainWorld('api', {
  lang: ipcRenderer.sendSync('app:lang'),
  version: ipcRenderer.sendSync('app:version'),

  // Önizleme tanımı (bkz. preview/index.js). Hızlı art arda isteklerde eskisinin sonucu atılır.
  load: async (file, settings) => {
    const token = ++lastToken;
    const d = await loadPreview(file, settings || {});
    return token === lastToken ? d : null;
  },
  siblings: (file) => listSiblings(file, { lang: ipcRenderer.sendSync('app:lang') }),
  pdfAsset,

  close: () => ipcRenderer.invoke('preview:close'),
  openDefault: (p) => ipcRenderer.invoke('preview:openDefault', p),
  reveal: (p) => ipcRenderer.invoke('preview:reveal', p),
  copyPath: (p) => ipcRenderer.invoke('preview:copyPath', p),
  openExternal: (url) => ipcRenderer.invoke('preview:openExternal', url),
  setTitle: (title) => ipcRenderer.send('preview:title', title),
  setPrefs: (patch) => ipcRenderer.invoke('preview:setPrefs', patch),
  toggleFullscreen: () => ipcRenderer.invoke('preview:toggleFullscreen'),
  showSettings: () => ipcRenderer.invoke('preview:showSettings'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),

  onOpen: on('preview:open'),
  onHidden: on('preview:hidden'),
  onSettingsChanged: on('settings:changed'),
});
