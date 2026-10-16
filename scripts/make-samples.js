// Ekran görüntüleri ve elle deneme için örnek dosyalar üretir (gerçek kişisel veri yok; hepsi kodla çizilir).
// Kullanım: node scripts/make-samples.js [klasör] [tr|en]   (varsayılan: samples/tr)
// Resim ve PSD sharp + ag-psd ile, PDF ve WebM video Chromium ile (Playwright), Office/ZIP test yardımcılarıyla üretilir.
'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { writePsdBuffer } = require('ag-psd');
const { makeZip } = require('../test/helpers');

const ROOT = path.join(__dirname, '..');

const T = {
  tr: {
    photo: 'Kapadokya gün doğumu.jpg', psd: 'Afiş tasarımı.psd', pdf: 'Proje teklifi.pdf', code: 'siparis-servisi.js', md: 'BENİOKU.md',
    xlsx: 'Satış özeti 2026.xlsx', docx: 'Toplantı notları.docx', pptx: 'Çeyrek sunumu.pptx', zip: 'web-sitesi-yedek.zip', wav: 'Bildirim sesi.wav',
    video: 'Tanıtım klibi.webm', svg: 'logo.svg', other: ['Fatura-0142.pdf', 'ekran-goruntusu.png', 'kurulum-notlari.txt'],
    layers: { bg: 'Arka plan', sun: 'Güneş', mountains: 'Dağlar', far: 'Uzak tepeler', near: 'Yakın tepeler', title: 'Başlık', sub: 'Alt yazı', guide: 'Kılavuz (gizli)' },
    title: 'YAZ FESTİVALİ', subtitle: '12–14 Temmuz · Göreme',
  },
  en: {
    photo: 'Cappadocia sunrise.jpg', psd: 'Poster design.psd', pdf: 'Project proposal.pdf', code: 'order-service.js', md: 'README.md',
    xlsx: 'Sales summary 2026.xlsx', docx: 'Meeting notes.docx', pptx: 'Quarterly review.pptx', zip: 'website-backup.zip', wav: 'Notification sound.wav',
    video: 'Promo clip.webm', svg: 'logo.svg', other: ['Invoice-0142.pdf', 'screenshot.png', 'setup-notes.txt'],
    layers: { bg: 'Background', sun: 'Sun', mountains: 'Mountains', far: 'Far hills', near: 'Near hills', title: 'Title', sub: 'Subtitle', guide: 'Guide (hidden)' },
    title: 'SUMMER FESTIVAL', subtitle: 'July 12–14 · Göreme',
  },
};

