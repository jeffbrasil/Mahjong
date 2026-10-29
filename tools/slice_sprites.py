#!/usr/bin/env python3
"""Fase 0 - fatiamento dos sprites de Mahjong Solitaire.

As imagens de assets/raw sao JPEGs sem transparencia: o fundo xadrez faz parte
da propria imagem.  Este script:

  1. estima as duas cores do xadrez a partir das bordas;
  2. encontra os pixels neutros/cinzentos alcancaveis pelas bordas (flood fill);
  3. salva cada sprite como PNG RGBA com recorte justo;
  4. agrupa particulas por dilatacao antes de recortar os efeitos;
  5. gera assets/sprites/*.png, assets/atlas.json e o contact sheet.

Observacao importante sobre o material recebido: os arquivos "Flores.jpeg" e
"ventos_e_dragoes.jpeg" estavam com os nomes trocados em relacao ao briefing.
O script detecta o conteudo (9 pecas = caracteres, 7 pecas = honras) e avisa.
Nenhuma arte nova e desenhada aqui.
"""

from __future__ import annotations

import json
import math
import os
import shutil
import sys
from collections import Counter, OrderedDict
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "assets" / "raw"
OUT = ROOT / "assets" / "sprites"
ATLAS = ROOT / "assets" / "atlas.json"
SHEET = ROOT / "assets" / "debug_contact_sheet.png"

# ---------------------------------------------------------------------------
# Configuracao
# ---------------------------------------------------------------------------
BG_SAT_MAX = 22       # saturacao maxima (max-min) de um pixel de xadrez
BG_LUM_MIN = 48       # faixa de luminancia que contem os dois tons
BG_LUM_MAX = 202
CROP_PAD = 2          # pixels transparentes ao redor dos recortes
MIN_COMPONENT = 24    # descarta ruido de JPEG solto
PARTICLE_DILATION = 25

TILES = OrderedDict()  # nome -> (crop rgba, bbox, origem)


# ---------------------------------------------------------------------------
# Utilidades de mascara
# ---------------------------------------------------------------------------
def load_rgb(path: Path) -> np.ndarray:
    return np.asarray(Image.open(path).convert("RGB")).astype(np.int16)


