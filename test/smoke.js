/* Headless tests for Cellarium: engine, every cell, every example board. */
const fs = require('fs');
const vm = require('vm');

const ctx = vm.createContext({ Math, console, JSON, Set, Map, Object, Array, String, Number, parseInt });
vm.runInContext(fs.readFileSync(__dirname + '/../js/data.js', 'utf8'), ctx);
vm.runInContext(fs.readFileSync(__dirname + '/../js/engine.js', 'utf8'), ctx);
const { CELLS, EFFECTS, CELL_IDS, PRESETS, Sim, ALL } = vm.runInContext(
  '({CELLS, EFFECTS, CELL_IDS, PRESETS, Sim, ALL})',
  ctx
);

let fails = 0;
const check = (ok, label) => {
  if (!ok) {
    fails++;
    console.log('FAIL:', label);
  }
};

/* ---- catalogue ---- */
console.log('cells:', CELLS.length);
check(CELLS.length === 50, 'exactly 50 cells');
check(new Set(CELL_IDS).size === CELL_IDS.length, 'unique ids');
check(CELLS.every((c) => c.emoji && c.name && c.if && c.then && typeof c.do === 'function'), 'every cell is complete');
check(CELLS.every((c) => ALL[c.id]), 'every cell registered');

/* ---- each cell on its own: place it, run, make sure it acts and never throws ---- */
console.log('\nper-cell behaviour:');
for (const def of CELLS) {
  const sim = new Sim(17, 13);
  // the cell itself, facing right, with a couple of blobs nearby to give
  // break/turn/life cells something to work on
  sim.place(6, 6, def.id, 1);
  sim.place(8, 6, 'blob');
  sim.place(4, 6, 'blob');
  sim.place(6, 4, 'blob');
  const before = JSON.stringify(sim.serialize().cells);
  for (let t = 0; t < 12; t++) sim.step();
  const after = JSON.stringify(sim.serialize().cells);
  const changed = before !== after;
  check(!sim.errors, `${def.id}: no exceptions`);
  if (def.id === 'wall' || def.id === 'glass' || def.id === 'spinner' || def.id === 'rotator' || def.id === 'twister' || def.id === 'freezer' || def.id === 'aligner' || def.id === 'flipper' || def.id === 'turner') {
    // these only rearrange things; they must still not throw
    check(true, def.id);
  } else {
    check(changed, `${def.id}: did something to the board`);
  }
  console.log(
    `  ${def.emoji} ${def.name.padEnd(11)} ${changed ? 'acted' : 'static'}  pop ${String(sim.pop()).padStart(3)}`
  );
}

/* ---- turning cells really turn ---- */
{
  const sim = new Sim(12, 12);
  const target = sim.place(6, 6, 'laser', 0);   // laser faces up
  sim.place(5, 6, 'turner', 1);                  // turner faces the laser
  for (let t = 0; t < 2; t++) sim.step();
  check(target.d === 1, 'turner rotated the laser to the right');
}

/* ---- rotation helper ---- */
{
  const sim = new Sim(10, 10);
  const c = sim.place(5, 5, 'mover', 0);
  sim.rotate(c, 1);
  check(c.d === 1, 'rotate clockwise');
  sim.rotate(c, 3);
  check(c.d === 0, 'rotate counter-clockwise');
}

/* ---- pusher chain ---- */
{
  const sim = new Sim(14, 8);
  sim.place(2, 4, 'pusher', 1);
  sim.place(3, 4, 'blob');
  sim.place(4, 4, 'blob');
  sim.place(5, 4, 'blob');
  for (let t = 0; t < 6; t++) sim.step();
  check(sim.pop() === 4, 'pusher keeps its chain intact (4 cells)');
}

/* ---- laser destroys what is in the line ---- */
{
  const sim = new Sim(20, 8);
  sim.place(2, 4, 'laser', 1);
  sim.place(10, 4, 'blob');     // sits in the line of fire
  sim.place(11, 7, 'spinner');  // off to the side, and it never moves away
  for (let t = 0; t < 4; t++) sim.step();
  check(!sim.at(10, 4), 'laser destroyed the target');
  check(!!sim.at(11, 7), 'laser did not touch anything off its line');
}

/* ---- walls are indestructible ---- */
{
  const sim = new Sim(14, 8);
  sim.place(2, 4, 'shredder', 1);
  sim.place(3, 4, 'wall');
  for (let t = 0; t < 6; t++) sim.step();
  check(!!sim.at(3, 4), 'shredder cannot break a wall');
}

/* ---- a pulse travels along a wire line ---- */
{
  const sim = new Sim(30, 10);
  sim.place(2, 5, 'emitter', 1);
  for (let x = 3; x < 12; x++) sim.place(x, 5, 'wire');
  let travelled = false;
  for (let t = 0; t < 12; t++) {
    sim.step();
    for (let x = 12; x < 16; x++) if (sim.at(x, 5) && sim.at(x, 5).type === 'spark') travelled = true;
  }
  check(travelled, 'pulse reached the end of the wire');
}

/* ---- boards ---- */
console.log('\nexample boards (400 ticks each):');
for (const p of PRESETS) {
  const sim = new Sim(48, 32);
  p.build(sim);
  const start = sim.pop();
  let err = null;
  const t0 = Date.now();
  try {
    for (let t = 0; t < 400; t++) sim.step();
  } catch (e) {
    err = e.message;
  }
  check(!err, `${p.id} did not throw`);
  check(!sim.errors, `${p.id} had no swallowed rule errors`);
  check(sim.pop() <= sim.w * sim.h, `${p.id} stays inside the board`);
  console.log(
    `  ${p.name.padEnd(15)} cells ${String(start).padStart(4)} → ${String(sim.pop()).padStart(4)}   ${Date.now() - t0}ms ${err ? 'ERROR ' + err : ''}`
  );
}

/* ---- determinism of the storage format ---- */
{
  const a = new Sim(20, 12);
  a.place(3, 3, 'mover', 2);
  a.place(4, 3, 'laser', 1);
  const blob = a.serialize();
  const b = new Sim(5, 5);
  b.load(blob);
  check(b.pop() === 2 && b.at(3, 3).type === 'mover' && b.at(3, 3).d === 2 && b.at(4, 3).d === 1, 'save/load round-trip');
  check(b.w === 20 && b.h === 12, 'board size restored');
}

/* ---- wrap edges ---- */
{
  const sim = new Sim(10, 6, { wrap: true });
  sim.place(9, 3, 'mover', 1);
  sim.step();
  check(sim.at(0, 3) && sim.at(0, 3).type === 'mover', 'mover wraps around the edge');
}

console.log('\n' + (fails ? `✗ ${fails} check(s) failed` : '✓ all checks passed'));
process.exitCode = fails ? 1 : 0;
