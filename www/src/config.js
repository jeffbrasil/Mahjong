/** Constantes de layout lógico e estilo. */
export const LOGICAL_W = 960;
export const LOGICAL_H = 540;

// Peças: sprite normalizado para 40x56; meia-célula lógica de 20x27.
export const TILE_W = 40;
export const TILE_H = 56;
export const HALF_W = 20;
export const HALF_H = 27;
export const Z_DX = -5;
export const Z_DY = -6;

export const BOARD_FRAME = { x: 8, y: 6, w: 664, h: 528 };
export const BOARD_INNER = { x: 46, y: 46, w: 588, h: 448 };

export const HUD = { x: 678, y: 8, w: 274, h: 524 };

export const COLORS = {
  bg: '#17110e',
  felt: '#1f6b46',
  feltDark: '#175237',
  feltLight: '#287c53',
  cream: '#f4e4be',
  gold: '#e8a33a',
  goldDark: '#9a5e19',
  dark: '#1c1411',
  dark2: '#2b211c',
  panel: '#2b2320',
  green: '#6fe06a',
  red: '#ed5a45',
  blue: '#5ec8f2',
  purple: '#ba7bea',
  gray: '#9e9696',
  white: '#ffffff',
};

export const UI_SCALE = 3; // divisor aplicado aos sprites grandes da folha
export const HUD_BUTTONS = [
  { id: 'hint', label: 'DICA', icon: 'ui_lamp', sub: '-50' },
  { id: 'shuffle', label: 'EMBARALHAR', icon: 'arrow_purple_right', sub: '' },
  { id: 'undo', label: 'DESFAZER', icon: 'arrow_green_left', sub: '' },
  { id: 'new', label: 'NOVO JOGO', icon: 'ui_dice_6', sub: '' },
  { id: 'menu', label: 'MENU', icon: 'ui_btn_menu_a', sub: '' },
  { id: 'exit', label: 'SAIR', icon: 'ui_btn_x', sub: '' },
];

export const TIME_LIMITS = {
  tartaruga: 600,
  piramide: 600,
  fortaleza: 600,
  facil: 300,
};

export const SHUFFLE_LIMIT = 3;
