/* Qwentir Virtual Office — Soul Knight flavored office sim wired to QoderWake. */
'use strict';

const canvas = document.getElementById('office');
const ctx = canvas.getContext('2d');
const TS = TILE * SCALE; // tile size in canvas px
canvas.width = MAP_W * TS;
canvas.height = MAP_H * TS;
let staticLayer = null;

/* fullscreen: ukuran map mengikuti aspek stage, canvas mengisi wrap 100%
   tanpa letterbox; map dibangun ulang bila aspek berubah */
function fitCanvas() {
  const wrap = document.getElementById('canvas-wrap');
  const aspect = wrap.clientWidth / Math.max(1, wrap.clientHeight);
  if (configureOfficeMap(aspect)) {
    canvas.width = MAP_W * TS;
    canvas.height = MAP_H * TS;
    staticLayer = null;
    state.ball = null;
    syncChars(); // posisi meja mengikuti lebar map baru
    for (const ch of state.chars) {
      ch.x = Math.min(ch.x, (MAP_W - 3) * TILE);
      ch.y = Math.min(ch.y, (MAP_H - 3) * TILE);
      ch.tx = Math.min(ch.tx, (MAP_W - 3) * TILE);
      ch.ty = Math.min(ch.ty, (MAP_H - 3) * TILE);
      // map baru = rak pindah tempat; buang jalur lama & keluarkan dari prop padat
      ch.path = null; ch.pathKey = null; ch.wander = null; ch.chase = null;
      const t = tileOfPx(ch.x + 8, ch.y + 17);
      const onSeat = isSeat(t[0], t[1]) && ch.desk && t[0] === ch.desk[0] && t[1] === ch.desk[1];
      if (!isPassable(t[0], t[1]) && !onSeat) {
        const safe = nearestPassable(t);
        if (safe) { ch.x = safe[0] * TILE; ch.y = safe[1] * TILE - 2; }
      }
    }
  }
  canvas.style.width = '100%';
  canvas.style.height = '100%';
}
window.addEventListener('resize', fitCanvas);
window.addEventListener('load', fitCanvas);

const state = {
  status: null,
  wakers: [],
  roles: [],
  chars: [],
  chat: null,
  sessionStore: loadStore(),
  running: {},
  ball: null,          // kardus yang dijatuhkan ke lantai {x,y,chaser}
  catJumpUntil: 0,     // timestamp lompatan kucing
};

function loadStore() {
  try { return JSON.parse(localStorage.getItem('vo.sessions') || '{}'); } catch (_) { return {}; }
}
function saveStore() { localStorage.setItem('vo.sessions', JSON.stringify(state.sessionStore)); }

async function api(path, opts) {
  const res = await fetch(path, opts);
  return res.json();
}

/* ---------------- data refresh ---------------- */

async function refresh() {
  const [status, wakers, roles] = await Promise.all([
    api('/api/status'), api('/api/wakers'), api('/api/roles'),
  ]);
  state.status = status;
  state.wakers = wakers.wakers || [];
  state.roles = roles.roles || [];
  // render dulu biar kantor langsung kelihatan; detail session (CLI lambat)
  // menyusul di background tanpa menahan tampilan pertama
  syncChars();
  renderHud();
  renderRoster();
  fitCanvas();
  await Promise.all(state.wakers.map(async (w) => {
    const sid = state.sessionStore[w.agentId];
    if (!sid) return;
    const d = await api(`/api/sessions/${sid}/detail`);
    if (d.ok && d.raw) {
      state.running[w.agentId] = /running|starting/.test(String(d.raw.runtimeState || ''));
    }
  }));
}

function syncChars() {
  const next = [];
  for (let i = 0; i < state.roles.length; i++) {
    const role = state.roles[i];
    const waker = state.wakers.find((w) => w.roleId === role.id);
    const prev = state.chars.find((c) => c.roleId === role.id);
    const desk = [DESK_X[i] !== undefined ? DESK_X[i] : role.desk[0], role.desk[1] || 6];
    next.push({
      roleId: role.id,
      roleTitle: role.title,
      palette: PALETTES[role.palette] || PALETTES.gray,
      desk,
      waker: waker || null,
      name: waker ? waker.name : null,
      x: prev ? prev.x : desk[0] * TILE + 1,
      y: prev ? prev.y : desk[1] * TILE - 2,
      tx: prev ? prev.tx : desk[0] * TILE + 1,
      ty: prev ? prev.ty : desk[1] * TILE - 2,
      flip: prev ? prev.flip : false,
      frame: 0,
      pauseUntil: prev ? prev.pauseUntil : 0,
      mode: prev ? prev.mode : 'wander',
      jumpUntil: prev ? prev.jumpUntil : 0,
      emote: prev ? prev.emote : '',
      emoteUntil: prev ? prev.emoteUntil : 0,
      wander: prev ? prev.wander : null,
      path: prev ? prev.path : null,
      pathKey: prev ? prev.pathKey : null,
      chase: prev ? prev.chase : null,
    });
  }
  // Waker yang belum cocok role mana pun: ikut jalan-jalan di kantor
  for (const w of state.wakers) {
    if (w.roleId) continue;
    const prev = state.chars.find((c) => c.waker && c.waker.agentId === w.agentId);
    const sx = Math.floor(MAP_W / 2) * TILE;
    const sy = 4 * TILE;
    next.push({
      roleId: null,
      roleTitle: 'New Hire',
      palette: PALETTES.gray,
      desk: null,
      waker: w,
      name: w.name,
      x: prev ? prev.x : sx,
      y: prev ? prev.y : sy,
      tx: prev ? prev.tx : sx,
      ty: prev ? prev.ty : sy,
      flip: prev ? prev.flip : false,
      frame: 0,
      pauseUntil: prev ? prev.pauseUntil : 0,
      mode: prev ? prev.mode : 'wander',
      jumpUntil: prev ? prev.jumpUntil : 0,
      emote: prev ? prev.emote : '',
      emoteUntil: prev ? prev.emoteUntil : 0,
      wander: prev ? prev.wander : null,
      path: prev ? prev.path : null,
      pathKey: prev ? prev.pathKey : null,
      chase: prev ? prev.chase : null,
    });
  }
  state.chars = next;
}

/* ---------------- character brain ---------------- */

