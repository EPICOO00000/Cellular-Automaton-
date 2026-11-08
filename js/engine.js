/* =====================================================================
   CELLARIUM — the engine
   One tick = every occupied cell is visited once (in random order).
   For each cell:
     1. skip if it already acted this tick
     2. count down its cooldown
     3. test its CONDITION  (cond)
     4. roll its CHANCE
     5. run its USE         (act)
   Cells born during a tick are marked as already acted, so a chain
   reaction cannot cross the whole grid in a single tick.
   ===================================================================== */

class World {
  constructor(width, height, opts = {}) {
    this.width = width;
    this.height = height;
    this.wrap = opts.wrap !== false;
    this.cells = new Array(width * height).fill(null);
    this.tick = 0;
    this.births = 0;
    this.reactions = 0;
    this.byType = {};          // cell id -> number of live cells
    this.rates = {};           // cell id -> 0..3 user multiplier
    this.mutationRate = 0;     // 0..1 chance per empty cell per tick
    this.capacity = 0.5;       // max fraction of the grid that may be alive
    this.decayRate = 0;        // 0..1 chance per cell to vanish
    this.immortal = new Set(); // ids immune to decay
    this.paused = false;
    this._pop = 0;            // cached live cell count (kept O(1))
    this.lastUses = 0;        // uses performed during the previous tick
    this.log = [];            // [{tick, events: [[id, count], …]}] newest first
    this.resetStats();
  }

