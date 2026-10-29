/**
 * game.js — fluxo do jogo, pontuação, entrada e efeitos.
 * As regras geométricas puras ficam em rules.js e a geração em generator.js.
 */

import { TIME_LIMITS, SHUFFLE_LIMIT, TILE_W, TILE_H, BOARD_INNER } from './config.js';
import { LAYOUTS, LAYOUT_BY_ID, DEFAULT_LAYOUT_ID } from './layouts.js';
import { findFreePairs, freeTiles, isFree, makeOccupancy } from './rules.js';
import { generateBoard, shuffleRemaining } from './generator.js';
import {
  hitMenu, hitHud, hitModal, hitEnd, hitGoodbye, MENU,
} from './ui.js';

const PREFS = {
  layout: 'mahjong-pixel-layout',
  timed: 'mahjong-pixel-cronometrado',
};

const randSeed = () => (Math.floor(Math.random() * 0xffffffff) >>> 0);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Game {
  constructor({ assets, audio, renderer, canvas }) {
    this.assets = assets;
    this.audio = audio;
    this.renderer = renderer;
    this.canvas = canvas;

    this.screen = 'loading';
    this.loadingError = '';
    this.audioMuted = audio.muted;

    this.selectedLayoutId = this.loadPref(PREFS.layout, DEFAULT_LAYOUT_ID);
    if (!LAYOUT_BY_ID[this.selectedLayoutId]) this.selectedLayoutId = DEFAULT_LAYOUT_ID;
    this.timedMode = this.loadPref(PREFS.timed, '0') === '1';

    this.hover = null;
    this.hoverTileId = null;
    this.selectedTileId = null;
    this.modal = null;
    this.end = null;
    this.toast = null;
    this.hint = null;
    this.hintIds = null;
    this.matches = [];
    this.errors = [];
    this.locks = [];
    this.particles = [];
    this.floaters = [];
    this.busyUntil = 0;

    this.score = 0;
    this.combo = 1;
    this.lastMatchAt = -999;
    this.shufflesLeft = SHUFFLE_LIMIT;
    this.shuffleLimit = SHUFFLE_LIMIT;
    this.hintsUsed = 0;
    this.undoStack = [];

    this.timeLeft = 0;
    this.timeLimit = 0;
    this.elapsed = 0;
    this.lastTick = -1;
    this.starAcc = 0;
    this.boardRevision = 0;
    this.pausedByFocus = false;
    this.now = performance.now() / 1000;
  }

  loadPref(key, fallback) {
    try { return localStorage.getItem(key) || fallback; } catch (_) { return fallback; }
  }

  savePref(key, value) {
    try { localStorage.setItem(key, String(value)); } catch (_) { /* ignore */ }
  }

  setScreenAfterLoad() {
    this.screen = 'menu';
    this.hover = null;
  }

  get layout() {
    return LAYOUT_BY_ID[this.selectedLayoutId] || LAYOUTS[0];
  }

  // ------------------------------------------------------------------
  // Entrada
  // ------------------------------------------------------------------
  updateHover(x, y) {
    this.hover = null;
    this.hoverTileId = null;
    if (this.screen === 'menu' && !this.modal) {
      this.hover = hitMenu(x, y);
    } else if (this.screen === 'playing' && !this.modal) {
      const hud = hitHud(x, y);
      if (hud) {
        this.hover = hud;
      } else if (x >= BOARD_INNER.x && x <= BOARD_INNER.x + BOARD_INNER.w &&
                 y >= BOARD_INNER.y && y <= BOARD_INNER.y + BOARD_INNER.h) {
        const tile = this.renderer.tileAt(this, x, y);
        if (tile) {
          const occ = makeOccupancy(this.board.tiles);
          if (!tile.removed && isFree(tile, occ)) this.hoverTileId = tile.id;
        }
      }
    } else if (this.screen === 'end' && !this.modal) {
      this.hover = hitEnd(x, y) ? { type: 'end' } : null;
    } else if (this.screen === 'goodbye') {
      this.hover = hitGoodbye(x, y) ? { type: 'goodbye' } : null;
    }
    return Boolean(this.hover || this.hoverTileId !== null);
  }

  pointerDown(x, y) {
    this.audio.ensure();
    const now = performance.now() / 1000;
    this.now = now;

    if (this.screen === 'menu') {
      const action = hitMenu(x, y);
      if (action) this.handleMenuAction(action);
      return;
    }
    if (this.screen === 'goodbye') {
      if (hitGoodbye(x, y)) {
        this.audio.click();
        this.goMenu();
      }
      return;
    }
    if (this.screen === 'end') {
      const action = hitEnd(x, y);
      if (!action) return;
      this.audio.click();
      if (action.id === 'again') this.startGame(this.selectedLayoutId, randSeed());
      else this.goMenu();
      return;
    }
    if (this.screen !== 'playing') return;

    if (this.modal) {
      const action = hitModal(x, y, this.modal);
      if (action) this.handleModalAction(action);
      return;
    }

    // durante a animação de quebra, evita jogadas acidentais no tabuleiro
    if (now < this.busyUntil) return;

    const hudHit = hitHud(x, y);
    if (hudHit) {
      if (hudHit.type === 'mute') {
        this.toggleMute();
      } else {
        this.handleHudAction(hudHit.id);
      }
      return;
    }

    if (x < BOARD_INNER.x || x > BOARD_INNER.x + BOARD_INNER.w ||
        y < BOARD_INNER.y || y > BOARD_INNER.y + BOARD_INNER.h) return;

    const tile = this.renderer.tileAt(this, x, y);
    if (!tile) {
      this.selectedTileId = null;
      return;
    }
    this.handleTileClick(tile, now);
  }

  handleMenuAction(action) {
    if (action.type === 'mute') { this.toggleMute(); return; }
    this.audio.click();
    if (action.type === 'layout') {
      if (LAYOUT_BY_ID[action.layoutId]) {
        this.selectedLayoutId = action.layoutId;
        this.savePref(PREFS.layout, action.layoutId);
      }
    } else if (action.type === 'timed') {
      this.timedMode = !this.timedMode;
      this.savePref(PREFS.timed, this.timedMode ? '1' : '0');
    } else if (action.type === 'play') {
      this.startGame(this.selectedLayoutId, randSeed());
    } else if (action.type === 'exit') {
      this.leaveToGoodbye();
    }
  }

  handleHudAction(id) {
    this.audio.click();
    if (id === 'hint') this.useHint();
    else if (id === 'shuffle') this.useShuffle();
    else if (id === 'undo') this.undo();
    else if (id === 'new') {
      this.startGame(this.selectedLayoutId, randSeed());
    } else if (id === 'menu') {
      this.openModal('confirm-menu');
    } else if (id === 'exit') {
      this.leaveToGoodbye();
    }
  }

  handleModalAction(action) {
    if (action.type !== 'modal') return;
    this.audio.click();
    if (this.modal?.kind === 'confirm-menu') {
      if (action.id === 'yes') {
        this.modal = null;
        this.goMenu();
      } else {
        this.modal = null;
      }
    } else if (this.modal?.kind === 'no-moves') {
      if (action.id === 'shuffle') {
        this.modal = null;
        this.useShuffle(true);
      } else if (action.id === 'menu') {
        this.modal = null;
        this.goMenu();
      }
    }
  }

  handleTileClick(tile, now) {
    const occ = makeOccupancy(this.board.tiles);
    if (!isFree(tile, occ)) {
      this.locks.push({ tileId: tile.id, start: now });
      this.audio.lock();
      return;
    }
    if (this.selectedTileId === null) {
      this.selectedTileId = tile.id;
      this.audio.select();
      return;
    }
    if (this.selectedTileId === tile.id) {
      this.selectedTileId = null;
      this.audio.select();
      return;
    }
    const first = this.board.tiles[this.selectedTileId];
    if (!first || first.removed) {
      this.selectedTileId = tile.id;
      this.audio.select();
      return;
    }
    if (first.type !== tile.type) {
      this.errors.push({
        tileId: tile.id, start: now,
        icon: Math.random() < 0.5 ? 'icon_x_a' : 'icon_x_b',
      });
      this.selectedTileId = null;
      this.combo = 0;
      this.audio.error();
      return;
    }
    this.matchTiles(first, tile, now);
  }

  // ------------------------------------------------------------------
  // Partida
  // ------------------------------------------------------------------
  startGame(layoutId, seed) {
    const layout = LAYOUT_BY_ID[layoutId] || LAYOUTS[0];
    this.selectedLayoutId = layout.id;
    this.savePref(PREFS.layout, layout.id);
    const board = generateBoard(layout, seed);
    board.remaining = board.tiles.length;

    this.screen = 'playing';
    this.modal = null;
    this.end = null;
    this.toast = null;
    this.hint = null;
    this.hintIds = null;
    this.selectedTileId = null;
    this.hoverTileId = null;
    this.hover = null;
    this.matches = [];
    this.errors = [];
    this.locks = [];
    this.particles = [];
    this.floaters = [];
    this.busyUntil = 0;
    this.score = 0;
    this.combo = 1;
    this.lastMatchAt = -999;
    this.shufflesLeft = SHUFFLE_LIMIT;
    this.shuffleLimit = SHUFFLE_LIMIT;
    this.hintsUsed = 0;
    this.undoStack = [];
    this.timeLimit = this.timedMode ? (TIME_LIMITS[layout.id] || 600) : 0;
    this.timeLeft = this.timeLimit;
    this.elapsed = 0;
    this.lastTick = -1;
    this.starAcc = 0;

    this.board = board;
    this.boardRevision += 1;
    this.audio.ensure();
    this.audio.click();

    if (findFreePairs(board.tiles).length === 0) {
      // Proteção extra, embora os testes garantam que isso não ocorra.
      this.endGame(false, 'TABULEIRO SEM JOGADAS');
    }
  }

  matchTiles(a, b, now) {
    const fastThreshold = 3;
    if (now - this.lastMatchAt <= fastThreshold) this.combo += 1;
    else this.combo = 1;
    const bonus = this.combo > 1 ? 25 * (this.combo - 1) : 0;
    const points = 100 + bonus;

    this.undoStack.push({
      aId: a.id, bId: b.id,
      scoreBefore: this.score,
      comboBefore: this.combo > 1 ? this.combo - 1 : 0,
      lastMatchBefore: this.lastMatchAt,
    });
    this.score += points;
    this.lastMatchAt = now;

    const breakStart = now + 0.12;
    this.matches.push({
      aId: a.id, bId: b.id, type: a.type,
      start: now,
      checkUntil: breakStart,
      breakStart,
      end: breakStart + 0.34,
      particlesSpawned: false,
    });
    this.busyUntil = breakStart + 0.36;
    this.boardRevision += 1;
    this.selectedTileId = null;
    this.hint = null;
    this.hintIds = null;
    this.audio.match();

    const geo = this.renderer.getGeometry(this.layout);
    const pa = this.renderer.tileTopLeft(a, geo);
    const pb = this.renderer.tileTopLeft(b, geo);
    const mx = (pa.x + pb.x) / 2 + TILE_W / 2;
    const my = (pa.y + pb.y) / 2 + TILE_H / 2;
    let text = `+${points}`;
    if (this.combo > 1) text += `  COMBO X${this.combo}`;
    this.floaters.push({
      x: mx, y: my, text, color: this.combo > 1 ? COLORS_GREEN : '#f1c968',
      start: now, duration: 1.05, scale: 1,
    });
  }

  finalizeMatches(now) {
    const finished = this.matches.filter((m) => now >= m.end);
    if (!finished.length) return;
    this.matches = this.matches.filter((m) => now < m.end);
    for (const m of finished) {
      const a = this.board.tiles[m.aId];
      const b = this.board.tiles[m.bId];
      if (a && !a.removed) a.removed = true;
      if (b && !b.removed) b.removed = true;
      if (a && b) this.board.remaining = Math.max(0, this.board.remaining - 2);
      this.spawnMatchBurst(a || b);
    }
    this.boardRevision += 1;
    if (this.board.remaining <= 0) {
      this.victory(now);
      return;
    }
    this.checkNoMoves(now);
  }

  spawnMatchBurst(tile) {
    if (!tile) return;
    const geo = this.renderer.getGeometry(this.layout);
    const p = this.renderer.tileTopLeft(tile, geo);
    const types = ['fx_stars_a', 'fx_stars_b', 'fx_sparkles', 'fx_shine', 'fx_dust'];
    for (let i = 0; i < 9; i++) {
      const sprite = types[Math.floor(Math.random() * types.length)];
      this.particles.push({
        x: p.x + TILE_W / 2 + (Math.random() - 0.5) * TILE_W,
        y: p.y + TILE_H / 2 + (Math.random() - 0.5) * 18,
        vx: (Math.random() - 0.5) * 35,
        vy: -25 - Math.random() * 45,
        gravity: 15,
        sprite,
        size: 12 + Math.random() * 16,
        life: 0.55 + Math.random() * 0.55,
        maxLife: 1.1,
      });
    }
  }

  undo() {
    if (!this.undoStack.length || this.screen !== 'playing' || this.modal) {
      this.showToast('NÃO HÁ JOGADAS PARA DESFAZER.');
      return;
    }
    const snap = this.undoStack.pop();
    const a = this.board.tiles[snap.aId];
    const b = this.board.tiles[snap.bId];
    if (!a || !b) return;
    a.removed = false;
    b.removed = false;
    this.boardRevision += 1;
    this.board.remaining = Math.min(this.board.tiles.length, this.board.remaining + 2);
    this.score = snap.scoreBefore;
    this.combo = snap.comboBefore || 1;
    this.lastMatchAt = snap.lastMatchBefore;
    this.selectedTileId = null;
    this.hint = null;
    this.hintIds = null;
    this.matches = this.matches.filter((m) => m.aId !== snap.aId);
    this.audio.click();
    this.showToast('JOGADA DESFEITA.');
  }

  useHint() {
    if (this.modal || this.screen !== 'playing') return;
    const pairs = findFreePairs(this.board.tiles);
    if (!pairs.length) {
      this.checkNoMoves(performance.now() / 1000);
      return;
    }
    // Prefere um par ainda não selecionado.
    const pair = pairs[Math.floor(Math.random() * pairs.length)];
    this.hintIds = [pair.a.id, pair.b.id];
    const now = performance.now() / 1000;
    this.hint = { ids: this.hintIds, start: now, end: now + 2.4 };
    this.selectedTileId = null;
    this.score = Math.max(0, this.score - 50);
    this.hintsUsed += 1;
    this.audio.hint();
    this.showToast('PAR SUGERIDO! (-50 PTS)');
  }

  useShuffle(fromModal = false) {
    if (this.screen !== 'playing' || this.board.remaining <= 0) return;
    if (!fromModal && this.modal) return;
    if (this.shufflesLeft <= 0) {
      this.showToast('SEM EMBARALHAMENTOS RESTANTES.');
      this.audio.error();
      return;
    }
    const seed = randSeed();
    try {
      shuffleRemaining(this.layout, this.board, seed);
    } catch (err) {
      console.error(err);
      this.showToast('NÃO FOI POSSÍVEL EMBARALHAR.');
      return;
    }
    this.shufflesLeft -= 1;
    this.boardRevision += 1;
    this.selectedTileId = null;
    this.hint = null;
    this.hintIds = null;
    this.errors = [];
    this.locks = [];
    this.undoStack = [];
    this.busyUntil = performance.now() / 1000 + 0.15;
    this.audio.shuffleSound();
    this.showToast(`TABULEIRO EMBARALHADO (${this.shufflesLeft} RESTANTES)`);
    if (findFreePairs(this.board.tiles).length === 0) {
      this.checkNoMoves(performance.now() / 1000);
    }
  }

  checkNoMoves(now) {
    if (this.screen !== 'playing' || this.board.remaining <= 0) return;
    if (findFreePairs(this.board.tiles).length > 0) return;
    this.selectedTileId = null;
    this.hint = null;
    this.hintIds = null;
    if (this.shufflesLeft > 0) {
      this.openModal('no-moves');
    } else {
      this.endGame(false, 'SEM JOGADAS E SEM EMBARALHAMENTOS');
    }
  }

  openModal(kind) {
    if (this.screen !== 'playing') return;
    this.modal = { kind };
    this.hover = null;
    this.hoverTileId = null;
    this.selectedTileId = null;
  }

  victory(now) {
    const timeBonus = this.timedMode ? Math.max(0, Math.round(this.timeLeft)) * 5 : 0;
    this.score += timeBonus;
    const pairs = this.layout.pairCount;
    this.end = {
      victory: true, timeBonus, reason: '', pairs,
      hints: this.hintsUsed,
    };
    this.screen = 'end';
    this.modal = null;
    this.selectedTileId = null;
    this.hint = null;
    this.hintIds = null;
    this.audio.win();
    this.spawnVictoryStars(now, 64);
  }

  endGame(victory, reason) {
    if (this.screen === 'end') return;
    this.end = {
      victory: Boolean(victory), timeBonus: 0, reason,
      pairs: this.layout.pairCount - Math.ceil((this.board.remaining || 0) / 2),
      hints: this.hintsUsed,
    };
    this.screen = 'end';
    this.modal = null;
    this.matches = [];
    this.selectedTileId = null;
    this.hint = null;
    this.hintIds = null;
    this.audio.lose();
  }

  spawnVictoryStars(now, count = 8) {
    const types = ['fx_stars_a', 'fx_stars_b', 'fx_sparkles', 'fx_shine'];
    for (let i = 0; i < count; i++) {
      const sprite = types[Math.floor(Math.random() * types.length)];
      this.particles.push({
        x: Math.random() * 960,
        y: -120 + Math.random() * 360,
        vx: (Math.random() - 0.5) * 34,
        vy: 70 + Math.random() * 85,
        gravity: 2,
        sprite,
        size: 16 + Math.random() * 24,
        life: 3.5 + Math.random() * 2.5,
        maxLife: 5.5,
      });
    }
  }

  goMenu() {
    this.screen = 'menu';
    this.modal = null;
    this.end = null;
    this.board = null;
    this.matches = [];
    this.particles = [];
    this.floaters = [];
    this.errors = [];
    this.locks = [];
    this.hover = null;
    this.hoverTileId = null;
    this.hint = null;
    this.hintIds = null;
    this.audio.click();
  }

  leaveToGoodbye() {
    this.screen = 'goodbye';
    this.modal = null;
    this.hover = null;
    this.hoverTileId = null;
    this.audio.click();
    try { window.close(); } catch (_) { /* navegador bloqueia */ }
  }

  toggleMute() {
    this.audioMuted = this.audio.toggleMute();
    this.audio.click();
  }

  showToast(text, duration = 2.6) {
    const now = performance.now() / 1000;
    this.toast = { text, start: now, end: now + duration };
  }

  keyDown(key) {
    const k = key.toLowerCase();
    if (this.screen === 'menu') {
      if (k === 'enter') this.startGame(this.selectedLayoutId, randSeed());
      else if (k === 'm') this.toggleMute();
      else if (k === 'arrowleft' || k === 'arrowright') {
        const idx = LAYOUTS.findIndex((l) => l.id === this.selectedLayoutId);
        const next = (idx + (k === 'arrowright' ? 1 : -1) + LAYOUTS.length) % LAYOUTS.length;
        this.selectedLayoutId = LAYOUTS[next].id;
        this.savePref(PREFS.layout, this.selectedLayoutId);
      }
      return true;
    }
    if (this.screen === 'playing') {
      if (k === 'm') { this.toggleMute(); return true; }
      if (this.modal) {
        if (k === 'escape') { this.modal = null; return true; }
        return false;
      }
      if (k === 'h') { this.useHint(); return true; }
      if (k === 'u') { this.undo(); return true; }
      if (k === 'r') { this.startGame(this.selectedLayoutId, randSeed()); return true; }
      if (k === 'escape') { this.openModal('confirm-menu'); return true; }
      return false;
    }
    if (this.screen === 'end') {
      if (k === 'enter') { this.startGame(this.selectedLayoutId, randSeed()); return true; }
      if (k === 'escape') { this.goMenu(); return true; }
    }
    if (this.screen === 'goodbye') {
      if (k === 'enter' || k === 'escape') { this.goMenu(); return true; }
    }
    return false;
  }

  // ------------------------------------------------------------------
  // Loop
  // ------------------------------------------------------------------
  update(dt, now) {
    this.now = now;
    if (this.toast && now > this.toast.end) this.toast = null;

    if (this.screen === 'playing') {
      const paused = Boolean(this.modal) || this.pausedByFocus;
      if (!paused) {
        this.elapsed += dt;
        if (this.timedMode) {
          this.timeLeft = Math.max(0, this.timeLeft - dt);
          const sec = Math.ceil(this.timeLeft);
          if (this.timeLeft <= 10 && sec !== this.lastTick && sec > 0) {
            this.lastTick = sec;
            this.audio.tick();
          }
          if (this.timeLeft <= 0) {
            this.endGame(false, 'O TEMPO ACABOU');
          }
        }
      }
      if (this.screen === 'playing') {
        this.finalizeMatches(now);
        if (this.busyUntil && now > this.busyUntil + 0.08) this.busyUntil = 0;
      }
      if (this.hint && now > this.hint.end) {
        this.hint = null;
        this.hintIds = null;
      }
      this.locks = this.locks.filter((l) => now - l.start < 0.62);
      this.errors = this.errors.filter((e) => now - e.start < 0.44);
    }

    // partículas e textos flutuantes
    for (const p of this.particles) {
      p.life -= dt;
      p.x += (p.vx || 0) * dt;
      p.y += (p.vy || 0) * dt;
      p.vy = (p.vy || 0) + (p.gravity || 0) * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    this.floaters = this.floaters.filter((f) => now - f.start < f.duration);

    if (this.screen === 'end' && this.end?.victory) {
      this.starAcc += dt;
      if (this.starAcc > 0.14) {
        this.starAcc = 0;
        this.spawnVictoryStars(now, 2);
      }
    }
  }
}

// A cor é referenciada dentro de matchTiles para evitar import extra de estilo.
const COLORS_GREEN = '#6fe06a';
