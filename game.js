(() => {
'use strict';

// ======================================================================
//  常量 & 画布
// ======================================================================
const W = 480, H = 270, GROUND = 214;   // 像素世界分辨率
const PX = 108, VX = 362;               // 玩家 / 小人 的中心 x
const SW = 1440, SH = 810;              // 屏幕画布分辨率（世界的 3 倍）
const FONT = '"Microsoft YaHei","PingFang SC","Noto Sans SC",sans-serif';

const $ = id => document.getElementById(id);
const screenCv = $('game');
screenCv.width = SW; screenCv.height = SH;
const sctx = screenCv.getContext('2d');
const world = document.createElement('canvas');
world.width = W; world.height = H;
const g = world.getContext('2d');

const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = t => 1 - (1 - t) * (1 - t);
const easeIn = t => t * t;

// ======================================================================
//  像素绘制工具
// ======================================================================
function rect(x, y, w, h, c) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); }
function px(x, y, c) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), 1, 1); }

function line(x0, y0, x1, y1, c, s = 1) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  g.fillStyle = c;
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  const o = Math.floor(s / 2);
  let err = dx + dy, guard = 0;
  for (;;) {
    g.fillRect(x0 - o, y0 - o, s, s);
    if ((x0 === x1 && y0 === y1) || ++guard > 1500) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

function circle(cx, cy, r, c) {
  if (r <= 0) return;
  cx = Math.round(cx); cy = Math.round(cy);
  g.fillStyle = c;
  const ri = Math.ceil(r), r2 = r * r;
  for (let dy = -ri; dy <= ri; dy++) {
    const d2 = dy * dy;
    if (d2 > r2) continue;
    const hw = Math.round(Math.sqrt(r2 - d2));
    g.fillRect(cx - hw, cy + dy, hw * 2 + 1, 1);
  }
}

function ring(cx, cy, r, th, c) {
  if (r <= 0) return;
  cx = Math.round(cx); cy = Math.round(cy);
  g.fillStyle = c;
  const ri = Math.ceil(r), r2 = r * r, ir = Math.max(0, r - th), ir2 = ir * ir;
  for (let dy = -ri; dy <= ri; dy++) {
    const d2 = dy * dy;
    if (d2 > r2) continue;
    const wo = Math.round(Math.sqrt(r2 - d2));
    if (d2 >= ir2) { g.fillRect(cx - wo, cy + dy, wo * 2 + 1, 1); }
    else {
      const wi = Math.round(Math.sqrt(ir2 - d2));
      const w = Math.max(1, wo - wi);
      g.fillRect(cx - wo, cy + dy, w, 1);
      g.fillRect(cx + wi + 1, cy + dy, w, 1);
    }
  }
}

function ellipseFill(cx, cy, rx, ry, c) {
  cx = Math.round(cx); cy = Math.round(cy);
  g.fillStyle = c;
  for (let dy = -ry; dy <= ry; dy++) {
    const hw = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy / ry) * (dy / ry))));
    g.fillRect(cx - hw, cy + dy, hw * 2 + 1, 1);
  }
}

function ellipseLine(cx, cy, rx, ry, c) {
  if (rx <= 0) return;
  g.fillStyle = c;
  const n = Math.max(16, Math.ceil(Math.PI * 2 * Math.max(rx, ry) / 1.1));
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2;
    g.fillRect(Math.round(cx + Math.cos(a) * rx), Math.round(cy + Math.sin(a) * ry), 1, 1);
  }
}

// 3x5 像素数字字体（伤害数字）
const GLYPH = {
  '0': '111101101101111', '1': '010110010010111', '2': '111001111100111',
  '3': '111001111001111', '4': '101101111001001', '5': '111100111001111',
  '6': '111100111101111', '7': '111001001001001', '8': '111101111101111',
  '9': '111101111001111', '!': '010010010000010', '-': '000000111000000',
};
function bmText(str, x, y, s, col, out) {
  const w = str.length * 4 * s - s;
  const x0 = Math.round(x - w / 2), y0 = Math.round(y);
  for (let pass = 0; pass < 2; pass++) {
    g.fillStyle = pass === 0 ? out : col;
    for (let i = 0; i < str.length; i++) {
      const gl = GLYPH[str[i]];
      if (!gl) continue;
      for (let k = 0; k < 15; k++) {
        if (gl[k] !== '1') continue;
        const gx = x0 + i * 4 * s + (k % 3) * s, gy = y0 + Math.floor(k / 3) * s;
        if (pass === 0) g.fillRect(gx - 1, gy - 1, s + 2, s + 2);
        else g.fillRect(gx, gy, s, s);
      }
    }
  }
}

// ======================================================================
//  像素精灵
// ======================================================================
function makeSprite(rows, pal) {
  const h = rows.length, w = Math.max(...rows.map(r => r.length));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  rows.forEach((row, y) => {
    for (let i = 0; i < row.length; i++) {
      const col = pal[row[i]];
      if (col) { x.fillStyle = col; x.fillRect(i, y, 1, 1); }
    }
  });
  return c;
}
function tint(src, color) {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const x = c.getContext('2d');
  x.drawImage(src, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = color;
  x.fillRect(0, 0, c.width, c.height);
  return c;
}

const PLAYER_ROWS = [
  '......kkkkk.....',
  '....kkHHHHHkk...',
  '...kHHHHHHHHhk..',
  '..kHHHHHHHHHhhk.',
  '..kHHHkkkkkkkkk.',
  '..kHHkssssssssk.',
  '..kHHkssEEssEEk.',
  '..kHHksssssssSk.',
  '...kHkSssssSSk..',
  '...krrkSSSSkk...',
  '..krrrrrrrrrrk..',
  '.kRrrrrrrrrRRk..',
  '.kcCCCkRrkCCCck.',
  '.kcCCCCkkCCCCck.',
  '.kccCCCCCCCCcck.',
  'ksccbbbbbbbbccsk',
  'kSkcCCCbbCCCckSk',
  '..kkcCCCCCCckk..',
  '...kccccccccck..',
  '....kppk.kppk...',
  '....kppk.kppk...',
  '....kppk.kppk...',
  '...koook..koook.',
  '...kkkkk..kkkkk.',
];
const PLAYER_PAL = {
  k: '#140c1c', H: '#4a3590', h: '#2e2160', s: '#f4cfa4', S: '#c9906a', E: '#7ff6ff',
  r: '#e23c3c', R: '#8e1f2c', c: '#25346a', C: '#3d58a8', b: '#d8a83c', p: '#2a2238', o: '#5a3420',
};

const VILLAIN_ROWS = [
  '....kkkkkkk.....',
  '...kiiiiiiik....',
  '..kiiiiiiiiik...',
  '..kwwwwwwwwwk...',
  '..kwrrwwwrrwk...',
  '..kwwkwwwkwwk...',
  '..kwwwwWwwwwk...',
  '..kwwrrrrrwwk...',
  '...kwwwwwwwk....',
  '....kkwwwkk.....',
  '..kkwwwwwwwkk...',
  '.kwwwwwwwwwwwk..',
  'kwwkwyyyyywkwwk.',
  'kwk.wyrrrywk.kwk',
  'kwk.wyyyyywk.kwk',
  'kk..wwwwwwwk..kk',
  '....kwwwwwwk....',
  '....kwwkwwwk....',
  '....kwk.kwwk....',
  '....kwk..kwk....',
  '....kwk..kwk....',
  '...kwwk..kwwk...',
  '...kkkk..kkkk...',
];
const VILLAIN_HURT_ROWS = VILLAIN_ROWS.slice();
VILLAIN_HURT_ROWS[4] = '..kwkwkwkwkwk...';
VILLAIN_HURT_ROWS[5] = '..kwwkwwwkwwk...';
VILLAIN_HURT_ROWS[6] = '..kwkwkwkwkwk...';
VILLAIN_HURT_ROWS[7] = '..kwwwrrrwwwk...';
const VILLAIN_PAL = { k: '#2a1a10', i: '#1a1a1a', w: '#efe3c6', W: '#c9b58e', r: '#c8282a', y: '#f2c230' };

const SLIPPER_ROWS = [
  '..kkkkkkkkkkkk..',
  '.kpppppppppppppk',
  'kpPPPPPPPPPPPPpk',
  'kpPPkkkkPPPPPPpk',
  '.kddddddddddddk.',
  '..kkkkkkkkkkkk..',
];
const SLIPPER_PAL = { k: '#2a0a1a', p: '#ff6a8a', P: '#ff9ab0', d: '#a83a5a' };

function giantSwordRows() {
  const rows = [
    '....kkk....',
    '...kgGgk...',
    '....kgk....',
    '....kbk....',
    '....kbk....',
    '....kbk....',
    '..kkkgkkk..',
    'kgggGrGgggk',
    '..kkkgkkk..',
  ];
  for (let i = 0; i < 28; i++) rows.push('...kwWck...');
  rows.push('....kwk....', '....kWk....', '.....k.....');
  return rows;
}
const GSWORD_PAL = { k: '#1a0f1f', g: '#ffd24a', G: '#fff3a0', b: '#6a3a1a', r: '#ff3a5a', w: '#ffffff', W: '#bfefff', c: '#5aa8d8' };

const spr = {};
spr.player = makeSprite(PLAYER_ROWS, PLAYER_PAL);
spr.villain = makeSprite(VILLAIN_ROWS, VILLAIN_PAL);
spr.villainHurt = makeSprite(VILLAIN_HURT_ROWS, VILLAIN_PAL);
spr.villainWhite = tint(spr.villain, '#ffffff');
spr.slipper = makeSprite(SLIPPER_ROWS, SLIPPER_PAL);
spr.gsword = makeSprite(giantSwordRows(), GSWORD_PAL);
spr.gswordGlow = tint(spr.gsword, '#ffcf4a');

// 小人外观：默认纸人，或上传的照片纸牌（w/h 为世界像素尺寸）
const villainLook = { normal: spr.villain, hurt: spr.villainHurt, white: spr.villainWhite, w: 32, h: spr.villain.height * 2, photo: false };
function useDefaultLook() {
  Object.assign(villainLook, { normal: spr.villain, hurt: spr.villainHurt, white: spr.villainWhite, w: 32, h: spr.villain.height * 2, photo: false });
}

const PHOTO_W = 32, PHOTO_H = 44;
// 把任意图片裁成 3:4 竖幅、缩到 32x44 并做色阶量化，得到像素风照片
function pixelatePhoto(img) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const ar = PHOTO_W / PHOTO_H;
  let cw = iw, ch = iw / ar;
  if (ch > ih) { ch = ih; cw = ih * ar; }
  const sx = (iw - cw) / 2, sy = (ih - ch) * 0.3;   // 偏上裁剪，尽量保住脸
  // 逐级减半缩小，避免一步缩太狠出现锯齿噪点
  let cur = document.createElement('canvas');
  cur.width = Math.max(PHOTO_W, Math.round(cw)); cur.height = Math.max(PHOTO_H, Math.round(ch));
  cur.getContext('2d').drawImage(img, sx, sy, cw, ch, 0, 0, cur.width, cur.height);
  while (cur.width / 2 >= PHOTO_W * 2) {
    const n = document.createElement('canvas');
    n.width = Math.round(cur.width / 2); n.height = Math.round(cur.height / 2);
    const nx = n.getContext('2d');
    nx.imageSmoothingQuality = 'high';
    nx.drawImage(cur, 0, 0, n.width, n.height);
    cur = n;
  }
  const out = document.createElement('canvas');
  out.width = PHOTO_W; out.height = PHOTO_H;
  const x = out.getContext('2d');
  x.imageSmoothingQuality = 'high';
  x.drawImage(cur, 0, 0, PHOTO_W, PHOTO_H);
  const d = x.getImageData(0, 0, PHOTO_W, PHOTO_H);
  for (let i = 0; i < d.data.length; i += 4) {
    for (let k = 0; k < 3; k++) {
      const v = (d.data[i + k] - 128) * 1.12 + 128;          // 略增对比
      d.data[i + k] = clamp(Math.round(v / 20) * 20, 0, 255); // 色阶量化
    }
    d.data[i + 3] = 255;
  }
  x.putImageData(d, 0, 0);
  return out;
}

// 把照片贴成一张立在地上的纸牌
function makePhotoCard(photo, tintColor, tintA) {
  const c = document.createElement('canvas');
  c.width = PHOTO_W + 4; c.height = PHOTO_H + 8;
  const x = c.getContext('2d');
  x.fillStyle = '#2a1a10'; x.fillRect(0, 0, c.width, PHOTO_H + 6);
  x.fillStyle = '#efe3c6'; x.fillRect(1, 1, c.width - 2, PHOTO_H + 4);
  x.fillStyle = '#c9b58e'; x.fillRect(1, PHOTO_H + 3, c.width - 2, 2); x.fillRect(c.width - 3, 1, 2, PHOTO_H + 4);
  x.drawImage(photo, 2, 2);
  // 顶部红色封条
  x.fillStyle = '#2a1a10'; x.fillRect(13, 0, 10, 5);
  x.fillStyle = '#c8282a'; x.fillRect(14, 0, 8, 4);
  x.fillStyle = '#f2c230'; x.fillRect(17, 1, 2, 2);
  // 底座支脚
  x.fillStyle = '#2a1a10'; x.fillRect(7, PHOTO_H + 6, 4, 2); x.fillRect(c.width - 11, PHOTO_H + 6, 4, 2);
  if (tintColor) {
    x.globalCompositeOperation = 'source-atop';
    x.globalAlpha = tintA;
    x.fillStyle = tintColor;
    x.fillRect(0, 0, c.width, c.height);
  }
  return c;
}

function usePhotoLook(photo) {
  const normal = makePhotoCard(photo);
  Object.assign(villainLook, {
    normal, hurt: makePhotoCard(photo, '#ff2020', 0.38), white: tint(normal, '#ffffff'),
    w: normal.width, h: normal.height, photo: true,
  });
}

// ======================================================================
//  背景（预渲染）
// ======================================================================
function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

