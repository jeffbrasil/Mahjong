/**
 * ui.js — geometria responsiva da interface em pixels CSS.
 * As funções recebem um `view` (view.js) e devolvem retângulos de desenho e
 * de toque. Nada aqui depende de um canvas fixo de 960x540.
 */

import { HUD_BUTTONS } from './config.js';
import { LAYOUTS } from './layouts.js';
import { measureText } from './font.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function inRect(x, y, r) {
  return Boolean(r) && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

// ---------------------------------------------------------------------------
// Jogo / HUD
// ---------------------------------------------------------------------------

function compactButtons(hud) {
  const bw = 46;
  const bh = 46;
  const gap = 4;
  const x0 = Math.round(hud.x + (hud.w - (bw * 2 + gap)) / 2);
  const y0 = hud.y + 142;
  return HUD_BUTTONS.map((button, i) => ({
    ...button,
    x: x0 + (i % 2) * (bw + gap),
    y: y0 + Math.floor(i / 2) * (bh + gap),
    w: bw,
    h: bh,
  }));
}

function fullButtons(hud) {
  const innerX = hud.x + 8;
  const innerW = hud.w - 16;
  const bw = Math.floor((innerW - 6) / 2);
  const bh = 48;
  const y0 = hud.y + 112;
  return HUD_BUTTONS.map((button, i) => ({
    ...button,
    x: innerX + (i % 2) * (bw + 6),
    y: y0 + Math.floor(i / 2) * (bh + 6),
    w: bw,
    h: bh,
  }));
}

export function getGameLayout(view) {
  const { w, h, safe, portrait, compact, desktop, hudCollapsed } = view;
  const pad = 6;

  if (portrait) {
    const barH = safe.top + 60;
    const contentY = safe.top + 4;
    const counterW = Math.round(clamp(w * 0.145, 50, 60));
    const counters = [
      { kind: 'score', x: 8, y: contentY, w: counterW, h: 40 },
      { kind: 'pairs', x: 8 + counterW + 4, y: contentY, w: counterW, h: 40 },
    ];

    const actionDefs = HUD_BUTTONS.filter((b) => ['hint', 'shuffle', 'undo', 'menu', 'exit'].includes(b.id));
    const gap = 2;
    const available = Math.max(120, w - (counters[1].x + counters[1].w) - 12);
    const bw = Math.max(44, Math.min(46, Math.floor((available - gap * (actionDefs.length - 1)) / actionDefs.length)));
    const totalW = bw * actionDefs.length + gap * (actionDefs.length - 1);
    const x0 = w - 6 - totalW;
    const buttons = actionDefs.map((button, i) => ({
      ...button,
      x: x0 + i * (bw + gap),
      y: contentY,
      w: bw,
      h: 44,
    }));

    return {
      mode: 'portrait',
      bar: { x: 0, y: 0, w, h: barH },
      hud: null,
      counters,
      buttons,
      toggle: null,
      reopen: null,
      mute: null,
      status: null,
      timerBar: { x: 0, y: barH - 3, w, h: 3 },
      boardArea: {
        x: safe.left + 4,
        y: barH + 4,
        w: Math.max(120, w - safe.left - safe.right - 8),
        h: Math.max(120, h - barH - safe.bottom - 8),
      },
    };
  }

  const collapsed = !desktop && hudCollapsed;
  const hudW = desktop
    ? Math.round(clamp(w * 0.22, 250, 300))
    : (collapsed ? 0 : 108);
  const reserve = collapsed ? 48 : hudW + pad;
  const boardArea = {
    x: safe.left + pad,
    y: safe.top + pad,
    w: Math.max(160, w - safe.left - safe.right - pad * 2 - reserve),
    h: Math.max(120, h - safe.top - safe.bottom - pad * 2),
  };

  if (hudW <= 0) {
    return {
      mode: 'collapsed',
      bar: null,
      hud: null,
      counters: [],
      buttons: [],
      toggle: null,
      reopen: { x: w - safe.right - pad - 44, y: safe.top + pad, w: 44, h: 44 },
      mute: null,
      status: null,
      timerBar: null,
      boardArea,
    };
  }

  const hud = {
    x: w - safe.right - pad - hudW,
    y: safe.top + pad,
    w: hudW,
    h: Math.max(180, h - safe.top - safe.bottom - pad * 2),
  };

  if (compact) {
    return {
      mode: 'compact',
      bar: null,
      hud,
      counters: [
        { kind: 'score', x: hud.x + 5, y: hud.y + 52, w: hud.w - 10, h: 38 },
        { kind: 'pairs', x: hud.x + 5, y: hud.y + 93, w: hud.w - 10, h: 38 },
      ],
      buttons: compactButtons(hud),
      toggle: { x: hud.x + hud.w - 48, y: hud.y + 4, w: 44, h: 44 },
      reopen: null,
      mute: null,
      status: null,
      timerBar: { x: hud.x + 6, y: hud.y + hud.h - 46, w: hud.w - 12, h: 7 },
      boardArea,
    };
  }

  const innerX = hud.x + 8;
  const innerW = hud.w - 16;
  const half = Math.floor((innerW - 8) / 2);
  const counters = [
    { kind: 'score', x: innerX, y: hud.y + 42, w: half, h: 56 },
    { kind: 'pairs', x: innerX + half + 8, y: hud.y + 42, w: half, h: 56 },
  ];
  const statusY = hud.y + 112 + 3 * 54 + 4;
  const muteH = 30;
  const status = {
    x: innerX,
    y: statusY,
    w: innerW,
    h: Math.max(70, hud.y + hud.h - 8 - muteH - 8 - statusY),
  };
  return {
    mode: 'full',
    bar: null,
    hud,
    counters,
    buttons: fullButtons(hud),
    toggle: null,
    reopen: null,
    mute: { x: innerX, y: hud.y + hud.h - 8 - muteH, w: innerW, h: muteH },
    status,
    timerBar: { x: status.x + 8, y: status.y + status.h - 14, w: status.w - 16, h: 6 },
    boardArea,
  };
}

