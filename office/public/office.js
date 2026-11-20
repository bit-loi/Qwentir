/* Qwentir Virtual Office — Soul Knight flavored office sim wired to QoderWake. */
'use strict';

const canvas = document.getElementById('office');
const ctx = canvas.getContext('2d');
const TS = TILE * SCALE; // tile size in canvas px
canvas.width = MAP_W * TS;
canvas.height = MAP_H * TS;

/* display size = sebesar mungkin muat di stage, rasio pixel tetap */
function fitCanvas() {
  const wrap = document.getElementById('canvas-wrap');
  const hint = document.getElementById('hint');
  const availW = wrap.clientWidth - 24 - 8; // padding wrap + border canvas
  const availH = wrap.clientHeight - 24 - 8 - hint.offsetHeight - 10;
  const ratio = canvas.width / canvas.height;
  let w = Math.min(availW, availH * ratio, 1600);
  if (!Number.isFinite(w)) w = 320;
  w = Math.max(w, 240); // lantai buat window super kecil
  canvas.style.width = `${Math.floor(w)}px`;
  canvas.style.height = `${Math.floor(w / ratio)}px`;
}
window.addEventListener('resize', fitCanvas);
window.addEventListener('load', fitCanvas);
fitCanvas(); // ukuran awal sebelum data pertama tiba

const state = {
  status: null,
  wakers: [],
  roles: [],
  chars: [],
  chat: null,
  sessionStore: loadStore(),
  running: {},
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
  for (const role of state.roles) {
    const waker = state.wakers.find((w) => w.roleId === role.id);
    const prev = state.chars.find((c) => c.roleId === role.id);
    next.push({
      roleId: role.id,
      roleTitle: role.title,
      palette: PALETTES[role.palette] || PALETTES.gray,
      desk: role.desk,
      waker: waker || null,
      name: waker ? waker.name : null,
      x: prev ? prev.x : role.desk[0] * TILE + 1,
      y: prev ? prev.y : role.desk[1] * TILE - 2,
      tx: prev ? prev.tx : role.desk[0] * TILE + 1,
      ty: prev ? prev.ty : role.desk[1] * TILE - 2,
      flip: prev ? prev.flip : false,
      frame: 0,
      pauseUntil: prev ? prev.pauseUntil : 0,
      mode: prev ? prev.mode : 'wander',
    });
  }
  state.chars = next;
}

/* ---------------- character brain ---------------- */

function updateChars(now, dt) {
  for (const ch of state.chars) {
    if (!ch.waker || !ch.waker.online) { ch.mode = 'away'; continue; }
    ch.mode = state.running[ch.waker.agentId] ? 'work' : 'wander';
    if (ch.mode === 'work') {
      ch.tx = ch.desk[0] * TILE + 1;
      ch.ty = ch.desk[1] * TILE - 2;
    } else if (now > ch.pauseUntil) {
      const arrived = Math.abs(ch.x - ch.tx) < 1 && Math.abs(ch.y - ch.ty) < 1;
      if (arrived) {
        const wp = WAYPOINTS[Math.floor(Math.random() * WAYPOINTS.length)];
        ch.tx = wp[0] * TILE + 1;
        ch.ty = wp[1] * TILE - 2;
        if (Math.random() < 0.35) ch.pauseUntil = now + 1200 + Math.random() * 2500;
      }
    }
    const dx = ch.tx - ch.x;
    const dy = ch.ty - ch.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 1) {
      const speed = 40 * dt;
      ch.x += (dx / dist) * Math.min(speed, dist);
      ch.y += (dy / dist) * Math.min(speed, dist);
      ch.flip = dx < 0;
      ch.frame = Math.floor(now / 200) % 2;
    } else {
      ch.frame = Math.floor(now / 520) % 2;
    }
  }
}

/* ---------------- Soul Knight style rendering ---------------- */

let staticLayer = null;

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
  drawDoor(g);
  drawNeonSign(g);
  drawPosters(g);
}