function buildBG() {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');

  // 抖动渐变夜空
  const bands = ['#0a0720', '#110c2e', '#18113e', '#22164c', '#2e1b58', '#40215e', '#58285e'].map(hexRgb);
  const img = x.createImageData(W, H);
  const bh = GROUND / (bands.length - 1);
  for (let y = 0; y < GROUND; y++) {
    const fi = y / bh, i0 = Math.min(bands.length - 2, Math.floor(fi)), fr = fi - i0;
    for (let xx = 0; xx < W; xx++) {
      const th = (BAYER[(y & 3) * 4 + (xx & 3)] + 0.5) / 16;
      const col = fr > th ? bands[i0 + 1] : bands[i0];
      const o = (y * W + xx) * 4;
      img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);

  const fill = (c2, a, b, w, h) => { x.fillStyle = c2; x.fillRect(Math.round(a), Math.round(b), w, h); };
  const disc = (cx, cy, r, c2) => {
    x.fillStyle = c2;
    for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
      if (dy * dy > r * r) continue;
      const hw = Math.round(Math.sqrt(r * r - dy * dy));
      x.fillRect(Math.round(cx) - hw, Math.round(cy) + dy, hw * 2 + 1, 1);
    }
  };

  // 星星
  for (let i = 0; i < 140; i++) {
    const sx = randi(0, W - 1), sy = randi(0, 130);
    fill(pick(['#ffffff', '#cfd8ff', '#fff2c0', '#8a86c0', '#6a6aa0']), sx, sy, 1, 1);
  }
  // 月亮
  disc(398, 52, 34, 'rgba(255,230,180,0.05)');
  disc(398, 52, 28, 'rgba(255,230,180,0.07)');
  disc(398, 52, 21, '#f6ebc6');
  disc(404, 50, 17, '#fff6dc');
  disc(390, 46, 4, '#e2d4a6');
  disc(402, 62, 3, '#e2d4a6');
  disc(408, 44, 2, '#e8dbb0');
  disc(388, 60, 2, '#e8dbb0');

  // 远山
  for (let xx = 0; xx < W; xx++) {
    const h = 34 + 16 * Math.sin(xx * 0.013 + 1) + 9 * Math.sin(xx * 0.037 + 2) + 4 * Math.sin(xx * 0.11);
    fill('#241a4a', xx, GROUND - 26 - h, 1, h + 26);
  }
  for (let xx = 0; xx < W; xx++) {
    const h = 20 + 10 * Math.sin(xx * 0.021 + 4) + 6 * Math.sin(xx * 0.057 + 1);
    fill('#1c1440', xx, GROUND - 14 - h, 1, h + 14);
  }

  // 近景古建筑剪影
  const sil = '#130c2a';
  const house = (bx, bw, bh2) => {
    const top = GROUND - bh2;
    fill(sil, bx, top, bw, bh2);
    // 屋顶（飞檐）
    for (let i = 0; i < 7; i++) fill(sil, bx - 6 + i, top - 7 + i, bw + 12 - i * 2, 1);
    fill(sil, bx - 8, top - 8, 3, 2); fill(sil, bx + bw + 5, top - 8, 3, 2);
    // 窗户灯光
    for (let wy = top + 5; wy < GROUND - 6; wy += 8) {
      for (let wx = bx + 3; wx < bx + bw - 3; wx += 6) {
        if (Math.random() < 0.45) fill(pick(['#ffcf6a', '#ff9a3a', '#ffe9a0']), wx, wy, 2, 3);
      }
    }
  };
  house(8, 36, 40); house(52, 28, 28); house(150, 44, 34); house(300, 30, 26); house(430, 46, 38);
  // 宝塔
  const tx = 228;
  for (let t = 0; t < 5; t++) {
    const tw = 34 - t * 5, ty = GROUND - 22 - t * 16;
    fill(sil, tx - tw / 2, ty, tw, 16);
    for (let i = 0; i < 5; i++) fill(sil, tx - tw / 2 - 6 + i, ty - 4 + i, tw + 12 - i * 2, 1);
    if (t < 4) fill('#ffcf6a', tx - 1, ty + 6, 2, 3);
  }
  fill(sil, tx - 1, GROUND - 22 - 5 * 16 - 10, 2, 14);
  fill(sil, 252, GROUND - 22, 50, 22);

  // 地面石板
  fill('#2e2540', 0, GROUND, W, H - GROUND);
  fill('#6a5a80', 0, GROUND, W, 1);
  fill('#4a3e60', 0, GROUND + 1, W, 1);
  let rowY = GROUND + 2, rh = 5, row = 0;
  while (rowY < H) {
    fill('#221b30', 0, rowY + rh, W, 1);
    const tw = 22 + row * 6;
    for (let xx = (row % 2) * tw / 2 - tw; xx < W; xx += tw) {
      fill('#221b30', xx, rowY, 1, rh);
      fill('#3a3050', xx + 1, rowY, tw - 2, 1);
    }
    rowY += rh + 1; rh += 3; row++;
  }
  for (let i = 0; i < 160; i++) fill(pick(['#3a3050', '#262036', '#40365a']), randi(0, W), randi(GROUND + 3, H), 1, 1);
  return c;
}
const bg = buildBG();

const twinkles = Array.from({ length: 24 }, () => ({ x: randi(0, W - 1), y: randi(0, 120), p: rand(0, 6), s: rand(1, 4) }));

// ======================================================================
//  音效（Web Audio 实时合成）
// ======================================================================
const Snd = {
  ctx: null, master: null, noise: null, muted: false, last: {},
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.45;
    const comp = this.ctx.createDynamicsCompressor();
    this.master.connect(comp); comp.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 2;
    const b = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = b;
  },
  ok(name, gap) {
    if (!this.ctx || this.muted) return false;
    const n = this.ctx.currentTime;
    if (this.last[name] !== undefined && n - this.last[name] < gap) return false;
    this.last[name] = n;
    return true;
  },
  nz(dur, ftype, f0, f1, vol, q = 1, delay = 0) {
    const c = this.ctx, t = c.currentTime + delay;
    const s = c.createBufferSource();
    s.buffer = this.noise; s.loop = true;
    const f = c.createBiquadFilter();
    f.type = ftype; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const gn = c.createGain();
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(gn); gn.connect(this.master);
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.05);
  },
  tone(type, f0, f1, dur, vol, delay = 0) {
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const gn = c.createGain();
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(gn); gn.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  },
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.45;
  },
};

const sfx = {
  slash() { if (!Snd.ok('slash', 0.03)) return; Snd.nz(0.16, 'highpass', 1500, 6000, 0.45, 0.7); Snd.tone('sawtooth', 900, 200, 0.1, 0.06); },
  slashHit() { if (!Snd.ok('slashHit', 0.03)) return; Snd.nz(0.1, 'bandpass', 3000, 1200, 0.6, 2); Snd.tone('square', 300, 90, 0.08, 0.1); },
  gun() { if (!Snd.ok('gun', 0.02)) return; Snd.nz(0.09, 'lowpass', 4000, 300, 0.7, 0.8); Snd.tone('square', 160, 40, 0.09, 0.22); Snd.nz(0.03, 'highpass', 5000, 5000, 0.3, 1); },
  fireCast() { if (!Snd.ok('fireCast', 0.04)) return; Snd.nz(0.25, 'bandpass', 400, 2000, 0.35, 1.5); },
  boom() { if (!Snd.ok('boom', 0.04)) return; Snd.nz(0.5, 'lowpass', 1500, 80, 0.9, 0.7); Snd.tone('sine', 140, 35, 0.45, 0.55); },
  thunder() { if (!Snd.ok('thunder', 0.05)) return; Snd.nz(0.08, 'highpass', 3000, 3000, 0.9, 0.5); Snd.nz(0.7, 'lowpass', 2500, 60, 0.9, 0.6, 0.03); Snd.tone('sawtooth', 90, 30, 0.6, 0.22); },
  zap() { if (!Snd.ok('zap', 0.06)) return; Snd.tone('square', 1200, 300, 0.06, 0.05); Snd.nz(0.06, 'highpass', 4000, 4000, 0.2, 1); },
  iceCast() { if (!Snd.ok('iceCast', 0.04)) return; Snd.tone('sine', 1400, 2600, 0.12, 0.12); },
  ice() { if (!Snd.ok('ice', 0.025)) return; Snd.tone('triangle', rand(1800, 2600), 900, 0.12, 0.15); Snd.nz(0.1, 'highpass', 4000, 7000, 0.25, 1); },
  shatter() { if (!Snd.ok('shatter', 0.05)) return; Snd.nz(0.25, 'highpass', 5000, 9000, 0.35, 1); for (let i = 0; i < 3; i++) Snd.tone('sine', rand(2500, 4000), rand(1500, 2500), 0.08, 0.06, i * 0.03); },
  whoosh() { if (!Snd.ok('whoosh', 0.05)) return; Snd.nz(0.18, 'bandpass', 300, 1500, 0.4, 1.2); },
  slap() { if (!Snd.ok('slap', 0.03)) return; Snd.nz(0.07, 'bandpass', 1400, 900, 1.0, 1.5); Snd.tone('sine', 220, 60, 0.12, 0.5); },
  clang() { if (!Snd.ok('clang', 0.025)) return; Snd.tone('triangle', rand(1500, 2200), rand(700, 1000), 0.12, 0.1); Snd.nz(0.05, 'highpass', 3000, 3000, 0.25, 1); },
  riser() { if (!Snd.ok('riser', 0)) return; Snd.nz(1.6, 'bandpass', 150, 4000, 0.5, 3); Snd.tone('sawtooth', 80, 600, 1.6, 0.1); Snd.tone('sine', 40, 90, 1.6, 0.4); },
  stamp() { if (!Snd.ok('stamp', 0)) return; Snd.nz(0.4, 'lowpass', 2000, 100, 0.9, 0.7); Snd.tone('sine', 90, 40, 0.5, 0.7); Snd.tone('square', 600, 600, 0.08, 0.08); },
  charge() { if (!Snd.ok('charge', 0)) return; Snd.tone('sine', 300, 1200, 1.3, 0.14); Snd.tone('triangle', 450, 1800, 1.3, 0.07); },
  whooshBig() { if (!Snd.ok('whooshBig', 0)) return; Snd.nz(0.6, 'bandpass', 200, 2500, 0.6, 1); },
  impact() { if (!Snd.ok('impact', 0)) return; Snd.nz(0.25, 'highpass', 2000, 2000, 1, 0.5); Snd.tone('sine', 60, 30, 1.0, 0.8); Snd.tone('triangle', 2400, 1800, 0.6, 0.1); },
  boomBig() { if (!Snd.ok('boomBig', 0)) return; Snd.nz(1.8, 'lowpass', 2500, 40, 1, 0.6); Snd.tone('sine', 90, 22, 1.6, 0.9); Snd.nz(0.5, 'highpass', 3000, 1000, 0.5, 0.5); },
  ko() { if (!Snd.ok('ko', 0.3)) return; Snd.tone('square', 600, 150, 0.4, 0.12); Snd.tone('square', 450, 100, 0.5, 0.1, 0.1); },
  poof() { if (!Snd.ok('poof', 0.2)) return; Snd.nz(0.3, 'bandpass', 800, 300, 0.4, 1); },
  rumble() { if (!Snd.ok('rumble', 0)) return; Snd.nz(2.4, 'lowpass', 300, 60, 0.7, 0.8); Snd.tone('sine', 50, 32, 2.4, 0.45); },
  drone() { if (!Snd.ok('drone', 0)) return; Snd.tone('sine', 55, 38, 1.9, 0.5); Snd.tone('sawtooth', 110, 60, 1.9, 0.05); Snd.nz(1.8, 'bandpass', 2000, 150, 0.35, 4); },
  collapse() { if (!Snd.ok('collapse', 0)) return; Snd.nz(0.3, 'bandpass', 200, 3000, 0.6, 3); Snd.tone('sine', 200, 1400, 0.3, 0.2); },
};

// ======================================================================
//  全局状态
// ======================================================================
const R = {
  fire: ['#ffffff', '#fff3b0', '#ffd23a', '#ff9a1a', '#f2541b', '#b8231a', '#5a1a1a'],
  smoke: ['#6a6070', '#58506a', '#4a4258', '#3a3448'],
  ice: ['#ffffff', '#d8fbff', '#9ef0ff', '#5ac8f5', '#2f86d8', '#1f4f9a'],
  elec: ['#ffffff', '#f0fbff', '#b8ecff', '#7ab8ff', '#6a6aff', '#5a3ad8'],
  spark: ['#ffffff', '#fff6b0', '#ffd84a', '#ff9a2a', '#c8501a'],
  slash: ['#ffffff', '#e0fdff', '#9af3ff', '#4ad2ff', '#2a7ad8'],
  magic: ['#ffffff', '#ffe0ff', '#ff9af0', '#d86aff', '#8a3ad8', '#4a1a8a'],
  gold: ['#ffffff', '#fff4c0', '#ffe070', '#ffc030', '#d88a20', '#8a5010'],
  paper: ['#f4ead2', '#e8dcc0', '#d0c2a0', '#bfae8a'],
  brass: ['#fff0a0', '#e8c050', '#b88a30'],
  dust: ['#c8b8a8', '#a89888', '#887868', '#685858'],
  firefly: ['#3a5a20', '#9aff6a', '#d8ffa0', '#9aff6a', '#3a5a20'],
  void: ['#ffffff', '#f0d0ff', '#c060ff', '#7a20d8', '#3a0a7a', '#12021f'],
  voidIn: ['#3a0a7a', '#7a20d8', '#c060ff', '#f0d0ff', '#ffffff'],
  rock: ['#7a5a4a', '#5a3a2a', '#3a2418'],
};
const ELEM = {
  fire: ['#ffffff', '#ffd23a', '#ff9a1a', '#f2541b'],
  ice: ['#ffffff', '#d8fbff', '#5ac8f5', '#2f86d8'],
  elec: ['#ffffff', '#b8ecff', '#7ab8ff', '#6a6aff'],
  gold: ['#ffffff', '#fff4c0', '#ffc030', '#d88a20'],
};

const cam = { x: W / 2, y: H / 2, zoom: 1, tx: W / 2, ty: H / 2, tz: 1, speed: 6, shake: 0 };
let view = { sx: 0, sy: 0, sw: W, sh: H, ox: 0, oy: 0, k: SW / W };
let timeScale = 1, hitStop = 0, energy = 0, combo = 0, comboTimer = 0, kos = 0, totalDmg = 0;
let dim = 0, dimTarget = 0, dimRGB = '6,2,16', lb = 0, lbTarget = 0;
let flashA = 0, flashColor = '#ffffff', invertT = 0, speedT = 0;
let gameTime = 0, realTime = 0;
const parts = [], effects = [], dnums = [], stexts = [], banners = [], timers = [];

const player = {
  pose: 'idle', poseT: 0, poseDur: 0, elem: 'fire', lean: 0, bob: 0,
  setPose(p, d, e) { this.pose = p; this.poseT = 0; this.poseDur = d; if (e) this.elem = e; },
};

const villain = {
  name: '小人', hp: 8000, maxHp: 8000, ox: 0, oy: 0, voy: 0, squash: 1, rot: 0,
  flash: 0, hurtT: 0, shakeT: 0, state: 'alive', stateT: 0, speech: null,
  say(text, dur = 1.1) { this.speech = { text, t: 0, dur }; },
};
const HURT_LINES = ['哎哟！', '别打了！', '我错了！', '饶命啊！', '痛痛痛！', '你给我等着！', '啊啊啊！', '不敢了！', '大侠饶命！', '我的头！'];

function schedule(delay, fn) { timers.push({ t: realTime + delay, fn }); }
function runTimers() {
  for (let i = timers.length - 1; i >= 0; i--) {
    if (realTime >= timers[i].t) { const f = timers[i].fn; timers.splice(i, 1); f(); }
  }
}

function shake(a) { cam.shake = Math.max(cam.shake, a); }
function flash(a, c) { if (a >= flashA) { flashA = a; flashColor = c; } }