export function hitHud(layout, x, y) {
  for (const button of layout.buttons || []) {
    if (inRect(x, y, button)) return { type: 'hud', id: button.id };
  }
  if (inRect(x, y, layout.toggle)) return { type: 'toggle-hud' };
  if (inRect(x, y, layout.reopen)) return { type: 'reopen-hud' };
  if (inRect(x, y, layout.mute)) return { type: 'mute' };
  return null;
}

// ---------------------------------------------------------------------------
// Menu inicial
// ---------------------------------------------------------------------------

export function getMenuLayout(view) {
  const { w, h, safe, portrait } = view;
  const pad = 8;
  const contentW = Math.min(w - safe.left - safe.right - pad * 2, portrait ? 520 : 1000);
  const titleY1 = safe.top + (portrait ? 10 : 4);
  const titleY2 = titleY1 + (portrait ? 54 : 46);
  const titleBottom = titleY2 + (portrait ? 28 : 26);
  const contentTop = titleBottom + 8;

  const footerLine1 = h - safe.bottom - 27;
  const footerLine2 = h - safe.bottom - 14;
  const footerTop = footerLine1 - 6;

  const cols = portrait ? 2 : 4;
  const gap = portrait ? 14 : 12;
  const desiredCardW = portrait ? 158 : (view.desktop ? 190 : 142);
  const cardW = Math.min(desiredCardW, Math.floor((contentW - gap * (cols - 1)) / cols));
  const rows = Math.ceil(LAYOUTS.length / cols);
  const labelsH = portrait ? 24 : 22;
  const descH = portrait ? 34 : 28;
  const toggleH = portrait ? 42 : 36;
  const actionsH = portrait ? 54 : 50;
  const gaps = portrait ? 24 : 18;

  const maxH = Math.max(120, footerTop - contentTop);
  const fixedH = descH + toggleH + actionsH + gaps;
  const gridAvail = Math.max(rows * 64 + rows * labelsH, maxH - fixedH);
  const maxCardH = portrait ? 190 : (view.desktop ? 210 : 150);
  const cardH = clamp(
    Math.floor((gridAvail - rows * labelsH - (rows - 1) * gap) / rows),
    64,
    maxCardH,
  );
  const gridH = rows * cardH + rows * labelsH + (rows - 1) * gap;
  const totalH = gridH + fixedH;
  const startY = contentTop + Math.max(0, Math.floor((maxH - totalH) / 2));

  const gridW = cols * cardW + (cols - 1) * gap;
  const gridX = Math.round((w - gridW) / 2);
  const cards = LAYOUTS.map((layout, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = gridX + col * (cardW + gap);
    const y = startY + row * (cardH + labelsH + gap);
    const nameScale = measureText(layout.name, 2) <= cardW - 8 ? 2 : 1;
    return {
      layout,
      x,
      y,
      w: cardW,
      h: cardH,
      labelY: y + cardH + 4,
      labelH: labelsH,
      nameScale,
    };
  });

  const descY = startY + gridH + 6;
  const toggleW = Math.min(portrait ? 300 : 320, contentW - 16);
  const toggle = {
    x: Math.round((w - toggleW) / 2),
    y: descY + descH,
    w: toggleW,
    h: toggleH,
  };

  const actionW = Math.min(portrait ? 150 : 160, Math.floor((contentW - 36) / 2));
  const actionY = toggle.y + toggleH + 12;
  const play = { x: Math.round(w / 2 - actionW - 6), y: actionY, w: actionW, h: actionsH };
  const exit = { x: Math.round(w / 2 + 6), y: actionY, w: actionW, h: actionsH };

  const panelW = Math.min(
    contentW,
    Math.max(gridW + 24, actionW * 2 + 12 + 24, toggleW + 24, 320),
  );
  const panel = {
    x: Math.round((w - panelW) / 2),
    y: startY - 4,
    w: panelW,
    h: totalH + 6,
  };

  const mute = {
    x: w - safe.right - 52,
    y: safe.top + 8,
    w: 44,
    h: 44,
  };

  return {
    titleY1,
    titleY2,
    contentW,
    contentX: Math.round((w - contentW) / 2),
    cards,
    panel,
    descY,
    toggle,
    play,
    exit,
    mute,
    footerY1: footerLine1,
    footerY2: footerLine2,
    colCount: cols,
    cardW,
    cardH,
  };
}