// Manzara (gün doğumu, balonlar, peribacaları) — SVG olarak çizilir
function landscapeSvg(w, h, { balloons = true } = {}) {
  const hills = (y, amp, color, seed) => {
    let d = `M0 ${h} L0 ${y}`;
    for (let x = 0; x <= w; x += w / 24) d += ` L${x.toFixed(0)} ${(y - Math.abs(Math.sin(x / (w / (6 + seed)) + seed)) * amp - Math.sin(x / 97 + seed) * amp * 0.15).toFixed(0)}`;
    return `<path d="${d} L${w} ${h} Z" fill="${color}"/>`;
  };
  const chimney = (x, base, hgt, wdt, c) => `<path d="M${x - wdt} ${base} Q${x - wdt * 0.6} ${base - hgt * 0.7} ${x - wdt * 0.35} ${base - hgt} L${x + wdt * 0.35} ${base - hgt} Q${x + wdt * 0.6} ${base - hgt * 0.7} ${x + wdt} ${base} Z" fill="${c}"/><ellipse cx="${x}" cy="${base - hgt}" rx="${wdt * 0.55}" ry="${wdt * 0.32}" fill="${c}" opacity=".95"/>`;
  const balloon = (x, y, r, c1, c2) => `<g transform="translate(${x} ${y})"><path d="M0 ${-r} C${r * 1.1} ${-r} ${r * 1.1} ${r * 0.5} 0 ${r * 1.15} C${-r * 1.1} ${r * 0.5} ${-r * 1.1} ${-r} 0 ${-r} Z" fill="${c1}"/>
    <path d="M0 ${-r} C${r * 0.4} ${-r} ${r * 0.4} ${r * 0.5} 0 ${r * 1.15} C${-r * 0.4} ${r * 0.5} ${-r * 0.4} ${-r} 0 ${-r} Z" fill="${c2}"/><rect x="${-r * 0.18}" y="${r * 1.3}" width="${r * 0.36}" height="${r * 0.28}" rx="2" fill="#5b3a1e"/></g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1e1b4b"/><stop offset=".35" stop-color="#7c3aed"/><stop offset=".62" stop-color="#f472b6"/><stop offset=".8" stop-color="#fb923c"/><stop offset="1" stop-color="#fde68a"/></linearGradient>
      <radialGradient id="sun" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fffbeb"/><stop offset=".45" stop-color="#fde68a"/><stop offset="1" stop-color="#fb923c" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#sky)"/>
    <circle cx="${w * 0.62}" cy="${h * 0.66}" r="${h * 0.22}" fill="url(#sun)"/>
    ${hills(h * 0.7, h * 0.08, '#9a3412', 1.3)}
    ${hills(h * 0.78, h * 0.07, '#7c2d12', 2.1)}
    ${[0.12, 0.2, 0.31, 0.45, 0.72, 0.84, 0.93].map((p, i) => chimney(w * p, h * 0.92, h * (0.16 + (i % 3) * 0.05), w * 0.022, i % 2 ? '#c2410c' : '#b45309')).join('')}
    ${hills(h * 0.9, h * 0.04, '#431407', 3.7)}
    ${balloons ? [balloon(w * 0.22, h * 0.28, h * 0.05, '#ef4444', '#facc15'), balloon(w * 0.38, h * 0.18, h * 0.035, '#22d3ee', '#6366f1'), balloon(w * 0.78, h * 0.3, h * 0.045, '#f97316', '#fde047'),
      balloon(w * 0.88, h * 0.14, h * 0.025, '#a855f7', '#f472b6'), balloon(w * 0.55, h * 0.36, h * 0.03, '#10b981', '#fef3c7')].join('') : ''}
  </svg>`;
}

const raw = async (svg, w, h) => {
  const { data } = await sharp(Buffer.from(svg)).resize(w, h).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: w, height: h, data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength) };
};
const layerSvg = (w, h, inner) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${inner}</svg>`;

async function makePsd(L, file) {
  const W = 1200;
  const H = 1600;
  const bg = await raw(layerSvg(W, H, `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#312e81"/><stop offset=".55" stop-color="#db2777"/><stop offset="1" stop-color="#f59e0b"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#g)"/>`), W, H);
  const sun = await raw(layerSvg(600, 600, `<defs><radialGradient id="s"><stop offset="0" stop-color="#fffbeb"/><stop offset=".5" stop-color="#fde68a"/><stop offset="1" stop-color="#fb923c" stop-opacity="0"/></radialGradient></defs><circle cx="300" cy="300" r="300" fill="url(#s)"/>`), 600, 600);
  const hill = async (y, color, amp, seed) => {
    let d = `M0 ${H - y + 200}`;
    for (let x = 0; x <= W; x += 50) d += ` L${x} ${(220 - Math.abs(Math.sin(x / 160 + seed)) * amp).toFixed(0)}`;
    return raw(layerSvg(W, 600, `<path d="${d} L${W} 600 L0 600 Z" fill="${color}"/>`), W, 600);
  };
  const far = await hill(600, '#9d174d', 140, 0.7);
  const near = await hill(450, '#4c0519', 110, 2.2);
  const txt = (s, size, weight, color) => raw(layerSvg(W, size * 1.6, `<text x="${W / 2}" y="${size * 1.15}" text-anchor="middle" font-family="DejaVu Sans, Arial" font-size="${size}" font-weight="${weight}" fill="${color}" letter-spacing="4">${s}</text>`), W, Math.round(size * 1.6));
  const title = await txt(L.title, Math.min(120, Math.floor(1060 / (L.title.length * 0.74))), 800, '#ffffff'); // başlık genişliğe sığsın
  const sub = await txt(L.subtitle, 54, 500, '#fde68a');
  const guide = await raw(layerSvg(W, H, `<path d="M${W / 2} 0V${H}M0 ${H / 3}H${W}M0 ${(H * 2) / 3}H${W}" stroke="#22d3ee" stroke-width="3" stroke-dasharray="12 10"/>`), W, H);

  const children = [
    { name: L.layers.bg, left: 0, top: 0, imageData: bg },
    { name: L.layers.sun, left: 300, top: 620, opacity: 0.92, imageData: sun },
    { name: L.layers.mountains, opened: true, children: [
      { name: L.layers.far, left: 0, top: 1000, imageData: far },
      { name: L.layers.near, left: 0, top: 1100, imageData: near, opacity: 0.95 },
    ] },
    { name: L.layers.title, left: 0, top: 180, imageData: title, text: { text: L.title } },
    { name: L.layers.sub, left: 0, top: 380, imageData: sub, text: { text: L.subtitle } },
    { name: L.layers.guide, hidden: true, left: 0, top: 0, imageData: guide },
  ];
  // Birleşik görüntü: katmanları sharp ile üst üste koy (Photoshop'un "uyumluluk" görüntüsü)
  const comp = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([bg, sun, far, near, title, sub].map((img, i) => ({
      input: Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength), raw: { width: img.width, height: img.height, channels: 4 },
      left: [0, 300, 0, 0, 0, 0][i], top: [0, 620, 1000, 1100, 180, 380][i],
    }))).raw().toBuffer();
  const psd = { width: W, height: H, imageData: { width: W, height: H, data: new Uint8ClampedArray(comp.buffer, comp.byteOffset, comp.byteLength) }, children };
  let buf;
  try { buf = writePsdBuffer(psd, { invalidateTextLayers: false }); } catch {
    for (const c of children) delete c.text; // metin katmanı yazılamazsa düz katman
    buf = writePsdBuffer(psd, {});
  }
  fs.writeFileSync(file, Buffer.from(buf));
}

