/* =====================================================================
   CELLARIUM — simulation
   ---------------------------------------------------------------------
   One tick = every cell on the board gets exactly one chance to act.
   Cells are visited in random order; anything born during the tick waits
   until the next one.

   A cell: { type, x, y, d, born, acted, frozen, flash, on, n }
     d       facing 0..3 (up, right, down, left) — null for non-directional
     born    tick it appeared (for "after 3 ticks" style rules)
     frozen  ticks it is frozen for
     on / n  small pieces of memory some cells use
   ===================================================================== */

class Sim {
  constructor(w, h, opts = {}) {
    this.w = w;
    this.h = h;
    this.wrap = !!opts.wrap;
    this.cells = new Array(w * h).fill(null);
    this.tick = 0;
    this.beams = [];   // visible laser shots  { x1, y1, x2, y2, ttl }
    this.blasts = [];  // visible explosions    { x, y, r, ttl }
    this._pop = 0;
    this.limit = 0.8;
  }

  /* ------------------------------ geometry ------------------------------ */
  wrapX(x) {
    if (this.wrap) return ((x % this.w) + this.w) % this.w;
    return x;
  }
  wrapY(y) {
    if (this.wrap) return ((y % this.h) + this.h) % this.h;
    return y;
  }
  inside(x, y) {
    if (this.wrap) return true;
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }
  ix(x, y) {
    return this.wrapY(y) * this.w + this.wrapX(x);
  }
  at(x, y) {
    if (!this.inside(x, y)) return null;
    return this.cells[this.ix(x, y)];
  }
  free(x, y) {
    if (!this.inside(x, y)) return false;
    return this.cells[this.ix(x, y)] === null;
  }
  pop() {
    return this._pop;
  }

  /* --------------------------- cell helpers ----------------------------- */
  makeCell(type, x, y, d) {
    const def = ALL[type] || {};
    return {
      type,
      x,
      y,
      d: d == null ? (def.dir ? 1 : null) : d,
      born: this.tick,
      acted: this.tick,
      frozen: 0,
      flash: 0,
      on: false,
      n: 0,
    };
  }

