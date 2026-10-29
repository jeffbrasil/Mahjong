/**
 * assets.js — carrega o atlas e prepara cópias de baixa resolução
 * (pixel art) para desenhar no canvas lógico sem interpolação.
 */

import { TILE_H, TILE_W, UI_SCALE } from './config.js';
import { TYPE_BY_ID } from './rules.js';

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Falha ao carregar ${src}`));
    img.src = src;
  });
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

function fitNearest(ctx, source, w, h) {
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, 0, 0, w, h);
}

export class Assets {
  constructor() {
    this.atlas = null;
    this.items = new Map();
    this.baseCache = new Map();
    this.scaledCache = new Map();
    this.tileCache = new Map();
    this.missing = new Set();
    this.baseScale = UI_SCALE;
  }

  async load() {
    let atlas;
    try {
      const res = await fetch('assets/atlas.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      atlas = await res.json();
    } catch (err) {
      throw new Error(
        'Não foi possível carregar assets/atlas.json. ' +
        'Abra o jogo por um servidor HTTP (ex.: python -m http.server). ' +
        err.message,
      );
    }
    this.atlas = atlas;
    const entries = Object.entries(atlas);
    await Promise.all(entries.map(async ([name, meta]) => {
      try {
        const img = await loadImage(meta.file);
        const base = makeCanvas(meta.w / this.baseScale, meta.h / this.baseScale);
        const bctx = base.getContext('2d');
        bctx.imageSmoothingEnabled = false;
        bctx.drawImage(img, 0, 0, base.width, base.height);
        this.items.set(name, { ...meta, img, base });
      } catch (err) {
        console.warn(`Sprite ausente: ${name}`, err);
        this.missing.add(name);
      }
    }));
    return this;
  }

  /** Cópia reduzida (/3) preparada para o HUD/menu. */
  get(name) {
    const item = this.items.get(name);
    if (!item) return this.placeholder(name, 40, 40);
    if (this.baseCache.has(name)) return this.baseCache.get(name);
    // a base já foi reduzida em load()
    this.baseCache.set(name, item.base);
    return item.base;
  }

  /** Imagem original do atlas, sem redução. */
  original(name) {
    return this.items.get(name)?.img || this.placeholder(name, 40, 40);
  }

  size(name) {
    const item = this.items.get(name);
    if (!item) return { w: 40, h: 40, bw: 13, bh: 13 };
    return {
      w: item.w, h: item.h,
      bw: item.base.width, bh: item.base.height,
    };
  }

  /** Versão redimensionada em cache, com vizinho mais próximo. */
  scaled(name, w, h) {
    const key = `${name}|${Math.round(w)}|${Math.round(h)}`;
    if (this.scaledCache.has(key)) return this.scaledCache.get(key);
    const src = this.original(name);
    const c = makeCanvas(w, h);
    fitNearest(c.getContext('2d'), src, c.width, c.height);
    this.scaledCache.set(key, c);
    return c;
  }

  /** Sprite de peça em tamanho arbitrário, com cache por tamanho. */
  tileSized(typeId, dark = false, w = TILE_W, h = TILE_H) {
    const rw = Math.max(1, Math.round(w));
    const rh = Math.max(1, Math.round(h));
    const key = `${typeId}|${dark ? 'dark' : 'light'}|${rw}x${rh}`;
    if (this.tileCache.has(key)) return this.tileCache.get(key);
    const type = TYPE_BY_ID[typeId];
    const fallbackId = type?.sprite || 'tile_char_1';
    const src = this.original(fallbackId);
    const c = makeCanvas(rw, rh);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, 0, 0, rw, rh);
    if (dark) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = 'rgba(15, 11, 9, 0.30)';
      ctx.fillRect(0, 0, rw, rh);
      ctx.globalCompositeOperation = 'source-over';
    }
    this.tileCache.set(key, c);
    return c;
  }

  /** Sprite de peça normalizado (TILE_W x TILE_H). */
  tile(typeId, dark = false) {
    return this.tileSized(typeId, dark, TILE_W, TILE_H);
  }

  tileSpriteName(typeId) {
    return TYPE_BY_ID[typeId]?.sprite || null;
  }

  placeholders() {
    return [...this.missing];
  }

  placeholder(name, w = 40, h = 40) {
    const key = `placeholder|${name}|${w}|${h}`;
    if (this.scaledCache.has(key)) return this.scaledCache.get(key);
    const c = makeCanvas(w, h);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#9b59b6';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#2b1440';
    ctx.fillRect(0, 0, c.width, 2);
    ctx.fillRect(0, c.height - 2, c.width, 2);
    ctx.fillRect(0, 0, 2, c.height);
    ctx.fillRect(c.width - 2, 0, 2, c.height);
    this.scaledCache.set(key, c);
    return c;
  }
}