// 粒子
function P(o) {
  if (parts.length > 3200) return null;
  o.t = 0;
  o.life = o.life || 0.5;
  o.size = o.size || 1;
  o.vx = o.vx || 0; o.vy = o.vy || 0;
  if (o.add === undefined) o.add = true;
  parts.push(o);
  return o;
}
function burst(x, y, n, opt) {
  for (let i = 0; i < n; i++) {
    const a = opt.angle !== undefined ? opt.angle + rand(-opt.spread, opt.spread) : rand(0, Math.PI * 2);
    const sp = rand(opt.speed[0], opt.speed[1]);
    P({
      x: x + rand(-(opt.jitter || 0), opt.jitter || 0), y: y + rand(-(opt.jitter || 0), opt.jitter || 0),
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: rand(opt.life[0], opt.life[1]), ramp: opt.ramp,
      size: opt.size ? randi(opt.size[0], opt.size[1]) : 1,
      grav: opt.grav || 0, drag: opt.drag || 0, shape: opt.shape, shrink: opt.shrink,
      add: opt.add, bounce: opt.bounce, rt: opt.rt,
    });
  }
}

function vHit() { return { x: VX + villain.ox - 6, y: GROUND - 26 + villain.oy }; }
function hand() { return { x: PX + 21 + player.lean, y: GROUND - 26 + player.bob }; }

function addDN(x, y, val, crit, color, big) {
  dnums.push({
    x: x + rand(-10, 10), y: y + rand(-8, 4), vy: big ? -25 : -55 - (crit ? 15 : 0), t: 0,
    life: big ? 2 : crit ? 0.95 : 0.7, s: String(val) + (crit ? '!' : ''), crit, color, big,
  });
  if (dnums.length > 90) dnums.shift();
}

function stext(text, wx, wy, color, size, life = 0.6) {
  stexts.push({ text, x: wx, y: wy, color, size, life, t: 0, rot: rand(-0.2, 0.2) });
}

// ======================================================================
//  伤害结算
// ======================================================================
function hitVillain(dmg, o = {}) {
  const v = villain;
  if (v.state !== 'alive') return false;
  const crit = Math.random() < (o.crit !== undefined ? o.crit : 0.15);
  if (crit) dmg = Math.round(dmg * 1.8);
  v.hp -= dmg;
  if (ult.active && !o.ultFinal) v.hp = Math.max(1, v.hp);
  totalDmg += dmg;
  if (ult.active) ult.dmg += dmg;
  v.flash = 0.06;
  v.hurtT = 0.3;
  v.shakeT = 0.15;
  v.ox = Math.min(40, v.ox + (o.kx || 2));
  if (o.ky) v.voy = Math.min(v.voy, o.ky);
  const h = vHit();
  addDN(h.x, h.y - 20, dmg, crit, o.color, o.ultFinal);
  combo++;
  comboTimer = 1.6;
  comboPop = true;
  if (!ult.active) energy = Math.min(100, energy + dmg / 55);
  shake((o.shake || 1) * (crit ? 1.4 : 1));
  if (o.stop && !ult.active) hitStop = Math.max(hitStop, o.stop);
  if ((!v.speech || v.speech.t > 0.9) && Math.random() < 0.07) v.say(pick(HURT_LINES));
  if (v.hp <= 0 && (!ult.active || o.ultFinal)) killVillain();
  return true;
}

function killVillain() {
  const v = villain;
  v.hp = 0;
  v.state = 'dead';
  v.stateT = 0;
  kos++;
  sfx.ko();
  if (!ult.active) buzz(70);
  const h = vHit();
  burst(h.x, h.y, 50, { speed: [60, 260], life: [0.8, 1.6], ramp: R.paper, size: [1, 3], grav: 380, drag: 1, add: false, bounce: 0.3 });
  burst(h.x, h.y, 30, { speed: [40, 200], life: [0.3, 0.7], ramp: R.gold, drag: 3, shape: 'line' });
  banners.push({ type: 'ko', t: 0, life: 1.9, name: v.name });
  v.say('我还会回来的……', 1.6);
  schedule(ult.active ? 2.8 : 2.1, respawnVillain);
}

function respawnVillain() {
  const v = villain;
  v.hp = v.maxHp;
  v.state = 'spawn';
  v.stateT = 0;
  v.ox = 0; v.oy = 0; v.voy = 0; v.rot = 0;
  sfx.poof();
  burst(VX, GROUND - 20, 30, { speed: [20, 90], life: [0.5, 1], ramp: R.smoke, size: [3, 5], drag: 2, add: false, jitter: 8 });
  burst(VX, GROUND - 24, 20, { speed: [40, 140], life: [0.3, 0.6], ramp: R.magic, drag: 3 });
  v.say(pick(['我又回来了！', '哼，就这？', '再来啊！', '打不死我的！']), 1.4);
}

// ======================================================================
//  特效对象
// ======================================================================
class Shockwave {
  constructor(x, y, ramp, maxR, dur = 0.3, ys = 1, th = 3, rt = false) {
    Object.assign(this, { x, y, ramp, maxR, dur, ys, th, rt, t: 0 });
  }
  update(dt) { this.t += dt; if (this.t >= this.dur) this.dead = true; }
  draw() {
    const k = this.t / this.dur, r = this.maxR * easeOut(k);
    const th = Math.max(1, Math.round(this.th * (1 - k)));
    const c = this.ramp[Math.min(this.ramp.length - 1, Math.floor(k * this.ramp.length))];
    g.globalCompositeOperation = 'lighter';
    if (this.ys === 1) ring(this.x, this.y, r, th, c);
    else for (let j = 0; j < th; j++) ellipseLine(this.x, this.y, r - j, (r - j) * this.ys, c);
  }
}

class FlashDisc {
  constructor(x, y, r, dur = 0.1, cols = ['#ffd23a', '#fff3b0', '#ffffff'], rt = false) {
    Object.assign(this, { x, y, r, dur, cols, rt, t: 0 });
  }
  update(dt) { this.t += dt; if (this.t >= this.dur) this.dead = true; }
  draw() {
    const k = 1 - this.t / this.dur;
    g.globalCompositeOperation = 'lighter';
    this.cols.forEach((c, i) => circle(this.x, this.y, this.r * k * (1 - i * 0.3), c));
  }
}

// 施法时手前的小法阵
class CastCircle {
  constructor(x, y, elem) { Object.assign(this, { x, y, cols: ELEM[elem], t: 0 }); }
  update(dt) { this.t += dt; if (this.t >= 0.25) this.dead = true; }
  draw() {
    const k = this.t / 0.25, s = easeOut(Math.min(1, k * 3)) * (1 - easeIn(k) * 0.3);
    g.globalCompositeOperation = 'lighter';
    ellipseLine(this.x, this.y, 3 * s, 10 * s, this.cols[3]);
    ellipseLine(this.x, this.y, 2 * s, 7 * s, this.cols[2]);
    for (let i = 0; i < 6; i++) {
      const a = this.t * 14 + i * Math.PI / 3;
      px(this.x + Math.cos(a) * 3 * s, this.y + Math.sin(a) * 10 * s, this.cols[0]);
    }
  }
}

// --- 斩击 ---
class SlashWave {
  constructor(x, y, v) {
    Object.assign(this, { x, y, v, t: 0, r: 9, tilt: [-0.35, 0.35, 0][v] });
  }
  update(dt) {
    this.t += dt;
    this.x += 560 * dt;
    this.r = Math.min(19, this.r + 70 * dt);
    if (Math.random() < 0.9) P({ x: this.x - 6, y: this.y + rand(-this.r, this.r) * 0.8, vx: -70, vy: rand(-10, 10), life: 0.22, ramp: R.slash });
    const h = vHit();
    if (this.x >= h.x - 4) { this.dead = true; slashImpact(h.x, this.y, this.v); }
  }
  draw() {
    g.globalCompositeOperation = 'lighter';
    const cols = ['#ffffff', '#ffffff', '#9af3ff', '#4ad2ff', '#2a7ad8', '#1a4a9a'];
    const cx = this.x - this.r;
    for (let a = -1.25; a <= 1.25; a += 0.045) {
      const thick = Math.max(1, Math.round(6 * Math.cos(a) * (this.r / 19)));
      const ca = a + this.tilt;
      for (let j = 0; j < thick; j++) {
        const rr = this.r - j;
        g.fillStyle = cols[Math.min(cols.length - 1, Math.floor(j / thick * cols.length))];
        g.fillRect(Math.round(cx + Math.cos(ca) * rr), Math.round(this.y + Math.sin(ca) * rr), 1, 1);
      }
    }
  }
}

class SlashMark {
  constructor(x, y, ang, len = 54, w = 3) { Object.assign(this, { x, y, ang, len, w, t: 0 }); }
  update(dt) { this.t += dt; if (this.t >= 0.3) this.dead = true; }
  draw() {
    const grow = easeOut(Math.min(1, this.t / 0.05));
    const th = this.t < 0.05 ? this.w : this.w * (1 - (this.t - 0.05) / 0.25);
    if (th <= 0.2) return;
    const dx = Math.cos(this.ang) * this.len / 2 * grow, dy = Math.sin(this.ang) * this.len / 2 * grow;
    g.globalCompositeOperation = 'lighter';
    line(this.x - dx, this.y - dy, this.x + dx, this.y + dy, '#2a7ad8', Math.ceil(th) + 2);
    line(this.x - dx, this.y - dy, this.x + dx, this.y + dy, '#9af3ff', Math.ceil(th));
    line(this.x - dx * 0.9, this.y - dy * 0.9, this.x + dx * 0.9, this.y + dy * 0.9, '#ffffff', Math.max(1, Math.floor(th / 2)));
  }
}

let slashVariant = 0;
function castSlash() {
  player.setPose('slash', 0.16);
  sfx.slash();
  const v = slashVariant++ % 3;
  effects.push(new SlashWave(PX + 20, GROUND - 28 + [-5, 3, -1][v], v));
}
function slashImpact(x, y, v) {
  hitVillain(randi(45, 75), { kx: 4, shake: 2, stop: 0.03, color: '#c8f8ff' });
  sfx.slashHit();
  const ang = pick([-0.7, 0.7, -0.25, 0.25, -1.2]) + v * 0.1;
  effects.push(new SlashMark(x, y, ang));
  if (Math.random() < 0.35) effects.push(new SlashMark(x + 3, y + 2, ang + Math.PI / 2 * 0.8, 40, 2));
  burst(x, y, 12, { angle: ang, spread: 0.35, speed: [100, 280], life: [0.12, 0.3], ramp: R.slash, drag: 4, shape: 'line' });
  burst(x, y, 8, { angle: ang + Math.PI, spread: 0.35, speed: [100, 240], life: [0.12, 0.3], ramp: R.slash, drag: 4, shape: 'line' });
  burst(x, y, 3, { speed: [60, 160], life: [0.6, 1.2], ramp: R.paper, size: [1, 2], grav: 400, add: false, bounce: 0.3 });
}

// --- 枪击 ---
class MuzzleFlash {
  constructor(x, y) { this.x = x; this.y = y; this.t = 0; this.rays = Array.from({ length: 5 }, () => [rand(-0.8, 0.8), rand(5, 11)]); }
  update(dt) { this.t += dt; if (this.t >= 0.06) this.dead = true; }
  draw() {
    g.globalCompositeOperation = 'lighter';
    circle(this.x, this.y, 8, '#3a1a00');
    circle(this.x + 2, this.y, 4, '#ffb030');
    for (const [a, l] of this.rays) line(this.x, this.y, this.x + Math.cos(a) * l, this.y + Math.sin(a) * l, '#ffd84a', 1);
    circle(this.x + 1, this.y, 2, '#ffffff');
  }
}
class Tracer {
  constructor(x0, y0, x1, y1) { Object.assign(this, { x0, y0, x1, y1, t: 0 }); }
  update(dt) { this.t += dt; if (this.t >= 0.07) this.dead = true; }
  draw() {
    g.globalCompositeOperation = 'lighter';
    const k = this.t / 0.07;
    const sx = lerp(this.x0, this.x1, k * 0.7);
    const sy = lerp(this.y0, this.y1, k * 0.7);
    line(sx, sy, this.x1, this.y1, k < 0.5 ? '#fff6b0' : '#ff9a2a', 1);
  }
}
function castGun() {
  player.setPose('shoot', 0.1);
  sfx.gun();
  const m = { x: PX + 33 + player.lean, y: GROUND - 27 };
  effects.push(new MuzzleFlash(m.x, m.y));
  P({ x: m.x - 10, y: m.y - 2, vx: rand(-90, -40), vy: rand(-170, -110), life: 1.3, ramp: R.brass, size: 2, grav: 650, bounce: 0.45, add: false });
  const h = vHit();
  const ty = h.y + rand(-15, 15);
  effects.push(new Tracer(m.x + 3, m.y, h.x, ty));
  hitVillain(randi(16, 28), { kx: 1.5, shake: 0.6, crit: 0.12, color: '#fff2b0' });
  effects.push(new FlashDisc(h.x, ty, 5, 0.06, ['#ff9a2a', '#ffffff']));
  burst(h.x, ty, 7, { angle: Math.PI, spread: 1.0, speed: [60, 240], life: [0.1, 0.25], ramp: R.spark, grav: 300, drag: 2, shape: 'line' });
  if (Math.random() < 0.5) burst(h.x, ty, 1, { speed: [60, 140], life: [0.6, 1], ramp: R.paper, size: [1, 2], grav: 400, add: false, bounce: 0.3 });
}

// --- 火球 ---
class Fireball {
  constructor(x, y) { Object.assign(this, { x, y, y0: y, t: 0 }); }
  update(dt) {
    this.t += dt;
    this.x += 340 * dt;
    this.y = this.y0 + Math.sin(this.t * 18) * 2;
    for (let i = 0; i < 3; i++) P({ x: this.x + rand(-3, 3), y: this.y + rand(-3, 3), vx: rand(-100, -30), vy: rand(-40, 15), life: rand(0.2, 0.45), ramp: R.fire, size: randi(1, 3), shrink: true });
    if (Math.random() < 0.35) P({ x: this.x - 4, y: this.y, vx: rand(-40, -10), vy: rand(-30, -10), life: 0.7, ramp: R.smoke, size: 3, add: false });
    const h = vHit();
    if (this.x >= h.x - 4) { this.dead = true; explode(h.x, this.y); }
  }
  draw() {
    g.globalCompositeOperation = 'lighter';
    const p = Math.sin(this.t * 40) > 0 ? 1 : 0;
    circle(this.x, this.y, 8 + p, '#3a0c04');
    circle(this.x, this.y, 6, '#c8301a');
    circle(this.x + 1, this.y, 4.5, '#ff9a1a');
    circle(this.x + 1, this.y, 3, '#ffd23a');
    circle(this.x + 2, this.y, 1.5, '#ffffff');
  }
}
function castFire() {
  player.setPose('cast', 0.22, 'fire');
  sfx.fireCast();
  const hd = hand();
  effects.push(new CastCircle(hd.x + 5, hd.y, 'fire'));
  effects.push(new Fireball(hd.x + 6, hd.y));
}
function explode(x, y) {
  hitVillain(randi(90, 135), { kx: 7, shake: 4, stop: 0.05, color: '#ffc080' });
  sfx.boom();
  effects.push(new FlashDisc(x, y, 16, 0.12));
  effects.push(new Shockwave(x, y, R.fire, 30, 0.3));
  effects.push(new Shockwave(x, GROUND, R.fire, 36, 0.35, 0.25, 2));
  burst(x, y, 45, { speed: [40, 220], life: [0.25, 0.6], ramp: R.fire, size: [1, 3], drag: 3.5, shrink: true });
  burst(x, y, 14, { speed: [80, 220], life: [0.5, 1], ramp: R.spark, grav: 260, drag: 1 });
  burst(x, y, 10, { speed: [10, 50], life: [0.8, 1.4], ramp: R.smoke, size: [3, 5], grav: -40, drag: 1, add: false, jitter: 6 });
  burst(x, y, 4, { speed: [60, 160], life: [0.6, 1.2], ramp: R.paper, size: [1, 2], grav: 400, add: false, bounce: 0.3 });
  flash(0.18, '#ff8a3a');
}