/* anchor = titik kaki sprite (tile-px); dipakai untuk okupansi tile & pathing.
   Sprite 18px tinggi vs tile 16px: anchor ditaruh dekat dasar sprite supaya
   badan agen muat di dalam tile-nya sendiri dan tidak terlihat menimpa rak. */
function anchorOf(ch) { return [ch.x + 8, ch.y + 17]; }
function tileOfPx(px, py) { return [Math.floor(px / TILE), Math.floor(py / TILE)]; }
function nodeCenter(t) { return [t[0] * TILE + 8, t[1] * TILE + 15]; }

/* tile lolos terdekat (cincin BFS); dipakai mengeluarkan agen yang terperangkap */
function nearestPassable(tile) {
  if (isPassable(tile[0], tile[1])) return tile;
  const key = (x, y) => y * MAP_W + x;
  const seen = new Set([key(tile[0], tile[1])]);
  const q = [tile];
  for (let i = 0; i < q.length; i++) {
    for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = q[i][0] + d[0]; const ny = q[i][1] + d[1];
      if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
      const k = key(nx, ny);
      if (seen.has(k)) continue;
      seen.add(k);
      if (isPassable(nx, ny)) return [nx, ny];
      q.push([nx, ny]);
    }
  }
  return null;
}

/* BFS jalur terpendek antar tile yang bisa dilewati; null bila tak terjangkau.
   Ini yang bikin agen mengelilingi rak/kardus, bukan menerobosnya. */
function findPath(from, to) {
  let tx = to[0]; let ty = to[1];
  // tujuan boleh berupa bangku kerja (duduk); selain itu harus tile lolos
  if (!isPassable(tx, ty) && !isSeat(tx, ty)) {
    const alt = [[tx + 1, ty], [tx - 1, ty], [tx, ty + 1], [tx, ty - 1]]
      .find((n) => isPassable(n[0], n[1]));
    if (!alt) return null;
    tx = alt[0]; ty = alt[1];
  }
  const sx = from[0]; const sy = from[1];
  const key = (x, y) => y * MAP_W + x;
  const start = key(sx, sy);
  const goal = key(tx, ty);
  if (start === goal) return [];
  const prev = new Map([[start, -1]]);
  const queue = [start];
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let qi = 0; qi < queue.length; qi++) {
    const cur = queue[qi];
    if (cur === goal) break;
    const cx = cur % MAP_W; const cy = Math.floor(cur / MAP_W);
    for (const d of dirs) {
      const nx = cx + d[0]; const ny = cy + d[1];
      if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
      // tile padat tak boleh dilewati; bangku hanya boleh sebagai tujuan akhir
      if (!isPassable(nx, ny) && !(nx === tx && ny === ty)) continue;
      const k = key(nx, ny);
      if (prev.has(k)) continue;
      prev.set(k, cur);
      queue.push(k);
    }
  }
  if (!prev.has(goal)) return null;
  const path = [];
  for (let k = goal; k !== start && k !== -1; k = prev.get(k)) {
    path.push([k % MAP_W, Math.floor(k / MAP_W)]);
  }
  path.reverse();
  return path;
}

function updateChars(now, dt) {
  for (const ch of state.chars) {
    if (!ch.waker || !ch.waker.online) { ch.mode = 'away'; continue; }
    ch.mode = state.running[ch.waker.agentId] ? 'work' : 'wander';

    // pengaman: agen tak boleh berada di dalam prop padat (mis. usai resize map)
    const here = tileOfPx(...anchorOf(ch));
    const onOwnSeat = isSeat(here[0], here[1]) && ch.mode === 'work' && ch.desk
      && here[0] === ch.desk[0] && here[1] === ch.desk[1];
    if (!isPassable(here[0], here[1]) && !onOwnSeat) {
      const safe = nearestPassable(here);
      if (safe) { ch.x = safe[0] * TILE; ch.y = safe[1] * TILE - 2; }
      ch.path = null; ch.pathKey = null; ch.wander = null;
    }

    // tentukan tile tujuan sesuai mode
    let target = null;
    if (ch.mode === 'work' && ch.desk) {
      target = [ch.desk[0], ch.desk[1]];
    } else if (ch.chase) {
      target = ch.chase;
    } else {
      const atWander = ch.wander && here[0] === ch.wander[0] && here[1] === ch.wander[1];
      if (!ch.wander || atWander) {
        if (atWander && Math.random() < 0.35) ch.pauseUntil = now + 1200 + Math.random() * 2500;
        const wp = WAYPOINTS[Math.floor(Math.random() * WAYPOINTS.length)];
        ch.wander = [wp[0], wp[1]];
      }
      if (now > ch.pauseUntil) target = ch.wander;
    }

    // hitung ulang jalur hanya saat tujuan berubah
    const tkey = target ? target.join(',') : '';
    if (tkey !== ch.pathKey) {
      ch.pathKey = tkey;
      ch.path = target ? (findPath(tileOfPx(...anchorOf(ch)), target) || []) : null;
    }

    // ikuti jalur tile demi tile — tidak pernah menembus rak/kardus
    let moving = false;
    if (ch.path && ch.path.length) {
      const c = nodeCenter(ch.path[0]);
      const a0 = anchorOf(ch);
      let ax = a0[0]; let ay = a0[1];
      const dx = c[0] - ax; const dy = c[1] - ay;
      const dist = Math.hypot(dx, dy);
      if (dist > 1) {
        const step = Math.min(40 * dt, dist);
        ax += (dx / dist) * step;
        ay += (dy / dist) * step;
        ch.x = ax - 8; ch.y = ay - 17;
        ch.flip = dx < 0;
        moving = true;
      } else {
        ch.path.shift();
      }
    }
    ch.frame = moving ? Math.floor(now / 200) % 2 : Math.floor(now / 520) % 2;
  }
}

/* vscode-pet style: kardus di lantai diambil pekerja terdekat yang santai */
function updateBall(now) {
  const b = state.ball;
  if (!b) {
    for (const ch of state.chars) ch.chase = null;
    return;
  }
  const bt = [Math.floor(b.x / TILE), Math.floor(b.y / TILE)];
  let chaser = state.chars.find((c) => c.roleId === b.chaser && c.mode === 'wander' && c.chase);
  if (!chaser) {
    const idle = state.chars.filter((c) => c.waker && c.waker.online && c.mode === 'wander');
    idle.sort((a, c) => Math.hypot(a.x - b.x, a.y - b.y) - Math.hypot(c.x - b.x, c.y - b.y));
    chaser = idle[0] || null;
    b.chaser = chaser ? chaser.roleId : null;
    for (const c of state.chars) c.chase = null;
    if (chaser) chaser.chase = bt;
  }
  if (!chaser) return;
  chaser.chase = bt;
  chaser.pauseUntil = 0;
  const a = anchorOf(chaser);
  if (Math.hypot(a[0] - b.x, a[1] - b.y) < 8) {
    chaser.jumpUntil = now + 650;
    chaser.emote = 'heart';
    chaser.emoteUntil = now + 1400;
    chaser.chase = null;
    state.ball = null;
  }
}

