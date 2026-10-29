/**
 * render.js — desenho em Canvas 2D.
 * Toda a cena é desenhada em coordenadas lógicas de 960x540; o canvas é
 * ampliado com escala inteira e image-rendering: pixelated.
 */

import {
  LOGICAL_W, LOGICAL_H, TILE_W, TILE_H, HALF_W, HALF_H, Z_DX, Z_DY,
  BOARD_FRAME, BOARD_INNER, HUD, COLORS, TIME_LIMITS,
} from './config.js';
import { LAYOUTS, LAYOUT_BY_ID } from './layouts.js';
import {
  MENU, MENU_LAYOUT_BUTTONS, HUD_LAYOUT, HUD_BUTTON_RECTS, MODAL, END, GOODBYE,
} from './ui.js';
import { drawText, measureText } from './font.js';
import { freeTiles, findFreePairs } from './rules.js';


const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmtTime = (s) => {
  s = Math.max(0, Math.ceil(s));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

function easeOut(t) { return 1 - (1 - t) * (1 - t); }

export class Renderer {
  constructor(canvas, assets) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.assets = assets;
    this.background = null;
    this.geometry = new Map();
    this.frameCache = new Map();
    this.boardCache = null;
    this.gameScene = null;
    this.pointer = { x: -1, y: -1 };
  }

  resize(w, h) {
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx = this.canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
  }

  makeBackground() {
    if (this.background) return this.background;
    const c = document.createElement('canvas');
    c.width = LOGICAL_W;
    c.height = LOGICAL_H;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(this.assets.original('ui_board'), 0, 0, LOGICAL_W, LOGICAL_H);
    // escurece e puxa para o verde profundo do feltro
    g.fillStyle = 'rgba(15, 26, 19, 0.44)';
    g.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
    g.fillStyle = 'rgba(236, 198, 115, 0.045)';
    for (let y = 0; y < LOGICAL_H; y += 8) {
      for (let x = (y / 8) % 2 ? 4 : 0; x < LOGICAL_W; x += 8) g.fillRect(x, y, 1, 1);
    }
    this.background = c;
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
    } else if (game.screen === 'goodbye') {
      this.drawGoodbye(game, now);
    }
    if (game.modal) this.drawModal(game, now);
  }

  drawLoading(game) {
    const ctx = this.ctx;
    ctx.fillStyle = '#17110e';
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
    drawText(ctx, 'MAHJONG SOLITAIRE', 480, 218, {
      scale: 4, color: COLORS.gold, align: 'center', shadow: '#0b0705',
    });
    const dots = '.'.repeat((Math.floor(performance.now() / 350) % 4));
    drawText(ctx, `CARREGANDO${dots}`, 480, 290, {
      scale: 2, color: COLORS.cream, align: 'center',
    });
    drawText(ctx, game.loadingError || 'PREPARANDO AS PEÇAS', 480, 330, {
      scale: 1, color: game.loadingError ? COLORS.red : '#b9a486', align: 'center',
    });
  }

  // ------------------------------------------------------------------
  // MENU
  // ------------------------------------------------------------------
  drawMenu(game, now) {
    const ctx = this.ctx;
    ctx.drawImage(this.makeBackground(), 0, 0);
    ctx.fillStyle = 'rgba(9, 7, 6, 0.30)';
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

    // versos de peças flutuando nas laterais
    const backs = [
      { name: 'back_green', x: 28, y: 80, ph: 0.2, amp: 8 },
      { name: 'back_blue', x: 88, y: 272, ph: 1.8, amp: 6 },
      { name: 'back_red', x: 24, y: 382, ph: 3.1, amp: 5 },
      { name: 'back_red', x: 820, y: 88, ph: 2.4, amp: 7 },
      { name: 'back_green', x: 866, y: 292, ph: 0.9, amp: 6 },
      { name: 'back_blue', x: 796, y: 390, ph: 4.2, amp: 5 },
    ];
    for (const b of backs) {
      const img = this.assets.get(b.name);
      const float = Math.sin(now * 0.55 + b.ph) * b.amp;
      const x = Math.round(b.x + Math.sin(now * 0.3 + b.ph) * 2);
      const y = Math.round(b.y + float);
      ctx.globalAlpha = 0.9;
      ctx.drawImage(img, x, y);
      ctx.globalAlpha = 1;
    }
    ctx.globalAlpha = 1;

    // título
    drawText(ctx, 'MAHJONG', 480, MENU.title1Y, {
      scale: 6, color: COLORS.cream, align: 'center', shadow: '#3d2012',
    });
    drawText(ctx, 'SOLITAIRE', 480, MENU.title2Y, {
      scale: 3, color: COLORS.gold, align: 'center', shadow: '#3d2012',
    });

    const p = MENU.panel;
    this.panel(p.x, p.y, p.w, p.h, { fill: 'rgba(31, 22, 18, 0.94)', border: '#8c5a2b' });
    // ornamento dos cantos
    ctx.fillStyle = COLORS.gold;
    for (const [x, y] of [[p.x + 5, p.y + 5], [p.x + p.w - 8, p.y + 5],
      [p.x + 5, p.y + p.h - 8], [p.x + p.w - 8, p.y + p.h - 8]]) {
      ctx.fillRect(x, y, 3, 3);
    }

    drawText(ctx, 'ESCOLHA O TABULEIRO', 480, 132, {
      scale: 2, color: COLORS.gold, align: 'center',
    });

    for (const b of MENU_LAYOUT_BUTTONS) {
      const selected = game.selectedLayoutId === b.layout.id;
      const hover = game.hover && game.hover.type === 'layout' && game.hover.id === b.layout.id;
      if (selected || hover) {
        ctx.fillStyle = selected ? 'rgba(232,163,58,0.16)' : 'rgba(255,255,255,0.06)';
        ctx.fillRect(b.x - 5, b.y - 5, b.w + 10, b.h + 10);
        ctx.strokeStyle = selected ? COLORS.gold : '#9c7c55';
        ctx.lineWidth = 2;
        ctx.strokeRect(b.x - 4.5, b.y - 4.5, b.w + 9, b.h + 9);
      }
      const name = `ui_wind_mini_${b.layout.wind}`;
      ctx.drawImage(this.assets.scaled(name, b.w, b.h), b.x, b.y);
      drawText(ctx, b.layout.name, b.x + b.w / 2, MENU.windLabelsY, {
        scale: 1, color: selected ? COLORS.gold : '#c8b69a', align: 'center',
      });
    }

    const layout = LAYOUT_BY_ID[game.selectedLayoutId] || LAYOUTS[0];
    drawText(ctx, `${layout.difficulty.toUpperCase()}  •  ${layout.tileCount} PEÇAS  •  ${layout.pairCount} PARES`,
      480, MENU.descY, { scale: 1, color: COLORS.cream, align: 'center' });
    drawText(ctx, layout.blurb, 480, MENU.descY + 14, {
      scale: 1, color: '#b8a88e', align: 'center',
    });

    // toggle de modo cronometrado
    const t = MENU.toggle;
    this.buttonBox(t.x, t.y, t.w, t.h, { active: game.timedMode, hover: game.hover?.type === 'timed' });
    drawText(ctx, 'MODO CRONOMETRADO', t.x + 12, t.y + 11, {
      scale: 1, color: game.timedMode ? COLORS.gold : '#b9a78c',
    });
    const sw = { x: t.x + t.w - 56, y: t.y + 7, w: 44, h: 16 };
    ctx.fillStyle = '#17110e';
    ctx.fillRect(sw.x, sw.y, sw.w, sw.h);
    ctx.strokeStyle = game.timedMode ? COLORS.gold : '#665846';
    ctx.strokeRect(sw.x + 0.5, sw.y + 0.5, sw.w - 1, sw.h - 1);
    ctx.fillStyle = game.timedMode ? COLORS.gold : '#5e5243';
    ctx.fillRect(game.timedMode ? sw.x + 24 : sw.x + 4, sw.y + 4, 16, 8);

    // botões principais (usa os sprites da folha)
    this.drawSpriteButton('ui_btn_jogar', MENU.play, game.hover?.type === 'play', 2);
    this.drawSpriteButton('ui_btn_sair', MENU.exit, game.hover?.type === 'exit', 2);

    drawText(ctx, 'COMBINE PARES LIVRES PARA LIMPAR O TABULEIRO.', 480, MENU.helpY, {
      scale: 1, color: '#e3d1ae', align: 'center',
    });
    drawText(ctx, 'PEÇAS LIVRES NÃO TÊM NADA EM CIMA E UM LADO ABERTO.', 480, MENU.helpY + 15, {
      scale: 1, color: '#a9967d', align: 'center',
    });
    drawText(ctx, 'MOUSE OU TOQUE  •  ESCOLHA UMA DAS 4 MONTAGENS', 480, MENU.helpY + 38, {
      scale: 1, color: '#796a56', align: 'center',
    });

    this.muteButton(MENU.mute, game.audioMuted, game.hover?.type === 'mute');
  }

  drawSpriteButton(name, rect, hover, scale = 2) {
    const ctx = this.ctx;
    const img = this.assets.get(name);
    const w = Math.min(rect.w, img.width * scale);
    const h = Math.min(rect.h, img.height * scale);
    const x = rect.x + Math.floor((rect.w - w) / 2);
    const y = rect.y + Math.floor((rect.h - h) / 2);
    if (hover) {
      ctx.fillStyle = 'rgba(232,163,58,0.20)';
      ctx.fillRect(rect.x - 3, rect.y - 3, rect.w + 6, rect.h + 6);
    }
    ctx.drawImage(img, x, y, w, h);
  }

  muteButton(rect, muted, hover) {
    const ctx = this.ctx;
    this.buttonBox(rect.x, rect.y, rect.w, rect.h, { hover, active: !muted });
    drawText(ctx, muted ? 'SOM: MUDO' : 'SOM: LIGADO', rect.x + rect.w / 2, rect.y + 10, {
      scale: 1, color: muted ? '#a08e75' : COLORS.gold, align: 'center',
    });
    ctx.fillStyle = muted ? '#7a2f25' : '#4f9a3a';
    ctx.fillRect(rect.x + 7, rect.y + 10, 4, 10);
  }

  // ------------------------------------------------------------------
  // JOGO / TABULEIRO
  // ------------------------------------------------------------------
  drawGame(game, now) {
    const ctx = this.ctx;
    ctx.drawImage(this.getGameScene(), 0, 0);
    this.drawHud(game, now);

    const cache = this.getBoardCache(game);
    const { freeIds, ordered, geometry, breakingIds } = cache;
    this._freeIds = freeIds;
    this._geometry = geometry;

    ctx.save();
    this.clipBoard(ctx);
    // Camada base em cache: sombras e peças. Invalida quando o tabuleiro muda.
    ctx.drawImage(cache.canvas, BOARD_INNER.x, BOARD_INNER.y);

    // overlays de estado (por cima para não serem recortados pela pilha)
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

    // efeitos de quebra e checks
    for (const m of game.matches) {
      const a = game.board.tiles[m.aId];
      const b = game.board.tiles[m.bId];
      if (!a || !b) continue;
      const ta = this.tileTopLeft(a, geometry);
      const tb = this.tileTopLeft(b, geometry);
      if (now < m.breakStart) {
        this.drawIconCentered('icon_check_a', ta, 28, 24);
        this.drawIconCentered('icon_check_b', tb, 28, 24);
      } else {
        const frame = clamp(Math.floor((now - m.breakStart) / 0.08), 0, 3);
        const name = `break_${frame}`;
        this.drawEffectAt(name, ta, 58, 68);
        this.drawEffectAt(name, tb, 58, 68);
      }
    }

    // lock em peça bloqueada
    for (const l of game.locks) {
      const tile = game.board.tiles[l.tileId];
      if (!tile) continue;
      const elapsed = now - l.start;
      if (elapsed < 0 || elapsed > 0.6) continue;
      const pos = this.tileTopLeft(tile, geometry);
      const shake = Math.sin(elapsed * 46) * 2;
      const icon = this.assets.scaled('icon_lock', 22, 27);
      ctx.globalAlpha = 1 - Math.max(0, (elapsed - 0.45) / 0.15);
      ctx.drawImage(icon, pos.x + TILE_W / 2 - 11 + shake, pos.y - 15);
      ctx.globalAlpha = 1;
    }

    // X de par errado
    for (const e of game.errors) {
      const tile = game.board.tiles[e.tileId];
      if (!tile) continue;
      const elapsed = now - e.start;
      if (elapsed < 0 || elapsed > 0.42) continue;
      const pos = this.tileTopLeft(tile, geometry);
      const icon = this.assets.scaled(e.icon || 'icon_x_a', 30, 28);
      const pop = Math.min(1, elapsed * 12);
      ctx.globalAlpha = 1 - Math.max(0, (elapsed - 0.28) / 0.14);
      const w = Math.round(30 * pop);
      const h = Math.round(28 * pop);
      ctx.drawImage(icon, pos.x + TILE_W / 2 - w / 2, pos.y + TILE_H / 2 - h / 2, w, h);
      ctx.globalAlpha = 1;
    }

    // moldura "dica"
    if (game.hint && now < game.hint.end && game.hintIds?.length) {
      const tile = game.board.tiles[game.hintIds[0]];
      if (tile) {
        const pos = this.tileTopLeft(tile, geometry);
        const a = 0.6 + 0.25 * Math.sin(now * 7);
        ctx.globalAlpha = a;
        const icon = this.assets.scaled('hint_frame', 88, 88);
        ctx.drawImage(icon, pos.x + TILE_W / 2 - 44, pos.y + TILE_H / 2 - 44);
        ctx.globalAlpha = 1;
      }
    }

    this.drawParticles(game.particles, now);
    this.drawFloaters(game.floaters, now);
    ctx.restore();

    // toast de aviso
    if (game.toast && now < game.toast.end) {
      const a = clamp((game.toast.end - now) / 0.3, 0, 1);
      ctx.globalAlpha = a;
      const w = Math.min(520, measureText(game.toast.text, 1) + 36);
      this.panel((LOGICAL_W - w) / 2, 496, w, 28, {
        fill: 'rgba(24,17,14,0.95)', border: COLORS.goldDark,
      });
      drawText(ctx, game.toast.text, LOGICAL_W / 2, 505, {
        scale: 1, color: COLORS.cream, align: 'center',
      });
      ctx.globalAlpha = 1;
    }
  }

  getGameScene() {
    if (this.gameScene) return this.gameScene;
    const c = document.createElement('canvas');
    c.width = LOGICAL_W;
    c.height = LOGICAL_H;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(this.makeBackground(), 0, 0);
    g.fillStyle = 'rgba(8, 7, 6, 0.22)';
    g.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
    this.drawBoardFrame(g);
    this.gameScene = c;
    return c;
  }

  drawBoardFrame(target) {
    const ctx = target || this.ctx;
    const f = BOARD_FRAME;
    const inner = BOARD_INNER;
    // moldura de madeira em 9-slice
    ctx.fillStyle = '#4b2e1a';
    ctx.fillRect(f.x, f.y, f.w, f.h);
    // veios sutis na madeira da moldura
    ctx.fillStyle = 'rgba(112, 68, 35, 0.55)';
    for (let y = f.y + 4; y < f.y + f.h; y += 9) {
      ctx.fillRect(f.x + 4, y, f.w - 8, 1);
    }
    ctx.fillStyle = 'rgba(24, 13, 7, 0.30)';
    for (let x = f.x + 12; x < f.x + f.w; x += 23) {
      ctx.fillRect(x, f.y + 4, 1, f.h - 8);
    }
    // feltro
    ctx.fillStyle = COLORS.feltDark;
    ctx.fillRect(inner.x, inner.y, inner.w, inner.h);
    ctx.fillStyle = COLORS.felt;
    ctx.fillRect(inner.x + 4, inner.y + 4, inner.w - 8, inner.h - 8);
    // textura sutil
    ctx.fillStyle = 'rgba(255,255,255,0.025)';
    for (let y = inner.y + 8; y < inner.y + inner.h - 8; y += 8) {
      for (let x = inner.x + 8 + ((y / 8) % 2 ? 4 : 0); x < inner.x + inner.w - 8; x += 8) {
        ctx.fillRect(x, y, 1, 1);
      }
    }
    ctx.strokeStyle = '#123b27';
    ctx.lineWidth = 2;
    ctx.strokeRect(inner.x + 2, inner.y + 2, inner.w - 4, inner.h - 4);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.strokeRect(inner.x + 4.5, inner.y + 4.5, inner.w - 9, inner.h - 9);

    const a = this.assets;
    const tl = a.get('ui_wood_corner_tl');
    const tr = a.get('ui_wood_corner_tr');
    const bl = a.get('ui_wood_corner_bl');
    const br = a.get('ui_wood_corner_br');
    const et = a.get('ui_wood_edge_t');
    const eb = a.get('ui_wood_edge_b');
    const el = a.get('ui_wood_edge_l');
    const er = a.get('ui_wood_edge_r');
    const cw = Math.max(tl.width, tr.width);
    const ch = Math.max(tl.height, bl.height);
    // topo, base e laterais esticados
    ctx.drawImage(et, f.x + cw, f.y, f.w - cw * 2, et.height);
    ctx.drawImage(eb, f.x + cw, f.y + f.h - eb.height, f.w - cw * 2, eb.height);
    ctx.drawImage(el, f.x, f.y + ch, el.width, f.h - ch * 2);
    ctx.drawImage(er, f.x + f.w - er.width, f.y + ch, er.width, f.h - ch * 2);
    // cantos
    ctx.drawImage(tl, f.x, f.y);
    ctx.drawImage(tr, f.x + f.w - tr.width, f.y);
    ctx.drawImage(bl, f.x, f.y + f.h - bl.height);
    ctx.drawImage(br, f.x + f.w - br.width, f.y + f.h - br.height);
  }

  clipBoard(ctx) {
    ctx.beginPath();
    ctx.rect(BOARD_INNER.x + 3, BOARD_INNER.y + 3, BOARD_INNER.w - 6, BOARD_INNER.h - 6);
    ctx.clip();
  }

  orderedTiles(game) {
    return game.board.tiles
      .filter((t) => !t.removed)
      .slice()
      .sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x);
  }

  /**
   * Cache da camada de peças. Só é reconstruída quando boardRevision muda.
   * As molduras e efeitos continuam animando por cima a 60 fps.
   */
  getBoardCache(game) {
    const key = `${game.layout.id}|${game.boardRevision}`;
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
    canvas.width = BOARD_INNER.w;
    canvas.height = BOARD_INNER.h;
    const g = canvas.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.save();
    g.translate(-BOARD_INNER.x, -BOARD_INNER.y);
    g.beginPath();
    g.rect(BOARD_INNER.x + 3, BOARD_INNER.y + 3, BOARD_INNER.w - 6, BOARD_INNER.h - 6);
    g.clip();
    for (const tile of ordered) {
      if (breakingIds.has(tile.id)) continue;
      const { x, y } = this.tileTopLeft(tile, geometry);
      const isFree = freeIds.has(tile.id);
      g.fillStyle = 'rgba(0,0,0,0.26)';
      g.fillRect(x + 3, y + 4, TILE_W, TILE_H);
      g.drawImage(this.assets.tile(tile.type, !isFree), x, y);
    }
    g.restore();
    this.boardCache = { key, canvas, freeIds, ordered, geometry, breakingIds };
    return this.boardCache;
  }

  getGeometry(layout) {
    if (this.geometry.has(layout.id)) return this.geometry.get(layout.id);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const t of layout.tiles) {
      const cx = t.x * HALF_W + t.z * Z_DX;
      const cy = t.y * HALF_H + t.z * Z_DY;
      minX = Math.min(minX, cx - TILE_W / 2);
      maxX = Math.max(maxX, cx + TILE_W / 2);
      minY = Math.min(minY, cy - TILE_H / 2);
      maxY = Math.max(maxY, cy + TILE_H / 2);
    }
    const ox = Math.round(BOARD_INNER.x + (BOARD_INNER.w - (maxX - minX)) / 2 - minX);
    const oy = Math.round(BOARD_INNER.y + (BOARD_INNER.h - (maxY - minY)) / 2 - minY);
    const geo = { ox, oy };
    this.geometry.set(layout.id, geo);
    return geo;
  }

  tileTopLeft(tile, geo) {
    const cx = geo.ox + tile.x * HALF_W + tile.z * Z_DX;
    const cy = geo.oy + tile.y * HALF_H + tile.z * Z_DY;
    return { x: Math.round(cx - TILE_W / 2), y: Math.round(cy - TILE_H / 2) };
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
      if (x >= pos.x && x <= pos.x + TILE_W && y >= pos.y && y <= pos.y + TILE_H) return t;
    }
    return null;
  }

  drawFrame(name, x, y, alpha = 1) {
    const ctx = this.ctx;
    const key = `${name}|frame`;
    let img = this.frameCache.get(key);
    if (!img) {
      img = this.assets.scaled(name, TILE_W + 10, TILE_H + 10);
      this.frameCache.set(key, img);
    }
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, x - 5, y - 5);
    ctx.globalAlpha = 1;
  }

  drawIconCentered(name, pos, w, h) {
    const ctx = this.ctx;
    const img = this.assets.scaled(name, w, h);
    ctx.drawImage(img, pos.x + (TILE_W - w) / 2, pos.y + (TILE_H - h) / 2);
  }

  drawEffectAt(name, pos, w, h) {
    const ctx = this.ctx;
    const img = this.assets.scaled(name, w, h);
    ctx.drawImage(img, pos.x + (TILE_W - w) / 2, pos.y + (TILE_H - h) / 2);
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
    const ctx = this.ctx;
    const h = HUD;
    ctx.fillStyle = 'rgba(25, 18, 15, 0.90)';
    ctx.fillRect(h.x, h.y, h.w, h.h);
    this.panel(h.x, h.y, h.w, h.h, {
      fill: 'rgba(0,0,0,0)', border: '#6f4a29', thickness: 2,
    });
    drawText(ctx, 'MAHJONG', h.x + h.w / 2, h.y + 9, {
      scale: 2, color: COLORS.gold, align: 'center', shadow: '#150d09',
    });

    this.drawCounter(HUD_LAYOUT.counterA, 'PONTOS', game.score, COLORS.gold);
    this.drawCounter(HUD_LAYOUT.counterB, 'PARES', findFreePairs(game.board.tiles).length, COLORS.gold);

    for (const b of HUD_BUTTON_RECTS) {
      this.drawHudButton(b, game, now);
    }

    // barra vertical de tempo (somente no modo cronometrado)
    if (game.timedMode) {
      const bar = HUD_LAYOUT.timerBar;
      ctx.fillStyle = '#120d0a';
      ctx.fillRect(bar.x, bar.y, bar.w, bar.h);
      ctx.strokeStyle = '#70502d';
      ctx.strokeRect(bar.x + 0.5, bar.y + 0.5, bar.w - 1, bar.h - 1);
      const frac = game.timeLimit > 0 ? clamp(game.timeLeft / game.timeLimit, 0, 1) : 0;
      if (frac > 0.001) {
        const src = this.assets.original('ui_timebar');
        const sh = src.height;
        const dh = Math.max(2, Math.round(bar.h * frac));
        const dy = bar.y + bar.h - dh;
        const sy = sh * (1 - frac);
        ctx.save();
        ctx.beginPath();
        ctx.rect(bar.x + 2, dy, bar.w - 4, dh);
        ctx.clip();
        ctx.drawImage(src, 0, sy, src.width, sh - sy, bar.x + 2, dy, bar.w - 4, dh);
        ctx.restore();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      for (let i = 1; i < 4; i++) ctx.fillRect(bar.x + 2, bar.y + (bar.h / 4) * i, bar.w - 4, 1);
    }

    // painel de status
    const st = HUD_LAYOUT.status;
    ctx.fillStyle = 'rgba(16, 12, 10, 0.72)';
    ctx.fillRect(st.x, st.y, st.w, st.h);
    ctx.strokeStyle = 'rgba(140,90,43,0.65)';
    ctx.strokeRect(st.x + 0.5, st.y + 0.5, st.w - 1, st.h - 1);
    drawText(ctx, game.layout.name, st.x + 8, st.y + 8, {
      scale: 1, color: COLORS.gold,
    });
    drawText(ctx, `SEMENTE ${game.board.seed}`, st.x + 8, st.y + 23, {
      scale: 1, color: '#b5a086',
    });
    drawText(ctx, `COMBO X${Math.max(1, game.combo)}`, st.x + 8, st.y + 38, {
      scale: 1, color: game.combo > 1 ? COLORS.green : '#8f7c63',
    });
    drawText(ctx, `EMBARALHAR ${game.shufflesLeft}/${game.shuffleLimit}`, st.x + 8, st.y + 53, {
      scale: 1, color: game.shufflesLeft ? '#d7c29d' : '#8a5d4d',
    });
    const timeText = game.timedMode ? fmtTime(game.timeLeft) : 'LIVRE';
    drawText(ctx, game.timedMode ? 'TEMPO' : 'MODO', st.x + 8, st.y + 78, {
      scale: 1, color: '#9c896f',
    });
    drawText(ctx, timeText, st.x + 8, st.y + 91, {
      scale: 2, color: game.timedMode && game.timeLeft <= 10 ? COLORS.red : COLORS.cream,
    });
    if (game.timedMode && game.timeLeft <= 10) {
      const bell = this.assets.scaled('ui_bell', 28, 22);
      const shake = Math.sin(now * 28) * 3;
      ctx.drawImage(bell, st.x + st.w - 38 + shake, st.y + 86);
    }
    if (game.pausedByModal) {
      drawText(ctx, 'PAUSADO', st.x + st.w - 8, st.y + 8, {
        scale: 1, color: COLORS.gold, align: 'right',
      });
    }
    drawText(ctx, 'DICA CUSTA 50 PTS', st.x + 8, st.y + 121, {
      scale: 1, color: '#77664f',
    });
    drawText(ctx, 'ATALHOS: H DICA • U DESFAZER', st.x + 8, st.y + 136, {
      scale: 1, color: '#5e5140',
    });
    drawText(ctx, 'R NOVO • M SOM', st.x + 8, st.y + 149, {
      scale: 1, color: '#5e5140',
    });

    this.muteButton(HUD_LAYOUT.mute, game.audioMuted, game.hover?.type === 'mute');
    // pequeno aviso de vitória/derrota não aparece aqui
  }

  drawCounter(rect, label, value, color) {
    const ctx = this.ctx;
    const img = this.assets.scaled(label === 'PONTOS' ? 'ui_counter_a' : 'ui_counter_b',
      Math.round(rect.w * 0.94), rect.h);
    const x = rect.x + Math.floor((rect.w - img.width) / 2);
    ctx.drawImage(img, x, rect.y);
    // limpa o zero gravado no sprite e desenha o valor por código
    ctx.fillStyle = '#342a2c';
    ctx.fillRect(x + 5, rect.y + 5, img.width - 10, img.height - 10);
    drawText(ctx, label, x + 9, rect.y + 6, {
      scale: 1, color: '#b9a88e',
    });
    const txt = String(value);
    drawText(ctx, txt, x + 9, rect.y + 17, {
      scale: 3, color, shadow: '#1b1210',
    });
  }

  drawHudButton(rect, game, now) {
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
    const icon = this.assets.get(iconName);
    const availW = 30;
    const availH = 30;
    const ratio = Math.min(availW / icon.width, availH / icon.height);
    const iw = Math.max(8, Math.round(icon.width * ratio));
    const ih = Math.max(8, Math.round(icon.height * ratio));
    ctx.drawImage(icon, rect.x + 7 + Math.floor((availW - iw) / 2),
      rect.y + 11 + Math.floor((availH - ih) / 2), iw, ih);
    drawText(ctx, rect.label, rect.x + 42, rect.y + 12, {
      scale: 1, color: COLORS.cream,
    });
    let sub = rect.sub;
    if (rect.id === 'shuffle') sub = `${game.shufflesLeft}/${game.shuffleLimit}`;
    if (rect.id === 'undo') sub = `${game.undoStack.length}`;
    if (sub) {
      drawText(ctx, sub, rect.x + 42, rect.y + 28, {
        scale: 1, color: COLORS.gold,
      });
    }
    ctx.globalAlpha = 1;
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
    ctx.fillStyle = 'rgba(4, 3, 2, 0.72)';
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
    const p = MODAL.panel;
    this.panel(p.x, p.y, p.w, p.h, { fill: 'rgba(34,24,20,0.98)', border: COLORS.gold });
    const center = p.x + p.w / 2;
    if (game.modal.kind === 'confirm-menu') {
      drawText(ctx, 'VOLTAR AO MENU?', center, p.y + 28, {
        scale: 3, color: COLORS.cream, align: 'center', shadow: '#170d09',
      });
      drawText(ctx, 'O PROGRESSO DESTA PARTIDA SERÁ PERDIDO.', center, p.y + 96, {
        scale: 1, color: '#bda98e', align: 'center',
      });
      drawText(ctx, 'TEM CERTEZA?', center, p.y + 114, {
        scale: 2, color: COLORS.gold, align: 'center',
      });
      this.modalButton(MODAL.buttonA, 'SIM', { accent: COLORS.red });
      this.modalButton(MODAL.buttonB, 'NÃO', { accent: COLORS.green });
    } else if (game.modal.kind === 'no-moves') {
      drawText(ctx, 'SEM JOGADAS!', center, p.y + 26, {
        scale: 3, color: COLORS.gold, align: 'center', shadow: '#170d09',
      });
      drawText(ctx, 'NÃO HÁ PARES LIVRES NO TABULEIRO.', center, p.y + 88, {
        scale: 1, color: COLORS.cream, align: 'center',
      });
      drawText(ctx, 'EMBARALHE AS PEÇAS RESTANTES PARA CONTINUAR.', center, p.y + 106, {
        scale: 1, color: '#bda98e', align: 'center',
      });
      drawText(ctx, `EMBARALHAMENTOS RESTANTES: ${game.shufflesLeft}`, center, p.y + 132, {
        scale: 1, color: COLORS.gold, align: 'center',
      });
      this.modalButton(MODAL.buttonA, 'EMBARALHAR', { accent: COLORS.gold });
      this.modalButton(MODAL.buttonB, 'MENU', { accent: '#ba9a72' });
    }
  }

  modalButton(rect, label, opt = {}) {
    const ctx = this.ctx;
    this.buttonBox(rect.x, rect.y, rect.w, rect.h, { hover: false });
    drawText(ctx, label, rect.x + rect.w / 2, rect.y + 17, {
      scale: 2, color: opt.accent || COLORS.cream, align: 'center', shadow: '#1b100b',
    });
  }

  drawEnd(game, now) {
    const ctx = this.ctx;
    const end = game.end;
    ctx.fillStyle = 'rgba(4, 3, 2, 0.68)';
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
    this.drawParticles(game.particles, now);
    this.drawFloaters(game.floaters, now);

    const p = END.panel;
    this.panel(p.x, p.y, p.w, p.h, { fill: 'rgba(30,21,17,0.98)', border: COLORS.gold });
    const cx = p.x + p.w / 2;
    const victory = end.victory;
    drawText(ctx, victory ? 'VITÓRIA!' : 'DERROTA', cx, p.y + 34, {
      scale: 5, color: victory ? COLORS.gold : COLORS.red, align: 'center', shadow: '#190d08',
    });
    drawText(ctx, victory ? 'TABULEIRO LIMPO!' : (end.reason || 'FIM DE JOGO'), cx, p.y + 104, {
      scale: 1, color: victory ? COLORS.green : '#cfae9e', align: 'center',
    });
    drawText(ctx, `PONTUAÇÃO ${game.score}`, cx, p.y + 142, {
      scale: 2, color: COLORS.cream, align: 'center',
    });
    drawText(ctx, `TEMPO ${fmtTime(game.elapsed)}${end.timeBonus ? `  +${end.timeBonus} BÔNUS` : ''}`,
      cx, p.y + 174, { scale: 1, color: COLORS.gold, align: 'center' });
    drawText(ctx, `${game.layout.name}  •  ${end.pairs} PARES  •  ${end.hints} DICAS`,
      cx, p.y + 194, { scale: 1, color: '#b9a88e', align: 'center' });
    drawText(ctx, victory ? 'CHUVA DE ESTRELAS!' : 'TENTE NOVAMENTE!', cx, p.y + 224, {
      scale: 1, color: victory ? COLORS.gold : '#9f8c75', align: 'center',
    });
    this.drawSpriteButton('ui_btn_jogar', END.playAgain, false, 2);
    this.drawSpriteButton('ui_btn_menu_a', END.menu, false, 2);
    drawText(ctx, 'JOGAR DE NOVO', cx - 96, 429, {
      scale: 1, color: '#b9a88e', align: 'center',
    });
    drawText(ctx, 'MENU', cx + 114, 429, {
      scale: 1, color: '#b9a88e', align: 'center',
    });
  }

  drawGoodbye(game, now) {
    const ctx = this.ctx;
    ctx.drawImage(this.makeBackground(), 0, 0);
    ctx.fillStyle = 'rgba(5,4,3,0.72)';
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
    const p = GOODBYE.panel;
    this.panel(p.x, p.y, p.w, p.h, { fill: 'rgba(31,22,18,0.98)', border: COLORS.gold });
    drawText(ctx, 'ATÉ LOGO!', p.x + p.w / 2, p.y + 30, {
      scale: 4, color: COLORS.gold, align: 'center', shadow: '#170d09',
    });
    drawText(ctx, 'OBRIGADO POR JOGAR.', p.x + p.w / 2, p.y + 106, {
      scale: 2, color: COLORS.cream, align: 'center',
    });
    drawText(ctx, 'VOCÊ JÁ PODE FECHAR A ABA DO NAVEGADOR.', p.x + p.w / 2, p.y + 140, {
      scale: 1, color: '#bda98e', align: 'center',
    });
    this.buttonBox(GOODBYE.back.x, GOODBYE.back.y, GOODBYE.back.w, GOODBYE.back.h, { hover: true });
    drawText(ctx, 'VOLTAR AO MENU', p.x + p.w / 2, GOODBYE.back.y + 15, {
      scale: 2, color: COLORS.gold, align: 'center',
    });
  }
}
