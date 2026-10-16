'use strict';

// Tür algılama: içerik imzası uzantıdan önce gelir; uzantısız ve yanlış uzantılı dosyalar da doğru türü bulur.
const test = require('node:test');
const assert = require('node:assert/strict');
const { detect, looksText, extOf } = require('../src/preview/detect');
const { makePng, makePdf, makeZip } = require('./helpers');

const kind = (name, head) => { const d = detect(name, head); return d.kind + (d.sub ? ':' + d.sub : ''); };

test('imzayla resimler: PNG, JPEG, GIF, WebP, BMP, ICO, TIFF, HEIC, AVIF', () => {
  assert.equal(kind('a.png', makePng()), 'image:png');
  assert.equal(kind('a.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46])), 'image:jpeg');
  assert.equal(kind('a.gif', Buffer.from('GIF89a\x01\x00\x01\x00', 'latin1')), 'image:gif');
  assert.equal(kind('a.webp', Buffer.from('RIFF\x10\x00\x00\x00WEBPVP8 ', 'latin1')), 'image:webp');
  assert.equal(kind('a.bmp', Buffer.concat([Buffer.from('BM'), Buffer.alloc(40)])), 'image:bmp');
  assert.equal(kind('favicon.ico', Buffer.from([0, 0, 1, 0, 2, 0, 16, 16])), 'image:ico');
  assert.equal(kind('scan.tif', Buffer.from([0x49, 0x49, 0x2a, 0, 8, 0, 0, 0])), 'image:tiff');
  assert.equal(kind('scan.tiff', Buffer.from([0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8])), 'image:tiff');
  assert.equal(kind('IMG_0001.HEIC', Buffer.from('\0\0\0\x18ftypheic\0\0\0\0mif1heic', 'latin1')), 'image:heic');
  assert.equal(kind('a.avif', Buffer.from('\0\0\0\x1cftypavif\0\0\0\0', 'latin1')), 'image:avif');
});

test('yanlış ya da hiç uzantı: içerik kazanır', () => {
  assert.equal(kind('aslinda-png.jpg', makePng()), 'image:png');
  assert.equal(kind('fatura', makePdf(1)), 'pdf:pdf');
  assert.equal(kind('tasarim.dat', Buffer.from('8BPS\0\x01\0\0\0\0\0\0', 'latin1')), 'psd:psd');
  assert.equal(kind('buyuk.psb', Buffer.from('8BPS\0\x02\0\0\0\0\0\0', 'latin1')), 'psd:psb');
});

test('ZIP tabanlılar: Office uzantıya göre, diğerleri arşiv', () => {
  const z = makeZip([{ name: 'a.txt', data: 'x' }]);
  assert.equal(kind('rapor.docx', z), 'office:docx');
  assert.equal(kind('tablo.XLSX', z), 'office:xlsx');
  assert.equal(kind('sunum.pptx', z), 'office:pptx');
  assert.equal(kind('yedek.zip', z), 'archive:zip');
  assert.equal(kind('kitap.epub', z), 'archive:zip');
  assert.equal(kind('uzantisiz', z), 'archive:zip');
});

test('video ve ses: kap imzası + uzantı', () => {
  const ftyp = (brand) => Buffer.from(`\0\0\0\x18ftyp${brand}\0\0\0\0isom`, 'latin1');
  assert.deepEqual(detect('film.mp4', ftyp('isom')), { kind: 'media', sub: 'mp4', media: 'video' });
  assert.deepEqual(detect('klip.mov', ftyp('qt  ')), { kind: 'media', sub: 'mov', media: 'video' });
  assert.deepEqual(detect('sarki.m4a', ftyp('M4A ')), { kind: 'media', sub: 'm4a', media: 'audio' });
  assert.equal(detect('ses.mp3', Buffer.from('ID3\x04\0\0\0\0\0\0', 'latin1')).media, 'audio');
  assert.equal(detect('ses.ogg', Buffer.from('OggS\0\x02', 'latin1')).media, 'audio');
  assert.equal(detect('video.ogv', Buffer.from('OggS\0\x02', 'latin1')).media, 'video');
  assert.equal(detect('a.webm', Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 1, 2])).media, 'video');
  assert.equal(detect('a.flac', Buffer.from('fLaC\0\0\0\x22', 'latin1')).media, 'audio');
  assert.equal(detect('a.wav', Buffer.from('RIFF\0\0\0\0WAVEfmt ', 'latin1')).media, 'audio');
});

test('metin, kod, Markdown ve SVG', () => {
  assert.deepEqual(detect('index.js', Buffer.from('const a = 1;\n')), { kind: 'text', sub: 'js', lang: 'javascript' });
  assert.deepEqual(detect('ayar.json', Buffer.from('{"a":1}')), { kind: 'text', sub: 'json', lang: 'json' });
  assert.deepEqual(detect('not.txt', Buffer.from('merhaba dünya')), { kind: 'text', sub: 'txt', lang: '' });
  assert.deepEqual(detect('Dockerfile', Buffer.from('FROM node:20\n')), { kind: 'text', sub: 'dockerfile', lang: 'dockerfile' });
  assert.deepEqual(detect('.gitignore', Buffer.from('node_modules/\n')), { kind: 'text', sub: '.gitignore', lang: 'bash' });
  assert.equal(detect('README.md', Buffer.from('# Başlık')).kind, 'markdown');
  assert.equal(detect('logo.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')).kind, 'svg');
  // Uzantısı olmayan ama içeriği SVG olan metin
  assert.equal(detect('logo', Buffer.from('<?xml version="1.0"?>\n<!-- çizim -->\n<svg viewBox="0 0 1 1"></svg>')).kind, 'svg');
  // Bilinmeyen uzantılı düz metin
  assert.deepEqual(detect('kayit.xyz', Buffer.from('satır 1\nsatır 2\n')), { kind: 'text', sub: 'xyz', lang: '' });
  // UTF-16 metin (NUL bayt içerir ama BOM'u var)
  assert.equal(detect('unicode.txt', Buffer.from([0xff, 0xfe, 0x41, 0, 0x42, 0])).kind, 'text');
});

test('tanınmayan ikili dosya: unknown', () => {
  assert.deepEqual(detect('veri.bin', Buffer.from([0, 1, 2, 3, 0, 0, 0xfe, 0x10])), { kind: 'unknown', sub: 'bin' });
  assert.deepEqual(detect('program.exe', Buffer.from('MZ\x90\0\x03\0\0\0', 'latin1')), { kind: 'unknown', sub: 'exe' });
  assert.equal(looksText(Buffer.from('abc\0def')), false);
  assert.equal(looksText(Buffer.alloc(0)), true);
  assert.equal(extOf('C:\\Klasör\\Rapor.Final.PDF'), 'pdf');
  assert.equal(extOf('.bashrc'), '');
});

test('boş dosya: uzantıdan', () => {
  assert.equal(detect('bos.txt', Buffer.alloc(0)).kind, 'text');
  assert.equal(detect('bos.png', Buffer.alloc(0)).kind, 'image');
});