function petChar(ch, now) {
  ch.jumpUntil = now + 650;
  ch.emote = ['heart', 'hi', '!'][Math.floor(Math.random() * 3)];
  ch.emoteUntil = now + 1400;
}

/* ---------------- Soul Knight style rendering ---------------- */

function buildStaticLayer() {
  staticLayer = document.createElement('canvas');
  staticLayer.width = canvas.width;
  staticLayer.height = canvas.height;
  const g = staticLayer.getContext('2d');
  g.fillStyle = '#04050a';
  g.fillRect(0, 0, staticLayer.width, staticLayer.height);
  for (let ty = 0; ty < MAP_H; ty++) {
    for (let tx = 0; tx < MAP_W; tx++) {
      drawTile(g, tileAt(tx, ty), tx, ty);
    }
  }
  drawDock(g);
}

function drawTile(g, t, tx, ty) {
  const x = tx * TS;
  const y = ty * TS;
  const S = SCALE;
  if (t === 'X') return; // void stays black
  if (t === '#') {
    // dinding metal bergelombang (corrugated warehouse wall)
    g.fillStyle = '#171b26';
    g.fillRect(x, y, TS, TS);
    g.fillStyle = '#212838';
    for (let i = 1; i < 16; i += 3) g.fillRect(x + i * S, y, S, TS);
    g.fillStyle = '#0c0f16';
    g.fillRect(x, y + 12 * S, TS, 4 * S); // skirt pondasi
    return;
  }
  if (t === '.') {
    // lantai beton dengan sambungan ekspansi
    g.fillStyle = (tx + ty) % 2 === 0 ? '#41464f' : '#3b4048';
    g.fillRect(x, y, TS, TS);
    g.fillStyle = '#2f343c';
    g.fillRect(x + TS - S, y, S, TS);
    g.fillRect(x, y + TS - S, TS, S);
    if ((tx * 7 + ty * 13) % 11 === 0) {
      g.fillStyle = 'rgba(255,255,255,0.05)';
      g.fillRect(x + 5 * S, y + 6 * S, 2 * S, 2 * S);
    }
    return;
  }
  if (t === 'H') {
    // lorong bergaris hazard kuning-hitam (bisa dilewati)
    g.fillStyle = '#c9a227';
    g.fillRect(x, y, TS, TS);
    g.fillStyle = '#20202a';
    for (let r = 0; r < 16; r++) {
      for (let c = 0; c < 16; c++) {
        if (((c + r) % 8) < 4) g.fillRect(x + c * S, y + r * S, S, S);
      }
    }
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fillRect(x + TS - S, y, S, TS);
    g.fillRect(x, y + TS - S, TS, S);
    return;
  }
  if (t === 'D') {
    // meja packing / workstation baja
    g.fillStyle = '#4a5060';
    g.fillRect(x, y, TS, TS);
    g.fillStyle = '#5c6474';
    g.fillRect(x + 1 * S, y + 1 * S, 14 * S, 6 * S); // worktop
    g.fillStyle = '#7d8698';
    g.fillRect(x + 1 * S, y + 1 * S, 14 * S, S);      // kilau tepi
    g.fillStyle = '#2f343c';
    g.fillRect(x + 1 * S, y + 9 * S, 14 * S, 6 * S);  // kabinet bawah
    return;
  }
  if (t === 'C') {
    // bangku kerja
    g.fillStyle = '#2c3145';
    g.fillRect(x + 4 * S, y + 6 * S, 8 * S, 6 * S);
    g.fillStyle = '#3a4059';
    g.fillRect(x + 4 * S, y + 4 * S, 8 * S, 3 * S);
    g.fillStyle = '#20242f';
    g.fillRect(x + 7 * S, y + 12 * S, 2 * S, 3 * S);
    return;
  }
  if (t === 'R') {
    // rak palet: upright oranye + beam biru + kardus
    g.fillStyle = '#242938';
    g.fillRect(x, y, TS, TS);
    g.fillStyle = '#d9691f';
    g.fillRect(x, y, 2 * S, TS);
    g.fillRect(x + 14 * S, y, 2 * S, TS);
    g.fillStyle = '#3a6ea5';
    g.fillRect(x, y + 6 * S, TS, S);
    g.fillRect(x, y + 13 * S, TS, S);
    g.fillStyle = '#b5813f';
    g.fillRect(x + 3 * S, y + 1 * S, 5 * S, 5 * S);
    g.fillRect(x + 9 * S, y + 2 * S, 4 * S, 4 * S);
    g.fillRect(x + 3 * S, y + 8 * S, 4 * S, 5 * S);
    g.fillRect(x + 8 * S, y + 8 * S, 5 * S, 5 * S);
    g.fillStyle = '#8a5f2c';
    g.fillRect(x + 3 * S, y + 3 * S, 5 * S, S);
    return;
  }
  if (t === 'B') {
    // tumpukan kargo di atas palet kayu
    g.fillStyle = '#8a5f2c';
    g.fillRect(x, y + 13 * S, TS, 3 * S);
    g.fillStyle = '#6b471f';
    g.fillRect(x + 2 * S, y + 14 * S, 2 * S, 2 * S);
    g.fillRect(x + 12 * S, y + 14 * S, 2 * S, 2 * S);
    g.fillStyle = '#c08a45';
    g.fillRect(x + 1 * S, y + 6 * S, 14 * S, 7 * S);
    g.fillStyle = '#a5712f';
    g.fillRect(x + 1 * S, y + 9 * S, 14 * S, S);
    g.fillStyle = '#c08a45';
    g.fillRect(x + 3 * S, y + 1 * S, 10 * S, 5 * S);
    g.fillStyle = '#e0c48a';
    g.fillRect(x + 7 * S, y + 1 * S, 2 * S, 12 * S); // selotip
    g.fillStyle = '#f2ede0';
    g.fillRect(x + 3 * S, y + 7 * S, 4 * S, 3 * S);   // label kirim
    return;
  }
  if (t === 'F') {
    // forklift kuning dengan tiang + garpu
    g.fillStyle = '#f2b01e';
    g.fillRect(x + 2 * S, y + 6 * S, 8 * S, 6 * S);
    g.fillStyle = '#2a2f3d';
    g.fillRect(x + 3 * S, y + 2 * S, 6 * S, S);   // overhead guard
    g.fillRect(x + 3 * S, y + 2 * S, S, 4 * S);
    g.fillRect(x + 8 * S, y + 2 * S, S, 4 * S);
    g.fillStyle = '#3a3f4a';
    g.fillRect(x + 11 * S, y + 1 * S, 2 * S, 12 * S); // tiang
    g.fillStyle = '#c9ccd6';
    g.fillRect(x + 13 * S, y + 11 * S, 3 * S, S);
    g.fillRect(x + 13 * S, y + 13 * S, 3 * S, S);      // garpu
    g.fillStyle = '#15151f';
    g.fillRect(x + 2 * S, y + 12 * S, 3 * S, 3 * S);
    g.fillRect(x + 7 * S, y + 12 * S, 3 * S, 3 * S);   // roda
    g.fillStyle = '#ff7a1a';
    g.fillRect(x + 5 * S, y + 1 * S, 2 * S, S);        // beacon
    return;
  }
  if (t === 'T') {
    // konveyor belt membawa kardus
    g.fillStyle = '#20242f';
    g.fillRect(x + 1 * S, y + 12 * S, 2 * S, 4 * S);
    g.fillRect(x + 13 * S, y + 12 * S, 2 * S, 4 * S);
    g.fillStyle = '#2a2f3d';
    g.fillRect(x, y + 6 * S, TS, 6 * S);
    g.fillStyle = '#15151f';
    g.fillRect(x, y + 7 * S, TS, 4 * S);
    g.fillStyle = '#4a5060';
    for (let i = 1; i < 16; i += 4) g.fillRect(x + i * S, y + 8 * S, 2 * S, 2 * S);
    g.fillStyle = '#c08a45';
    g.fillRect(x + 5 * S, y + 2 * S, 6 * S, 5 * S); // kardus di atas belt
    g.fillStyle = '#e0c48a';
    g.fillRect(x + 7 * S, y + 2 * S, 2 * S, 5 * S);
    return;
  }
  if (t === 'S') {
    // kontainer pengiriman bergelombang
    const blue = (tx + ty) % 2 === 0;
    g.fillStyle = blue ? '#2f5f8f' : '#8f3b2f';
    g.fillRect(x, y, TS, TS);
    g.fillStyle = blue ? '#3d76ab' : '#a8483a';
    for (let i = 1; i < 16; i += 3) g.fillRect(x + i * S, y + 2 * S, S, 12 * S);
    g.fillStyle = blue ? '#1d3d5c' : '#5f241c';
    g.fillRect(x, y, TS, 2 * S);
    g.fillRect(x, y + 14 * S, TS, 2 * S);
    g.fillStyle = '#c9ccd6';
    g.fillRect(x + 7 * S, y + 3 * S, S, 10 * S);
    g.fillRect(x + 9 * S, y + 3 * S, S, 10 * S);   // pintu + batang pengunci
    return;
  }
}

