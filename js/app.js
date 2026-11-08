/* =====================================================================
   CELLARIUM — app wiring
   ===================================================================== */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const canvas = $('#grid');
let world = new World(60, 40);
let renderer = new Renderer(canvas, world);

const state = {
  selected: 'life',
  tool: 'paint',
  brush: 1,
  running: false,
  speed: 8,
  family: 'all',
  search: '',
  hoverCell: null,
  lastPaint: null,
  tickDelta: 0,
  stamp: null,
  rightErase: false,
  history: [],
};

/* ------------------------------------------------------------------ */
/*  Palette                                                            */
/* ------------------------------------------------------------------ */
function buildFamilyTabs() {
  const box = $('#family-tabs');
  const all = document.createElement('button');
  all.className = 'tab is-active';
  all.dataset.family = 'all';
  all.textContent = `All 50`;
  box.appendChild(all);

  for (const [id, fam] of Object.entries(FAMILIES)) {
    const b = document.createElement('button');
    b.className = 'tab';
    b.dataset.family = id;
    b.textContent = fam.label;
    box.appendChild(b);
  }
  box.addEventListener('click', (e) => {
    const t = e.target.closest('.tab');
    if (!t) return;
    $$('.tab').forEach((x) => x.classList.toggle('is-active', x === t));
    state.family = t.dataset.family;
    renderPalette();
  });
}

function renderPalette() {
  const box = $('#palette-list');
  const q = state.search.toLowerCase().trim();
  box.innerHTML = '';
  const visible = CELLS.filter((c) => {
    if (state.family !== 'all' && c.family !== state.family) return false;
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      c.id.includes(q) ||
      c.condition.toLowerCase().includes(q) ||
      c.effect.toLowerCase().includes(q)
    );
  });

  $('#palette-count').textContent = visible.length;

  for (const def of visible) {
    const row = document.createElement('div');
    row.className = 'cell-entry' + (def.id === state.selected ? ' is-active' : '');
    row.dataset.id = def.id;
    const pop = world.byType[def.id] || 0;
    row.innerHTML = `
      <div class="emoji-chip" style="box-shadow: inset 0 0 0 1px ${FAMILIES[def.family].color}44">${def.emoji}</div>
      <div class="entry-text">
        <div class="entry-name">${def.name}</div>
        <div class="entry-cond">${def.condition}</div>
      </div>
      <div class="entry-pop ${pop ? 'has' : ''}" data-pop="${def.id}">${pop || ''}</div>`;
    row.addEventListener('click', () => selectCell(def.id));
    box.appendChild(row);
  }
}

function selectCell(id) {
  state.selected = id;
  state.tool = 'paint';
  state.stamp = null;
  $$('.stamp').forEach((b) => b.classList.remove('is-armed'));
  $$('.tool[data-tool]').forEach((b) => b.classList.toggle('is-active', b.dataset.tool === 'paint'));
  $$('.cell-entry').forEach((r) => r.classList.toggle('is-active', r.dataset.id === id));
  renderInspector();
}

/* ------------------------------------------------------------------ */
/*  Inspector                                                          */
/* ------------------------------------------------------------------ */
function effectiveChance(def) {
  const rate = world.rates[def.id] == null ? 1 : world.rates[def.id];
  return Math.min(1, def.chance * rate);
}

function inspectHTML(def) {
  const fam = FAMILIES[def.family];
  const rate = world.rates[def.id] == null ? 1 : world.rates[def.id];
  return `<div class="inspect-card">
    <div class="inspect-emoji">${def.emoji}</div>
    <div>
      <div class="inspect-name">${def.name}</div>
      <div class="inspect-fam" style="color:${fam.color}">${fam.label}</div>
    </div>
  </div>
  <div class="inspect-row"><b>Condition · IF</b><span class="tag-if">${def.condition}</span></div>
  <div class="inspect-row"><b>Use · THEN</b><span class="tag-then">${def.effect}</span></div>
  <div class="mini-stats">
    <div class="mini-stat"><span>ON GRID</span><b>${world.byType[def.id] || 0}</b></div>
    <div class="mini-stat"><span>USE CHANCE</span><b>${Math.round(effectiveChance(def) * 100)}%</b></div>
    <div class="mini-stat"><span>Nº</span><b>${String(def.index).padStart(2, '0')}</b></div>
  </div>
  <h3 class="sec-title" style="margin-top:12px">Tune this cell</h3>
  <label class="slider-row">
    <span>Use rate</span>
    <b id="rate-label">${rate === 1 ? '1.0× (default)' : rate.toFixed(1) + '×'}</b>
    <input type="range" id="rate-slider" min="0" max="3" step="0.1" value="${rate}" />
  </label>
  <button class="btn btn-ghost" id="rate-reset" style="width:100%;justify-content:center">↺ Reset to default</button>`;
}