function drawTile(g, t, tx, ty) {
  const x = tx * TS;
  const y = ty * TS;
  const S = SCALE;
  if (t === 'X') return; // void stays black
  if (t === '#') {
    g.fillStyle = '#0c0f18';
    g.fillRect(x, y, TS, TS);
    g.fillStyle = '#141827';
    g.fillRect(x + 1 * S, y + 3 * S, 14 * S, 2 * S);
    g.fillStyle = '#080a12';
    g.fillRect(x, y + 12 * S, TS, 4 * S);
    return;
  }
  if (t === '.') {
    g.fillStyle = (tx + ty) % 2 === 0 ? '#3d4658' : '#384152';
    g.fillRect(x, y, TS, TS);
    g.fillStyle = '#2b3242';
    g.fillRect(x + TS - S, y, S, TS);
    g.fillRect(x, y + TS - S, TS, S);
    if ((tx * 7 + ty * 13) % 11 === 0) {
      g.fillStyle = 'rgba(255,255,255,0.05)';
      g.fillRect(x + 5 * S, y + 6 * S, 2 * S, 2 * S);
    }
    return;
  }
  if (t === 'M') {
    g.fillStyle = '#463158';
    g.fillRect(x, y, TS, TS);
    g.fillStyle = '#573d6b';
    g.fillRect(x + 2 * S, y + 2 * S, 12 * S, 12 * S);
    g.fillStyle = '#3a2949';
    g.fillRect(x + TS - S, y, S, TS);
    return;
  }
  if (t === 'D' || t === 'T') {
    g.fillStyle = t === 'D' ? '#6b421f' : '#7a4E28'.toLowerCase();
    g.fillRect(x, y, TS, TS);
    g.fillStyle = t === 'D' ? '#8a5a30' : '#93663d';
    g.fillRect(x + 1 * S, y + 1 * S, 14 * S, 14 * S);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(x + 1 * S, y + 8 * S, 14 * S, 1 * S);
    return;
  }
  if (t === 'C') {
    g.fillStyle = '#2c3145';
    g.fillRect(x + 4 * S, y + 5 * S, 8 * S, 8 * S);
    g.fillStyle = '#3a4059';
    g.fillRect(x + 4 * S, y + 3 * S, 8 * S, 3 * S);
    return;
  }
  if (t === 'P') {
    g.fillStyle = '#5c311d';
    g.fillRect(x + 5 * S, y + 10 * S, 6 * S, 5 * S);
    g.fillStyle = '#1d6b3a';
    g.fillRect(x + 3 * S, y + 3 * S, 10 * S, 8 * S);
    g.fillStyle = '#2fa14e';
    g.fillRect(x + 5 * S, y + 1 * S, 6 * S, 5 * S);
    return;
  }
  if (t === 'K') {
    g.fillStyle = '#7e2626';
    g.fillRect(x + 2 * S, y + 2 * S, 12 * S, 13 * S);
    g.fillStyle = '#c9ccd6';
    g.fillRect(x + 4 * S, y + 4 * S, 8 * S, 4 * S);
    g.fillStyle = '#15151f';
    g.fillRect(x + 5 * S, y + 10 * S, 6 * S, 3 * S);
    return;
  }
  if (t === 'S') {
    g.fillStyle = '#4a3268';
    g.fillRect(x, y + 2 * S, TS, 12 * S);
    g.fillStyle = '#5c3f80';
    g.fillRect(x + 1 * S, y + 4 * S, 14 * S, 5 * S);
    return;
  }
  if (t === 'R') {
    g.fillStyle = '#0b0d14';
    g.fillRect(x + 3 * S, y, 10 * S, TS);
    g.fillStyle = '#1c2130';
    g.fillRect(x + 5 * S, y + 3 * S, 6 * S, 2 * S);
    g.fillRect(x + 5 * S, y + 8 * S, 6 * S, 2 * S);
    return;
  }
}