function drawDock(g) {
  const S = SCALE;
  const mid = Math.floor(MAP_W / 2);
  const bx = (mid - 3) * TS;
  const bw = 6 * TS;
  const bh = 3 * TS;
  // beton penyangga dock
  g.fillStyle = '#20242f';
  g.fillRect(bx - 2 * S, 0, bw + 4 * S, bh);
  // rongga bay (halaman luar gelap)
  g.fillStyle = '#080b12';
  g.fillRect(bx, S, bw, bh - S);
  // rolling shutter (setengah terbuka) + rusuk
  g.fillStyle = '#3d4454';
  g.fillRect(bx, 0, bw, 10 * S);
  g.fillStyle = '#2b3140';
  for (let i = 1; i < 10; i += 2) g.fillRect(bx, i * S, bw, S);
  // trailer truk mundur ke dalam bay
  g.fillStyle = '#c9ccd6';
  g.fillRect(bx + 8 * S, 10 * S, bw - 16 * S, bh - 12 * S);
  g.fillStyle = '#9aa0ae';
  g.fillRect(bx + 8 * S, 10 * S, bw - 16 * S, 3 * S);
  g.fillStyle = '#7d838f';
  g.fillRect(bx + bw / 2 - S, 12 * S, 2 * S, bh - 16 * S); // sambungan pintu
  // lampu dock menghangatkan bay
  g.fillStyle = 'rgba(255,190,90,0.14)';
  g.fillRect(bx, 10 * S, bw, bh - 10 * S);
  // bumper strip hazard di bibir dock
  for (let c = 0; c < bw / S; c += 2) {
    g.fillStyle = (c % 4 === 0) ? '#c9a227' : '#20202a';
    g.fillRect(bx + c * S, bh - 3 * S, 2 * S, 3 * S);
  }
}


/* bubble reaksi ala vscode-pet: heart / hi / ! */
function drawEmote(g, x, y, type, now) {
  const S = SCALE;
  y += Math.floor(now / 300) % 2 ? -S : 0;
  g.fillStyle = '#ffffff';
  g.fillRect(x - 5 * S, y - 6 * S, 10 * S, 8 * S);
  g.fillRect(x - S, y + 2 * S, 2 * S, 2 * S);
  if (type === 'heart') {
    g.fillStyle = '#e0483e';
    g.fillRect(x - 3 * S, y - 4 * S, 2 * S, 2 * S);
    g.fillRect(x + S, y - 4 * S, 2 * S, 2 * S);
    g.fillRect(x - 4 * S, y - 3 * S, 8 * S, 2 * S);
    g.fillRect(x - 3 * S, y - S, 6 * S, S);
    g.fillRect(x - 2 * S, y, 4 * S, S);
    g.fillRect(x - S, y + S, 2 * S, S);
  } else {
    const label = type === 'hi' ? 'HI!' : '!';
    drawPixelText(g, label, x - pixelTextWidth(label, 2 * S) / 2, y - 4 * S, 2 * S, '#20202a');
  }
}

