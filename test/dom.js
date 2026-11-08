/* Headless UI test: runs render.js + app.js against a stubbed DOM and drives
   the real handlers (paint, rotate, run, undo, examples) to catch runtime
   errors that unit tests on the engine cannot see. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const noop = () => {};

function fakeCtx() {
  return new Proxy(
    {
      createLinearGradient: () => ({ addColorStop: noop }),
      createRadialGradient: () => ({ addColorStop: noop }),
      measureText: () => ({ width: 8 }),
    },
    {
      get(t, k) {
        if (k in t) return t[k];
        return noop;
      },
      set(t, k, v) {
        t[k] = v;
        return true;
      },
    }
  );
}

const store = new Map();
function makeEl(id = '') {
  const classes = new Set();
  const el = {
    id,
    dataset: {},
    style: {},
    children: [],
    disabled: false,
    hidden: false,
    value: '10',
    _html: '',
    textContent: '',
    width: 800,
    height: 600,
    classList: {
      add: (...c) => c.forEach((x) => classes.add(x)),
      remove: (...c) => c.forEach((x) => classes.delete(x)),
      toggle: (c, on) => {
        if (on === undefined) classes.has(c) ? classes.delete(c) : classes.add(c);
        else on ? classes.add(c) : classes.delete(c);
      },
      contains: (c) => classes.has(c),
      _set: classes,
    },
    get innerHTML() { return el._html; },
    set innerHTML(v) { el._html = String(v); },
    addEventListener: (type, fn) => {
      const key = (id || 'window') + ':' + type;
      if (!store.has(key)) store.set(key, []);
      store.get(key).push(fn);
    },
    appendChild: (c) => { el.children.push(c); return c; },
    setPointerCapture: noop,
    releasePointerCapture: noop,
    getBoundingClientRect: () => ({ width: 800, height: 600, left: 0, top: 0, right: 800, bottom: 600 }),
    getContext: () => fakeCtx(),
    matches: () => false,
    closest: () => null,
    scrollIntoView: noop,
    querySelector: () => makeEl(),
    querySelectorAll: () => [],
  };
  return el;
}

const nodes = new Map();
const document = {
  querySelector: (sel) => {
    if (!nodes.has(sel)) nodes.set(sel, makeEl(sel.replace(/^#/, '')));
    return nodes.get(sel);
  },
  querySelectorAll: () => [],
  createElement: () => makeEl(),
  addEventListener: (t, fn) => {
    const key = 'document:' + t;
    if (!store.has(key)) store.set(key, []);
    store.get(key).push(fn);
  },
};

const win = {
  devicePixelRatio: 1,
  addEventListener: (t, fn) => {
    const key = 'window:' + t;
    if (!store.has(key)) store.set(key, []);
    store.get(key).push(fn);
  },
  innerWidth: 1280,
  innerHeight: 800,
};
win.document = document;

const raf = [];
const sandbox = {
  Math, console, JSON, Set, Map, Object, Array, String, Number, parseInt, parseFloat, isNaN, Date,
  document, window: win, performance: { now: () => Date.now() },
  requestAnimationFrame: (fn) => raf.push(fn) && raf.length,
  setTimeout: () => 1,
  clearTimeout: noop,
  devicePixelRatio: 1,
};
sandbox.globalThis = sandbox;
const ctx = vm.createContext(sandbox);

const errors = [];
for (const f of ['data.js', 'engine.js', 'render.js', 'app.js']) {
  try {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f });
  } catch (e) {
    errors.push(`${f}: ${e.stack}`);
  }
}

const fire = (key, evt) => {
  for (const fn of store.get(key) || []) {
    try {
      fn(evt);
    } catch (e) {
      errors.push(`${key}: ${e.stack.split('\n').slice(0, 3).join(' | ')}`);
    }
  }
};

/* simulate the user: choose cells, paint, rotate, step, run, undo, presets */
const sim = vm.runInContext('sim', ctx);
const ui = vm.runInContext('ui', ctx);
const canvas = document.querySelector('#board');

const ids = vm.runInContext('CELL_IDS', ctx);
const cellAt = (x, y) => ({ clientX: 100 + x * 16, clientY: 100 + y * 16 });

/* paint every cell type somewhere, rotating as we go */
fire('#board:pointerdown', { clientX: 100, clientY: 100, button: 0, pointerId: 1 });
fire('window:pointerup', {});
ids.forEach((id, i) => {
  try {
    vm.runInContext(`selectBrush(${JSON.stringify(id)})`, ctx);
  } catch (e) {
    errors.push(`selectBrush(${id}): ${e.message}`);
  }
  fire('#board:pointerdown', { clientX: 40 + (i % 40) * 16, clientY: 40 + ((i / 40) | 0) * 16, button: 0, pointerId: 1 });
  fire('window:pointerup', {});
});
fire('#rotate:click', {});
fire('#board:pointerdown', { clientX: 300, clientY: 300, button: 2, pointerId: 2 }); // right-click rotate
fire('window:pointerup', {});

/* run a bunch of ticks through the real frame loop */
fire('#run:click', {});
for (let i = 0; i < 60; i++) {
  const fn = raf.shift();
  if (!fn) break;
  try {
    fn(Date.now() + i * 40);
  } catch (e) {
    errors.push('frame: ' + e.stack.split('\n').slice(0, 3).join(' | '));
    break;
  }
}

fire('#step:click', {});
fire('#undo:click', {});
fire('#clear:click', {});
fire('#wrap:click', { currentTarget: makeEl('wrap') });
fire('#help:click', {});
fire('#modal-close:click', {});

/* examples */
const presetIds = vm.runInContext('PRESETS.map(p => p.id)', ctx);
for (const id of presetIds) {
  try {
    vm.runInContext(`loadPreset(${JSON.stringify(id)})`, ctx);
    for (let t = 0; t < 30; t++) vm.runInContext('sim.step()', ctx);
  } catch (e) {
    errors.push(`preset ${id}: ${e.message}`);
  }
}

/* keyboard */
for (const key of [' ', 's', 'r', 'c', 'e', '?']) {
  fire('window:keydown', {
    key,
    code: key === ' ' ? 'Space' : undefined,
    shiftKey: false,
    target: { matches: () => false },
    preventDefault: noop,
  });
}

/* pointer movement over the board (tooltip + hover) */
fire('#board:pointermove', { clientX: 200, clientY: 200 });
fire('#board:pointerleave', {});

console.log('board size:', sim.w + '×' + sim.h);
console.log('brush:', ui.brush, 'dir:', ui.dir);
console.log('UI errors:', errors.length ? '\n' + errors.join('\n') : 'none');
process.exitCode = errors.length ? 1 : 0;