function renderInspector() {
  const def = CELL_INDEX[state.selected];
  $('#inspect-brush').innerHTML = def ? inspectHTML(def) : '';
  if (def) {
    const slider = $('#rate-slider');
    if (slider) {
      slider.addEventListener('input', () => {
        const v = +slider.value;
        world.rates[def.id] = v;
        $('#rate-label').textContent = v === 1 ? '1.0× (default)' : v.toFixed(1) + '×';
      });
      slider.addEventListener('change', renderInspector);
    }
    const reset = $('#rate-reset');
    if (reset) {
      reset.addEventListener('click', () => {
        delete world.rates[def.id];
        renderInspector();
      });
    }
  }
  renderCursorInspect();
  $('#foot-sel').textContent = def ? `${def.emoji} ${def.name}` : '—';
}

function renderCursorInspect() {
  const box = $('#inspect-cursor');
  const p = state.hoverCell;
  if (!p) {
    box.innerHTML = `<h3 class="sec-title">Cell under cursor</h3>
      <p class="empty-note">Hover the grid to inspect a living cell: its condition is evaluated live, every tick.</p>`;
    return;
  }
  const cell = world.cells[world.idx(p.x, p.y)];
  if (!cell) {
    box.innerHTML = `<h3 class="sec-title">Cell under cursor</h3>
      <p class="empty-note">Empty — ${p.x}, ${p.y}</p>`;
    return;
  }
  const def = CELL_INDEX[cell.v];
  if (!def) return;
  let condNow = false;
  try { condNow = def.cond(cell, world); } catch (e) { condNow = false; }
  const cool = cell.cool > 0 ? `<span style="color:var(--bad)">cooling ${cell.cool}</span>` : '';
  box.innerHTML = `<h3 class="sec-title">Cell under cursor</h3>
    <div class="inspect-card">
      <div class="inspect-emoji" style="font-size:22px">${def.emoji}</div>
      <div>
        <div class="inspect-name">${def.name}</div>
        <div class="inspect-fam" style="color:${FAMILIES[def.family].color}">${def.condition}</div>
      </div>
    </div>
    <div class="inspect-row"><b>Condition right now</b>
      <span style="color:${condNow ? 'var(--good)' : 'var(--dim)'}">
        ${condNow ? '✔ satisfied — it will use its ability' : '✘ not satisfied — it waits'}
      </span> ${cool}
    </div>
    <div class="inspect-row"><b>Where</b><span>${p.x}, ${p.y} · age ${world.age(cell)}t</span></div>`;
}

/* ------------------------------------------------------------------ */
/*  Stats                                                              */
/* ------------------------------------------------------------------ */
let lastReactions = 0;
function updateStats() {
  $('#stat-tick').textContent = world.tick;
  $('#stat-pop').textContent = world.population();
  $('#stat-uses').textContent = world.lastUses;
  $('#foot-tick').textContent = world.tick;

  // stamp the cells that fired on the most recent tick
  const fired = new Set(world.log.length ? world.log[0].events.map(([id]) => id) : []);
  for (const row of $$('.cell-entry')) row.classList.toggle('just-fired', fired.has(row.dataset.id));

  // per-type counters in the palette
  for (const el of $$('[data-pop]')) {
    const n = world.byType[el.dataset.pop] || 0;
    el.textContent = n || '';
    el.classList.toggle('has', n > 0);
  }

  renderFamilyBars();
  renderActivity();
  pushHistory();
  drawSpark();
}

