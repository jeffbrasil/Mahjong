/**
 * render.js — desenho em Canvas 2D em pixels CSS.
 * O tabuleiro é calculado a partir do espaço disponível (paisagem ou retrato);
 * a UI usa a geometria responsiva de ui.js.
 */

import { COLORS, TILE_W as REF_TILE_W, TILE_H as REF_TILE_H } from './config.js';
import { LAYOUTS, LAYOUT_BY_ID } from './layouts.js';
import {
  getGameLayout, getMenuLayout, getModalLayout, getEndLayout,
} from './ui.js';
import { createView, readHudPref, saveHudPref } from './view.js';
import { drawText, measureText } from './font.js';
import { freeTiles, findFreePairs } from './rules.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmtTime = (s) => {
  s = Math.max(0, Math.ceil(s));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

const REF = {
  w: REF_TILE_W,
  h: REF_TILE_H,
  halfW: REF_TILE_W / 2,
  halfH: REF_TILE_H / 2,
  zDx: -5,
  zDy: -6,
};

export class Renderer {
  constructor(canvas, assets) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.assets = assets;
    this.view = createView(960, 540, 1, readHudPref());
    this.ui = getGameLayout(this.view);
    this.background = null;
    this.backgroundKey = '';
    this.gameScene = null;
    this.gameSceneKey = '';
    this.boardCache = null;
    this.boundsCache = new Map();
    this.geometry = new Map();
    this.frameCache = new Map();
    this.tileW = REF.w;
    this.tileH = REF.h;
    this.tileScale = 1;
    this._geomKey = '';
    this.boardOuter = { x: 0, y: 0, w: 0, h: 0 };
    this.boardInner = { x: 0, y: 0, w: 0, h: 0 };
    this.menuLayout = null;
    this.modalLayout = null;
    this.endLayout = null;
  }

  setViewport(w, h, dpr = 1) {
    const pref = this.view?.hudPref || readHudPref();
    this.view = createView(w, h, dpr, pref);
    this.syncCanvasSize();
    this.invalidateLayout();
  }

  syncCanvasSize() {
    const { w, h, dpr } = this.view;
    this.canvas.width = Math.max(1, Math.round(w * dpr));
    this.canvas.height = Math.max(1, Math.round(h * dpr));
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx = this.canvas.getContext('2d');
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
  }

  invalidateLayout() {
    this.ui = getGameLayout(this.view);
    this.background = null;
    this.backgroundKey = '';
    this.gameScene = null;
    this.gameSceneKey = '';
    this.boardCache = null;
    this.geometry.clear();
    this.frameCache.clear();
    this._geomKey = '';
  }

  toggleHud() {
    const next = this.view.hudCollapsed ? 'expanded' : 'collapsed';
    saveHudPref(next);
    this.view = createView(this.view.w, this.view.h, this.view.dpr, next);
    this.syncCanvasSize();
    this.invalidateLayout();
    return !this.view.hudCollapsed;
  }

  makeBackground() {
    const key = `${this.view.w}x${this.view.h}`;
    if (this.background && this.backgroundKey === key) return this.background;
    const c = document.createElement('canvas');
    c.width = this.view.w;
    c.height = this.view.h;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;

    const grad = g.createRadialGradient(
      this.view.w * 0.5, this.view.h * 0.42, 20,
      this.view.w * 0.5, this.view.h * 0.5, Math.max(this.view.w, this.view.h) * 0.75,
    );
    grad.addColorStop(0, '#2b1b13');
    grad.addColorStop(0.55, '#1a120e');
    grad.addColorStop(1, '#0e0a08');
    g.fillStyle = grad;
    g.fillRect(0, 0, this.view.w, this.view.h);

    // textura discreta de feltro/wood
    g.fillStyle = 'rgba(236, 198, 115, 0.045)';
    for (let y = 0; y < this.view.h; y += 8) {
      for (let x = (y / 8) % 2 ? 4 : 0; x < this.view.w; x += 8) g.fillRect(x, y, 1, 1);
    }
    // vinheta
    const vg = g.createRadialGradient(
      this.view.w / 2, this.view.h / 2, Math.min(this.view.w, this.view.h) * 0.2,
      this.view.w / 2, this.view.h / 2, Math.max(this.view.w, this.view.h) * 0.72,
    );
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.42)');
    g.fillStyle = vg;
    g.fillRect(0, 0, this.view.w, this.view.h);

    this.background = c;
    this.backgroundKey = key;
    return c;
  }

  // ------------------------------------------------------------------
  // Entrada principal
  // ------------------------------------------------------------------
  draw(game) {
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    const now = performance.now() / 1000;
    this.makeBackground();
    if (game.screen === 'loading') {
      this.drawLoading(game);
      return;
    }
    if (game.screen === 'menu') {
      this.drawMenu(game, now);
    } else if (game.screen === 'playing') {
      this.drawGame(game, now);
    } else if (game.screen === 'end') {
      this.drawGame(game, now);
      this.drawEnd(game, now);
    }
    if (game.modal) this.drawModal(game, now);
  }

  drawLoading(game) {
    const ctx = this.ctx;
    const { w, h } = this.view;
    ctx.fillStyle = '#17110e';
    ctx.fillRect(0, 0, w, h);
    const titleScale = w < 420 ? 3 : 4;
    drawText(ctx, 'MAHJONG SOLITAIRE', w / 2, h / 2 - 60, {
      scale: titleScale, color: COLORS.gold, align: 'center', shadow: '#0b0705',
    });
    const dots = '.'.repeat((Math.floor(performance.now() / 350) % 4));
    drawText(ctx, `CARREGANDO${dots}`, w / 2, h / 2, {
      scale: 2, color: COLORS.cream, align: 'center',
    });
    drawText(ctx, game.loadingError || 'PREPARANDO AS PEÇAS', w / 2, h / 2 + 34, {
      scale: 1, color: game.loadingError ? COLORS.red : '#b9a486', align: 'center',
    });
  }

  // ------------------------------------------------------------------
  // MENU
  // ------------------------------------------------------------------
  drawMenu(game, now) {
    const ctx = this.ctx;
    const { w, h, portrait } = this.view;
    const layout = getMenuLayout(this.view);
    this.menuLayout = layout;

    ctx.drawImage(this.makeBackground(), 0, 0);
    ctx.fillStyle = 'rgba(9, 7, 6, 0.28)';
    ctx.fillRect(0, 0, w, h);

    // versos de peças flutuando nas laterais, posicionados em relação à tela
    const backs = portrait
      ? [
        { name: 'back_green', x: w * 0.04, y: h * 0.16, ph: 0.2, amp: 6 },
        { name: 'back_red', x: w * 0.82, y: h * 0.24, ph: 2.4, amp: 7 },
        { name: 'back_blue', x: w * 0.06, y: h * 0.74, ph: 1.8, amp: 5 },
        { name: 'back_green', x: w * 0.84, y: h * 0.70, ph: 0.9, amp: 6 },
      ]
      : [
        { name: 'back_green', x: w * 0.02, y: h * 0.18, ph: 0.2, amp: 7 },
        { name: 'back_red', x: w * 0.02, y: h * 0.70, ph: 3.1, amp: 5 },
        { name: 'back_red', x: w * 0.94, y: h * 0.18, ph: 2.4, amp: 6 },
        { name: 'back_green', x: w * 0.94, y: h * 0.70, ph: 0.9, amp: 5 },
      ];
    for (const b of backs) {
      const img = this.assets.get(b.name);
      const float = Math.sin(now * 0.55 + b.ph) * b.amp;
      const x = Math.round(b.x - img.width / 2 + Math.sin(now * 0.3 + b.ph) * 2);
      const y = Math.round(b.y - img.height / 2 + float);
      ctx.globalAlpha = 0.85;
      ctx.drawImage(img, x, y);
      ctx.globalAlpha = 1;
    }

    drawText(ctx, 'MAHJONG', w / 2, layout.titleY1, {
      scale: 4, color: COLORS.cream, align: 'center', shadow: '#3d2012',
    });
    drawText(ctx, 'SOLITAIRE', w / 2, layout.titleY2, {
      scale: 2, color: COLORS.gold, align: 'center', shadow: '#3d2012',
    });

    const p = layout.panel;
    this.panel(p.x, p.y, p.w, p.h, { fill: 'rgba(31, 22, 18, 0.94)', border: '#8c5a2b' });
    ctx.fillStyle = COLORS.gold;
    for (const [x, y] of [[p.x + 5, p.y + 5], [p.x + p.w - 8, p.y + 5],
      [p.x + 5, p.y + p.h - 8], [p.x + p.w - 8, p.y + p.h - 8]]) {
      ctx.fillRect(x, y, 3, 3);
    }

    for (const card of layout.cards) {
      const selected = game.selectedLayoutId === card.layout.id;
      const hover = game.hover && game.hover.type === 'layout' && game.hover.id === card.layout.id;
      this.panel(card.x, card.y, card.w, card.h, {
        fill: selected ? 'rgba(232,163,58,0.14)' : 'rgba(18,13,11,0.72)',
        border: selected || hover ? COLORS.gold : '#6f4a29',
        thickness: selected || hover ? 2 : 1,
      });
      if (hover && !selected) {
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.fillRect(card.x + 2, card.y + 2, card.w - 4, card.h - 4);
      }
      const name = `ui_wind_mini_${card.layout.wind}`;
      const img = this.assets.original(name);
      const maxW = card.w - 14;
      const maxH = card.h - 14;
      const ratio = Math.min(maxW / img.width, maxH / img.height);
      const iw = Math.max(8, Math.round(img.width * ratio));
      const ih = Math.max(8, Math.round(img.height * ratio));
      ctx.drawImage(img,
        Math.round(card.x + (card.w - iw) / 2),
        Math.round(card.y + (card.h - ih) / 2), iw, ih);
      drawText(ctx, card.layout.name, card.x + card.w / 2, card.labelY, {
        scale: card.nameScale, color: selected ? COLORS.gold : '#c8b69a', align: 'center',
      });
    }

    const layoutDef = LAYOUT_BY_ID[game.selectedLayoutId] || LAYOUTS[0];
    drawText(ctx, `${layoutDef.difficulty.toUpperCase()}  •  ${layoutDef.tileCount} PEÇAS  •  ${layoutDef.pairCount} PARES`,
      w / 2, layout.descY, { scale: 1, color: COLORS.cream, align: 'center' });
    drawText(ctx, layoutDef.blurb, w / 2, layout.descY + 14, {
      scale: 1, color: '#b8a88e', align: 'center',
    });

    const t = layout.toggle;
    this.buttonBox(t.x, t.y, t.w, t.h, { active: game.timedMode, hover: game.hover?.type === 'timed' });
    const toggleScale = measureText('MODO CRONOMETRADO', 2) <= t.w - 82 ? 2 : 1;
    drawText(ctx, 'MODO CRONOMETRADO', t.x + 12, t.y + Math.round((t.h - 10 * toggleScale) / 2), {
      scale: toggleScale, color: game.timedMode ? COLORS.gold : '#b9a78c',
    });
    const sw = { x: t.x + t.w - 62, y: t.y + Math.round((t.h - 20) / 2), w: 50, h: 20 };
    ctx.fillStyle = '#17110e';
    ctx.fillRect(sw.x, sw.y, sw.w, sw.h);
    ctx.strokeStyle = game.timedMode ? COLORS.gold : '#665846';
    ctx.strokeRect(sw.x + 0.5, sw.y + 0.5, sw.w - 1, sw.h - 1);
    ctx.fillStyle = game.timedMode ? COLORS.gold : '#5e5243';
    ctx.fillRect(game.timedMode ? sw.x + 27 : sw.x + 4, sw.y + 5, 19, 10);

    this.drawSpriteFit('ui_btn_jogar', layout.play, game.hover?.type === 'play');
    this.drawSpriteFit('ui_btn_sair', layout.exit, game.hover?.type === 'exit');

    drawText(ctx, 'COMBINE PARES LIVRES PARA LIMPAR O TABULEIRO.', w / 2, layout.footerY1, {
      scale: 1, color: '#c9b696', align: 'center',
    });
    drawText(ctx, 'PEÇAS LIVRES TÊM UM LADO ABERTO  •  TOQUE OU MOUSE', w / 2, layout.footerY2, {
      scale: 1, color: '#7f705b', align: 'center',
    });

    this.drawMuteChip(layout.mute, game.audioMuted, game.hover?.type === 'mute');
  }

  drawSpriteFit(name, rect, hover) {
    const ctx = this.ctx;
    const img = this.assets.original(name);
    if (hover) {
      ctx.fillStyle = 'rgba(232,163,58,0.20)';
      ctx.fillRect(rect.x - 3, rect.y - 3, rect.w + 6, rect.h + 6);
    }
    const ratio = Math.min(rect.w / img.width, rect.h / img.height);
    const w = Math.max(8, Math.round(img.width * ratio));
    const h = Math.max(8, Math.round(img.height * ratio));
    ctx.drawImage(img,
      Math.round(rect.x + (rect.w - w) / 2),
      Math.round(rect.y + (rect.h - h) / 2), w, h);
  }

  drawMuteChip(rect, muted, hover) {
    const ctx = this.ctx;
    this.buttonBox(rect.x, rect.y, rect.w, rect.h, { hover, active: !muted });
    drawText(ctx, muted ? 'MUDO' : 'SOM', rect.x + rect.w / 2, rect.y + 8, {
      scale: 1, color: muted ? '#a08e75' : COLORS.gold, align: 'center',
    });
    ctx.fillStyle = muted ? '#7a2f25' : '#4f9a3a';
    ctx.fillRect(rect.x + rect.w / 2 - 2, rect.y + 24, 4, 9);
  }

  // ------------------------------------------------------------------
  // JOGO / TABULEIRO
  // ------------------------------------------------------------------
  drawGame(game, now) {
    const ctx = this.ctx;
    ctx.drawImage(this.getGameScene(game), 0, 0);
    this.drawHud(game, now);

    const cache = this.getBoardCache(game);
    const { freeIds, ordered, geometry, breakingIds } = cache;
    this._freeIds = freeIds;
    this._geometry = geometry;

    ctx.save();
    this.clipBoard(ctx);
    ctx.drawImage(cache.canvas, this.boardInner.x, this.boardInner.y);

    for (const tile of ordered) {
      if (tile.removed || breakingIds.has(tile.id)) continue;
      const { x, y } = this.tileTopLeft(tile, geometry);
      const isFree = freeIds.has(tile.id);
      if (game.selectedTileId === tile.id) {
        this.drawFrame('frame_blue', x, y, 1);
      } else if (game.hoverTileId === tile.id && isFree) {
        this.drawFrame('frame_green', x, y, 1);
      }
      if (game.hintIds?.includes(tile.id)) {
        const pulse = 0.55 + 0.35 * (0.5 + 0.5 * Math.sin(now * 8));
        this.drawFrame('frame_yellow', x, y, pulse);
      }
    }

    for (const m of game.matches) {
      const a = game.board.tiles[m.aId];
      const b = game.board.tiles[m.bId];
      if (!a || !b) continue;
      const ta = this.tileTopLeft(a, geometry);
      const tb = this.tileTopLeft(b, geometry);
      const iconW = this.tileW * 0.7;
      const iconH = this.tileH * 0.43;
      if (now < m.breakStart) {
        this.drawIconCentered('icon_check_a', ta, iconW, iconH);
        this.drawIconCentered('icon_check_b', tb, iconW, iconH);
      } else {
        const frame = clamp(Math.floor((now - m.breakStart) / 0.08), 0, 3);
        const name = `break_${frame}`;
        this.drawEffectAt(name, ta, this.tileW * 1.45, this.tileH * 1.2);
        this.drawEffectAt(name, tb, this.tileW * 1.45, this.tileH * 1.2);
      }
    }

    for (const l of game.locks) {
      const tile = game.board.tiles[l.tileId];
      if (!tile) continue;
      const elapsed = now - l.start;
      if (elapsed < 0 || elapsed > 0.6) continue;
      const pos = this.tileTopLeft(tile, geometry);
      const shake = Math.sin(elapsed * 46) * 2;
      const iw = this.tileW * 0.55;
      const ih = this.tileH * 0.48;
      const icon = this.assets.scaled('icon_lock', iw, ih);
      ctx.globalAlpha = 1 - Math.max(0, (elapsed - 0.45) / 0.15);
      ctx.drawImage(icon, pos.x + this.tileW / 2 - iw / 2 + shake, pos.y - this.tileH * 0.27);
      ctx.globalAlpha = 1;
    }

    for (const e of game.errors) {
      const tile = game.board.tiles[e.tileId];
      if (!tile) continue;
      const elapsed = now - e.start;
      if (elapsed < 0 || elapsed > 0.42) continue;
      const pos = this.tileTopLeft(tile, geometry);
      const pop = Math.min(1, elapsed * 12);
      ctx.globalAlpha = 1 - Math.max(0, (elapsed - 0.28) / 0.14);
      const w = Math.round(this.tileW * 0.75 * pop);
      const h = Math.round(this.tileH * 0.5 * pop);
      const icon = this.assets.scaled(e.icon || 'icon_x_a', w, h);
      ctx.drawImage(icon, pos.x + this.tileW / 2 - w / 2, pos.y + this.tileH / 2 - h / 2);
      ctx.globalAlpha = 1;
    }

    if (game.hint && now < game.hint.end && game.hintIds?.length) {
      const tile = game.board.tiles[game.hintIds[0]];
      if (tile) {
        const pos = this.tileTopLeft(tile, geometry);
        const a = 0.6 + 0.25 * Math.sin(now * 7);
        ctx.globalAlpha = a;
        const size = Math.max(this.tileW, this.tileH) * 1.55;
        const icon = this.assets.scaled('hint_frame', size, size);
        ctx.drawImage(icon, pos.x + this.tileW / 2 - size / 2, pos.y + this.tileH / 2 - size / 2);
        ctx.globalAlpha = 1;
      }
    }

    this.drawParticles(game.particles, now);
    this.drawFloaters(game.floaters, now);
    ctx.restore();

    if (game.toast && now < game.toast.end) {
      const a = clamp((game.toast.end - now) / 0.3, 0, 1);
      ctx.globalAlpha = a;
      const tw = Math.min(this.view.w - 24, measureText(game.toast.text, 1) + 36);
      const y = this.view.h - this.view.safe.bottom - 42;
      this.panel((this.view.w - tw) / 2, y, tw, 28, {
        fill: 'rgba(24,17,14,0.95)', border: COLORS.goldDark,
      });
      drawText(ctx, game.toast.text, this.view.w / 2, y + 9, {
        scale: 1, color: COLORS.cream, align: 'center',
      });
      ctx.globalAlpha = 1;
    }
  }

  getGameScene(game) {
    this.ensureBoardGeometry(game.layout);
    const key = `${this.view.w}x${this.view.h}|${game.layout.id}|${this._geomKey}`;
    if (this.gameScene && this.gameSceneKey === key) return this.gameScene;
    const c = document.createElement('canvas');
    c.width = this.view.w;
    c.height = this.view.h;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(this.makeBackground(), 0, 0);
    g.fillStyle = 'rgba(8, 7, 6, 0.22)';
    g.fillRect(0, 0, this.view.w, this.view.h);
    this.drawBoardFrame(g);
    this.gameScene = c;
    this.gameSceneKey = key;
    return c;
  }

  drawBoardFrame(target) {
    const ctx = target || this.ctx;
    const f = this.boardOuter;
    const inner = this.boardInner;
    if (f.w < 2 || f.h < 2) return;

    // sombra
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.fillRect(f.x + 3, f.y + 4, f.w, f.h);

    // madeira
    ctx.fillStyle = '#4b2e1a';
    ctx.fillRect(f.x, f.y, f.w, f.h);
    ctx.fillStyle = 'rgba(112, 68, 35, 0.55)';
    for (let y = f.y + 4; y < f.y + f.h; y += 7) {
      ctx.fillRect(f.x + 3, y, f.w - 6, 1);
    }
    ctx.fillStyle = 'rgba(24, 13, 7, 0.30)';
    for (let x = f.x + 10; x < f.x + f.w; x += 21) {
      ctx.fillRect(x, f.y + 3, 1, f.h - 6);
    }

    // feltro
    ctx.fillStyle = COLORS.feltDark;
    ctx.fillRect(inner.x, inner.y, inner.w, inner.h);
    ctx.fillStyle = COLORS.felt;
    ctx.fillRect(inner.x + 3, inner.y + 3, Math.max(1, inner.w - 6), Math.max(1, inner.h - 6));
    ctx.fillStyle = 'rgba(255,255,255,0.025)';
    for (let y = inner.y + 6; y < inner.y + inner.h - 6; y += 8) {
      for (let x = inner.x + 6 + ((y / 8) % 2 ? 4 : 0); x < inner.x + inner.w - 6; x += 8) {
        ctx.fillRect(x, y, 1, 1);
      }
    }
    ctx.strokeStyle = '#123b27';
    ctx.lineWidth = 2;
    ctx.strokeRect(inner.x + 1, inner.y + 1, Math.max(1, inner.w - 2), Math.max(1, inner.h - 2));
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.strokeRect(inner.x + 3.5, inner.y + 3.5, Math.max(1, inner.w - 7), Math.max(1, inner.h - 7));

    // pequenos pregos nos cantos
    ctx.fillStyle = '#c08a45';
    const stud = Math.max(2, Math.min(4, f.w * 0.015));
    for (const [x, y] of [[f.x + 5, f.y + 5], [f.x + f.w - 5 - stud, f.y + 5],
      [f.x + 5, f.y + f.h - 5 - stud], [f.x + f.w - 5 - stud, f.y + f.h - 5 - stud]]) {
      ctx.fillRect(x, y, stud, stud);
    }
  }

  getLayoutBounds(layout) {
    if (this.boundsCache.has(layout.id)) return this.boundsCache.get(layout.id);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const t of layout.tiles) {
      const cx = t.x * REF.halfW + t.z * REF.zDx;
      const cy = t.y * REF.halfH + t.z * REF.zDy;
      minX = Math.min(minX, cx - REF.w / 2);
      maxX = Math.max(maxX, cx + REF.w / 2);
      minY = Math.min(minY, cy - REF.h / 2);
      maxY = Math.max(maxY, cy + REF.h / 2);
    }
    const bounds = { minX, minY, w: maxX - minX, h: maxY - minY };
    this.boundsCache.set(layout.id, bounds);
    return bounds;
  }

  ensureBoardGeometry(layout) {
    const area = this.ui.boardArea;
    const key = `${layout.id}|${area.x}|${area.y}|${area.w}|${area.h}|${this.ui.mode}`;
    if (this._geomKey === key) return;
    const bounds = this.getLayoutBounds(layout);
    const pad = Math.max(4, Math.min(14, Math.min(area.w, area.h) * 0.015));
    const availW = Math.max(40, area.w - pad * 2);
    const availH = Math.max(40, area.h - pad * 2);
    const scale = Math.max(0.2, Math.min(availW / bounds.w, availH / bounds.h));
    const tileW = REF.w * scale;
    const tileH = REF.h * scale;
    const framePad = clamp(tileW * 0.16, 4, 14);
    const outerW = bounds.w * scale + framePad * 2;
    const outerH = bounds.h * scale + framePad * 2;
    const outerX = area.x + (area.w - outerW) / 2;
    const outerY = area.y + (area.h - outerH) / 2;

    this.tileScale = scale;
    this.tileW = tileW;
    this.tileH = tileH;
    this.halfW = REF.halfW * scale;
    this.halfH = REF.halfH * scale;
    this.zDx = REF.zDx * scale;
    this.zDy = REF.zDy * scale;
    this.boardOuter = {
      x: Math.round(outerX * 2) / 2,
      y: Math.round(outerY * 2) / 2,
      w: Math.round(outerW * 2) / 2,
      h: Math.round(outerH * 2) / 2,
    };
    this.boardInner = {
      x: this.boardOuter.x + framePad,
      y: this.boardOuter.y + framePad,
      w: bounds.w * scale,
      h: bounds.h * scale,
    };
    this._geomKey = key;
    this.geometry.clear();
    this.boardCache = null;
    this.gameScene = null;
    this.gameSceneKey = '';
    this.frameCache.clear();
  }

  clipBoard(ctx) {
    ctx.beginPath();
    ctx.rect(
      this.boardInner.x + 2, this.boardInner.y + 2,
      Math.max(1, this.boardInner.w - 4), Math.max(1, this.boardInner.h - 4),
    );
    ctx.clip();
  }

  orderedTiles(game) {
    return game.board.tiles
      .filter((t) => !t.removed)
      .slice()
      .sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x);
  }

  getBoardCache(game) {
    this.ensureBoardGeometry(game.layout);
    const key = `${game.layout.id}|${game.boardRevision}|${this._geomKey}`;
    if (this.boardCache && this.boardCache.key === key) return this.boardCache;
    const geometry = this.getGeometry(game.layout);
    const free = freeTiles(game.board.tiles);
    const freeIds = new Set(free.map((t) => t.id));
    const breakingIds = new Set();
    for (const m of game.matches) {
      breakingIds.add(m.aId);
      breakingIds.add(m.bId);
    }
    const ordered = this.orderedTiles(game);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(this.boardInner.w));
    canvas.height = Math.max(1, Math.ceil(this.boardInner.h));
    const g = canvas.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.save();
    g.translate(-this.boardInner.x, -this.boardInner.y);
    g.beginPath();
    g.rect(
      this.boardInner.x + 2, this.boardInner.y + 2,
      Math.max(1, this.boardInner.w - 4), Math.max(1, this.boardInner.h - 4),
    );
    g.clip();
    const shadow = Math.max(1, this.tileW * 0.07);
    for (const tile of ordered) {
      if (breakingIds.has(tile.id)) continue;
      const { x, y } = this.tileTopLeft(tile, geometry);
      const isFree = freeIds.has(tile.id);
      g.fillStyle = 'rgba(0,0,0,0.26)';
      g.fillRect(x + shadow, y + shadow + 1, this.tileW, this.tileH);
      g.drawImage(this.assets.tileSized(tile.type, !isFree, this.tileW, this.tileH), x, y);
    }
    g.restore();
    this.boardCache = { key, canvas, freeIds, ordered, geometry, breakingIds };
    return this.boardCache;
  }

  getGeometry(layout) {
    this.ensureBoardGeometry(layout);
    if (this.geometry.has(layout.id)) return this.geometry.get(layout.id);
    const b = this.getLayoutBounds(layout);
    const geo = {
      ox: this.boardInner.x - b.minX * this.tileScale,
      oy: this.boardInner.y - b.minY * this.tileScale,
    };
    this.geometry.set(layout.id, geo);
    return geo;
  }

  tileTopLeft(tile, geo) {
    const cx = geo.ox + tile.x * this.halfW + tile.z * this.zDx;
    const cy = geo.oy + tile.y * this.halfH + tile.z * this.zDy;
    return { x: Math.round(cx - this.tileW / 2), y: Math.round(cy - this.tileH / 2) };
  }

  tileAt(game, x, y) {
    const geo = this.getGeometry(game.layout);
    const ordered = this.orderedTiles(game);
    const breaking = new Set();
    for (const m of game.matches) { breaking.add(m.aId); breaking.add(m.bId); }
    for (let i = ordered.length - 1; i >= 0; i--) {
      const t = ordered[i];
      if (t.removed || breaking.has(t.id)) continue;
      const pos = this.tileTopLeft(t, geo);
      if (x >= pos.x && x <= pos.x + this.tileW && y >= pos.y && y <= pos.y + this.tileH) return t;
    }
    return null;
  }

  drawFrame(name, x, y, alpha = 1) {
    const ctx = this.ctx;
    const key = `${name}|${Math.round(this.tileW)}x${Math.round(this.tileH)}`;
    let img = this.frameCache.get(key);
    if (!img) {
      img = this.assets.scaled(name, this.tileW + 10, this.tileH + 10);
      this.frameCache.set(key, img);
    }
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, x - 5, y - 5);
    ctx.globalAlpha = 1;
  }

  drawIconCentered(name, pos, w, h) {
    const ctx = this.ctx;
    const img = this.assets.scaled(name, w, h);
    ctx.drawImage(img, pos.x + (this.tileW - w) / 2, pos.y + (this.tileH - h) / 2);
  }

  drawEffectAt(name, pos, w, h) {
    const ctx = this.ctx;
    const img = this.assets.scaled(name, w, h);
    ctx.drawImage(img, pos.x + (this.tileW - w) / 2, pos.y + (this.tileH - h) / 2);
  }

  drawParticles(particles, now) {
    if (!particles?.length) return;
    const ctx = this.ctx;
    for (const p of particles) {
      const life = p.life ?? 0;
      const maxLife = p.maxLife ?? 1;
      if (life <= 0) continue;
      const k = clamp(life / maxLife, 0, 1);
      const w = Math.max(4, Math.round(p.size * (0.7 + (1 - k) * 0.4)));
      const h = Math.round(w * 1.05);
      const img = this.assets.scaled(p.sprite, w, h);
      ctx.globalAlpha = clamp(k * 1.4, 0, 1);
      ctx.drawImage(img, Math.round(p.x - w / 2), Math.round(p.y - h / 2));
    }
    ctx.globalAlpha = 1;
  }

  drawFloaters(floaters, now) {
    if (!floaters?.length) return;
    const ctx = this.ctx;
    for (const f of floaters) {
      const t = (now - f.start) / f.duration;
      if (t < 0 || t > 1) continue;
      const a = t < 0.15 ? t / 0.15 : 1 - Math.max(0, (t - 0.65) / 0.35);
      ctx.globalAlpha = clamp(a, 0, 1);
      drawText(ctx, f.text, f.x, f.y - t * 24, {
        scale: f.scale || 1, color: f.color || COLORS.gold, align: 'center',
        shadow: '#160d08',
      });
    }
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------------
  // HUD
  // ------------------------------------------------------------------
  drawHud(game, now) {
    const ui = this.ui;
    if (ui.mode === 'collapsed') {
      this.drawReopenButton(ui.reopen, game);
      return;
    }
    if (ui.mode === 'portrait') {
      this.drawPortraitBar(game, now);
      return;
    }
    this.drawPanelHud(game, now, ui.mode === 'compact');
  }

  drawPanelHud(game, now, compact) {
    const ctx = this.ctx;
    const ui = this.ui;
    const hud = ui.hud;
    ctx.fillStyle = 'rgba(25, 18, 15, 0.92)';
    ctx.fillRect(hud.x, hud.y, hud.w, hud.h);
    this.panel(hud.x, hud.y, hud.w, hud.h, {
      fill: 'rgba(0,0,0,0)', border: '#6f4a29', thickness: 2,
    });

    if (compact) {
      drawText(ctx, 'MAHJONG', hud.x + 7, hud.y + 8, {
        scale: 1, color: COLORS.gold,
      });
      this.drawChevron(ui.toggle, '<', game.hover?.type === 'toggle-hud');
    } else {
      drawText(ctx, 'MAHJONG', hud.x + hud.w / 2, hud.y + 9, {
        scale: 2, color: COLORS.gold, align: 'center', shadow: '#150d09',
      });
    }

    const pairsLeft = Math.ceil((game.board?.remaining ?? 0) / 2);
    for (const counter of ui.counters) {
      this.drawCounter(counter, game, counter.kind === 'score' ? game.score : pairsLeft, compact);
    }

    for (const b of ui.buttons) {
      this.drawHudButton(b, game, now, compact);
    }

    if (game.timedMode && ui.timerBar) {
      this.drawTimerBar(ui.timerBar, game);
    }

    if (!compact && ui.status) {
      this.drawStatus(ui.status, game, now);
      this.drawMuteChip(ui.mute, game.audioMuted, game.hover?.type === 'mute');
    }
    if (compact) {
      drawText(ctx, game.timedMode ? fmtTime(game.timeLeft) : 'MODO LIVRE', hud.x + 7, hud.y + hud.h - 30, {
        scale: 1, color: game.pausedByFocus || game.modal ? COLORS.gold : '#9c896f',
      });
      if (game.modal) {
        drawText(ctx, 'PAUSADO', hud.x + hud.w - 7, hud.y + hud.h - 30, {
          scale: 1, color: COLORS.gold, align: 'right',
        });
      }
    }
  }

  drawPortraitBar(game, now) {
    const ctx = this.ctx;
    const ui = this.ui;
    const bar = ui.bar;
    ctx.fillStyle = 'rgba(25, 18, 15, 0.94)';
    ctx.fillRect(bar.x, bar.y, bar.w, bar.h);
    this.panel(bar.x, bar.y, bar.w, bar.h, {
      fill: 'rgba(0,0,0,0)', border: '#6f4a29', thickness: 2,
    });

    const pairsLeft = Math.ceil((game.board?.remaining ?? 0) / 2);
    for (const counter of ui.counters) {
      this.drawCounter(counter, game, counter.kind === 'score' ? game.score : pairsLeft, true);
    }
    for (const b of ui.buttons) {
      this.drawHudButton(b, game, now, true);
    }

    if (game.timedMode && ui.timerBar) {
      this.drawTimerBar(ui.timerBar, game);
      drawText(ctx, fmtTime(game.timeLeft), 7, bar.h - 16, {
        scale: 1, color: game.timeLeft <= 10 ? COLORS.red : '#9c896f',
      });
    } else {
      drawText(ctx, 'MODO LIVRE', 7, bar.h - 16, {
        scale: 1, color: '#77664f',
      });
    }
    if (game.modal) {
      drawText(ctx, 'PAUSADO', bar.w - 7, bar.h - 16, {
        scale: 1, color: COLORS.gold, align: 'right',
      });
    }
  }

  drawReopenButton(rect, game) {
    if (!rect) return;
    this.buttonBox(rect.x, rect.y, rect.w, rect.h, {
      hover: game.hover?.type === 'reopen-hud', active: true,
    });
    this.drawChevron(rect, '>', false);
  }

  drawChevron(rect, char, hover) {
    if (!rect) return;
    const ctx = this.ctx;
    this.buttonBox(rect.x, rect.y, rect.w, rect.h, { hover, active: true });
    drawText(ctx, char, rect.x + rect.w / 2, rect.y + Math.round((rect.h - 14) / 2), {
      scale: 2, color: COLORS.gold, align: 'center',
    });
  }

  drawCounter(rect, game, value, compact) {
    const ctx = this.ctx;
    const isScore = rect.kind === 'score';
    this.panel(rect.x, rect.y, rect.w, rect.h, {
      fill: 'rgba(22,16,13,0.90)', border: '#6f4a29', thickness: 1,
    });
    const label = isScore ? 'PTS' : 'PARES';
    if (compact) {
      const iconName = isScore ? 'fx_stars_a' : 'tile_dragon_green';
      const img = this.assets.original(iconName);
      const maxIcon = Math.min(rect.h - 12, rect.w > 80 ? 26 : 18);
      const ratio = Math.min(maxIcon / img.width, maxIcon / img.height);
      const iw = Math.max(7, Math.round(img.width * ratio));
      const ih = Math.max(7, Math.round(img.height * ratio));
      ctx.drawImage(img, rect.x + 4, Math.round(rect.y + (rect.h - ih) / 2), iw, ih);
      const text = String(value);
      const maxW = Math.max(10, rect.w - iw - 14);
      let valueScale = rect.w > 80 ? 3 : 2;
      while (valueScale > 1 && measureText(text, valueScale) > maxW) valueScale -= 1;
      drawText(ctx, text, rect.x + rect.w - 5,
        rect.y + Math.round((rect.h - 10 * valueScale) / 2), {
          scale: valueScale, color: isScore ? COLORS.gold : COLORS.cream, align: 'right',
          shadow: '#1b1210',
        });
      return;
    }

    drawText(ctx, label, rect.x + 8, rect.y + 6, {
      scale: 1, color: '#b9a88e',
    });
    drawText(ctx, String(value), rect.x + 8, rect.y + 20, {
      scale: 3, color: isScore ? COLORS.gold : COLORS.cream, shadow: '#1b1210',
    });
  }

  drawHudButton(rect, game, now, iconOnly) {
    const ctx = this.ctx;
    const disabled = (rect.id === 'undo' && game.undoStack.length === 0) ||
      (rect.id === 'shuffle' && game.shufflesLeft <= 0);
    const hover = game.hover && game.hover.type === 'hud' && game.hover.id === rect.id;
    const active = game.hintIds?.length && rect.id === 'hint';
    this.buttonBox(rect.x, rect.y, rect.w, rect.h, {
      hover, active, disabled, small: true,
    });
    ctx.globalAlpha = disabled ? 0.38 : 1;
    let iconName = rect.icon;
    if (rect.id === 'shuffle') iconName = game.shufflesLeft ? 'arrow_purple_right' : 'arrow_blue_down';
    const icon = this.assets.original(iconName);
    if (iconOnly) {
      const avail = Math.min(rect.w, rect.h) * 0.58;
      const ratio = Math.min(avail / icon.width, avail / icon.height);
      const iw = Math.max(8, Math.round(icon.width * ratio));
      const ih = Math.max(8, Math.round(icon.height * ratio));
      ctx.drawImage(icon,
        Math.round(rect.x + (rect.w - iw) / 2),
        Math.round(rect.y + (rect.h - ih) / 2 - 2), iw, ih);
      let badge = null;
      if (rect.id === 'shuffle') badge = `${game.shufflesLeft}`;
      if (rect.id === 'undo' && game.undoStack.length) badge = `${game.undoStack.length}`;
      if (badge) {
        drawText(ctx, badge, rect.x + rect.w - 3, rect.y + rect.h - 13, {
          scale: 1, color: COLORS.gold, align: 'right', shadow: '#1b100b',
        });
      }
    } else {
      const availW = 30;
      const availH = 30;
      const ratio = Math.min(availW / icon.width, availH / icon.height);
      const iw = Math.max(8, Math.round(icon.width * ratio));
      const ih = Math.max(8, Math.round(icon.height * ratio));
      ctx.drawImage(icon, rect.x + 7 + Math.floor((availW - iw) / 2),
        rect.y + 9 + Math.floor((availH - ih) / 2), iw, ih);
      drawText(ctx, rect.label, rect.x + 42, rect.y + 10, {
        scale: 1, color: COLORS.cream,
      });
      let sub = rect.sub;
      if (rect.id === 'shuffle') sub = `${game.shufflesLeft}/${game.shuffleLimit}`;
      if (rect.id === 'undo') sub = `${game.undoStack.length}`;
      if (sub) {
        drawText(ctx, sub, rect.x + 42, rect.y + 26, {
          scale: 1, color: COLORS.gold,
        });
      }
    }
    ctx.globalAlpha = 1;
  }

  drawStatus(st, game, now) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(16, 12, 10, 0.72)';
    ctx.fillRect(st.x, st.y, st.w, st.h);
    ctx.strokeStyle = 'rgba(140,90,43,0.65)';
    ctx.strokeRect(st.x + 0.5, st.y + 0.5, st.w - 1, st.h - 1);

    let y = st.y + 8;
    const line = 14;
    drawText(ctx, game.layout.name, st.x + 8, y, { scale: 1, color: COLORS.gold });
    if (game.pausedByFocus || game.modal) {
      drawText(ctx, 'PAUSADO', st.x + st.w - 8, y, {
        scale: 1, color: COLORS.gold, align: 'right',
      });
    }
    y += line;
    drawText(ctx, `SEMENTE ${game.board.seed}`, st.x + 8, y, { scale: 1, color: '#b5a086' });
    y += line;
    drawText(ctx, `COMBO X${Math.max(1, game.combo)}`, st.x + 8, y, {
      scale: 1, color: game.combo > 1 ? COLORS.green : '#8f7c63',
    });
    y += line;
    drawText(ctx, `EMBARALHAR ${game.shufflesLeft}/${game.shuffleLimit}`, st.x + 8, y, {
      scale: 1, color: game.shufflesLeft ? '#d7c29d' : '#8a5d4d',
    });
    y += line + 4;
    drawText(ctx, game.timedMode ? 'TEMPO' : 'MODO', st.x + 8, y, {
      scale: 1, color: '#9c896f',
    });
    y += line;
    drawText(ctx, game.timedMode ? fmtTime(game.timeLeft) : 'LIVRE', st.x + 8, y, {
      scale: 2, color: game.timedMode && game.timeLeft <= 10 ? COLORS.red : COLORS.cream,
    });
    if (game.timedMode && game.timeLeft <= 10) {
      const bell = this.assets.scaled('ui_bell', 28, 22);
      const shake = Math.sin(now * 28) * 3;
      ctx.drawImage(bell, st.x + st.w - 38 + shake, y);
    }
    y += 26;
    const freePairs = game.board ? findFreePairs(game.board.tiles).length : 0;
    drawText(ctx, `PARES LIVRES ${freePairs}`, st.x + 8, y, {
      scale: 1, color: '#bda98e',
    });
    y += line;
    if (st.h > 150) {
      drawText(ctx, 'DICA CUSTA 50 PTS', st.x + 8, y, { scale: 1, color: '#77664f' });
      y += line;
      drawText(ctx, 'ATALHOS: H DICA • U DESFAZER', st.x + 8, y, {
        scale: 1, color: '#5e5140',
      });
      y += line;
      drawText(ctx, 'R NOVO • M SOM', st.x + 8, y, { scale: 1, color: '#5e5140' });
    }
  }

  drawTimerBar(bar, game) {
    const ctx = this.ctx;
    if (!bar) return;
    ctx.fillStyle = '#120d0a';
    ctx.fillRect(bar.x, bar.y, bar.w, bar.h);
    ctx.strokeStyle = '#70502d';
    ctx.strokeRect(bar.x + 0.5, bar.y + 0.5, bar.w - 1, bar.h - 1);
    const frac = game.timeLimit > 0 ? clamp(game.timeLeft / game.timeLimit, 0, 1) : 0;
    if (frac > 0.001) {
      ctx.fillStyle = frac <= 0.15 ? COLORS.red : COLORS.gold;
      ctx.fillRect(bar.x + 1, bar.y + 1, Math.max(1, (bar.w - 2) * frac), Math.max(1, bar.h - 2));
    }
  }

  // ------------------------------------------------------------------
  // Caixas/painéis
  // ------------------------------------------------------------------
  panel(x, y, w, h, opt = {}) {
    const ctx = this.ctx;
    const fill = opt.fill ?? 'rgba(28,20,17,0.94)';
    const border = opt.border ?? '#8c5a2b';
    const thickness = opt.thickness ?? 2;
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = border;
    ctx.fillRect(x, y, w, thickness);
    ctx.fillRect(x, y + h - thickness, w, thickness);
    ctx.fillRect(x, y, thickness, h);
    ctx.fillRect(x + w - thickness, y, thickness, h);
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fillRect(x + thickness, y + thickness, w - thickness * 2, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.24)';
    ctx.fillRect(x + thickness, y + h - thickness - 1, w - thickness * 2, 1);
  }

  buttonBox(x, y, w, h, opt = {}) {
    const ctx = this.ctx;
    const disabled = Boolean(opt.disabled);
    const hover = Boolean(opt.hover);
    const active = Boolean(opt.active);
    ctx.fillStyle = disabled ? '#201b18' : (hover ? '#413327' : '#2c231e');
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = disabled ? '#332a23' : (active ? COLORS.goldDark : '#5b3d25');
    ctx.fillRect(x, y, w, 2);
    ctx.fillRect(x, y + h - 2, w, 2);
    ctx.fillRect(x, y, 2, h);
    ctx.fillRect(x + w - 2, y, 2, h);
    ctx.fillStyle = hover && !disabled ? COLORS.gold : (active ? COLORS.gold : '#765335');
    ctx.fillRect(x + 2, y + 2, w - 4, 1);
    if (opt.small) {
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(x + 4, y + 4, w - 8, h - 8);
    }
  }

  // ------------------------------------------------------------------
  // Modais e telas finais
  // ------------------------------------------------------------------
  drawModal(game, now) {
    const ctx = this.ctx;
    const { w, h } = this.view;
    ctx.fillStyle = 'rgba(4, 3, 2, 0.74)';
    ctx.fillRect(0, 0, w, h);

    const layout = getModalLayout(this.view, game.modal.kind);
    this.modalLayout = layout;
    const p = layout.panel;
    this.panel(p.x, p.y, p.w, p.h, { fill: 'rgba(34,24,20,0.98)', border: COLORS.gold });
    const center = p.x + p.w / 2;

    let title = 'SAIR DO JOGO?';
    let lines = [];
    if (game.modal.kind === 'confirm-menu') {
      title = 'VOLTAR AO MENU?';
      lines = ['O PROGRESSO DESTA PARTIDA SERÁ PERDIDO.', 'TEM CERTEZA?'];
    } else if (game.modal.kind === 'confirm-exit') {
      title = 'SAIR DO JOGO?';
      lines = [
        'VOCÊ ESTÁ JOGANDO.',
        game.timedMode ? 'O TEMPO FICA PAUSADO NESTE DIÁLOGO.' : 'ESCOLHA UMA DAS OPÇÕES ABAIXO.',
      ];
    } else if (game.modal.kind === 'confirm-exit-app') {
      title = 'FECHAR O JOGO?';
      lines = ['O APLICATIVO SERÁ ENCERRADO.', 'NO NAVEGADOR, A ABA PODE SER FECHADA.'];
    } else if (game.modal.kind === 'no-moves') {
      title = 'SEM JOGADAS!';
      lines = [
        'NÃO HÁ PARES LIVRES NO TABULEIRO.',
        'EMBARALHE AS PEÇAS RESTANTES PARA CONTINUAR.',
        `EMBARALHAMENTOS RESTANTES: ${game.shufflesLeft}`,
        'OU VOLTE AO MENU.',
      ];
    }

    let titleScale = layout.titleScale;
    if (measureText(title, titleScale) > p.w - 32) titleScale = Math.max(1, titleScale - 1);
    drawText(ctx, title, center, layout.titleY, {
      scale: titleScale, color: COLORS.cream, align: 'center', shadow: '#170d09',
    });
    lines.forEach((text, i) => {
      drawText(ctx, text, center, layout.bodyY + i * 16, {
        scale: 1,
        color: i === lines.length - 1 && game.modal.kind === 'no-moves' ? COLORS.gold : '#bda98e',
        align: 'center',
      });
    });

    for (const button of layout.buttons) {
      const accent = button.id === 'resume'
        ? COLORS.green
        : button.id === 'exit'
          ? COLORS.red
          : button.id === 'menu'
            ? COLORS.gold
            : '#ba9a72';
      this.buttonBox(button.x, button.y, button.w, button.h, { hover: false });
      let scale = 2;
      if (measureText(button.label, scale) > button.w - 16) scale = 1;
      drawText(ctx, button.label, button.x + button.w / 2, button.y + Math.round((button.h - 10 * scale) / 2), {
        scale, color: accent, align: 'center', shadow: '#1b100b',
      });
    }
  }

  drawEnd(game, now) {
    const ctx = this.ctx;
    const end = game.end;
    const { w, h } = this.view;
    const layout = getEndLayout(this.view);
    this.endLayout = layout;

    ctx.fillStyle = 'rgba(4, 3, 2, 0.70)';
    ctx.fillRect(0, 0, w, h);
    this.drawParticles(game.particles, now);
    this.drawFloaters(game.floaters, now);

    const p = layout.panel;
    this.panel(p.x, p.y, p.w, p.h, { fill: 'rgba(30,21,17,0.98)', border: COLORS.gold });
    const cx = p.x + p.w / 2;
    const victory = end.victory;
    const titleScale = p.w < 380 ? 4 : 5;
    drawText(ctx, victory ? 'VITÓRIA!' : 'DERROTA', cx, layout.titleY, {
      scale: titleScale, color: victory ? COLORS.gold : COLORS.red, align: 'center', shadow: '#190d08',
    });
    drawText(ctx, victory ? 'TABULEIRO LIMPO!' : (end.reason || 'FIM DE JOGO'), cx, layout.statY, {
      scale: 1, color: victory ? COLORS.green : '#cfae9e', align: 'center',
    });
    drawText(ctx, `PONTUAÇÃO ${game.score}`, cx, layout.statY + 24, {
      scale: 2, color: COLORS.cream, align: 'center',
    });
    drawText(ctx, `TEMPO ${fmtTime(game.elapsed)}${end.timeBonus ? `  +${end.timeBonus} BÔNUS` : ''}`,
      cx, layout.statY + 54, { scale: 1, color: COLORS.gold, align: 'center' });
    drawText(ctx, `${game.layout.name}  •  ${end.pairs} PARES  •  ${end.hints} DICAS`,
      cx, layout.statY + 72, { scale: 1, color: '#b9a88e', align: 'center' });
    drawText(ctx, victory ? 'CHUVA DE ESTRELAS!' : 'TENTE NOVAMENTE!', cx, layout.statY + 96, {
      scale: 1, color: victory ? COLORS.gold : '#9f8c75', align: 'center',
    });

    const buttons = [
      { rect: layout.again, label: 'JOGAR DE NOVO', accent: COLORS.green },
      { rect: layout.menu, label: 'MENU', accent: COLORS.gold },
    ];
    for (const b of buttons) {
      this.buttonBox(b.rect.x, b.rect.y, b.rect.w, b.rect.h, { hover: false });
      let scale = 2;
      if (measureText(b.label, scale) > b.rect.w - 14) scale = 1;
      drawText(ctx, b.label, b.rect.x + b.rect.w / 2, b.rect.y + Math.round((b.rect.h - 10 * scale) / 2), {
        scale, color: b.accent, align: 'center', shadow: '#1b100b',
      });
    }
  }
}
