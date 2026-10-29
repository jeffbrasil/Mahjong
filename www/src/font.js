/**
 * font.js — fonte bitmap 5x7 desenhada por código.
 * Suporta acentos e cedilha do português sem depender de fontes externas.
 * Todo texto é renderizado em coordenadas inteiras (pixel art nítida).
 */

const GLYPHS = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01110'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  0: ['01110', '10011', '10101', '10101', '10101', '11001', '01110'],
  1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  2: ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  3: ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  5: ['11111', '10000', '10000', '11110', '00001', '00001', '11110'],
  6: ['01110', '10000', '10000', '11110', '10001', '10001', '01110'],
  7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  9: ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '00110', '00110'],
  ',': ['00000', '00000', '00000', '00000', '00110', '00100', '01000'],
  ':': ['00000', '00110', '00110', '00000', '00110', '00110', '00000'],
  ';': ['00000', '00110', '00110', '00000', '00110', '00100', '01000'],
  '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
  '?': ['01110', '10001', '00001', '00010', '00100', '00000', '00100'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  '(': ['00010', '00100', '01000', '01000', '01000', '00100', '00010'],
  ')': ['01000', '00100', '00010', '00010', '00010', '00100', '01000'],
  '%': ['11001', '11010', '00010', '00100', '01000', '01011', '10011'],
  '=': ['00000', '00000', '11111', '00000', '11111', '00000', '00000'],
  '•': ['00000', '00000', '01110', '01110', '01110', '00000', '00000'],
  '×': ['00000', '10001', '01010', '00100', '01010', '10001', '00000'],
  '>': ['01000', '00100', '00010', '00001', '00010', '00100', '01000'],
  '<': ['00010', '00100', '01000', '10000', '01000', '00100', '00010'],
  '&': ['01100', '10010', '10100', '01000', '10101', '10010', '01101'],
};

const ACCENTED = {
  'Á': ['A', 'acute'], 'À': ['A', 'grave'], 'Â': ['A', 'circ'], 'Ã': ['A', 'tilde'], 'Ä': ['A', 'diaeresis'],
  'É': ['E', 'acute'], 'È': ['E', 'grave'], 'Ê': ['E', 'circ'],
  'Í': ['I', 'acute'], 'Ì': ['I', 'grave'], 'Î': ['I', 'circ'],
  'Ó': ['O', 'acute'], 'Ò': ['O', 'grave'], 'Ô': ['O', 'circ'], 'Õ': ['O', 'tilde'], 'Ö': ['O', 'diaeresis'],
  'Ú': ['U', 'acute'], 'Ù': ['U', 'grave'], 'Û': ['U', 'circ'], 'Ü': ['U', 'diaeresis'],
  'Ç': ['C', 'cedilla'], 'Ñ': ['N', 'tilde'],
};

const cache = new Map();

function glyphFor(ch) {
  const up = ch.toUpperCase();
  if (GLYPHS[up]) return { rows: GLYPHS[up], accent: null, base: up };
  if (ACCENTED[up]) {
    const [base, accent] = ACCENTED[up];
    return { rows: GLYPHS[base], accent, base };
  }
  return { rows: GLYPHS['?'], accent: null, base: '?' };
}

function textWidth(text, scale, letterSpacing) {
  if (!text.length) return 0;
  return text.length * 5 * scale + (text.length - 1) * letterSpacing;
}

function makeTextCanvas(text, scale, color, shadow, letterSpacing) {
  const w = Math.max(1, textWidth(text, scale, letterSpacing) + (shadow ? scale : 0));
  const h = 12 * scale + (shadow ? scale : 0);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const drawPass = (offsetX, offsetY, fill) => {
    ctx.fillStyle = fill;
    let x = offsetX;
    for (const ch of text) {
      const { rows, accent } = glyphFor(ch);
      const glyphTop = offsetY + 3 * scale;
      for (let ry = 0; ry < 7; ry++) {
        for (let rx = 0; rx < 5; rx++) {
          if (rows[ry][rx] === '1') {
            ctx.fillRect(x + rx * scale, glyphTop + ry * scale, scale, scale);
          }
        }
      }
      if (accent) {
        const ax = x + 2 * scale;
        if (accent === 'acute') {
          ctx.fillRect(ax + scale, offsetY, scale, scale);
          ctx.fillRect(ax, offsetY + scale, scale, scale);
        } else if (accent === 'grave') {
          ctx.fillRect(ax, offsetY, scale, scale);
          ctx.fillRect(ax + scale, offsetY + scale, scale, scale);
        } else if (accent === 'circ') {
          ctx.fillRect(ax + scale, offsetY, scale, scale);
          ctx.fillRect(ax, offsetY + scale, scale, scale);
          ctx.fillRect(ax + 2 * scale, offsetY + scale, scale, scale);
        } else if (accent === 'tilde') {
          ctx.fillRect(ax, offsetY + scale, scale, scale);
          ctx.fillRect(ax + scale, offsetY, scale, scale);
          ctx.fillRect(ax + 2 * scale, offsetY + scale, scale, scale);
        } else if (accent === 'diaeresis') {
          ctx.fillRect(ax, offsetY, scale, scale);
          ctx.fillRect(ax + 2 * scale, offsetY, scale, scale);
        } else if (accent === 'cedilla') {
          ctx.fillRect(ax + 2 * scale, glyphTop + 7 * scale, scale, scale);
          ctx.fillRect(ax + scale, glyphTop + 8 * scale, scale, scale);
        }
      }
      x += (5 + (letterSpacing / scale)) * scale;
    }
  };

  if (shadow) drawPass(scale, scale, shadow);
  drawPass(0, 0, color);
  return canvas;
}

/**
 * Desenha texto pixelado.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} x
 * @param {number} y topo da caixa de texto (inclui 3px de acento)
 * @param {object} [opt]
 */
export function drawText(ctx, text, x, y, opt = {}) {
  const {
    scale = 1, color = '#f5e6c4', align = 'left', shadow = null,
    letterSpacing = scale,
  } = opt;
  const value = String(text ?? '').toUpperCase();
  if (!value) return 0;
  const key = `${value}|${scale}|${color}|${shadow || '-'}|${letterSpacing}`;
  let canvas = cache.get(key);
  if (!canvas) {
    canvas = makeTextCanvas(value, scale, color, shadow, letterSpacing);
    cache.set(key, canvas);
  }
  let drawX = x;
  const w = textWidth(value, scale, letterSpacing);
  if (align === 'center') drawX = Math.round(x - w / 2);
  else if (align === 'right') drawX = Math.round(x - w);
  ctx.drawImage(canvas, drawX, y);
  return w;
}

/** Largura do texto (sem shadow), em pixels lógicos. */
export function measureText(text, scale = 1, letterSpacing = scale) {
  return textWidth(String(text ?? '').toUpperCase(), scale, letterSpacing);
}

/** Altura visual da caixa de texto. */
export function textHeight(scale = 1) {
  return 10 * scale;
}