  /* ---------------- geometry ---------------- */
  idx(x, y) {
    return y * this.width + x;
  }
  norm(x, y) {
    if (this.wrap) {
      x = ((x % this.width) + this.width) % this.width;
      y = ((y % this.height) + this.height) % this.height;
      return { x, y };
    }
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return null;
    return { x, y };
  }
  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }
  get(x, y) {
    const p = this.norm(x, y);
    return p ? this.cells[this.idx(p.x, p.y)] : null;
  }
  read(x, y) {
    const c = this.get(x, y);
    return c ? c.v : null;
  }
  emptyAt(x, y) {
    const p = this.norm(x, y);
    if (!p) return false;
    return this.cells[this.idx(p.x, p.y)] === null;
  }

  /* ---------------- cell lifecycle ---------------- */
  makeCell(id, x, y) {
    return {
      v: id,
      x,
      y,
      born: this.tick,
      cool: 0,
      acted: this.tick,   // created mid-tick -> cannot act until next tick
      flash: 0,
    };
  }
  place(x, y, id) {
    const p = this.norm(x, y);
    if (!p) return null;
    const cell = this.cells[this.idx(p.x, p.y)];
    if (cell) {
      // occupied: overwrite in place (keeps the slot)
      this.setCell(cell, id);
      return cell;
    }
    const fresh = this.makeCell(id, p.x, p.y);
    this.cells[this.idx(p.x, p.y)] = fresh;
    this.byType[id] = (this.byType[id] || 0) + 1;
    this._pop++;
    if (this.tick > 0) this.births++;
    return fresh;
  }
  setCell(cell, id) {
    const prev = cell.v;
    cell.v = id;
    cell.born = this.tick;
    cell.acted = this.tick;
    cell.cool = 0;
    cell.flash = 1;
    // id === null means "this cell turns into empty ground"
    if (id == null) return this.clear(cell);
    if (prev !== id) {
      if (prev) this.byType[prev] = Math.max(0, (this.byType[prev] || 0) - 1);
      this.byType[id] = (this.byType[id] || 0) + 1;
      if (this.tick > 0) this.births++;
    }
  }
  replace(cell, id) {
    if (!cell) return;
    this.setCell(cell, id);
    this.reactions++;
  }
  clear(cell) {
    if (!cell) return;
    const i = this.idx(cell.x, cell.y);
    if (this.cells[i] === cell) {
      this.byType[cell.v] = Math.max(0, (this.byType[cell.v] || 0) - 1);
      this.cells[i] = null;
      this._pop = Math.max(0, this._pop - 1);
    }
  }
  move(cell, p, id) {
    if (!p || !cell) return false;
    if (this.cells[this.idx(p.x, p.y)]) return false;
    const target = id || cell.v;
    const fromI = this.idx(cell.x, cell.y);
    this.cells[fromI] = null;
    this.byType[cell.v] = Math.max(0, (this.byType[cell.v] || 0) - 1);
    this.byType[target] = (this.byType[target] || 0) + 1;
    // the traveller is reborn on its new square (age/cooldown restart)
    const fresh = this.makeCell(target, p.x, p.y);
    fresh.acted = this.tick;
    fresh.flash = 1;
    this.cells[this.idx(p.x, p.y)] = fresh;
    return true;
  }
  capacityLeft() {
    return this.population() < this.capacity * this.width * this.height;
  }
  spawn(list, id) {
    if (!list || !list.length) return false;
    // carrying capacity: an ecosystem cannot grow past its limit
    if (!this.capacityLeft()) return false;
    const p = list[(Math.random() * list.length) | 0];
    if (!p) return false;
    if (!this.emptyAt(p.x, p.y)) return false;
    this.place(p.x, p.y, id);
    this.reactions++;
    return true;
  }
  age(cell) {
    return this.tick - cell.born;
  }
  cool(cell, n) {
    if (cell) cell.cool = n;
  }
  countOf(x, y, id) {
    let n = 0;
    for (const [dx, dy] of DIR8) {
      const c = this.get(x + dx, y + dy);
      if (c && c.v === id) n++;
    }
    return n;
  }

  /* ---------------- stats ---------------- */
  resetStats() {
    this.byType = {};
    this.births = 0;
    this.reactions = 0;
    this.tick = this.tick || 0;
  }
  recount() {
    this.byType = {};
    let pop = 0;
    for (const c of this.cells) {
      if (c) {
        this.byType[c.v] = (this.byType[c.v] || 0) + 1;
        pop++;
      }
    }
    this._pop = pop;
    return pop;
  }
  population() {
    return this._pop;
  }

  /* ---------------- the tick ---------------- */
  step() {
    const usesBefore = this.reactions;
    const events = new Map();
    this.tick++;
    const w = this.width;
    const h = this.height;
    const n = w * h;

    // Build the visit order: only indices that were occupied at tick start.
    const order = [];
    for (let i = 0; i < n; i++) if (this.cells[i]) order.push(i);
    // shuffle (Fisher–Yates) so no directional bias
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
      if (cell.flash > 0) cell.flash *= 0.72;
      cell.acted = this.tick;

      const def = CELL_INDEX[cell.v];
      if (!def) continue;

      if (cell.cool > 0) {
        cell.cool--;
        continue;
      }

      // crowding: a grower suffocates in a packed neighbourhood
      const limit = CROWD[cell.v];
      if (limit != null) {
        let live = 0;
        for (const [dx, dy] of DIR8) {
          const nc = this.get(cell.x + dx, cell.y + dy);
          if (nc) live++;
        }
        if (live > limit) {
          this.clear(cell);
          continue;
        }
      }

      // global decay
      if (this.decayRate > 0 && !this.immortal.has(cell.v) && Math.random() < this.decayRate) {
        this.clear(cell);
        continue;
      }

      let alive = true;
      try {
        alive = def.cond(cell, this);
      } catch (e) {
        alive = false;
      }
      if (!alive) continue;

      const rate = this.rates[cell.v] == null ? 1 : this.rates[cell.v];
      const chance = Math.min(1, (def.chance == null ? 1 : def.chance) * rate);
      if (Math.random() > chance) continue;

      try {
        def.act(cell, this);
        this.reactions++;
        events.set(cell.v, (events.get(cell.v) || 0) + 1);
      } catch (e) {
        /* a cell's use must never break the whole simulation */
      }
    }

    // global spontaneous mutation
    if (this.mutationRate > 0) {
      const tries = Math.ceil((w * h) * this.mutationRate * 0.02);
      for (let k = 0; k < tries; k++) {
        const x = (Math.random() * w) | 0;
        const y = (Math.random() * h) | 0;
        if (this.emptyAt(x, y)) {
          this.place(x, y, CELL_IDS[(Math.random() * CELL_IDS.length) | 0]);
        }
      }
    }

    // decay flash timers
    for (const c of this.cells) if (c && c.flash > 0.01) c.flash *= 0.9;

    this.lastUses = this.reactions - usesBefore;
    if (events.size) {
      this.log.unshift({ tick: this.tick, events: Array.from(events.entries()) });
      if (this.log.length > 40) this.log.length = 40;
    }
  }

  /* ---------------- serialisation ---------------- */
  serialize() {
    const rows = [];
    for (let y = 0; y < this.height; y++) {
      let row = '';
      for (let x = 0; x < this.width; x++) {
        const c = this.cells[this.idx(x, y)];
        row += c ? String(CELL_INDEX[c.v] ? CELL_INDEX[c.v].index : 0).padStart(2, '0') : '..';
      }
      rows.push(row);
    }
    return {
      w: this.width,
      h: this.height,
      tick: this.tick,
      data: rows.join(''),
      rates: this.rates,
    };
  }
  load(blob) {
    if (!blob) return;
    this.resize(blob.w, blob.h);
    this.tick = blob.tick || 0;
    const s = blob.data || '';
    let k = 0;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const tok = s.slice(k, k + 2);
        k += 2;
        if (tok === '..' || tok === '') continue;
        const num = parseInt(tok, 10);
        if (!num) continue;
        const def = CELLS.find((c) => c.index === num);
        if (def) {
          const cell = this.makeCell(def.id, x, y);
          cell.acted = -1;
          this.cells[this.idx(x, y)] = cell;
        }
      }
    }
    this.recount();
  }
  clearAll() {
    this.cells.fill(null);
    this.tick = 0;
    this.log = [];
    this.lastUses = 0;
    this.recount();
  }
  resize(width, height) {
    const next = new Array(width * height).fill(null);
    for (let y = 0; y < Math.min(height, this.height); y++) {
      for (let x = 0; x < Math.min(width, this.width); x++) {
        next[y * width + x] = this.cells[this.idx(x, y)];
      }
    }
    this.width = width;
    this.height = height;
    this.cells = next;
    this.recount();
  }
}

