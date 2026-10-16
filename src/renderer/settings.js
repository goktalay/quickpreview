'use strict';

// Ayarlar penceresi — Mastertool ortak iskeleti: Genel · Hesap · Önizleme · Hakkında.
// Quick Preview'un ana penceresi budur (uygulama tepside bekler). Değişiklikler anında uygulanır.

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);

let S = {};          // ayarlar (ana süreçten)
let acct = { loggedIn: false };
let about = {};

// Önizleme türleri: simge ve örnek uzantılar
const TYPES = [
  ['image', 'image', 'jpg png gif webp bmp tiff ico heic'],
  ['psd', 'layers', 'psd psb'],
  ['pdf', 'pdf', 'pdf'],
  ['svg', 'image', 'svg'],
  ['text', 'fileCode', 'txt log json xml js py cs sql…'],
  ['markdown', 'markdown', 'md markdown'],
  ['media', 'film', 'mp4 webm mov mp3 wav flac…'],
  ['office', 'table', 'docx xlsx pptx'],
  ['archive', 'archive', 'zip jar epub…'],
];

const OSS = [
  ['Quick Preview', 'MIT'], ['Electron', 'MIT'], ['Chromium', 'BSD-3-Clause +'], ['Node.js', 'MIT'],
  ['PDF.js (pdfjs-dist)', 'Apache-2.0'], ['ag-psd', 'MIT'], ['highlight.js', 'BSD-3-Clause'], ['marked', 'MIT'],
  ['UTIF.js', 'MIT'], ['libheif (libheif-js)', 'LGPL-3.0'], ['heic-decode', 'ISC'], ['@napi-rs/keyring', 'MIT'],
];

const TABS = [
  ['general', 'gear', 'set.general'],
  ['account', 'user', 'set.account'],
  ['preview', 'eye', 'set.tabPreview'],
  ['about', 'bolt', 'set.about'],
];

document.title = `${t('set.title')} — Quick Preview`;
$('#brandSub').textContent = t('set.title');
$('#mtSlot').replaceWith(mastertoolButton()); // sağ üst köşe (Mastertool standardı)

// Hızlı tema düğmesi: Gece ↔ Gündüz
function paintThemeBtn() {
  const dark = !matchMedia('(prefers-color-scheme: light)').matches;
  $('#btnTheme').innerHTML = icon(dark ? 'sun' : 'moon');
  $('#btnTheme').title = dark ? t('set.toLight') : t('set.toDark');
}
$('#btnTheme').onclick = () => {
  const dark = !matchMedia('(prefers-color-scheme: light)').matches;
  save({ appTheme: dark ? 'light' : 'dark' }, { quiet: true });
};
matchMedia('(prefers-color-scheme: light)').addEventListener('change', paintThemeBtn);
paintThemeBtn();

// Sekmeler
$('#nav').innerHTML = TABS.map(([k, ic, label]) => `<button type="button" data-tab="${k}">${icon(ic)}<span>${esc(t(label))}</span></button>`).join('');
$('#nav').querySelectorAll('button').forEach((b) => (b.onclick = () => showTab(b.dataset.tab)));
let currentTab = params.get('tab') || 'general';
function showTab(k) {
  currentTab = k;
  $('#nav').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.tab === k));
  $('#pages').querySelectorAll('section').forEach((p) => p.classList.toggle('hidden', p.dataset.page !== k));
}
window.api.onTab((k) => showTab(k));

async function save(patch, { quiet = false } = {}) {
  const r = await window.api.setSettings(patch);
  if (r && r.ok === false) toast(t('set.saveFailed', { msg: r.code || '' }), { type: 'err' });
  else if (!quiet) toast(t('set.saved'), { type: 'ok', timeout: 1600 });
  return r;
}

