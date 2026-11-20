/* Qwentir Virtual Office — pixel assets in Soul Knight / ChillyRoom flavor:
   dark room, spotlight vignette, chibi big-head employees, chunky props. */
'use strict';

/* 3x5 pixel font: each glyph = 5 rows of 3 chars ('#' on, '.' off) */
const PIXEL_FONT = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  B: ['##.', '#.#', '##.', '#.#', '##.'],
  C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'],
  F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '.#.'],
  K: ['#.#', '#.#', '##.', '#.#', '#.#'],
  L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#.#', '###', '###', '#.#', '#.#'],
  N: ['#.#', '###', '#.#', '#.#', '#.#'],
  O: '.#. #.# #.# #.# .#.'.split(' '),
  P: ['##.', '#.#', '##.', '#..', '#..'],
  Q: ['.#.', '#.#', '#.#', '.#.', '..#'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#.#', '#.#', '#.#', '#.#', '###'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'],
  W: ['#.#', '#.#', '###', '###', '#.#'],
  X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
  Z: ['###', '..#', '.#.', '#..', '###'],
  0: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  1: ['.#.', '##.', '.#.', '.#.', '###'],
  2: ['##.', '..#', '.#.', '#..', '###'],
  3: ['##.', '..#', '.#.', '..#', '##.'],
  4: ['#.#', '#.#', '###', '..#', '..#'],
  5: ['###', '#..', '##.', '..#', '##.'],
  6: ['.##', '#..', '##.', '#.#', '.#.'],
  7: ['###', '..#', '.#.', '.#.', '.#.'],
  8: ['.#.', '#.#', '.#.', '#.#', '.#.'],
  9: ['.#.', '#.#', '.##', '..#', '##.'],
  ' ': ['...', '...', '...', '...', '...'],
  '.': ['...', '...', '...', '...', '.#.'],
  ':': ['...', '.#.', '...', '.#.', '...'],
  '-': ['...', '...', '###', '...', '...'],
  '!': ['.#.', '.#.', '.#.', '...', '.#.'],
  '?': ['##.', '..#', '.#.', '...', '.#.'],
  '/': ['..#', '..#', '.#.', '#..', '#..'],
  '+': ['...', '.#.', '###', '.#.', '...'],
  '>': ['#..', '.#.', '..#', '.#.', '#..'],
  '%': ['#.#', '..#', '.#.', '#..', '#.#'],
};

function drawPixelText(ctx, text, x, y, scale, color) {
  ctx.fillStyle = color;
  let cx = x;
  for (const ch of String(text).toUpperCase()) {
    const g = PIXEL_FONT[ch] || PIXEL_FONT['?'];
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 3; c++) {
        if (g[r][c] === '#') ctx.fillRect(cx + c * scale, y + r * scale, scale, scale);
      }
    }
    cx += 4 * scale;
  }
  return cx - x;
}

function pixelTextWidth(text, scale) { return String(text).length * 4 * scale - scale; }

/* Chibi employee: 16 wide x 18 tall (big head, small body — Soul Knight ratio).
   Chars: H hair, S skin, E eye, M mouth, B body(uniform), P pants, O shoe, . empty */