// --- 落雷 ---
function boltPath(x0, y0, x1, y1, disp, depth) {
  let pts = [[x0, y0], [x1, y1]];
  for (let d = 0; d < depth; d++) {
    const np = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      np.push([(a[0] + b[0]) / 2 + rand(-disp, disp), (a[1] + b[1]) / 2 + rand(-disp, disp) * 0.3], b);
    }
    pts = np;
    disp *= 0.55;
  }
  return pts;
}
function drawPath(pts, c, s) { for (let i = 0; i < pts.length - 1; i++) line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], c, s); }

class Bolt {
  constructor(x0, y0, x1, y1, life = 0.3, disp = 24, branches = 3, scale = 1) {
    Object.assign(this, { x0, y0, x1, y1, life, disp, nb: branches, scale, t: 0, rg: 0 });
    this.regen();
  }
  regen() {
    this.pts = boltPath(this.x0, this.y0, this.x1, this.y1, this.disp, 5);
    this.br = [];
    for (let k = 0; k < this.nb; k++) {
      const p = this.pts[randi(4, this.pts.length - 6)];
      this.br.push(boltPath(p[0], p[1], p[0] + rand(-40, 40), p[1] + rand(20, 60), 12, 4));
    }
  }
  update(dt) {
    this.t += dt;
    this.rg -= dt;
    if (this.rg <= 0) { this.rg = 0.045; this.regen(); }
    if (this.t >= this.life) this.dead = true;
  }
  draw() {
    if (Math.floor(this.t * 50) % 4 === 3) return;
    const fade = 1 - this.t / this.life;
    g.globalCompositeOperation = 'lighter';
    const s = this.scale;
    drawPath(this.pts, '#2a2a90', (fade > 0.5 ? 7 : 5) * s);
    drawPath(this.pts, '#6a8aff', 3 * s);
    drawPath(this.pts, '#ffffff', Math.max(1, Math.round(1.5 * s)));
    for (const b of this.br) { drawPath(b, '#4a5ad8', 2); drawPath(b, '#b8ecff', 1); }
  }
}

class Crawl {
  constructor() { this.t = 0; this.ticks = [0.15, 0.32]; }
  update(dt) {
    this.t += dt;
    while (this.ticks.length && this.t >= this.ticks[0]) {
      this.ticks.shift();
      const h = vHit();
      hitVillain(randi(18, 30), { kx: 0.5, crit: 0.05, color: '#b8ecff' });
      sfx.zap();
      burst(h.x, h.y, 8, { speed: [60, 180], life: [0.1, 0.25], ramp: R.elec, drag: 3, shape: 'line' });
    }
    if (this.t >= 0.5) this.dead = true;
  }
  draw() {
    g.globalCompositeOperation = 'lighter';
    const vx = VX + villain.ox, top = GROUND - 46 + villain.oy;
    for (let k = 0; k < 2; k++) {
      const x0 = vx + rand(-11, 11), y0 = top + rand(0, 44);
      drawPath(boltPath(x0, y0, x0 + rand(-14, 14), y0 + rand(-14, 14), 5, 3), '#b8ecff', 1);
    }
  }
}

function castThunder() {
  player.setPose('cast', 0.25, 'elec');
  const hd = hand();
  effects.push(new CastCircle(hd.x + 5, hd.y, 'elec'));
  const h = vHit();
  const x = h.x + rand(-3, 3);
  effects.push(new Bolt(x + rand(-30, 30), -10, x, GROUND));
  hitVillain(randi(110, 160), { kx: 2, shake: 5, stop: 0.06, color: '#d8f0ff' });
  flash(0.35, '#cfe8ff');
  sfx.thunder();
  effects.push(new Crawl());
  effects.push(new FlashDisc(x, GROUND - 40, 12, 0.1, ['#6a6aff', '#b8ecff', '#ffffff']));
  effects.push(new Shockwave(x, GROUND, R.elec, 40, 0.35, 0.25, 2));
  burst(x, GROUND - 40, 20, { speed: [80, 260], life: [0.1, 0.3], ramp: R.elec, drag: 3, shape: 'line' });
  burst(x, GROUND, 18, { angle: -Math.PI / 2, spread: 1.3, speed: [80, 220], life: [0.2, 0.5], ramp: R.elec, grav: 400 });
}

// --- 冰棘 ---
class IceSpike {
  constructor(x, h, delay, launch) {
    Object.assign(this, { x, h, launch, t: -delay, w: Math.round(h * 0.3) + 4, hit: false });
  }
  update(dt) {
    this.t += dt;
    if (this.t < 0) return;
    if (!this.hit) {
      this.hit = true;
      hitVillain(randi(28, 46), { kx: 1, ky: this.launch ? -190 : 0, shake: 1.5, color: '#d8fbff' });
      sfx.ice();
      burst(this.x, GROUND - this.h, 6, { angle: -Math.PI / 2, spread: 0.7, speed: [60, 180], life: [0.2, 0.5], ramp: R.ice, grav: 300 });
      burst(this.x, GROUND, 6, { speed: [10, 40], life: [0.6, 1.1], ramp: ['#9ec8e8', '#7aa8d0', '#5a80b0'], size: [2, 4], grav: -20, add: false, jitter: 4 });
    }
    if (this.t > 0.45) {
      this.dead = true;
      sfx.shatter();
      for (let i = 0; i < 10; i++) {
        P({ x: this.x + rand(-this.w / 2, this.w / 2), y: GROUND - rand(0, this.h), vx: rand(-120, 120), vy: rand(-200, -40), life: rand(0.5, 1), ramp: R.ice, size: randi(1, 3), grav: 600, bounce: 0.3, add: false });
      }
    }
  }
  draw() {
    if (this.t < 0) return;
    const hh = Math.max(1, Math.round(this.h * easeOut(Math.min(1, this.t / 0.07))));
    const x = Math.round(this.x), base = GROUND + 2;
    g.globalCompositeOperation = 'source-over';
    for (let yy = 0; yy < hh; yy++) {
      const w = Math.max(1, Math.round(this.w * (yy + 1) / hh));
      const y = base - hh + yy, half = Math.ceil(w / 2);
      g.fillStyle = '#1f4f9a'; g.fillRect(x - half - 1, y, w + 2, 1);
      g.fillStyle = '#c8f8ff'; g.fillRect(x - half, y, half, 1);
      g.fillStyle = '#5ac8f5'; g.fillRect(x - half + half, y, w - half, 1);
    }
    line(x - 1, base - hh + 3, x - Math.round(this.w * 0.28), base - 2, '#ffffff', 1);
    g.globalCompositeOperation = 'lighter';
    px(x, base - hh, '#ffffff');
    if (this.t < 0.1) circle(x, base - hh, 3, '#5ac8f5');
  }
}
function castIce() {
  player.setPose('cast', 0.22, 'ice');
  sfx.iceCast();
  const hd = hand();
  effects.push(new CastCircle(hd.x + 5, hd.y, 'ice'));
  const cx = VX + villain.ox - 2;
  const hs = [26, 40, 54, 42, 30];
  for (let i = 0; i < 5; i++) effects.push(new IceSpike(cx + (i - 2) * 9 + rand(-2, 2), hs[i] + randi(-4, 4), 0.06 + i * 0.045, i === 2));
  burst(cx, GROUND, 14, { speed: [20, 80], life: [0.5, 1], ramp: R.ice, size: [1, 2], grav: -30, drag: 2, jitter: 20 });
}

// --- 拖鞋神功 ---
class Stars {
  constructor() { this.t = 0; }
  update(dt) { this.t += dt; if (this.t >= 1) this.dead = true; }
  draw() {
    g.globalCompositeOperation = 'lighter';
    const cx = VX + villain.ox, cy = GROUND - 52 + villain.oy;
    for (let i = 0; i < 3; i++) {
      const a = this.t * 8 + i * Math.PI * 2 / 3;
      const x = cx + Math.cos(a) * 11, y = cy + Math.sin(a) * 3;
      px(x, y, '#ffe070'); px(x - 1, y, '#ffc030'); px(x + 1, y, '#ffc030'); px(x, y - 1, '#ffc030'); px(x, y + 1, '#ffc030');
    }
  }
}
class Slipper {
  constructor() {
    this.t = 0; this.phase = 0;
    this.x = VX + villain.ox + rand(-6, 6);
    this.y = GROUND - 160; this.rot = -1.2;
  }
  update(dt) {
    this.t += dt;
    const target = GROUND - 50 + villain.oy;
    if (this.phase === 0) {
      const k = Math.min(1, this.t / 0.13);
      this.y = lerp(GROUND - 160, target, easeIn(k));
      this.rot = lerp(-1.4, 0, k);
      if (Math.random() < 0.8) P({ x: this.x + rand(-14, 14), y: this.y - 6, vy: -60, life: 0.15, ramp: R.magic });
      if (k >= 1) {
        this.phase = 1; this.t = 0;
        const hit = hitVillain(randi(60, 100), { kx: 2, shake: 3, stop: 0.07, color: '#ffc0d0' });
        if (hit) villain.squash = 0.55;
        sfx.slap();
        stext(pick(['啪！', '啪！！', '打你个小人头！', '啪叽！']), this.x, this.y - 12, '#ffe070', 44);
        effects.push(new Stars());
        effects.push(new Shockwave(this.x, this.y + 4, R.gold, 22, 0.2));
        burst(this.x, GROUND, 12, { angle: -Math.PI / 2, spread: 1.4, speed: [40, 120], life: [0.4, 0.8], ramp: R.dust, size: [2, 3], grav: 300, add: false });
      }
    } else if (this.phase === 1) {
      if (this.t > 0.12) { this.phase = 2; this.t = 0; this.vx = rand(80, 140); this.vy = -220; }
    } else {
      this.vy += 900 * dt;
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.rot += 12 * dt;
      if (this.t > 0.9) this.dead = true;
    }
  }
  draw() {
    g.globalCompositeOperation = 'source-over';
    g.save();
    g.translate(Math.round(this.x), Math.round(this.y));
    g.rotate(this.rot);
    g.drawImage(spr.slipper, -16, -6, 32, 12);
    g.restore();
  }
}
function castSlipper() {
  player.setPose('cast', 0.18, 'gold');
  sfx.whoosh();
  effects.push(new Slipper());
}

// --- 奥义一：千雷万剑 ---
class UltCircle {
  constructor(cg, cs, pr) {
    this.t = 0; this.fadeT = -1; this.rt = true; this.layer = 'ground';
    this.cg = cg || ['#ffd24a', '#4ad2ff', '#ffffff'];
    this.cs = cs || ['#4ad2ff', '#ffd24a', '#ffffff'];
    this.pr = pr || R.gold;
  }
  update(dt) {
    this.t += dt;
    if (ult.final && this.fadeT < 0) this.fadeT = 0;
    if (this.fadeT >= 0) { this.fadeT += dt; if (this.fadeT > 0.5) this.dead = true; }
    if (Math.random() < 0.7) P({ rt: true, x: VX + rand(-60, 60), y: GROUND - rand(0, 4), vy: -rand(40, 110), life: rand(0.5, 1), ramp: this.pr });
  }
  draw() {
    const k = easeOut(Math.min(1, this.t / 0.35));
    g.globalAlpha = this.fadeT >= 0 ? Math.max(0, 1 - this.fadeT / 0.5) : 1;
    g.globalCompositeOperation = 'lighter';
    this.drawC(VX, GROUND, 66 * k, this.t * 1.4, this.cg);
    this.drawC(VX, GROUND - 150, 52 * k, -this.t * 1.9, this.cs);
    g.globalAlpha = 1;
  }
  drawC(cx, cy, Rr, rot, cols) {
    const ys = 0.24;
    ellipseLine(cx, cy, Rr, Rr * ys, cols[0]);
    ellipseLine(cx, cy, Rr - 1, (Rr - 1) * ys, cols[0]);
    ellipseLine(cx, cy, Rr * 0.82, Rr * 0.82 * ys, cols[1]);
    ellipseLine(cx, cy, Rr * 0.45, Rr * 0.45 * ys, cols[1]);
    const r = Rr * 0.82;
    for (let tri = 0; tri < 2; tri++) {
      for (let j = 0; j < 3; j++) {
        const a0 = rot + tri * Math.PI / 3 + j * Math.PI * 2 / 3, a1 = a0 + Math.PI * 2 / 3;
        line(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r * ys, cx + Math.cos(a1) * r, cy + Math.sin(a1) * r * ys, cols[0], 1);
      }
    }
    for (let j = 0; j < 12; j++) {
      const a = -rot * 0.7 + j * Math.PI / 6;
      rect(cx + Math.cos(a) * Rr * 0.91 - 1, cy + Math.sin(a) * Rr * 0.91 * ys - 1, 2 + (j % 2), 2, cols[2]);
    }
  }
}