function codeSample(lang) {
  const tr = lang === 'tr';
  return `'use strict';

// ${tr ? 'Sipariş servisi: stok kontrolü, fiyat hesabı ve bildirim' : 'Order service: stock check, pricing and notification'}
const { EventEmitter } = require('events');

const VAT = 0.20;
const SHIPPING_FREE_LIMIT = 1500;

class OrderService extends EventEmitter {
  constructor({ stock, notifier, clock = Date.now }) {
    super();
    this.stock = stock;
    this.notifier = notifier;
    this.clock = clock;
  }

  /** ${tr ? 'Sepetteki ürünler için toplam tutarı hesaplar' : 'Calculates the total for the items in the cart'} */
  total(items) {
    const subtotal = items.reduce((sum, it) => sum + it.price * it.qty, 0);
    const shipping = subtotal >= SHIPPING_FREE_LIMIT ? 0 : 49.9;
    return Math.round((subtotal * (1 + VAT) + shipping) * 100) / 100;
  }

  async place(order) {
    for (const it of order.items) {
      const left = await this.stock.available(it.sku);
      if (left < it.qty) {
        throw Object.assign(new Error(\`${tr ? 'Yetersiz stok' : 'Insufficient stock'}: \${it.sku}\`), { code: 'out_of_stock', sku: it.sku });
      }
    }
    const placed = { ...order, total: this.total(order.items), placedAt: this.clock(), status: 'confirmed' };
    await Promise.all(order.items.map((it) => this.stock.reserve(it.sku, it.qty)));
    this.emit('placed', placed);
    await this.notifier.send(order.customer, /* template */ 'order-confirmed', { id: placed.id, total: placed.total });
    return placed;
  }
}

module.exports = { OrderService, VAT };
`;
}