/* ----------------------------- activity log -------------------------- */
function renderActivity() {
  const box = $('#activity');
  const recent = world.log.slice(0, 3);
  if (!recent.length) {
    box.innerHTML = `<p class="act-quiet">Nothing has fired yet. Press Run — every tick, cells that meet their condition use their ability here.</p>`;
    return;
  }
  box.innerHTML = recent
    .map((entry) => {
      const total = entry.events.reduce((a, [, n]) => a + n, 0);
      const chips = entry.events
        .slice(0, 8)
        .map(([id, n]) => {
          const d = CELL_INDEX[id];
          return d ? `<span class="act-chip" title="${d.name}: ${d.condition} → ${d.effect}">${d.emoji} <b>${n}</b></span>` : '';
        })
        .join('');
      return `<div class="act-tick">
        <div class="act-tick-top"><span>TICK ${entry.tick}</span><b>${total} uses</b></div>
        <div class="act-chips">${chips}</div>
      </div>`;
    })
    .join('');
}

/* ---------------------------- sparkline ------------------------------ */
function pushHistory() {
  if (world.tick === 0) {
    state.history = [];
    lastReactions = world.reactions;
    return;
  }
  if (state.history.length && state.history[state.history.length - 1].t === world.tick) return;
  state.history.push({ t: world.tick, p: world.population() });
  if (state.history.length > 160) state.history.shift();
}

function drawSpark() {
  const cv = $('#spark');
  if (!cv) return;
  const rect = cv.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.max(1, rect.width * dpr);
  cv.height = 58 * dpr;
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, rect.width, 58);

  const hist = state.history;
  const cap = world.capacity * world.width * world.height;
  const max = Math.max(cap, ...hist.map((h) => h.p), 1);
  const x = (i) => (i / Math.max(1, hist.length - 1)) * rect.width;
  const y = (v) => 54 - (v / max) * 50;

  // carrying-capacity line
  g.strokeStyle = 'rgba(251, 191, 36, 0.4)';
  g.setLineDash([3, 3]);
  g.beginPath();
  g.moveTo(0, y(cap));
  g.lineTo(rect.width, y(cap));
  g.stroke();
  g.setLineDash([]);

  if (hist.length < 2) return;

  g.beginPath();
  g.moveTo(x(0), y(hist[0].p));
  hist.forEach((h, i) => g.lineTo(x(i), y(h.p)));
  g.lineTo(rect.width, 58);
  g.lineTo(0, 58);
  g.closePath();
  const grad = g.createLinearGradient(0, 0, 0, 58);
  grad.addColorStop(0, 'rgba(103, 232, 249, 0.35)');
  grad.addColorStop(1, 'rgba(103, 232, 249, 0)');
  g.fillStyle = grad;
  g.fill();

  g.beginPath();
  hist.forEach((h, i) => (i ? g.lineTo(x(i), y(h.p)) : g.moveTo(x(i), y(h.p))));
  g.strokeStyle = '#67e8f9';
  g.lineWidth = 1.6;
  g.stroke();
}

function renderFamilyBars() {
  const totals = {};
  for (const [id, fam] of Object.entries(FAMILIES)) totals[id] = 0;
  for (const def of CELLS) totals[def.family] += world.byType[def.id] || 0;
  const max = Math.max(1, ...Object.values(totals));
  const box = $('#family-bars');
  box.innerHTML = Object.entries(FAMILIES)
    .map(([id, fam]) => {
      const n = totals[id];
      return `<div class="fbar">
        <div class="fbar-top"><span>${fam.label}</span><b>${n}</b></div>
        <div class="fbar-track"><div class="fbar-fill" style="width:${(n / max) * 100}%;background:${fam.color}"></div></div>
      </div>`;
    })
    .join('');
}

/* ------------------------------------------------------------------ */
/*  Presets                                                            */
/* ------------------------------------------------------------------ */
function buildPresets() {
  const box = $('#presets');
  for (const p of PRESETS) {
    const b = document.createElement('button');
    b.className = 'preset';
    b.innerHTML = `<span class="e">${p.emoji}</span>${p.name}`;
    b.title = p.desc;
    b.addEventListener('click', () => loadPreset(p.id));
    box.appendChild(b);
  }
}

function loadPreset(id) {
  const p = PRESETS.find((x) => x.id === id);
  if (!p) return;
  world.clearAll();
  world.tick = 0;
  world.reactions = 0;
  p.build(world);
  world.recount();
  lastReactions = 0;
  renderer.resize();
  renderer.draw();
  updateStats();
  renderInspector();
  flashHint(`${p.emoji} ${p.name} loaded — ${p.desc}`);
}

let hintTimer = null;
function flashHint(text) {
  const h = $('#canvas-hint');
  h.textContent = text;
  h.classList.remove('is-hidden');
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => h.classList.add('is-hidden'), 4200);
}