// --- Hesap durumu ---------------------------------------------------------------------
function syncText(st) {
  if (!st.syncEnabled || st.state === 'off') return t('sync.off');
  if (st.state === 'syncing') return t('sync.syncing');
  if (st.state === 'offline') return t('sync.offline');
  if (st.state === 'error') {
    if (st.error === 'decrypt_failed') return t('sync.errDecrypt');
    if (st.error === 'too_large') return t('sync.errTooLarge');
    return t('sync.error', { msg: st.errorMessage || st.error });
  }
  return st.lastSyncAt ? t('acct.lastSync', { time: formatDate(st.lastSyncAt) }) : t('acct.never');
}
window.api.onAccountStatus((st) => {
  acct = st;
  const el = $('#acct-status');
  if (el) el.textContent = syncText(acct);
  const sw = $('#s-sync');
  if (sw) sw.checked = !!acct.syncEnabled;
});

// --- Sayfalar -------------------------------------------------------------------------
function render() {
  const email = (acct.user && acct.user.email) || acct.email || '';
  const langOptions = Object.entries(I18N.LANGUAGES)
    .map(([code, l]) => `<option value="${code}" ${code === LANG ? 'selected' : ''}>${esc(l.name)}</option>`).join('');
  const p = S.preview || {};
  const welcome = params.get('welcome') === '1';

  $('#pages').innerHTML = `
    <section data-page="general">
      ${welcome ? `<div class="welcome"><img class="w-ic" src="../../build/icon.png" alt="">
        <div><b>${esc(t('welcome.title'))}</b><p>${esc(t('welcome.body'))}</p></div>
        <button class="btn primary" type="button" id="w-try">${icon('eye')}${esc(t('welcome.try'))}</button></div>` : ''}
      <h1 class="page-title">${esc(t('set.general'))}</h1>
      <div class="field"><label>${esc(t('set.language'))}</label><select class="input" id="s-lang" style="max-width:280px">${langOptions}</select></div>
      <div class="field"><label>${esc(t('set.theme'))}</label>
        <div class="seg" id="s-theme">
          <button type="button" data-v="dark">${icon('moon')}${esc(t('set.themeDark'))}</button>
          <button type="button" data-v="light">${icon('sun')}${esc(t('set.themeLight'))}</button>
          <button type="button" data-v="system">${icon('monitor')}${esc(t('set.themeSystem'))}</button>
        </div></div>

      <div class="section-title">${esc(t('set.startupTray'))}</div>
      <label class="check"><input type="checkbox" id="s-login" ${about.openAtLogin ? 'checked' : ''}>
        <span>${esc(t('set.openAtLogin'))}<small>${esc(t('set.openAtLoginHint'))}</small></span></label>
      <label class="check"><input type="checkbox" id="s-tray" ${S.showTray ? 'checked' : ''}>
        <span>${esc(t('set.showTray'))}<small>${esc(t('set.showTrayHint'))}</small></span></label>

      <div class="section-title">${esc(t('set.shellMenu'))}</div>
      <label class="check"><input type="checkbox" id="s-shell" ${S.shellMenu ? 'checked' : ''}>
        <span>${esc(t('set.shellMenuToggle', { verb: t('shell.verb') }))}<small>${esc(t('set.shellMenuHint'))}</small></span></label>
      <div class="status-line" id="shell-status"><span class="dot"></span><span></span></div>
      <div class="note" id="shell-win11">${icon('info')}<span>${esc(t('set.win11Note'))}</span></div>

      <div class="section-title">${esc(t('set.updates'))}</div>
      <label class="check"><input type="checkbox" id="s-upd" ${S.checkUpdates ? 'checked' : ''}>
        <span>${esc(t('set.checkUpdates'))}<small>${esc(t('set.checkUpdatesHint'))}</small></span></label>

      <div class="quit-row"><button class="btn sm danger" type="button" id="s-quit">${icon('power')}${esc(t('set.quit'))}</button></div>
    </section>

    <section data-page="account">
      <h1 class="page-title">${esc(t('set.account'))}</h1>
      <div class="acct-box">
        <div class="acct-who">${icon('user')}<span>${esc(t('acct.signedInAs', { email }))}</span></div>
        <label class="check"><input type="checkbox" id="s-sync" ${acct.syncEnabled ? 'checked' : ''}>
          <span>${esc(t('acct.syncToggle'))}<small>${esc(t('acct.syncHint'))}</small></span></label>
        <div class="acct-status">${icon('cloud')}<span id="acct-status">${esc(syncText(acct))}</span></div>
        <div class="acct-actions">
          <button class="btn sm" type="button" id="s-syncnow">${icon('refresh')}${esc(t('acct.syncNow'))}</button>
          <button class="btn sm" type="button" id="s-delremote">${icon('trash')}${esc(t('acct.deleteRemote'))}</button>
        </div>
        <div class="acct-actions">
          <button class="btn sm" type="button" id="s-web">${icon('open')}${esc(t('acct.myAccount'))}</button>
          <span style="flex:1"></span>
          <button class="btn sm danger" type="button" id="s-logout">${icon('logout')}${esc(t('acct.logout'))}</button>
        </div>
      </div>
      <div class="note">${icon('shield')}<span>${esc(t('privacy.note'))}</span></div>
    </section>

    <section data-page="preview">
      <h1 class="page-title">${esc(t('set.tabPreview'))}</h1>
      <div class="section-title">${esc(t('pv.types'))}</div>
      <div class="set-hint">${esc(t('pv.typesHint'))}</div>
      <div class="types">${TYPES.map(([k, ic, ex]) => `
        <label class="type-card ${p.types && p.types[k] !== false ? 'on' : ''}"><input type="checkbox" data-type="${k}" ${p.types && p.types[k] !== false ? 'checked' : ''}>
          <span class="ti">${icon(ic)}</span><span><b>${esc(t('type.' + k))}</b><small>${esc(ex)}</small></span></label>`).join('')}
      </div>

      <div class="section-title">${esc(t('pv.view'))}</div>
      <div class="field"><label>${esc(t('pv.defaultZoom'))}</label>
        <div class="seg" id="s-zoom">
          <button type="button" data-v="fit">${icon('fit')}${esc(t('pv.zoomFit'))}</button>
          <button type="button" data-v="actual">${icon('actual')}${esc(t('pv.zoomActual'))}</button>
        </div><small class="hint">${esc(t('pv.defaultZoomHint'))}</small></div>
      <label class="check"><input type="checkbox" id="s-layers" ${p.psdLayers ? 'checked' : ''}>
        <span>${esc(t('pv.psdLayers'))}<small>${esc(t('pv.psdLayersHint'))}</small></span></label>
      <label class="check"><input type="checkbox" id="s-info" ${p.infoPanel ? 'checked' : ''}>
        <span>${esc(t('pv.infoPanel'))}<small>${esc(t('pv.infoPanelHint'))}</small></span></label>
      <label class="check"><input type="checkbox" id="s-wrap" ${p.textWrap ? 'checked' : ''}>
        <span>${esc(t('pv.textWrap'))}</span></label>
      <label class="check"><input type="checkbox" id="s-autoplay" ${p.mediaAutoplay ? 'checked' : ''}>
        <span>${esc(t('pv.autoplay'))}</span></label>

      <div class="section-title">${esc(t('pv.keys'))}</div>
      <div class="keys">
        <span><kbd>←</kbd><kbd>→</kbd></span><span>${esc(t('keys.prevNext'))}</span>
        <span><kbd>Esc</kbd><kbd>Space</kbd></span><span>${esc(t('keys.close'))}</span>
        <span><kbd>+</kbd><kbd>−</kbd> <kbd>Ctrl</kbd>+${icon('mouse')}</span><span>${esc(t('keys.zoom'))}</span>
        <span><kbd>0</kbd> <kbd>1</kbd></span><span>${esc(t('keys.fitActual'))}</span>
        <span><kbd>R</kbd></span><span>${esc(t('keys.rotate'))}</span>
        <span><kbd>PgUp</kbd><kbd>PgDn</kbd></span><span>${esc(t('keys.pages'))}</span>
        <span><kbd>I</kbd></span><span>${esc(t('keys.info'))}</span>
        <span><kbd>Enter</kbd></span><span>${esc(t('keys.openDefault'))}</span>
        <span><kbd>F</kbd> <kbd>F11</kbd></span><span>${esc(t('keys.fullscreen'))}</span>
      </div>
      <div class="note">${icon('shield')}<span>${esc(t('privacy.note'))}</span></div>
      <div><button class="btn" type="button" id="s-try">${icon('eye')}${esc(t('welcome.try'))}</button></div>
    </section>

    <section data-page="about">
      <div class="about-head">
        <img src="../../build/icon.png" alt="">
        <div><div class="about-name">Quick Preview</div>
          <div class="about-ver">${esc(t('about.version', { version: about.version || window.api.version }))}${about.portable ? ` · ${esc(t('about.portable'))}` : ''}</div></div>
      </div>
      <div class="set-hint">${esc(t('about.family'))}</div>
      <div class="acct-actions">
        <button class="btn sm" type="button" id="s-update">${icon('refresh')}${esc(t('about.checkUpdate'))}</button>
        <button class="btn sm" type="button" id="s-tool">${icon('globe')}${esc(t('about.toolPage'))}</button>
        <span class="about-update" id="s-update-result"></span>
      </div>
      <div class="section-title">${esc(t('about.licenses'))}</div>
      <div class="set-hint">${esc(t('about.licensesIntro'))}</div>
      <ul class="oss">${OSS.map(([n, l]) => `<li><span>${esc(n)}</span><span>${esc(l)}</span></li>`).join('')}</ul>
      <div class="acct-actions">
        <button class="btn sm" type="button" id="s-licenses">${icon('file')}${esc(t('about.chromium'))}</button>
        <span class="set-hint">Electron ${esc(about.electron || '')} · Chromium ${esc(about.chrome || '')}</span>
      </div>
    </section>`;

  bind();
  showTab(currentTab);
  refreshShellStatus();
}

