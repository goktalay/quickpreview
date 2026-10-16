'use strict';

// Tek örnek iletimi (sağ tıktan gelen ikinci süreç → bekleyen örnek) ve Gezgin sağ tık kayıt yolları
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const EventEmitter = require('events');
const { parseArgs, setupSingleInstance, toLockData } = require('../src/instance');
const shell = require('../src/shellmenu');

const EXE = 'C:\\Program Files\\Mastertool\\Quick Preview\\Quick Preview.exe';

test('argümanlar: --preview, "Birlikte aç" yolu, --hidden, --settings, Chromium anahtarları atlanır', () => {
  assert.deepEqual(parseArgs([EXE, '--preview', 'C:\\Belgeler\\Şirket Raporu.pdf']), { preview: 'C:\\Belgeler\\Şirket Raporu.pdf', hidden: false, settings: false });
  assert.deepEqual(parseArgs([EXE, '--preview=D:\\a.psd']).preview, 'D:\\a.psd');
  assert.deepEqual(parseArgs([EXE, '--allow-file-access-from-files', 'D:\\foto.jpg']).preview, 'D:\\foto.jpg');
  assert.deepEqual(parseArgs([EXE, '--hidden']), { preview: null, hidden: true, settings: false });
  assert.deepEqual(parseArgs([EXE, '--settings']), { preview: null, hidden: false, settings: true });
  assert.deepEqual(parseArgs([EXE]), { preview: null, hidden: false, settings: false });
  // geliştirme: electron . --preview x
  assert.equal(parseArgs(['electron', '.', '--preview', '/tmp/x.png']).preview, '/tmp/x.png');
  // tırnaklı ve göreli yol
  assert.equal(parseArgs([EXE, '"/tmp/a b.txt"']).preview, '/tmp/a b.txt');
  assert.equal(parseArgs([EXE, 'not.txt'], { cwd: '/home/u' }).preview, path.resolve('/home/u', 'not.txt'));
});

// Electron app taklidi: kilit bir kez alınır, ikinci örnek veriyi "second-instance" ile iletir
function fakeAppPair() {
  let holder = null;
  const make = () => {
    const app = new EventEmitter();
    app.requestSingleInstanceLock = (data) => {
      if (!holder) { holder = app; return true; }
      // ikinci örnek: kilidi tutan örneğe argv, cwd ve kilit verisi iletilir (Electron davranışı)
      setImmediate(() => holder.emit('second-instance', {}, app.argv, app.cwd, data));
      return false;
    };
    return app;
  };
  return make;
}

test('tek örnek: ikinci süreç sağ tık isteğini bekleyen örneğe iletir ve kapanmalıdır', async () => {
  const make = fakeAppPair();
  const got = [];
  const first = make();
  const r1 = setupSingleInstance(first, { argv: [EXE, '--hidden'], cwd: 'C:\\', onRequest: (req, o) => got.push([req, o]) });
  assert.equal(r1.primary, true);
  assert.deepEqual(r1.request, { preview: null, hidden: true, settings: false });

  const second = make();
  second.argv = [EXE, '--preview', 'C:\\Resimler\\tatil.heic'];
  second.cwd = 'C:\\Windows\\System32';
  const r2 = setupSingleInstance(second, { argv: second.argv, cwd: second.cwd, onRequest: () => assert.fail('ikinci örnek işlememeli') });
  assert.equal(r2.primary, false);
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(got, [[{ preview: 'C:\\Resimler\\tatil.heic', hidden: false, settings: false }, { first: false }]]);
});