  front(cell) {
    const d = cell.d == null ? 1 : cell.d;
    return { x: cell.x + DIRS[d][0], y: cell.y + DIRS[d][1] };
  }
  ahead(cell, n) {
    const d = cell.d == null ? 1 : cell.d;
    return { x: cell.x + DIRS[d][0] * n, y: cell.y + DIRS[d][1] * n };
  }
  around(cell) {
    const out = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        if (!this.inside(cell.x + dx, cell.y + dy)) continue;
        out.push({ x: cell.x + dx, y: cell.y + dy });
      }
    }
    return out;
  }
  near(cell, type) {
    return this.around(cell).some((p) => {
      const t = this.at(p.x, p.y);
      return t && t.type === type;
    });
  }
  dirTo(from, p) {
    const dx = Math.sign(p.x - from.x);
    const dy = Math.sign(p.y - from.y);
    for (let d = 0; d < 4; d++) if (DIRS[d][0] === dx && DIRS[d][1] === dy) return d;
    return from.d == null ? 0 : from.d;
  }
  age(cell) {
    return this.tick - cell.born;
  }

  /* ---------------------------- primitives ------------------------------ */
  spawn(x, y, type, d) {
    if (!this.inside(x, y)) return null;
    if (this.cells[this.ix(x, y)] !== null) return null;
    if (this._pop >= this.limit * this.w * this.h) return null;
    const cell = this.makeCell(type, x, y, d);
    this.cells[this.ix(x, y)] = cell;
    this._pop++;
    return cell;
  }

  destroy(x, y, force = false) {
    if (!this.inside(x, y)) return false;
    const cell = this.cells[this.ix(x, y)];
    if (!cell) return false;
    if (!force && !this.destroyable(cell)) return false;
    if (INDESTRUCTIBLE.has(cell.type)) return false;
    this.cells[this.ix(x, y)] = null;
    this._pop--;
    return true;
  }

  move(cell, x, y) {
    if (!this.inside(x, y)) return false;
    const target = this.cells[this.ix(x, y)];
    if (target !== null) return false;
    this.cells[this.ix(cell.x, cell.y)] = null;
    cell.x = x;
    cell.y = y;
    cell.acted = this.tick;
    this.cells[this.ix(x, y)] = cell;
    return true;
  }

  replace(cell, type, d) {
    if (!cell) return null;
    if (INDESTRUCTIBLE.has(cell.type)) return null;
    cell.type = type;
    cell.born = this.tick;
    cell.acted = this.tick;
    cell.frozen = 0;
    cell.flash = 1;
    cell.on = false;
    cell.n = 0;
    if (d != null) cell.d = d;
    return cell;
  }

  rotate(cell, k) {
    if (!cell || cell.d == null) return;
    cell.d = ((cell.d + k) % 4 + 4) % 4;
    cell.flash = Math.max(cell.flash, 0.55);
  }

  place(x, y, type, d) {
    if (!this.inside(x, y)) return null;
    const i = this.ix(x, y);
    if (this.cells[i]) {
      // painting over an existing cell replaces it
      this.cells[i] = this.makeCell(type, this.wrapX(x), this.wrapY(y), d);
      return this.cells[i];
    }
    const cell = this.makeCell(type, this.wrapX(x), this.wrapY(y), d);
    this.cells[i] = cell;
    this._pop++;
    return cell;
  }

  /* ------------------------------- traits -------------------------------- */
  paint(t) { return !!t; }
  paintable(t) { return !!t && !INDESTRUCTIBLE.has(t.type); }
  destroyable(t) { return !!t && !INDESTRUCTIBLE.has(t.type); }
  organic(t) { return !!t && ORGANIC.has(t.type); }
  burnable(t) { return !!t && FLAMMABLE.has(t.type); }

  /* -------------------------- conductors -------------------------------- */
  /** wires, relay cells and glass let a pulse travel through them */
  conductor(x, y) {
    const t = this.at(x, y);
    return !!t && (t.type === 'wire' || t.type === 'glass' || t.type === 'relay' || t.type === 'diode');
  }
  /** first empty square straight ahead, hopping over conductors */
  firstFreeAhead(cell, max) {
    for (let i = 1; i <= max; i++) {
      const p = this.ahead(cell, i);
      if (!this.inside(p.x, p.y)) return null;
      if (this.free(p.x, p.y)) return p;
      if (!this.conductor(p.x, p.y)) return null;
    }
    return null;
  }

  /* --------------------------- beam helpers ------------------------------ */
  /** first occupied cell straight ahead (glass lets beams through) */
  ray(cell, max) {
    for (let i = 1; i <= max; i++) {
      const p = this.ahead(cell, i);
      if (!this.inside(p.x, p.y)) return null;
      const t = this.at(p.x, p.y);
      if (t && t.type !== 'glass') return { x: p.x, y: p.y, cell: t };
    }
    return null;
  }
  beam(from, to) {
    const end = to || this.ahead(from, 8);
    this.beams.push({ x1: from.x, y1: from.y, x2: end.x, y2: end.y, ttl: 2 });
    if (this.beams.length > 24) this.beams.shift();
  }
  blast(x, y, r) {
    this.blasts.push({ x, y, r, ttl: 2 });
    if (this.blasts.length > 24) this.blasts.shift();
  }

  /* -------------------------------- tick -------------------------------- */
  step() {
    this.tick++;
    const order = [];
    for (let i = 0; i < this.cells.length; i++) if (this.cells[i]) order.push(i);
    // shuffle
    for (let i = order.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const t = order[i];
      order[i] = order[j];
      order[j] = t;
    }

    for (const i of order) {
      const cell = this.cells[i];
      if (!cell) continue;
      if (cell.acted === this.tick) continue;
      cell.acted = this.tick;
      if (cell.flash > 0) cell.flash *= 0.6;
      if (cell.frozen > 0) {
        cell.frozen--;
        continue;
      }
      const def = ALL[cell.type];
      if (!def) continue;
      if (def.period > 1 && this.tick % def.period !== 0) continue;
      try {
        def.do(cell, this);
      } catch (e) {
        // a broken rule must never stop the toy
        this.errors = (this.errors || 0) + 1;
      }
    }

    for (const b of this.beams) b.ttl--;
    this.beams = this.beams.filter((b) => b.ttl > 0);
    for (const b of this.blasts) b.ttl--;
    this.blasts = this.blasts.filter((b) => b.ttl > 0);
  }

  /* ------------------------------ utilities ------------------------------ */
  counts() {
    const out = {};
    for (const c of this.cells) {
      if (!c) continue;
      out[c.type] = (out[c.type] || 0) + 1;
    }
    return out;
  }
  clear() {
    this.cells.fill(null);
    this.tick = 0;
    this.beams = [];
    this.blasts = [];
    this._pop = 0;
    this.errors = 0;
  }
  resize(w, h) {
    const next = new Array(w * h).fill(null);
    for (let y = 0; y < Math.min(h, this.h); y++) {
      for (let x = 0; x < Math.min(w, this.w); x++) {
        const c = this.cells[y * this.w + x];
        if (c) {
          if (x < w && y < h) next[y * w + x] = c;
        }
      }
    }
    this.w = w;
    this.h = h;
    this.cells = next;
    this._pop = next.filter(Boolean).length;
  }
  serialize() {
    // 3 chars per square: 2-digit cell number + direction (or 'x')
    const data = this.cells.map((c) => {
      if (!c) return '..';
      const def = CELL_INDEX[c.type];
      if (!def) return '..'; // transient effects are not saved
      return String(def.index).padStart(2, '0') + (c.d == null ? 'x' : c.d);
    });
    return { v: 2, w: this.w, h: this.h, cells: data };
  }
  load(blob) {
    if (!blob) return;
    this.clear();
    this.resize(blob.w, blob.h);
    const byIndex = {};
    for (const c of CELLS) byIndex[c.index] = c.id;
    blob.cells.forEach((str, i) => {
      if (!str || str === '..') return;
      const type = byIndex[parseInt(str.slice(0, 2), 10)];
      if (!type) return;
      const dc = str[2];
      const d = dc === 'x' || dc == null ? null : parseInt(dc, 10);
      const x = i % this.w;
      const y = (i / this.w) | 0;
      this.cells[i] = this.makeCell(type, x, y, d);
    });
    this._pop = this.cells.filter(Boolean).length;
    this.tick = 0;
  }
}