function drawDeskProps(g, cx, working, now) {
  const S = SCALE;
  const dx = cx * TS;
  // north monitors (face the north seat)
  for (const ox of [-1, 0]) {
    const mx = dx + ox * TS + 2 * S;
    const my = 7 * TS + 1 * S;
    g.fillStyle = '#0d0f16';
    g.fillRect(mx, my, 12 * S, 9 * S);
    const on = working && Math.floor(now / 300) % 2 === 0;
    g.fillStyle = working ? (on ? '#19c2d6' : '#0e3c46') : '#141c28';
    g.fillRect(mx + 1 * S, my + 1 * S, 10 * S, 6 * S);
    g.fillStyle = '#0d0f16';
    g.fillRect(mx + 5 * S, my + 9 * S, 2 * S, 2 * S);
  }
  // south monitor
  const sx = dx + 2 * S;
  const sy = 8 * TS + 5 * S;
  g.fillStyle = '#0d0f16';
  g.fillRect(sx, sy, 12 * S, 9 * S);
  g.fillStyle = working ? '#0e3c46' : '#141c28';
  g.fillRect(sx + 1 * S, sy + 2 * S, 10 * S, 6 * S);
  // tiny manifest terminal on the cluster (layar rekap DO/POD)
  const tx = dx - 1 * TS + 3 * S;
  const ty = 8 * TS + 2 * S;
  g.fillStyle = '#151824';
  g.fillRect(tx, ty, 10 * S, 8 * S);
  g.fillStyle = '#43e07c';
  g.fillRect(tx + 1 * S, ty + 1 * S, 5 * S, 1 * S);
  g.fillStyle = '#ffc857';
  g.fillRect(tx + 1 * S, ty + 3 * S, 7 * S, 1 * S);
  g.fillStyle = Math.floor(now / 500) % 2 ? '#5ff0ff' : '#151824';
  g.fillRect(tx + 1 * S, ty + 5 * S, 2 * S, 1 * S);
  // keyboards + mice
  g.fillStyle = '#a9adbb';
  g.fillRect(dx - 1 * TS + 3 * S, 7 * TS + 12 * S, 10 * S, 2 * S);
  g.fillRect(dx - 1 * TS + 3 * S, 9 * TS - 1 * S, 10 * S, 2 * S);
  g.fillStyle = '#6b6f7d';
  g.fillRect(dx + 1 * TS, 7 * TS + 12 * S, 2 * S, 2 * S);
  // kardus menunggu kirim + pemindai barcode di meja packing
  g.fillStyle = '#c08a45';
  g.fillRect(dx + 1 * TS + 6 * S, 8 * TS + 2 * S, 6 * S, 5 * S);
  g.fillStyle = '#e0c48a';
  g.fillRect(dx + 1 * TS + 8 * S, 8 * TS + 2 * S, 2 * S, 5 * S);
  g.fillStyle = '#f2ede0';
  g.fillRect(dx + 1 * TS + 6 * S, 8 * TS + 4 * S, 2 * S, 2 * S);
  g.fillStyle = '#15151f';
  g.fillRect(dx - 1 * TS + 12 * S, 8 * TS + 3 * S, 3 * S, 5 * S); // scanner
  g.fillStyle = Math.floor(now / 400) % 2 ? '#e0483e' : '#5a1f1a';
  g.fillRect(dx - 1 * TS + 12 * S, 8 * TS + 3 * S, 3 * S, S);
}

