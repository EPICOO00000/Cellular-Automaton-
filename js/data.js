/* =====================================================================
   CELLARIUM — the catalogue
   50 cell types. Every cell has:
     emoji     : its icon
     condition : what must be true around it
     effect    : what it does that tick
     cond(c,w) : condition test
     act(c,w)  : the use
     chance    : default probability of acting (tunable in the UI)
   ===================================================================== */

const DIR8 = [
  [0, -1], [1, -1], [1, 0], [1, 1],
  [0, 1], [-1, 1], [-1, 0], [-1, -1],
];
const DIR4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const DIRX = [[1, -1], [1, 1], [-1, 1], [-1, -1]];

/* ---------- neighbourhood helpers (used by every cell) --------------- */
function around(w, x, y, dirs = DIR8) {
  const out = [];
  for (const [dx, dy] of dirs) {
    const p = w.norm(x + dx, y + dy);
    if (p) out.push({ x: p.x, y: p.y, i: p.y * w.width + p.x, v: w.read(p.x, p.y) });
  }
  return out;
}
function freeAround(w, x, y, dirs = DIR8) {
  return around(w, x, y, dirs).filter((n) => !n.v && w.emptyAt(n.x, n.y));
}
function livingAround(w, x, y) {
  return around(w, x, y).filter((n) => n.v).length;
}
function countOf(w, x, y, id) {
  return around(w, x, y).filter((n) => n.v === id).length;
}
function touches(w, x, y, ids) {
  return around(w, x, y).some((n) => ids.includes(n.v));
}
function findNeighbour(w, x, y, ids) {
  return around(w, x, y).find((n) => ids.includes(n.v)) || null;
}
function dirTarget(w, x, y, dirs) {
  const spots = [];
  for (const [dx, dy] of dirs) {
    const p = w.norm(x + dx, y + dy);
    if (p && !w.read(p.x, p.y) && w.emptyAt(p.x, p.y)) spots.push(p);
  }
  return spots;
}
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const CHANCE = (p) => Math.random() < p;

/* =====================================================================
   FAMILIES
   ===================================================================== */
const FAMILIES = {
  life:      { label: 'Life',       color: '#67e8f9', blurb: 'Seeds, growth and decay of simple organisms' },
  plants:    { label: 'Plants',     color: '#4ade80', blurb: 'Things rooted in the ground that spread' },
  growth:    { label: 'Growth',     color: '#a3e635', blurb: 'Cells whose only job is to get taller / deeper' },
  movement:  { label: 'Motion',     color: '#fbbf24', blurb: 'Cells that relocate across the grid' },
  energy:    { label: 'Energy',     color: '#fcd34d', blurb: 'Light, charge and conduction' },
  time:      { label: 'Time',       color: '#93c5fd', blurb: 'Clocks, cooldowns and timed releases' },
  mutation:  { label: 'Mutation',   color: '#c084fc', blurb: 'Cells that rewrite other cells' },
  chemistry: { label: 'Chemistry',  color: '#5eead4', blurb: 'Dissolving, drying and crystallising' },
  elements:  { label: 'Elements',   color: '#fb7185', blurb: 'Fire, water, ice, steam and magma' },
  creatures: { label: 'Creatures',  color: '#fda4af', blurb: 'Predators, hosts, pollinators' },
  society:   { label: 'Society',    color: '#fdba74', blurb: 'Settlements and industry' },
  structures: { label: 'Structures', color: '#94a3b8', blurb: 'Static builds and traversable gates' },
};

/* =====================================================================
   THE 50 CELLS
   ===================================================================== */