/* ------------------------------------------------------------------ */
/*  Canvas interaction                                                 */
/* ------------------------------------------------------------------ */
function stampAt(p, stamp) {
  const rows = stamp.pattern;
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const ox = p.x - (w >> 1);
  const oy = p.y - (h >> 1);
  rows.forEach((row, dy) => {
    [...row].forEach((ch, dx) => {
      const id = stamp.legend[ch];
      if (!id) return;
      const x = ox + dx;
      const y = oy + dy;
      if (!world.inBounds(x, y)) return;
      if (world.emptyAt(x, y)) world.place(x, y, id);
      else world.setCell(world.cells[world.idx(x, y)], id);
    });
  });
  state.stamp = null;
  $$('.stamp').forEach((b) => b.classList.remove('is-armed'));
  renderer.markDirty();
  renderer.draw();
  updateStats();
}

function paintAt(p) {
  if (!p) return;
  if (state.stamp && state.tool === 'paint') return stampAt(p, state.stamp);
  const r = state.brush;
  const d = (r - 1) / 2;
  for (let dy = -d; dy <= d; dy++) {
    for (let dx = -d; dx <= d; dx++) {
      const x = p.x + dx;
      const y = p.y + dy;
      if (!world.inBounds(x, y)) continue;
      const i = world.idx(x, y);
      if (state.tool === 'erase') {
        const c = world.cells[i];
        if (c) {
          world.byType[c.v] = Math.max(0, (world.byType[c.v] || 0) - 1);
          world.cells[i] = null;
        }
      } else if (!world.cells[i]) {
        world.place(x, y, state.selected);
      } else if (world.cells[i].v !== state.selected) {
        world.setCell(world.cells[i], state.selected);
      }
    }
  }
  renderer.markDirty();
  renderer.draw();
  updateStats();
}

function eventToCell(e) {
  const rect = canvas.getBoundingClientRect();
  return renderer.pixelToCell(e.clientX - rect.left, e.clientY - rect.top);
}

let painting = false;

canvas.addEventListener('pointerdown', (e) => {
  if (e.button === 2) {
    state.rightErase = true;
    state.tool = 'erase';
    $$('.tool[data-tool]').forEach((b) => b.classList.toggle('is-active', b.dataset.tool === 'erase'));
  }
  painting = true;
  canvas.setPointerCapture(e.pointerId);
  paintAt(eventToCell(e));
});

canvas.addEventListener('pointermove', (e) => {
  const p = eventToCell(e);
  const changed = !p || !state.hoverCell || p.x !== state.hoverCell.x || p.y !== state.hoverCell.y;
  renderer.hover = p;
  state.hoverCell = p;

  // cursor tooltip
  const tip = $('#cursor-tip');
  if (p) {
    const cell = world.cells[world.idx(p.x, p.y)];
    if (cell && CELL_INDEX[cell.v]) {
      const d = CELL_INDEX[cell.v];
      tip.innerHTML = `${d.emoji} <b>${d.name}</b> <span style="color:var(--dim)">· ${d.condition}</span>`;
      tip.classList.add('is-visible');
      tip.style.left = e.clientX - canvas.getBoundingClientRect().left + 'px';
      tip.style.top = e.clientY - canvas.getBoundingClientRect().top + 'px';
    } else {
      tip.classList.remove('is-visible');
    }
  } else {
    tip.classList.remove('is-visible');
  }

  if (painting) paintAt(p);
  if (changed) renderCursorInspect();
  renderer.draw();
});

