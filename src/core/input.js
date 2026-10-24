// 输入：键盘、鼠标（指针锁定）与触屏虚拟摇杆
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.dx = 0; this.dy = 0;
    this.events = new Set();
    this.locked = false;
    this.touch = { active: false, mx: 0, mz: 0, lookId: null, moveId: null, lx: 0, ly: 0, ox: 0, oy: 0 };
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.enabled = true;

    addEventListener('keydown', (e) => {
      if (e.repeat) { if (['Space'].includes(e.code)) e.preventDefault(); return; }
      this.keys.add(e.code);
      const map = {
        KeyE: 'interact', KeyF: 'shift', Space: 'jump', KeyR: 'reset', Escape: 'pause',
        KeyH: 'hint', KeyP: 'pause', Tab: 'pause', Backquote: 'debug',
      };
      if (map[e.code]) this.events.add(map[e.code]);
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('mousedown', (e) => {
      if (this.isTouchEvent) return;
      if (!this.locked) { this.events.add('click'); return; }
      if (e.button === 0) this.events.add('interact');
      if (e.button === 2) this.events.add('shift');
    });
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // 过滤偶发的超大跳变
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
      this.dx += e.movementX; this.dy += e.movementY;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) this.events.add('unlocked');
    });
    this.setupTouch();
  }

  lock() {
    if (this.isTouch) return;
    try {
      const r = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (r && r.catch) r.catch(() => { try { this.canvas.requestPointerLock(); } catch (e) {} });
    } catch (e) {
      try { this.canvas.requestPointerLock(); } catch (e2) {}
    }
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  consume(name) {
    if (this.events.has(name)) { this.events.delete(name); return true; }
    return false;
  }
  clearEvents() { this.events.clear(); this.dx = 0; this.dy = 0; }

  move() {
    const k = this.keys;
    let mx = 0, mz = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) mz += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) mz -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
    if (this.touch.moveId !== null) { mx += this.touch.mx; mz += this.touch.mz; }
    return { mx, mz, run: k.has('ShiftLeft') || k.has('ShiftRight') || this.touch.run };
  }
  look() {
    const r = [this.dx, this.dy];
    this.dx = 0; this.dy = 0;
    return r;
  }

  setupTouch() {
    const ui = document.getElementById('touch');
    if (!ui) return;
    if (!this.isTouch) { ui.hidden = true; return; }
    const stick = document.getElementById('stick'), knob = document.getElementById('knob');
    const T = this.touch;
    const area = this.canvas;
    const start = (e) => {
      for (const t of e.changedTouches) {
        if (t.clientX < innerWidth * 0.42 && T.moveId === null) {
          T.moveId = t.identifier; T.ox = t.clientX; T.oy = t.clientY;
          stick.style.left = t.clientX - 60 + 'px'; stick.style.top = t.clientY - 60 + 'px';
          stick.classList.add('on');
        } else if (T.lookId === null) {
          T.lookId = t.identifier; T.lx = t.clientX; T.ly = t.clientY;
        }
      }
      e.preventDefault();
    };
    const move = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === T.moveId) {
          let dx = t.clientX - T.ox, dy = t.clientY - T.oy;
          const l = Math.hypot(dx, dy), m = 50;
          if (l > m) { dx *= m / l; dy *= m / l; }
          T.mx = dx / m; T.mz = -dy / m;
          T.run = l > 70;
          knob.style.transform = `translate(${dx}px, ${dy}px)`;
        } else if (t.identifier === T.lookId) {
          this.dx += (t.clientX - T.lx) * 1.6; this.dy += (t.clientY - T.ly) * 1.6;
          T.lx = t.clientX; T.ly = t.clientY;
        }
      }
      e.preventDefault();
    };
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === T.moveId) {
          T.moveId = null; T.mx = 0; T.mz = 0; T.run = false;
          knob.style.transform = ''; stick.classList.remove('on');
        } else if (t.identifier === T.lookId) T.lookId = null;
      }
    };
    area.addEventListener('touchstart', start, { passive: false });
    area.addEventListener('touchmove', move, { passive: false });
    area.addEventListener('touchend', end);
    area.addEventListener('touchcancel', end);
    const bind = (id, ev) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('touchstart', (e) => { this.events.add(ev); el.classList.add('down'); e.preventDefault(); e.stopPropagation(); }, { passive: false });
      el.addEventListener('touchend', () => el.classList.remove('down'));
    };
    bind('t-jump', 'jump');
    bind('t-shift', 'shift');
    bind('t-use', 'interact');
    bind('t-menu', 'pause');
  }
}