class RainSword {
  constructor() {
    this.x = VX + rand(-42, 42);
    this.y = GROUND - 150 + rand(-4, 4);
    const tx = VX + villain.ox + rand(-9, 9);
    this.ty = GROUND - rand(10, 46);
    const dx = tx - this.x, dy = this.ty - this.y, d = Math.hypot(dx, dy);
    this.vx = dx / d * 720; this.vy = dy / d * 720;
    this.t = 0;
  }
  update(dt) {
    this.t += dt;
    this.x += this.vx * dt; this.y += this.vy * dt;
    if (Math.random() < 0.6) P({ x: this.x, y: this.y, vx: -this.vx * 0.05, vy: -this.vy * 0.05, life: 0.25, ramp: R.slash });
    if (this.y >= this.ty) {
      this.dead = true;
      hitVillain(randi(70, 120), { kx: 1.2, shake: 1.2, crit: 0.25, color: '#c8f8ff' });
      sfx.clang();
      const ang = Math.atan2(this.vy, this.vx);
      effects.push(new SlashMark(this.x, this.y, ang + Math.PI / 2 + rand(-0.4, 0.4), 22, 2));
      burst(this.x, this.y, 8, { speed: [60, 220], life: [0.1, 0.35], ramp: R.slash, drag: 3, shape: 'line' });
      burst(this.x, this.y, 3, { speed: [40, 120], life: [0.6, 1.2], ramp: R.gold, grav: 200 });
    }
  }
  draw() {
    const d = Math.hypot(this.vx, this.vy), ux = this.vx / d, uy = this.vy / d;
    g.globalCompositeOperation = 'lighter';
    line(this.x - ux * 30, this.y - uy * 30, this.x - ux * 12, this.y - uy * 12, '#1a4a9a', 1);
    g.globalCompositeOperation = 'source-over';
    line(this.x, this.y, this.x - ux * 12, this.y - uy * 12, '#bfefff', 2);
    line(this.x, this.y, this.x - ux * 11, this.y - uy * 11, '#ffffff', 1);
    const gx = this.x - ux * 12, gy = this.y - uy * 12;
    line(gx - uy * 3, gy + ux * 3, gx + uy * 3, gy - ux * 3, '#ffd24a', 1);
    line(gx, gy, gx - ux * 4, gy - uy * 4, '#6a3a1a', 1);
  }
}

class GiantSword {
  constructor() {
    this.x = VX + villain.ox;
    this.tip = GROUND - 175;
    this.vy = 240;
    this.stuck = false;
    this.t = 0;
  }
  update(dt) {
    this.t += dt;
    if (!this.stuck) {
      this.vy += 2200 * dt;
      this.tip += this.vy * dt;
      for (let i = 0; i < 3; i++) P({ x: this.x + rand(-5, 5), y: this.tip - rand(20, 110), vx: rand(-20, 20), vy: -rand(20, 60), life: rand(0.3, 0.6), ramp: R.gold });
      if (this.tip >= GROUND - 30) { this.tip = GROUND - 30; this.stuck = true; ultImpact(this.x, this.tip); }
    } else if (ult.final) {
      this.dead = true;
      burst(this.x, this.tip - 60, 60, { speed: [60, 300], life: [0.4, 1.1], ramp: R.gold, size: [1, 2], drag: 2, jitter: 30 });
    }
  }
  draw() {
    const s = 3, w = spr.gsword.width * s, h = spr.gsword.height * s;
    const x = Math.round(this.x - w / 2), y = Math.round(this.tip - h);
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.55 + 0.25 * Math.sin(realTime * 40);
    g.drawImage(spr.gswordGlow, x - 3, y - 3, w + 6, h + 6);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.drawImage(spr.gsword, x, y, w, h);
  }
}

class LightPillar {
  constructor(x) { this.x = x; this.t = 0; this.ft = -1; this.rt = true; }
  update(dt) {
    this.t += dt;
    if (ult.final && this.ft < 0) this.ft = 0;
    if (this.ft >= 0) { this.ft += dt; if (this.ft > 0.9) this.dead = true; }
  }
  draw() {
    let w;
    if (this.ft < 0) w = 9 * easeOut(Math.min(1, this.t / 0.12)) + Math.sin(this.t * 60);
    else w = 64 * (1 - easeIn(Math.min(1, this.ft / 0.9)));
    if (w <= 0.5) return;
    g.globalCompositeOperation = 'lighter';
    const layers = [[1, '#8a5010'], [0.7, '#ffc030'], [0.42, '#fff4c0'], [0.16, '#ffffff']];
    for (let y = 0; y < GROUND + 4; y += 2) {
      const j = rand(-1.5, 1.5);
      for (const [f, c] of layers) {
        const ww = Math.max(1, Math.round(w * f + j));
        g.fillStyle = c;
        g.fillRect(Math.round(this.x - ww / 2), y, ww, 2);
      }
    }
    ellipseFill(this.x, GROUND, Math.round(w * 1.4), Math.max(2, Math.round(w * 0.25)), '#5a3008');
  }
}

// --- 奥义二：陨星天降 ---
class Meteor {
  constructor(big) {
    this.big = big; this.t = 0; this.stuck = false;
    this.rt = big;
    this.r = big ? 20 : rand(2.5, 4.5);
    this.tx = big ? VX + villain.ox : VX + villain.ox + rand(-55, 55);
    this.ty = big ? GROUND - 26 : GROUND - 2;
    this.x = this.tx + (big ? 170 : rand(70, 170));
    this.y = big ? -70 : rand(-50, -10);
    const dx = this.tx - this.x, dy = this.ty - this.y, d = Math.hypot(dx, dy);
    this.ux = dx / d; this.uy = dy / d;
    this.sp = big ? 200 : rand(480, 620);
    this.cracks = big ? Array.from({ length: 8 }, () => {
      const a = rand(0, Math.PI * 2), r0 = rand(2, 8), r1 = rand(10, 18), b = a + rand(-0.4, 0.4);
      return [Math.cos(a) * r0, Math.sin(a) * r0, Math.cos(b) * r1, Math.sin(b) * r1];
    }) : null;
  }
  update(dt) {
    this.t += dt;
    if (this.stuck) { if (ult.final) this.dead = true; return; }
    if (this.big) this.sp += 500 * dt;
    this.x += this.ux * this.sp * dt;
    this.y += this.uy * this.sp * dt;
    const n = this.big ? 6 : 2;
    for (let i = 0; i < n; i++) {
      P({ x: this.x + rand(-this.r, this.r) * 0.6, y: this.y + rand(-this.r, this.r) * 0.6, vx: -this.ux * rand(20, 80) + rand(-15, 15), vy: -this.uy * rand(20, 80) + rand(-15, 15), life: rand(0.25, this.big ? 0.8 : 0.4), ramp: R.fire, size: randi(1, this.big ? 4 : 2), shrink: true });
    }
    if (Math.random() < (this.big ? 0.8 : 0.3)) {
      P({ x: this.x - this.ux * this.r, y: this.y - this.uy * this.r, vx: rand(-10, 10), vy: rand(-20, 0), life: rand(0.8, 1.4), ramp: R.smoke, size: randi(3, this.big ? 7 : 4), add: false });
    }
    if (this.y >= this.ty) {
      if (this.big) { this.y = this.ty; this.stuck = true; ultImpact(this.x, this.y); }
      else { this.dead = true; this.land(); }
    }
  }
  land() {
    const x = this.x, y = GROUND - 2;
    sfx.boom();
    effects.push(new FlashDisc(x, y, 10, 0.1));
    effects.push(new Shockwave(x, GROUND, R.fire, 26, 0.3, 0.25, 2));
    burst(x, y, 20, { angle: -Math.PI / 2, spread: 1.3, speed: [60, 200], life: [0.25, 0.6], ramp: R.fire, size: [1, 3], drag: 2, shrink: true });
    burst(x, y, 6, { angle: -Math.PI / 2, spread: 1, speed: [80, 180], life: [0.6, 1], ramp: R.rock, size: [1, 2], grav: 500, add: false, bounce: 0.3 });
    shake(1.5);
    if (Math.abs(x - (VX + villain.ox)) < 24) hitVillain(randi(70, 120), { kx: 3, shake: 1.5, crit: 0.2, color: '#ffc080' });
  }
  draw() {
    const r = this.r, x = this.x, y = this.y;
    g.globalCompositeOperation = 'lighter';
    circle(x, y, r * 1.9, '#2a0802');
    circle(x, y, r * 1.4, '#7a1a06');
    g.globalCompositeOperation = 'source-over';
    circle(x, y, r, '#3a1a14');
    circle(x - r * 0.25, y - r * 0.25, r * 0.7, '#5a2c1c');
    if (this.cracks) for (const c of this.cracks) line(x + c[0], y + c[1], x + c[2], y + c[3], '#ff8a1a', 1);
    g.globalCompositeOperation = 'lighter';
    circle(x + this.ux * r * 0.45, y + this.uy * r * 0.45, r * 0.6, '#ff5a10');
    circle(x + this.ux * r * 0.55, y + this.uy * r * 0.55, r * 0.3, '#ffe070');
    if (this.stuck) circle(x, y, r * (1.2 + 0.1 * Math.sin(realTime * 30)), '#3a1004');
  }
}

// --- 奥义三：虚空湮灭 ---
class BlackHole {
  constructor() {
    this.x = VX; this.y = GROUND - 34;
    this.t = 0; this.rt = true; this.r = 0; this.col = -1; this.fired = false; this.tick = 0.2;
  }
  update(dt) {
    this.t += dt;
    if (ult.final) { this.dead = true; return; }
    if (this.col < 0) {
      this.r = 15 * easeOut(Math.min(1, this.t / 0.5));
      if (ult.collapse) this.col = 0;
    } else {
      this.col += dt;
      this.r = 15 * (1 - easeIn(Math.min(1, this.col / 0.25)));
      if (this.col >= 0.25 && !this.fired) { this.fired = true; ultImpact(this.x, this.y); }
    }
    if (this.fired) return;
    // 吸入的能量流
    for (let i = 0; i < 6; i++) {
      const a = rand(0, Math.PI * 2), d = rand(50, 120), sp = rand(130, 230);
      P({ rt: true, x: this.x + Math.cos(a) * d, y: this.y + Math.sin(a) * d * 0.6,
        vx: (-Math.cos(a) - Math.sin(a) * 0.35) * sp, vy: (-Math.sin(a) + Math.cos(a) * 0.35) * sp * 0.6,
        life: d / sp * 0.9, ramp: R.voidIn });
    }
    // 被吸起的碎石纸屑
    if (Math.random() < 0.5) {
      const sx = this.x + rand(-90, 90), d = Math.hypot(sx - this.x, GROUND - this.y), sp = rand(90, 160);
      P({ rt: true, x: sx, y: GROUND, vx: (this.x - sx) / d * sp, vy: (this.y - GROUND) / d * sp, life: d / sp * 0.95, ramp: Math.random() < 0.5 ? R.rock : R.paper, size: randi(1, 2), add: false });
    }
    this.tick -= dt;
    if (this.tick <= 0 && this.t > 0.2) {
      this.tick = 0.065;
      hitVillain(randi(80, 130), { kx: 0.5, shake: 0.8, crit: 0.2, color: '#e0b0ff' });
      sfx.zap();
    }
  }
  drawDisk(front) {
    const r = this.r, cols = ['#ff6aff', '#c060ff', '#7a20d8'];
    for (let i = 0; i < 90; i++) {
      const a = i / 90 * Math.PI * 2 + this.t * (3 + (i % 3));
      if ((Math.sin(a) > 0) !== front) continue;
      const rr = r * (1.5 + (i % 5) * 0.38);
      g.fillStyle = cols[i % 3];
      g.fillRect(Math.round(this.x + Math.cos(a) * rr), Math.round(this.y + Math.sin(a) * rr * 0.32), 2, 1);
    }
  }
  draw() {
    const r = this.r;
    if (r <= 0.3) return;
    g.globalCompositeOperation = 'lighter';
    circle(this.x, this.y, r * 2.6, '#12021f');
    circle(this.x, this.y, r * 1.7, '#3a0a6a');
    ellipseLine(this.x, this.y, r * 1.25, r * 1.7, '#c060ff');
    this.drawDisk(false);
    g.globalCompositeOperation = 'source-over';
    circle(this.x, this.y, r, '#000000');
    g.globalCompositeOperation = 'lighter';
    ring(this.x, this.y, r + 1, 1, Math.sin(realTime * 40) > 0 ? '#f0d0ff' : '#c060ff');
    this.drawDisk(true);
  }
}

class StarFlare {
  constructor(x, y) { this.x = x; this.y = y; this.t = 0; this.rt = true; }
  update(dt) { this.t += dt; if (ult.final) this.dead = true; }
  draw() {
    const L = Math.min(200, 20 + this.t * 500), p = 1 + Math.sin(realTime * 50) * 0.5, x = this.x, y = this.y;
    g.globalCompositeOperation = 'lighter';
    circle(x, y, 8 + p * 2, '#3a0a6a');
    circle(x, y, 4 + p, '#c060ff');
    circle(x, y, 2, '#ffffff');
    line(x - L, y, x + L, y, '#7a20d8', 3);
    line(x - L * 0.8, y, x + L * 0.8, y, '#ffffff', 1);
    line(x, y - L * 0.5, x, y + L * 0.5, '#7a20d8', 3);
    line(x, y - L * 0.4, x, y + L * 0.4, '#ffffff', 1);
    const d = L * 0.18;
    line(x - d, y - d, x + d, y + d, '#f0d0ff', 1);
    line(x - d, y + d, x + d, y - d, '#f0d0ff', 1);
  }
}

// ======================================================================
//  奥义流程（实时时间驱动的演出脚本）
// ======================================================================
const ult = { active: false, id: 'thunder', t: 0, cutinT: -1, swordsLeft: 0, swordTimer: 0, meteorsLeft: 0, meteorTimer: 0, impacted: false, final: false, collapse: false, dmg: 0 };

// 千雷万剑
function beginThunder() {
  effects.push(new UltCircle());
  sfx.charge();
  schedule(0.2, () => { ult.swordsLeft = 42; });
  schedule(1.5, () => { effects.push(new GiantSword()); sfx.whooshBig(); });
}
function impactThunder(x, y) {
  effects.push(new LightPillar(x));
  burst(x, y, 40, { speed: [100, 400], life: [0.5, 1.2], ramp: R.gold, drag: 1, shape: 'line' });
  burst(x, y, 30, { speed: [60, 300], life: [0.5, 1.2], ramp: R.slash, drag: 1, shape: 'line' });
}
function finalThunder(hx, hy) {
  for (let i = 0; i < 4; i++) {
    effects.push(new Shockwave(hx, hy, R.gold, 60 + i * 40, 0.4 + i * 0.12, 1, 4));
    effects.push(new Shockwave(hx, GROUND, R.fire, 90 + i * 50, 0.5 + i * 0.12, 0.22, 3));
  }
  effects.push(new FlashDisc(hx, hy, 60, 0.25, ['#ffc030', '#fff4c0', '#ffffff']));
  burst(hx, hy, 140, { speed: [60, 420], life: [0.5, 1.4], ramp: R.fire, size: [1, 4], drag: 2, shrink: true });
  burst(hx, hy, 80, { speed: [100, 480], life: [0.4, 1.0], ramp: R.gold, drag: 1.5, shape: 'line' });
  burst(hx, hy, 40, { speed: [20, 90], life: [1, 2], ramp: R.smoke, size: [4, 7], grav: -30, drag: 1, add: false, jitter: 20 });
  burst(hx, GROUND, 40, { angle: -Math.PI / 2, spread: 1.2, speed: [100, 300], life: [0.8, 1.5], ramp: R.dust, size: [2, 3], grav: 500, add: false, bounce: 0.2 });
}

