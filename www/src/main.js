/**
 * main.js — bootstrap responsivo, mouse/toque e loop.
 * O canvas usa o tamanho real da tela em pixels CSS (com DPR no backing store).
 */

import { Assets } from './assets.js';
import { AudioManager } from './audio.js';
import { Renderer } from './render.js';
import { Game } from './game.js';
import { LAYOUT_BY_ID } from './layouts.js';
import { readSafeInsets } from './view.js';

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
let fitTimer = null;
let fitPending = false;

function fitCanvas() {
  const w = document.documentElement.clientWidth || window.innerWidth;
  const h = document.documentElement.clientHeight || window.innerHeight;
  const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
  const safe = readSafeInsets();
  const sameSafe = renderer.view.safe.top === safe.top &&
    renderer.view.safe.right === safe.right &&
    renderer.view.safe.bottom === safe.bottom &&
    renderer.view.safe.left === safe.left;
  if (renderer.view.w === Math.round(w) &&
      renderer.view.h === Math.round(h) &&
      renderer.view.dpr === dpr &&
      sameSafe) return;
  wrap.style.width = '100vw';
  wrap.style.height = '100vh';
  renderer.setViewport(w, h, dpr);
}

function scheduleFit() {
  if (fitPending) return;
  fitPending = true;
  requestAnimationFrame(() => {
    fitPending = false;
    fitCanvas();
  });
  clearTimeout(fitTimer);
  fitTimer = setTimeout(fitCanvas, 160);
}

function toLogical(evt) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (evt.clientX - rect.left) * (renderer.view.w / rect.width),
    y: (evt.clientY - rect.top) * (renderer.view.h / rect.height),
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
    audio.ensure();
    if (['ArrowLeft', 'ArrowRight', 'Enter', ' '].includes(e.key)) e.preventDefault();
    game.keyDown(e.key);
  });
  window.addEventListener('resize', scheduleFit);
  window.addEventListener('orientationchange', scheduleFit);
  window.visualViewport?.addEventListener('resize', scheduleFit);
  document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('visibilitychange', () => {
    game.pausedByFocus = document.hidden;
  });

  const onBack = (e) => {
    e?.preventDefault?.();
    game.handleBack();
  };

  const native = Boolean(window.Capacitor?.isNativePlatform?.());
  const appPlugin = window.Capacitor?.Plugins?.App;
  if (native && appPlugin?.addListener) {
    appPlugin.addListener('backButton', onBack);
  } else {
    document.addEventListener('backbutton', onBack, false);
  }
}

async function boot() {
  bindInput();
  fitCanvas();
  try {
    await assets.load();
    game.setScreenAfterLoad();
    fitCanvas();
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