test('tek örnek: kilit verisi yoksa (eski sürüm) ikinci örneğin argv\'si çözülür; Chromium anahtarları karışsa da', async () => {
  const first = new EventEmitter();
  first.requestSingleInstanceLock = () => true;
  const got = [];
  setupSingleInstance(first, { argv: [EXE], onRequest: (req) => got.push(req) });
  first.emit('second-instance', {}, [EXE, '--original-process-start-time=1', '--preview', 'C:\\x.md'], 'C:\\', undefined);
  first.emit('second-instance', {}, [EXE], 'C:\\', { qp: 1, preview: null, hidden: false, settings: true });
  assert.deepEqual(got, [{ preview: 'C:\\x.md', hidden: false, settings: false }, { preview: null, hidden: false, settings: true }]);
  assert.deepEqual(toLockData({ preview: 'a', hidden: true }), { qp: 1, preview: 'a', hidden: true, settings: false });
});

test('sağ tık: kayıt yolu, MUIVerb, simge ve komut satırı (yalnız dosyalar: *\\shell)', () => {
  assert.equal(shell.KEY, 'HKCU\\Software\\Classes\\*\\shell\\MastertoolQuickPreview');
  assert.equal(shell.COMMAND_KEY, 'HKCU\\Software\\Classes\\*\\shell\\MastertoolQuickPreview\\command');
  assert.ok(!/Directory|Folder/i.test(shell.KEY), 'klasörlere kayıt yapılmaz');
  const args = shell.registerArgs(EXE, 'Hızlı Önizleme');
  assert.deepEqual(args, [
    ['add', shell.KEY, '/v', 'MUIVerb', '/t', 'REG_SZ', '/d', 'Hızlı Önizleme', '/f'],
    ['add', shell.KEY, '/v', 'Icon', '/t', 'REG_SZ', '/d', `"${EXE}",0`, '/f'],
    ['add', shell.COMMAND_KEY, '/ve', '/t', 'REG_SZ', '/d', `"${EXE}" --preview "%1"`, '/f'],
  ]);
  assert.deepEqual(shell.unregisterArgs(), [['delete', shell.KEY, '/f']]);
  // Komut satırı instance.parseArgs ile aynı sözleşmede (Gezgin %1'i tam yolla değiştirir)
  const cmd = shell.commandLine(EXE).replace('%1', 'C:\\a b\\c.pdf');
  const argv = cmd.match(/"[^"]*"|\S+/g).map((x) => x.replace(/^"|"$/g, ''));
  assert.equal(parseArgs(argv).preview, 'C:\\a b\\c.pdf');
});

test('sağ tık: reg query çıktısı (İngilizce ve Türkçe Windows)', () => {
  const en = `\r\nHKEY_CURRENT_USER\\Software\\Classes\\*\\shell\\MastertoolQuickPreview\\command\r\n    (Default)    REG_SZ    "${EXE}" --preview "%1"\r\n\r\n`;
  const tr = `\r\nHKEY_CURRENT_USER\\...\\command\r\n    (Varsayılan)    REG_SZ    "${EXE}" --preview "%1"\r\n`;
  assert.equal(shell.parseRegValue(en, ''), `"${EXE}" --preview "%1"`);
  assert.equal(shell.parseRegValue(tr, ''), `"${EXE}" --preview "%1"`);
  assert.equal(shell.parseRegValue('    MUIVerb    REG_SZ    Quick Preview\r\n', 'MUIVerb'), 'Quick Preview');
  assert.equal(shell.parseRegValue('', ''), null);
  assert.deepEqual(shell.evaluate({ command: `"${EXE.toUpperCase()}" --preview "%1"` }, EXE), { registered: true, pointsHere: true });
  assert.deepEqual(shell.evaluate({ command: '"D:\\Portable\\Quick-Preview.exe" --preview "%1"' }, EXE), { registered: true, pointsHere: false });
  // ASCII olmayan yol: reg.exe çıktısı güvenilmez, "emin değil" → yeniden yazılır
  assert.equal(shell.evaluate({ command: '"C:\\Users\\G?khan\\QP.exe" --preview "%1"' }, 'C:\\Users\\Gökhan\\QP.exe').pointsHere, false);
});

