/* Headless DOM harness: runs render.js + app.js against a stub document so
   we catch runtime errors in the UI code paths (no real browser needed). */
const fs = require('fs');
const vm = require('vm');

function fakeCtx() {
  const noop = () => {};
  return new Proxy(
    {
      canvas: { width: 600, height: 400 },
      createLinearGradient: () => ({ addColorStop: noop }),
      measureText: () => ({ width: 10 }),
      getImageData: () => ({ data: [] }),
      setTransform: noop,
      save: noop,
      restore: noop,
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

const listeners = new Map();
function makeEl(tag = 'div', sel = '') {
  const classes = new Set();
  const el = {
    tagName: tag.toUpperCase(),
    sel,
    children: [],
    dataset: {},
    style: {},
    _html: '',
    textContent: '',
    title: '',
    value: '',
    hidden: false,
    width: 600,
    height: 400,
    classList: {
      add: (...c) => c.forEach((x) => classes.add(x)),
      remove: (...c) => c.forEach((x) => classes.delete(x)),
      toggle: (c, on) => (on === undefined ? (classes.has(c) ? classes.delete(c) : classes.add(c)) : on ? classes.add(c) : classes.delete(c)),
      contains: (c) => classes.has(c),
    },
    get innerHTML() {
      return el._html;
    },
    set innerHTML(v) {
      el._html = String(v);
    },
    addEventListener: (type, fn) => {
      const key = sel + ':' + type;
      if (!listeners.has(key)) listeners.set(key, []);
      listeners.get(key).push(fn);
    },
    removeEventListener: () => {},
    appendChild: (c) => {
      el.children.push(c);
      return c;
    },
    removeChild: () => {},
    setPointerCapture: () => {},
    getBoundingClientRect: () => ({ width: 720, height: 480, left: 0, top: 0, right: 720, bottom: 480 }),
    getContext: () => fakeCtx(),
    scrollIntoView: () => {},
    focus: () => {},
    closest: () => null,
    matches: () => false,
    querySelector: () => makeEl(),
    querySelectorAll: () => [],
  };
  return el;
}

const registry = new Map();
function bySelector(sel) {
  if (!registry.has(sel)) registry.set(sel, makeEl('div', sel));
  return registry.get(sel);
}

const document = {
  querySelector: (sel) => bySelector(sel),
  querySelectorAll: () => [],
  createElement: (tag) => makeEl(tag, 'created:' + tag),
  addEventListener: () => {},
  body: makeEl('body'),
};
const windowObj = {
  addEventListener: () => {},
  devicePixelRatio: 1,
  localStorage: {
    _d: {},
    getItem(k) { return this._d[k] || null; },
    setItem(k, v) { this._d[k] = v; },
  },
  innerWidth: 1440,
  innerHeight: 900,
};

let rafCount = 0;
const rafQueue = [];
function requestAnimationFrame(fn) {
  rafQueue.push(fn);
  return rafQueue.length;
}

const sandbox = {
  Math,
  console,
  JSON,
  Set,
  Map,
  Object,
  Array,
  String,
  Number,
  Date,
  parseInt,
  parseFloat,
  isNaN,
  document,
  window: windowObj,
  localStorage: windowObj.localStorage,
  performance: { now: () => Date.now() },
  requestAnimationFrame,
  setTimeout: (fn) => { try { fn(); } catch (e) { console.error('setTimeout cb error:', e.message); } return 1; },
  clearTimeout: () => {},
  devicePixelRatio: 1,
};
sandbox.globalThis = sandbox;
windowObj.document = document;

const ctx = vm.createContext(sandbox);

const errors = [];
for (const f of ['js/data.js', 'js/engine.js', 'js/render.js', 'js/app.js']) {
  try {
    vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
  } catch (e) {
    errors.push(`${f}: ${e.stack}`);
  }
}

// Drive the animation loop ~40 frames so the running simulation executes.
for (let i = 0; i < 40; i++) {
  const fn = rafQueue.shift();
  if (!fn) break;
  try {
    fn(Date.now() + i * 60);
  } catch (e) {
    errors.push('loop: ' + e.stack);
    break;
  }
}

const worldAfterFrames = vm.runInContext('world', ctx);
console.log('BEFORE handlers -> tick', worldAfterFrames.tick, 'pop', worldAfterFrames.population(), 'uses', worldAfterFrames.lastUses, 'log', worldAfterFrames.log.length);

// Fire the click handlers we registered for key controls.
for (const [key, fns] of listeners) {
  if (!/btn-play|btn-step|btn-clear|presets|stamp|family-tabs|palette-list|btn-catalog/.test(key)) continue;
  for (const fn of fns) {
    for (const evt of [
      { target: { closest: () => null, dataset: {}, matches: () => false }, currentTarget: bySelector(key.split(':')[0]), preventDefault() {} },
      { target: { closest: () => ({ dataset: { family: 'life' } }), dataset: {}, matches: () => false }, currentTarget: bySelector(key.split(':')[0]), preventDefault() {} },
      { target: { closest: () => ({ dataset: { goto: 'wolf' } }), id: 'catalog-modal', dataset: {}, matches: () => false }, currentTarget: bySelector(key.split(':')[0]), preventDefault() {} },
    ]) {
      try {
        fn(evt);
      } catch (e) {
        errors.push(`handler ${key}: ${e.stack.split('\n').slice(0, 3).join(' | ')}`);
      }
    }
  }
}

const world = vm.runInContext('world', ctx);
console.log('UI errors:', errors.length ? '\n' + errors.join('\n\n') : 'none');
if (world) {
  console.log('world after loop: tick', world.tick, 'pop', world.population(), 'uses', world.lastUses);
  console.log('log entries', world.log.length, 'history', vm.runInContext('state.history.length', ctx));
}
process.exitCode = errors.length ? 1 : 0;