def estimate_checker_colors(rgb: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Pega as duas cores dominantes da moldura externa da imagem."""
    border = np.concatenate(
        [
            rgb[:8].reshape(-1, 3),
            rgb[-8:].reshape(-1, 3),
            rgb[:, :8].reshape(-1, 3),
            rgb[:, -8:].reshape(-1, 3),
        ]
    )
    # agrupa grosseiramente por luminancia
    lum = border.mean(1)
    dark = border[lum <= np.median(lum)]
    bright = border[lum > np.median(lum)]
    return dark.mean(0), bright.mean(0)


def background_mask(rgb: np.ndarray) -> np.ndarray:
    """Flood fill a partir das bordas pelos tons neutros do xadrez."""
    mx = rgb.max(axis=2)
    mn = rgb.min(axis=2)
    sat = mx - mn
    lum = rgb.mean(axis=2)
    candidate = (sat <= BG_SAT_MAX) & (lum >= BG_LUM_MIN) & (lum <= BG_LUM_MAX)

    # Remove pequenos furos da JPEG dentro do xadrez para o flood nao parar.
    # border_value=1 e essencial: sem isso a operacao zera a borda e nao
    # existe nenhum rotulo de fundo tocando a moldura da imagem.
    candidate = ndimage.binary_closing(candidate, np.ones((3, 3)), iterations=1,
                                       border_value=1)

    labels, _ = ndimage.label(candidate)
    border_labels = set(np.unique(labels[0, :]))
    border_labels |= set(np.unique(labels[-1, :]))
    border_labels |= set(np.unique(labels[:, 0]))
    border_labels |= set(np.unique(labels[:, -1]))
    border_labels.discard(0)
    bg = np.isin(labels, list(border_labels))
    # suaviza a borda do buraco sem invadir o contorno escuro dos sprites
    bg = ndimage.binary_closing(bg, np.ones((3, 3)), iterations=1,
                                border_value=1)
    return bg


def build_alpha(rgb: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Retorna (alpha binario, alpha suave por distancia ao xadrez)."""
    bg = background_mask(rgb)
    fg = ~bg

    # limpa sal e pimenta que nao fazem parte de um sprite
    labels, count = ndimage.label(fg, structure=np.ones((3, 3)))
    if count:
        sizes = np.bincount(labels.ravel())
        keep = sizes >= 6
        keep[0] = False
        fg = keep[labels]

    # alpha para particulas sem contorno: distancia as duas cores do xadrez
    dark, bright = estimate_checker_colors(rgb)
    d1 = np.linalg.norm(rgb - dark, axis=2)
    d2 = np.linalg.norm(rgb - bright, axis=2)
    dist = np.minimum(d1, d2)
    soft = np.clip((dist - 16.0) / 52.0, 0.0, 1.0) * 255.0
    soft = np.where(fg, soft, 0.0).astype(np.uint8)

    return fg.astype(bool), soft


def rgba_from_alpha(rgb: np.ndarray, y0, y1, x0, x1, alpha: np.ndarray) -> Image.Image:
    crop = rgb[y0:y1, x0:x1].astype(np.uint8)
    a = alpha[y0:y1, x0:x1]
    return Image.fromarray(np.dstack([crop, a]), "RGBA")


def bbox_of(mask: np.ndarray, pad: int = 0):
    ys, xs = np.where(mask)
    if len(xs) == 0:
        return None
    h, w = mask.shape
    x0 = max(0, int(xs.min()) - pad)
    y0 = max(0, int(ys.min()) - pad)
    x1 = min(w, int(xs.max()) + 1 + pad)
    y1 = min(h, int(ys.max()) + 1 + pad)
    return x0, y0, x1, y1


def add_sprite(name: str, rgb: np.ndarray, fg: np.ndarray, soft: np.ndarray,
               bbox, source: str, use_soft: bool = False,
               alpha_mask: np.ndarray | None = None):
    """Recorta e registra um sprite. bbox=(x0,y0,x1,y1) em coords da origem.

    alpha_mask permite recortes especiais (molduras vazadas e peças bloqueadas
    translúcidas cujo corpo quase se confunde com o xadrez).
    """
    x0, y0, x1, y1 = bbox
    x0 = max(0, x0); y0 = max(0, y0)
    x1 = min(rgb.shape[1], x1); y1 = min(rgb.shape[0], y1)
    if x1 <= x0 or y1 <= y0:
        raise ValueError(f"bbox invalida para {name}: {bbox}")
    if alpha_mask is not None:
        # a API de rgba_from_alpha recebe o alpha no tamanho da imagem toda
        alpha = np.zeros(fg.shape, dtype=np.uint8)
        alpha[y0:y1, x0:x1] = alpha_mask.astype(np.uint8) * 255
    elif use_soft:
        alpha = soft
    else:
        alpha = fg.astype(np.uint8) * 255
    img = rgba_from_alpha(rgb, y0, y1, x0, x1, alpha)
    TILES[name] = (img, (x0, y0, x1 - x0, y1 - y0), source)


def merge_mask_with_particles(fg: np.ndarray, x0, y0, x1, y1, dilate=PARTICLE_DILATION):
    """Agrupa fragmentos proximos (ex.: explosao) e devolve a bbox do grupo."""
    sub = fg[y0:y1, x0:x1]
    if not sub.any():
        return None
    if dilate > 0:
        grouped = ndimage.binary_dilation(sub, iterations=dilate)
        lbl, n = ndimage.label(grouped)
        # qualquer fragmento que encoste no grupo entra no recorte
        union = ndimage.binary_dilation(sub, iterations=1)  # apenas para ligar
        ys, xs = np.where(sub)
        return (x0 + int(xs.min()), y0 + int(ys.min()),
                x0 + int(xs.max()) + 1, y0 + int(ys.max()) + 1)
    ys, xs = np.where(sub)
    return (x0 + int(xs.min()), y0 + int(ys.min()),
            x0 + int(xs.max()) + 1, y0 + int(ys.max()) + 1)


def component_boxes(fg: np.ndarray, y0=0, y1=None, min_area=MIN_COMPONENT):
    y1 = fg.shape[0] if y1 is None else y1
    sub = fg[y0:y1, :]
    labels, n = ndimage.label(sub, structure=np.ones((3, 3)))
    boxes = []
    for idx in range(1, n + 1):
        ys, xs = np.where(labels == idx)
        if len(xs) < min_area:
            continue
        boxes.append((int(xs.min()), int(ys.min()) + y0,
                      int(xs.max()) + 1, int(ys.max()) + 1 + y0,
                      int(len(xs))))
    return boxes


def reading_order(boxes):
    """Agrupa linhas por centro Y e ordena por X (ordem de leitura)."""
    boxes = sorted(boxes, key=lambda b: (b[1] + b[3]) / 2)
    rows = []
    for b in boxes:
        cy = (b[1] + b[3]) / 2
        if not rows or abs(cy - rows[-1][0]) > 50:
            rows.append([cy, [b]])
        else:
            rows[-1][1].append(b)
    ordered = []
    for _, row in rows:
        ordered.extend(sorted(row, key=lambda b: (b[0] + b[2]) / 2))
    return ordered


def glyph_mask(rgb: np.ndarray, kind: str) -> np.ndarray:
    r = rgb[:, :, 0].astype(np.int16)
    g = rgb[:, :, 1].astype(np.int16)
    b = rgb[:, :, 2].astype(np.int16)
    if kind == "yellow":
        return (r > 180) & (g > 130) & (b < 145) & ((r - b) > 90)
    if kind == "blue":
        return (b > 120) & ((b - r) > 35) & ((b - g) > 15)
    if kind == "green":
        return (g > 110) & ((g - r) > 35) & ((g - b) > 15)
    raise ValueError(kind)


# ---------------------------------------------------------------------------
# Extracao dos tiles
# ---------------------------------------------------------------------------
def tile_row_boxes(fg: np.ndarray):
    boxes = [b for b in component_boxes(fg, 700, 1200, 500) if b[3] - b[1] > 90]
    return reading_order(boxes)


def extract_tile_sheet(path: Path, role: str, fg: np.ndarray, rgb: np.ndarray):
    boxes = tile_row_boxes(fg)
    print(f"  linha principal: {len(boxes)} peças detectadas")
    role_map = {
        "char": [f"tile_char_{i}" for i in range(1, 10)],
        "bamboo": [f"tile_bamboo_{i}" for i in range(1, 10)],
        "dot": [f"tile_dot_{i}" for i in range(1, 10)],
        "honors": [
            "tile_wind_east", "tile_wind_south", "tile_wind_west",
            "tile_wind_north", "tile_dragon_red", "tile_dragon_green",
            "tile_dragon_white",
        ],
    }
    names = role_map.get(role)
    if names is None or len(boxes) != len(names):
        print(
            f"  AVISO: contagem inesperada em {path.name}: "
            f"encontrei {len(boxes)}, esperava {len(names) if names else 0}. "
            "Usando nomes genéricos rowX_colY para esta linha."
        )
        for r, b in enumerate(boxes):
            n = f"row{r}_col0"
            add_sprite(n, rgb, fg, fg, (b[0] - CROP_PAD, b[1] - CROP_PAD,
                                        b[2] + CROP_PAD, b[3] + CROP_PAD),
                               f"assets/raw/{path.name}")
        return
    for name, b in zip(names, boxes):
        add_sprite(name, rgb, fg, fg,
                   (b[0] - CROP_PAD, b[1] - CROP_PAD,
                    b[2] + CROP_PAD, b[3] + CROP_PAD),
                   f"assets/raw/{path.name}")


# ---------------------------------------------------------------------------
# Extracao de areas da folha de animacoes
# ---------------------------------------------------------------------------
def extract_animations(rgb, fg, soft):
    src = "assets/raw/animacoes.jpeg"

    # 1) versos
    backs = reading_order(component_boxes(fg, 100, 430, 1000))
    back_names = ["back_green", "back_blue", "back_red"]
    if len(backs) >= 3:
        for name, b in zip(back_names, backs[:3]):
            add_sprite(name, rgb, fg, soft,
                       (b[0] - CROP_PAD, b[1] - CROP_PAD,
                        b[2] + CROP_PAD, b[3] + CROP_PAD), src)

    # 2) peças bloqueadas (o cadeado esta incluido no recorte).
    # O corpo dessas peças é translúcido e quase neutro; o flood-fill o
    # confundiria com o xadrez. Por isso ele recebe uma máscara arredondada
    # própria, e o cadeado/cantos usam a máscara de primeiro plano.
    locked_specs = [
        # crop, tile bounds, tipo
        ((158, 470, 355, 724), (166, 514, 321, 718)),   # 發 apagada
        ((391, 470, 588, 724), (399, 514, 552, 718)),   # 南
        ((622, 470, 820, 724), (630, 514, 784, 718)),   # 中
    ]
    for i, (crop, tile) in enumerate(locked_specs):
        x0, y0, x1, y1 = crop
        h, w = y1 - y0, x1 - x0
        manual = np.zeros((h, w), dtype=bool)
        # corpo do tile: retângulo com cantos arredondados, em coordenadas locais
        tx0, ty0, tx1, ty1 = tile
        radius = 16
        yy, xx = np.mgrid[0:h, 0:w]
        lx = tx0 - x0; ly = ty0 - y0
        rx = tx1 - x0; ry = ty1 - y0
        inside = (xx >= lx) & (xx < rx) & (yy >= ly) & (yy < ry)
        # remove os quatro cantos fora do raio
        for cx, cy in ((lx + radius, ly + radius), (rx - radius - 1, ly + radius),
                       (lx + radius, ry - radius - 1), (rx - radius - 1, ry - radius - 1)):
            corner_out = ((xx - cx) ** 2 + (yy - cy) ** 2 > radius ** 2)
            if cx < (lx + rx) / 2 and cy < (ly + ry) / 2:
                zone = (xx < lx + radius) & (yy < ly + radius)
            elif cx > (lx + rx) / 2 and cy < (ly + ry) / 2:
                zone = (xx >= rx - radius) & (yy < ly + radius)
            elif cx < (lx + rx) / 2 and cy > (ly + ry) / 2:
                zone = (xx < lx + radius) & (yy >= ry - radius)
            else:
                zone = (xx >= rx - radius) & (yy >= ry - radius)
            inside &= ~(zone & corner_out)
        manual |= inside
        # cadeado vermelho + seu contorno escuro, mas sem pedaços de xadrez
        sub_rgb = rgb[y0:y1, x0:x1]
        red = (sub_rgb[:, :, 0] > 115) & \
              (sub_rgb[:, :, 0] > sub_rgb[:, :, 1] * 1.45) & \
              (sub_rgb[:, :, 0] > sub_rgb[:, :, 2] * 1.45)
        lock = ndimage.binary_dilation(red, iterations=7) & fg[y0:y1, x0:x1]
        manual |= lock
        alpha_bb = bbox_of(manual, 0)
        if alpha_bb is None:
            continue
        ax0, ay0, ax1, ay1 = alpha_bb
        add_sprite(f"locked_{i + 1}", rgb, fg, soft,
                   (x0 + ax0, y0 + ay0, x0 + ax1, y0 + ay1), src,
                   alpha_mask=manual[ay0:ay1, ax0:ax1])

    # cadeado: recorta a parte vermelha no canto superior direito de locked_2
    reg = (500, 465, 590, 580)
    sub_rgb = rgb[reg[1]:reg[3], reg[0]:reg[2]]
    red = (sub_rgb[:, :, 0] > 125) & \
          (sub_rgb[:, :, 0] > sub_rgb[:, :, 1] * 1.55) & \
          (sub_rgb[:, :, 0] > sub_rgb[:, :, 2] * 1.55)
    near = ndimage.binary_dilation(red, iterations=7)
    lock_mask = near & fg[reg[1]:reg[3], reg[0]:reg[2]]
    bb = bbox_of(lock_mask, 1)
    if bb:
        x0, y0, x1, y1 = bb
        add_sprite("icon_lock", rgb, fg, soft,
                   (reg[0] + x0, reg[1] + y0, reg[0] + x1, reg[1] + y1), src)
    else:
        print("  AVISO: cadeado não encontrado em locked_2")

    # 3) molduras de seleção: extrai apenas o anel colorido + contorno escuro
    frame_boxes = {
        "frame_yellow": (952, 486, 1161, 742, "yellow"),
        "frame_blue": (1194, 487, 1402, 742, "blue"),
        "frame_green": (1432, 482, 1643, 739, "green"),
    }
    for name, (x0, y0, x1, y1, kind) in frame_boxes.items():
        sub = rgb[y0:y1, x0:x1]
        colored = glyph_mask(sub, kind)
        near_color = ndimage.binary_dilation(colored, iterations=8)
        lum = sub.astype(np.float32).mean(axis=2)
        # contorno escuro próximo do anel; nada de restos beges do tile
        alpha = near_color & (lum < 95) & fg[y0:y1, x0:x1]
        alpha |= colored
        bb = bbox_of(alpha, 1)
        if bb is None:
            print(f"  AVISO: moldura {name} não encontrada")
            continue
        cx0, cy0, cx1, cy1 = bb
        ring = alpha[cy0:cy1, cx0:cx1].copy()
        # o miolo da moldura contém restos do tile; remove-o de forma
        # retangular, deixando apenas o anel decorativo externo.
        inset = 26
        if ring.shape[0] > inset * 2 + 8 and ring.shape[1] > inset * 2 + 8:
            ring[inset:ring.shape[0] - inset, inset:ring.shape[1] - inset] = False
        add_sprite(name, rgb, fg, soft,
                   (x0 + cx0, y0 + cy0, x0 + cx1, y0 + cy1), src,
                   alpha_mask=ring)

    # 4) sequencia de quebra (agrupada com dilatacao)
    break_regions = [
        ("break_0", 100, 1150, 350, 1445),
        ("break_1", 380, 1150, 630, 1445),
        ("break_2", 670, 1150, 1010, 1445),
        ("break_3", 1030, 1150, 1320, 1445),
    ]
    for name, x0, y0, x1, y1 in break_regions:
        bb = merge_mask_with_particles(fg, x0, y0, x1, y1, dilate=16)
        if bb is None:
            print(f"  AVISO: {name} não encontrado")
            continue
        add_sprite(name, rgb, fg, soft,
                   (bb[0] - CROP_PAD, bb[1] - CROP_PAD,
                    bb[2] + CROP_PAD, bb[3] + CROP_PAD), src)

    # 5) efeitos de brilho/estrelas. Cada regiao agrupa um conjunto visual.
    fx_regions = {
        "fx_dust": (90, 1580, 340, 1870),
        "fx_stars_a": (390, 1580, 600, 1870),
        "fx_stars_b": (670, 1580, 910, 1870),
        "fx_sparkles": (1000, 1580, 1320, 1870),
        "fx_shine": (1440, 1580, 1660, 1870),
        "fx_glow": (95, 1880, 330, 2210),
    }
    for name, (x0, y0, x1, y1) in fx_regions.items():
        bb = merge_mask_with_particles(fg, x0, y0, x1, y1, dilate=25)
        if bb is None:
            print(f"  AVISO: {name} não encontrado")
            continue
        add_sprite(name, rgb, fg, soft,
                   (bb[0] - CROP_PAD, bb[1] - CROP_PAD,
                    bb[2] + CROP_PAD, bb[3] + CROP_PAD), src, use_soft=True)

    # 6) ultima faixa: setas, dica, checks e X
    region_sprites = {
        "arrow_yellow_down": (385, 1900, 555, 2130),
        "arrow_blue_down": (560, 1900, 690, 2130),
        "arrow_purple_right": (395, 2115, 565, 2310),
        "arrow_green_left": (1055, 1920, 1230, 2140),
        "arrow_red_left": (1055, 2140, 1230, 2310),
        "icon_check_a": (1370, 1960, 1520, 2120),
        "icon_check_b": (1370, 2130, 1520, 2310),
        "icon_x_a": (1540, 1960, 1670, 2120),
        "icon_x_b": (1540, 2130, 1680, 2310),
    }
    for name, (x0, y0, x1, y1) in region_sprites.items():
        bb = bbox_of(fg[y0:y1, x0:x1], 0)
        if bb is None:
            print(f"  AVISO: {name} não encontrado")
            continue
        a, b, c, d = bb
        add_sprite(name, rgb, fg, soft,
                   (x0 + a - CROP_PAD, y0 + b - CROP_PAD,
                    x0 + c + CROP_PAD, y0 + d + CROP_PAD), src, use_soft=True)

    # a moldura "dica" tem fundo xadrez interno; salva só o anel dourado e o
    # texto, nunca o interior da moldura.
    hx0, hy0, hx1, hy1 = (690, 1880, 1060, 2320)
    sub = rgb[hy0:hy1, hx0:hx1]
    r = sub[:, :, 0]; g = sub[:, :, 1]; b = sub[:, :, 2]
    gold = (r > 120) & (g > 80) & (b < 150) & ((r - b) > 35) & ((g - b) > 10)
    near_gold = ndimage.binary_dilation(gold, iterations=5)
    hint_lum = sub.astype(np.float32).mean(axis=2)
    hint_alpha = fg[hy0:hy1, hx0:hx1] & near_gold & ((hint_lum < 95) | gold)
    bb = bbox_of(hint_alpha, 0)
    if bb is not None:
        a, b0, c, d = bb
        alpha_crop = np.pad(hint_alpha[b0:d, a:c],
                            ((CROP_PAD, CROP_PAD), (CROP_PAD, CROP_PAD)),
                            mode="constant")
        add_sprite("hint_frame", rgb, fg, soft,
                   (hx0 + a - CROP_PAD, hy0 + b0 - CROP_PAD,
                    hx0 + c + CROP_PAD, hy0 + d + CROP_PAD), src,
                   alpha_mask=alpha_crop)
    else:
        print("  AVISO: hint_frame não encontrada")


# ---------------------------------------------------------------------------
# UI (somente dots.jpeg)
# ---------------------------------------------------------------------------
def extract_ui(rgb, fg, soft):
    src = "assets/raw/dots.jpeg"
    regions = {
        # 9-slice
        "ui_wood_corner_tl": (18, 1768, 152, 1908),
        "ui_wood_edge_t": (164, 1770, 539, 1844),
        "ui_wood_corner_tr": (550, 1768, 684, 1908),
        "ui_wood_edge_l": (18, 1917, 86, 2222),
        "ui_wood_edge_r": (613, 1917, 681, 2222),
        "ui_wood_corner_bl": (18, 2230, 152, 2362),
        "ui_wood_edge_b": (164, 2288, 539, 2362),
        "ui_wood_corner_br": (550, 2230, 684, 2362),
        "ui_board": (695, 1768, 1285, 2362),
        # mini ventos
        "ui_wind_mini_east": (1320, 1770, 1430, 1895),
        "ui_wind_mini_south": (1433, 1770, 1543, 1895),
        "ui_wind_mini_west": (1545, 1770, 1655, 1895),
        "ui_wind_mini_north": (1658, 1770, 1768, 1895),
        # HUD
        "ui_timebar": (1290, 1898, 1335, 2145),
        "ui_dice_6": (1345, 1900, 1455, 2025),
        "ui_dice_3": (1345, 2025, 1455, 2145),
        "ui_bell": (1465, 1920, 1550, 2000),
        "ui_lamp": (1465, 1995, 1555, 2125),
        "ui_counter_a": (1550, 1895, 1765, 2000),
        "ui_counter_b": (1558, 2005, 1765, 2100),
        # botoes
        "ui_btn_play": (1290, 2150, 1392, 2260),
        "ui_btn_jogar": (1385, 2150, 1570, 2260),
        "ui_btn_menu_a": (1572, 2150, 1765, 2260),
        "ui_btn_x": (1290, 2250, 1392, 2358),
        "ui_btn_sair": (1385, 2250, 1570, 2358),
        "ui_btn_menu_b": (1572, 2250, 1765, 2358),
    }
    for name, (x0, y0, x1, y1) in regions.items():
        bb = bbox_of(fg[y0:y1, x0:x1], 0)
        if bb is None:
            print(f"  AVISO: UI {name} não encontrada")
            continue
        a, b, c, d = bb
        use_soft = name not in {"ui_board"} and name.startswith("ui_") and False
        add_sprite(name, rgb, fg, soft,
                   (x0 + a, y0 + b, x0 + c, y0 + d), src,
                   use_soft=False)


# ---------------------------------------------------------------------------
# Saida
# ---------------------------------------------------------------------------
def save_all():
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True, exist_ok=True)

    atlas = OrderedDict()
    for name, (img, (x, y, w, h), source) in TILES.items():
        fname = f"{name}.png"
        img.save(OUT / fname)
        atlas[name] = {
            "x": int(x), "y": int(y), "w": int(w), "h": int(h),
            "source": source, "file": f"assets/sprites/{fname}",
        }

    ATLAS.write_text(json.dumps(atlas, indent=2, ensure_ascii=False) + "\n",
                     encoding="utf-8")
    make_contact_sheet()
    return atlas