// reg.exe taklidi: kayıt defteri bellek içinde
function fakeReg() {
  const db = new Map();
  const calls = [];
  const run = async (args) => {
    calls.push(args);
    const [op, key] = args;
    if (op === 'add') {
      const name = args.includes('/ve') ? '' : args[args.indexOf('/v') + 1];
      const val = args[args.indexOf('/d') + 1];
      db.set(`${key}|${name}`, val);
      return { ok: true, stdout: '' };
    }
    if (op === 'delete') {
      let any = false;
      for (const k of [...db.keys()]) if (k.startsWith(key)) { db.delete(k); any = true; }
      return { ok: any, stdout: '' };
    }
    if (op === 'query') {
      const name = args.includes('/ve') ? '' : args[args.indexOf('/v') + 1];
      const v = db.get(`${key}|${name}`);
      if (v === undefined) return { ok: false, stdout: '' };
      return { ok: true, stdout: `\r\n${key}\r\n    ${name || '(Default)'}    REG_SZ    ${v}\r\n` };
    }
    return { ok: false };
  };
  return { db, calls, run };
}

test('sağ tık: ensure() — açıkken yazar, aynıysa dokunmaz, dil değişince yeniden yazar, kapalıyken siler', async () => {
  const reg = fakeReg();
  const m = shell.createShellMenu({ exe: EXE, run: reg.run, platform: 'win32' });
  let r = await m.ensure(true, 'Hızlı Önizleme', null);
  assert.equal(r.ok, true);
  assert.deepEqual(r.last, { exe: EXE, label: 'Hızlı Önizleme' });
  assert.equal(reg.db.get(`${shell.KEY}|MUIVerb`), 'Hızlı Önizleme');
  assert.equal(reg.db.get(`${shell.COMMAND_KEY}|`), `"${EXE}" --preview "%1"`);

  const n = reg.calls.length;
  r = await m.ensure(true, 'Hızlı Önizleme', r.last);
  assert.equal(r.unchanged, true);
  assert.equal(reg.calls.filter((c) => c[0] === 'add').length, reg.calls.slice(0, n).filter((c) => c[0] === 'add').length, 'yeniden yazılmamalı');

  r = await m.ensure(true, 'Quick Preview', r.last); // dil İngilizceye döndü
  assert.equal(reg.db.get(`${shell.KEY}|MUIVerb`), 'Quick Preview');

  // başka bir kopya (taşınabilir) kaydı ele geçirdiyse bu kopya yeniden yazar
  reg.db.set(`${shell.COMMAND_KEY}|`, '"D:\\Portable\\QP.exe" --preview "%1"');
  r = await m.ensure(true, 'Quick Preview', r.last);
  assert.equal(reg.db.get(`${shell.COMMAND_KEY}|`), `"${EXE}" --preview "%1"`);

  r = await m.ensure(false, 'Quick Preview', r.last);
  assert.equal(r.last, null);
  assert.equal(reg.db.size, 0);
  assert.equal((await m.status()).registered, false);

  // kapalıyken başka kopyanın kaydına dokunulmaz
  reg.db.set(`${shell.COMMAND_KEY}|`, '"D:\\Portable\\QP.exe" --preview "%1"');
  await m.ensure(false, 'Quick Preview', null);
  assert.equal(reg.db.size, 1);
});

test('sağ tık: Windows dışında / geliştirmede hiçbir şey yazılmaz; Windows 11 algılama; yeni menü yeri', async () => {
  const reg = fakeReg();
  const m = shell.createShellMenu({ exe: '/usr/bin/electron', run: reg.run, platform: 'linux' });
  assert.equal((await m.ensure(true, 'x')).ok, false);
  assert.equal(reg.calls.length, 0);
  assert.equal(shell.MODERN_MENU.available, false);
  assert.equal(shell.MODERN_MENU.reason, 'needs_signed_msix');
  const saved = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: 'win32' });
  try {
    assert.equal(shell.isWindows11('10.0.22631'), true);
    assert.equal(shell.isWindows11('10.0.19045'), false);
  } finally {
    Object.defineProperty(process, 'platform', saved);
  }
});