const SPRITE_STAND = [
  '.....HHHHHH.....',
  '....HHHHHHHH....',
  '...HHHHHHHHHH...',
  '...HHSSSSSSHH...',
  '...HSSSSSSSSH...',
  '...SSESSSSSESS..',
  '...SSSSSSSSSS...',
  '...SSSSMMSSSS...',
  '....SSSSSSSS....',
  '.....SSSSSS.....',
  '...BBBBBBBBBB...',
  '..BBBBBBBBBBBB..',
  '..B.BBBBBBBB.B..',
  '..S.BBBBBBBB.S..',
  '....PPPPPPPP....',
  '....PPP..PPP....',
  '....PPP..PPP....',
  '...OOO....OOO...',
];
const SPRITE_WALK_A = [
  '.....HHHHHH.....',
  '....HHHHHHHH....',
  '...HHHHHHHHHH...',
  '...HHSSSSSSHH...',
  '...HSSSSSSSSH...',
  '...SSESSSSSESS..',
  '...SSSSSSSSSS...',
  '...SSSSMMSSSS...',
  '....SSSSSSSS....',
  '.....SSSSSS.....',
  '...BBBBBBBBBB...',
  '..BBBBBBBBBBBB..',
  '..B.BBBBBBBB.B..',
  '..S.BBBBBBBB.S..',
  '....PPPPPPPP....',
  '...PPP....PPP...',
  '...PPP....PPP...',
  '..OOO......OOO..',
];
const SPRITE_WALK_B = [
  '.....HHHHHH.....',
  '....HHHHHHHH....',
  '...HHHHHHHHHH...',
  '...HHSSSSSSHH...',
  '...HSSSSSSSSH...',
  '...SSESSSSSESS..',
  '...SSSSSSSSSS...',
  '...SSSSMMSSSS...',
  '....SSSSSSSS....',
  '.....SSSSSS.....',
  '...BBBBBBBBBB...',
  '..BBBBBBBBBBBB..',
  '..B.BBBBBBBB.B..',
  '..S.BBBBBBBB.S..',
  '....PPPPPPPP....',
  '....PPP..PPP....',
  '....PPP..PPP....',
  '....OOO..OOO....',
];
const SPRITE_TYPE_A = [
  '.....HHHHHH.....',
  '....HHHHHHHH....',
  '...HHHHHHHHHH...',
  '...HHSSSSSSHH...',
  '...HSSSSSSSSH...',
  '...SSESSSSSESS..',
  '...SSSSSSSSSS...',
  '...SSSSMMSSSS...',
  '....SSSSSSSS....',
  '.....SSSSSS.....',
  '...BBBBBBBBBB...',
  '..BBBBBBBBBBBB..',
  '..B.BBBBBBBB.B..',
  '.SS.BBBBBBBB.SS.',
  '....PPPPPPPP....',
  '....PPP..PPP....',
  '....PPP..PPP....',
  '...OOO....OOO...',
];
const SPRITE_TYPE_B = [
  '.....HHHHHH.....',
  '....HHHHHHHH....',
  '...HHHHHHHHHH...',
  '...HHSSSSSSHH...',
  '...HSSSSSSSSH...',
  '...SSESSSSSESS..',
  '...SSSSSSSSSS...',
  '...SSSSMMSSSS...',
  '....SSSSSSSS....',
  '.....SSSSSS.....',
  '...BBBBBBBBBB...',
  '..BBBBBBBBBBBB..',
  '..BBBBBBBBBBBB..',
  '..SSBBBBBBBBSS..',
  '....PPPPPPPP....',
  '....PPP..PPP....',
  '....PPP..PPP....',
  '....OOO..OOO....',
];

/* office cat, loafing (10 x 5) */
const SPRITE_CAT = [
  '.G......G.',
  '.GGGGGGGG.',
  'GGgGGGGGGG',
  '.GGGGGGGG.',
  '..GGGGGGTT',
];

const PALETTES = {
  blue:  { hair: '#1d2330', skin: '#f2c39b', body: '#3d6df2', pants: '#232637', shoe: '#101018', eye: '#14141c', mouth: '#8a4a3a' },
  green: { hair: '#4a2f18', skin: '#d99b6c', body: '#2fa14e', pants: '#2a2d3a', shoe: '#101018', eye: '#14141c', mouth: '#7a3a2a' },
  red:   { hair: '#2a1a20', skin: '#f0c09a', body: '#e0483e', pants: '#232637', shoe: '#101018', eye: '#14141c', mouth: '#8a4a3a' },
  gray:  { hair: '#4a4a55', skin: '#e8b088', body: '#8a8a99', pants: '#232637', shoe: '#101018', eye: '#14141c', mouth: '#7a3a2a' },
};

function drawSprite(ctx, frame, palette, x, y, scale, flip) {
  for (let r = 0; r < frame.length; r++) {
    const row = frame[r];
    for (let c = 0; c < row.length; c++) {
      const ch = row[c];
      if (ch === '.') continue;
      let color = null;
      if (ch === 'H') color = palette.hair;
      else if (ch === 'S') color = palette.skin;
      else if (ch === 'E') color = palette.eye;
      else if (ch === 'M') color = palette.mouth;
      else if (ch === 'B') color = palette.body;
      else if (ch === 'P') color = palette.pants;
      else if (ch === 'O') color = palette.shoe;
      if (!color) continue;
      const cc = flip ? (row.length - 1 - c) : c;
      ctx.fillStyle = color;
      ctx.fillRect(x + cc * scale, y + r * scale, scale, scale);
    }
  }
}

function drawCat(ctx, x, y, scale, tint) {
  for (let r = 0; r < SPRITE_CAT.length; r++) {
    for (let c = 0; c < SPRITE_CAT[r].length; c++) {
      const ch = SPRITE_CAT[r][c];
      if (ch === '.') continue;
      ctx.fillStyle = ch === 'g' ? '#20202a' : ch === 'T' ? tint : ch === 'G' ? '#c9c9d4' : tint;
      ctx.fillRect(x + c * scale, y + r * scale, scale, scale);
    }
  }
}

