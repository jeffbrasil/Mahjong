/**
 * ui.js — geometria clicável da interface, separada do desenho.
 * Todas as coordenadas estão no canvas lógico 960x540.
 */

import { HUD_BUTTONS } from './config.js';
import { LAYOUTS } from './layouts.js';

export const MENU = {
  panel: { x: 190, y: 124, w: 580, h: 398 },
  title1Y: 18,
  title2Y: 86,
  windY: 156,
  windW: 58,
  windH: 66,
  windGap: 18,
  windLabelsY: 226,
  descY: 244,
  toggle: { x: 330, y: 280, w: 300, h: 30 },
  play: { x: 360, y: 320, w: 114, h: 58 },
  exit: { x: 486, y: 320, w: 114, h: 58 },
  mute: { x: 842, y: 14, w: 102, h: 30 },
  helpY: 400,
};

export const MENU_LAYOUT_BUTTONS = LAYOUTS.map((layout, i) => {
  const total = LAYOUTS.length * MENU.windW + (LAYOUTS.length - 1) * MENU.windGap;
  const x0 = Math.round(480 - total / 2);
  return {
    layout,
    x: x0 + i * (MENU.windW + MENU.windGap),
    y: MENU.windY,
    w: MENU.windW,
    h: MENU.windH,
  };
});

export const HUD_LAYOUT = {
  counterA: { x: 684, y: 46, w: 126, h: 52 },
  counterB: { x: 816, y: 46, w: 126, h: 52 },
  timerBar: { x: 686, y: 110, w: 14, h: 352 },
  buttonsX: [708, 830],
  buttonsY: [108, 170, 232],
  buttonW: 114,
  buttonH: 54,
  status: { x: 708, y: 300, w: 236, h: 212 },
  mute: { x: 714, y: 486, w: 104, h: 26 },
  bell: { x: 712, y: 416, w: 28, h: 22 },
};

export const HUD_BUTTON_RECTS = HUD_BUTTONS.map((button, i) => ({
  ...button,
  x: HUD_LAYOUT.buttonsX[i % 2],
  y: HUD_LAYOUT.buttonsY[Math.floor(i / 2)],
  w: HUD_LAYOUT.buttonW,
  h: HUD_LAYOUT.buttonH,
}));

export const MODAL = {
  panel: { x: 246, y: 138, w: 468, h: 286 },
  buttonA: { x: 286, y: 352, w: 178, h: 48 },
  buttonB: { x: 496, y: 352, w: 178, h: 48 },
  single: { x: 341, y: 352, w: 278, h: 48 },
};

export const END = {
  panel: { x: 232, y: 96, w: 496, h: 356 },
  playAgain: { x: 286, y: 366, w: 180, h: 50 },
  menu: { x: 494, y: 366, w: 180, h: 50 },
};

export const GOODBYE = {
  panel: { x: 270, y: 150, w: 420, h: 240 },
  back: { x: 360, y: 318, w: 240, h: 46 },
};

export function inRect(x, y, r) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

/**
 * Retorna a ação de menu atingida, se houver.
 * @returns {{type:string, layoutId?:string}|null}
 */
export function hitMenu(x, y) {
  if (inRect(x, y, MENU.mute)) return { type: 'mute' };
  for (const b of MENU_LAYOUT_BUTTONS) {
    if (inRect(x, y, b)) return { type: 'layout', id: b.layout.id, layoutId: b.layout.id };
  }
  if (inRect(x, y, MENU.toggle)) return { type: 'timed' };
  if (inRect(x, y, MENU.play)) return { type: 'play' };
  if (inRect(x, y, MENU.exit)) return { type: 'exit' };
  return null;
}

/** Retorna a ação do HUD atingida, se houver. */
export function hitHud(x, y) {
  for (const b of HUD_BUTTON_RECTS) {
    if (inRect(x, y, b)) return { type: 'hud', id: b.id };
  }
  if (inRect(x, y, HUD_LAYOUT.mute)) return { type: 'mute' };
  return null;
}

/** Ações dos modais e da tela final. */
export function hitModal(x, y, modal) {
  if (!modal) return null;
  if (modal.kind === 'confirm-menu') {
    if (inRect(x, y, MODAL.buttonA)) return { type: 'modal', id: 'yes' };
    if (inRect(x, y, MODAL.buttonB)) return { type: 'modal', id: 'no' };
  }
  if (modal.kind === 'no-moves') {
    if (inRect(x, y, MODAL.buttonA)) return { type: 'modal', id: 'shuffle' };
    if (inRect(x, y, MODAL.buttonB)) return { type: 'modal', id: 'menu' };
  }
  return null;
}

export function hitEnd(x, y) {
  if (inRect(x, y, END.playAgain)) return { type: 'end', id: 'again' };
  if (inRect(x, y, END.menu)) return { type: 'end', id: 'menu' };
  return null;
}

export function hitGoodbye(x, y) {
  if (inRect(x, y, GOODBYE.back)) return { type: 'goodbye', id: 'back' };
  return null;
}