// 陨星天降
function beginMeteor() {
  effects.push(new UltCircle(['#ff7a1a', '#ffd24a', '#ffffff'], ['#ff4a1a', '#ffd24a', '#fff4c0'], R.fire));
  sfx.rumble();
  schedule(0.2, () => { ult.meteorsLeft = 26; });
  schedule(1.35, () => { effects.push(new Meteor(true)); sfx.whooshBig(); });
}
function impactMeteor(x, y) {
  effects.push(new FlashDisc(x, y, 40, 0.5, ['#ff5a10', '#ffd23a', '#ffffff'], true));
  effects.push(new Shockwave(x, GROUND, R.fire, 120, 0.7, 0.22, 3, true));
  burst(x, y, 50, { speed: [100, 420], life: [0.5, 1.2], ramp: R.fire, drag: 1, shape: 'line' });
  burst(x, GROUND, 20, { angle: -Math.PI / 2, spread: 1.3, speed: [100, 300], life: [0.6, 1.2], ramp: R.rock, size: [1, 3], grav: 500, add: false, bounce: 0.3 });
}
function finalMeteor(hx, hy) {
  for (let i = 0; i < 5; i++) {
    effects.push(new Shockwave(hx, hy, R.fire, 60 + i * 45, 0.4 + i * 0.12, 1, 4));
    effects.push(new Shockwave(hx, GROUND, R.fire, 110 + i * 55, 0.5 + i * 0.12, 0.22, 3));
  }
  effects.push(new FlashDisc(hx, hy, 70, 0.3, ['#ff5a10', '#ffd23a', '#ffffff']));
  burst(hx, hy, 220, { speed: [60, 460], life: [0.5, 1.5], ramp: R.fire, size: [1, 5], drag: 2, shrink: true });
  burst(hx, hy, 60, { speed: [100, 480], life: [0.4, 1.0], ramp: R.spark, drag: 1.5, shape: 'line' });
  burst(hx, GROUND, 35, { angle: -Math.PI / 2, spread: 1.3, speed: [120, 340], life: [1, 1.8], ramp: R.rock, size: [2, 3], grav: 520, add: false, bounce: 0.25 });
  // 蘑菇云
  for (let i = 0; i < 60; i++) {
    P({ x: hx + rand(-14, 14), y: GROUND - rand(0, 20), vx: rand(-15, 15), vy: -rand(90, 240), life: rand(1.4, 2.4), ramp: R.smoke, size: randi(4, 8), drag: 1.3, add: false });
  }
  for (let i = 0; i < 40; i++) {
    P({ x: hx + rand(-10, 10), y: GROUND - rand(60, 110), vx: rand(-90, 90), vy: -rand(10, 40), life: rand(1.2, 2), ramp: R.smoke, size: randi(5, 8), drag: 1.2, add: false });
  }
  burst(hx, GROUND - 40, 50, { speed: [10, 80], life: [0.8, 1.6], ramp: R.fire, size: [2, 4], grav: -60, drag: 1, shrink: true, jitter: 20 });
}

// 虚空湮灭
function beginVoid() {
  effects.push(new BlackHole());
  sfx.drone();
  schedule(1.65, () => { ult.collapse = true; sfx.collapse(); });
}
function impactVoid(x, y) {
  effects.push(new StarFlare(x, y));
  effects.push(new Shockwave(x, y, R.void, 90, 0.6, 1, 3, true));
}
function finalVoid(hx, hy) {
  for (let i = 0; i < 5; i++) effects.push(new Shockwave(hx, hy, R.void, 50 + i * 45, 0.4 + i * 0.12, 1, 4));
  effects.push(new Shockwave(hx, GROUND, R.void, 220, 0.8, 0.22, 3));
  effects.push(new FlashDisc(hx, hy, 70, 0.3, ['#7a20d8', '#f0d0ff', '#ffffff']));
  burst(hx, hy, 200, { speed: [60, 460], life: [0.5, 1.5], ramp: R.void, size: [1, 3], drag: 1.8, shrink: true });
  burst(hx, hy, 90, { speed: [120, 520], life: [0.4, 1.0], ramp: R.magic, drag: 1.5, shape: 'line' });
  burst(hx, hy, 60, { speed: [10, 70], life: [1.5, 2.6], ramp: R.voidIn, drag: 0.5, jitter: 40 });
}

const ULTS = {
  thunder: {
    name: '千雷万剑', band: ['#1a0638', '#5a14a8', '#0e4ab8'], accent: '#ffd24a', text: ['#fffbe0', '#ffd24a', '#ff8a1a'],
    stroke: '#2a0a00', eye: '#7ff6ff', glow: '#b07aff', aura: [R.magic, R.gold], dim: '6,2,16', flash: '#fff4c0',
    lines: ['不……不要啊——！', '这是什么剑！？'],
    begin: beginThunder, onImpact: impactThunder, onFinal: finalThunder,
  },
  meteor: {
    name: '陨星天降', band: ['#2a0404', '#a8200c', '#ff7a1a'], accent: '#ffe070', text: ['#ffffff', '#ffd060', '#ff4a1a'],
    stroke: '#2a0400', eye: '#ffd060', glow: '#ff7a2a', aura: [R.fire, R.spark], dim: '34,6,0', flash: '#ffb060',
    lines: ['天……天塌了！？', '好烫好烫好烫！'],
    begin: beginMeteor, onImpact: impactMeteor, onFinal: finalMeteor,
  },
  void: {
    name: '虚空湮灭', band: ['#05010f', '#3a0a6a', '#9a2ae8'], accent: '#e0a0ff', text: ['#ffffff', '#e0b0ff', '#9a3aff'],
    stroke: '#12021f', eye: '#ff6aff', glow: '#9a3aff', aura: [R.void, R.magic], dim: '10,0,20', flash: '#f0d0ff',
    lines: ['要被吸进去了——！', '救命啊——！'],
    begin: beginVoid, onImpact: impactVoid, onFinal: finalVoid,
  },
};
Object.values(ULTS).forEach(U => { U.glowSpr = tint(spr.player, U.glow); });

function startUlt(id) {
  const U = ULTS[id];
  if (!U || ult.active || energy < 100 || villain.state !== 'alive') return false;
  energy = 0;
  Object.assign(ult, { active: true, id, t: 0, cutinT: -1, swordsLeft: 0, swordTimer: 0, meteorsLeft: 0, meteorTimer: 0, impacted: false, final: false, collapse: false, dmg: 0 });
  timeScale = 0.06;
  Object.assign(cam, { tx: PX + 6, ty: GROUND - 30, tz: 2.6, speed: 7 });
  lbTarget = 1; dimTarget = 0.72; dimRGB = U.dim;
  document.body.classList.add('cinema');
  sfx.riser();

  schedule(0.4, () => { ult.cutinT = 0; sfx.stamp(); shake(3); });
  schedule(1.8, () => {
    ult.cutinT = -1;
    Object.assign(cam, { tx: VX, ty: GROUND - 62, tz: 1.85, speed: 5 });
    timeScale = 0.45;
    villain.say(pick(U.lines), 1.6);
    U.begin();
  });
  schedule(7.5, () => { if (ult.active && !ult.impacted) ultImpact(VX, GROUND - 30); });
  return true;
}

function ultImpact(x, y) {
  if (ult.impacted) return;
  const U = ULTS[ult.id];
  ult.impacted = true;
  timeScale = 0.03;
  flash(1, '#ffffff');
  invertT = 0.12;
  speedT = 0.8;
  Object.assign(cam, { tx: VX, ty: GROUND - 45, tz: 2.9, speed: 12 });
  shake(4);
  sfx.impact();
  buzz(60);
  hitVillain(randi(300, 500), { kx: 4, crit: 0, color: '#fff4c0' });
  U.onImpact(x, y);

  schedule(0.8, () => {
    ult.final = true;
    buzz([90, 40, 180]);
    timeScale = 1;
    shake(14);
    flash(0.85, U.flash);
    sfx.boomBig();
    const fin = Math.max(villain.hp + randi(800, 1600), randi(3200, 4200));
    hitVillain(fin, { crit: 0, kx: 40, ky: -260, shake: 14, ultFinal: true, color: '#ffe070' });
    U.onFinal(VX, GROUND - 30);
    Object.assign(cam, { tx: W / 2, ty: H / 2, tz: 1, speed: 4 });
    lbTarget = 0; dimTarget = 0;
    schedule(0.3, () => banners.push({ type: 'ult', t: 0, life: 2.3, val: ult.dmg }));
    schedule(1.4, () => { ult.active = false; document.body.classList.remove('cinema'); });
  });
}

function updateUlt(rdt) {
  ult.t += rdt;
  if (ult.cutinT >= 0) ult.cutinT += rdt;
  if (ult.swordsLeft > 0) {
    ult.swordTimer -= rdt;
    while (ult.swordTimer <= 0 && ult.swordsLeft > 0) {
      ult.swordTimer += 0.028;
      ult.swordsLeft--;
      effects.push(new RainSword());
    }
  }
  if (ult.meteorsLeft > 0) {
    ult.meteorTimer -= rdt;
    while (ult.meteorTimer <= 0 && ult.meteorsLeft > 0) {
      ult.meteorTimer += 0.045;
      ult.meteorsLeft--;
      effects.push(new Meteor(false));
    }
  }
  // 蓄力阶段：能量向玩家汇聚
  if (ult.t < 1.8) {
    const aura = ULTS[ult.id].aura;
    for (let i = 0; i < 4; i++) {
      const a = rand(0, Math.PI * 2), r = rand(30, 55);
      const cx = PX, cy = GROUND - 26;
      P({ rt: true, x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, vx: -Math.cos(a) * r * 2.5, vy: -Math.sin(a) * r * 2.5, life: 0.4, ramp: aura[i % 2] });
    }
  }
}

// ======================================================================
//  技能表 & 输入
// ======================================================================
const SKILLS = {
  slash: { interval: 110, fn: castSlash },
  gun: { interval: 70, fn: castGun },
  fire: { interval: 170, fn: castFire },
  thunder: { interval: 200, fn: castThunder },
  ice: { interval: 220, fn: castIce },
  slipper: { interval: 230, fn: castSlipper },
};
const KEYMAP = {
  KeyJ: 'slash', KeyK: 'gun', KeyL: 'fire', KeyU: 'thunder', KeyI: 'ice', KeyO: 'slipper',
  Space: 'ult-thunder', KeyQ: 'ult-meteor', KeyE: 'ult-void',
};
const held = new Set();
const lastCast = {};
const nameInput = $('nameInput');
const buttons = {};
document.querySelectorAll('.skill').forEach(b => { buttons[b.dataset.skill] = b; });

function pressFx(s) {
  const b = buttons[s];
  if (!b) return;
  b.classList.remove('hit');
  void b.offsetWidth;
  b.classList.add('hit');
}

function tryCast(s, fresh) {
  if (ult.active || !SKILLS[s]) return;
  const now = performance.now(), iv = SKILLS[s].interval;
  if (now - (lastCast[s] || 0) < (fresh ? iv * 0.55 : iv)) return;
  lastCast[s] = now;
  SKILLS[s].fn();
  pressFx(s);
}

function toggleMute() {
  Snd.setMuted(!Snd.muted);
  $('muteBtn').textContent = Snd.muted ? '🔇' : '🔊';
}

window.addEventListener('keydown', e => {
  if (document.activeElement === nameInput) {
    if (e.key === 'Enter' || e.key === 'Escape') nameInput.blur();
    return;
  }
  if (e.code === 'KeyM') { toggleMute(); return; }
  const s = KEYMAP[e.code];
  if (!s) return;
  e.preventDefault();
  Snd.init();
  if (s.startsWith('ult-')) { if (!e.repeat) { startUlt(s.slice(4)); pressFx(s); } return; }
  if (!held.has(s)) { held.add(s); tryCast(s, true); }
});
window.addEventListener('keyup', e => { const s = KEYMAP[e.code]; if (s) held.delete(s); });
window.addEventListener('blur', () => held.clear());

Object.entries(buttons).forEach(([s, b]) => {
  b.addEventListener('pointerdown', e => {
    e.preventDefault();
    Snd.init();
    if (s.startsWith('ult-')) { if (startUlt(s.slice(4))) buzz(30); pressFx(s); return; }
    held.add(s);
    b.classList.add('held');
    tryCast(s, true);
  });
  const up = () => { held.delete(s); b.classList.remove('held'); };
  b.addEventListener('pointerup', up);
  b.addEventListener('pointerleave', up);
  b.addEventListener('pointercancel', up);
  b.addEventListener('lostpointercapture', up);
  b.addEventListener('keydown', e => e.preventDefault());
});
window.addEventListener('blur', () => Object.values(buttons).forEach(b => b.classList.remove('held')));
$('muteBtn').addEventListener('click', () => { Snd.init(); toggleMute(); $('muteBtn').blur(); });

// ---------- 移动端 ----------
const isTouch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');
// 屏蔽长按菜单、双指缩放、双击缩放
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('dblclick', e => e.preventDefault());
document.getElementById('app').addEventListener('touchmove', e => { if (e.target !== nameInput) e.preventDefault(); }, { passive: false });
// iOS 需要在 touchend 里解锁音频
['touchend', 'click'].forEach(ev => window.addEventListener(ev, () => Snd.init(), { passive: true }));
function buzz(p) {
  if (!isTouch || Snd.muted || !navigator.vibrate) return;
  try { navigator.vibrate(p); } catch (err) { /* 忽略 */ }
}

// 小屏幕上放大画布内文字（名字牌、台词气泡、拟声字）
let uiScale = 1;
function calcUiScale() { uiScale = clamp(850 / (screenCv.clientWidth || SW), 1, 2.4); }
calcUiScale();
window.addEventListener('resize', calcUiScale);
window.addEventListener('orientationchange', () => setTimeout(calcUiScale, 200));

function setName(n) {
  villain.name = n.trim() || '小人';
  $('vName').textContent = villain.name;
  try { localStorage.setItem('dxr-name', villain.name); } catch (err) { /* 忽略 */ }
}
try { const saved = localStorage.getItem('dxr-name'); if (saved) nameInput.value = saved; } catch (err) { /* 忽略 */ }
setName(nameInput.value);
nameInput.addEventListener('input', () => setName(nameInput.value));

