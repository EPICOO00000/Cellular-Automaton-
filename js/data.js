/* =====================================================================
   CELLARIUM — the cell set
   ---------------------------------------------------------------------
   50 cells you can paint on the board. Every cell does ONE thing each
   tick, and most of them point somewhere — so you can ROTATE them.

   A cell is:
     id      unique name
     emoji   icon drawn on the tile
     name    label
     family  colour group
     dir     true  = the cell has a facing direction (rotate with R)
     period  optional: only acts every N ticks
     do      the action.  (cell, sim) => void

   Everything a cell can do goes through `sim`:
     sim.front(cell)            the square it is facing
     sim.free(x, y)             is that square empty?
     sim.spawn(x, y, type, dir) put a new cell there (if free)
     sim.destroy(x, y)          remove whatever is there
     sim.move(cell, x, y)       move a cell
     sim.around(cell)           the 8 neighbours
     sim.rotate(cell, +1)       turn a cell clockwise (+1) or anti (-1)
     sim.age(cell)              ticks since it was placed
     sim.organic(x, y)          is the thing there alive (burnable / edible)
   ===================================================================== */

const FAMILIES = {
  motion:  { label: 'Move',    color: '#38bdf8' },
  make:    { label: 'Make',    color: '#34d399' },
  break:   { label: 'Break',   color: '#fb7185' },
  turn:    { label: 'Turn',    color: '#c084fc' },
  signal:  { label: 'Signal',  color: '#fbbf24' },
  life:    { label: 'Life',    color: '#a3e635' },
  solid:   { label: 'Solid',   color: '#94a3b8' },
};

/* N, E, S, W — clockwise order. */
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const DIR_GLYPH = ['↑', '→', '↓', '←'];
const DIR_NAME = ['up', 'right', 'down', 'left'];

/* ---------------------------------------------------------------------
   helpers shared by the actions
   --------------------------------------------------------------------- */
const nbrs = (sim, cell) => sim.around(cell);
const anyAround = (sim, cell, pred) => sim.around(cell).some(pred);

/* A cell that a pusher can shove / a hunter can eat. */
const MOBILE = new Set([
  'mover', 'dasher', 'hopper', 'bouncer', 'drifter', 'slither', 'wanderer',
  'pusher', 'hunter', 'blob',
]);
const ORGANIC = new Set(['blob', 'life', 'fungus', 'virus', 'plant', 'colony', 'crystal', 'hunter']);
const FLAMMABLE = new Set(['blob', 'life', 'fungus', 'plant', 'colony', 'virus']);
const INDESTRUCTIBLE = new Set(['wall', 'blackhole']);

/* =====================================================================
   THE 50 CELLS
   ===================================================================== */