function draw(now) {
  if (!staticLayer) buildStaticLayer();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(staticLayer, 0, 0);

  // spotlight pool over the warehouse floor (cahaya lampu dock hangat)
  const cx = canvas.width / 2;
  const cy = canvas.height * 0.52;
  const pool = ctx.createRadialGradient(cx, cy, TS * 2, cx, cy, canvas.width * 0.42);
  pool.addColorStop(0, 'rgba(255,214,150,0.12)');
  pool.addColorStop(1, 'rgba(255,214,150,0)');
  ctx.fillStyle = pool;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // beacon forklift berkedip di lorong kiri
  ctx.fillStyle = Math.floor(now / 500) % 2 ? '#ff9a2a' : '#5a3410';
  ctx.fillRect(5 * TS + 5 * SCALE, 11 * TS + 1 * SCALE, 2 * SCALE, SCALE);

  // desk clusters + cat
  const workingByRole = {};
  for (const ch of state.chars) if (ch.waker) workingByRole[ch.roleId] = ch.mode === 'work';
  DESK_X.forEach((cxr, i) => {
    const role = state.roles[i];
    drawDeskProps(ctx, cxr, role ? !!workingByRole[role.id] : false, now);
  });
  let catJump = 0;
  if (now < state.catJumpUntil) {
    const t = 1 - (state.catJumpUntil - now) / 650;
    catJump = Math.sin(Math.PI * t) * 6 * SCALE;
  }
  const catX = (DESK_X[0] + 1) * TS + 2 * SCALE;
  const catY = 8 * TS + 8 * SCALE;
  drawCat(ctx, catX, catY - catJump, SCALE, '#8a8a99');
  if (Math.floor(now / 900) % 2 === 0 && !catJump) {
    ctx.fillStyle = '#8a8a99';
    ctx.fillRect(catX + 10 * SCALE, catY + 2 * SCALE, 2 * SCALE, SCALE);
  }
  if (catJump) drawEmote(ctx, catX + 5 * SCALE, catY - 8 * SCALE, 'heart', now);

  // kardus di lantai (vscode-pet style: dilempar, diambil pekerja santai)
  if (state.ball) {
    const bx = state.ball.x * SCALE;
    const by = state.ball.y * SCALE;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(bx, by + 4 * SCALE, 5 * SCALE, 2 * SCALE, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#b5813f';
    ctx.fillRect(bx - 5 * SCALE, by - 5 * SCALE, 10 * SCALE, 9 * SCALE);
    ctx.fillStyle = '#8a5f2c';
    ctx.fillRect(bx - 5 * SCALE, by + 2 * SCALE, 10 * SCALE, 2 * SCALE);
    ctx.fillStyle = '#e0c48a';
    ctx.fillRect(bx - SCALE, by - 5 * SCALE, 2 * SCALE, 9 * SCALE); // selotip
    ctx.fillStyle = '#f2ede0';
    ctx.fillRect(bx + SCALE, by - 3 * SCALE, 3 * SCALE, 3 * SCALE); // label kirim
  }

  // characters, depth-sorted
  const chars = [...state.chars].sort((a, b) => a.y - b.y);
  for (const ch of chars) {
    if (ch.mode === 'away') continue;
    let jump = 0;
    if (ch.jumpUntil && now < ch.jumpUntil) {
      const t = 1 - (ch.jumpUntil - now) / 650;
      jump = Math.sin(Math.PI * t) * 7 * SCALE;
    }
    const px = Math.round(ch.x) * SCALE;
    const py = Math.round(ch.y) * SCALE + (ch.frame && ch.mode === 'wander' ? -SCALE : 0) - jump;
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(px + 8 * SCALE, py + 18 * SCALE, 7 * SCALE, 2.5 * SCALE, 0, 0, Math.PI * 2);
    ctx.fill();
    let frame = SPRITE_STAND;
    if (ch.mode === 'work') frame = ch.frame ? SPRITE_TYPE_A : SPRITE_TYPE_B;
    else if (Math.hypot(ch.tx - ch.x, ch.ty - ch.y) > 1) frame = ch.frame ? SPRITE_WALK_A : SPRITE_WALK_B;
    drawSprite(ctx, frame, ch.palette, px, py, SCALE, ch.flip);
    // nametag
    const label = ch.name || '???';
    const w = pixelTextWidth(label, 2);
    ctx.fillStyle = 'rgba(6,8,16,0.88)';
    ctx.fillRect(px + 8 * SCALE - w / 2 - 4, py - 10 * SCALE, w + 8, 7 * SCALE);
    drawPixelText(ctx, label, px + 8 * SCALE - w / 2, py - 9 * SCALE, 2, '#e8ecff');
    // working bubble
    if (ch.mode === 'work') {
      const dots = 1 + (Math.floor(now / 350) % 3);
      const bx = px + 14 * SCALE;
      const by = py - 2 * SCALE;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(bx, by, 14 * SCALE, 7 * SCALE);
      ctx.fillStyle = '#20202a';
      for (let d = 0; d < dots; d++) ctx.fillRect(bx + 3 * SCALE + d * 4 * SCALE, by + 3 * SCALE, 2 * SCALE, 2 * SCALE);
    }
    // reaction emote (pet / ball catch)
    if (ch.emoteUntil && now < ch.emoteUntil) drawEmote(ctx, px + 8 * SCALE, py - 18 * SCALE, ch.emote, now);
  }

  // vacant desks
  for (const ch of chars) {
    if (ch.waker) continue;
    const x = ch.desk[0] * TS;
    const y = ch.desk[1] * TS;
    const label = 'VACANT';
    const w = pixelTextWidth(label, 2);
    ctx.fillStyle = 'rgba(224,72,62,0.92)';
    ctx.fillRect(x + 8 * SCALE - w / 2 - 4, y - 8 * SCALE, w + 8, 7 * SCALE);
    drawPixelText(ctx, label, x + 8 * SCALE - w / 2, y - 7 * SCALE, 2, '#ffffff');
  }

  // Soul Knight vignette
  const vig = ctx.createRadialGradient(cx, cy, canvas.width * 0.18, cx, cy, canvas.width * 0.62);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(0.7, 'rgba(0,0,0,0.45)');
  vig.addColorStop(1, 'rgba(0,0,0,0.88)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

let lastTs = 0;
function loop(ts) {
  const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0);
  lastTs = ts;
  updateChars(ts, dt);
  updateBall(ts);
  draw(ts);
  requestAnimationFrame(loop);
}

/* ---------------- HUD & roster ---------------- */

function renderHud() {
  const s = state.status || {};
  const daemon = document.getElementById('hud-daemon');
  daemon.textContent = `DAEMON: ${String(s.daemon || 'offline').toUpperCase()}`;
  daemon.className = 'chip ' + (s.daemon === 'online' ? 'chip-ok' : 'chip-bad');
  document.getElementById('hud-running').textContent = `RUNNING: ${s.sessionsRunning ?? 0}`;
  document.getElementById('hud-repo').textContent = s.repo || '';
}

function renderRoster() {
  const el = document.getElementById('roster');
  el.innerHTML = '';
  for (const role of state.roles) {
    const waker = state.wakers.find((w) => w.roleId === role.id);
    const card = document.createElement('div');
    card.className = 'card';
    const dot = document.createElement('span');
    dot.className = 'dot ' + (waker ? (waker.online ? 'dot-on' : 'dot-off') : 'dot-vac');
    const info = document.createElement('div');
    info.className = 'card-info';
    info.innerHTML = `<b>${waker ? escapeHtml(waker.name) : '— kosong —'}</b>
      <span>${escapeHtml(role.title)}</span>
      <small>${waker ? (waker.online ? 'online di kantor' : 'offline') : 'posisi terbuka'}</small>`;
    card.append(dot, info);
    if (waker) {
      const btn = document.createElement('button');
      btn.textContent = 'CHAT';
      btn.onclick = () => openChat(waker);
      card.append(btn);
    } else if (role.hire) {
      const btn = document.createElement('button');
      btn.textContent = 'HIRE';
      btn.className = 'hire';
      btn.onclick = () => openHire(role);
      card.append(btn);
    }
    el.append(card);
  }
  // kartu "hire another agent": buat Waker baru bebas untuk company ini
  const add = document.createElement('div');
  add.className = 'card card-hire';
  const addInfo = document.createElement('div');
  addInfo.className = 'card-info';
  addInfo.innerHTML = '<b>+ NEW</b><span>Hire another agent</span><small>buat Waker baru untuk company ini</small>';
  const addBtn = document.createElement('button');
  addBtn.className = 'hire';
  addBtn.textContent = 'HIRE';
  addBtn.onclick = openHireCustom;
  add.append(addInfo, addBtn);
  el.append(add);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/* ---------------- chat + file attachments ---------------- */

const drawer = document.getElementById('drawer');

function openChat(waker) {
  state.chat = {
    wakerId: waker.agentId,
    wakerName: waker.name,
    role: state.roles.find((r) => r.id === waker.roleId),
    sessionId: state.sessionStore[waker.agentId] || null,
    lastSeq: 0,
    seen: {},
    items: [],
    attach: [],
  };
  drawer.classList.add('open');
  document.getElementById('chat-title').textContent = `${waker.name} — ${state.chat.role ? state.chat.role.title : 'Waker'}`;
  document.getElementById('chat-sub').textContent = state.chat.sessionId
    ? `session ${state.chat.sessionId}` : 'belum ada session — pesan pertama akan membangunkan Waker';
  renderAttach();
  renderChat();
  pollEvents();
}

function closeChat() {
  state.chat = null;
  drawer.classList.remove('open');
}

function renderAttach() {
  const box = document.getElementById('chat-files');
  box.innerHTML = '';
  const chat = state.chat;
  if (!chat) return;
  for (const a of chat.attach) {
    const chip = document.createElement('span');
    chip.className = 'file-chip';
    chip.textContent = a.name;
    const x = document.createElement('button');
    x.textContent = 'x';
    x.className = 'file-x';
    x.onclick = () => {
      chat.attach = chat.attach.filter((v) => v !== a);
      renderAttach();
    };
    chip.append(x);
    box.append(chip);
  }
}

async function uploadFiles(fileList) {
  const chat = state.chat;
  if (!chat) return;
  for (const f of Array.from(fileList)) {
    if (f.size > 20 * 1024 * 1024) { alert(`File terlalu besar: ${f.name}`); continue; }
    const dataBase64 = await new Promise((resolve, reject) => {
      const rd = new FileReader();
      rd.onload = () => resolve(String(rd.result).split(',')[1] || '');
      rd.onerror = reject;
      rd.readAsDataURL(f);
    });
    const r = await api('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: f.name, dataBase64 }),
    });
    if (r.ok) chat.attach.push({ name: f.name, path: r.path });
    else alert(`Upload gagal: ${r.error}`);
  }
  renderAttach();
}

function contentText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((b) => (b && b.type === 'text' ? b.text : '')).filter(Boolean).join('\n');
  }
  return '';
}

