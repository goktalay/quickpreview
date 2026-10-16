'use strict';

// ZIP okuyucu (arşiv içeriği) ve Office önizlemesi (docx / xlsx / pptx)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const zip = require('../src/preview/zip');
const office = require('../src/preview/office');
const { makeZip, makeDocx, makeXlsx, makePptx, tmpDir } = require('./helpers');

test('zip: girdiler, boyutlar, tarih, UTF-8 adlar ve klasörler', () => {
  const big = Buffer.alloc(100000, 'a');
  const buf = makeZip([
    { name: 'Belgeler/', data: '', method: 0 },
    { name: 'Belgeler/Şirket Raporu.txt', data: big },
    { name: 'resim.png', data: Buffer.from([1, 2, 3]), method: 0 },
    { name: 'gizli.txt', data: 'x', encrypted: true, method: 0 },
  ], { comment: 'yedek' });
  const dir = tmpDir('qp-zip-');
  const file = path.join(dir, 'arsiv.zip');
  fs.writeFileSync(file, buf);
  for (const src of [buf, file]) {
    const list = zip.listEntries(src);
    assert.equal(list.count, 4);
    assert.equal(list.comment, 'yedek');
    const names = list.entries.map((e) => e.name);
    assert.deepEqual(names, ['Belgeler/', 'Belgeler/Şirket Raporu.txt', 'resim.png', 'gizli.txt']);
    const rep = list.entries[1];
    assert.equal(rep.size, 100000);
    assert.ok(rep.csize < 1000, 'deflate sıkıştırmış olmalı');
    assert.equal(new Date(rep.mtime).getFullYear(), 2026);
    assert.equal(list.entries[0].dir, true);
    assert.equal(list.entries[3].encrypted, true);
    assert.deepEqual(zip.readEntry(src, rep), big);
    assert.deepEqual(zip.readEntry(src, list.entries[2]), Buffer.from([1, 2, 3]));
    assert.throws(() => zip.readEntry(src, list.entries[3]), { code: 'zip_encrypted' });
    const s = zip.summarize(list);
    assert.deepEqual([s.files, s.dirs, s.size, s.encrypted], [3, 1, 100004, true]);
  }
});

test('zip: UTF-8 bayrağı olmayan eski (CP437) adlar ve bayraksız UTF-8', () => {
  const cp437 = Buffer.from([0x80, 0x61, 0x2e, 0x74, 0x78, 0x74]); // "Ça.txt" (CP437)
  const buf = makeZip([
    { nameBytes: cp437, data: 'x', method: 0, utf8Flag: false },
    { nameBytes: Buffer.from('Ğüzel.txt', 'utf8'), data: 'y', method: 0, utf8Flag: false },
  ]);
  assert.deepEqual(zip.listEntries(buf).entries.map((e) => e.name), ['Ça.txt', 'Ğüzel.txt']);
});

test('zip: bozuk dosya anlaşılır hata verir; büyük girdi sınırı', () => {
  assert.throws(() => zip.listEntries(Buffer.from('PK\x03\x04 bozuk')), { code: 'zip_invalid' });
  const buf = makeZip([{ name: 'a.bin', data: Buffer.alloc(5000) }]);
  const e = zip.listEntries(buf).entries[0];
  assert.throws(() => zip.readEntry(buf, e, { maxBytes: 100 }), { code: 'zip_too_large' });
});

test('docx: başlık, alt başlık, liste, tablo, belge özellikleri; kaçış karakterleri çözülür', () => {
  const r = office.readOffice(makeDocx({ paragraphs: ['', '', 'Son paragraf'] }), 'docx');
  assert.equal(r.type, 'docx');
  assert.equal(r.props.title, 'Teklif');
  assert.equal(r.props.author, 'Örnek Yazar');
  const types = r.blocks.map((b) => b.type);
  assert.deepEqual(types.slice(0, 4), ['title', 'h1', 'p', 'li']);
  assert.equal(r.blocks[2].text, 'Bu belge örnek\tmetindir & <güvenlidir>.');
  const tbl = r.blocks.find((b) => b.type === 'table');
  assert.deepEqual(tbl.rows, [['Ürün', 'Adet'], ['Kalem', '12']]);
  // art arda boş paragraflar teke iner
  const empties = r.blocks.filter((b) => b.type === 'p' && !b.text.trim()).length;
  assert.equal(empties, 1);
});

test('xlsx: sayfalar, paylaşılan/satır içi metinler, sayılar, tarih biçimi, boş satırlar', () => {
  const r = office.readOffice(makeXlsx(), 'xlsx');
  assert.equal(r.sheetCount, 2);
  const s = r.sheets[0];
  assert.equal(s.name, 'Satışlar');
  assert.deepEqual(s.cols, ['A', 'B', 'C', 'D']);
  assert.deepEqual(s.rows[0], ['Ürün', 'Tutar', 'Tarih', '']);
  assert.deepEqual(s.rows[1], ['Kalem', '1250.5', office.excelDate(46311), '']);
  assert.match(s.rows[1][2], /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(s.rows[2], ['', '', '', '']);
  assert.deepEqual(s.rows[3], ['', '', '', 'TRUE']);
  assert.equal(r.sheets[1].rows.length, 0);
  assert.deepEqual(office.cellRef('AB12'), [11, 27]);
  assert.equal(office.colName(27), 'AB');
  assert.equal(office.excelDate(45658), '2025-01-01');
});

test('pptx: slayt sırası sunumdaki gibi, başlık, girinti düzeyi, konuşmacı notu', () => {
  const r = office.readOffice(makePptx(), 'pptx');
  assert.equal(r.slideCount, 2);
  assert.equal(r.slides[0].title, 'Yıllık Plan');
  assert.deepEqual(r.slides[0].items, [{ text: 'Hedefler', level: 0 }, { text: 'Büyüme %20', level: 1 }]);
  assert.equal(r.slides[0].notes, 'Konuşmacı notu');
  assert.equal(r.slides[1].title, 'Sonuç');
});

test('xml ayrıştırıcı: varlıklar, CDATA, öz kapanan etiketler', () => {
  const root = office.parseXml('<a x="1 &amp; 2"><b/><![CDATA[<ham>]]>&#x130;stanbul &#304;</a>');
  const a = root.children[0];
  assert.equal(a.attrs.x, '1 & 2');
  assert.equal(office.textOf(a), '<ham>İstanbul İ');
});

test('office: gerekli parça yoksa office_invalid', () => {
  const z = makeZip([{ name: 'baska.xml', data: '<x/>' }]);
  assert.throws(() => office.readOffice(z, 'docx'), { code: 'office_invalid' });
  assert.throws(() => office.readOffice(z, 'xlsx'), { code: 'office_invalid' });
  assert.throws(() => office.readOffice(z, 'pptx'), { code: 'office_invalid' });
});
