// 插槽、门、光门、水池：触发器网络
import { DIRS, axisOf, v3, wrapDelta, smooth } from '../core/math.js';
import * as C from './constants.js';

export class Socket {
  constructor(def) {
    this.id = def.id;
    this.color = def.color;
    this.cell = def.cell;
    const g = DIRS[def.color];
    const c = [def.cell[0] + 0.5, def.cell[1] + 0.5, def.cell[2] + 0.5];
    this.seat = v3.madd(c, g, 0.5 - C.CUBE_H - 0.001);
    this.surface = v3.madd(c, g, 0.5); // 表面中心
    this.cube = null;
    this.active = false;
    this.glow = 0;
    this.pulse = 0;
  }
  box() {
    const c = this.cell;
    return [c[0], c[1], c[2], c[0] + 1, c[1] + 1, c[2] + 1];
  }
}

export class Door {
  constructor(def) {
    Object.assign(this, def);
    this.t = 0;
    this.want = false;
    this.moving = false;
  }
  offsetNow() {
    const e = smooth(this.t);
    return [this.open[0] * e, this.open[1] * e, this.open[2] * e];
  }
  boxAt(t) {
    const e = smooth(t);
    const o = [this.open[0] * e, this.open[1] * e, this.open[2] * e];
    return [this.min[0] + o[0], this.min[1] + o[1], this.min[2] + o[2], this.max[0] + o[0], this.max[1] + o[1], this.max[2] + o[2]];
  }
  box() { return this.boxAt(this.t); }
}

export class Mechanisms {
  constructor(game) {
    this.game = game;
    this.sockets = [];
    this.doors = [];
    this.portals = [];
    this.basins = [];
    this.trig = new Map();
  }
  load(level) {
    this.sockets = level.sockets.map((s) => new Socket(s));
    this.doors = level.doors.map((d) => new Door(d));
    this.portals = level.portals.map((p) => ({ ...p, active: false, glow: 0 }));
    this.basins = level.basins.map((b) => ({ ...b, active: false }));
    this.trig.clear();
  }

  isActive(id) {
    const s = this.sockets.find((x) => x.id === id);
    if (s) return s.active;
    const b = this.basins.find((x) => x.id === id);
    if (b) return b.active;
    const t = this.game.trees.list.find((x) => x.def.id === id);
    if (t) return t.grown >= 1;
    const d = this.doors.find((x) => x.id === id);
    if (d) return d.t > 0.98;
    return false;
  }

  // 触发器颜色（用于门上的指示灯）
  triggerColor(id) {
    const s = this.sockets.find((x) => x.id === id);
    if (s) return s.color;
    const t = this.game.trees.list.find((x) => x.def.id === id);
    if (t) return t.def.color;
    return -1; // 水
  }

  update(dt) {
    const g = this.game;
    for (const s of this.sockets) {
      const was = s.active;
      s.active = !!(s.cube && s.cube.state === 'socket' && !s.cube.slide);
      if (s.active && !was) { g.audio.socketOn(s.color, g.relToCam(s.seat)); s.pulse = 1; g.onTrigger(s.id); }
      if (!s.active && was) g.audio.socketOff(g.relToCam(s.seat));
      s.glow += ((s.active ? 1 : 0) - s.glow) * Math.min(1, dt * 4);
      s.pulse = Math.max(0, s.pulse - dt * 1.2);
    }
    for (const d of this.doors) {
      const want = d.any ? d.requires.some((id) => this.isActive(id)) : d.requires.every((id) => this.isActive(id));
      if (want !== d.want) {
        d.want = want;
        g.audio.door(want, g.relToCam(v3.scale(v3.add(d.min, d.max), 0.5)));
      }
      const speed = dt / 1.8;
      if (want && d.t < 1) d.t = Math.min(1, d.t + speed);
      else if (!want && d.t > 0) {
        const nt = Math.max(0, d.t - speed);
        // 关门时不能夹住玩家或方块
        if (!g.boxHasActor(d.boxAt(nt))) d.t = nt;
      }
    }
    for (const p of this.portals) {
      p.active = p.requires.every((id) => this.isActive(id));
      p.glow += ((p.active ? 1 : 0) - p.glow) * Math.min(1, dt * 2);
    }
  }

  // 尝试把落定的方块吸入附近插槽
  trySnap(cube) {
    const g = this.game;
    const ga = axisOf(cube.color);
    let best = null, bd = 1e9;
    for (const s of this.sockets) {
      if (s.color !== cube.color || s.cube) continue;
      const d = wrapDelta(cube.pos, s.seat, g.size);
      if (Math.abs(d[ga]) > 0.06) continue;
      const tang = Math.hypot(...[0, 1, 2].filter((a) => a !== ga).map((a) => d[a]));
      if (tang < 1.45 && tang < bd) { bd = tang; best = s; }
    }
    if (!best) return false;
    this.seat(cube, best, 0.35);
    return true;
  }

  seat(cube, s, dur = 0.28) {
    const g = this.game;
    s.cube = cube;
    cube.state = 'socket';
    cube.socket = s;
    cube.vel = 0;
    const d = wrapDelta(cube.pos, s.seat, g.size);
    cube.slide = { from: cube.pos.slice(), to: v3.add(cube.pos, d), t: 0, dur };
  }

  unseat(cube) {
    if (cube.socket) { cube.socket.cube = null; cube.socket = null; }
  }
}