const CELLS = [
  /* ------------------------------- LIFE ------------------------------ */
  {
    id: 'life', emoji: '🌱', name: 'Life', family: 'life', chance: 0.35,
    condition: 'Exactly 3 living neighbours (fewer than 2 and it dies)',
    effect: 'Crowded: sprouts Life in a free neighbour. Lonely: becomes empty.',
    cond: (c, w) => {
      const n = livingAround(w, c.x, c.y);
      return n === 3 || n < 2;
    },
    act: (c, w) => {
      if (livingAround(w, c.x, c.y) < 2) return w.clear(c);
      w.spawn(freeAround(w, c.x, c.y), 'life');
    },
  },
  {
    id: 'algae', emoji: '🦠', name: 'Algae', family: 'life', chance: 0.04,
    condition: 'At least one free neighbour',
    effect: 'Creeps into a random free neighbour',
    cond: (c, w) => freeAround(w, c.x, c.y).length > 0,
    act: (c, w) => w.spawn(freeAround(w, c.x, c.y), 'algae'),
  },
  {
    id: 'spore', emoji: '🍄', name: 'Spore', family: 'life', chance: 0.08,
    condition: 'At least one free neighbour',
    effect: 'Plants a Spore there, then withers into Moss',
    cond: (c, w) => freeAround(w, c.x, c.y).length > 0,
    act: (c, w) => {
      if (w.spawn(freeAround(w, c.x, c.y), 'spore')) w.replace(c, 'moss');
    },
  },
  {
    id: 'moss', emoji: '☘️', name: 'Moss', family: 'life', chance: 0.035,
    condition: 'At least one free neighbour',
    effect: 'Spreads a thin layer of Moss',
    cond: (c, w) => freeAround(w, c.x, c.y).length > 0,
    act: (c, w) => w.spawn(freeAround(w, c.x, c.y), 'moss'),
  },

  /* ------------------------------ PLANTS ---------------------------- */
  {
    id: 'seed', emoji: '🌰', name: 'Seed', family: 'plants', chance: 0.5,
    condition: 'Touches Water — or has waited 12 ticks dormant',
    effect: 'Germinates into a Tree',
    cond: (c, w) => touches(w, c.x, c.y, ['water']) || w.age(c) > 12,
    act: (c, w) => w.replace(c, 'tree'),
  },
  {
    id: 'tree', emoji: '🌳', name: 'Tree', family: 'plants', chance: 0.05,
    condition: 'Has a free diagonal neighbour',
    effect: 'Drops a Seed on the ground',
    cond: (c, w) => freeAround(w, c.x, c.y, DIRX).length > 0,
    act: (c, w) => w.spawn(freeAround(w, c.x, c.y, DIRX), 'seed'),
  },
  {
    id: 'flower', emoji: '🌸', name: 'Flower', family: 'plants', chance: 0.1,
    condition: 'Touches at least 3 living cells',
    effect: 'Blooms another Flower beside it',
    cond: (c, w) => livingAround(w, c.x, c.y) >= 3 && freeAround(w, c.x, c.y).length > 0,
    act: (c, w) => w.spawn(freeAround(w, c.x, c.y), 'flower'),
  },
  {
    id: 'vine', emoji: '🍃', name: 'Vine', family: 'plants', chance: 0.5,
    condition: 'A free cell in a cardinal direction',
    effect: 'Climbs one cell in that direction',
    cond: (c, w) => dirTarget(w, c.x, c.y, DIR4).length > 0,
    act: (c, w) => {
      const p = pick(dirTarget(w, c.x, c.y, DIR4));
      if (p) w.place(p.x, p.y, 'vine');
    },
  },
  {
    id: 'bamboo', emoji: '🎋', name: 'Bamboo', family: 'plants', chance: 0.45,
    condition: 'The cell above is free',
    effect: 'Shoots one cell upwards',
    cond: (c, w) => w.emptyAt(c.x, c.y - 1),
    act: (c, w) => w.place(c.x, c.y - 1, 'bamboo'),
  },

  /* ------------------------------ GROWTH ---------------------------- */
  {
    id: 'root', emoji: '🫚', name: 'Root', family: 'growth', chance: 0.55,
    condition: 'The cell below is free',
    effect: 'Digs one cell deeper',
    cond: (c, w) => w.emptyAt(c.x, c.y + 1),
    act: (c, w) => w.place(c.x, c.y + 1, 'root'),
  },
  {
    id: 'stem', emoji: '🎍', name: 'Stem', family: 'growth', chance: 0.35,
    condition: 'The cell above is free',
    effect: 'Grows one cell higher',
    cond: (c, w) => w.emptyAt(c.x, c.y - 1),
    act: (c, w) => w.place(c.x, c.y - 1, 'stem'),
  },

  /* ------------------------------ MOTION ---------------------------- */
  {
    id: 'walker', emoji: '🚶', name: 'Walker', family: 'movement', chance: 1,
    condition: 'The cell east of it is free',
    effect: 'Walks one cell east',
    cond: (c, w) => w.emptyAt(c.x + 1, c.y),
    act: (c, w) => w.move(c, w.norm(c.x + 1, c.y), 'walker'),
  },
  {
    id: 'runner', emoji: '🏃', name: 'Runner', family: 'movement', chance: 1,
    condition: 'The two cells east of it are free',
    effect: 'Sprints two cells east',
    cond: (c, w) => w.emptyAt(c.x + 1, c.y) && w.emptyAt(c.x + 2, c.y),
    act: (c, w) => w.move(c, w.norm(c.x + 2, c.y), 'runner'),
  },
  {
    id: 'jumper', emoji: '🐇', name: 'Jumper', family: 'movement', chance: 1,
    condition: 'A free cell two cells away diagonally',
    effect: 'Hops there, leaving its square empty',
    cond: (c, w) => DIRX.some(([dx, dy]) => w.emptyAt(c.x + dx * 2, c.y + dy * 2)),
    act: (c, w) => {
      const spots = DIRX.map(([dx, dy]) => w.norm(c.x + dx * 2, c.y + dy * 2))
        .filter((p) => p && w.emptyAt(p.x, p.y));
      const p = pick(spots);
      if (p) w.move(c, p, 'jumper');
    },
  },
  {
    id: 'drone', emoji: '🛸', name: 'Drone', family: 'movement', chance: 0.7,
    condition: 'Touches a Beacon',
    effect: 'Leaps two cells towards the Beacon',
    cond: (c, w) => touches(w, c.x, c.y, ['beacon']),
    act: (c, w) => {
      const b = findNeighbour(w, c.x, c.y, ['beacon']);
      if (!b) return;
      const dx = Math.sign(b.x - c.x);
      const dy = Math.sign(b.y - c.y);
      const p = w.norm(c.x + dx * 2, c.y + dy * 2);
      if (p && w.emptyAt(p.x, p.y)) w.move(c, p, 'drone');
    },
  },

  /* ------------------------------ ENERGY ---------------------------- */
  {
    id: 'sun', emoji: '☀️', name: 'Sun', family: 'energy', chance: 0.5,
    condition: 'At least one free neighbour',
    effect: 'Shines a Light into it',
    cond: (c, w) => freeAround(w, c.x, c.y).length > 0,
    act: (c, w) => w.spawn(freeAround(w, c.x, c.y), 'light'),
  },
  {
    id: 'light', emoji: '✨', name: 'Light', family: 'energy', chance: 1,
    condition: 'Always (it is a photon)',
    effect: 'Fades away one tick after it appears',
    cond: () => true,
    act: (c, w) => w.clear(c),
  },
  {
    id: 'battery', emoji: '🔋', name: 'Battery', family: 'energy', chance: 0.8,
    condition: 'Touches a Light and has a free neighbour',
    effect: 'Stores the charge and releases a Wire',
    cond: (c, w) => touches(w, c.x, c.y, ['light']) && freeAround(w, c.x, c.y).length > 0,
    act: (c, w) => w.spawn(freeAround(w, c.x, c.y), 'wire'),
  },
  {
    id: 'wire', emoji: '🔌', name: 'Wire', family: 'energy', chance: 0.9,
    condition: 'Touches a Battery',
    effect: 'Conducts: turns itself into Light',
    cond: (c, w) => touches(w, c.x, c.y, ['battery']),
    act: (c, w) => w.replace(c, 'light'),
  },
  {
    id: 'plasma', emoji: '⚡', name: 'Plasma', family: 'energy', chance: 0.6,
    condition: 'Touches a Wire or a Battery',
    effect: 'Overloads, flooding its free neighbours with Light',
    cond: (c, w) => touches(w, c.x, c.y, ['wire', 'battery']),
    act: (c, w) => freeAround(w, c.x, c.y).forEach((n) => w.place(n.x, n.y, 'light')),
  },

  /* ------------------------------- TIME ----------------------------- */
  {
    id: 'clock', emoji: '⏰', name: 'Clock', family: 'time', chance: 1,
    condition: 'Every second tick (tick is even)',
    effect: 'Rings: paints its free neighbours with Blink',
    cond: (c, w) => w.tick % 2 === 0 && freeAround(w, c.x, c.y).length > 0,
    act: (c, w) => freeAround(w, c.x, c.y).slice(0, 2).forEach((n) => w.place(n.x, n.y, 'blink')),
  },
  {
    id: 'blink', emoji: '💡', name: 'Blink', family: 'time', chance: 1,
    condition: 'Two ticks have passed since it lit up',
    effect: 'Switches itself off (goes dark again)',
    cond: (c, w) => w.age(c) >= 2,
    act: (c, w) => w.clear(c),
  },
  {
    id: 'fuel', emoji: '🕯️', name: 'Fuel', family: 'time', chance: 1,
    condition: 'Always (it is flammable)',
    effect: 'Ignites into Fire, spreading a Flame above',
    cond: () => true,
    act: (c, w) => {
      w.replace(c, 'fire');
      if (w.emptyAt(c.x, c.y - 1)) w.place(c.x, c.y - 1, 'fire');
    },
  },
  {
    id: 'egg', emoji: '🥚', name: 'Egg', family: 'time', chance: 1,
    condition: '4 ticks have passed since it was laid',
    effect: 'Hatches into a random small creature',
    cond: (c, w) => w.age(c) >= 4,
    act: (c, w) => w.replace(c, pick(['algae', 'butterfly', 'bee', 'spore'])),
  },
  {
    id: 'geyser', emoji: '💦', name: 'Geyser', family: 'time', chance: 1,
    condition: 'Every 5th tick',
    effect: 'Erupts, hurling Magma into its free neighbours',
    cond: (c, w) => w.tick % 5 === 0 && freeAround(w, c.x, c.y).length > 0,
    act: (c, w) => freeAround(w, c.x, c.y).slice(0, 3).forEach((n) => w.place(n.x, n.y, 'magma')),
  },
  {
    id: 'sundial', emoji: '🧭', name: 'Sundial', family: 'time', chance: 0.5,
    condition: 'Touches a Sun',
    effect: 'Aligns: becomes a Clock',
    cond: (c, w) => touches(w, c.x, c.y, ['sun']),
    act: (c, w) => w.replace(c, 'clock'),
  },

  /* ----------------------------- MUTATION --------------------------- */
  {
    id: 'mutator', emoji: '🧬', name: 'Mutator', family: 'mutation', chance: 0.35,
    condition: 'Touches another Mutator',
    effect: 'Mutates a living neighbour into a random cell',
    cond: (c, w) => countOf(w, c.x, c.y, 'mutator') >= 1 && around(w, c.x, c.y).some((n) => n.v),
    act: (c, w) => {
      const targets = around(w, c.x, c.y).filter((n) => n.v && n.v !== 'mutator');
      const t = pick(targets);
      if (t) w.replace(t, CELL_IDS[(Math.random() * CELL_IDS.length) | 0]);
    },
  },
  {
    id: 'mirror', emoji: '🪞', name: 'Mirror', family: 'mutation', chance: 0.4,
    condition: 'Touches a Mirror and another living cell',
    effect: 'Copies that cell into a free neighbour',
    cond: (c, w) =>
      countOf(w, c.x, c.y, 'mirror') >= 1 &&
      around(w, c.x, c.y).some((n) => n.v && n.v !== 'mirror') &&
      freeAround(w, c.x, c.y).length > 0,
    act: (c, w) => {
      const src = around(w, c.x, c.y).find((n) => n.v && n.v !== 'mirror');
      if (src) w.spawn(freeAround(w, c.x, c.y), src.v);
    },
  },
  {
    id: 'chimera', emoji: '🦎', name: 'Chimera', family: 'mutation', chance: 1,
    condition: 'Every 6th tick',
    effect: 'Cycles: Life → Algae → Spore → Wolf → Moss → Life',
    cond: (c, w) => w.tick % 6 === 0,
    act: (c, w) => {
      const cycle = ['life', 'algae', 'spore', 'wolf', 'moss'];
      w.replace(c, cycle[(cycle.indexOf(c.v) + 1) % cycle.length]);
    },
  },
  {
    id: 'echo', emoji: '🔁', name: 'Echo', family: 'mutation', chance: 0.5,
    condition: 'Touches a Light',
    effect: 'Repeats it: places a new Light further out',
    cond: (c, w) => touches(w, c.x, c.y, ['light']),
    act: (c, w) => {
      const l = findNeighbour(w, c.x, c.y, ['light']);
      if (!l) return;
      const dx = Math.sign(l.x - c.x);
      const dy = Math.sign(l.y - c.y);
      const p = w.norm(c.x + dx, c.y + dy);
      if (p && w.emptyAt(p.x, p.y)) w.place(p.x, p.y, 'light');
    },
  },
  {
    id: 'prism', emoji: '🌈', name: 'Prism', family: 'mutation', chance: 0.6,
    condition: 'Touches a Light',
    effect: 'Refracts it into four Lights in the cardinal directions',
    cond: (c, w) => touches(w, c.x, c.y, ['light']),
    act: (c, w) => dirTarget(w, c.x, c.y, DIR4).forEach((p) => w.place(p.x, p.y, 'light')),
  },

  /* ---------------------------- CHEMISTRY --------------------------- */
  {
    id: 'acid', emoji: '🧪', name: 'Acid', family: 'chemistry', chance: 0.5,
    condition: 'Touches a living cell that is not a Crystal',
    effect: 'Dissolves it and takes its form',
    cond: (c, w) => touches(w, c.x, c.y, CELL_IDS.filter((id) => id !== 'crystal' && id !== 'acid')),
    act: (c, w) => {
      const t = around(w, c.x, c.y).find((n) => n.v && n.v !== 'crystal' && n.v !== 'acid');
      if (!t) return;
      const kind = t.v;
      w.clear(t);
      w.replace(c, kind);
    },
  },
  {
    id: 'salt', emoji: '🧂', name: 'Salt', family: 'chemistry', chance: 0.5,
    condition: 'Touches Water',
    effect: 'Dries the Water into Salt',
    cond: (c, w) => touches(w, c.x, c.y, ['water']),
    act: (c, w) => {
      around(w, c.x, c.y).filter((n) => n.v === 'water').forEach((n) => w.replace(n, 'salt'));
    },
  },
  {
    id: 'crystal', emoji: '💎', name: 'Crystal', family: 'chemistry', chance: 0.18,
    condition: 'Touches a Crystal, has a free neighbour',
    effect: 'Grows one more facet',
    cond: (c, w) => countOf(w, c.x, c.y, 'crystal') >= 1 && freeAround(w, c.x, c.y).length > 0,
    act: (c, w) => w.spawn(freeAround(w, c.x, c.y), 'crystal'),
  },

  /* ----------------------------- ELEMENTS --------------------------- */
  {
    id: 'fire', emoji: '🔥', name: 'Fire', family: 'elements', chance: 0.9,
    condition: 'Touches something flammable — otherwise it dies out',
    effect: 'Spreads into the fuel, then burns out',
    cond: () => true,
    act: (c, w) => {
      const t = findNeighbour(w, c.x, c.y, ['moss', 'spore', 'tree', 'seed', 'fuel', 'bamboo', 'vine', 'blink', 'bee', 'flower']);
      if (t) w.replace(t, 'fire');
      else if (CHANCE(0.5)) w.clear(c);
    },
  },
  {
    id: 'water', emoji: '💧', name: 'Water', family: 'elements', chance: 0.9,
    condition: 'Touches Fire or Magma',
    effect: 'Boils into Steam',
    cond: (c, w) => touches(w, c.x, c.y, ['fire', 'magma']),
    act: (c, w) => w.replace(c, 'steam'),
  },
  {
    id: 'ice', emoji: '🧊', name: 'Ice', family: 'elements', chance: 0.4,
    condition: 'Touches Water and has a free neighbour',
    effect: 'Freezes the Water and creeps one cell outward',
    cond: (c, w) => touches(w, c.x, c.y, ['water']) && freeAround(w, c.x, c.y).length > 0,
    act: (c, w) => {
      around(w, c.x, c.y).filter((n) => n.v === 'water').forEach((n) => w.replace(n, 'ice'));
      w.spawn(freeAround(w, c.x, c.y), 'ice');
    },
  },
  {
    id: 'steam', emoji: '♨️', name: 'Steam', family: 'elements', chance: 0.9,
    condition: 'Always (it rises)',
    effect: 'Floats one cell up, then slowly dissolves',
    cond: () => true,
    act: (c, w) => {
      if (w.age(c) > 7 || CHANCE(0.3)) return w.clear(c);
      if (w.emptyAt(c.x, c.y - 1)) w.move(c, w.norm(c.x, c.y - 1), 'steam');
    },
  },
  {
    id: 'magma', emoji: '🌋', name: 'Magma', family: 'elements', chance: 0.8,
    condition: 'Touches Water or Ice',
    effect: 'Vaporises it into Steam',
    cond: (c, w) => touches(w, c.x, c.y, ['water', 'ice']),
    act: (c, w) => {
      around(w, c.x, c.y).filter((n) => ['water', 'ice'].includes(n.v)).forEach((n) => w.replace(n, 'steam'));
    },
  },

  /* ----------------------------- CREATURES -------------------------- */
  {
    id: 'wolf', emoji: '🐺', name: 'Wolf', family: 'creatures', chance: 0.5,
    condition: 'Touches Algae, a Flower or a Bee — starves after 25 ticks',
    effect: 'Eats it: the prey becomes another Wolf',
    cond: (c, w) => touches(w, c.x, c.y, ['algae', 'flower', 'bee']) || w.age(c) > 25,
    act: (c, w) => {
      const prey = findNeighbour(w, c.x, c.y, ['algae', 'flower', 'bee']);
      if (prey) w.replace(prey, 'wolf');
      else w.clear(c);
    },
  },
  {
    id: 'virus', emoji: '👾', name: 'Virus', family: 'creatures', chance: 0.5,
    condition: 'Touches a host that is not immune — starves after 15 ticks',
    effect: 'Infects the host: it becomes a Virus',
    cond: (c, w) =>
      around(w, c.x, c.y).some((n) => n.v && !VIRUS_IMMUNE.has(n.v)) || w.age(c) > 15,
    act: (c, w) => {
      const host = around(w, c.x, c.y).find((n) => n.v && !VIRUS_IMMUNE.has(n.v));
      if (host) w.replace(host, 'virus');
      else w.clear(c);
    },
  },
  {
    id: 'bee', emoji: '🐝', name: 'Bee', family: 'creatures', chance: 0.35,
    condition: 'Touches a Flower',
    effect: 'Pollinates: grows another Flower',
    cond: (c, w) => touches(w, c.x, c.y, ['flower']) && freeAround(w, c.x, c.y).length > 0,
    act: (c, w) => w.spawn(freeAround(w, c.x, c.y), 'flower'),
  },
  {
    id: 'butterfly', emoji: '🦋', name: 'Butterfly', family: 'creatures', chance: 0.6,
    condition: 'Touches a Flower or a Bee',
    effect: 'Flutters to a free neighbour',
    cond: (c, w) => touches(w, c.x, c.y, ['flower', 'bee']) && freeAround(w, c.x, c.y).length > 0,
    act: (c, w) => {
      const p = pick(freeAround(w, c.x, c.y));
      if (p) w.move(c, p, 'butterfly');
    },
  },

  /* ------------------------------ SOCIETY --------------------------- */
  {
    id: 'colonist', emoji: '🏠', name: 'Colonist', family: 'society', chance: 0.25,
    condition: 'Touches a Colonist and has room',
    effect: 'Founds another Colonist; with 3+ it becomes a Town',
    cond: (c, w) => countOf(w, c.x, c.y, 'colonist') >= 1 && freeAround(w, c.x, c.y).length > 0,
    act: (c, w) => {
      w.spawn(freeAround(w, c.x, c.y), 'colonist');
      if (countOf(w, c.x, c.y, 'colonist') >= 3) w.replace(c, 'town');
    },
  },
  {
    id: 'town', emoji: '🏘️', name: 'Town', family: 'society', chance: 0.3,
    condition: 'Touches a Colonist and has room',
    effect: 'Sends out a new Colonist',
    cond: (c, w) => touches(w, c.x, c.y, ['colonist']) && freeAround(w, c.x, c.y).length > 0,
    act: (c, w) => w.spawn(freeAround(w, c.x, c.y), 'colonist'),
  },
  {
    id: 'factory', emoji: '🏭', name: 'Factory', family: 'society', chance: 0.4,
    condition: 'Touches a Wire (it is powered)',
    effect: 'Assembles a Drone in a free neighbour',
    cond: (c, w) => touches(w, c.x, c.y, ['wire']) && freeAround(w, c.x, c.y).length > 0,
    act: (c, w) => w.spawn(freeAround(w, c.x, c.y), 'drone'),
  },
  {
    id: 'soldier', emoji: '🛡️', name: 'Soldier', family: 'society', chance: 0.9,
    condition: 'Touches a Wolf, Virus or Acid',
    effect: 'Destroys the threat and rests for 3 ticks',
    cond: (c, w) => touches(w, c.x, c.y, ['wolf', 'virus', 'acid']),
    act: (c, w) => {
      const t = findNeighbour(w, c.x, c.y, ['wolf', 'virus', 'acid']);
      if (t) {
        w.clear(t);
        w.cool(c, 3);
      }
    },
  },

  /* --------------------------- STRUCTURES --------------------------- */
  {
    id: 'wall', emoji: '🧱', name: 'Wall', family: 'structures', chance: 0.3,
    condition: 'Touches a Wall and has a free side',
    effect: 'Lays another brick next to it',
    cond: (c, w) => countOf(w, c.x, c.y, 'wall') >= 1 && freeAround(w, c.x, c.y, DIR4).length > 0,
    act: (c, w) => w.spawn(freeAround(w, c.x, c.y, DIR4), 'wall'),
  },
  {
    id: 'beacon', emoji: '🔆', name: 'Beacon', family: 'structures', chance: 0.7,
    condition: 'Has a free neighbour',
    effect: 'Sends a Light pulse outward (and attracts Drones)',
    cond: (c, w) => freeAround(w, c.x, c.y).length > 0,
    act: (c, w) => w.spawn(freeAround(w, c.x, c.y), 'light'),
  },
  {
    id: 'door', emoji: '🚪', name: 'Door', family: 'structures', chance: 1,
    condition: 'Touches a Walker or a Runner',
    effect: 'Opens: throws the traveller 2 cells forward',
    cond: (c, w) => touches(w, c.x, c.y, ['walker', 'runner']),
    act: (c, w) => {
      const t = findNeighbour(w, c.x, c.y, ['walker', 'runner']);
      if (!t) return;
      const dx = Math.sign(t.x - c.x);
      const dy = Math.sign(t.y - c.y);
      const p = w.norm(c.x + dx * 2, c.y + dy * 2);
      if (p && w.emptyAt(p.x, p.y)) {
        w.clear(t);
        w.place(p.x, p.y, t.v);
      }
    },
  },
];

