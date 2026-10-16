'use strict';

// Sahne: resim, PSD, SVG ve PDF sayfası için ortak görünüm. Sığdır / gerçek boyut / serbest yakınlaştırma,
// 90° döndürme, sürükleyerek kaydırma, Ctrl+tekerlek ile imlecin olduğu noktaya yakınlaştırma.
// İçerik (img ya da canvas) CSS dönüşümüyle ölçeklenir; PDF ölçek değişince sayfayı yeniden çizer (onChange).

const ZOOM_STEPS = [0.05, 0.1, 0.15, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32];
const MIN_SCALE = 0.02;
const MAX_SCALE = 32;
const PAD = 16;

class Stage {
  // opts: { upscale: sığdırırken büyütülsün mü (vektör/PDF), checker: saydamlık için dama, shadow, page, pixelate, onChange }
  constructor(host, opts = {}) {
    this.opts = opts;
    this.mode = opts.mode === 'actual' ? 'actual' : 'fit';
    this.scale = 1;
    this.rotation = 0;
    this.w = 1;
    this.h = 1;
    this.el = h('<div class="stage" tabindex="-1"><div class="stage-wrap"></div></div>');
    this.wrap = this.el.firstElementChild;
    if (opts.checker) this.wrap.classList.add('checker');
    if (opts.shadow) this.wrap.classList.add('shadow');
    if (opts.page) this.wrap.classList.add('page');
    this.el.style.padding = `${PAD}px`;
    host.appendChild(this.el);
    this.content = null;
    this._bind();
    this.ro = new ResizeObserver(() => { if (this.mode === 'fit') this.apply(); else this._grabState(); });
    this.ro.observe(this.el);
  }

  setContent(el, w, h, { keepView = false } = {}) {
    if (this.content && this.content !== el) this.content.remove();
    this.content = el;
    el.classList.add('stage-content');
    if (!el.parentNode) this.wrap.appendChild(el);
    this.w = Math.max(1, w);
    this.h = Math.max(1, h);
    if (!keepView) this.rotation = 0;
    if (!keepView && this.mode === 'custom') this.mode = this.opts.mode === 'actual' ? 'actual' : 'fit';
    this.apply();
    if (!keepView) { this.el.scrollLeft = 0; this.el.scrollTop = 0; this._center(); }
  }

  get rotated() { return this.rotation % 180 !== 0; }
  get boxW() { return this.rotated ? this.h : this.w; }
  get boxH() { return this.rotated ? this.w : this.h; }

  fitScale() {
    const aw = Math.max(40, this.el.clientWidth - PAD * 2);
    const ah = Math.max(40, this.el.clientHeight - PAD * 2);
    let s = Math.min(aw / this.boxW, ah / this.boxH);
    if (!this.opts.upscale) s = Math.min(1, s);
    return Math.max(MIN_SCALE, s);
  }

  apply() {
    if (this.mode === 'fit') this.scale = this.fitScale();
    else if (this.mode === 'actual') this.scale = 1;
    const s = this.scale;
    this.wrap.style.width = `${Math.round(this.boxW * s)}px`;
    this.wrap.style.height = `${Math.round(this.boxH * s)}px`;
    if (this.content) {
      const c = this.content;
      c.style.width = `${this.w}px`;
      c.style.height = `${this.h}px`;
      c.style.transform = `translate(-50%, -50%) rotate(${this.rotation}deg) scale(${s})`;
      c.classList.toggle('pixelated', !!this.opts.pixelate && s >= 3);
    }
    this._grabState();
    if (this.opts.onChange) this.opts.onChange(this);
  }

  _grabState() {
    const scrollable = this.el.scrollWidth > this.el.clientWidth + 1 || this.el.scrollHeight > this.el.clientHeight + 1;
    this.el.classList.toggle('grab', scrollable);
  }

  _center() {
    this.el.scrollLeft = (this.el.scrollWidth - this.el.clientWidth) / 2;
    this.el.scrollTop = (this.el.scrollHeight - this.el.clientHeight) / 2;
  }

  // Yeni ölçek; (cx, cy) istemci koordinatındaki nokta yerinde kalır
  zoomTo(scale, cx, cy) {
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
    const r = this.el.getBoundingClientRect();
    const px = cx == null ? r.width / 2 : cx - r.left;
    const py = cy == null ? r.height / 2 : cy - r.top;
    const fx = (this.el.scrollLeft + px - this.wrap.offsetLeft) / Math.max(1, this.wrap.offsetWidth);
    const fy = (this.el.scrollTop + py - this.wrap.offsetTop) / Math.max(1, this.wrap.offsetHeight);
    this.mode = Math.abs(next - 1) < 1e-6 ? 'actual' : 'custom';
    this.scale = next;
    this.apply();
    this.el.scrollLeft = fx * this.wrap.offsetWidth + this.wrap.offsetLeft - px;
    this.el.scrollTop = fy * this.wrap.offsetHeight + this.wrap.offsetTop - py;
  }

  zoomStep(dir, cx, cy) {
    const s = this.scale;
    const next = dir > 0 ? ZOOM_STEPS.find((z) => z > s * 1.001) || MAX_SCALE : [...ZOOM_STEPS].reverse().find((z) => z < s / 1.001) || MIN_SCALE;
    this.zoomTo(next, cx, cy);
  }

  fit() { this.mode = 'fit'; this.apply(); this._center(); }
  actual() { this.zoomTo(1); this.mode = 'actual'; }
  rotate(deg = 90) {
    this.rotation = (this.rotation + deg + 360) % 360;
    this.apply();
    this._center();
  }

  _bind() {
    const el = this.el;
    // Ctrl+tekerlek: imlecin olduğu noktaya yakınlaştır
    el.addEventListener('wheel', (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      this.zoomTo(this.scale * Math.exp(-e.deltaY * 0.0018), e.clientX, e.clientY);
    }, { passive: false });
    // Sürükleyerek kaydır
    let drag = null;
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !el.classList.contains('grab')) return;
      drag = { x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop, id: e.pointerId };
      el.setPointerCapture(e.pointerId);
      el.classList.add('grabbing');
    });
    el.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      el.scrollLeft = drag.sl - (e.clientX - drag.x);
      el.scrollTop = drag.st - (e.clientY - drag.y);
    });
    const end = () => { drag = null; el.classList.remove('grabbing'); };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    // Çift tık: sığdır ↔ %100 (sığmış resim zaten %100'se 2×)
    el.addEventListener('dblclick', (e) => {
      if (this.mode === 'fit') this.zoomTo(this.scale >= 0.999 ? 2 : 1, e.clientX, e.clientY);
      else this.fit();
    });
  }

  destroy() {
    this.ro.disconnect();
    this.el.remove();
  }
}
