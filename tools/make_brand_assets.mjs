/**
 * Gera resources/icon.png (1024x1024) e resources/splash.png (2732x2732)
 * a partir do sprite tile_dragon_red.png, preservando o pixel art.
 */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const SRC = 'assets/sprites/tile_dragon_red.png';
const OUT = 'resources';

await mkdir(OUT, { recursive: true });

const bgSvg = (size, title = false) => {
  const r = title ? 0.335 : 0.395;
  return `
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bg" cx="50%" cy="42%" r="72%">
      <stop offset="0%" stop-color="#2b1b13"/>
      <stop offset="55%" stop-color="#1a120e"/>
      <stop offset="100%" stop-color="#0e0a08"/>
    </radialGradient>
  </defs>
  <rect width="${size}" height="${size}" fill="url(#bg)"/>
  <circle cx="${size / 2}" cy="${size * 0.47}" r="${size * r}" fill="#1f6b46" opacity="0.55"/>
  <circle cx="${size / 2}" cy="${size * 0.47}" r="${size * r}" fill="none" stroke="#e8a33a" stroke-width="${size * 0.008}" opacity="0.85"/>
  <circle cx="${size / 2}" cy="${size * 0.47}" r="${size * (r - 0.03)}" fill="none" stroke="#7a4c27" stroke-width="${size * 0.0035}" opacity="0.9"/>
  ${title ? `
  <text x="50%" y="${size * 0.865}" text-anchor="middle" fill="#e8a33a"
        font-family="DejaVu Sans Mono, Menlo, Consolas, monospace"
        font-size="${size * 0.054}" font-weight="bold" letter-spacing="${size * 0.004}">MAHJONG SOLITAIRE</text>
  <text x="50%" y="${size * 0.915}" text-anchor="middle" fill="#b98a52"
        font-family="DejaVu Sans Mono, Menlo, Consolas, monospace"
        font-size="${size * 0.026}" letter-spacing="${size * 0.008}">PIXEL ART</text>` : ''}
</svg>`;
};

async function makeIcon() {
  const size = 1024;
  const tileH = 560;
  const tileW = Math.round(tileH * (140 / 183));
  const tile = await sharp(SRC)
    .resize(tileW, tileH, { kernel: 'nearest' })
    .png()
    .toBuffer();

  const shadow = await sharp(tile)
    .ensureAlpha()
    .composite([{ input: Buffer.from([0, 0, 0, 190]), raw: { width: 1, height: 1, channels: 4 }, tile: true, blend: 'dest-in' }])
    .blur(18)
    .png()
    .toBuffer();

  const x = Math.round((size - tileW) / 2);
  const y = Math.round(size * 0.47 - tileH / 2);

  await sharp(Buffer.from(bgSvg(size)))
    .composite([
      { input: shadow, left: x + 14, top: y + 20 },
      { input: tile, left: x, top: y },
    ])
    .png()
    .toFile(`${OUT}/icon.png`);
}

async function makeSplash() {
  const size = 2732;
  const tileH = 760;
  const tileW = Math.round(tileH * (140 / 183));
  const tile = await sharp(SRC)
    .resize(tileW, tileH, { kernel: 'nearest' })
    .png()
    .toBuffer();

  const shadow = await sharp(tile)
    .ensureAlpha()
    .composite([{ input: Buffer.from([0, 0, 0, 190]), raw: { width: 1, height: 1, channels: 4 }, tile: true, blend: 'dest-in' }])
    .blur(26)
    .png()
    .toBuffer();

  const x = Math.round((size - tileW) / 2);
  const y = Math.round(size * 0.38 - tileH / 2);

  await sharp(Buffer.from(bgSvg(size, true)))
    .composite([
      { input: shadow, left: x + 20, top: y + 28 },
      { input: tile, left: x, top: y },
    ])
    .png()
    .toFile(`${OUT}/splash.png`);
}

await makeIcon();
await makeSplash();
console.log('resources/icon.png e resources/splash.png gerados.');

// --- Camadas adaptativas do Android (foreground transparente + fundo) ---
const foregroundSvg = `
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <circle cx="512" cy="512" r="430" fill="#1f6b46" opacity="0.72"/>
  <circle cx="512" cy="512" r="430" fill="none" stroke="#e8a33a" stroke-width="9" opacity="0.9"/>
  <circle cx="512" cy="512" r="398" fill="none" stroke="#7a4c27" stroke-width="4" opacity="0.9"/>
</svg>`;

const backgroundSvg = `
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bg" cx="50%" cy="42%" r="72%">
      <stop offset="0%" stop-color="#2b1b13"/>
      <stop offset="55%" stop-color="#1a120e"/>
      <stop offset="100%" stop-color="#0e0a08"/>
    </radialGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#bg)"/>
</svg>`;

async function makeAdaptive() {
  const size = 1024;
  const tileH = 560;
  const tileW = Math.round(tileH * (140 / 183));
  const tile = await sharp(SRC)
    .resize(tileW, tileH, { kernel: 'nearest' })
    .png()
    .toBuffer();

  const shadow = await sharp(tile)
    .ensureAlpha()
    .composite([{ input: Buffer.from([0, 0, 0, 190]), raw: { width: 1, height: 1, channels: 4 }, tile: true, blend: 'dest-in' }])
    .blur(18)
    .png()
    .toBuffer();

  const x = Math.round((size - tileW) / 2);
  const y = Math.round((size - tileH) / 2);

  await sharp(Buffer.from(foregroundSvg))
    .composite([
      { input: shadow, left: x + 14, top: y + 20 },
      { input: tile, left: x, top: y },
    ])
    .png()
    .toFile(`${OUT}/icon-foreground.png`);

  await sharp(Buffer.from(backgroundSvg))
    .png()
    .toFile(`${OUT}/icon-background.png`);

  await sharp(`${OUT}/icon.png`)
    .png()
    .toFile(`${OUT}/icon-only.png`);
}

await makeAdaptive();
