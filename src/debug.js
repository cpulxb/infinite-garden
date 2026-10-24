// 自动化测试工具：在控制台中以 window.__IGT 访问，用于脚本化地验证关卡可解
import { quat, v3, wrapDelta } from './core/math.js';

export function installTestKit(app) {
  const g = () => app.game;
  const T = {
    step(n = 1, dt = 1 / 60) {
      for (let i = 0; i < n; i++) {
        // 后台标签页会触发自动暂停；测试时强制保持游戏状态
        if (app.mode === 'pause') { app.mode = 'play'; app.ui.showHud(); }
        app.tick(dt);
      }
    },
    async wait(ms) { await new Promise((r) => setTimeout(r, ms)); },
    key(code, down = true) { if (down) app.input.keys.add(code); else app.input.keys.delete(code); },
    ev(name) { app.input.events.add(name); },
    // 让视线对准世界中的某一点（考虑当前重力姿态）
    lookAt(pt) {
      const p = g().player;
      const eye = p.eye();
      const d = v3.norm(wrapDelta(eye, pt, g().size));
      const inv = [-p.bodyQ[0], -p.bodyQ[1], -p.bodyQ[2], p.bodyQ[3]];
      const l = quat.rot(inv, d);
      p.yaw = Math.atan2(-l[0], -l[2]);
      p.pitch = Math.asin(Math.max(-1, Math.min(1, l[1])));
    },
    // 朝目标点水平行走，直到距离小于 tol 或超时
    walkTo(pt, tol = 0.35, maxFrames = 900, run = false) {
      const p = g().player;
      for (let i = 0; i < maxFrames; i++) {
        const d = wrapDelta(p.pos, pt, g().size);
        const up = p.up();
        const dot = v3.dot(d, up);
        const h = v3.madd(d, up, -dot);
        if (v3.len(h) < tol) { T.key('KeyW', false); T.key('ShiftLeft', false); return true; }
        T.lookAt(v3.add(p.eye(), h));
        p.pitch = 0;
        T.key('KeyW', true);
        if (run) T.key('ShiftLeft', true);
        T.step(1);
      }
      T.key('KeyW', false); T.key('ShiftLeft', false);
      return false;
    },
    settle(n = 90) { T.step(n); },
    state() {
      const G = g(), p = G.player;
      return {
        level: G.levelDef && G.levelDef.name, mode: app.mode, pos: p.pos.map((v) => +v.toFixed(2)), grav: p.grav,
        grounded: p.grounded, shifting: !!p.shift, held: G.held ? G.held.color : null,
        target: G.target ? { kind: G.target.kind, t: +G.target.t.toFixed(2), n: G.target.n } : null,
        sockets: G.mech.sockets.map((s) => [s.id, s.active]),
        doors: G.mech.doors.map((d) => [d.id, +d.t.toFixed(2)]),
        cubes: G.cubes.list.map((c) => [c.color, c.state, c.pos.map((v) => +v.toFixed(2))]),
        trees: G.trees.list.filter((t) => !t.def.deco).map((t) => [t.def.id, t.state]),
        completed: G.completed, water: G.water.present.size,
      };
    },
    teleport(pos, grav) {
      const p = g().player;
      if (grav !== undefined && grav !== p.grav) {
        p.tryShift(grav);
        T.step(60);
      }
      p.pos = pos.slice(); p.vel = [0, 0, 0];
      T.step(30);
    },
  };
  window.__IGT = T;
}