function bind() {
  const q = (s) => $('#pages').querySelector(s);
  const tryBtn = () => window.api.pickAndPreview();
  if (q('#w-try')) q('#w-try').onclick = tryBtn;
  q('#s-try').onclick = tryBtn;

  // Genel
  q('#s-lang').onchange = (e) => save({ language: e.target.value }, { quiet: true }); // ana süreç pencereyi yeni dille yeniden yükler
  const paintTheme = () => q('#s-theme').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === (S.appTheme || 'system')));
  q('#s-theme').querySelectorAll('button').forEach((b) => (b.onclick = () => { S.appTheme = b.dataset.v; paintTheme(); save({ appTheme: b.dataset.v }); }));
  paintTheme();
  q('#s-login').onchange = (e) => save({ openAtLogin: e.target.checked });
  q('#s-tray').onchange = (e) => save({ showTray: e.target.checked });
  q('#s-shell').onchange = async (e) => { await save({ shellMenu: e.target.checked }); refreshShellStatus(); };
  q('#s-upd').onchange = (e) => save({ checkUpdates: e.target.checked });
  q('#s-quit').onclick = async () => {
    const ok = await confirmBox(t('set.quit'), esc(t('set.quitMsg')), { okText: t('set.quit') });
    if (ok) window.api.quit();
  };

  // Hesap
  q('#s-sync').onchange = async (e) => {
    const on = e.target.checked;
    const r = await window.api.setSyncEnabled(on);
    if (!r.ok) { e.target.checked = !on; toast(t('sync.error', { msg: r.code }), { type: 'err' }); }
  };
  q('#s-syncnow').onclick = () => window.api.syncNow();
  q('#s-delremote').onclick = async () => {
    const ok = await confirmBox(t('acct.deleteRemote'), esc(t('acct.deleteRemoteMsg')));
    if (!ok) return;
    const r = await window.api.deleteRemoteLibrary();
    if (r.ok) { q('#s-sync').checked = false; toast(t('acct.deleteRemoteDone'), { type: 'ok' }); }
    else toast(t('sync.error', { msg: r.code }), { type: 'err' });
  };
  q('#s-web').onclick = () => window.api.openWeb('account');
  q('#s-logout').onclick = async () => {
    const ok = await confirmBox(t('acct.logout'), esc(t('acct.logoutMsg')), { okText: t('acct.logout') });
    if (ok) window.api.logout();
  };

  // Önizleme
  q('.types').querySelectorAll('input[data-type]').forEach((cb) => (cb.onchange = () => {
    cb.closest('.type-card').classList.toggle('on', cb.checked);
    save({ preview: { types: { [cb.dataset.type]: cb.checked } } });
  }));
  const paintZoom = () => q('#s-zoom').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === ((S.preview || {}).defaultZoom || 'fit')));
  q('#s-zoom').querySelectorAll('button').forEach((b) => (b.onclick = () => { S.preview = { ...S.preview, defaultZoom: b.dataset.v }; paintZoom(); save({ preview: { defaultZoom: b.dataset.v } }); }));
  paintZoom();
  q('#s-layers').onchange = (e) => save({ preview: { psdLayers: e.target.checked } });
  q('#s-info').onchange = (e) => save({ preview: { infoPanel: e.target.checked } });
  q('#s-wrap').onchange = (e) => save({ preview: { textWrap: e.target.checked } });
  q('#s-autoplay').onchange = (e) => save({ preview: { mediaAutoplay: e.target.checked } });

  // Hakkında
  q('#s-update').onclick = async () => {
    const out = q('#s-update-result');
    out.className = 'about-update';
    out.textContent = t('about.checking');
    const r = await window.api.checkUpdate();
    if (!r.ok) { out.classList.add('err'); out.textContent = t('about.checkFailed', { msg: r.message || r.code }); return; }
    if (r.newer) { out.classList.add('new'); out.textContent = `${t('update.available', { version: r.latest })} — ${t('update.hint')}`; }
    else { out.classList.add('ok'); out.textContent = t('about.upToDate'); }
  };
  q('#s-tool').onclick = () => window.api.openWeb('tool');
  q('#s-licenses').onclick = () => window.api.openLicenses();
}

