/**
 * main.js — bootstrap, escala inteira do canvas, mouse/toque e loop.
 */

import { LOGICAL_W, LOGICAL_H } from './config.js';
import { Assets } from './assets.js';
import { AudioManager } from './audio.js';
import { Renderer } from './render.js';
import { Game } from './game.js';
import { LAYOUT_BY_ID } from './layouts.js';

const canvas = document.getElementById('game');
const wrap = document.getElementById('game-wrap');
const loading = document.getElementById('loading');

const assets = new Assets();
const audio = new AudioManager();
const renderer = new Renderer(canvas, assets);
const game = new Game({ assets, audio, renderer, canvas });
window.__mahjong = game;

let last = performance.now();
let active = false;

function fitCanvas() {
  // usa a janela inteira: em 1920x1080 isso permite exatamente 2x sem blur
  const availW = window.innerWidth;
  const availH = window.innerHeight;
  const raw = Math.min(availW / LOGICAL_W, availH / LOGICAL_H);
  let scale;
  if (raw >= 1) {
    // escala inteira: 1x, 2x, 3x...
    scale = Math.max(1, Math.floor(raw));
  } else {
    // telas pequenas (celular): reduz sem estourar; ainda sem interpolação
    scale = raw;
  }
  const cssW = Math.floor(LOGICAL_W * scale);
  const cssH = Math.floor(LOGICAL_H * scale);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  wrap.style.width = `${cssW}px`;
  wrap.style.height = `${cssH}px`;
}

function toLogical(evt) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (evt.clientX - rect.left) * (LOGICAL_W / rect.width),
    y: (evt.clientY - rect.top) * (LOGICAL_H / rect.height),
  };
}

function loop(ts) {
  const dt = Math.min(0.05, Math.max(0, (ts - last) / 1000));
  last = ts;
  game.update(dt, ts / 1000);
  renderer.draw(game);
  if (!active) {
    active = true;
    loading?.classList.add('hidden');
  }
  requestAnimationFrame(loop);
}

function bindInput() {
  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    const { x, y } = toLogical(e);
    const hot = game.updateHover(x, y);
    canvas.style.cursor = hot ? 'pointer' : 'default';
  });
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    audio.ensure();
    const { x, y } = toLogical(e);
    game.updateHover(x, y);
    game.pointerDown(x, y, e);
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (['ArrowLeft', 'ArrowRight', 'Enter', ' '].includes(e.key)) e.preventDefault();
    game.keyDown(e.key);
  });
  window.addEventListener('resize', fitCanvas);
  document.addEventListener('visibilitychange', () => {
    game.pausedByFocus = document.hidden;
  });

  document.addEventListener('backbutton', (e) => {
    e.preventDefault();
    
    if (game.screen === 'playing') {
      // Se estiver jogando, abre o modal para confirmar a saída/menu
      game.openModal('confirm-menu');
    } else if (game.screen === 'menu') {
      // Se estiver no menu principal, aciona o fechar app
      game.leaveToGoodbye();
    } else {
      game.goMenu();
    }
  }, false);
}

async function boot() {
  bindInput();
  fitCanvas();
  renderer.resize(LOGICAL_W, LOGICAL_H);
  fitCanvas();
  try {
    await assets.load();
    game.setScreenAfterLoad();
    renderer.makeBackground();
    loading?.classList.add('hidden');

    // Suporte a partidas reproduzíveis:
    // index.html?layout=tartaruga&seed=1234&tempo=1
    const params = new URLSearchParams(location.search);
    const layoutId = params.get('layout');
    const seed = params.get('seed');
    if (seed !== null && seed !== '') {
      if (layoutId && LAYOUT_BY_ID[layoutId]) game.selectedLayoutId = layoutId;
      if (params.get('tempo') === '1') {
        game.timedMode = true;
        game.savePref('mahjong-pixel-cronometrado', '1');
      }
      game.startGame(game.selectedLayoutId, seed);
    }
  } catch (err) {
    console.error(err);
    game.loadingError = err.message;
    game.screen = 'loading';
    const msg = document.getElementById('error');
    if (msg) {
      msg.textContent = err.message;
      msg.hidden = false;
    }
  }
  requestAnimationFrame((ts) => { last = ts; loop(ts); });
}

boot();
