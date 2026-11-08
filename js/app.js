/* =====================================================================
   CELLARIUM — app
   ===================================================================== */

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const COLS = 48;
const ROWS = 32;

const sim = new Sim(COLS, ROWS);
const canvas = $('#board');
const renderer = new Renderer(canvas, sim);

const ui = {
  brush: 'mover',
  dir: 1,
  tool: 'paint',     // paint | erase
  size: 1,
  running: false,
  speed: 10,
  hover: null,
  painting: false,
  rightClick: false,
  lastPaint: null,
  undo: [],
};

/* ------------------------------------------------------------------ */
/*  Palette                                                           */
/* ------------------------------------------------------------------ */
function buildPalette() {
  const box = $('#palette');
  box.innerHTML = '';
  for (const gid of PALETTE_GROUPS) {
    const fam = FAMILIES[gid];
    const title = document.createElement('div');
    title.className = 'group-title';
    title.innerHTML = `<i style="background:${fam.color}"></i>${fam.label}`;
    box.appendChild(title);

    for (const def of CELLS.filter((c) => c.family === gid)) {
      const b = document.createElement('button');
      b.className = 'cell-btn';
      b.dataset.id = def.id;
      b.innerHTML = `
        <span class="e">${def.emoji}${def.dir ? '<em>⟳</em>' : ''}</span>
        <span>
          <span class="n">${def.name}</span><br>
          <span class="r">${def.if}</span>
        </span>`;
      b.addEventListener('click', () => selectBrush(def.id));
      box.appendChild(b);
    }
  }
  refreshPalette();
}

function selectBrush(id) {
  ui.brush = id;
  ui.tool = 'paint';
  const def = CELL_INDEX[id];
  if (def && def.dir && ui.dir == null) ui.dir = 1;
  refreshPalette();
  syncTools();
}

function refreshPalette() {
  for (const b of $$('.cell-btn')) b.classList.toggle('is-on', b.dataset.id === ui.brush);
  const def = CELL_INDEX[ui.brush];
  if (!def) return;
  $('#brush-emoji').textContent = def.emoji;
  $('#brush-name').textContent = def.name;
  $('#brush-rule').textContent = `If ${def.if} → ${def.then}`;
  const badge = $('#brush-dir');
  if (def.dir) {
    badge.style.display = '';
    badge.textContent = DIR_GLYPH[ui.dir];
  } else {
    badge.style.display = 'none';
  }
  renderer.ghost = ui.tool === 'erase'
    ? { type: null }
    : { type: def.id, d: def.dir ? ui.dir : null };
  renderer.brushSize = ui.size;
  canvas.style.cursor = ui.tool === 'erase' ? 'not-allowed' : 'crosshair';
}

function syncTools() {
  $$('.mini[data-tool]').forEach((b) => b.classList.toggle('is-on', b.dataset.tool === ui.tool));
  $$('.mini[data-size]').forEach((b) => b.classList.toggle('is-on', +b.dataset.size === ui.size));
  refreshPalette();
}

/* ------------------------------------------------------------------ */
/*  Painting                                                          */
/* ------------------------------------------------------------------ */
function snapshot() {
  ui.undo.push({ blob: sim.serialize(), tick: sim.tick });
  if (ui.undo.length > 40) ui.undo.shift();
  $('#undo').disabled = false;
}

function doUndo() {
  const entry = ui.undo.pop();
  if (!entry) return;
  sim.load(entry.blob);
  renderer.resize();
  renderer.draw();
  updateStats();
  $('#undo').disabled = ui.undo.length === 0;
}

function paintAt(p, erase) {
  if (!p) return;
  const r = (ui.size - 1) / 2;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const x = p.x + dx;
      const y = p.y + dy;
      if (!sim.inside(x, y)) continue;
      if (erase) sim.destroy(x, y, true);
      else sim.place(x, y, ui.brush, CELL_INDEX[ui.brush].dir ? ui.dir : null);
    }
  }
  renderer.draw();
  updateStats();
}

function rotatePlaced(p) {
  const c = sim.at(p.x, p.y);
  if (!c) return;
  const def = ALL[c.type];
  if (!def || !def.dir) return;
  sim.rotate(c, 1);
  renderer.draw();
}

