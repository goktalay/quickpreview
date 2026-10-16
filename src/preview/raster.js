'use strict';

// Chromium'un kendisinin açamadığı resimler: TIFF (UTIF.js) ve HEIC/HEIF (libheif, WebAssembly).
// Sonuç her zaman { width, height, data (RGBA Uint8ClampedArray), pages? } — pencere bunu tuvale çizer.

const toU8 = (input) => (input instanceof Uint8Array ? input : new Uint8Array(input.buffer || input, input.byteOffset || 0, input.byteLength ?? input.length));

// Çok sayfalı TIFF: ilk sayfa çözülür, sayfa sayısı bildirilir (küçük resimler/maskeler sayılmaz)
function decodeTiff(input, { page = 0 } = {}) {
  const UTIF = require('utif');
  const u8 = toU8(input);
  const ab = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
  const ifds = UTIF.decode(ab).filter((f) => f.t256 && f.t257 && !(f.t254 && (f.t254[0] & 1)));
  if (!ifds.length) throw Object.assign(new Error('tiff_invalid'), { code: 'tiff_invalid' });
  const ifd = ifds[Math.min(page, ifds.length - 1)];
  UTIF.decodeImage(ab, ifd);
  const rgba = UTIF.toRGBA8(ifd);
  return { width: ifd.width, height: ifd.height, data: new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.byteLength), pages: ifds.length };
}

// HEIC/HEIF (iPhone fotoğrafları). libheif ilk kullanımda yüklenir (~1.5 MB WebAssembly).
async function decodeHeic(input) {
  const decode = require('heic-decode');
  const img = await decode({ buffer: toU8(input) });
  return { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data.buffer, img.data.byteOffset, img.data.byteLength) };
}

module.exports = { decodeTiff, decodeHeic };