/* ---- office tilemap, generated: octagonal room like Soul Knight lobby ----
   # wall, X void, . floor, D desk, C chair, P plant, K coffee, S sofa,
   M rug, T table, R server rack.
   Ukuran map mengikuti aspek viewport biar ruangan selalu penuh layar
   (fullscreen, tanpa letterbox). */
let MAP_W = 44;
let MAP_H = 24;
let DESK_X = [7, 21, 35]; // desk cluster centers (seat column)
let OFFICE_MAP = [];
let WAYPOINTS = [];

function buildMap() {
  const g = [];
  for (let y = 0; y < MAP_H; y++) {
    const row = [];
    for (let x = 0; x < MAP_W; x++) {
      const border = y === 0 || y === MAP_H - 1 || x === 0 || x === MAP_W - 1;
      row.push(border ? '#' : '.');
    }
    g.push(row);
  }
  const CUT = 6;
  for (let y = 1; y < MAP_H - 1; y++) {
    for (let x = 1; x < MAP_W - 1; x++) {
      const d = Math.min(
        (x - 1) + (y - 1),
        (MAP_W - 2 - x) + (y - 1),
        (x - 1) + (MAP_H - 2 - y),
        (MAP_W - 2 - x) + (MAP_H - 2 - y),
      );
      if (d < CUT) g[y][x] = 'X';
    }
  }
  const set = (x, y, ch) => {
    if (y > 0 && y < MAP_H - 1 && x > 0 && x < MAP_W - 1 && g[y][x] !== 'X') g[y][x] = ch;
  };
  const rect = (x0, y0, x1, y1, ch) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, ch);
  };
  const mid = Math.floor(MAP_W / 2);
  for (const cx of DESK_X) {
    rect(cx - 2, 7, cx + 1, 8, 'D');   // 4x2 desk cluster
    set(cx, 6, 'C');                   // north seat (the working chair)
    set(cx, 9, 'C');                   // south chair
  }
  rect(MAP_W - 6, 4, MAP_W - 5, 5, 'K');  // coffee corner
  rect(2, 10, 2, 12, 'R');                // server rack
  rect(mid - 4, 14, mid + 3, 15, 'T');    // meeting table
  rect(4, MAP_H - 7, 11, MAP_H - 4, 'M'); // rug
  rect(5, MAP_H - 6, 10, MAP_H - 5, 'S'); // sofa
  set(7, 3, 'P'); set(MAP_W - 8, 3, 'P'); set(7, MAP_H - 3, 'P'); set(MAP_W - 8, MAP_H - 3, 'P');
  return g.map((r) => r.join(''));
}

function buildWaypoints() {
  const mid = Math.floor(MAP_W / 2);
  return [
    [DESK_X[0], 10], [DESK_X[1], 10], [DESK_X[2], 10], [MAP_W - 4, 7],
    [8, MAP_H - 4], [mid, 16], [12, 12], [MAP_W - 14, 12], [10, 5],
    [mid + 5, 5], [MAP_W - 11, MAP_H - 6], [16, MAP_H - 3],
  ];
}

/* sesuaikan ukuran ruangan dengan aspek layar; true bila map dibangun ulang */
function configureOfficeMap(aspect) {
  if (!Number.isFinite(aspect) || aspect <= 0) return false;
  let w; let h;
  if (aspect >= 44 / 24) { h = 24; w = Math.min(100, Math.max(44, Math.round(24 * aspect))); }
  else { w = 44; h = Math.min(40, Math.max(24, Math.round(44 / aspect))); }
  if (w === MAP_W && h === MAP_H) return false;
  MAP_W = w;
  MAP_H = h;
  DESK_X = [Math.round(MAP_W * 0.16), Math.round(MAP_W * 0.48), Math.round(MAP_W * 0.8)];
  OFFICE_MAP = buildMap();
  WAYPOINTS = buildWaypoints();
  return true;
}

OFFICE_MAP = buildMap();
WAYPOINTS = buildWaypoints();

const TILE = 16;
const SCALE = 3;

function tileAt(tx, ty) {
  if (ty < 0 || ty >= MAP_H || tx < 0 || tx >= MAP_W) return '#';
  return OFFICE_MAP[ty][tx];
}

function isWalkable(tx, ty) {
  const t = tileAt(tx, ty);
  return t === '.' || t === 'M';
}
