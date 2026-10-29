/**
 * generator.js
 * Geração SEMPRE resolvível:
 * começa com todas as posições ocupadas e retira pares de peças livres em
 * ordem reversa. Os pares ganham o mesmo tipo. A sequência de retiradas é,
 * por construção, uma solução completa do tabuleiro.
 */

import { TYPES, isFree, makeOccupancy } from './rules.js';

/** RNG determinístico (mulberry32). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedToUint(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) return seed >>> 0;
  const s = String(seed ?? '');
  // Um seed numérico (inclusive vindo da URL, que é string) mantém o mesmo
  // valor numérico mostrado no HUD, permitindo copiar e reproduzir a partida.
  if (/^\d{1,12}$/.test(s)) return Number(s) >>> 0;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function shuffle(array, rng) {
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Escolhe tipos para os pares. Cada tipo escolhido aparece duas vezes (dois
 * pares = quatro peças); em quantidades ímpares de pares, o último tipo
 * aparece uma vez (duas peças).
 */
export function makePairTypes(pairCount, rng) {
  const need = Math.ceil(pairCount / 2);
  const chosen = shuffle(TYPES.map((t) => t.id), rng).slice(0, need);
  const bag = [];
  for (const id of chosen) {
    bag.push(id);
    bag.push(id);
  }
  return shuffle(bag.slice(0, pairCount), rng);
}

function pickTwo(free, rng) {
  const i = Math.floor(rng() * free.length);
  let j = Math.floor(rng() * (free.length - 1));
  if (j >= i) j++;
  return [free[i], free[j]];
}

/**
 * Calcula uma sequência de retirada e as atribuições de tipos.
 * @param {Array<{x:number,y:number,z:number}>} positions
 * @param {() => number} rng
 * @param {number} [attempts]
 */
export function peelSequence(positions, rng, attempts = 60) {
  const pairCount = positions.length / 2;
  const typesBag = makePairTypes(pairCount, rng);

  for (let attempt = 0; attempt < attempts; attempt++) {
    const active = positions.map((p, i) => ({
      ...p, id: i, removed: false,
    }));
    let occ = makeOccupancy(active);
    const sequence = [];
    let ok = true;

    for (let p = 0; p < pairCount; p++) {
      const free = [];
      for (const t of active) {
        if (!t.removed && isFree(t, occ)) free.push(t);
      }
      if (free.length < 2) { ok = false; break; }
      let a, b;
      if (free.length === 2) {
        [a, b] = free;
      } else {
        [a, b] = pickTwo(free, rng);
      }
      const type = typesBag[p];
      sequence.push({ type, a: a.id, b: b.id });
      a.removed = true;
      b.removed = true;
      // atualiza ocupação sem reconstruir o índice
      occ.byLayer.get(a.z).delete(`${a.x},${a.y}`);
      occ.byLayer.get(b.z).delete(`${b.x},${b.y}`);
      if (a.z !== b.z) {
        // não há caso nos layouts atuais, mas mantém o código genérico
        occ = makeOccupancy(active);
      }
      while (occ.maxZ > 0 && !occ.byLayer.has(occ.maxZ)) occ.maxZ--;
    }

    if (ok) return sequence;
    // A tentativa falhou (situação rara): a proxima usa outras escolhas.
  }
  throw new Error('Não foi possível gerar uma sequência resolvível para o layout.');
}

/**
 * Cria um tabuleiro completo.
 * @returns {{layoutId:string, seed:number, tiles:Array, solution:Array, sequence:Array}}
 */
export function generateBoard(layout, seed) {
  const seedUint = seedToUint(seed);
  const rng = mulberry32(seedUint);
  const sequence = peelSequence(layout.tiles, rng);
  const tiles = layout.tiles.map((p, i) => ({
    ...p, idx: i, id: i, type: null, removed: false,
  }));
  for (const step of sequence) {
    tiles[step.a].type = step.type;
    tiles[step.b].type = step.type;
  }
  return {
    layoutId: layout.id,
    seed: seedUint,
    tiles,
    solution: sequence,
    moves: [],
    remaining: tiles.length,
  };
}

/**
 * Reembaralha os TIPOS das peças restantes, mantendo as posições.
 * O conjunto restante é regerado pelo processo reverso.
 */
export function shuffleRemaining(layout, board, seed) {
  const remaining = board.tiles.filter((t) => !t.removed);
  if (remaining.length === 0) return board;
  if (remaining.length % 2 !== 0) {
    throw new Error('Não é possível embaralhar um número ímpar de peças.');
  }
  const seedUint = seedToUint(seed);
  const rng = mulberry32(seedUint);
  const positions = remaining.map((t) => ({ x: t.x, y: t.y, z: t.z }));
  const sequence = peelSequence(positions, rng);
  const byIndex = new Map(remaining.map((t, i) => [i, t]));
  const globalSequence = [];
  for (const step of sequence) {
    const a = byIndex.get(step.a);
    const b = byIndex.get(step.b);
    a.type = step.type;
    b.type = step.type;
    // board.solution usa os mesmos ids globais da solução original
    globalSequence.push({ type: step.type, a: a.id, b: b.id });
  }
  board.seed = seedUint;
  board.solution = globalSequence;
  return board;
}

/** Reproduz uma sequência de solução no tabuleiro, validando as regras. */
export function replaySolution(board, sequence = board.solution) {
  // Preserva peças já removidas (importante após um embaralhamento).
  const tiles = board.tiles.map((t) => ({ ...t }));
  const occ = makeOccupancy(tiles);
  let pairs = 0;
  for (const step of sequence) {
    const a = tiles[step.a];
    const b = tiles[step.b];
    if (!a || !b || a.removed || b.removed) {
      return { ok: false, reason: 'peça inexistente ou já removida', pairs };
    }
    if (a.type !== b.type) return { ok: false, reason: 'tipos diferentes', pairs };
    if (!isFree(a, occ) || !isFree(b, occ)) return { ok: false, reason: 'peça bloqueada', pairs };
    // remove em sequência para que b continue livre depois de a
    a.removed = true;
    occ.byLayer.get(a.z).delete(`${a.x},${a.y}`);
    if (!isFree(b, occ)) return { ok: false, reason: 'b ficou bloqueada', pairs };
    b.removed = true;
    occ.byLayer.get(b.z).delete(`${b.x},${b.y}`);
    pairs++;
  }
  return { ok: tiles.every((t) => t.removed), reason: '', pairs };
}