canvas.addEventListener('pointerdown', (e) => {
  const p = renderer.cellFromEvent(e.clientX, e.clientY);
  if (!p) return;
  canvas.setPointerCapture(e.pointerId);

  if (e.button === 2) {
    // right-click turns a placed cell, or erases if the square is empty
    ui.rightClick = true;
    const c = sim.at(p.x, p.y);
    if (c && ALL[c.type] && ALL[c.type].dir) rotatePlaced(p);
    else {
      snapshot();
      paintAt(p, true);
    }
    return;
  }
  ui.painting = true;
  snapshot();
  paintAt(p, ui.tool === 'erase');
  ui.lastPaint = p;
});

canvas.addEventListener('pointermove', (e) => {
  const p = renderer.cellFromEvent(e.clientX, e.clientY);
  renderer.hover = p;
  ui.hover = p;

  if (ui.painting && p && (!ui.lastPaint || p.x !== ui.lastPaint.x || p.y !== ui.lastPaint.y)) {
    paintAt(p, ui.tool === 'erase');
    ui.lastPaint = p;
  }

  const tip = $('#tip');
  if (p) {
    const c = sim.at(p.x, p.y);
    if (c) {
      const def = ALL[c.type];
      const dirTxt = c.d != null ? ` ${DIR_GLYPH[c.d]}` : '';
      const frozen = c.frozen > 0 ? ` · frozen ${c.frozen}` : '';
      tip.innerHTML = `<b>${def.emoji} ${def.name}${dirTxt}</b> — if ${def.if} → ${def.then}${frozen}`;
      tip.classList.add('is-on');
      const r = canvas.getBoundingClientRect();
      tip.style.left = e.clientX - r.left + 'px';
      tip.style.top = e.clientY - r.top + 'px';
    } else {
      tip.classList.remove('is-on');
    }
  } else {
    tip.classList.remove('is-on');
  }
  renderer.draw();
});

window.addEventListener('pointerup', () => {
  ui.painting = false;
  ui.rightClick = false;
  ui.lastPaint = null;
});

