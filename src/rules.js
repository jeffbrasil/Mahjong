/**
 * rules.js
 * Regras puras, sem DOM: tipos de peça, ocupação e "peça livre".
 */

export const TYPES = Object.freeze([
  ...Array.from({ length: 9 }, (_, i) => ({
    id: `char-${i + 1}`, suit: 'char', rank: i + 1,
    label: `${i + 1} Caracteres`, sprite: `tile_char_${i + 1}`,
  })),
  ...Array.from({ length: 9 }, (_, i) => ({
    id: `bamboo-${i + 1}`, suit: 'bamboo', rank: i + 1,
    label: `${i + 1} Bambus`, sprite: `tile_bamboo_${i + 1}`,
  })),
  ...Array.from({ length: 9 }, (_, i) => ({
    id: `dot-${i + 1}`, suit: 'dot', rank: i + 1,
    label: `${i + 1} Círculos`, sprite: `tile_dot_${i + 1}`,
  })),
  { id: 'wind-east', suit: 'wind', rank: 0, label: 'Leste', sprite: 'tile_wind_east' },
  { id: 'wind-south', suit: 'wind', rank: 0, label: 'Sul', sprite: 'tile_wind_south' },
  { id: 'wind-west', suit: 'wind', rank: 0, label: 'Oeste', sprite: 'tile_wind_west' },
  { id: 'wind-north', suit: 'wind', rank: 0, label: 'Norte', sprite: 'tile_wind_north' },
  { id: 'dragon-red', suit: 'dragon', rank: 0, label: 'Dragão Vermelho', sprite: 'tile_dragon_red' },
  { id: 'dragon-green', suit: 'dragon', rank: 0, label: 'Dragão Verde', sprite: 'tile_dragon_green' },
  { id: 'dragon-white', suit: 'dragon', rank: 0, label: 'Dragão Branco', sprite: 'tile_dragon_white' },
]);

export const TYPE_BY_ID = Object.freeze(
  Object.fromEntries(TYPES.map((t) => [t.id, t])),
);

export const posKey = (x, y, z) => `${x},${y},${z}`;

/**
 * Constrói um índice de ocupação por camada.
 * @param {Iterable} tiles peças ativas/ocupadas
 * @returns {{byLayer: Map<number, Map<string, object>>, maxZ: number}}
 */
export function makeOccupancy(tiles) {
  const byLayer = new Map();
  let maxZ = 0;
  for (const t of tiles) {
    if (t.removed) continue;
    if (!byLayer.has(t.z)) byLayer.set(t.z, new Map());
    byLayer.get(t.z).set(`${t.x},${t.y}`, t);
    if (t.z > maxZ) maxZ = t.z;
  }
  return { byLayer, maxZ };
}

/** Executa fn para peças com centro próximo (|dx|<2, |dy|<2). */
function forNearby(layerMap, x, y, fn) {
  if (!layerMap) return;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue;
      const t = layerMap.get(`${x + dx},${y + dy}`);
      if (t) fn(t);
    }
  }
}

/**
 * Uma peça está livre quando:
 *  - não existe peça ativa em nenhuma camada superior sobre ela; e
 *  - não existe peça adjacente nem à esquerda nem à direita, na mesma camada.
 */
export function isFree(tile, occ) {
  if (tile.removed) return false;

  // coberta por qualquer camada superior sobreposta
  for (let z = tile.z + 1; z <= occ.maxZ; z++) {
    const layer = occ.byLayer.get(z);
    if (!layer) continue;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (layer.has(`${tile.x + dx},${tile.y + dy}`)) return false;
      }
    }
  }

  const sameLayer = occ.byLayer.get(tile.z);
  if (!sameLayer) return true;

  let left = false;
  let right = false;
  // vizinhos laterais que tocam a peça (|dy| < 2 e 0 < |dx| <= 2)
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = 1; dx <= 2; dx++) {
      if (sameLayer.has(`${tile.x - dx},${tile.y + dy}`)) left = true;
      if (sameLayer.has(`${tile.x + dx},${tile.y + dy}`)) right = true;
    }
  }
  return !left || !right;
}

/** Lista as peças livres de um tabuleiro (array de peças ativas/removidas). */
export function freeTiles(tiles) {
  const occ = makeOccupancy(tiles);
  return tiles.filter((t) => !t.removed && isFree(t, occ));
}

/** Lista de pares livres do mesmo tipo. */
export function findFreePairs(tiles) {
  const free = freeTiles(tiles);
  const groups = new Map();
  for (const t of free) {
    if (!groups.has(t.type)) groups.set(t.type, []);
    groups.get(t.type).push(t);
  }
  const pairs = [];
  for (const [type, group] of groups) {
    if (group.length < 2) continue;
    for (let i = 0; i + 1 < group.length; i += 2) {
      pairs.push({ type, a: group[i], b: group[i + 1] });
    }
  }
  return pairs;
}

/** Quantidade de peças por tipo (debug/testes). */
export function typeCounts(tiles) {
  const counts = new Map();
  for (const t of tiles) {
    if (t.removed) continue;
    counts.set(t.type, (counts.get(t.type) || 0) + 1);
  }
  return counts;
}

/** Validação estrutural usada pelos testes. */
export function validateBoard(board) {
  const errors = [];
  const active = board.tiles.filter((t) => !t.removed);
  if (active.length % 2 !== 0) errors.push(`Número ímpar de peças: ${active.length}`);
  const counts = typeCounts(active);
  for (const [type, count] of counts) {
    if (count % 2 !== 0) errors.push(`Tipo ${type} sem par: ${count} peças`);
    if (count > 4) errors.push(`Tipo ${type} tem ${count} cópias`);
  }
  for (const t of active) {
    if (!TYPE_BY_ID[t.type]) errors.push(`Tipo desconhecido: ${t.type}`);
  }
  return errors;
}