function drawDoor(g) {
  const S = SCALE;
  const x = 20 * TS;
  const y = 1 * TS - 4 * S;
  g.fillStyle = '#232a3d';
  g.fillRect(x - 2 * S, y - 2 * S, 4 * TS + 4 * S, 2 * TS + 6 * S);
  g.fillStyle = '#12151f';
  g.fillRect(x, y, 4 * TS, 2 * TS + 2 * S);
  g.fillStyle = '#2c3550';
  g.fillRect(x + 12 * S, y + 6 * S, 10 * S, 8 * S);
  g.fillStyle = '#3a4468';
  g.fillRect(x + 13 * S, y + 7 * S, 3 * S, 3 * S);
  g.fillStyle = '#0a0c12';
  g.fillRect(x + 4 * S, y + 2 * TS - 2 * S, 3 * S, 6 * S);
}

function drawNeonSign(g) {
  const S = SCALE;
  const x = 3 * TS;
  const y = 1 * TS - 2 * S;
  g.save();
  g.shadowColor = '#28e0ff';
  g.shadowBlur = 14 * S;
  g.fillStyle = '#0a2530';
  g.fillRect(x - 4 * S, y - 4 * S, pixelTextWidth('QWENTIR', 3 * S / S) * S + 8 * S, 5 * 3 * S + 12 * S);
  drawPixelText(g, 'QWENTIR', x, y, 3 * S, '#5ff0ff');
  g.fillStyle = '#5ff0ff';
  g.fillRect(x - 2 * S, y + 5 * 3 * S + 2 * S, pixelTextWidth('QWENTIR', 3 * S) + 4 * S, 2 * S);
  g.fillRect(x + 6 * S, y + 5 * 3 * S + 5 * S, pixelTextWidth('QWENTIR', 3 * S) - 8 * S, 1 * S);
  g.restore();
  drawPixelText(g, 'BACK OFFICE', x + 2 * S, y + 5 * 3 * S + 8 * S, S, '#2a7f95');
}

function drawPosters(g) {
  const S = SCALE;
  // Qwen poster
  let x = 27 * TS;
  let y = 1 * TS - 3 * S;
  g.fillStyle = '#20263a';
  g.fillRect(x - 2 * S, y - 2 * S, 12 * S + 4 * S, 16 * S + 4 * S);
  g.fillStyle = '#615CED';
  g.fillRect(x, y, 12 * S, 16 * S);
  g.fillStyle = '#7b78f2';
  g.fillRect(x + 1 * S, y + 1 * S, 10 * S, 6 * S);
  // pixel Q ring
  g.fillStyle = '#ffffff';
  g.fillRect(x + 3 * S, y + 3 * S, 6 * S, 1 * S);
  g.fillRect(x + 2 * S, y + 4 * S, 1 * S, 4 * S);
  g.fillRect(x + 9 * S, y + 4 * S, 1 * S, 4 * S);
  g.fillRect(x + 3 * S, y + 8 * S, 4 * S, 1 * S);
  g.fillRect(x + 8 * S, y + 7 * S, 2 * S, 2 * S);
  drawPixelText(g, 'QWEN', x + 1 * S, y + 11 * S, S, '#ffffff');
  // Alibaba Cloud poster
  x = 31 * TS;
  g.fillStyle = '#20263a';
  g.fillRect(x - 2 * S, y - 2 * S, 14 * S + 4 * S, 16 * S + 4 * S);
  g.fillStyle = '#12141c';
  g.fillRect(x, y, 14 * S, 16 * S);
  g.fillStyle = '#FF6A00';
  // bracket mark [ ]
  g.fillRect(x + 2 * S, y + 3 * S, 3 * S, 1 * S);
  g.fillRect(x + 2 * S, y + 4 * S, 1 * S, 4 * S);
  g.fillRect(x + 2 * S, y + 8 * S, 3 * S, 1 * S);
  g.fillRect(x + 9 * S, y + 3 * S, 3 * S, 1 * S);
  g.fillRect(x + 11 * S, y + 4 * S, 1 * S, 4 * S);
  g.fillRect(x + 9 * S, y + 8 * S, 3 * S, 1 * S);
  drawPixelText(g, 'ALIBABA', x + 1 * S, y + 11 * S, S, '#FF6A00');
  drawPixelText(g, 'CLOUD', x + 3 * S, y + 13 * S, S, '#c9ccd6');
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
  // tiny code terminal on the cluster
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
}

