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
   M rug, T table, R server rack */
const MAP_W = 44;
const MAP_H = 24;
const DESK_X = [7, 21, 35]; // desk cluster centers (seat column)

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
  for (const cx of DESK_X) {
    rect(cx - 2, 7, cx + 1, 8, 'D');   // 4x2 desk cluster
    set(cx, 6, 'C');                   // north seat (the working chair)
    set(cx, 9, 'C');                   // south chair
  }
  rect(38, 4, 39, 5, 'K');             // coffee corner
  rect(2, 10, 2, 12, 'R');             // server rack
  rect(19, 14, 26, 15, 'T');           // meeting table
  rect(4, 17, 11, 20, 'M');            // rug
  rect(5, 18, 10, 19, 'S');            // sofa
  set(7, 3, 'P'); set(36, 3, 'P'); set(7, 21, 'P'); set(36, 21, 'P');
  return g.map((r) => r.join(''));
}

const OFFICE_MAP = buildMap();

const TILE = 16;
const SCALE = 3;

/* wander waypoints (tile coords, walkable floor) */
const WAYPOINTS = [
  [7, 10], [21, 10], [35, 10], [37, 7], [8, 20], [22, 16],
  [12, 12], [30, 12], [10, 5], [26, 5], [33, 18], [16, 21],
];

function tileAt(tx, ty) {
  if (ty < 0 || ty >= MAP_H || tx < 0 || tx >= MAP_W) return '#';
  return OFFICE_MAP[ty][tx];
}

function isWalkable(tx, ty) {
  const t = tileAt(tx, ty);
  return t === '.' || t === 'M';
}