function markdownSample(lang) {
  if (lang === 'tr') {
    return `# Sipariş Servisi

Küçük bir **sipariş işleme** modülü: stok kontrolü, KDV dahil fiyat ve müşteri bildirimi.

## Kurulum

\`\`\`bash
npm install
npm test
\`\`\`

## Kullanım

\`\`\`js
const { OrderService } = require('./siparis-servisi');
const svc = new OrderService({ stock, notifier });
const sonuc = await svc.place({ id: 'S-1042', items: [{ sku: 'KLM-01', price: 120, qty: 3 }] });
\`\`\`

## Fiyatlandırma

| Kural | Değer |
| --- | --- |
| KDV | %20 |
| Ücretsiz kargo sınırı | 1.500 ₺ |
| Kargo ücreti | 49,90 ₺ |

> Not: Tutarlar kuruş hassasiyetinde yuvarlanır.

### Yapılacaklar

- [x] Stok rezervasyonu
- [x] E-posta bildirimi
- [ ] Kısmi iade

Ayrıntılar için [proje sayfası](https://example.com/siparis).
`;
  }
  return `# Order Service

A small **order processing** module: stock check, VAT-inclusive pricing and customer notification.

## Setup

\`\`\`bash
npm install
npm test
\`\`\`

## Usage

\`\`\`js
const { OrderService } = require('./order-service');
const svc = new OrderService({ stock, notifier });
const result = await svc.place({ id: 'S-1042', items: [{ sku: 'PEN-01', price: 120, qty: 3 }] });
\`\`\`

## Pricing

| Rule | Value |
| --- | --- |
| VAT | 20% |
| Free shipping limit | 1,500 |
| Shipping fee | 49.90 |

> Note: amounts are rounded to the cent.

### To do

- [x] Stock reservation
- [x] Email notification
- [ ] Partial refunds

See the [project page](https://example.com/orders) for details.
`;
}

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function xlsxSample(lang) {
  const tr = lang === 'tr';
  const head = tr ? ['Bölge', 'Ürün grubu', 'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Toplam', 'Hedef', 'Durum']
    : ['Region', 'Product group', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Total', 'Target', 'Status'];
  const regions = tr ? ['Marmara', 'Ege', 'İç Anadolu', 'Akdeniz', 'Karadeniz', 'Doğu Anadolu', 'Güneydoğu'] : ['North', 'West', 'Central', 'South', 'Coast', 'East', 'Southeast'];
  const groups = tr ? ['Kırtasiye', 'Elektronik', 'Mobilya'] : ['Stationery', 'Electronics', 'Furniture'];
  const strings = [...head, ...regions, ...groups, tr ? 'Hedefte' : 'On target', tr ? 'Geride' : 'Behind'];
  const si = (s) => strings.indexOf(s);
  const col = (i) => String.fromCharCode(65 + i);
  let rows = `<row r="1">${head.map((hh, i) => `<c r="${col(i)}1" t="s"><v>${si(hh)}</v></c>`).join('')}</row>`;
  let r = 2;
  let seed = 7;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  for (const reg of regions) {
    for (const g of groups) {
      const vals = Array.from({ length: 6 }, () => Math.round(18000 + rnd() * 52000));
      const total = vals.reduce((a, b) => a + b, 0);
      const target = Math.round(total * (0.85 + rnd() * 0.3) / 1000) * 1000;
      rows += `<row r="${r}"><c r="A${r}" t="s"><v>${si(reg)}</v></c><c r="B${r}" t="s"><v>${si(g)}</v></c>${vals.map((v, i) => `<c r="${col(i + 2)}${r}"><v>${v}</v></c>`).join('')}`
        + `<c r="I${r}"><v>${total}</v></c><c r="J${r}"><v>${target}</v></c><c r="K${r}" t="s"><v>${si(total >= target ? strings[strings.length - 2] : strings[strings.length - 1])}</v></c></row>`;
      r++;
    }
  }
  return makeZip([
    { name: '[Content_Types].xml', data: `${XML}<Types/>` },
    { name: 'xl/workbook.xml', data: `${XML}<workbook xmlns:r="r"><sheets><sheet name="${tr ? 'Bölgeler' : 'Regions'}" sheetId="1" r:id="rId1"/><sheet name="${tr ? 'Özet' : 'Summary'}" sheetId="2" r:id="rId2"/><sheet name="${tr ? 'Notlar' : 'Notes'}" sheetId="3" r:id="rId3"/></sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: `${XML}<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Target="worksheets/sheet3.xml"/></Relationships>` },
    { name: 'xl/sharedStrings.xml', data: `${XML}<sst>${strings.map((s) => `<si><t>${esc(s)}</t></si>`).join('')}</sst>` },
    { name: 'xl/worksheets/sheet1.xml', data: `${XML}<worksheet><sheetData>${rows}</sheetData></worksheet>` },
    { name: 'xl/worksheets/sheet2.xml', data: `${XML}<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>${tr ? 'Toplam satış' : 'Total sales'}</t></is></c><c r="B1"><v>5841200</v></c></row></sheetData></worksheet>` },
    { name: 'xl/worksheets/sheet3.xml', data: `${XML}<worksheet><sheetData/></worksheet>` },
    { name: 'docProps/core.xml', data: `${XML}<cp:coreProperties xmlns:cp="cp" xmlns:dc="dc" xmlns:dcterms="dcterms"><dc:title>${tr ? 'Satış özeti' : 'Sales summary'}</dc:title><dc:creator>${tr ? 'Satış Ekibi' : 'Sales Team'}</dc:creator></cp:coreProperties>` },
  ]);
}

function docxSample(lang) {
  const tr = lang === 'tr';
  const p = (text, style) => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}<w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;
  const li = (text) => `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>${esc(text)}</w:t></w:r></w:p>`;
  const row = (cells) => `<w:tr>${cells.map((c) => `<w:tc><w:p><w:r><w:t>${esc(c)}</w:t></w:r></w:p></w:tc>`).join('')}</w:tr>`;
  const body = tr ? [
    p('Haftalık Proje Toplantısı', 'Title'), p('16 Ekim 2026 · Toplantı odası 3'),
    p('Gündem', 'Heading1'), li('Tasarım teslim tarihleri'), li('Test ortamının hazırlanması'), li('Müşteri geri bildirimleri'),
    p('Kararlar', 'Heading1'), p('Ana sayfa tasarımı onaylandı. Mobil görünüm için iki küçük düzeltme istendi; teslim cuma günü.'),
    p('Test ortamı bu hafta kurulacak. Yük testleri için 500 eşzamanlı kullanıcı hedefleniyor.'),
    p('Görevler', 'Heading2'),
    `<w:tbl>${row(['Görev', 'Sorumlu', 'Tarih'])}${row(['Mobil düzeltmeler', 'Tasarım', '18.10.2026'])}${row(['Test ortamı', 'Altyapı', '20.10.2026'])}${row(['Rapor', 'Proje yönetimi', '23.10.2026'])}</w:tbl>`,
    p('Bir sonraki toplantı: 23 Ekim 2026, 10:00.'),
  ] : [
    p('Weekly Project Meeting', 'Title'), p('October 16, 2026 · Meeting room 3'),
    p('Agenda', 'Heading1'), li('Design delivery dates'), li('Preparing the test environment'), li('Customer feedback'),
    p('Decisions', 'Heading1'), p('The home page design was approved. Two small fixes were requested for the mobile view; due Friday.'),
    p('The test environment will be set up this week. Load tests target 500 concurrent users.'),
    p('Tasks', 'Heading2'),
    `<w:tbl>${row(['Task', 'Owner', 'Date'])}${row(['Mobile fixes', 'Design', '2026-10-18'])}${row(['Test environment', 'Infrastructure', '2026-10-20'])}${row(['Report', 'Project management', '2026-10-23'])}</w:tbl>`,
    p('Next meeting: October 23, 2026, 10:00.'),
  ];
  return makeZip([
    { name: '[Content_Types].xml', data: `${XML}<Types/>` },
    { name: 'word/document.xml', data: `${XML}<w:document xmlns:w="w"><w:body>${body.join('')}<w:sectPr/></w:body></w:document>` },
    { name: 'docProps/core.xml', data: `${XML}<cp:coreProperties xmlns:cp="cp" xmlns:dc="dc"><dc:title>${tr ? 'Toplantı notları' : 'Meeting notes'}</dc:title><dc:creator>${tr ? 'Proje Ofisi' : 'Project Office'}</dc:creator></cp:coreProperties>` },
  ]);
}

function pptxSample(lang) {
  const tr = lang === 'tr';
  const slides = tr ? [
    ['3. Çeyrek Değerlendirmesi', [['Temmuz – Eylül 2026', 0]], 'Açılış: 2 dakika'],
    ['Öne çıkanlar', [['Satışlar %18 arttı', 0], ['En güçlü bölge: Ege', 1], ['Yeni müşteri sayısı: 340', 0], ['Müşteri memnuniyeti 4,6 / 5', 0]], ''],
    ['Riskler', [['Tedarik sürelerinde uzama', 0], ['Kur dalgalanması', 0]], 'Tedarikçi görüşmelerini anlat'],
    ['Sonraki adımlar', [['4. çeyrek kampanya planı', 0], ['Yeni depo açılışı – Kasım', 0]], ''],
  ] : [
    ['Q3 Review', [['July – September 2026', 0]], 'Opening: 2 minutes'],
    ['Highlights', [['Sales up 18%', 0], ['Strongest region: West', 1], ['New customers: 340', 0], ['Customer satisfaction 4.6 / 5', 0]], ''],
    ['Risks', [['Longer supply lead times', 0], ['Currency volatility', 0]], 'Mention supplier talks'],
    ['Next steps', [['Q4 campaign plan', 0], ['New warehouse opening – November', 0]], ''],
  ];
  const files = [
    { name: '[Content_Types].xml', data: `${XML}<Types/>` },
    { name: 'ppt/presentation.xml', data: `${XML}<p:presentation xmlns:p="p" xmlns:r="r"><p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 1}"/>`).join('')}</p:sldIdLst></p:presentation>` },
    { name: 'ppt/_rels/presentation.xml.rels', data: `${XML}<Relationships>${slides.map((_, i) => `<Relationship Id="rId${i + 1}" Target="slides/slide${i + 1}.xml"/>`).join('')}</Relationships>` },
  ];
  slides.forEach(([title, items, notes], i) => {
    files.push({ name: `ppt/slides/slide${i + 1}.xml`, data: `${XML}<p:sld xmlns:a="a" xmlns:p="p"><p:cSld><p:spTree>
      <p:sp><p:nvSpPr><p:nvPr><p:ph type="${i ? 'title' : 'ctrTitle'}"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>${esc(title)}</a:t></a:r></a:p></p:txBody></p:sp>
      <p:sp><p:nvSpPr><p:nvPr><p:ph idx="1"/></p:nvPr></p:nvSpPr><p:txBody>${items.map(([t, l]) => `<a:p><a:pPr lvl="${l}"/><a:r><a:t>${esc(t)}</a:t></a:r></a:p>`).join('')}</p:txBody></p:sp>
      </p:spTree></p:cSld></p:sld>` });
    if (notes) {
      files.push({ name: `ppt/slides/_rels/slide${i + 1}.xml.rels`, data: `${XML}<Relationships><Relationship Id="rId1" Target="../notesSlides/notesSlide${i + 1}.xml"/></Relationships>` });
      files.push({ name: `ppt/notesSlides/notesSlide${i + 1}.xml`, data: `${XML}<p:notes xmlns:a="a" xmlns:p="p"><p:cSld><p:spTree><p:sp><p:nvSpPr><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>${esc(notes)}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:notes>` });
    }
  });
  return makeZip(files);
}

function zipSample(lang) {
  const tr = lang === 'tr';
  const files = [
    ['site/', ''], ['site/index.html', '<!doctype html><title>Site</title>'.repeat(40)], ['site/css/', ''], ['site/css/style.css', 'body{margin:0}'.repeat(300)],
    ['site/js/', ''], ['site/js/app.js', 'console.log(1);'.repeat(900)], ['site/js/vendor.min.js', 'x'.repeat(180000)],
    ['site/img/', ''], ['site/img/hero.jpg', Buffer.alloc(420000, 7)], ['site/img/logo.svg', '<svg/>'.repeat(50)], ['site/img/favicon.ico', Buffer.alloc(15086, 1)],
    [tr ? 'site/belgeler/' : 'site/docs/', ''], [tr ? 'site/belgeler/gizlilik-politikası.pdf' : 'site/docs/privacy-policy.pdf', Buffer.alloc(96000, 3)],
    [tr ? 'site/belgeler/kullanım-koşulları.pdf' : 'site/docs/terms-of-use.pdf', Buffer.alloc(88000, 4)], ['README.txt', 'Yedek / backup'.repeat(20)],
  ];
  return makeZip(files.map(([name, data]) => ({ name, data, method: name.endsWith('/') || /\.(jpg|pdf|ico)$/.test(name) ? 0 : 8 })));
}

function wavSample(seconds = 2.4, rate = 22050) {
  const n = Math.floor(seconds * rate);
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const env = Math.min(1, t * 20) * Math.exp(-t * 1.6);
    const v = Math.sin(2 * Math.PI * 880 * t) * 0.5 + Math.sin(2 * Math.PI * 1320 * t) * 0.25;
    data.writeInt16LE(Math.round(v * env * 20000), i * 2);
  }
  const head = Buffer.alloc(44);
  head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVE', 8); head.write('fmt ', 12);
  head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22); head.writeUInt32LE(rate, 24);
  head.writeUInt32LE(rate * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34); head.write('data', 36); head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

// PDF (çok sayfalı teklif) ve kısa WebM video Chromium ile üretilir
async function chromiumSamples(lang, out, L) {
  const { chromium } = require('playwright-core');
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  try {
    const page = await browser.newPage();
    const tr = lang === 'tr';
    const sec = (n, title, body) => `<section style="page-break-after:always;padding:60px 64px;font-family:'DejaVu Sans',Arial;color:#0f172a">
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:4px solid #0891b2;padding-bottom:14px;margin-bottom:28px">
        <b style="font-size:22px;letter-spacing:1px;color:#0e7490">ÖRNEK ${tr ? 'YAZILIM A.Ş.' : 'SOFTWARE LTD.'}</b><span style="color:#64748b">${tr ? 'Sayfa' : 'Page'} ${n} / 4</span></div>
      <h1 style="font-size:34px;margin:0 0 18px">${title}</h1>${body}</section>`;
    const bar = (label, v, c) => `<div style="display:flex;align-items:center;gap:12px;margin:8px 0"><span style="width:160px">${label}</span><div style="height:22px;width:${v * 4}px;background:${c};border-radius:4px"></div><b>${v}%</b></div>`;
    const html = `<html><body style="margin:0">
      ${sec(1, tr ? 'Web Sitesi Yenileme Teklifi' : 'Website Redesign Proposal', `<p style="font-size:17px;line-height:1.7;color:#334155">${tr ? 'Bu teklif, kurumsal web sitenizin yeni tasarımını, içerik taşımayı ve bir yıllık bakım hizmetini kapsar.' : 'This proposal covers the redesign of your corporate website, content migration and one year of maintenance.'}</p>
        <div style="margin-top:40px;height:380px;border-radius:18px;background:linear-gradient(135deg,#22d3ee,#6366f1 55%,#a855f7);display:grid;place-items:center;color:#fff;font-size:44px;font-weight:800">2026</div>`)}
      ${sec(2, tr ? 'Kapsam' : 'Scope', `<ul style="font-size:17px;line-height:2">${(tr ? ['Yeni tasarım (masaüstü ve mobil)', 'İçerik yönetim sistemi', '8 dil desteği', 'Arama motoru optimizasyonu', 'Erişilebilirlik (WCAG 2.2 AA)'] : ['New design (desktop and mobile)', 'Content management system', 'Support for 8 languages', 'Search engine optimization', 'Accessibility (WCAG 2.2 AA)']).map((x) => `<li>${x}</li>`).join('')}</ul>`)}
      ${sec(3, tr ? 'Zaman planı' : 'Timeline', `${bar(tr ? 'Analiz' : 'Analysis', 15, '#22d3ee')}${bar(tr ? 'Tasarım' : 'Design', 30, '#6366f1')}${bar(tr ? 'Geliştirme' : 'Development', 40, '#a855f7')}${bar(tr ? 'Test ve yayın' : 'Test and launch', 15, '#f472b6')}`)}
      ${sec(4, tr ? 'Bütçe' : 'Budget', `<table style="width:100%;border-collapse:collapse;font-size:16px">${(tr ? [['Kalem', 'Tutar'], ['Tasarım', '120.000 ₺'], ['Geliştirme', '210.000 ₺'], ['Bakım (12 ay)', '48.000 ₺'], ['Toplam', '378.000 ₺']] : [['Item', 'Amount'], ['Design', '$4,000'], ['Development', '$7,000'], ['Maintenance (12 months)', '$1,600'], ['Total', '$12,600']]).map((r, i) => `<tr style="${i === 0 ? 'background:#e0f2fe;font-weight:700' : ''}${i === 4 ? 'font-weight:700' : ''}"><td style="border:1px solid #cbd5e1;padding:10px">${r[0]}</td><td style="border:1px solid #cbd5e1;padding:10px;text-align:right">${r[1]}</td></tr>`).join('')}</table>`)}
    </body></html>`;
    await page.setContent(html);
    await page.pdf({ path: path.join(out, L.pdf), format: 'A4', printBackground: true });
    await page.setContent('<html><body style="margin:0"><h1>Invoice 0142</h1></body></html>');
    await page.pdf({ path: path.join(out, L.other[0]), format: 'A4' });

    // 3 sn'lik tanıtım klibi: tuval animasyonu MediaRecorder ile WebM'e kaydedilir
    const svgData = `data:image/svg+xml;base64,${Buffer.from(landscapeSvg(1280, 720)).toString('base64')}`;
    const b64 = await page.evaluate(async ({ src, title }) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = 1280; c.height = 720;
      const ctx = c.getContext('2d');
      const rec = new MediaRecorder(c.captureStream(30), { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: 2500000 });
      const chunks = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      const done = new Promise((r) => (rec.onstop = r));
      rec.start();
      const t0 = performance.now();
      await new Promise((resolve) => {
        const frame = () => {
          const t = (performance.now() - t0) / 1000;
          ctx.drawImage(img, -t * 30, -t * 10, 1280 * 1.08, 720 * 1.08);
          ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(0, 560, 1280, 160);
          ctx.fillStyle = '#fff'; ctx.font = '700 64px sans-serif'; ctx.fillText(title, 60, 660);
          if (t < 3) requestAnimationFrame(frame); else resolve();
        };
        frame();
      });
      rec.stop();
      await done;
      const buf = await new Blob(chunks, { type: 'video/webm' }).arrayBuffer();
      let s = '';
      const u8 = new Uint8Array(buf);
      for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
      return btoa(s);
    }, { src: svgData, title: L.title });
    fs.writeFileSync(path.join(out, L.video), Buffer.from(b64, 'base64'));
  } finally {
    await browser.close();
  }
}