function draw(now) {
  if (!staticLayer) buildStaticLayer();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(staticLayer, 0, 0);

  // spotlight pool over the room
  const cx = canvas.width / 2;
  const cy = canvas.height * 0.52;
  const pool = ctx.createRadialGradient(cx, cy, TS * 2, cx, cy, canvas.width * 0.42);
  pool.addColorStop(0, 'rgba(190,210,255,0.10)');
  pool.addColorStop(1, 'rgba(190,210,255,0)');
  ctx.fillStyle = pool;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // rack LEDs
  for (let i = 0; i < 2; i++) {
    ctx.fillStyle = Math.floor(now / 400) % 2 === i ? '#43e07c' : '#20503a';
    ctx.fillRect(2 * TS + 5 * SCALE, (10 + i) * TS + 3 * SCALE, 2 * SCALE, 2 * SCALE);
  }

  // desk clusters + cat
  const workingByRole = {};
  for (const ch of state.chars) if (ch.waker) workingByRole[ch.roleId] = ch.mode === 'work';
  DESK_X.forEach((cxr, i) => {
    const role = state.roles[i];
    drawDeskProps(ctx, cxr, role ? !!workingByRole[role.id] : false, now);
  });
  drawCat(ctx, (DESK_X[0] + 1) * TS + 2 * SCALE, 8 * TS + 8 * SCALE, SCALE, '#8a8a99');
  if (Math.floor(now / 900) % 2 === 0) {
    ctx.fillStyle = '#8a8a99';
    ctx.fillRect((DESK_X[0] + 1) * TS + 12 * SCALE, 8 * TS + 10 * SCALE, 2 * SCALE, SCALE);
  }

  // characters, depth-sorted
  const chars = [...state.chars].sort((a, b) => a.y - b.y);
  for (const ch of chars) {
    if (ch.mode === 'away') continue;
    const px = Math.round(ch.x) * SCALE;
    const py = Math.round(ch.y) * SCALE + (ch.frame && ch.mode === 'wander' ? -SCALE : 0);
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
  renderTasks();
  renderAttach();
  renderChat();
  pollEvents();
}

function closeChat() {
  state.chat = null;
  drawer.classList.remove('open');
}

function renderTasks() {
  const box = document.getElementById('chat-tasks');
  box.innerHTML = '';
  const role = state.chat && state.chat.role;
  if (!role) return;
  for (const t of role.tasks || []) {
    const b = document.createElement('button');
    b.className = 'task';
    b.textContent = t;
    b.onclick = () => sendChat(t);
    box.append(b);
  }
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
        body: JSON.stringify({ wakerId: chat.wakerId, message: full }),
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
    <p class="dim">Persona dibaca dari repo ini saat bekerja: ${role.persona.map(escapeHtml).join(', ')}</p>
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

/* ---------------- wiring ---------------- */

canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  const px = (e.clientX - rect.left) * (canvas.width / rect.width);
  const py = (e.clientY - rect.top) * (canvas.height / rect.height);
  for (const ch of state.chars) {
    const cx = ch.x * SCALE;
    const cy = ch.y * SCALE;
    const hit = !ch.waker
      ? (Math.abs(px - (ch.desk[0] * TS + 8 * SCALE)) < 3 * TS && Math.abs(py - (ch.desk[1] * TS + 8 * SCALE)) < 2 * TS)
      : (px > cx - 2 * SCALE && px < cx + 18 * SCALE && py > cy - 4 * SCALE && py < cy + 20 * SCALE);
    if (hit) {
      if (ch.waker) openChat(ch.waker);
      else {
        const role = state.roles.find((r) => r.id === ch.roleId);
        if (role && role.hire) openHire(role);
      }
      return;
    }
  }
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

refresh().then(() => { fitCanvas(); requestAnimationFrame(loop); });
