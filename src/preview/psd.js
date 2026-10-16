'use strict';

// Photoshop PSD/PSB önizlemesi (ag-psd). Photoshop'un dosyaya yazdığı düzleştirilmiş birleşik görüntü kullanılır;
// "Uyumluluğu en üst düzeye çıkar" kapalı kaydedilmiş dosyalarda bu görüntü boş olabilir: o zaman görünür
// katmanlar normal karışımla (opaklık dahil) üst üste konup yaklaşık bir birleşik görüntü üretilir.
// Katman listesi isteğe bağlıdır (Ayarlar › Önizleme); katman pikselleri yalnız gerektiğinde okunur.

const { readPsd, initializeCanvas } = require('ag-psd');

// Pikseller düz RGBA dizisi olarak istenir (useImageData); tuval gerekmez. Böylece aynı kod hem önizleme
// penceresinde hem de Node testlerinde çalışır.
initializeCanvas(
  (w, h) => {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    throw new Error('canvas_unavailable');
  },
  (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
);

const COLOR_MODES = ['Bitmap', 'Grayscale', 'Indexed', 'RGB', 'CMYK', null, null, 'Multichannel', 'Duotone', 'Lab'];

function toBuffer(input) {
  if (Buffer.isBuffer(input)) return input;
  if (input instanceof ArrayBuffer) return Buffer.from(input);
  return Buffer.from(input.buffer, input.byteOffset, input.byteLength);
}

const opts = (withLayers) => ({ useImageData: true, skipLayerImageData: !withLayers, skipThumbnail: true, skipLinkedFilesData: true });

// Birleşik görüntü kullanılabilir mi? Yoksa, tamamen saydamsa ya da tek renkse (uyumluluk kapalı kaydedilen
// dosyalarda Photoshop düz bir görüntü yazar) ve dosyada katman varsa katmanlardan üretilir.
function usableComposite(img, hasLayers) {
  if (!img || !img.data || !img.width || !img.height) return false;
  const d = img.data;
  const step = Math.max(4, Math.floor(d.length / 4 / 20000) * 4); // en çok ~20 bin örnek
  let opaque = false;
  let uniform = true;
  for (let i = 0; i < d.length; i += step) {
    if (d[i + 3] !== 0) opaque = true;
    if (d[i] !== d[0] || d[i + 1] !== d[1] || d[i + 2] !== d[2] || d[i + 3] !== d[3]) uniform = false;
    if (opaque && !uniform) return true;
  }
  return opaque && !(uniform && hasLayers);
}

// Katman ağacı → düz liste (derinlikli). Görünürlük üst gruba bağlıdır.
function flattenLayers(children, depth = 0, parentHidden = false, out = []) {
  // ag-psd'de dizi alttan üste sıralıdır; listede Photoshop gibi üstten alta gösterilir
  for (let i = (children || []).length - 1; i >= 0; i--) {
    const l = children[i];
    const hidden = parentHidden || !!l.hidden;
    out.push({
      name: String(l.name || ''),
      group: Array.isArray(l.children),
      hidden: !!l.hidden,
      effectiveHidden: hidden,
      opacity: l.opacity == null ? 1 : l.opacity,
      blendMode: l.blendMode || 'normal',
      depth,
      bounds: l.left != null ? { left: l.left, top: l.top, right: l.right, bottom: l.bottom } : null,
      text: l.text && l.text.text ? String(l.text.text).slice(0, 200) : undefined,
    });
    if (Array.isArray(l.children)) flattenLayers(l.children, depth + 1, hidden, out);
  }
  return out;
}

// Görünür katmanları "normal" karışımla birleştir (yaklaşık; karışım modları ve efektler yok sayılır)
function compositeLayers(psd) {
  const W = psd.width;
  const H = psd.height;
  const out = new Uint8ClampedArray(W * H * 4);
  const draw = (layers, parentOpacity) => {
    for (const l of layers || []) {
      if (l.hidden) continue;
      const op = parentOpacity * (l.opacity == null ? 1 : l.opacity);
      if (Array.isArray(l.children)) { draw(l.children, op); continue; }
      const img = l.imageData;
      if (!img || !img.width) continue;
      for (let y = 0; y < img.height; y++) {
        const dy = (l.top || 0) + y;
        if (dy < 0 || dy >= H) continue;
        for (let x = 0; x < img.width; x++) {
          const dx = (l.left || 0) + x;
          if (dx < 0 || dx >= W) continue;
          const si = (y * img.width + x) * 4;
          const sa = (img.data[si + 3] / 255) * op;
          if (sa <= 0) continue;
          const di = (dy * W + dx) * 4;
          const da = out[di + 3] / 255;
          const oa = sa + da * (1 - sa);
          for (let k = 0; k < 3; k++) out[di + k] = (img.data[si + k] * sa + out[di + k] * da * (1 - sa)) / oa;
          out[di + 3] = oa * 255;
        }
      }
    }
  };
  draw(psd.children, 1);
  return { width: W, height: H, data: out };
}

// input: Buffer/ArrayBuffer/Uint8Array. Sonuç: { width, height, data (RGBA), layers, info, approximate }
function decodePsd(input, { layers: wantLayers = false } = {}) {
  const buf = toBuffer(input);
  let psd = readPsd(buf, opts(wantLayers));
  let image = psd.imageData;
  let approximate = false;
  if (!usableComposite(image, countLayers(psd.children) > 0)) {
    if (!wantLayers) psd = readPsd(buf, opts(true));
    image = compositeLayers(psd);
    approximate = true;
  }
  const info = {
    width: psd.width,
    height: psd.height,
    colorMode: COLOR_MODES[psd.colorMode] || String(psd.colorMode ?? ''),
    bitsPerChannel: psd.bitsPerChannel || 8,
    channels: psd.channels || undefined,
    layerCount: countLayers(psd.children),
    resolution: psd.imageResources && psd.imageResources.resolutionInfo
      ? Math.round(psd.imageResources.resolutionInfo.horizontalResolution) : undefined,
  };
  return {
    width: image.width,
    height: image.height,
    data: image.data instanceof Uint8ClampedArray ? image.data : new Uint8ClampedArray(image.data.buffer, image.data.byteOffset, image.data.byteLength),
    layers: wantLayers ? flattenLayers(psd.children) : [],
    info,
    approximate,
  };
}

function countLayers(children) {
  let n = 0;
  for (const l of children || []) n += Array.isArray(l.children) ? countLayers(l.children) : 1;
  return n;
}

module.exports = { decodePsd, flattenLayers, compositeLayers, usableComposite };
