'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { STRINGS, LANGUAGES } = require('../src/i18n');
const { KINDS } = require('../src/preview/detect');

// Kodda kullanılan her anahtar sözlükte olmalı (dinamik anahtarlar dahil)
test('i18n: kullanılan anahtarlar sözlükte var', () => {
  const dir = path.join(__dirname, '..', 'src');
  const files = ['main.js', ...fs.readdirSync(path.join(dir, 'renderer')).filter((f) => f.endsWith('.js')).map((f) => 'renderer/' + f)];
  const used = new Set();
  for (const f of files) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const m of src.matchAll(/\bt\('([\w.-]+)'/g)) used.add(m[1]);
    for (const m of src.matchAll(/'(auth\.[\w]+)'/g)) used.add(m[1]);
  }
  // dinamik: tür adları (Ayarlar › Önizleme) ve önizleme alt başlığındaki tür etiketleri
  for (const k of KINDS) used.add('type.' + k);
  for (const k of ['image', 'psd', 'pdf', 'svg', 'markdown', 'archive', 'video', 'audio', 'code', 'plain', 'file', 'docx', 'xlsx', 'pptx']) used.add('kind.' + k);
  const missing = [...used].filter((k) => !k.endsWith('.') && !(k in STRINGS.en));
  assert.deepStrictEqual(missing, []);
});

// Mastertool standardı: 8 dil sabit sırayla, hepsinde aynı anahtarlar ve aynı yer tutucular
test('i18n: 8 dil, anahtar ve yer tutucu eşliği', () => {
  assert.deepStrictEqual(Object.keys(LANGUAGES), ['tr', 'en', 'fr', 'de', 'es', 'ar', 'zh', 'ru']);
  assert.strictEqual(LANGUAGES.ar.dir, 'rtl');
  const keys = Object.keys(STRINGS.en).sort();
  const ph = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join();
  for (const l of Object.keys(LANGUAGES)) {
    assert.deepStrictEqual(Object.keys(STRINGS[l]).sort(), keys, l);
    for (const k of keys) {
      assert.strictEqual(ph(STRINGS[l][k]), ph(STRINGS.en[k]), `${l} ${k}`);
      assert.ok(String(STRINGS[l][k]).trim(), `${l} ${k} boş`);
    }
  }
});

// Sağ tık etiketi kurulum betiğindekiyle aynı olmalı (kurulumda yazılan ile uygulamanın yazdığı tutarlı)
test('i18n: sağ tık etiketi installer.nsh ile aynı', () => {
  const nsh = fs.readFileSync(path.join(__dirname, '..', 'build', 'installer.nsh'), 'utf8');
  for (const l of ['tr', 'fr', 'de', 'es', 'ar', 'zh', 'ru']) assert.ok(nsh.includes(`"${STRINGS[l]['shell.verb']}"`), l);
  assert.ok(nsh.includes('StrCpy $R7 "Quick Preview"'));
  assert.strictEqual(STRINGS.en['shell.verb'], 'Quick Preview');
});