/* daemon session events -> chat items */
function evToItem(ev) {
  const seq = ev.sequence_num ?? ev.sequenceNum ?? 0;
  const type = String(ev.event_type || ev.type || '');
  const p = ev.payload || {};
  if (type === 'user') return { seq, kind: 'user', text: contentText(p.message && p.message.content) };
  if (type === 'assistant') {
    const text = contentText(p.message && p.message.content);
    return text ? { seq, kind: 'agent', text } : { seq, kind: 'skip' };
  }
  if (type === 'result') return { seq, kind: 'result', text: typeof p.result === 'string' ? p.result : '' };
  if (type === 'runtime.state.changed') return { seq, kind: 'state', state: String(p.state || '') };
  return { seq, kind: 'skip' };
}

async function pollEvents() {
  const chat = state.chat;
  if (!chat || !chat.sessionId || chat.polling) return;
  chat.polling = true;
  try {
    const r = await api(`/api/sessions/${chat.sessionId}/events?after=${chat.lastSeq}`);
    if (!state.chat || state.chat !== chat) return;
    if (r.ok && Array.isArray(r.events)) {
      let changed = false;
      for (const ev of r.events) {
        const item = evToItem(ev);
        if (item.seq > chat.lastSeq) chat.lastSeq = item.seq;
        if (item.kind === 'state') {
          chat.sawState = true;
          state.running[chat.wakerId] = item.state === 'running' || item.state === 'starting';
          continue;
        }
        if (item.kind === 'skip' || !item.text) continue;
        if (item.seq && chat.seen[item.seq]) continue;
        if (item.seq) chat.seen[item.seq] = true;
        if (item.kind === 'user') {
          const i = chat.items.findIndex((it) => it.opt && it.kind === 'user' && it.text === item.text);
          if (i >= 0) chat.items.splice(i, 1);
          chat.items.push({ seq: item.seq, kind: 'user', text: item.text });
          changed = true;
        } else if (item.kind === 'result') {
          const last = chat.items[chat.items.length - 1];
          if (last && last.kind === 'agent' && last.text === item.text) continue;
          chat.items.push({ seq: item.seq, kind: 'agent', text: item.text });
          changed = true;
        } else {
          chat.items.push(item);
          changed = true;
        }
      }
      if (changed) renderChat();
    }
    let running = state.running[chat.wakerId];
    if (!chat.sawState) {
      const d = await api(`/api/sessions/${chat.sessionId}/detail`);
      if (state.chat === chat && d.ok && d.raw) {
        running = /running|starting/.test(String(d.raw.runtimeState || ''));
        state.running[chat.wakerId] = running;
      }
    }
    const el = document.getElementById('chat-status');
    el.textContent = running ? 'SEDANG BEKERJA...' : 'STANDBY';
    el.className = 'chip ' + (running ? 'chip-run' : 'chip-ok');
  } finally {
    chat.polling = false;
  }
}

function renderChat() {
  const box = document.getElementById('chat-log');
  const chat = state.chat;
  if (!chat) return;
  box.innerHTML = '';
  for (const it of chat.items) {
    const div = document.createElement('div');
    div.className = 'msg ' + it.kind;
    div.textContent = it.text;
    box.append(div);
  }
  box.scrollTop = box.scrollHeight;
}

