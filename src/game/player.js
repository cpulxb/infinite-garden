// 第一人称控制器：六向重力、重力翻转动画、台阶、周期环绕、长坠回收
import { DIRS, opp, axisOf, signOf, quat, v3, clamp, easeInOut, mod } from '../core/math.js';
import * as C from './constants.js';

export function bodyQuatFor(grav) {
  return quat.snapAxis(quat.fromTo([0, 1, 0], DIRS[opp(grav)], [1, 0, 0]));
}

export class Player {
  constructor(game) {
    this.game = game;
  }

  reset(spawn) {
    this.grav = spawn.grav;
    const up = DIRS[opp(this.grav)];
    this.pos = v3.madd(spawn.pos, up, C.HALF_UP + 0.02);
    this.vel = [0, 0, 0];
    this.bodyQ = bodyQuatFor(this.grav);
    this.yaw = spawn.yaw || 0;
    this.pitch = spawn.pitch || 0;
    this.grounded = false;
    this.shift = null;
    this.stepSmooth = 0;
    this.fallDist = 0;
    this.airTime = 0;
    this.bob = 0;
    this.bobAmt = 0;
    this.stepAcc = 0;
    this.onStatic = false;
    this.safeTimer = 0;
    this.lastSafe = this.snapshot();
    this.landKick = 0;
    this.speedFov = 0;
  }

  snapshot() {
    return { pos: this.pos.slice(), grav: this.grav, bodyQ: this.bodyQ.slice(), yaw: this.yaw, pitch: this.pitch };
  }
  restore(s) {
    this.pos = s.pos.slice(); this.grav = s.grav; this.bodyQ = s.bodyQ.slice();
    this.yaw = s.yaw; this.pitch = s.pitch; this.vel = [0, 0, 0];
    this.shift = null; this.fallDist = 0; this.grounded = false; this.stepSmooth = 0;
  }

  halfFor(g) {
    const h = [C.HALF_SIDE, C.HALF_SIDE, C.HALF_SIDE];
    h[axisOf(g)] = C.HALF_UP;
    return h;
  }
  half() { return this.halfFor(this.grav); }
  up() { return DIRS[opp(this.grav)]; }

  viewQ(bodyQ = this.bodyQ) {
    return quat.mul(bodyQ, quat.mul(quat.axisAngle([0, 1, 0], this.yaw), quat.axisAngle([1, 0, 0], this.pitch)));
  }
  camQ() {
    if (this.shift) return quat.slerp(this.shift.fromQ, this.shift.toQ, easeInOut(Math.min(1, this.shift.t)));
    return this.viewQ();
  }
  bodyUp() {
    if (this.shift) {
      const q = quat.slerp(this.shift.fromBody, this.shift.newBody, easeInOut(Math.min(1, this.shift.t)));
      return quat.rot(q, [0, 1, 0]);
    }
    return this.up();
  }
  eye() {
    if (this.shift) {
      const e = easeInOut(Math.min(1, this.shift.t));
      return v3.lerp(this.shift.fromEye, this.shift.toEye, e);
    }
    const U = this.up();
    const off = C.EYE + this.stepSmooth + Math.sin(this.bob) * 0.035 * this.bobAmt - this.landKick;
    return v3.madd(this.pos, U, off);
  }
  look() { return quat.rot(this.camQ(), [0, 0, -1]); }

  look2(dx, dy) {
    if (this.shift) return;
    this.yaw -= dx;
    this.pitch = clamp(this.pitch - dy, -1.54, 1.54);
  }

  // ---------- 重力翻转 ----------
  tryShift(newGrav) {
    if (this.shift || newGrav === this.grav) return false;
    const oldUp = this.up(), newUp = DIRS[opp(newGrav)];
    let R;
    if (v3.dot(oldUp, newUp) < -0.5) {
      const right = quat.rot(quat.mul(this.bodyQ, quat.axisAngle([0, 1, 0], this.yaw)), [1, 0, 0]);
      R = quat.axisAngle(v3.norm(right), Math.PI);
    } else {
      R = quat.fromTo(oldUp, newUp);
    }
    const newBody = quat.snapAxis(quat.mul(R, this.bodyQ));
    const h2 = this.halfFor(newGrav);
    const target = this.findFree(this.pos, h2, newUp);
    if (!target) return false;
    // 保持 yaw/pitch 不变，等价于把整个视角绕 R 旋转
    this.shift = {
      t: 0,
      fromQ: this.camQ(),
      toQ: this.viewQ(newBody),
      fromEye: this.eye(),
      toEye: v3.madd(target, newUp, C.EYE),
      toPos: target,
      newGrav,
      fromBody: this.bodyQ.slice(),
      newBody,
    };
    this.vel = [0, 0, 0];
    return true;
  }

