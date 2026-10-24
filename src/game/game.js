// 游戏核心：关卡加载、碰撞查询、交互、动态几何、提示与相机
import { Builder, resolvePalette, M } from '../world/builder.js';
import { PALETTES } from '../world/palettes.js';
import { meshWorld } from '../render/mesher.js';
import { Batch } from '../render/batch.js';
import { Player, overlap } from './player.js';
import { CubeSystem } from './cubes.js';
import { Mechanisms } from './mechanisms.js';
import { Water } from './water.js';
import { TreeSystem } from './trees.js';
import * as C from './constants.js';
import { DIRS, opp, axisOf, signOf, v3, quat, wrapDelta, rayBox, hexToRgb, mod, clamp, lerp, rng, easeInOut } from '../core/math.js';

const GRAV_RGB = C.GRAV_HEX.map(hexToRgb);
const GRAV_255 = GRAV_RGB.map((c) => c.map((v) => Math.round(v * 255)));
const GRAV_F32 = new Float32Array(GRAV_RGB.flat());
const mix255 = (a, b, t) => [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
const WHITE = [255, 255, 255];
const easeOutBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

function boxOverlap(b, mn, mx, e = 0) {
  return b[0] < mx[0] - e && b[3] > mn[0] + e && b[1] < mx[1] - e && b[4] > mn[1] + e && b[2] < mx[2] - e && b[5] > mn[2] + e;
}

export class Game {
  constructor(app) {
    this.app = app;
    this.r = app.renderer;
    this.audio = app.audio;
    this.ui = app.ui;
    this.input = app.input;
    this.player = new Player(this);
    this.cubes = new CubeSystem(this);
    this.mech = new Mechanisms(this);
    this.water = new Water(this);
    this.trees = new TreeSystem(this);
    this.dyn = new Batch(16384);
    this.trans = new Batch(8192);
    this.time = 0;
    this.held = null;
    this.timers = [];
    this.flash = 0;
    this.flashColor = [1, 1, 1];
    this.partN = 240;
    this.particles = new Float32Array(this.partN * 4);
    const r = rng(1234);
    this.partSeed = [];
    for (let i = 0; i < this.partN; i++) this.partSeed.push([r(), r(), r(), (r() - 0.5) * 0.25, (r() - 0.3) * 0.18, (r() - 0.5) * 0.25, r()]);
    this.titleT = 0;
  }

  // ---------- 关卡 ----------
  load(def, index = -1) {
    const b = new Builder(def.size);
    def.build(b);
    this.levelDef = def;
    this.levelIndex = index;
    this.world = b.world;
    this.size = def.size.slice();
    this.palette = resolvePalette(PALETTES[def.palette]);
    this.pal = this.preparePalette(this.palette);
    const mesh = meshWorld(this.world, this.palette);
    this.r.setStatic(mesh, this.size);
    this.cubes.clear();
    for (const c of b.cubes) {
      const D = DIRS[c.color];
      const p = v3.madd([c.cell[0] + 0.5, c.cell[1] + 0.5, c.cell[2] + 0.5], D, 0.5 - C.CUBE_H - 0.001);
      this.cubes.add(c.color, p);
    }
    this.mech.load(b);
    this.trees.load(b);
    this.water.load(b);
    this.player.reset(b.spawn);
    this.held = null;
    this.flags = { shifted: false, picked: false, pickedColor: {}, denied: false, deniedShift: false, respawned: false };
    this.hintShown = new Set();
    this.lastHint = null;
    this.target = null;
    this.completed = false;
    this.timers = [];
    this.resetArm = 0;
    // 预先让水流稳定下来
    for (let i = 0; i < 400; i++) {
      this.water.tick();
      for (const p of this.water.present.values()) p.fill = 1;
      if (i > 4 && this.water.present.size === this.water.target.size) break;
    }
    // 初始方块落定（只针对与出生重力同色的方块）
    for (let i = 0; i < 90; i++) this.cubes.update(1 / 30);
    for (const c of this.cubes.list) c.appear = 1;
    this.audio.setMood(this.palette.music);
    this.ui.setLabel(def);
  }

  preparePalette(p) {
    const sky = p.sky;
    return {
      top: hexToRgb(sky.top), hor: hexToRgb(sky.hor), bot: hexToRgb(sky.bot), sun: hexToRgb(sky.sun),
      sunDir: v3.norm(sky.sunDir),
      water: [hexToRgb(p.water[0]), hexToRgb(p.water[1])],
      part: hexToRgb(p.part),
      panel: p.mats[M.PANEL].color,
      stone: p.mats[M.STONE].color,
      dark: p.mats[M.DARK].color,
      trim: p.mats[M.TRIM].color,
    };
  }

  // ---------- 碰撞查询 ----------
  shiftNear(b, c) {
    const S = this.size;
    const o = b.slice();
    for (let a = 0; a < 3; a++) {
      const k = Math.round(((b[a] + b[a + 3]) / 2 - c[a]) / S[a]);
      if (k) { o[a] -= k * S[a]; o[a + 3] -= k * S[a]; }
    }
    return o;
  }
  playerBox(p = this.player) {
    const h = p.half();
    return [p.pos[0] - h[0], p.pos[1] - h[1], p.pos[2] - h[2], p.pos[0] + h[0], p.pos[1] + h[1], p.pos[2] + h[2]];
  }
  queryBoxes(mn, mx, exclude, forPlayer, forCube) {
    const out = this.world.queryBoxes(mn, mx, []);
    const qc = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
    for (const d of this.mech.doors) {
      if (d.t >= 0.999 && d.passThroughOpen) continue;
      const b = this.shiftNear(d.box(), qc);
      if (boxOverlap(b, mn, mx)) { b.dyn = true; b.ref = d; out.push(b); }
    }
    for (const c of this.cubes.list) {
      if (c === exclude || c.state === 'held') continue;
      const b = this.shiftNear(c.box(), qc);
      if (boxOverlap(b, mn, mx)) { b.dyn = true; b.ref = c; out.push(b); }
    }
    if (forCube && !this.player.shift) {
      const b = this.shiftNear(this.playerBox(), qc);
      if (boxOverlap(b, mn, mx)) { b.dyn = true; b.ref = this.player; out.push(b); }
    }
    return out;
  }
  overlapsSolid(center, half, exclude) {
    const mn = [center[0] - half[0], center[1] - half[1], center[2] - half[2]];
    const mx = [center[0] + half[0], center[1] + half[1], center[2] + half[2]];
    const bs = this.queryBoxes(mn, mx, exclude, true, false);
    for (const b of bs) if (boxOverlap(b, mn, mx, 1e-3)) return true;
    return false;
  }
  boxBlocked(box, exclude, withPlayer = true) {
    const mn = [box[0], box[1], box[2]], mx = [box[3], box[4], box[5]];
    const bs = this.queryBoxes(mn, mx, exclude, false, withPlayer);
    for (const b of bs) if (boxOverlap(b, mn, mx, 1e-3)) return true;
    return false;
  }
  boxHasActor(box) {
    const c = [(box[0] + box[3]) / 2, (box[1] + box[4]) / 2, (box[2] + box[5]) / 2];
    const mn = [box[0], box[1], box[2]], mx = [box[3], box[4], box[5]];
    if (!this.player.shift && boxOverlap(this.shiftNear(this.playerBox(), c), mn, mx, 1e-3)) return true;
    for (const cb of this.cubes.list) {
      if (cb.state === 'held') continue;
      if (boxOverlap(this.shiftNear(cb.box(), c), mn, mx, 1e-3)) return true;
    }
    return false;
  }

  relToCam(pos) {
    const eye = this.player.eye();
    const d = wrapDelta(eye, pos, this.size);
    const dist = Math.hypot(d[0], d[1], d[2]);
    const right = quat.rot(this.player.camQ(), [1, 0, 0]);
    const pan = dist > 0.01 ? clamp(v3.dot(d, right) / dist, -1, 1) * 0.8 : 0;
    return { pan, gain: 1 / (1 + dist * 0.09), dist };
  }

  // ---------- 事件 ----------
  onWrap(a, delta) {
    if (this.held) this.held.pos[a] += delta;
  }
  onShiftDone() { this.audio.shiftDone(); }
  onCubeLanded(c) { this.mech.trySnap(c); }
  onTrigger() {}
  onTreeWatered() {}
  fellTooLong() {
    if (this.respawning) return;
    this.respawning = true;
    this.ui.fade(1, 450);
    this.after(0.5, () => {
      if (this.held) { this.cubes.release(this.held); this.held.pos = this.held.spawn.slice(); this.held.appear = 0; this.held = null; }
      this.player.restore(this.player.lastSafe);
      this.flags.respawned = true;
      this.audio.respawn();
      this.ui.fade(0, 900);
      this.respawning = false;
    });
  }
  after(t, fn) { this.timers.push({ t, fn }); }

  // ---------- 交互 ----------
  computeTarget() {
    const p = this.player;
    const eye = p.eye(), dir = p.look();
    let best = null;
    const hs = this.world.raycast(eye, dir, 14);
    if (hs) best = { t: hs.t, kind: 'static', n: hs.n };
    for (const d of this.mech.doors) {
      const b = this.shiftNear(d.box(), eye);
      const h = rayBox(eye, dir, [b[0], b[1], b[2]], [b[3], b[4], b[5]], best ? best.t : 14);
      if (h) best = { t: h.t, kind: 'door', n: h.n, ref: d };
    }
    for (const c of this.cubes.list) {
      if (c.state === 'held') continue;
      const b = this.shiftNear(c.box(), eye);
      const h = rayBox(eye, dir, [b[0], b[1], b[2]], [b[3], b[4], b[5]], best ? best.t : 14);
      if (h) best = { t: h.t, kind: 'cube', n: h.n, ref: c };
    }
    this.target = best;
    this.socketTarget = null;
    if (this.held) {
      let bs = null, bt = C.REACH_SOCKET;
      for (const s of this.mech.sockets) {
        if (s.cube || s.color !== this.held.color) continue;
        const b = this.shiftNear(s.box(), eye);
        const h = rayBox(eye, dir, [b[0], b[1], b[2]], [b[3], b[4], b[5]], bt);
        if (h && (!best || h.t <= best.t + 0.6)) { bt = h.t; bs = s; }
        // 也允许直接看向插槽所在的表面
        if (!bs && best && best.kind === 'static' && best.t < C.REACH_SOCKET + 0.5) {
          const hp = v3.madd(eye, dir, best.t);
          const d2 = wrapDelta(hp, s.surface, this.size);
          if (Math.hypot(...d2) < 0.75) bs = s;
        }
      }
      this.socketTarget = bs;
    }
  }

  interact() {
    const p = this.player;
    if (p.shift) return;
    if (this.held) {
      const c = this.held;
      if (this.socketTarget) {
        // 放入插槽：先把方块移到插槽附近的同一镜像
        this.held = null;
        const s = this.socketTarget;
        c.state = 'free';
        this.mech.seat(c, s, 0.3);
        this.audio.drop();
        return;
      }
      const tgt = this.heldTarget(c);
      if (!this.boxBlocked(c.box(tgt), c, true)) c.pos = tgt;
      else if (this.boxBlocked(c.box(), c, true)) { this.audio.deny(); return; }
      this.held = null;
      for (let a = 0; a < 3; a++) c.pos[a] = mod(c.pos[a], this.size[a]);
      this.cubes.release(c);
      this.audio.drop();
      return;
    }
    const t = this.target;
    if (t && t.kind === 'cube' && t.t <= C.REACH_GRAB + 0.4) {
      const c = t.ref;
      if (c.color !== p.grav) {
        this.audio.deny();
        this.flags.denied = true;
        return;
      }
      if (c.socket) this.mech.unseat(c);
      c.state = 'held';
      c.slide = null;
      c.vel = 0;
      // 把方块坐标挪到离眼睛最近的镜像，方便平滑跟随
      const eye = p.eye();
      const d = wrapDelta(eye, c.pos, this.size);
      c.pos = v3.add(eye, d);
      this.held = c;
      this.flags.picked = true;
      this.flags.pickedColor[c.color] = true;
      this.audio.pickup(c.color);
    }
  }

  shiftGravity() {
    const p = this.player;
    if (p.shift) return;
    if (this.held) {
      this.audio.deny();
      this.flags.deniedShift = true;
      this.ui.hint('手持方块时无法改变重力。', 4);
      return;
    }
    const t = this.target;
    if (t && (t.kind === 'static' || t.kind === 'door') && t.t <= C.REACH_SHIFT && t.n !== opp(p.grav)) {
      const ng = opp(t.n);
      if (ng !== p.grav && p.tryShift(ng)) {
        this.audio.shift(ng);
        this.flags.shifted = true;
        this.flashColor = GRAV_RGB[ng];
        return;
      }
    }
    this.audio.deny();
  }

  // 手持方块：贴着准星所指的表面悬停（沿表面法线推出），放不下时尝试网格对齐或后退
  heldTarget(c) {
    const p = this.player;
    const eye = p.eye(), dir = p.look();
    const hs = this.world.raycast(eye, dir, C.HOLD_DIST + 0.5);
    let base = hs
      ? v3.madd(v3.madd(eye, dir, hs.t), DIRS[hs.n], C.CUBE_H + 0.03)
      : v3.madd(eye, dir, C.HOLD_DIST);
    if (v3.dist(base, eye) < 0.75) base = v3.madd(eye, dir, 0.75);
    const ga = axisOf(c.color);
    const snap = base.map((v, a) => (a === ga ? v : Math.floor(v) + 0.5));
    const cands = [base, snap];
    const d0 = v3.dist(base, eye);
    for (let k = 1; k <= 7; k++) cands.push(v3.madd(eye, dir, Math.max(0.7, d0 - k * 0.15)));
    for (const q of cands) if (!this.boxBlocked(c.box(q), c, false)) return q;
    return cands[cands.length - 1];
  }

  updateHeld(dt) {
    const c = this.held;
    if (!c) return;
    const tgt = this.heldTarget(c);
    const k = 1 - Math.exp(-dt * 22);
    c.pos = v3.lerp(c.pos, tgt, k);
  }

  crosshair() {
    const p = this.player;
    this.shiftHint = null;
    const tips = this.levelIndex >= 0 && this.levelIndex < 4 && this.app.settings.hints;
    if (p.shift) { this.ui.setCrosshair('none'); this.ui.setTip(''); return; }
    if (this.held) {
      if (this.socketTarget) { this.ui.setCrosshair('place', C.GRAV_HEX[this.held.color]); this.ui.setTip(tips ? '左键 · 放入插槽' : ''); }
      else { this.ui.setCrosshair('hold', C.GRAV_HEX[this.held.color]); this.ui.setTip(tips ? '左键 · 放下' : ''); }
      return;
    }
    const t = this.target;
    if (t && t.kind === 'cube' && t.t <= C.REACH_GRAB + 0.4) {
      if (t.ref.color === p.grav) { this.ui.setCrosshair('grab', C.GRAV_HEX[t.ref.color]); this.ui.setTip(tips ? '左键 · 拿起' : ''); }
      else { this.ui.setCrosshair('nograb', C.GRAV_HEX[t.ref.color]); this.ui.setTip(tips ? `它属于${C.GRAV_DESC[t.ref.color]}` : ''); }
      return;
    }
    if (t && t.kind !== 'cube' && t.n !== opp(p.grav)) {
      const ng = opp(t.n);
      if (t.t <= C.REACH_SHIFT) {
        this.shiftHint = { pt: v3.madd(p.eye(), p.look(), t.t), n: t.n, g: ng };
        this.ui.setCrosshair('shift', C.GRAV_HEX[ng]);
        this.ui.setTip(tips ? `右键 · ${C.GRAV_DESC[ng]}` : '');
        return;
      }
      if (t.t <= C.REACH_SHIFT + 4) { this.ui.setCrosshair('far', C.GRAV_HEX[ng]); this.ui.setTip(''); return; }
    }
    this.ui.setCrosshair('none');
    this.ui.setTip('');
  }

  hintCtx() {
    return { p: this.player, flags: this.flags, holding: !!this.held, mech: this.mech, trees: this.trees, time: this.time, game: this };
  }
  updateHints() {
    const hs = this.levelDef.hints || [];
    const G = this.hintCtx();
    for (let i = 0; i < hs.length; i++) {
      if (this.hintShown.has(i)) continue;
      let ok = false;
      try { ok = hs[i].when(G); } catch (e) { ok = false; }
      if (ok) {
        this.hintShown.add(i);
        this.lastHint = hs[i];
        this.ui.hint(hs[i].text, hs[i].dur || 9);
        break;
      }
    }
  }

  // ---------- 主更新 ----------
  update(dt) {
    this.time += dt;
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const tm = this.timers[i];
      tm.t -= dt;
      if (tm.t <= 0) { this.timers.splice(i, 1); tm.fn(); }
    }
    const inp = this.input;
    const p = this.player;
    const s = this.app.settings;
    const [lx, ly] = inp.look();
    const sens = 0.0022 * s.sens;
    p.look2(lx * sens, ly * sens * (s.invertY ? -1 : 1));
    const mv = inp.move();
    const pin = { mx: mv.mx, mz: mv.mz, run: mv.run, jump: inp.consume('jump') };
    if (this.respawning || this.completed) { pin.mx = 0; pin.mz = 0; pin.jump = false; }

    this.computeTarget();
    if (!this.completed) {
      if (inp.consume('interact')) this.interact();
      if (inp.consume('shift')) this.shiftGravity();
    }
    if (inp.consume('hint') && this.lastHint) this.ui.hint(this.lastHint.text, 9);
    if (inp.consume('reset')) {
      if (this.resetArm > 0) { this.app.action('reset'); return; }
      this.resetArm = 2.2;
      this.ui.hint('再按一次 <b>R</b> 重置此庭院。', 2.2);
    }
    this.resetArm = Math.max(0, this.resetArm - dt);

    p.update(dt, pin);
    this.updateHeld(dt);
    this.cubes.update(dt);
    this.mech.update(dt);
    this.trees.update(dt);
    this.water.update(dt);
    this.crosshair();
    this.updateHints();
    this.ui.setGrav(p.shift ? p.shift.newGrav : p.grav);

    // 光门
    if (!this.completed && !p.shift) {
      const pb = this.playerBox();
      const pc = p.pos;
      for (const po of this.mech.portals) {
        if (!po.active) continue;
        const b = this.shiftNear([...po.min, ...po.max], pc);
        if (boxOverlap(b, [pb[0], pb[1], pb[2]], [pb[3], pb[4], pb[5]])) {
          this.completed = true;
          this.audio.portal();
          this.app.onLevelComplete();
          break;
        }
      }
    }

    // 翻转时的色彩闪光
    if (p.shift) this.flash = Math.sin(Math.PI * Math.min(1, p.shift.t)) * 0.1;
    else this.flash = Math.max(0, this.flash - dt * 0.6);

    const vg = p.vel[axisOf(p.grav)] * signOf(p.grav);
    this.audio.update(dt, { waterDist: this.water.nearest, fallSpeed: p.grounded ? 0 : vg });
  }

  // 标题画面：缓慢环绕的相机
  updateTitle(dt) {
    this.time += dt;
    this.titleT += dt;
    this.cubes.update(dt);
    this.trees.update(dt);
    this.water.update(dt);
    this.audio.update(dt, { waterDist: 40, fallSpeed: 0 });
  }

  titleCamera() {
    const t = this.titleT;
    const S = this.size;
    const c = [S[0] / 2, 22, S[2] / 2];
    const a = t * 0.04 + 2.2;
    const R = 19 + Math.sin(t * 0.07) * 2;
    const pos = [c[0] + Math.cos(a) * R, c[1] + 7 + Math.sin(t * 0.09) * 3, c[2] + Math.sin(a) * R];
    const look = [c[0] + Math.sin(t * 0.05) * 2, c[1] - 1, c[2]];
    const fwd = v3.norm(v3.sub(look, pos));
    // 每隔一段时间，相机绕视线缓缓翻转 90°，暗示重力的转换
    const cyc = 26, k = (t % cyc) / cyc;
    const step = Math.floor(t / cyc);
    const roll = (step + easeInOut(clamp((k - 0.72) / 0.22, 0, 1))) * (Math.PI / 2);
    let up0 = [0, 1, 0];
    let right = v3.norm(v3.cross(fwd, up0));
    let up = v3.cross(right, fwd);
    const cr = Math.cos(roll), sr = Math.sin(roll);
    const r2 = v3.add(v3.scale(right, cr), v3.scale(up, sr));
    const u2 = v3.add(v3.scale(up, cr), v3.scale(right, -sr));
    const q = quat.fromBasis(r2, u2, v3.scale(fwd, -1));
    return { pos, q, up: u2 };
  }

  // ---------- 动态几何 ----------
  buildDynamic() {
    const B = this.dyn;
    B.reset();
    for (const c of this.cubes.list) this.drawCube(B, c);
    for (const s of this.mech.sockets) this.drawSocket(B, s);
    for (const d of this.mech.doors) this.drawDoor(B, d);
    for (const p of this.mech.portals) this.drawPortal(B, p);
    this.trees.build(B, this.time);
    if (this.shiftHint && this.levelIndex >= 0) this.drawShiftHint(B, this.shiftHint);
  }

  // 准星所指、可转向的表面：画一个随重力颜色脉动的方框
  drawShiftHint(B, h) {
    const a = axisOf(h.n);
    const c = h.pt.slice();
    for (let k = 0; k < 3; k++) if (k !== a) c[k] = Math.floor(c[k]) + 0.5;
    c[a] = Math.round(c[a]);
    const col = mix255(GRAV_255[h.g], WHITE, 0.35);
    const w = 0.06, r = 0.5;
    this.surfBox(B, c, h.n, -r, r, r - w, r, 0.004, 0.012, col, 150, 10, 0);
    this.surfBox(B, c, h.n, -r, r, -r, -r + w, 0.004, 0.012, col, 150, 10, 0);
    this.surfBox(B, c, h.n, r - w, r, -r + w, r - w, 0.004, 0.012, col, 150, 10, 0);
    this.surfBox(B, c, h.n, -r, -r + w, -r + w, r - w, 0.004, 0.012, col, 150, 10, 0);
  }

  drawCube(B, c) {
    const s = C.CUBE_H * Math.max(0.001, easeOutBack(Math.min(1, c.appear)));
    const p = c.pos;
    const col = GRAV_255[c.color];
    const active = c.glow;
    const seated = c.state === 'socket' && !c.slide;
    const body = mix255(mix255(col, [120, 120, 125], 0.35 * (1 - active)), [30, 30, 30], 0.18);
    const id = 2 + (c.id % 180);
    B.box(p[0] - s, p[1] - s, p[2] - s, p[0] + s, p[1] + s, p[2] + s, body, 0, 4, id);
    const pc = mix255(col, WHITE, seated ? 0.45 : 0.16 + 0.1 * active);
    const em = seated ? 230 : c.state === 'held' ? 30 : Math.round(25 + 70 * active);
    const i = s * 0.62, o = 0.022;
    B.box(p[0] + s, p[1] - i, p[2] - i, p[0] + s + o, p[1] + i, p[2] + i, pc, em, 5, 230, 1);
    B.box(p[0] - s - o, p[1] - i, p[2] - i, p[0] - s, p[1] + i, p[2] + i, pc, em, 5, 230, 2);
    B.box(p[0] - i, p[1] + s, p[2] - i, p[0] + i, p[1] + s + o, p[2] + i, pc, em, 5, 230, 4);
    B.box(p[0] - i, p[1] - s - o, p[2] - i, p[0] + i, p[1] - s, p[2] + i, pc, em, 5, 230, 8);
    B.box(p[0] - i, p[1] - i, p[2] + s, p[0] + i, p[1] + i, p[2] + s + o, pc, em, 5, 230, 16);
    B.box(p[0] - i, p[1] - i, p[2] - s - o, p[0] + i, p[1] + i, p[2] - s, pc, em, 5, 230, 32);
  }

  // 贴着表面的盒子：n 为表面外法线方向，u/v 为切向范围，h 为离表面高度范围
  surfBox(B, center, n, u0, u1, v0, v1, h0, h1, col, em, fx, id) {
    const a = axisOf(n), sg = signOf(n);
    const ua = (a + 1) % 3, va = (a + 2) % 3;
    const mn = [0, 0, 0], mx = [0, 0, 0];
    mn[ua] = center[ua] + u0; mx[ua] = center[ua] + u1;
    mn[va] = center[va] + v0; mx[va] = center[va] + v1;
    if (sg > 0) { mn[a] = center[a] + h0; mx[a] = center[a] + h1; }
    else { mn[a] = center[a] - h1; mx[a] = center[a] - h0; }
    B.box(mn[0], mn[1], mn[2], mx[0], mx[1], mx[2], col, em, fx, id);
  }

  drawSocket(B, s) {
    const n = opp(s.color);
    const col = GRAV_255[s.color];
    const c = s.surface;
    const g = s.glow;
    const em = Math.round(60 + 170 * g + 80 * s.pulse);
    const fx = g > 0.5 ? 0 : 10;
    const fc = mix255(col, WHITE, 0.15 + 0.3 * g);
    const h1 = 0.06;
    this.surfBox(B, c, n, -0.5, 0.5, 0.4, 0.5, 0, h1, fc, em, fx, 231);
    this.surfBox(B, c, n, -0.5, 0.5, -0.5, -0.4, 0, h1, fc, em, fx, 231);
    this.surfBox(B, c, n, 0.4, 0.5, -0.4, 0.4, 0, h1, fc, em, fx, 231);
    this.surfBox(B, c, n, -0.5, -0.4, -0.4, 0.4, 0, h1, fc, em, fx, 231);
    const plate = mix255(this.pal.dark, col, 0.35 + 0.3 * g);
    this.surfBox(B, c, n, -0.32, 0.32, -0.32, 0.32, 0, 0.018, plate, Math.round(40 * g), 0, 232);
  }

  drawDoor(B, d) {
    const b = d.box();
    const col = d.mat === M.STONE ? this.pal.stone : this.pal.panel;
    B.box(b[0], b[1], b[2], b[3], b[4], b[5], col, 0, 9, 233);
    // 指示灯：显示每个所需触发器的状态
    const ext = [b[3] - b[0], b[4] - b[1], b[5] - b[2]];
    let ta = 0;
    for (let a = 1; a < 3; a++) if (ext[a] < ext[ta]) ta = a;
    const others = [0, 1, 2].filter((a) => a !== ta);
    const la = ext[others[0]] >= ext[others[1]] ? others[0] : others[1];
    const oa = others[0] === la ? others[1] : others[0];
    const n = d.requires.length;
    const spacing = Math.min(0.7, (ext[la] - 0.4) / Math.max(1, n));
    for (let i = 0; i < n; i++) {
      const id = d.requires[i];
      const on = this.mech.isActive(id);
      const tc = this.mech.triggerColor(id);
      const lc = tc >= 0 ? GRAV_255[tc] : [90, 190, 230];
      const colL = on ? mix255(lc, WHITE, 0.2) : mix255(lc, [60, 60, 60], 0.55);
      const em = on ? 255 : 0;
      const cl = (b[la] + b[la + 3]) / 2 + (i - (n - 1) / 2) * spacing;
      const co = b[oa] + ext[oa] * 0.72;
      for (const side of [-1, 1]) {
        const mn = [0, 0, 0], mx = [0, 0, 0];
        mn[la] = cl - 0.13; mx[la] = cl + 0.13;
        mn[oa] = co - 0.13; mx[oa] = co + 0.13;
        if (side > 0) { mn[ta] = b[ta + 3]; mx[ta] = b[ta + 3] + 0.03; }
        else { mn[ta] = b[ta] - 0.03; mx[ta] = b[ta]; }
        B.box(mn[0], mn[1], mn[2], mx[0], mx[1], mx[2], colL, em, 0, 234);
      }
    }
  }

  drawPortal(B, p) {
    const a = axisOf(p.axis);
    const mn = p.min.slice(), mx = p.max.slice();
    const c = (mn[a] + mx[a]) / 2;
    mn[a] = c - 0.05; mx[a] = c + 0.05;
    for (let k = 0; k < 3; k++) if (k !== a) { mn[k] += 0.04; mx[k] -= 0.04; }
    const g = p.glow;
    const col = mix255(this.pal.trim, WHITE, 0.6);
    B.box(mn[0], mn[1], mn[2], mx[0], mx[1], mx[2], col, Math.round(40 + 215 * g), 6, 250);
  }

  // 接触阴影
  decal(T, center, n, s1, s2, alpha) {
    const a = axisOf(n), sg = signOf(n);
    const ua = (a + 1) % 3, va = (a + 2) % 3;
    const P = (u, v) => { const p = center.slice(); p[ua] += u; p[va] += v; p[a] += sg * 0.006; return p; };
    const A = Math.round(clamp(alpha, 0, 1) * 255);
    const ring = [[-s1, -s1], [s1, -s1], [s1, s1], [-s1, s1]];
    const outer = [[-s2, -s2], [s2, -s2], [s2, s2], [-s2, s2]];
    T.ensure(30);
    const tri = (p0, a0, p1, a1, p2, a2) => {
      const pts = sg > 0 ? [[p0, a0], [p1, a1], [p2, a2]] : [[p0, a0], [p2, a2], [p1, a1]];
      for (const [p, al] of pts) T.vert(p[0], p[1], p[2], 0, 0, 0, al, n, 6, 3, 0);
    };
    const r = ring.map(([u, v]) => P(u, v)), o = outer.map(([u, v]) => P(u, v));
    tri(r[0], A, r[1], A, r[2], A);
    tri(r[0], A, r[2], A, r[3], A);
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      tri(o[i], 0, o[j], 0, r[j], A);
      tri(o[i], 0, r[j], A, r[i], A);
    }
  }

  // 手持方块时：沿其重力方向画一条细线，指出松手后的落点
  plumb(T, c) {
    const ga = axisOf(c.color), D = DIRS[c.color];
    const start = c.pos.map((v, a) => (a === ga ? v : Math.floor(v) + 0.5));
    const from = v3.madd(start, D, C.CUBE_H);
    const h = this.world.raycast(from, D, 48);
    if (!h || h.t < 0.05) return;
    const col = mix255(GRAV_255[c.color], WHITE, 0.5);
    const len = h.t;
    const a = ga, ua = (a + 1) % 3, va = (a + 2) % 3;
    const w = 0.025;
    const P = (u, v, t) => { const p = from.slice(); p[ua] += u; p[va] += v; p[a] += D[a] * t; return p; };
    const A0 = 120, A1 = 25;
    T.ensure(48);
    const quads = [[[-w, 0], [w, 0]], [[0, -w], [0, w]]];
    for (const [[u0, v0], [u1, v1]] of quads) {
      const tri = [[P(u0, v0, 0), A0], [P(u1, v1, 0), A0], [P(u1, v1, len), A1], [P(u0, v0, 0), A0], [P(u1, v1, len), A1], [P(u0, v0, len), A1]];
      for (const [p, al] of tri) T.vert(p[0], p[1], p[2], col[0], col[1], col[2], al, c.color, 6, 5, 0);
    }
    // 落点方框
    const land = v3.madd(from, D, len);
    const n = h.n, na = axisOf(n);
    const r = 0.42, bw = 0.05;
    const Q = (u, v) => { const p = land.slice(); const qa = (na + 1) % 3, qv = (na + 2) % 3; p[qa] += u; p[qv] += v; p[na] += signOf(n) * 0.01; return p; };
    const bars = [[-r, r, r - bw, r], [-r, r, -r, -r + bw], [r - bw, r, -r, r], [-r, -r + bw, -r, r]];
    for (const [u0, u1, v0, v1] of bars) {
      const tri = [Q(u0, v0), Q(u1, v0), Q(u1, v1), Q(u0, v0), Q(u1, v1), Q(u0, v1)];
      for (const p of tri) T.vert(p[0], p[1], p[2], col[0], col[1], col[2], 150, n, 6, 5, 0);
    }
  }

  // 激活插槽上方的光柱（底部亮、顶部渐隐）
  beam(T, s) {
    const n = opp(s.color);
    const a = axisOf(n), sg = signOf(n);
    const ua = (a + 1) % 3, va = (a + 2) % 3;
    const c = s.surface;
    const col = mix255(GRAV_255[s.color], WHITE, 0.35);
    const h = 0.6 + 2.6 * s.glow + s.pulse * 1.2;
    const w = 0.34 + 0.12 * s.pulse;
    const A = Math.round(clamp(0.22 * s.glow + 0.35 * s.pulse, 0, 1) * 255);
    const P = (u, v, hh) => { const p = c.slice(); p[ua] += u; p[va] += v; p[a] += sg * hh; return p; };
    const corners = [[-w, -w], [w, -w], [w, w], [-w, w]];
    T.ensure(24);
    for (let i = 0; i < 4; i++) {
      const [u0, v0] = corners[i], [u1, v1] = corners[(i + 1) % 4];
      const b0 = P(u0, v0, 0.05), b1 = P(u1, v1, 0.05), t1 = P(u1, v1, h), t0 = P(u0, v0, h);
      const tri = [[b0, A], [b1, A], [t1, 0], [b0, A], [t1, 0], [t0, 0]];
      for (const [p, al] of tri) T.vert(p[0], p[1], p[2], col[0], col[1], col[2], al, n, 6, 5, 0);
    }
  }

  buildTrans() {
    const T = this.trans;
    T.reset();
    for (const c of this.cubes.list) {
      if (c.appear < 0.3) continue;
      const D = DIRS[c.color];
      const start = v3.madd(c.pos, D, C.CUBE_H - 0.05);
      const h = this.world.raycast(start, D, 9);
      if (!h) continue;
      const t = h.t + C.CUBE_H - 0.05 - C.CUBE_H;
      const pt = v3.madd(start, D, h.t);
      const k = clamp(1 - t / 9, 0, 1);
      const s = 0.42 + t * 0.04;
      this.decal(T, pt, h.n, s * 0.8, s * 1.45, 0.42 * k * k);
    }
    for (const s of this.mech.sockets) if (s.glow > 0.02) this.beam(T, s);
    if (this.held) this.plumb(T, this.held);
    this.transShadowCount = T.count;
    this.water.build(T);
  }

  updateParticles(cam) {
    const S = this.size;
    const F = [S[0] / 2, S[1] / 2, S[2] / 2];
    const t = this.time;
    const P = this.particles;
    for (let i = 0; i < this.partN; i++) {
      const s = this.partSeed[i];
      for (let a = 0; a < 3; a++) {
        const v = s[a] * F[a] + s[3 + a] * t;
        P[i * 4 + a] = cam[a] + mod(v - cam[a] + F[a] / 2, F[a]) - F[a] / 2;
      }
      P[i * 4 + 3] = s[6];
    }
  }

  // ---------- 渲染 ----------
  render(cam) {
    const s = this.app.settings;
    const pal = this.palette, pp = this.pal;
    this.buildDynamic();
    this.buildTrans();
    this.updateParticles(cam.pos);
    const repeatK = [0.55, 0.75, 1, 1.25][Math.round(s.repeat) - 1] ?? 1;
    const fogStart = pal.fog.start * repeatK * (cam.fogMul || 1);
    const fogScale = pal.fog.scale * repeatK * (cam.fogMul || 1);
    const fogPow = pal.fog.power;
    const fogEnd = fogStart + fogScale * Math.pow(-Math.log(0.015), 1 / fogPow);
    const minS = Math.min(...this.size);
    const R = Math.min(cam.maxR || 5, Math.max(1, Math.ceil(fogEnd / minS)));
    const g = this.player.shift ? this.player.shift.newGrav : this.player.grav;
    const gc = GRAV_RGB[g];
    const hor = v3.lerp(pp.hor, gc, cam.tintSky ?? 0.05);
    const sunDir = quat.rot(cam.bodyQ, pp.sunDir);
    this.r.draw({
      camPos: cam.pos, camQ: cam.q, fov: cam.fov, far: Math.max(400, fogEnd + 60), time: this.time,
      repeat: R, fogEnd,
      gravColors: GRAV_F32, tint: pal.tint, faceLight: pal.face, aoStr: pal.aoStr, amb: v3.lerp(pp.top, pp.hor, 0.35),
      dyn: this.dyn, trans: this.trans, transShadowCount: this.transShadowCount,
      particles: this.particles, particleCount: this.partN, partCol: pp.part,
      sky: { top: pp.top, hor, bot: pp.bot, sunDir, sunCol: pp.sun },
      bodyUp: cam.up, fog: [fogStart, fogScale, fogPow, 1], edge: pal.edge,
      water: pp.water, bloom: pal.bloom, bloomThresh: pal.bloomThresh,
      flash: [this.flashColor[0], this.flashColor[1], this.flashColor[2], this.flash + (cam.flash || 0)],
      grade: pal.grade, grain: pal.grain,
    });
  }

  playCamera() {
    const p = this.player;
    const s = this.app.settings;
    const q = p.camQ();
    const bodyQ = p.shift ? quat.slerp(p.shift.fromBody, p.shift.newBody, easeInOut(Math.min(1, p.shift.t))) : p.bodyQ;
    const fov = (s.fov + p.speedFov * 9 + (p.shift ? Math.sin(Math.PI * p.shift.t) * 6 : 0)) * Math.PI / 180;
    return { pos: p.eye(), q, up: p.bodyUp(), bodyQ, fov };
  }
}