/* ---------------------------------------------------------------------
   PRESETS — 12 hand-built starting worlds
   --------------------------------------------------------------------- */
function stamp(w, x, y, pattern, legend) {
  pattern.forEach((row, dy) => {
    [...row].forEach((ch, dx) => {
      const id = legend[ch];
      if (id) w.place(x + dx, y + dy, id);
    });
  });
}

const PRESETS = [
  {
    id: 'soup', name: 'Primordial Soup', emoji: '🥣',
    desc: 'Every one of the 50 cells, dropped at random. The lab bench.',
    build(w) {
      for (let y = 0; y < w.height; y++) {
        for (let x = 0; x < w.width; x++) {
          if (Math.random() < 0.22) w.place(x, y, CELL_IDS[(Math.random() * CELL_IDS.length) | 0]);
        }
      }
    },
  },
  {
    id: 'life', name: 'Conway Garden', emoji: '🌱',
    desc: 'Life cells seeded in clumps, surrounded by Moss and Algae.',
    build(w) {
      const cx = (w.width / 2) | 0;
      const cy = (w.height / 2) | 0;
      for (let k = 0; k < 22; k++) {
        const x = cx + ((Math.random() - 0.5) * w.width * 0.7) | 0;
        const y = cy + ((Math.random() - 0.5) * w.height * 0.7) | 0;
        stamp(w, x, y, ['.#.', '###', '.#.'], { '#': 'life' });
      }
      for (let k = 0; k < 30; k++) {
        const x = (Math.random() * w.width) | 0;
        const y = (Math.random() * w.height) | 0;
        w.place(x, y, 'moss');
        if (Math.random() < 0.4) w.place(x + 1, y, 'algae');
      }
    },
  },
  {
    id: 'forest', name: 'Forest Floor', emoji: '🌳',
    desc: 'A row of Trees, roots digging down, seeds waiting for rain.',
    build(w) {
      const mid = w.height - 8;
      for (let x = 4; x < w.width - 4; x += 7) {
        stamp(w, x, mid, ['.#.', '/#\\', '.#.', '.#.'], { '#': 'tree', '/': 'seed', '\\': 'seed' });
        stamp(w, x, mid + 4, ['|', '|'], { '|': 'root' });
      }
    },
  },
  {
    id: 'circuit', name: 'Circuit Test', emoji: '🔌',
    desc: 'Sun → Light → Battery → Wire → Factory → Drone.',
    build(w) {
      const y = (w.height / 2) | 0;
      const x0 = 6;
      stamp(w, x0, y, ['S'], { S: 'sun' });
      stamp(w, x0 + 6, y, ['B'], { B: 'battery' });
      for (let i = 0; i < 8; i++) w.place(x0 + 8 + i, y, 'wire');
      stamp(w, x0 + 18, y, ['F'], { F: 'factory' });
      stamp(w, x0 + 26, y, ['U'], { U: 'beacon' });
      for (let i = 0; i < 3; i++) w.place(x0 + 26, y - 4 - i * 2, 'plasma');
    },
  },
  {
    id: 'volcano', name: 'Volcano', emoji: '🌋',
    desc: 'Magma core, geysers, water lakes and steam rising.',
    build(w) {
      const cx = (w.width / 2) | 0;
      const cy = (w.height / 2) | 0;
      for (let y = -5; y <= 5; y++) {
        for (let x = -7; x <= 7; x++) {
          if (Math.abs(x) + Math.abs(y) < 6 && Math.random() < 0.85) {
            w.place(cx + x, cy + y, 'magma');
          }
        }
      }
      for (let x = 2; x < w.width - 2; x += 3) {
        w.place(x, w.height - 2, 'water');
        w.place(x, w.height - 3, 'water');
      }
      w.place(cx, cy - 8, 'geyser');
      w.place(cx - 14, cy + 6, 'geyser');
      w.place(cx + 14, cy + 6, 'geyser');
    },
  },
  {
    id: 'crystal', name: 'Crystal Cave', emoji: '💎',
    desc: 'Crystal seeds + Salt + Ice growing from four corners.',
    build(w) {
      const spots = [[4, 4], [w.width - 5, 4], [4, w.height - 5], [w.width - 5, w.height - 5]];
      spots.forEach(([x, y]) => {
        stamp(w, x - 1, y - 1, ['.'.repeat(3), '.@.', '...'], { '@': 'crystal' });
        for (let k = 0; k < 6; k++) {
          w.place(x + ((Math.random() * 12) | 0) - 6, y + ((Math.random() * 12) | 0) - 6, Math.random() < 0.5 ? 'salt' : 'ice');
        }
      });
    },
  },
  {
    id: 'society', name: 'First Settlers', emoji: '🏘️',
    desc: 'Three colonists, a water source, farmland and a wolf.',
    build(w) {
      const cx = (w.width / 2) | 0;
      const cy = (w.height / 2) | 0;
      stamp(w, cx, cy, ['CCC', 'CCC', 'CCC'], { C: 'colonist' });
      for (let i = 0; i < 6; i++) w.place(cx - 12 + i, cy + 5, 'water');
      for (let i = 0; i < 4; i++) w.place(cx + 8 + i, cy - 6, 'flower');
      w.place(cx + 16, cy, 'wolf');
      w.place(cx - 16, cy, 'wolf');
    },
  },
  {
    id: 'plague', name: 'Plague Ship', emoji: '👾',
    desc: 'A Virus on the edge of a healthy algal mat. Watch it spread.',
    build(w) {
      for (let y = 6; y < w.height - 6; y++) {
        for (let x = 26; x < w.width - 26; x++) {
          if (Math.random() < 0.75) w.place(x, y, Math.random() < 0.6 ? 'algae' : 'moss');
        }
      }
      w.place(6, (w.height / 2) | 0, 'virus');
      w.place(8, (w.height / 2) | 0, 'virus');
      w.place(6, (w.height / 2) + 1, 'virus');
    },
  },
  {
    id: 'motion', name: 'Conveyor', emoji: '🏃',
    desc: 'Walkers, runners, jumpers, doors and a beacon lure.',
    build(w) {
      const y = (w.height / 2) | 0;
      for (let i = 0; i < 4; i++) {
        w.place(4 + i * 8, y - 3, 'walker');
        w.place(4 + i * 8, y, 'runner');
        w.place(4 + i * 8, y + 3, 'jumper');
      }
      for (let i = 0; i < 3; i++) {
        w.place(20 + i * 10, y - 3, 'door');
        w.place(20 + i * 10, y, 'door');
      }
      w.place(w.width - 4, y, 'beacon');
      w.place(w.width - 6, y + 2, 'drone');
      w.place(w.width - 6, y - 2, 'drone');
    },
  },
  {
    id: 'clockwork', name: 'Clockwork', emoji: '⏰',
    desc: 'Clocks, blinkers, eggs and a sundial in the sun.',
    build(w) {
      const cx = (w.width / 2) | 0;
      const cy = (w.height / 2) | 0;
      w.place(cx, cy, 'clock');
      w.place(cx + 8, cy, 'sundial');
      w.place(cx + 8, cy - 3, 'sun');
      w.place(cx, cy + 6, 'geyser');
      for (let k = 0; k < 12; k++) {
        w.place(cx + ((Math.random() * 24) | 0) - 12, cy + ((Math.random() * 10) | 0) - 5, 'egg');
      }
      for (let k = 0; k < 20; k++) {
        w.place(cx + ((Math.random() * 30) | 0) - 15, cy + ((Math.random() * 14) | 0) - 7, 'blink');
      }
    },
  },
  {
    id: 'lab', name: 'Reaction Lab', emoji: '🧪',
    desc: 'Acid next to crystals, mutators, mirrors and chimeras.',
    build(w) {
      for (let i = 0; i < 10; i++) {
        w.place(8 + i * 3, 8, 'acid');
        w.place(8 + i * 3, 10, 'crystal');
      }
      for (let i = 0; i < 8; i++) {
        w.place(10 + i * 6, 20, 'mutator');
        w.place(10 + i * 6, 22, 'mirror');
        w.place(10 + i * 6, 24, 'chimera');
      }
      for (let i = 0; i < 12; i++) w.place(8 + i * 4, 30, 'plasma');
    },
  },
  {
    id: 'blank', name: 'Empty Canvas', emoji: '⬜',
    desc: 'A clean grid. Paint your own experiment.',
    build() {},
  },
];