canvas.addEventListener('pointerleave', () => {
  ui.painting = false;
  renderer.hover = null;
  ui.hover = null;
  $('#tip').classList.remove('is-on');
  renderer.draw();
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

/* ------------------------------------------------------------------ */
/*  Stats                                                             */
/* ------------------------------------------------------------------ */
let lastPop = -1;
function updateStats() {
  $('#s-tick').textContent = sim.tick;
  const pop = sim.pop();
  if (pop !== lastPop) {
    $('#s-pop').textContent = pop;
    lastPop = pop;
  }
}

/* ------------------------------------------------------------------ */
/*  Running                                                           */
/* ------------------------------------------------------------------ */
let acc = 0;
let lastT = performance.now();

function setRunning(on) {
  ui.running = on;
  const b = $('#run');
  b.classList.toggle('is-running', on);
  $('#run-icon').textContent = on ? '❚❚' : '▶';
  $('#run-text').textContent = on ? 'Pause' : 'Run';
}

function frame(now) {
  const dt = now - lastT;
  lastT = now;
  if (ui.running) {
    acc += dt;
    const interval = 1000 / ui.speed;
    let steps = 0;
    while (acc >= interval && steps < 5) {
      sim.step();
      acc -= interval;
      steps++;
    }
    if (steps) {
      renderer.draw();
      updateStats();
    }
  }
  requestAnimationFrame(frame);
}

$('#run').addEventListener('click', () => {
  if (!ui.running) acc = 0;
  setRunning(!ui.running);
});
$('#step').addEventListener('click', () => {
  sim.step();
  renderer.draw();
  updateStats();
});
$('#speed').addEventListener('input', (e) => {
  ui.speed = +e.target.value;
  $('#speed-v').textContent = ui.speed;
});

$('#clear').addEventListener('click', () => {
  snapshot();
  sim.clear();
  setRunning(false);
  renderer.draw();
  updateStats();
  flash('Board cleared');
  updateUndo();
});

$('#undo').addEventListener('click', doUndo);

$('#rotate').addEventListener('click', () => {
  ui.dir = (ui.dir + 1) % 4;
  refreshPalette();
});

$('#wrap').addEventListener('click', (e) => {
  sim.wrap = !sim.wrap;
  e.currentTarget.textContent = `Wrap: ${sim.wrap ? 'on' : 'off'}`;
  e.currentTarget.classList.toggle('is-on', sim.wrap);
});

/* tools + brush size */
$$('.mini[data-size]').forEach((b) =>
  b.addEventListener('click', () => {
    ui.size = +b.dataset.size;
    syncTools();
  })
);
$$('.mini[data-tool]').forEach((b) =>
  b.addEventListener('click', () => {
    ui.tool = b.dataset.tool;
    syncTools();
  })
);

function updateUndo() {
  $('#undo').disabled = ui.undo.length === 0;
}

/* ------------------------------------------------------------------ */
/*  Example boards                                                    */
/* ------------------------------------------------------------------ */
function buildExamples() {
  const box = $('#examples');
  for (const p of PRESETS) {
    const b = document.createElement('button');
    b.className = 'example';
    b.dataset.preset = p.id;
    b.innerHTML = `${p.emoji} ${p.name}`;
    b.title = p.hint || '';
    b.addEventListener('click', () => loadPreset(p.id));
    box.appendChild(b);
  }
}

function loadPreset(id) {
  const p = PRESETS.find((x) => x.id === id);
  if (!p) return;
  setRunning(false);
  sim.clear();
  p.build(sim);
  ui.undo = [];
  updateUndo();
  renderer.resize();
  renderer.draw();
  updateStats();
  flash(p.id === 'blank' ? 'Blank board — paint something' : `${p.name} loaded — press Run`);
}

let flashTimer;
function flash(text) {
  const h = $('#hint');
  h.textContent = text;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => {
    h.textContent = 'Left-click to paint · right-click rotates a cell (empty square: erases) · R rotates the brush · Space runs';
  }, 4000);
}

/* ------------------------------------------------------------------ */
/*  Help                                                              */
/* ------------------------------------------------------------------ */
function buildCheatsheet() {
  $('#cheatsheet').innerHTML = CELLS.map(
    (c) => `<div class="cheat"><span>${c.emoji}</span><b>${c.name}</b><em>${c.if}</em></div>`
  ).join('');
}

$('#help').addEventListener('click', () => {
  buildCheatsheet();
  $('#modal').hidden = false;
});
$('#modal-close').addEventListener('click', () => ($('#modal').hidden = true));
$('#modal').addEventListener('click', (e) => {
  if (e.target.id === 'modal') $('#modal').hidden = true;
});

/* ------------------------------------------------------------------ */
/*  Keyboard                                                          */
/* ------------------------------------------------------------------ */
window.addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea')) return;
  const k = e.key.toLowerCase();

  if (e.code === 'Space') {
    e.preventDefault();
    if (!ui.running) acc = 0;
    setRunning(!ui.running);
  }
  if (k === 's') {
    sim.step();
    renderer.draw();
    updateStats();
  }
  if (k === 'r') {
    ui.dir = (ui.dir + (e.shiftKey ? 3 : 1)) % 4;
    refreshPalette();
  }
  if (k === 'c') {
    snapshot();
    sim.clear();
    setRunning(false);
    renderer.draw();
    updateStats();
    updateUndo();
  }
  if (k === 'z' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    doUndo();
  }
  if (k === 'e') {
    ui.tool = ui.tool === 'erase' ? 'paint' : 'erase';
    syncTools();
  }
  if (k === 'escape') $('#modal').hidden = true;
  if (k === '?') {
    buildCheatsheet();
    $('#modal').hidden = false;
  }
});

/* ------------------------------------------------------------------ */
/*  Boot                                                              */
/* ------------------------------------------------------------------ */
window.addEventListener('resize', () => {
  renderer.resize();
  renderer.draw();
});

buildPalette();
buildExamples();
buildCheatsheet();
syncTools();
updateUndo();
setRunning(false);
loadPreset('blank');
requestAnimationFrame(frame);