/* ---------------------------------------------------------------- ---- */
const CELL_INDEX = Object.fromEntries(CELLS.map((c) => [c.id, c]));
const CELL_IDS = CELLS.map((c) => c.id);

/* Cells a Virus cannot infect */
const VIRUS_IMMUNE = new Set([
  'virus', 'fire', 'magma', 'water', 'ice', 'steam', 'crystal', 'acid', 'salt',
  'wall', 'door', 'light', 'blink', 'beacon', 'plasma',
]);

/* Crowding limits: a grower dies when it has more living neighbours than
   this. This is what keeps colonies, forests and slime from filling the
   whole grid — exactly the "certain conditions exist" idea. */
const CROWD = {
  life: 4, moss: 3, algae: 3, spore: 2, seed: 4, tree: 6, flower: 5,
  vine: 4, bamboo: 4, stem: 4, root: 5, crystal: 4, colonist: 5, town: 6,
  bee: 5, butterfly: 6, factory: 5, wall: 8,
};

/* family cell counts */
const FAMILY_IDS = Object.keys(FAMILIES);

/* fallbacks so the engine can treat all cells uniformly */
CELLS.forEach((cell, i) => {
  cell.order = i;
  cell.index = i + 1;
  if (cell.chance == null) cell.chance = 1;
  if (!cell.cond) cell.cond = () => false;
  if (!cell.act) cell.act = () => {};
});

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CELLS, CELL_INDEX, CELL_IDS, FAMILIES, FAMILY_IDS, VIRUS_IMMUNE, DIR4, CROWD };
}