const CELLS = [
  /* ------------------------------- MOVE ----------------------------- */
  {
    id: 'mover', emoji: '🚶', name: 'Mover', family: 'motion', dir: true,
    if: 'The square ahead is empty',
    then: 'Moves one square ahead',
    do: (c, sim) => {
      const f = sim.front(c);
      if (sim.free(f.x, f.y)) sim.move(c, f.x, f.y);
    },
  },
  {
    id: 'dasher', emoji: '🏃', name: 'Dasher', family: 'motion', dir: true,
    if: 'The next two squares ahead are empty',
    then: 'Runs two squares',
    do: (c, sim) => {
      const f = sim.front(c);
      const f2 = sim.ahead(c, 2);
      if (sim.free(f.x, f.y) && sim.free(f2.x, f2.y)) sim.move(c, f2.x, f2.y);
    },
  },
  {
    id: 'hopper', emoji: '🐇', name: 'Hopper', family: 'motion', dir: true,
    if: 'The square two ahead is empty (it jumps over anything)',
    then: 'Hops two squares forward',
    do: (c, sim) => {
      const f2 = sim.ahead(c, 2);
      if (sim.free(f2.x, f2.y)) sim.move(c, f2.x, f2.y);
    },
  },
  {
    id: 'pusher', emoji: '👐', name: 'Pusher', family: 'motion', dir: true,
    if: 'A moveable cell is ahead and the square past it is free',
    then: 'Shoves it one square, then follows',
    do: (c, sim) => {
      const f = sim.front(c);
      const t = sim.at(f.x, f.y);
      if (!t) return sim.move(c, f.x, f.y);
      if (!MOBILE.has(t.type)) return;
      const ahead = sim.ahead(c, 2);
      if (!sim.free(ahead.x, ahead.y)) return;
      sim.move(t, ahead.x, ahead.y);
      sim.move(c, f.x, f.y);
    },
  },
  {
    id: 'bouncer', emoji: '🏓', name: 'Bouncer', family: 'motion', dir: true,
    if: 'Ahead is empty → moves.  Ahead is blocked → turns around',
    then: 'Walks one square, bouncing off walls',
    do: (c, sim) => {
      const f = sim.front(c);
      if (sim.free(f.x, f.y)) sim.move(c, f.x, f.y);
      else sim.rotate(c, 2);
    },
  },
  {
    id: 'drifter', emoji: '🎈', name: 'Drifter', family: 'motion', dir: true,
    if: 'Ahead is empty → moves.  Blocked → turns right',
    then: 'Drifts, turning at every obstacle',
    do: (c, sim) => {
      const f = sim.front(c);
      if (sim.free(f.x, f.y)) sim.move(c, f.x, f.y);
      else sim.rotate(c, 1);
    },
  },
  {
    id: 'slither', emoji: '🐍', name: 'Slither', family: 'motion', dir: true,
    if: 'Ahead is blocked',
    then: 'Turns a random way, otherwise creeps forward',
    do: (c, sim) => {
      const f = sim.front(c);
      if (sim.free(f.x, f.y)) sim.move(c, f.x, f.y);
      else sim.rotate(c, Math.random() < 0.5 ? 1 : 3);
    },
  },
  {
    id: 'wanderer', emoji: '🎲', name: 'Wanderer', family: 'motion',
    if: 'Any neighbour is free',
    then: 'Wanders into a random one',
    do: (c, sim) => {
      const spots = sim.around(c).filter((p) => sim.free(p.x, p.y));
      if (spots.length) {
        const p = spots[(Math.random() * spots.length) | 0];
        sim.move(c, p.x, p.y);
      }
    },
  },
  {
    id: 'spinner', emoji: '🌀', name: 'Spinner', family: 'motion', dir: true,
    if: 'Always',
    then: 'Turns itself 90° clockwise, staying put',
    do: (c, sim) => sim.rotate(c, 1),
  },

  /* ------------------------------- MAKE ----------------------------- */
  {
    id: 'generator', emoji: '🏭', name: 'Generator', family: 'make', dir: true, period: 3,
    if: 'Every 3 ticks, and the square ahead is free',
    then: 'Prints a Blob there',
    do: (c, sim) => {
      const f = sim.front(c);
      if (sim.free(f.x, f.y)) sim.spawn(f.x, f.y, 'blob', c.d);
    },
  },
  {
    id: 'duplicator', emoji: '👯', name: 'Duplicator', family: 'make', dir: true, period: 4,
    if: 'Every 4 ticks, and the square ahead is free',
    then: 'Copies itself — same direction',
    do: (c, sim) => {
      const f = sim.front(c);
      if (sim.free(f.x, f.y)) sim.spawn(f.x, f.y, 'duplicator', c.d);
    },
  },
  {
    id: 'splitter', emoji: '🔀', name: 'Splitter', family: 'make', dir: true, period: 4,
    if: 'Every 4 ticks, and a front diagonal is free',
    then: 'Spits a Blob out of each free front diagonal',
    do: (c, sim) => {
      const [dx, dy] = DIRS[c.d];
      for (const side of [-1, 1]) {
        const x = c.x + dx + (dy !== 0 ? side : 0);
        const y = c.y + dy + (dx !== 0 ? side : 0);
        if (sim.free(x, y)) sim.spawn(x, y, 'blob', c.d);
      }
    },
  },
  {
    id: 'grower', emoji: '🌱', name: 'Grower', family: 'make', dir: true, period: 2,
    if: 'Every 2 ticks, and the square ahead is free',
    then: 'Extends itself forward — a growing stem',
    do: (c, sim) => {
      const f = sim.front(c);
      if (sim.free(f.x, f.y)) sim.spawn(f.x, f.y, 'grower', c.d);
    },
  },
  {
    id: 'fountain', emoji: '⛲', name: 'Fountain', family: 'make', period: 1,
    if: 'A neighbour is free',
    then: 'Throws a Spark into it (signal particles)',
    do: (c, sim) => {
      const free = sim.around(c).filter((p) => sim.free(p.x, p.y));
      if (!free.length) return;
      const p = free[(Math.random() * free.length) | 0];
      const d = DIRS.findIndex(([dx, dy]) => dx === Math.sign(p.x - c.x) && dy === Math.sign(p.y - c.y));
      sim.spawn(p.x, p.y, 'spark', d < 0 ? 0 : d);
    },
  },
  {
    id: 'spawner', emoji: '✳️', name: 'Spawner', family: 'make', period: 5,
    if: 'Every 5 ticks, and a neighbour is free',
    then: 'Drops a Blob next to itself',
    do: (c, sim) => {
      const free = sim.around(c).filter((p) => sim.free(p.x, p.y));
      if (!free.length) return;
      const p = free[(Math.random() * free.length) | 0];
      sim.spawn(p.x, p.y, 'blob');
    },
  },
  {
    id: 'blaster', emoji: '💥', name: 'Blaster', family: 'make', dir: true, period: 3,
    if: 'Every 3 ticks',
    then: 'Fires a Bullet forward (it destroys what it hits)',
    do: (c, sim) => {
      const f = sim.front(c);
      if (sim.free(f.x, f.y)) sim.spawn(f.x, f.y, 'bullet', c.d);
    },
  },
  {
    id: 'mirror', emoji: '🪞', name: 'Mirror', family: 'make', period: 2,
    if: 'It is next to any cell, and has a free neighbour',
    then: 'Casts a copy of that cell beside itself',
    do: (c, sim) => {
      const src = sim.around(c).find((p) => sim.at(p.x, p.y) && sim.at(p.x, p.y).type !== 'mirror');
      if (!src) return;
      const free = sim.around(c).filter((p) => sim.free(p.x, p.y));
      if (!free.length) return;
      const p = free[(Math.random() * free.length) | 0];
      sim.spawn(p.x, p.y, sim.at(src.x, src.y).type, sim.at(src.x, src.y).d);
    },
  },
  {
    id: 'painter', emoji: '🎨', name: 'Painter', family: 'make', dir: true, period: 2,
    if: 'Every 2 ticks, and a cell is directly ahead',
    then: 'Repaints it into a copy of itself',
    do: (c, sim) => {
      const f = sim.front(c);
      const t = sim.at(f.x, f.y);
      if (!t || !sim.paintable(t)) return;
      sim.replace(t, 'painter', c.d);
    },
  },

  /* ------------------------------ BREAK ----------------------------- */
  {
    id: 'shredder', emoji: '⚙️', name: 'Shredder', family: 'break', dir: true,
    if: 'Something breakable is directly ahead',
    then: 'Destroys it',
    do: (c, sim) => {
      const f = sim.front(c);
      sim.destroy(f.x, f.y);
    },
  },
  {
    id: 'laser', emoji: '🔫', name: 'Laser', family: 'break', dir: true, period: 2,
    if: 'Every 2 ticks, a target is within 8 squares ahead',
    then: 'Fires a beam that destroys the first thing it hits',
    do: (c, sim) => {
      const hit = sim.ray(c, 8);
      sim.beam(c, hit);
      if (hit && sim.at(hit.x, hit.y)) sim.destroy(hit.x, hit.y, true);
    },
  },
  {
    id: 'bomb', emoji: '💣', name: 'Bomb', family: 'break',
    if: '3 ticks after it is placed',
    then: 'Explodes a 3×3 hole, then is gone',
    do: (c, sim) => {
      if (sim.age(c) < 3) return;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          sim.destroy(c.x + dx, c.y + dy, true);
        }
      }
      sim.blast(c.x, c.y, 2);
      sim.destroy(c.x, c.y, true);
    },
  },
  {
    id: 'blackhole', emoji: '🕳️', name: 'Black hole', family: 'break',
    if: 'Anything is next to it',
    then: 'Swallows all 8 neighbours',
    do: (c, sim) => {
      for (const p of sim.around(c)) {
        if (sim.at(p.x, p.y) && sim.at(p.x, p.y).type !== 'blackhole') sim.destroy(p.x, p.y, true);
      }
    },
  },
  {
    id: 'saw', emoji: '🪚', name: 'Saw', family: 'break',
    if: 'Something is to its left or right',
    then: 'Cuts both sides',
    do: (c, sim) => {
      sim.destroy(c.x - 1, c.y, true);
      sim.destroy(c.x + 1, c.y, true);
    },
  },
  {
    id: 'fire', emoji: '🔥', name: 'Fire', family: 'break', dir: true,
    if: 'A living or burnable cell is ahead',
    then: 'Burns it, then fades out',
    do: (c, sim) => {
      const f = sim.front(c);
      const t = sim.at(f.x, f.y);
      if (t && sim.burnable(t)) sim.replace(t, 'fire', c.d);
      else if (sim.age(c) > 2) sim.destroy(c.x, c.y, true);
    },
  },
  {
    id: 'acid', emoji: '🧪', name: 'Acid', family: 'break', dir: true, period: 2,
    if: 'Every 2 ticks, something breakable is ahead',
    then: 'Dissolves it and flows into the empty square',
    do: (c, sim) => {
      const f = sim.front(c);
      const t = sim.at(f.x, f.y);
      if (!t) return sim.move(c, f.x, f.y);
      if (!sim.paintable(t)) return;
      sim.destroy(f.x, f.y, true);
      sim.move(c, f.x, f.y);
    },
  },
  {
    id: 'grinder', emoji: '🗡️', name: 'Grinder', family: 'break', dir: true, period: 2,
    if: 'Every 2 ticks, something is on a front diagonal',
    then: 'Destroys both front diagonals',
    do: (c, sim) => {
      const [dx, dy] = DIRS[c.d];
      for (const s of [-1, 1]) {
        sim.destroy(c.x + dx + (dy !== 0 ? s : 0), c.y + dy + (dx !== 0 ? s : 0), true);
      }
    },
  },

  /* ------------------------------- TURN ----------------------------- */
  {
    id: 'rotator', emoji: '🔄', name: 'Rotator', family: 'turn', period: 2,
    if: 'Every 2 ticks',
    then: 'Turns every neighbour 90° clockwise',
    do: (c, sim) => {
      for (const p of sim.around(c)) {
        const t = sim.at(p.x, p.y);
        if (t && t.type !== c.type) sim.rotate(t, 1);
      }
    },
  },
  {
    id: 'turner', emoji: '↩️', name: 'Turner', family: 'turn', dir: true, period: 2,
    if: 'Every 2 ticks, a cell is directly ahead',
    then: 'Turns it 90° clockwise',
    do: (c, sim) => {
      const f = sim.front(c);
      const t = sim.at(f.x, f.y);
      if (t) sim.rotate(t, 1);
    },
  },
  {
    id: 'flipper', emoji: '🔃', name: 'Flipper', family: 'turn', dir: true, period: 2,
    if: 'Every 2 ticks, a cell is directly ahead',
    then: 'Sends it back the way it came',
    do: (c, sim) => {
      const f = sim.front(c);
      const t = sim.at(f.x, f.y);
      if (t) sim.rotate(t, 2);
    },
  },
  {
    id: 'aligner', emoji: '🧭', name: 'Aligner', family: 'turn', dir: true, period: 2,
    if: 'Every 2 ticks, a cell is directly ahead',
    then: 'Points it the same way it is facing',
    do: (c, sim) => {
      const f = sim.front(c);
      const t = sim.at(f.x, f.y);
      if (t) t.d = c.d;
    },
  },
  {
    id: 'freezer', emoji: '🧊', name: 'Freezer', family: 'turn', dir: true, period: 3,
    if: 'Every 3 ticks, a cell is directly ahead',
    then: 'Freezes it for 6 ticks (it cannot act)',
    do: (c, sim) => {
      const f = sim.front(c);
      const t = sim.at(f.x, f.y);
      if (t && t.type !== 'freezer') t.frozen = 6;
    },
  },
  {
    id: 'twister', emoji: '🌪️', name: 'Twister', family: 'turn', period: 2,
    if: 'Every 2 ticks, a neighbour can turn',
    then: 'Turns a random neighbour a random 90°',
    do: (c, sim) => {
      const list = sim.around(c).filter((p) => sim.at(p.x, p.y));
      if (!list.length) return;
      const p = list[(Math.random() * list.length) | 0];
      sim.rotate(sim.at(p.x, p.y), Math.random() < 0.5 ? 1 : 3);
    },
  },

  /* ------------------------------ SIGNAL ---------------------------- */
  {
    id: 'clock', emoji: '⏰', name: 'Clock', family: 'signal', period: 2,
    if: 'Every 2 ticks',
    then: 'Pulses to every free neighbour',
    do: (c, sim) => {
      for (const p of sim.around(c)) if (sim.free(p.x, p.y)) sim.spawn(p.x, p.y, 'spark', sim.dirTo(c, p));
    },
  },
  {
    id: 'emitter', emoji: '📡', name: 'Emitter', family: 'signal', dir: true, period: 3,
    if: 'Every 3 ticks',
    then: 'Sends a pulse forward — it runs along up to 12 squares of wire',
    do: (c, sim) => {
      const p = sim.firstFreeAhead(c, 12);
      if (p) sim.spawn(p.x, p.y, 'spark', c.d);
    },
  },
  {
    id: 'wire', emoji: '➖', name: 'Wire', family: 'signal',
    if: 'A pulse is next to it',
    then: 'Pulses travel through it and branch into free squares',
    do: (c, sim) => {
      if (!sim.near(c, 'spark')) return;
      for (const p of sim.around(c)) if (sim.free(p.x, p.y)) sim.spawn(p.x, p.y, 'spark', sim.dirTo(c, p));
    },
  },
  {
    id: 'relay', emoji: '🔁', name: 'Relay', family: 'signal', dir: true,
    if: 'A pulse touches it',
    then: 'Repeats the pulse forward',
    do: (c, sim) => {
      if (!sim.near(c, 'spark')) return;
      const f = sim.front(c);
      if (sim.free(f.x, f.y)) sim.spawn(f.x, f.y, 'spark', c.d);
    },
  },
  {
    id: 'diode', emoji: '▶️', name: 'Diode', family: 'signal', dir: true,
    if: 'A pulse arrives from behind',
    then: 'Lets it continue only forward',
    do: (c, sim) => {
      const back = sim.ahead(c, -1);
      const t = sim.at(back.x, back.y);
      if (!t || t.type !== 'spark') return;
      const f = sim.front(c);
      if (sim.free(f.x, f.y)) sim.spawn(f.x, f.y, 'spark', c.d);
    },
  },
  {
    id: 'sensor', emoji: '👁️', name: 'Sensor', family: 'signal', dir: true, period: 2,
    if: 'Every 2 ticks, something is directly ahead of it',
    then: 'Sends a pulse forward (a tripwire)',
    do: (c, sim) => {
      const f = sim.front(c);
      if (sim.at(f.x, f.y)) sim.spawn(f.x, f.y, 'spark', c.d);
    },
  },
  {
    id: 'memory', emoji: '💾', name: 'Memory', family: 'signal',
    if: 'It is switched on (it toggles every time a pulse arrives)',
    then: 'Pulses to all free neighbours every 3 ticks',
    do: (c, sim) => {
      if (sim.near(c, 'spark')) {
        c.on = !c.on;
        c.flash = 1;
      }
      if (!c.on) return;
      if (sim.age(c) % 3 !== 0) return;
      for (const p of sim.around(c)) if (sim.free(p.x, p.y)) sim.spawn(p.x, p.y, 'spark', sim.dirTo(c, p));
    },
  },
  {
    id: 'counter', emoji: '🔢', name: 'Counter', family: 'signal',
    if: 'It has counted 3 pulses',
    then: 'Sends one pulse out and starts again',
    do: (c, sim) => {
      if (sim.near(c, 'spark')) {
        c.n = (c.n || 0) + 1;
        c.flash = 1;
      }
      if ((c.n || 0) < 3) return;
      c.n = 0;
      for (const p of sim.around(c)) if (sim.free(p.x, p.y)) sim.spawn(p.x, p.y, 'spark', sim.dirTo(c, p));
    },
  },

  /* ------------------------------- LIFE ----------------------------- */
  {
    id: 'life', emoji: '🌱', name: 'Life', family: 'life', period: 2,
    if: 'It has exactly 3 living neighbours — otherwise it dies',
    then: 'Sprouts one new Life next to itself',
    do: (c, sim) => {
      const n = sim.around(c).filter((p) => sim.at(p.x, p.y)).length;
      if (n < 2 || n > 4) return sim.destroy(c.x, c.y, true);
      if (n !== 3) return;
      const free = sim.around(c).filter((p) => sim.free(p.x, p.y));
      if (!free.length) return;
      const p = free[(Math.random() * free.length) | 0];
      sim.spawn(p.x, p.y, 'life');
    },
  },
  {
    id: 'fungus', emoji: '🍄', name: 'Fungus', family: 'life', period: 3,
    if: 'Every 3 ticks, if it has fewer than 3 neighbours (it dies at age 12)',
    then: 'Creeps into a random free neighbour',
    do: (c, sim) => {
      if (sim.age(c) > 12) return sim.destroy(c.x, c.y, true);
      const near = sim.around(c).filter((p) => sim.at(p.x, p.y)).length;
      if (near >= 3) return;
      const free = sim.around(c).filter((p) => sim.free(p.x, p.y));
      if (!free.length) return;
      const p = free[(Math.random() * free.length) | 0];
      sim.spawn(p.x, p.y, 'fungus');
    },
  },
  {
    id: 'virus', emoji: '👾', name: 'Virus', family: 'life',
    if: 'A living cell is next to it (it starves after 12 ticks)',
    then: 'Infects it — the neighbour becomes a Virus too',
    do: (c, sim) => {
      const prey = sim.around(c).find((p) => {
        const t = sim.at(p.x, p.y);
        return t && t.type !== 'virus' && ORGANIC.has(t.type);
      });
      if (prey) return sim.replace(sim.at(prey.x, prey.y), 'virus');
      if (sim.age(c) > 12) sim.destroy(c.x, c.y, true);
    },
  },
  {
    id: 'plant', emoji: '🌿', name: 'Plant', family: 'life', dir: true, period: 2,
    if: 'Every 2 ticks the square ahead is free — it dies when crowded',
    then: 'Grows one square in its facing direction',
    do: (c, sim) => {
      const n = sim.around(c).filter((p) => sim.at(p.x, p.y)).length;
      if (n >= 6) return sim.destroy(c.x, c.y, true);
      const f = sim.front(c);
      if (sim.free(f.x, f.y)) sim.spawn(f.x, f.y, 'plant', c.d);
    },
  },
  {
    id: 'colony', emoji: '🦠', name: 'Colony', family: 'life', period: 2,
    if: 'It has 2 or 3 neighbours and room to grow',
    then: 'Budding: drops one Colony in a free neighbour',
    do: (c, sim) => {
      const n = sim.around(c).filter((p) => sim.at(p.x, p.y)).length;
      if (n >= 4) return sim.destroy(c.x, c.y, true);
      if (n < 2) return;
      const free = sim.around(c).filter((p) => sim.free(p.x, p.y));
      if (!free.length) return;
      const p = free[(Math.random() * free.length) | 0];
      sim.spawn(p.x, p.y, 'colony');
    },
  },
  {
    id: 'crystal', emoji: '💎', name: 'Crystal', family: 'life', period: 3,
    if: 'Exactly 2 Crystal neighbours and a free square',
    then: 'Grows one more facet',
    do: (c, sim) => {
      const n = sim.around(c).filter((p) => sim.at(p.x, p.y) && sim.at(p.x, p.y).type === 'crystal').length;
      if (n !== 2) return;
      const free = sim.around(c).filter((p) => sim.free(p.x, p.y));
      if (!free.length) return;
      const p = free[(Math.random() * free.length) | 0];
      sim.spawn(p.x, p.y, 'crystal');
    },
  },
  {
    id: 'hunter', emoji: '🐺', name: 'Hunter', family: 'life', dir: true,
    if: 'A living cell is ahead → eats it.  Empty → walks.  Wall → turns',
    then: 'Hunts anything organic in its path',
    do: (c, sim) => {
      const f = sim.front(c);
      const t = sim.at(f.x, f.y);
      if (!t) return sim.move(c, f.x, f.y);
      if (ORGANIC.has(t.type)) {
        sim.destroy(f.x, f.y, true);
        return sim.move(c, f.x, f.y);
      }
      sim.rotate(c, 1);
    },
  },

  /* ------------------------------ SOLID ----------------------------- */
  {
    id: 'wall', emoji: '🧱', name: 'Wall', family: 'solid',
    if: 'Always',
    then: 'Never moves, never breaks. Stops everything except beams',
    do: () => {},
  },
  {
    id: 'glass', emoji: '🪟', name: 'Glass', family: 'solid',
    if: 'Always',
    then: 'Blocks movement but lets Lasers and Pulses through',
    do: () => {},
  },
  {
    id: 'blob', emoji: '🟡', name: 'Blob', family: 'solid',
    if: 'There is empty space next to it (half the time)',
    then: 'Drifts one square — plain matter to build with',
    do: (c, sim) => {
      if (Math.random() > 0.35) return;
      const free = sim.around(c).filter((p) => sim.free(p.x, p.y));
      if (!free.length) return;
      const p = free[(Math.random() * free.length) | 0];
      sim.move(c, p.x, p.y);
    },
  },
];