  findFree(center, half, prefer) {
    const g = this.game;
    if (!g.overlapsSolid(center, half, null)) return center.slice();
    const cands = [];
    for (let s = 0.1; s <= 1.3; s += 0.1) {
      cands.push(v3.madd(center, prefer, s));
      for (let d = 0; d < 6; d++) cands.push(v3.madd(center, DIRS[d], s));
    }
    for (const c of cands) if (!g.overlapsSolid(c, half, null)) return c;
    return null;
  }

  // ---------- 物理 ----------
  update(dt, inp) {
    if (this.shift) {
      this.shift.t += dt / C.SHIFT_TIME;
      if (this.shift.t >= 1) {
        const s = this.shift;
        this.grav = s.newGrav;
        this.bodyQ = s.newBody;
        this.pos = s.toPos;
        this.vel = [0, 0, 0];
        this.grounded = false;
        this.shift = null;
        this.stepSmooth = 0;
        this.fallDist = 0;
        this.game.onShiftDone();
      }
      return;
    }
    const steps = Math.max(1, Math.round(dt / C.PHYS_DT));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) this.step(h, inp);
    inp.jump = false;
    this.stepSmooth *= Math.exp(-dt * 14);
    if (Math.abs(this.stepSmooth) < 1e-3) this.stepSmooth = 0;
    this.landKick *= Math.exp(-dt * 9);
  }

  step(dt, inp) {
    const g = this.grav, ga = axisOf(g), gs = signOf(g);
    const yq = quat.mul(this.bodyQ, quat.axisAngle([0, 1, 0], this.yaw));
    const fwd = quat.rot(yq, [0, 0, -1]), right = quat.rot(yq, [1, 0, 0]);
    let mx = inp.mx, mz = inp.mz;
    const ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; }
    const speed = inp.run ? C.RUN : C.WALK;
    const wish = [0, 0, 0];
    for (let a = 0; a < 3; a++) wish[a] = (fwd[a] * mz + right[a] * mx) * speed;
    wish[ga] = 0;
    const acc = this.grounded ? C.GROUND_ACC : C.AIR_ACC;
    const dv = [wish[0] - this.vel[0], wish[1] - this.vel[1], wish[2] - this.vel[2]];
    dv[ga] = 0;
    const dl = Math.hypot(dv[0], dv[1], dv[2]);
    const maxd = acc * dt;
    const k = dl > maxd ? maxd / dl : 1;
    for (let a = 0; a < 3; a++) if (a !== ga) this.vel[a] += dv[a] * k;

    let vg = this.vel[ga] * gs;
    vg = Math.min(vg + C.GRAVITY * dt, C.TERMINAL);
    if (inp.jump && this.grounded) {
      vg = -C.JUMP_V;
      this.grounded = false;
      inp.jump = false;
      this.game.audio.jump();
    }
    this.vel[ga] = vg * gs;

    const wasGrounded = this.grounded;
    const tAxes = [0, 1, 2].filter((a) => a !== ga);
    for (const a of tAxes) {
      const d = this.vel[a] * dt;
      if (!d) continue;
      const before = this.pos.slice();
      const hit = this.moveAxis(a, d);
      if (hit && wasGrounded) {
        if (!this.tryStep(before, a, d)) this.vel[a] = 0;
      } else if (hit) this.vel[a] = 0;
    }
    const dG = this.vel[ga] * dt;
    const hitG = this.moveAxis(ga, dG);
    if (hitG) {
      if (dG * gs > 0) {
        if (!this.grounded && vg > 4) {
          this.game.audio.land(Math.min(1, vg / 22));
          this.landKick = Math.min(0.18, vg * 0.006);
        }
        this.grounded = true;
        this.onStatic = !hitG.dyn;
        this.groundRef = hitG.ref || null;
      }
      this.vel[ga] = 0;
    } else {
      this.grounded = false;
    }

    // 周期环绕
    const sz = this.game.size;
    for (let a = 0; a < 3; a++) {
      if (this.pos[a] < 0 || this.pos[a] >= sz[a]) {
        const np = mod(this.pos[a], sz[a]);
        this.game.onWrap(a, np - this.pos[a]);
        this.pos[a] = np;
      }
    }

    // 长坠回收 & 安全点
    if (!this.grounded) {
      this.airTime += dt;
      if (dG * gs > 0) this.fallDist += dG * gs;
      if (this.fallDist > sz[ga] * 2.4) this.game.fellTooLong();
    } else {
      this.airTime = 0;
      this.fallDist = 0;
      if (this.onStatic) {
        this.safeTimer += dt;
        if (this.safeTimer > 0.5) { this.lastSafe = this.snapshot(); this.safeTimer = 0; }
      }
    }

    // 头部晃动 & 脚步
    const tv = Math.hypot(...tAxes.map((a) => this.vel[a]));
    const moving = this.grounded && tv > 0.5;
    this.bobAmt += ((moving ? Math.min(1, tv / C.WALK) : 0) - this.bobAmt) * Math.min(1, dt * 8);
    if (moving) {
      this.bob += dt * tv * 1.9;
      this.stepAcc += tv * dt;
      if (this.stepAcc > 2.1) { this.stepAcc = 0; this.game.audio.step(); }
    }
    this.speedFov += ((Math.min(1, Math.max(0, (vg - 10) / 25))) - this.speedFov) * Math.min(1, dt * 3);
  }

  tryStep(before, a, d) {
    const ga = axisOf(this.grav), gs = signOf(this.grav);
    const half = this.half();
    const lifted = before.slice();
    lifted[ga] -= gs * C.STEP;
    if (this.game.overlapsSolid(lifted, half, null)) return false;
    const save = this.pos.slice();
    this.pos = lifted;
    const hit = this.moveAxis(a, d);
    const progress = Math.abs(this.pos[a] - before[a]);
    if (hit && progress < 1e-3) { this.pos = save; return false; }
    const down = this.moveAxis(ga, gs * (C.STEP + 0.02));
    if (!down) { this.pos = save; return false; }
    const rise = (before[ga] - this.pos[ga]) * gs;
    if (rise < 0.02) { this.pos = save; return false; }
    this.stepSmooth -= rise;
    return true;
  }

  // 沿单轴移动并处理碰撞，返回命中的盒子或 null
  moveAxis(a, d) {
    const half = this.half();
    const p = this.pos;
    const cmn = [p[0] - half[0], p[1] - half[1], p[2] - half[2]];
    const cmx = [p[0] + half[0], p[1] + half[1], p[2] + half[2]];
    const nmn = cmn.slice(), nmx = cmx.slice();
    nmn[a] += d; nmx[a] += d;
    const qmn = [Math.min(cmn[0], nmn[0]), Math.min(cmn[1], nmn[1]), Math.min(cmn[2], nmn[2])];
    const qmx = [Math.max(cmx[0], nmx[0]), Math.max(cmx[1], nmx[1]), Math.max(cmx[2], nmx[2])];
    const boxes = this.game.queryBoxes(qmn, qmx, null, true);
    let np = p[a] + d;
    let hit = null;
    const e = 1e-4;
    for (const b of boxes) {
      if (overlap(b, cmn, cmx, -e)) continue;
      if (!overlap(b, nmn, nmx, 0)) continue;
      if (d > 0) {
        const lim = b[a] - half[a] - e;
        if (lim < np) { np = lim; hit = b; }
      } else {
        const lim = b[a + 3] + half[a] + e;
        if (lim > np) { np = lim; hit = b; }
      }
    }
    p[a] = np;
    return hit;
  }
}

export function overlap(b, mn, mx, shrink) {
  return b[0] < mx[0] + shrink && b[3] > mn[0] - shrink &&
         b[1] < mx[1] + shrink && b[4] > mn[1] - shrink &&
         b[2] < mx[2] + shrink && b[5] > mn[2] - shrink;
}
