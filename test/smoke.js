/* Headless smoke test: loads the browser files in a VM, simulates ticks,
   and reports errors + population behaviour for every preset. */
const fs = require('fs');
const vm = require('vm');

const ctx = vm.createContext({ Math, console, JSON, Set, Map, Object, Array, String, Number, parseInt, performance: { now: () => Date.now() } });
ctx.global = ctx;

for (const f of ['js/data.js', 'js/engine.js']) {
  vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
}

const { CELLS, CELL_IDS, CELL_INDEX, PRESETS, World, FAMILIES } = vm.runInContext(
  '({CELLS, CELL_IDS, CELL_INDEX, PRESETS, World, FAMILIES})',
  ctx
);

console.log('cells:', CELLS.length);
const ids = CELLS.map((c) => c.id);
console.log('duplicate ids:', ids.filter((v, i) => ids.indexOf(v) !== i));
console.log('missing cond/act:', CELLS.filter((c) => !c.cond || !c.act).map((c) => c.id));
console.log('bad family:', CELLS.filter((c) => !FAMILIES[c.family]).map((c) => c.id));
console.log('emoji check:', CELLS.filter((c) => !c.emoji).map((c) => c.id));

// ---- per-cell isolated test: place a cell on an empty grid, run 60 ticks
const results = [];
for (const id of ids) {
  const w = new World(24, 18);
  w.place(12, 9, id);
  // sprinkle plausible partners so conditions can fire
  const partners = ['water', 'light', 'battery', 'wire', 'beacon', 'flower', 'algae', 'moss', 'wolf', 'egg', 'mutator', 'mirror', 'crystal', 'sun', 'fire', 'magma'];
  for (let k = 0; k < 120; k++) {
    const x = (Math.random() * 24) | 0;
    const y = (Math.random() * 18) | 0;
    if (w.emptyAt(x, y)) w.place(x, y, partners[(Math.random() * partners.length) | 0]);
  }
  const before = w.reactions;
  let error = null;
  try {
    for (let t = 0; t < 60; t++) w.step();
  } catch (e) {
    error = e.message;
  }
  results.push({ id, error, uses: w.reactions - before, pop: w.population(), distinct: Object.keys(w.byType).filter((k) => w.byType[k] > 0).length });
}
const errored = results.filter((r) => r.error);
console.log('\nisolated-cell errors:', errored.length ? errored : 'none');

// ---- presets
console.log('\npresets:');
for (const p of PRESETS) {
  const w = new World(60, 40);
  p.build(w);
  w.recount();
  const pop0 = w.population();
  let error = null;
  const t0 = Date.now();
  try {
    for (let t = 0; t < 120; t++) w.step();
  } catch (e) {
    error = e.message;
  }
  console.log(
    `${p.id.padEnd(10)} pop ${String(pop0).padStart(5)} -> ${String(w.population()).padStart(5)}  uses ${String(w.reactions).padStart(6)}  ${Date.now() - t0}ms  ${error ? 'ERROR ' + error : ''}`
  );
}

// ---- long-run stability
const w = new World(60, 40);
PRESETS.find((p) => p.id === 'soup').build(w);
let maxPop = 0;
for (let t = 0; t < 600; t++) {
  w.step();
  maxPop = Math.max(maxPop, w.population());
}
console.log('\n600 ticks of soup ok. final pop', w.population(), 'reactions', w.reactions, 'peak', maxPop);

// serialize round trip
const blob = w.serialize();
const w2 = new World(10, 10);
w2.load(blob);
console.log('serialize round-trip pop match:', w.population() === w2.population(), blob.w + 'x' + blob.h);