window.addEventListener('pointerup', () => {
  painting = false;
  if (state.rightErase) {
    state.rightErase = false;
    state.tool = 'paint';
    $$('.tool[data-tool]').forEach((b) => b.classList.toggle('is-active', b.dataset.tool === 'paint'));
  }
});
canvas.addEventListener('pointerleave', () => {
  painting = false;
  renderer.hover = null;
  state.hoverCell = null;
  $('#cursor-tip').classList.remove('is-visible');
  renderCursorInspect();
  renderer.draw();
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

/* ------------------------------------------------------------------ */
/*  Main loop                                                          */
/* ------------------------------------------------------------------ */
let acc = 0;
let lastT = performance.now();
let lastUi = 0;

function loop(now) {
  const dt = now - lastT;
  lastT = now;
  if (state.running) {
    acc += dt;
    const interval = 1000 / state.speed;
    let steps = 0;
    while (acc >= interval && steps < 4) {
      world.step();
      acc -= interval;
      steps++;
    }
    if (steps) renderer.draw();
    // the DOM panels only need ~12 refreshes per second
    if (now - lastUi > 80) {
      lastUi = now;
      if (state.hoverCell) renderCursorInspect();
      updateStats();
    }
  }
  requestAnimationFrame(loop);
}

/* ------------------------------------------------------------------ */
/*  Controls                                                           */
/* ------------------------------------------------------------------ */
function setRunning(on) {
  state.running = on;
  const btn = $('#btn-play');
  btn.classList.toggle('is-running', on);
  $('#play-ico').textContent = on ? '❚❚' : '▶';
  $('#play-label').textContent = on ? 'Pause' : 'Run';
}

$('#btn-play').addEventListener('click', () => setRunning(!state.running));
$('#btn-step').addEventListener('click', () => {
  world.step();
  renderer.markDirty();
  renderer.draw();
  updateStats();
  if (state.hoverCell) renderCursorInspect();
});
$('#btn-clear').addEventListener('click', () => {
  world.clearAll();
  world.reactions = 0;
  lastReactions = 0;
  renderer.markDirty();
  renderer.draw();
  updateStats();
  flashHint('Grid cleared — pick a cell and paint.');
});
$('#btn-random').addEventListener('click', () => loadPreset('soup'));

$('#speed').addEventListener('input', (e) => {
  state.speed = +e.target.value;
  $('#speed-label').textContent = state.speed;
});

$$('.tool[data-tool]').forEach((b) =>
  b.addEventListener('click', () => {
    state.tool = b.dataset.tool;
    $$('.tool[data-tool]').forEach((x) => x.classList.toggle('is-active', x === b));
  })
);
$$('.tool[data-size]').forEach((b) =>
  b.addEventListener('click', () => {
    state.brush = +b.dataset.size;
    renderer.brushSize = state.brush;
    $$('.tool[data-size]').forEach((x) => x.classList.toggle('is-active', x === b));
    $('#foot-size').textContent = `${state.brush}×${state.brush}`;
  })
);

$('#tgl-grid').addEventListener('click', (e) => {
  renderer.showGrid = !renderer.showGrid;
  e.currentTarget.classList.toggle('is-active', renderer.showGrid);
  renderer.markDirty();
  renderer.draw();
});
$('#tgl-glow').addEventListener('click', (e) => {
  renderer.showGlow = !renderer.showGlow;
  e.currentTarget.classList.toggle('is-active', renderer.showGlow);
  renderer.markDirty();
  renderer.draw();
});
$('#tgl-wrap').addEventListener('click', (e) => {
  world.wrap = !world.wrap;
  e.currentTarget.classList.toggle('is-active', world.wrap);
  $('#foot-wrap').textContent = world.wrap ? 'wrap' : 'bounded';
  renderer.draw();
});

$('#size-select').addEventListener('change', (e) => {
  const [w, h] = e.target.value.split('x').map(Number);
  world.resize(w, h);
  renderer.resize();
  renderer.draw();
  updateStats();
});

$('#search').addEventListener('input', (e) => {
  state.search = e.target.value;
  renderPalette();
});

$('#mut-rate').addEventListener('input', (e) => {
  const v = +e.target.value;
  world.mutationRate = v / 10;
  $('#mut-label').textContent = v === 0 ? 'off' : `${v * 10}%`;
});
$('#decay-rate').addEventListener('input', (e) => {
  const v = +e.target.value;
  world.decayRate = v / 200;
  $('#decay-label').textContent = v === 0 ? 'off' : `${(v / 2).toFixed(1)}%`;
});

/* save / load */
const SAVE_KEY = 'cellarium.save.v1';
$('#btn-save').addEventListener('click', () => {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(world.serialize()));
    flashHint('💾 Saved in this browser.');
  } catch (e) {
    flashHint('Could not save (storage blocked).');
  }
});
$('#btn-load').addEventListener('click', () => {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return flashHint('Nothing saved yet.');
  try {
    world.load(JSON.parse(raw));
    renderer.markDirty();
    renderer.resize();
    renderer.draw();
    updateStats();
    flashHint('📂 Restored.');
  } catch (e) {
    flashHint('Saved grid was unreadable.');
  }
});