/* shapes the user can stamp with one click */
/* One-click shapes you can stamp on the grid. Each pixel of the ASCII
   pattern is mapped through `legend`. */
const STAMPS = [
  {
    id: 'glider', name: 'Glider', emoji: '🛩️', legend: { '#': 'life' },
    pattern: ['.#.', '..#', '###'],
  },
  {
    id: 'bloom', name: 'Bloom', emoji: '🌸', legend: { '#': 'flower', '+': 'bee' },
    pattern: ['.#.', '#+#', '.#.'],
  },
  {
    id: 'nest', name: 'Nest', emoji: '🪹', legend: { '#': 'egg', '@': 'colonist', '*': 'tree' },
    pattern: ['*###*', '.@@@.', '..@..'],
  },
  {
    id: 'grid', name: 'Walled room', emoji: '🧱', legend: { '#': 'wall', '.': null },
    pattern: ['#####', '#...#', '#...#', '#...#', '#####'],
  },
  {
    id: 'engine', name: 'Power cell', emoji: '🔋', legend: { 'S': 'sun', 'B': 'battery', '=': 'wire', 'F': 'factory' },
    pattern: ['..S..', '.....', 'B===F'],
  },
  {
    id: 'crystal', name: 'Crystal seed', emoji: '💎', legend: { '#': 'crystal', '~': 'ice' },
    pattern: ['.#.', '#~#', '.#.'],
  },
];

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { World, PRESETS, STAMPS };
}