export function hitMenu(layout, x, y) {
  if (inRect(x, y, layout.mute)) return { type: 'mute' };
  for (const card of layout.cards) {
    if (inRect(x, y, { x: card.x, y: card.y, w: card.w, h: card.h + card.labelH })) {
      return { type: 'layout', id: card.layout.id, layoutId: card.layout.id };
    }
  }
  if (inRect(x, y, layout.toggle)) return { type: 'timed' };
  if (inRect(x, y, layout.play)) return { type: 'play' };
  if (inRect(x, y, layout.exit)) return { type: 'exit' };
  return null;
}

// ---------------------------------------------------------------------------
// Modais
// ---------------------------------------------------------------------------

const MODAL_SPECS = {
  'confirm-menu': {
    ids: ['resume', 'menu'],
    labels: { resume: 'VOLTAR AO JOGO', menu: 'IR PARA O MENU' },
  },
  'confirm-exit': {
    ids: ['resume', 'menu', 'exit'],
    labels: { resume: 'VOLTAR AO JOGO', menu: 'VOLTAR AO MENU', exit: 'FECHAR O JOGO' },
  },
  'confirm-exit-app': {
    ids: ['cancel', 'exit'],
    labels: { cancel: 'CANCELAR', exit: 'FECHAR O JOGO' },
  },
  'no-moves': {
    ids: ['shuffle', 'menu'],
    labels: { shuffle: 'EMBARALHAR', menu: 'MENU' },
  },
};

export function getModalLayout(view, kind) {
  const { w, h } = view;
  const spec = MODAL_SPECS[kind] || MODAL_SPECS['confirm-menu'];
  const three = spec.ids.length === 3;
  const horizontal = w >= 640 && !view.portrait;
  const panelW = Math.min(w - 24, three && horizontal ? 620 : 540);
  const titleScale = panelW < 360 ? 2 : 3;
  const bodyLines = kind === 'no-moves' ? 4 : 2;
  const titleH = 34;
  const bodyH = bodyLines * 14 + 8;
  const btnH = 48;
  const gap = 10;
  const btnAreaH = horizontal ? btnH : spec.ids.length * btnH + (spec.ids.length - 1) * gap;
  const panelH = 20 + titleH + bodyH + 18 + btnAreaH + 20;
  const panel = {
    x: Math.round((w - panelW) / 2),
    y: Math.round((h - panelH) / 2),
    w: panelW,
    h: panelH,
  };

  const buttons = [];
  const innerW = panelW - 40;
  if (horizontal) {
    const bw = Math.floor((innerW - gap * (spec.ids.length - 1)) / spec.ids.length);
    const totalW = bw * spec.ids.length + gap * (spec.ids.length - 1);
    const x0 = panel.x + Math.round((panelW - totalW) / 2);
    const y = panel.y + panelH - 20 - btnH;
    spec.ids.forEach((id, i) => {
      buttons.push({
        id,
        label: spec.labels[id],
        x: x0 + i * (bw + gap),
        y,
        w: bw,
        h: btnH,
      });
    });
  } else {
    const x = panel.x + 20;
    const y0 = panel.y + panelH - 20 - btnAreaH;
    spec.ids.forEach((id, i) => {
      buttons.push({
        id,
        label: spec.labels[id],
        x,
        y: y0 + i * (btnH + gap),
        w: innerW,
        h: btnH,
      });
    });
  }

  return {
    kind,
    panel,
    titleY: panel.y + 20,
    bodyY: panel.y + 20 + titleH + 8,
    titleScale,
    buttons,
    horizontal,
    three,
  };
}

export function hitModal(layout, x, y) {
  if (!layout) return null;
  for (const button of layout.buttons) {
    if (inRect(x, y, button)) return { type: 'modal', id: button.id };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Fim de jogo
// ---------------------------------------------------------------------------

export function getEndLayout(view) {
  const { w, h } = view;
  const panelW = Math.min(w - 24, 520);
  const panelH = Math.min(h - 24, 380);
  const panel = {
    x: Math.round((w - panelW) / 2),
    y: Math.round((h - panelH) / 2),
    w: panelW,
    h: panelH,
  };
  const btnW = Math.min(170, Math.floor((panelW - 48) / 2));
  const btnH = 50;
  const gap = 12;
  const y = panel.y + panel.h - 24 - btnH;
  return {
    panel,
    titleY: panel.y + 28,
    statY: panel.y + 104,
    again: {
      x: Math.round(panel.x + panel.w / 2 - btnW - gap / 2),
      y,
      w: btnW,
      h: btnH,
    },
    menu: {
      x: Math.round(panel.x + panel.w / 2 + gap / 2),
      y,
      w: btnW,
      h: btnH,
    },
  };
}

export function hitEnd(layout, x, y) {
  if (inRect(x, y, layout.again)) return { type: 'end', id: 'again' };
  if (inRect(x, y, layout.menu)) return { type: 'end', id: 'menu' };
  return null;
}