async function refreshShellStatus() {
  const box = $('#shell-status');
  if (!box) return;
  const st = await window.api.shellStatus();
  const label = box.querySelector('span:last-child');
  box.classList.remove('ok', 'off');
  if (!st.supported) { label.textContent = t('set.shellDev'); box.classList.add('off'); }
  else if (st.registered && st.pointsHere !== false) { label.textContent = t('set.shellOn', { verb: st.label }); box.classList.add('ok'); }
  else if (st.registered) { label.textContent = t('set.shellOther'); box.classList.add('off'); }
  else { label.textContent = t('set.shellOff'); box.classList.add('off'); }
  $('#shell-win11').classList.toggle('hidden', st.supported && !st.win11);
}

function showUpdate(info) {
  if (!info) return;
  const bar = $('#updateBar');
  bar.innerHTML = `${icon('bolt')}<span><b>${esc(t('update.available', { version: info.version }))}</b> — ${esc(t('update.hint'))}</span>
    <span class="spacer"></span><button class="btn sm" type="button">${icon('open')}${esc(t('update.open'))}</button>`;
  bar.querySelector('button').onclick = () => window.api.openWeb('account');
  bar.classList.remove('hidden');
}
window.api.onUpdateAvailable(showUpdate);

window.api.onSettingsChanged((s) => {
  const themeOnly = S.appTheme !== s.appTheme;
  S = s;
  if (!themeOnly) {
    // yalnız işaretleri güncelle (sayfayı yeniden çizmeden; odak ve kaydırma korunur)
    const q = (sel) => $('#pages').querySelector(sel);
    if (q('#s-tray')) q('#s-tray').checked = !!S.showTray;
    if (q('#s-shell')) q('#s-shell').checked = !!S.shellMenu;
  }
  const seg = $('#s-theme');
  if (seg) seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === (S.appTheme || 'system')));
});

(async () => {
  [S, acct, about] = await Promise.all([window.api.getSettings(), window.api.accountState(), window.api.about()]);
  render();
  showUpdate(about.update);
})();