/* =====================================================================
   Small example boards (just the same cells, arranged)
   ===================================================================== */
function stampAscii(sim, ox, oy, rows, legend) {
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === ' ' || ch === '.') return;
      const entry = legend[ch];
      if (!entry) return;
      const [type, d] = Array.isArray(entry) ? entry : [entry, undefined];
      sim.place(ox + x, oy + y, type, d);
    });
  });
}

const PRESETS = [
  {
    id: 'blank', name: 'Blank', emoji: '⬜',
    build() {},
  },
  {
    id: 'conveyor', name: 'Conveyor', emoji: '➡️', hint: 'A Generator feeding a line of Movers into a Black hole',
    build(sim) {
      const y = (sim.h / 2) | 0;
      for (let x = 4; x < sim.w - 6; x += 2) sim.place(x, y, 'mover', 1);
      for (let x = 4; x < sim.w - 6; x += 2) sim.place(x, y + 3, 'bouncer', 1);
      sim.place(2, y, 'generator', 1);
      sim.place(sim.w - 3, y, 'blackhole');
      sim.place(2, y + 3, 'spinner', 0);
    },
  },
  {
    id: 'factory', name: 'Factory', emoji: '🏭', hint: 'A Generator feeds a walled chute that ends in a Shredder',
    build(sim) {
      const y = (sim.h / 2) | 0;
      const x0 = 4;
      const x1 = 22;
      // sealed chute: walls above and below, closed at the far end
      for (let x = x0 + 1; x <= x1; x++) {
        sim.place(x, y - 1, 'wall');
        sim.place(x, y + 1, 'wall');
      }
      sim.place(x1 + 1, y - 1, 'wall');
      sim.place(x1 + 1, y, 'wall');
      sim.place(x1 + 1, y + 1, 'wall');
      sim.place(x0, y, 'generator', 1);
      // close the entrance so the only way out is down the chute
      sim.place(x0, y - 1, 'wall');
      sim.place(x0, y + 1, 'wall');
      sim.place(x0 - 1, y, 'wall');
      sim.place(x1, y - 1, 'shredder', 2); // waits at the end of the chute
    },
  },
  {
    id: 'laser', name: 'Laser range', emoji: '🔫', hint: 'A Laser firing across the board, and a pulse wire above it',
    build(sim) {
      const y = (sim.h / 2) | 0;
      sim.place(3, y, 'laser', 1);
      for (let x = 10; x < 22; x += 3) sim.place(x, y, 'blob');
      sim.place(26, y, 'wall');
      sim.place(3, y - 4, 'emitter', 1);
      for (let x = 4; x < 14; x++) sim.place(x, y - 4, 'wire');
      sim.place(14, y - 4, 'relay', 1);
    },
  },
  {
    id: 'garden', name: 'Garden', emoji: '🌱', hint: 'Plants growing in four directions while a Hunter patrols',
    build(sim) {
      const cx = (sim.w / 2) | 0;
      const cy = (sim.h / 2) | 0;
      sim.place(cx, cy, 'generator', 1);
      sim.place(cx - 6, cy, 'plant', 3);
      sim.place(cx + 6, cy, 'plant', 1);
      sim.place(cx, cy - 6, 'plant', 0);
      sim.place(cx, cy + 6, 'plant', 2);
      sim.place(cx - 10, cy + 6, 'hunter', 1);
      sim.place(cx + 12, cy - 5, 'fungus');
      sim.place(cx + 3, cy + 8, 'colony');
    },
  },
  {
    id: 'circuit', name: 'Pulse circuit', emoji: '⚡', hint: 'A Clock pulsing down a wire into a Counter and a Memory',
    build(sim) {
      const y = (sim.h / 2) | 0;
      sim.place(3, y, 'clock');
      for (let x = 4; x < sim.w - 8; x++) sim.place(x, y, 'wire');
      sim.place(sim.w - 8, y, 'counter');
      sim.place(sim.w - 8, y - 4, 'relay', 1);
      sim.place(sim.w - 12, y - 4, 'memory');
      sim.place(6, y + 4, 'clock');
      sim.place(6, y + 5, 'rotator');
      sim.place(10, y + 4, 'mover', 1);
    },
  },
];

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Sim, PRESETS, stampAscii };
}
