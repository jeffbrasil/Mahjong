/**
 * layouts.js
 * ------------------------------------------------------------
 * Coordenadas em meia-célula. Cada peça ocupa, logicamente, 2 x 2
 * meias-células. Um passo de 2 em x/y corresponde a uma peça de
 * distância, o que permite também posições deslocadas em meio passo.
 *
 * Todos os layouts têm quantidade PAR de peças e são construídos de
 * forma determinística. A ordem de criação das posições não interfere
 * na geração (o gerador embaralha tudo).
 */

/** Cria uma fileira centralizada de peças. */
function row(xs, y, z = 0) {
  return xs.map((x) => ({ x, y, z }));
}

/** Fileira de n peças, passo 2, centralizada em cx. */
function centeredRow(n, cx, y, z = 0) {
  const start = cx - (n - 1);
  const cells = [];
  for (let i = 0; i < n; i++) cells.push(start + i * 2);
  return row(cells, y, z);
}

/** Fileira com passo 2 começando em x0. */
function rowFrom(n, x0, y, z = 0) {
  const cells = [];
  for (let i = 0; i < n; i++) cells.push(x0 + i * 2);
  return row(cells, y, z);
}

/**
 * TARTARUGA (136 peças)
 * Casco em três camadas: uma base ovalada, um casco médio e o centro.
 * É a redução do clássico tabuleiro de 144 peças: 8 pares a menos.
 */
function buildTurtle() {
  const tiles = [];
  const baseWidths = [8, 10, 12, 14, 14, 12, 10, 8];
  baseWidths.forEach((n, i) => {
    tiles.push(...centeredRow(n, 13, i * 2, 0));
  });

  const shellWidths = [4, 6, 8, 8, 6, 4];
  shellWidths.forEach((n, i) => {
    tiles.push(...centeredRow(n, 13, 2 + i * 2, 1));
  });

  const topWidths = [2, 4, 4, 2];
  topWidths.forEach((n, i) => {
    tiles.push(...centeredRow(n, 13, 4 + i * 2, 2));
  });

  return tiles;
}

/**
 * PIRÂMIDE (136 peças)
 * Sete camadas concêntricas, cada uma uma meia-célula menor, terminando
 * em duas peças no topo.
 */
function buildPyramid() {
  const tiles = [];
  const specs = [
    { cols: 8, rows: 6, x0: 0, y0: 0, z: 0 },
    { cols: 7, rows: 5, x0: 1, y0: 1, z: 1 },
    { cols: 6, rows: 4, x0: 2, y0: 2, z: 2 },
    { cols: 5, rows: 3, x0: 3, y0: 3, z: 3 },
    { cols: 4, rows: 2, x0: 4, y0: 4, z: 4 },
    { cols: 4, rows: 1, x0: 4, y0: 5, z: 5 },
    { cols: 2, rows: 1, x0: 6, y0: 5, z: 6 },
  ];
  for (const s of specs) {
    for (let r = 0; r < s.rows; r++) {
      tiles.push(...rowFrom(s.cols, s.x0, s.y0 + r * 2, s.z));
    }
  }
  return tiles;
}

/**
 * FORTALEZA (136 peças)
 * Muralha retangular, adarve recuado e torre de comando no centro.
 */
function buildFortress() {
  const tiles = [];
  // terreno/muralha externa 12 x 6
  for (let r = 0; r < 6; r++) {
    tiles.push(...rowFrom(12, 0, r * 2, 0));
  }
  // adarve 10 x 4, deslocado meia peça
  for (let r = 0; r < 4; r++) {
    tiles.push(...rowFrom(10, 2, 2 + r * 2, 1));
  }
  // torre de comando 6 x 4
  for (let r = 0; r < 4; r++) {
    tiles.push(...rowFrom(6, 6, 2 + r * 2, 2));
  }
  return tiles;
}

/**
 * FÁCIL (48 peças)
 * Um pequeno terraço em três níveis, ideal para partidas rápidas.
 */
function buildEasy() {
  const tiles = [];
  for (let r = 0; r < 4; r++) tiles.push(...rowFrom(8, 0, r * 2, 0));
  for (let r = 0; r < 2; r++) tiles.push(...rowFrom(6, 2, 2 + r * 2, 1));
  tiles.push(...rowFrom(2, 6, 3, 2));
  tiles.push(...rowFrom(2, 6, 5, 2));
  return tiles;
}

function normalize(def) {
  const tiles = def.build().map((p, i) => ({ ...p, idx: i }));
  if (tiles.length % 2 !== 0) {
    throw new Error(`Layout ${def.id} tem ${tiles.length} peças (ímpar).`);
  }
  const seen = new Set();
  for (const t of tiles) {
    const k = `${t.x},${t.y},${t.z}`;
    if (seen.has(k)) throw new Error(`Layout ${def.id}: posição duplicada ${k}`);
    seen.add(k);
  }
  return Object.freeze({
    id: def.id,
    name: def.name,
    blurb: def.blurb,
    wind: def.wind,
    difficulty: def.difficulty,
    tiles: Object.freeze(tiles),
    tileCount: tiles.length,
    pairCount: tiles.length / 2,
  });
}

export const LAYOUTS = Object.freeze([
  normalize({
    id: 'tartaruga',
    name: 'TARTARUGA',
    blurb: 'O clássico casco em três camadas.',
    wind: 'east',
    difficulty: 'Clássico',
    build: buildTurtle,
  }),
  normalize({
    id: 'piramide',
    name: 'PIRÂMIDE',
    blurb: 'Sete níveis até o topo.',
    wind: 'south',
    difficulty: 'Desafiador',
    build: buildPyramid,
  }),
  normalize({
    id: 'fortaleza',
    name: 'FORTALEZA',
    blurb: 'Muralhas, adarve e torre central.',
    wind: 'west',
    difficulty: 'Desafiador',
    build: buildFortress,
  }),
  normalize({
    id: 'facil',
    name: 'FÁCIL',
    blurb: 'Partida curta de 48 peças.',
    wind: 'north',
    difficulty: 'Tranquilo',
    build: buildEasy,
  }),
]);

export const LAYOUT_BY_ID = Object.fromEntries(LAYOUTS.map((l) => [l.id, l]));
export const DEFAULT_LAYOUT_ID = 'tartaruga';
