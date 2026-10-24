// 重力方块：只在玩家处于同色重力时受重力影响，其余时刻冻结悬停
import { DIRS, axisOf, signOf, v3, mod, lateralDirs } from '../core/math.js';
import * as C from './constants.js';
import { overlap } from './player.js';

let NEXT_ID = 1;

export class Cube {
  constructor(color, pos, opts = {}) {
    this.id = NEXT_ID++;
    this.color = color;
    this.pos = pos.slice();
    this.spawn = pos.slice();
    this.vel = 0;
    this.state = 'free'; // free | held | socket
    this.socket = null;
    this.resting = false;
    this.fallDist = 0;
    this.appear = opts.appear ?? 1; // 出现动画 0→1
    this.slide = null; // {from, to, t}
    this.glow = 0;
    this.fruit = !!opts.fruit;
    this.wasResting = false;
  }
  box(pos = this.pos) {
    const h = C.CUBE_H;
    return [pos[0] - h, pos[1] - h, pos[2] - h, pos[0] + h, pos[1] + h, pos[2] + h];
  }
}

export class CubeSystem {
  constructor(game) {
    this.game = game;
    this.list = [];
  }
  clear() { this.list = []; }
  add(color, pos, opts) {
    const c = new Cube(color, pos, opts);
    this.list.push(c);
    return c;
  }

  update(dt) {
    const g = this.game;
    for (const c of this.list) {
      c.appear = Math.min(1, c.appear + dt * 2.2);
      const active = g.player.grav === c.color;
      c.glow += ((active ? 1 : 0) - c.glow) * Math.min(1, dt * 6);
      if (c.slide) {
        c.slide.t += dt / c.slide.dur;
        const t = Math.min(1, c.slide.t);
        const e = t * t * (3 - 2 * t);
        c.pos = v3.lerp(c.slide.from, c.slide.to, e);
        if (t >= 1) {
          c.pos = c.slide.to.map((v, a) => mod(v, g.size[a]));
          const done = c.slide.done;
          c.slide = null;
          if (done) done();
        }
        continue;
      }
      if (c.state !== 'free') continue;
      if (!active) { c.vel = 0; continue; }
      this.fall(c, dt);
    }
  }

  fall(c, dt) {
    const g = this.game;
    const ga = axisOf(c.color), gs = signOf(c.color);
    // 安全网：若方块意外嵌入几何体，逆重力方向推出
    if (g.boxBlocked(c.box(), c, false)) {
      for (let k = 1; k <= 30; k++) {
        const q = c.pos.slice();
        q[ga] -= gs * k * 0.05;
        if (!g.boxBlocked(c.box(q), c, false)) { c.pos = q; break; }
      }
    }
    const steps = Math.max(1, Math.ceil((c.vel * dt) / 0.3));
    const h = dt / steps;
    let hitAny = false;
    for (let i = 0; i < steps; i++) {
      c.vel = Math.min(c.vel + C.GRAVITY * h, C.TERMINAL);
      const d = c.vel * h * gs;
      const hit = this.sweep(c, ga, d);
      if (hit) { hitAny = true; break; }
      c.fallDist += Math.abs(d);
    }
    if (hitAny) {
      if (!c.wasResting && c.vel > 2.5) g.audio.cubeLand(Math.min(1, c.vel / 20), g.relToCam(c.pos));
      if (!c.wasResting) g.onCubeLanded(c);
      c.vel = 0;
      c.fallDist = 0;
      c.resting = true;
    } else {
      c.resting = false;
    }
    c.wasResting = c.resting;
    const sz = g.size;
    for (let a = 0; a < 3; a++) c.pos[a] = mod(c.pos[a], sz[a]);
    if (c.fallDist > sz[ga] * 2.5) {
      // 在无尽虚空里坠落太久：回到出生点
      c.pos = c.spawn.slice();
      c.vel = 0; c.fallDist = 0; c.appear = 0; c.resting = false; c.wasResting = false;
      g.audio.respawnCube(g.relToCam(c.pos));
    }
  }

  sweep(c, a, d) {
    const g = this.game;
    const cb = c.box();
    const nb = cb.slice(); nb[a] += d; nb[a + 3] += d;
    const qmn = [Math.min(cb[0], nb[0]), Math.min(cb[1], nb[1]), Math.min(cb[2], nb[2])];
    const qmx = [Math.max(cb[3], nb[3]), Math.max(cb[4], nb[4]), Math.max(cb[5], nb[5])];
    const boxes = g.queryBoxes(qmn, qmx, c, false, true);
    let np = c.pos[a] + d, hit = null;
    const e = 1e-4, h = C.CUBE_H;
    const cmn = [cb[0], cb[1], cb[2]], cmx = [cb[3], cb[4], cb[5]];
    const nmn = [nb[0], nb[1], nb[2]], nmx = [nb[3], nb[4], nb[5]];
    for (const b of boxes) {
      if (overlap(b, cmn, cmx, -e)) continue;
      if (!overlap(b, nmn, nmx, 0)) continue;
      if (d > 0) { const lim = b[a] - h - e; if (lim < np) { np = lim; hit = b; } }
      else { const lim = b[a + 3] + h + e; if (lim > np) { np = lim; hit = b; } }
    }
    c.pos[a] = np;
    return hit;
  }

  // 方块所在格子（用于水流阻挡）
  cellOf(c) {
    return [Math.floor(c.pos[0]), Math.floor(c.pos[1]), Math.floor(c.pos[2])];
  }

  // 松手：对齐到网格的切向位置（若空间允许）
  release(c) {
    const g = this.game;
    const ga = axisOf(c.color);
    const snapped = c.pos.slice();
    for (const a of [0, 1, 2]) if (a !== ga) snapped[a] = Math.floor(c.pos[a]) + 0.5;
    c.state = 'free';
    c.vel = 0; c.fallDist = 0; c.resting = false; c.wasResting = false;
    if (!g.boxBlocked(c.box(snapped), c)) {
      c.slide = { from: c.pos.slice(), to: snapped, t: 0, dur: 0.12 };
    }
  }
}

export { lateralDirs, DIRS };