/* ---------------------------------------------------------------------
   EFFECTS — not in the palette, but they live on the board
   --------------------------------------------------------------------- */
const EFFECTS = {
  spark: {
    id: 'spark', emoji: '✨', name: 'Spark', color: '#fde68a', effect: true,
    if: 'It is a pulse',
    then: 'Flies one square per tick (through Wires), fading after 4 ticks',
    do: (c, sim) => {
      if (sim.age(c) >= 4) return sim.destroy(c.x, c.y, true);
      const f = sim.front(c);
      if (sim.free(f.x, f.y)) return sim.move(c, f.x, f.y);
      if (sim.conductor(f.x, f.y)) {
        // jump over the conductor line and carry on
        const p = sim.firstFreeAhead(c, 12);
        if (p) return sim.move(c, p.x, p.y);
      }
      sim.destroy(c.x, c.y, true);
    },
  },
  bullet: {
    id: 'bullet', emoji: '⚪', name: 'Bullet', color: '#e2e8f0', effect: true,
    if: 'It is a bullet',
    then: 'Flies forward and destroys whatever it hits',
    do: (c, sim) => {
      const f = sim.front(c);
      const t = sim.at(f.x, f.y);
      if (t) {
        if (sim.paintable(t)) sim.destroy(f.x, f.y, true);
        return sim.destroy(c.x, c.y, true);
      }
      if (sim.age(c) >= 12) return sim.destroy(c.x, c.y, true);
      sim.move(c, f.x, f.y);
    },
  },
};

/* ------------------------------------------------------------------ */
const ALL = Object.assign({}, Object.fromEntries(CELLS.map((c) => [c.id, c])), EFFECTS);
const CELL_IDS = CELLS.map((c) => c.id);
const PALETTE_GROUPS = ['motion', 'make', 'break', 'turn', 'signal', 'life', 'solid'];

CELLS.forEach((c, i) => { c.index = i + 1; });
const CELL_INDEX = Object.fromEntries(CELLS.map((c) => [c.id, c]));

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CELLS, EFFECTS, ALL, CELL_INDEX, CELL_IDS, FAMILIES, DIRS, DIR_GLYPH, DIR_NAME, PALETTE_GROUPS };
}