// ---------- 上传照片替换小人 ----------
const photoInput = $('photoInput'), photoClear = $('photoClear');
function photoSwapFx() {
  sfx.poof();
  burst(VX, GROUND - 26, 30, { speed: [20, 90], life: [0.5, 1], ramp: R.smoke, size: [3, 5], drag: 2, add: false, jitter: 10 });
  burst(VX, GROUND - 26, 20, { speed: [40, 140], life: [0.3, 0.6], ramp: R.magic, drag: 3 });
}
function applyPhoto(photo, announce) {
  usePhotoLook(photo);
  photoClear.hidden = false;
  if (announce) {
    photoSwapFx();
    villain.say(pick(['你……你怎么有我照片！', '别拿我照片打啊！', '这谁拍的！？']), 1.6);
  }
}
function clearPhoto() {
  useDefaultLook();
  photoClear.hidden = true;
  try { localStorage.removeItem('dxr-photo'); } catch (err) { /* 忽略 */ }
  photoSwapFx();
  villain.say('我又变回纸人了！', 1.4);
}
photoInput.addEventListener('change', () => {
  const file = photoInput.files && photoInput.files[0];
  photoInput.value = '';
  if (!file) return;
  Snd.init();
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    const photo = pixelatePhoto(img);
    applyPhoto(photo, true);
    try { localStorage.setItem('dxr-photo', photo.toDataURL('image/png')); } catch (err) { /* 存储满了就不保存 */ }
  };
  img.onerror = () => { URL.revokeObjectURL(url); villain.say('这照片打不开……', 1.4); };
  img.src = url;
});
photoClear.addEventListener('click', () => { clearPhoto(); photoClear.blur(); });
try {
  const saved = localStorage.getItem('dxr-photo');
  if (saved) {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = PHOTO_W; c.height = PHOTO_H;
      c.getContext('2d').drawImage(img, 0, 0, PHOTO_W, PHOTO_H);
      applyPhoto(c, false);
    };
    img.src = saved;
  }
} catch (err) { /* 忽略 */ }

// ======================================================================
//  更新
// ======================================================================
function updateParts(dt, rdt) {
  let j = 0;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i], d = p.rt ? rdt : dt;
    p.t += d;
    if (p.t >= p.life) continue;
    if (p.grav) p.vy += p.grav * d;
    if (p.drag) { const f = Math.max(0, 1 - p.drag * d); p.vx *= f; p.vy *= f; }
    p.x += p.vx * d; p.y += p.vy * d;
    if (p.bounce !== undefined && p.y > GROUND) {
      p.y = GROUND; p.vy *= -p.bounce; p.vx *= 0.6;
      if (Math.abs(p.vy) < 25) { p.vy = 0; p.grav = 0; p.vx *= 0.5; }
    }
    parts[j++] = p;
  }
  parts.length = j;
}

function updatePlayer(dt) {
  const p = player;
  if (p.pose !== 'idle') { p.poseT += dt; if (p.poseT >= p.poseDur) p.pose = 'idle'; }
}

function updateVillain(dt) {
  const v = villain;
  v.stateT += dt; v.flash -= dt; v.hurtT -= dt; v.shakeT -= dt;
  v.ox += -v.ox * Math.min(1, dt * 6);
  if (v.oy < 0 || v.voy !== 0) {
    v.voy += 900 * dt;
    v.oy += v.voy * dt;
    if (v.oy >= 0) {
      v.oy = 0;
      v.voy = v.voy > 220 ? -v.voy * 0.3 : 0;
    }
  }
  v.squash += (1 - v.squash) * Math.min(1, dt * 10);
  if (v.state === 'dead') v.rot += (Math.PI / 2 - v.rot) * Math.min(1, dt * 8);
  else if (v.state === 'spawn') { v.rot = 0; if (v.stateT > 0.35) v.state = 'alive'; }
  else v.rot += ((v.hurtT > 0 ? 0.12 : 0) - v.rot) * Math.min(1, dt * 12);
}

let comboPop = false;
function updateAmbient(rdt) {
  if (Math.random() < rdt * 1.5) {
    P({ rt: true, x: rand(0, W), y: rand(GROUND - 70, GROUND - 5), vx: rand(-8, 8), vy: rand(-6, 2), life: rand(3, 6), ramp: R.firefly });
  }
}

function update(dt, rdt) {
  gameTime += dt;
  updatePlayer(dt);
  updateVillain(dt);
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i];
    e.update(e.rt ? rdt : dt);
    if (e.dead) effects.splice(i, 1);
  }
  updateParts(dt, rdt);
  updateAmbient(rdt);

  for (let i = dnums.length - 1; i >= 0; i--) {
    const d = dnums[i];
    d.t += rdt; d.y += d.vy * rdt; d.vy *= Math.max(0, 1 - 3 * rdt);
    if (d.t >= d.life) dnums.splice(i, 1);
  }
  for (let i = stexts.length - 1; i >= 0; i--) { stexts[i].t += rdt; if (stexts[i].t >= stexts[i].life) stexts.splice(i, 1); }
  if (villain.speech) { villain.speech.t += rdt; if (villain.speech.t > villain.speech.dur) villain.speech = null; }

  if (comboTimer > 0) { comboTimer -= rdt; if (comboTimer <= 0) combo = 0; }
  if (!ult.active) energy = Math.min(100, energy + rdt * 1.2);

  // 镜头
  const k = 1 - Math.exp(-rdt * cam.speed);
  cam.x += (cam.tx - cam.x) * k;
  cam.y += (cam.ty - cam.y) * k;
  cam.zoom += (cam.tz - cam.zoom) * k;
  cam.shake *= Math.pow(0.0015, rdt);
  if (cam.shake < 0.05) cam.shake = 0;

  dim += (dimTarget - dim) * Math.min(1, rdt * 6);
  lb += (lbTarget - lb) * Math.min(1, rdt * 7);
  flashA = Math.max(0, flashA - rdt * 3.5);
  invertT -= rdt;
  speedT -= rdt;
}

// ======================================================================
//  绘制：世界层
// ======================================================================
function drawLantern(x, t) {
  const sway = Math.sin(t * 1.4 + x) * 2, lx = x + sway, ly = 36;
  line(x, 0, lx, ly - 8, '#2a1a2a', 1);
  g.globalCompositeOperation = 'lighter';
  circle(lx, ly, 16, '#1a0804');
  circle(lx, ly, 10, '#2a0c06');
  g.globalCompositeOperation = 'source-over';
  rect(lx - 4, ly - 9, 8, 2, '#d8a83c');
  ellipseFill(lx, ly, 7, 6, '#c8282a');
  rect(lx - 3, ly - 6, 1, 12, '#a01e1e');
  rect(lx + 2, ly - 6, 1, 12, '#a01e1e');
  rect(lx - 5, ly - 3, 2, 5, '#ff6a4a');
  rect(lx - 4, ly + 6, 8, 2, '#d8a83c');
  line(lx, ly + 8, lx + sway * 0.5, ly + 14, '#d8a83c', 1);
}

function drawPlayer(t) {
  const p = player;
  const k = p.poseDur ? Math.min(1, p.poseT / p.poseDur) : 1;
  let lean = 0;
  if (p.pose === 'slash') lean = Math.round(4 * (1 - k));
  else if (p.pose === 'shoot') lean = -Math.round(2 * (1 - k));
  else if (p.pose === 'cast') lean = 1;
  p.lean = lean;
  p.bob = Math.sin(t * 3.2) > 0 ? 0 : 1;
  const bx = PX - 16 + lean, by = GROUND - 48 + p.bob;

  g.globalCompositeOperation = 'source-over';
  ellipseFill(PX, GROUND + 1, 13, 3, 'rgba(0,0,0,0.45)');

  if (ult.active && ult.t < 1.9) {
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.6 + 0.4 * Math.sin(realTime * 30);
    g.drawImage(ULTS[ult.id].glowSpr, bx - 2, by - 2, 36, 52);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  for (let i = 0; i < 7; i++) {
    const sx = bx + 6 - i * 2, sy = by + 20 + Math.round(Math.sin(t * 9 - i * 0.9) * 1.5) + Math.floor(i / 3);
    rect(sx, sy, 2, 2, i % 2 ? '#8e1f2c' : '#e23c3c');
  }
  g.drawImage(spr.player, bx, by, 32, 48);

  const shX = bx + 24, shY = by + 23;
  if (p.pose === 'slash') {
    const a = lerp(-2.3, 0.9, easeOut(k)), hx = shX + 3, hy = shY + 1;
    g.globalCompositeOperation = 'lighter';
    for (let s = 0; s < 10; s++) {
      const aa = a - s * 0.12;
      if (aa < -2.3) break;
      for (let r = 10; r <= 22; r += 2) px(hx + Math.cos(aa) * r, hy + Math.sin(aa) * r, R.slash[Math.min(4, 1 + (s >> 1))]);
    }
    g.globalCompositeOperation = 'source-over';
    rect(shX - 2, shY - 1, 6, 3, '#3d58a8');
    line(hx, hy, hx + Math.cos(a) * 22, hy + Math.sin(a) * 22, '#bfefff', 2);
    line(hx + Math.cos(a) * 3, hy + Math.sin(a) * 3, hx + Math.cos(a) * 22, hy + Math.sin(a) * 22, '#ffffff', 1);
    const pa = a + Math.PI / 2;
    line(hx - Math.cos(pa) * 3, hy - Math.sin(pa) * 3, hx + Math.cos(pa) * 3, hy + Math.sin(pa) * 3, '#ffd24a', 1);
    rect(hx - 1, hy - 1, 3, 3, '#f4cfa4');
  } else if (p.pose === 'shoot') {
    const rc = Math.round(2 * (1 - k));
    rect(shX - 2, shY - 2, 16 - rc, 3, '#3d58a8');
    rect(shX + 13 - rc, shY - 2, 3, 3, '#f4cfa4');
    rect(shX + 14 - rc, shY - 5, 11, 3, '#3a3a48');
    rect(shX + 14 - rc, shY - 5, 11, 1, '#8a8aa0');
    rect(shX + 15 - rc, shY - 2, 3, 4, '#2a2230');
  } else if (p.pose === 'cast') {
    rect(shX - 2, shY - 2, 13, 3, '#3d58a8');
    rect(shX + 10, shY - 2, 3, 3, '#f4cfa4');
    const col = ELEM[p.elem] || ELEM.fire;
    g.globalCompositeOperation = 'lighter';
    circle(shX + 14, shY - 1, 4 + Math.sin(t * 40), col[3]);
    circle(shX + 14, shY - 1, 2, col[1]);
    px(shX + 14, shY - 1, col[0]);
    g.globalCompositeOperation = 'source-over';
  } else {
    line(bx + 7, by + 28, bx + 1, by + 44, '#9fc8e8', 1);
    rect(bx + 5, by + 27, 4, 1, '#ffd24a');
  }
}

function drawVillain(t) {
  const v = villain;
  g.globalCompositeOperation = 'source-over';
  ellipseFill(VX + v.ox, GROUND + 1, 12, 3, 'rgba(0,0,0,0.45)');
  let x = VX + v.ox, y = GROUND + v.oy;
  if (v.shakeT > 0 || (ult.active && ult.t > 1.8 && !ult.final)) x += Math.round(rand(-2, 2));
  let sc = 1, alpha = 1;
  if (v.state === 'spawn') sc = 0.3 + 0.7 * easeOut(Math.min(1, v.stateT / 0.3));
  if (v.state === 'dead' && v.stateT > 1.5) alpha = Math.max(0, 1 - (v.stateT - 1.5) / 0.5);
  const breathe = v.state === 'alive' && v.hurtT <= 0 ? (Math.sin(t * 4) > 0 ? 1 : 0.96) : 1;
  const sy = v.squash * breathe, sx = 1 + (1 - v.squash) * 0.9;
  const L = villainLook;
  const s = v.flash > 0 ? L.white : (v.hurtT > 0 || v.state !== 'alive' ? L.hurt : L.normal);
  g.save();
  g.globalAlpha = alpha;
  g.translate(Math.round(x), Math.round(y));
  g.rotate(v.rot);
  g.scale(sx * sc, sy * sc);
  g.drawImage(s, -L.w / 2, -L.h, L.w, L.h);
  g.restore();
}

function drawParts() {
  for (const add of [false, true]) {
    g.globalCompositeOperation = add ? 'lighter' : 'source-over';
    for (const p of parts) {
      if (p.add !== add) continue;
      const r = p.t / p.life, ramp = p.ramp;
      const c = ramp[Math.min(ramp.length - 1, (r * ramp.length) | 0)];
      if (p.shape === 'line') line(p.x, p.y, p.x - p.vx * 0.035, p.y - p.vy * 0.035, c, 1);
      else {
        const s = p.shrink ? Math.max(1, Math.round(p.size * (1 - r))) : p.size;
        g.fillStyle = c;
        g.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), s, s);
      }
    }
  }
  g.globalCompositeOperation = 'source-over';
}

function drawDNums() {
  g.globalCompositeOperation = 'source-over';
  for (const d of dnums) {
    const k = d.t / d.life;
    g.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
    let s = d.big ? 4 : d.crit ? 3 : 2;
    if (d.t < 0.08) s += 1;
    const col = d.big ? (Math.floor(realTime * 20) % 2 ? '#fff4c0' : '#ffc030') : d.crit ? '#ffe040' : (d.color || '#ffffff');
    bmText(d.s, d.x, d.y, s, col, d.crit || d.big ? '#5a1a00' : '#1a0a1a');
  }
  g.globalAlpha = 1;
}

function drawWorld() {
  const t = gameTime;
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
  g.drawImage(bg, 0, 0);
  for (const s of twinkles) {
    const a = Math.sin(realTime * s.s + s.p);
    if (a > 0.3) px(s.x, s.y, a > 0.85 ? '#ffffff' : '#a8a8e0');
  }
  drawLantern(34, realTime);
  drawLantern(446, realTime + 2);

  if (dim > 0.01) { g.fillStyle = `rgba(${dimRGB},${dim.toFixed(3)})`; g.fillRect(0, 0, W, H); }

  for (const e of effects) if (e.layer === 'ground') e.draw();
  g.globalCompositeOperation = 'source-over';
  drawPlayer(t);
  drawVillain(t);
  for (const e of effects) if (e.layer !== 'ground') e.draw();
  g.globalCompositeOperation = 'source-over';
  drawParts();
  drawDNums();
}

// ======================================================================
//  绘制：屏幕层（文字、演出）
// ======================================================================
function toScreen(wx, wy) { return { x: (wx - view.sx) * view.k + view.ox, y: (wy - view.sy) * view.k + view.oy }; }

function strokeText(txt, x, y, fill, stroke, lw) {
  sctx.lineJoin = 'round';
  sctx.lineWidth = lw;
  sctx.strokeStyle = stroke;
  sctx.strokeText(txt, x, y);
  sctx.fillStyle = fill;
  sctx.fillText(txt, x, y);
}

function drawNameTag() {
  const v = villain;
  if (v.state === 'dead') return;
  const p = toScreen(VX + v.ox, GROUND - villainLook.h - 8 + v.oy);
  const fs = Math.round(22 * Math.sqrt(cam.zoom) * uiScale);
  sctx.font = `900 ${fs}px ${FONT}`;
  sctx.textAlign = 'center';
  sctx.textBaseline = 'middle';
  const w = sctx.measureText(v.name).width + fs;
  const y = p.y - fs;
  sctx.fillStyle = '#2a1a10';
  sctx.fillRect(p.x - w / 2 - 4, y - fs * 0.75 - 4, w + 8, fs * 1.5 + 8);
  sctx.fillStyle = '#c8282a';
  sctx.fillRect(p.x - w / 2, y - fs * 0.75, w, fs * 1.5);
  sctx.fillStyle = '#ffe9a8';
  sctx.fillText(v.name, p.x, y + 1);
}

