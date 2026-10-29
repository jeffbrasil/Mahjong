/**
 * view.js — viewport responsivo em pixels CSS.
 * O canvas deixa de ser um palco fixo 960x540 e passa a usar o tamanho real
 * da tela. A geometria do tabuleiro é calculada em render.js a partir daqui.
 */

export const HUD_PREF_KEY = 'mahjong-pixel-hud';

export function readHudPref() {
  try {
    return localStorage.getItem(HUD_PREF_KEY) === 'collapsed' ? 'collapsed' : 'expanded';
  } catch (_) {
    return 'expanded';
  }
}

export function saveHudPref(value) {
  try { localStorage.setItem(HUD_PREF_KEY, value); } catch (_) { /* modo privado */ }
}

export function readSafeInsets() {
  let cs;
  try { cs = getComputedStyle(document.documentElement); } catch (_) { cs = null; }
  const read = (name) => {
    if (!cs) return 0;
    const raw = cs.getPropertyValue(name).trim();
    const n = parseFloat(raw);
    return Number.isFinite(n) ? Math.max(0, Math.min(64, n)) : 0;
  };
  return {
    top: read('--safe-top'),
    right: read('--safe-right'),
    bottom: read('--safe-bottom'),
    left: read('--safe-left'),
  };
}

export function createView(width, height, dpr = 1, hudPref = readHudPref()) {
  const w = Math.max(280, Math.round(width));
  const h = Math.max(280, Math.round(height));
  const portrait = h > w;
  const compact = !portrait && (w < 1000 || h < 600);
  const desktop = !portrait && !compact;
  return {
    w,
    h,
    dpr: Math.max(1, Math.min(3, Number(dpr) || 1)),
    portrait,
    compact,
    desktop,
    safe: readSafeInsets(),
    hudPref,
    hudCollapsed: hudPref === 'collapsed',
  };
}