def make_contact_sheet():
    entries = list(TILES.items())
    cell_w, cell_h = 260, 260
    cols = 6
    rows = math.ceil(len(entries) / cols)
    sheet = Image.new("RGBA", (cols * cell_w, rows * cell_h), (38, 32, 30, 255))
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype(
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 14)
    except Exception:
        font = ImageFont.load_default()

    for i, (name, (img, *_)) in enumerate(entries):
        cx = (i % cols) * cell_w
        cy = (i // cols) * cell_h
        draw.rectangle([cx, cy, cx + cell_w - 1, cy + cell_h - 1],
                       outline=(78, 66, 60, 255))
        iw, ih = img.size
        scale = min(1.0, (cell_w - 20) / max(1, iw), (cell_h - 42) / max(1, ih))
        # apenas reducao inteira quando possivel, para o contato nao borrar
        s = max(1, int(scale)) if scale < 1 else 1
        if s > 1:
            disp = img.resize((iw // s, ih // s), Image.Resampling.NEAREST)
        elif scale < 1:
            disp = img.resize((max(1, int(iw * scale)), max(1, int(ih * scale))),
                              Image.Resampling.NEAREST)
        else:
            disp = img
        dx = cx + (cell_w - disp.width) // 2
        dy = cy + 10 + (cell_h - 36 - disp.height) // 2
        sheet.alpha_composite(disp, (dx, dy))
        label = f"{name}  {iw}x{ih}"
        draw.text((cx + 8, cy + cell_h - 26), label, fill=(231, 190, 104), font=font)

    sheet.convert("RGB").save(SHEET)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    if not RAW.exists():
        sys.exit("assets/raw nao encontrado")
    print("Mahjong sprite slicer")
    print("=" * 62)

    needed = ["animacoes.jpeg", "Flores.jpeg", "bambus.jpeg",
              "dots.jpeg", "ventos_e_dragoes.jpeg"]
    for fname in needed:
        if not (RAW / fname).exists():
            sys.exit(f"ERRO: falta {fname} em assets/raw")

    # Mascaras por folha
    sheets = {}
    for fname in needed:
        rgb = load_rgb(RAW / fname)
        fg, soft = build_alpha(rgb)
        sheets[fname] = (rgb, fg, soft)

    warnings = []

    # --- Linhas de tiles -------------------------------------------------
    print("\n[1/4] Linhas de tiles")
    # As folhas sem UI sao identificadas pelo CONTEUDO (9 = caracteres,
    # 7 = honras), nao pelo nome. Se o nome do arquivo nao combinar com o
    # conteudo, avisamos, mas ainda extraimos com os nomes corretos.
    expected_roles = {
        "Flores.jpeg": "char",
        "ventos_e_dragoes.jpeg": "honors",
    }
    for fname, expected_role in expected_roles.items():
        rgb, fg, soft = sheets[fname]
        n = len(tile_row_boxes(fg))
        role = "char" if n == 9 else "honors" if n == 7 else None
        if role is None:
            msg = (f"Contagem inesperada em {fname}: {n} peças. "
                   "Nao sei se sao caracteres ou honras; usando nomes genericos.")
            warnings.append(msg)
            print("  AVISO:", msg)
            extract_tile_sheet(RAW / fname, role or "unknown", fg, rgb)
            continue
        if role != expected_role:
            actual = "caracteres (9)" if role == "char" else "honras (7)"
            expected = "caracteres (9)" if expected_role == "char" else "honras (7)"
            msg = (f"{fname} contém {n} peças; o nome sugere {expected}, "
                   f"mas o conteúdo detectado é {actual}. Os nomes dos sprites "
                   "foram gerados pelo conteúdo.")
            warnings.append(msg)
            print("  AVISO:", msg)
        print(f"  {fname}: {n} -> {role}")
        extract_tile_sheet(RAW / fname, role, fg, rgb)

    for fname, role in [("bambus.jpeg", "bamboo"), ("dots.jpeg", "dot")]:
        rgb, fg, soft = sheets[fname]
        print(f"  {fname}: {role}")
        extract_tile_sheet(RAW / fname, role, fg, rgb)

    # --- Animacoes -------------------------------------------------------
    print("\n[2/4] Animações e efeitos")
    rgb, fg, soft = sheets["animacoes.jpeg"]
    extract_animations(rgb, fg, soft)

    # --- UI --------------------------------------------------------------
    print("\n[3/4] Interface")
    rgb, fg, soft = sheets["dots.jpeg"]
    extract_ui(rgb, fg, soft)

    # --- Saida -----------------------------------------------------------
    print("\n[4/4] Gerando arquivos")
    atlas = save_all()

    groups = Counter()
    for name in atlas:
        if name.startswith("tile_char"): g = "tile_char"
        elif name.startswith("tile_bamboo"): g = "tile_bamboo"
        elif name.startswith("tile_dot"): g = "tile_dot"
        elif name.startswith("tile_wind"): g = "tile_wind"
        elif name.startswith("tile_dragon"): g = "tile_dragon"
        elif name.startswith("back_"): g = "back"
        elif name.startswith("locked_"): g = "locked"
        elif name.startswith("frame_"): g = "frame"
        elif name.startswith("break_"): g = "break"
        elif name.startswith("fx_"): g = "fx"
        elif name.startswith("arrow_"): g = "arrow"
        elif name.startswith("icon_"): g = "icon"
        elif name == "hint_frame": g = "hint_frame"
        elif name.startswith("ui_"): g = "ui"
        else: g = "outros"
        groups[g] += 1

    print(f"  {len(atlas)} sprites salvos em assets/sprites/")
    for g, n in groups.items():
        print(f"    {g:12s} {n:3d}")
    if warnings:
        print("\nAvisos:")
        for w in warnings:
            print("  -", w)
    else:
        print("\nNenhum aviso.")
    print("\nAtlas:", ATLAS.relative_to(ROOT))
    print("Contato:", SHEET.relative_to(ROOT))
    print("Pronto.")


if __name__ == "__main__":
    main()