async function sendChat(message) {
  const chat = state.chat;
  if (!chat || !message.trim()) return;
  const input = document.getElementById('chat-input');
  input.disabled = true;
  let full = message;
  if (chat.attach.length) {
    full += '\n\nFile terlampir (sudah masuk repo ini, baca langsung):\n'
      + chat.attach.map((a) => `- ${a.path}`).join('\n');
  }
  try {
    if (!chat.sessionId) {
      const r = await api('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wakerId: chat.wakerId,
          message: full,
          persona: chat.role ? chat.role.persona : [],
          roleTitle: chat.role ? chat.role.title : null,
        }),
      });
      if (!r.ok) throw new Error(r.error || 'session create gagal');
      chat.sessionId = r.session.sessionId;
      state.sessionStore[chat.wakerId] = chat.sessionId;
      saveStore();
      document.getElementById('chat-sub').textContent = `session ${chat.sessionId}`;
      chat.items.push({ seq: 0, kind: 'user', text: full, opt: true });
    } else {
      const r = await api(`/api/sessions/${chat.sessionId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: full }),
      });
      if (!r.ok) throw new Error(r.error || 'send gagal');
      chat.items.push({ seq: 0, kind: 'user', text: full, opt: true });
    }
    chat.attach = [];
    renderAttach();
    renderChat();
    pollEvents();
  } catch (e) {
    chat.items.push({ seq: 0, kind: 'activity', text: `ERROR: ${e.message}` });
    renderChat();
  } finally {
    input.disabled = false;
    input.focus();
  }
}

/* ---------------- hire modal ---------------- */

function openHire(role) {
  const modal = document.getElementById('modal');
  modal.classList.add('open');
  document.getElementById('modal-body').innerHTML = `
    <h3>HIRE: ${escapeHtml(role.hire.name)} — ${escapeHtml(role.title)}</h3>
    <p>${escapeHtml(role.hire.description)}</p>
    <p class="dim">Persona (bible / identity / persona): ${role.persona.map(escapeHtml).join(', ')} — otomatis dibacakan pada pesan session pertama.</p>
    <p class="dim">Membuat Waker baru di QoderWake akun kamu (qoderwake waker create).</p>
    <div class="modal-actions">
      <button id="modal-cancel">BATAL</button>
      <button id="modal-ok" class="hire">HIRE SEKARANG</button>
    </div>`;
  document.getElementById('modal-cancel').onclick = () => modal.classList.remove('open');
  document.getElementById('modal-ok').onclick = async () => {
    const btn = document.getElementById('modal-ok');
    btn.disabled = true;
    btn.textContent = 'HIRING...';
    const r = await api('/api/hire', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roleId: role.id }),
    });
    modal.classList.remove('open');
    if (!r.ok) alert(`Hire gagal: ${r.error}`);
    await refresh();
  };
}

/* hire bebas dari footer: buat Waker baru untuk company ini */
function openHireCustom() {
  const modal = document.getElementById('modal');
  modal.classList.add('open');
  document.getElementById('modal-body').innerHTML = `
    <h3>HIRE ANOTHER AGENT</h3>
    <p class="dim">Membuat Waker baru di QoderWake untuk company ini. Kalau deskripsinya
    cocok kata kunci role Qwentir (intake / reconciliation / billing), dia otomatis
    duduk di meja role itu; kalau tidak, dia bergabung sebagai agen bebas di kantor.</p>
    <p class="dim">File personality / bible / identity tidak diisi di sini: persona hidup
    di folder agents/ dan terikat ke role lewat office/roles.json. Kalau deskripsi Waker
    baru cocok kata kunci sebuah role, persona role itu otomatis dibacakan saat session
    pertamanya; agen bebas bekerja tanpa persona.</p>
    <p><input id="hire-name" maxlength="60" placeholder="Nama (mis. Sari)" /></p>
    <p><textarea id="hire-desc" rows="3" maxlength="300"
      placeholder="Deskripsi pekerjaan, mis. memeriksa dokumen DO dan POD, merekap volume bongkar muat..."></textarea></p>
    <div class="modal-actions">
      <button id="modal-cancel">BATAL</button>
      <button id="modal-ok" class="hire">HIRE SEKARANG</button>
    </div>`;
  document.getElementById('modal-cancel').onclick = () => modal.classList.remove('open');
  document.getElementById('modal-ok').onclick = async () => {
    const name = document.getElementById('hire-name').value.trim();
    const description = document.getElementById('hire-desc').value.trim();
    if (!name || !description) { alert('Nama dan deskripsi wajib diisi dulu'); return; }
    const btn = document.getElementById('modal-ok');
    btn.disabled = true;
    btn.textContent = 'HIRING...';
    const r = await api('/api/hire', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description }),
    });
    modal.classList.remove('open');
    if (!r.ok) alert(`Hire gagal: ${r.error}`);
    await refresh();
  };
}

/* ---------------- wiring ---------------- */

function canvasPoint(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    px: (e.clientX - rect.left) * (canvas.width / rect.width),
    py: (e.clientY - rect.top) * (canvas.height / rect.height),
  };
}

function charAt(px, py) {
  for (const ch of state.chars) {
    if (!ch.waker) continue;
    const cx = ch.x * SCALE;
    const cy = ch.y * SCALE;
    if (px > cx - 2 * SCALE && px < cx + 18 * SCALE && py > cy - 4 * SCALE && py < cy + 20 * SCALE) return ch;
  }
  return null;
}

/* klik = sapa/elus (reaksi lompat + emote ala vscode-pet);
   klik 2x = buka chat; klik lantai = taruh kardus; meja vacant = hire */
canvas.addEventListener('click', (e) => {
  const { px, py } = canvasPoint(e);
  const now = performance.now();
  const ch = charAt(px, py);
  if (ch) { petChar(ch, now); return; }
  const catX = (DESK_X[0] + 1) * TS + 2 * SCALE;
  const catY = 8 * TS + 8 * SCALE;
  if (px > catX - 2 * SCALE && px < catX + 12 * SCALE && py > catY - 4 * SCALE && py < catY + 7 * SCALE) {
    state.catJumpUntil = now + 650;
    return;
  }
  for (const c of state.chars) {
    if (c.waker) continue;
    if (Math.abs(px - (c.desk[0] * TS + 8 * SCALE)) < 3 * TS
      && Math.abs(py - (c.desk[1] * TS + 8 * SCALE)) < 2 * TS) {
      const role = state.roles.find((r) => r.id === c.roleId);
      if (role && role.hire) openHire(role);
      return;
    }
  }
  const tx = Math.floor(px / TS);
  const ty = Math.floor(py / TS);
  if (isWalkable(tx, ty)) state.ball = { x: tx * TILE + 8, y: ty * TILE + 8, chaser: null };
});

canvas.addEventListener('dblclick', (e) => {
  const { px, py } = canvasPoint(e);
  const ch = charAt(px, py);
  if (ch) openChat(ch.waker);
});

document.getElementById('chat-close').onclick = closeChat;
document.getElementById('chat-send').onclick = () => {
  const input = document.getElementById('chat-input');
  const msg = input.value;
  input.value = '';
  sendChat(msg);
};
document.getElementById('chat-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('chat-send').click();
});
document.getElementById('chat-attach').onclick = () => document.getElementById('chat-file').click();
document.getElementById('chat-file').addEventListener('change', (e) => {
  uploadFiles(e.target.files);
  e.target.value = '';
});
document.getElementById('chat-stop').onclick = async () => {
  if (state.chat && state.chat.sessionId) {
    await api(`/api/sessions/${state.chat.sessionId}/stop`, { method: 'POST' });
    pollEvents();
  }
};

setInterval(() => { if (state.chat && state.chat.sessionId) pollEvents(); }, 2000);
setInterval(refresh, 6000);

fitCanvas(); // ukuran fullscreen sebelum data pertama tiba
refresh().then(() => { fitCanvas(); requestAnimationFrame(loop); });