/* ------------------------------------------------------------------ */
/*  Catalog modal                                                      */
/* ------------------------------------------------------------------ */
function renderCatalog(filter = '') {
  const q = filter.toLowerCase().trim();
  const body = $('#catalog-body');
  const list = CELLS.filter(
    (c) => !q || c.name.toLowerCase().includes(q) || c.condition.toLowerCase().includes(q) || c.effect.toLowerCase().includes(q) || c.family.includes(q)
  );
  body.innerHTML = list
    .map((c) => {
      const fam = FAMILIES[c.family];
      return `<div class="cat-card" data-goto="${c.id}">
        <div style="font-size:24px;line-height:1">${c.emoji}</div>
        <div class="cat-body">
          <div class="cat-title">${c.name} <span class="cat-num">#${String(c.index).padStart(2, '0')}</span>
            <span class="cat-fam" style="background:${fam.color}22;color:${fam.color}">${fam.label}</span>
          </div>
          <div class="cat-rule"><span class="k">IF</span><span class="if">${c.condition}</span></div>
          <div class="cat-rule"><span class="k">THEN</span><span class="then">${c.effect}</span></div>
        </div>
      </div>`;
    })
    .join('');
}

$('#btn-catalog').addEventListener('click', () => {
  renderCatalog($('#catalog-search').value);
  $('#catalog-modal').hidden = false;
});
$('#catalog-close').addEventListener('click', () => ($('#catalog-modal').hidden = true));
$('#catalog-modal').addEventListener('click', (e) => {
  if (e.target.id === 'catalog-modal') $('#catalog-modal').hidden = true;
  const card = e.target.closest('[data-goto]');
  if (card) {
    const id = card.dataset.goto;
    $('#catalog-modal').hidden = true;
    selectCell(id);
    state.family = 'all';
    $$('.tab').forEach((t) => t.classList.toggle('is-active', t.dataset.family === 'all'));
    renderPalette();
    const row = document.querySelector(`.cell-entry[data-id="${id}"]`);
    if (row) row.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
});
$('#catalog-search').addEventListener('input', (e) => renderCatalog(e.target.value));

/* ------------------------------------------------------------------ */
/*  Keyboard                                                           */
/* ------------------------------------------------------------------ */
window.addEventListener('keydown', (e) => {
  if (e.target.matches('input, select, textarea')) return;
  if (e.code === 'Space') { e.preventDefault(); setRunning(!state.running); }
  if (e.key === 's' || e.key === 'S') {
    world.step();
    renderer.markDirty();
    renderer.draw();
    updateStats();
  }
  if (e.key === 'c' || e.key === 'C') {
    world.clearAll();
    lastReactions = 0;
    renderer.markDirty();
    renderer.draw();
    updateStats();
  }
  if (e.key === 'e' || e.key === 'E') {
    state.tool = state.tool === 'erase' ? 'paint' : 'erase';
    $$('.tool[data-tool]').forEach((b) => b.classList.toggle('is-active', b.dataset.tool === state.tool));
  }
  if (e.key === 'b' || e.key === 'B') {
    state.tool = 'paint';
    $$('.tool[data-tool]').forEach((b) => b.classList.toggle('is-active', b.dataset.tool === 'paint'));
  }
  if (e.key === 'Escape') $('#catalog-modal').hidden = true;
});

/* ------------------------------------------------------------------ */
/*  Boot                                                               */
/* ------------------------------------------------------------------ */
window.addEventListener('resize', () => {
  renderer.resize();
  renderer.draw();
});

function buildStamps() {
  const box = $('#stamp-tools');
  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = 'STAMP';
  box.appendChild(label);
  for (const st of STAMPS) {
    const b = document.createElement('button');
    b.className = 'stamp';
    b.textContent = st.emoji;
    b.title = `Stamp: ${st.name}`;
    b.addEventListener('click', () => {
      const armed = state.stamp === st;
      state.stamp = armed ? null : st;
      $$('.stamp').forEach((x) => x.classList.toggle('is-armed', !armed && x === b));
    });
    box.appendChild(b);
  }
}

buildFamilyTabs();
buildStamps();
buildPresets();
renderPalette();
renderInspector();
renderFamilyBars();
loadPreset('soup');
setRunning(true);
requestAnimationFrame(loop);