async function main(out, lang) {
  const L = T[lang];
  fs.mkdirSync(out, { recursive: true });
  await sharp(Buffer.from(landscapeSvg(2400, 1600))).jpeg({ quality: 88 }).toFile(path.join(out, L.photo));
  await sharp(Buffer.from(landscapeSvg(800, 500, { balloons: false }))).png().toFile(path.join(out, L.other[1]));
  await makePsd(L, path.join(out, L.psd));
  fs.writeFileSync(path.join(out, L.code), codeSample(lang));
  fs.writeFileSync(path.join(out, L.md), markdownSample(lang));
  fs.writeFileSync(path.join(out, L.xlsx), xlsxSample(lang));
  fs.writeFileSync(path.join(out, L.docx), docxSample(lang));
  fs.writeFileSync(path.join(out, L.pptx), pptxSample(lang));
  fs.writeFileSync(path.join(out, L.zip), zipSample(lang));
  fs.writeFileSync(path.join(out, L.wav), wavSample());
  fs.writeFileSync(path.join(out, L.svg), fs.readFileSync(path.join(ROOT, 'build', 'icon.svg')));
  fs.writeFileSync(path.join(out, L.other[2]), lang === 'tr' ? 'Kurulum notları\n================\n1. Kurulumu çalıştırın.\n2. Mastertool hesabıyla giriş yapın.\n' : 'Setup notes\n===========\n1. Run the installer.\n2. Sign in with your Mastertool account.\n');
  await chromiumSamples(lang, out, L);
  return L;
}

module.exports = { main, T, landscapeSvg };

if (require.main === module) {
  const lang = process.argv[3] || 'tr';
  const out = path.resolve(process.argv[2] || path.join(ROOT, 'samples', lang));
  main(out, lang).then(() => console.log(`Örnekler: ${out}`)).catch((e) => { console.error(e); process.exit(1); });
}