function drawSpeech() {
  const sp = villain.speech;
  if (!sp) return;
  const p = toScreen(VX + villain.ox - 14, GROUND - villainLook.h - 14 + villain.oy);
  const pop = sp.t < 0.1 ? easeOut(sp.t / 0.1) : 1;
  sctx.save();
  sctx.font = `900 26px ${FONT}`;
  sctx.textAlign = 'center';
  sctx.textBaseline = 'middle';
  const w = sctx.measureText(sp.text).width + 30, h = 50;
  const bx = p.x - w * 0.8, by = p.y - 120;
  sctx.translate(bx + w / 2, by + h);
  sctx.scale(pop * uiScale, pop * uiScale);
  sctx.translate(-(bx + w / 2), -(by + h));
  sctx.fillStyle = '#000';
  sctx.fillRect(bx - 4, by - 4, w + 8, h + 8);
  sctx.fillStyle = '#fff';
  sctx.fillRect(bx, by, w, h);
  sctx.fillStyle = '#000';
  sctx.fillRect(bx + w * 0.7, by + h, 16, 12);
  sctx.fillStyle = '#fff';
  sctx.fillRect(bx + w * 0.7 + 4, by + h, 8, 6);
  sctx.fillStyle = '#1a0a0a';
  sctx.fillText(sp.text, bx + w / 2, by + h / 2 + 1);
  sctx.restore();
}

function drawSTexts() {
  for (const s of stexts) {
    const p = toScreen(s.x, s.y - s.t * 20);
    const k = s.t / s.life;
    const sc = s.t < 0.08 ? lerp(2.2, 1, s.t / 0.08) : 1;
    sctx.save();
    sctx.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
    sctx.translate(p.x, p.y);
    sctx.rotate(s.rot);
    sctx.scale(sc * uiScale, sc * uiScale);
    sctx.font = `900 ${s.size}px ${FONT}`;
    sctx.textAlign = 'center';
    sctx.textBaseline = 'middle';
    strokeText(s.text, 0, 0, s.color, '#3a0a0a', 8);
    sctx.restore();
  }
}

function drawCutin(ct) {
  const U = ULTS[ult.id];
  const D = 1.4;
  const inK = clamp(ct / 0.18, 0, 1), outK = clamp((ct - (D - 0.22)) / 0.22, 0, 1);
  const bandH = SH * 0.44 * easeOut(inK) * (1 - easeIn(outK));
  if (bandH < 2) return;
  sctx.save();
  sctx.translate(SW / 2, SH / 2);
  sctx.rotate(-0.12);
  const grad = sctx.createLinearGradient(-SW / 2, 0, SW / 2, 0);
  grad.addColorStop(0, U.band[0]);
  grad.addColorStop(0.45, U.band[1]);
  grad.addColorStop(1, U.band[2]);
  sctx.fillStyle = grad;
  sctx.fillRect(-SW, -bandH / 2, SW * 2, bandH);
  sctx.fillStyle = U.accent;
  sctx.fillRect(-SW, -bandH / 2 - 10, SW * 2, 6);
  sctx.fillRect(-SW, bandH / 2 + 4, SW * 2, 6);
  sctx.fillStyle = '#ffffff';
  sctx.fillRect(-SW, -bandH / 2 - 3, SW * 2, 3);
  sctx.fillRect(-SW, bandH / 2, SW * 2, 3);

  sctx.beginPath();
  sctx.rect(-SW, -bandH / 2, SW * 2, bandH);
  sctx.clip();

  // 速度线
  for (let i = 0; i < 60; i++) {
    const y = (((i * 73) % 100) / 100 - 0.5) * bandH;
    const len = 120 + (i * 53) % 260;
    const x = SW * 1.2 - (((i * 137) + ct * 3200 * (1 + (i % 3) * 0.5)) % (SW * 2.6));
    sctx.globalAlpha = 0.25 + (i % 5) * 0.12;
    sctx.fillStyle = i % 4 === 0 ? U.accent : '#ffffff';
    sctx.fillRect(x, y, len, i % 3 === 0 ? 4 : 2);
  }
  sctx.globalAlpha = 1;

  // 角色特写
  const ps = 11, pw = spr.player.width * ps, ph = spr.player.height * ps;
  const slide = easeOut(clamp(ct / 0.28, 0, 1));
  const pxp = lerp(-SW * 0.85, -SW * 0.3, slide) + ct * 30;
  const pyp = -ph / 2 + 20;
  sctx.imageSmoothingEnabled = false;
  sctx.globalCompositeOperation = 'lighter';
  sctx.globalAlpha = 0.6;
  sctx.drawImage(U.glowSpr, pxp - pw / 2 - 14, pyp - 14, pw + 28, ph + 28);
  sctx.globalAlpha = 1;
  sctx.globalCompositeOperation = 'source-over';
  sctx.drawImage(spr.player, pxp - pw / 2, pyp, pw, ph);
  // 眼神闪光
  if (ct > 0.3 && ct < 0.7) {
    const ek = (ct - 0.3) / 0.4, er = 70 * Math.sin(ek * Math.PI);
    const ex = pxp - pw / 2 + 12.5 * ps, ey = pyp + 6.5 * ps;
    sctx.globalCompositeOperation = 'lighter';
    sctx.fillStyle = U.eye;
    sctx.fillRect(ex - er, ey - 3, er * 2, 6);
    sctx.fillRect(ex - 3, ey - er * 0.5, 6, er);
    sctx.fillStyle = '#ffffff';
    sctx.fillRect(ex - er * 0.6, ey - 1, er * 1.2, 2);
    sctx.globalCompositeOperation = 'source-over';
  }

  // 招式名
  sctx.textAlign = 'center';
  sctx.textBaseline = 'middle';
  const tk = clamp((ct - 0.25) / 0.14, 0, 1);
  if (tk > 0) {
    const sc = lerp(3, 1, easeOut(tk));
    sctx.save();
    sctx.translate(SW * 0.17 + ct * 20, 10);
    sctx.scale(sc, sc);
    sctx.globalAlpha = tk;
    sctx.font = `900 46px ${FONT}`;
    strokeText('— 奥 义 —', 0, -95, '#ffffff', U.band[0], 10);
    sctx.font = `900 132px ${FONT}`;
    const tg = sctx.createLinearGradient(0, -60, 0, 60);
    tg.addColorStop(0, U.text[0]);
    tg.addColorStop(0.5, U.text[1]);
    tg.addColorStop(1, U.text[2]);
    sctx.lineJoin = 'round';
    sctx.lineWidth = 20;
    sctx.strokeStyle = U.stroke;
    sctx.strokeText(U.name, 0, 20);
    sctx.fillStyle = tg;
    sctx.fillText(U.name, 0, 20);
    sctx.restore();
  }
  sctx.restore();
}

function drawRadialLines() {
  const c = toScreen(VX + villain.ox, GROUND - 30);
  sctx.save();
  sctx.globalAlpha = Math.min(1, speedT / 0.3);
  sctx.fillStyle = '#ffffff';
  for (let i = 0; i < 70; i++) {
    const a = rand(0, Math.PI * 2), r0 = rand(SW * 0.3, SW * 0.55), r1 = SW * 1.2, w = rand(0.004, 0.012);
    sctx.beginPath();
    sctx.moveTo(c.x + Math.cos(a) * r0, c.y + Math.sin(a) * r0);
    sctx.lineTo(c.x + Math.cos(a - w) * r1, c.y + Math.sin(a - w) * r1);
    sctx.lineTo(c.x + Math.cos(a + w) * r1, c.y + Math.sin(a + w) * r1);
    sctx.closePath();
    sctx.fill();
  }
  sctx.restore();
}

function drawBanners(rdt) {
  for (let i = banners.length - 1; i >= 0; i--) {
    const b = banners[i];
    b.t += rdt;
    if (b.t >= b.life) { banners.splice(i, 1); continue; }
    const fade = b.t > b.life - 0.3 ? (b.life - b.t) / 0.3 : 1;
    sctx.save();
    sctx.globalAlpha = fade;
    sctx.textAlign = 'center';
    sctx.textBaseline = 'middle';
    if (b.type === 'ko') {
      const s = b.t < 0.15 ? lerp(3, 1, easeOut(b.t / 0.15)) : 1;
      sctx.translate(SW / 2, SH * 0.36);
      sctx.scale(s, s);
      sctx.font = `italic 900 170px ${FONT}`;
      const gr = sctx.createLinearGradient(0, -80, 0, 80);
      gr.addColorStop(0, '#fff3a0');
      gr.addColorStop(0.5, '#ff5a2a');
      gr.addColorStop(1, '#a01010');
      sctx.lineJoin = 'round';
      sctx.lineWidth = 22;
      sctx.strokeStyle = '#1a0505';
      sctx.strokeText('K.O.!', 0, 0);
      sctx.fillStyle = gr;
      sctx.fillText('K.O.!', 0, 0);
      sctx.font = `900 46px ${FONT}`;
      strokeText(`「${b.name}」被打爆了！`, 0, 120, '#ffffff', '#1a0505', 10);
    } else if (b.type === 'ult') {
      const s = b.t < 0.12 ? lerp(2, 1, easeOut(b.t / 0.12)) : 1;
      sctx.translate(SW / 2, SH * 0.66);
      sctx.scale(s, s);
      sctx.font = `900 42px ${FONT}`;
      strokeText('奥义总伤害', 0, -78, '#ffffff', '#1a0638', 10);
      const shown = Math.round(b.val * Math.min(1, b.t / 0.6));
      sctx.font = `italic 900 120px ${FONT}`;
      strokeText(String(shown), 0, 10, '#ffd24a', '#3a1000', 18);
    }
    sctx.restore();
  }
}

function render(rdt) {
  drawWorld();

  sctx.globalCompositeOperation = 'source-over';
  sctx.globalAlpha = 1;
  sctx.fillStyle = '#000';
  sctx.fillRect(0, 0, SW, SH);
  const sw = W / cam.zoom, sh = H / cam.zoom;
  const sx = clamp(cam.x - sw / 2, 0, W - sw), sy = clamp(cam.y - sh / 2, 0, H - sh);
  const k = SW / sw;
  const ox = cam.shake ? rand(-1, 1) * cam.shake * k * 0.6 : 0;
  const oy = cam.shake ? rand(-1, 1) * cam.shake * k * 0.6 : 0;
  view = { sx, sy, sw, sh, ox, oy, k };
  sctx.imageSmoothingEnabled = false;
  sctx.drawImage(world, sx, sy, sw, sh, ox, oy, SW, SH);

  drawNameTag();
  drawSTexts();
  drawSpeech();

  if (speedT > 0) drawRadialLines();

  if (dim > 0.05) {
    const vg = sctx.createRadialGradient(SW / 2, SH / 2, SH * 0.3, SW / 2, SH / 2, SW * 0.7);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, `rgba(0,0,0,${(dim * 0.8).toFixed(3)})`);
    sctx.fillStyle = vg;
    sctx.fillRect(0, 0, SW, SH);
  }

  if (ult.cutinT >= 0) drawCutin(ult.cutinT);

  if (lb > 0.005) {
    const bh = SH * 0.12 * lb;
    sctx.fillStyle = '#000';
    sctx.fillRect(0, 0, SW, bh);
    sctx.fillRect(0, SH - bh, SW, bh);
    if (lb > 0.6) {
      sctx.globalAlpha = (lb - 0.6) / 0.4;
      sctx.font = `700 26px ${FONT}`;
      sctx.textAlign = 'center';
      sctx.textBaseline = 'middle';
      sctx.fillStyle = '#c8b8f0';
      sctx.fillText('奥义 · ' + ULTS[ult.id].name, SW / 2, SH - bh / 2);
      sctx.globalAlpha = 1;
    }
  }

  drawBanners(rdt);

  if (flashA > 0) {
    sctx.globalAlpha = Math.min(1, flashA);
    sctx.fillStyle = flashColor;
    sctx.fillRect(0, 0, SW, SH);
    sctx.globalAlpha = 1;
  }
  if (invertT > 0) {
    sctx.globalCompositeOperation = 'difference';
    sctx.fillStyle = '#ffffff';
    sctx.fillRect(0, 0, SW, SH);
    sctx.globalCompositeOperation = 'source-over';
  }
}

// ======================================================================
//  HUD
// ======================================================================
const ui = {
  energyFill: $('energyFill'), ultFills: document.querySelectorAll('.ultFill'), hpFill: $('hpFill'), hpGhost: $('hpGhost'),
  hpText: $('hpText'), koCount: $('koCount'), totalDmg: $('totalDmg'), combo: $('combo'), comboNum: $('comboNum'),
};
let ghostHp = villain.maxHp, lastUi = {};
function setIf(key, val, fn) { if (lastUi[key] !== val) { lastUi[key] = val; fn(val); } }

function updateHUD(rdt) {
  const hpPct = clamp(villain.hp / villain.maxHp, 0, 1) * 100;
  if (ghostHp > villain.hp) ghostHp = Math.max(villain.hp, ghostHp - villain.maxHp * rdt * 0.6);
  else ghostHp = villain.hp;
  const ghostPct = clamp(ghostHp / villain.maxHp, 0, 1) * 100;
  setIf('hp', hpPct.toFixed(1), v => { ui.hpFill.style.width = v + '%'; });
  setIf('ghost', ghostPct.toFixed(1), v => { ui.hpGhost.style.width = v + '%'; });
  setIf('hpText', Math.max(0, Math.ceil(villain.hp)), v => { ui.hpText.textContent = `${v} / ${villain.maxHp}`; });
  setIf('en', energy.toFixed(1), v => { ui.energyFill.style.width = v + '%'; ui.ultFills.forEach(f => { f.style.height = v + '%'; }); });
  setIf('ready', energy >= 100 && !ult.active, v => document.body.classList.toggle('ready', v));
  setIf('ko', kos, v => { ui.koCount.textContent = `KO ×${v}`; });
  setIf('total', totalDmg, v => { ui.totalDmg.textContent = v.toLocaleString(); });
  setIf('comboShow', combo >= 2, v => ui.combo.classList.toggle('show', v));
  if (combo >= 2) {
    setIf('combo', combo, v => { ui.comboNum.textContent = v; });
    if (comboPop) {
      ui.combo.classList.remove('pop');
      void ui.combo.offsetWidth;
      ui.combo.classList.add('pop');
    }
  }
  comboPop = false;
}

// ======================================================================
//  主循环
// ======================================================================
let last = performance.now();
function frame(now) {
  const rdt = Math.min(0.05, (now - last) / 1000);
  last = now;
  realTime += rdt;
  runTimers();
  if (ult.active) updateUlt(rdt);
  held.forEach(s => tryCast(s, false));

  let ts = timeScale;
  if (hitStop > 0) { hitStop -= rdt; ts = 0; }
  update(rdt * ts, rdt);
  render(rdt);
  updateHUD(rdt);
  requestAnimationFrame(frame);
}
villain.say('有本事来打我呀！', 2);
requestAnimationFrame(frame);
})();
