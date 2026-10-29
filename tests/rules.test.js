#!/usr/bin/env node
/**
 * Prova, por simulação, que 1.000 seeds de cada layout são resolvíveis.
 * Também valida contagens, pares, cópias por tipo e o gerador de sequência.
 *
 * Uso: node tests/rules.test.js [seedMaxima]
 */
import { LAYOUTS } from '../src/layouts.js';
import { generateBoard, replaySolution, shuffleRemaining } from '../src/generator.js';
import { validateBoard, findFreePairs, freeTiles } from '../src/rules.js';

const MAX_SEEDS = Number(process.argv[2] || 1000);
let failures = 0;
let totalPairs = 0;
const started = Date.now();

console.log('Mahjong Solitaire — testes de regras/geração');
console.log(`Seeds por layout: ${MAX_SEEDS}`);
console.log('='.repeat(62));

for (const layout of LAYOUTS) {
  const t0 = Date.now();
  let localFails = 0;
  let minPairs = Infinity;
  let maxPairs = 0;
  for (let s = 1; s <= MAX_SEEDS; s++) {
    try {
      const board = generateBoard(layout, s);
      const errors = validateBoard(board);
      if (board.tiles.length !== layout.tileCount) {
        errors.push(`tamanho ${board.tiles.length} != ${layout.tileCount}`);
      }
      const counts = new Map();
      for (const t of board.tiles) counts.set(t.type, (counts.get(t.type) || 0) + 1);
      for (const [type, c] of counts) {
        if (c !== 2 && c !== 4) errors.push(`tipo ${type} com ${c} cópias`);
      }
      // simulação completa da solução conhecida
      const sim = replaySolution(board);
      if (!sim.ok) errors.push(`simulação: ${sim.reason}`);
      totalPairs += sim.pairs;
      // nenhuma peça órfã: enquanto houver peças, cada tipo tem par
      const active = board.tiles.filter((t) => !t.removed);
      if (active.length % 2 !== 0) errors.push('sobraram peças ímpares');
      // verifica que a API de pares livres funciona durante a partida e
      // que existe pelo menos uma jogada no início.
      if (findFreePairs(board.tiles).length === 0) {
        errors.push('nenhum par livre no início');
      }
      const free = freeTiles(board.tiles);
      if (free.length < 2) errors.push('menos de duas peças livres no início');

      if (errors.length) {
        localFails++;
        if (localFails <= 3) {
          console.error(`  FALHA seed ${s} [${layout.id}]:`, errors.join('; '));
        }
      }
    } catch (err) {
      localFails++;
      if (localFails <= 3) {
        console.error(`  ERRO seed ${s} [${layout.id}]:`, err.message);
      }
    }
  }
  failures += localFails;
  const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
  const status = localFails === 0 ? 'OK  ' : 'FALHA';
  console.log(
    `${status} ${layout.name.padEnd(11)} ${String(layout.tileCount).padStart(3)} peças ` +
    `(${layout.pairCount} pares)  seeds ${MAX_SEEDS - localFails}/${MAX_SEEDS}  ${elapsed}s`,
  );
}


// ---------------------------------------------------------------------------
// Embaralhamento: os tipos são regerados para as posições restantes e o
// tabuleiro deve continuar resolvível, sem alterar nenhuma posição.
// ---------------------------------------------------------------------------
console.log('');
console.log('Teste de embaralhamento (50 seeds por layout)');
let shuffleFails = 0;
for (const layout of LAYOUTS) {
  let localFails = 0;
  for (let s = 1; s <= 50; s++) {
    try {
      const board = generateBoard(layout, s);
      // remove algumas jogadas usando a própria solução
      const steps = Math.max(1, Math.floor(board.solution.length * 0.35));
      for (let i = 0; i < steps; i++) {
        const step = board.solution[i];
        board.tiles[step.a].removed = true;
        board.tiles[step.b].removed = true;
        board.remaining -= 2;
      }
      const before = board.tiles.map((t) => `${t.x},${t.y},${t.z}`);
      const seed = 900000 + s;
      shuffleRemaining(layout, board, seed);
      const after = board.tiles.map((t) => `${t.x},${t.y},${t.z}`);
      if (before.join('|') !== after.join('|')) throw new Error('posições mudaram');
      const sim = replaySolution(board, board.solution);
      if (!sim.ok) throw new Error(`solução inválida após embaralhar: ${sim.reason}`);
      const active = board.tiles.filter((t) => !t.removed);
      if (active.length !== layout.tileCount - steps * 2) {
        throw new Error('quantidade de peças ativas mudou');
      }
      const counts = new Map();
      for (const t of active) counts.set(t.type, (counts.get(t.type) || 0) + 1);
      for (const [type, count] of counts) {
        if (count % 2 !== 0) throw new Error(`tipo ímpar após embaralhar: ${type}`);
      }
    } catch (err) {
      localFails++;
      if (localFails <= 2) console.error(`  FALHA shuffle seed ${s} [${layout.id}]:`, err.message);
    }
  }
  shuffleFails += localFails;
  console.log(`${localFails === 0 ? 'OK  ' : 'FALHA'} ${layout.name.padEnd(11)} 50/50 embaralhamentos`);
}
if (shuffleFails) failures += shuffleFails;

const elapsed = ((Date.now() - started) / 1000).toFixed(2);
console.log('='.repeat(62));
console.log(`Total de pares simulados: ${totalPairs.toLocaleString('pt-BR')}`);
console.log(`Tempo: ${elapsed}s`);
if (failures) {
  console.error(`FALHOU: ${failures} erro(s).`);
  process.exit(1);
}
console.log('TUDO OK: todos os tabuleiros gerados são 100% resolvíveis.');
