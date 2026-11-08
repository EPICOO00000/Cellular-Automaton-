# ◈ Cellarium — a 50-cell grid automaton

A structured-grid cellular automaton where **every cell type is a simple rule**:

> **IF** a condition is true around the cell **THEN** it uses its ability.

At each tick every living cell is visited once (in a shuffled order), its
condition is evaluated against the world, and — if it holds and its chance roll
succeeds — its use fires. Born cells are marked "already acted" for that tick,
so chain reactions never sweep the grid in a single tick.

* **50 cell types** — each with its own emoji icon, condition and use
* **12 families** — life, plants, growth, motion, energy, time, mutation,
  chemistry, elements, creatures, society, structures
* **Zero dependencies** — plain HTML + CSS + Canvas + vanilla JS
* **Everything is editable from the UI** — paint, erase, stamp, preset, tune

---

## Quick start

```bash
node serve.js          # http://localhost:8080
# or simply open index.html in a browser
npm test               # headless engine + UI smoke tests
```

Node is only used to serve the static files; the app itself runs entirely in the
browser.

---

## The plan (what was built, in order)

1. **Simulation core** — `World` grid, tick loop, spawn/clear/move primitives,
   O(1) population counters, serialisation.
2. **Cell catalogue** — 50 data-driven cells: `{ emoji, name, family,
   condition, effect, cond(), act(), chance }`. Nothing in the engine knows any
   specific cell, so every type is one self-contained object.
3. **Ecology balance** — a `CROWD` table gives growers a maximum neighbour
   count (they suffocate), predators/viruses starve when their food is gone, and
   a world *carrying capacity* stops runaway fill. This is what makes the grid
   behave like an ecosystem instead of a flood fill.
4. **Renderer** — emoji sprites are rasterised once per zoom level into small
   offscreen canvases, then blitted. A family-coloured bed under every sprite
   keeps the field readable. Action flash = the cell just used its ability.
5. **UI** — palette with search + family tabs, live inspector (selected cell,
   the cell under the cursor with its condition evaluated *right now*), "what
   just fired" log, population sparkline, per-family bars, world knobs,
   presets, stamps, save/load.
6. **Tests** — `test/smoke.js` (engine, all 50 cells isolated, all 12 presets,
   600-tick soak, serialisation) and `test/dom.js` (renderer + app against a
   stubbed DOM).

---

## The tick, exactly

```
tick++
for each occupied cell, in shuffled order:
    skip if it already acted this tick
    if cooldown > 0      → decrement, skip
    if overcrowded       → die (CROWD table)
    if global decay roll → die
    IF  cond(cell, world)          ← the CONDITION
    AND chance roll succeeds
    THEN act(cell, world)          ← the USE
apply spontaneous mutation (optional)
```

Cells born during a tick get `acted = tick`, so they wait for the next tick.

---

## Controls

| Action | How |
|--------|-----|
| Run / pause | `Space` or the **Run** button |
| Single tick | `S` or **⏭ Step** |
| Paint | left-drag on the grid |
| Erase | right-drag, `E`, or the 🧽 tool |
| Pick cell | click it in the palette (or in the **📖 Rules** modal) |
| Clear | `C` or 🧹 |
| Inspect | hover any cell — its condition is evaluated live in the inspector |
| Stamp a shape | the STAMP buttons next to the brush tools |
| Change world | presets bar, grid size, mutation / decay sliders, wrap edges |

---

## The 50 cells

Every row is the complete rule: icon, name, **condition** and **use**.
"Fires" is the default probability that a satisfied cell uses its ability on a given tick.

### Life — Seeds, growth and decay of simple organisms

| # | Cell | Condition — the IF | Use — the THEN | Fires |
|---|------|-------------------|----------------|-------|
| 01 | 🌱 **Life** | Exactly 3 living neighbours (fewer than 2 and it dies) | Crowded: sprouts Life in a free neighbour. Lonely: becomes empty. | 35% |
| 02 | 🦠 **Algae** | At least one free neighbour | Creeps into a random free neighbour | 4% |
| 03 | 🍄 **Spore** | At least one free neighbour | Plants a Spore there, then withers into Moss | 8% |
| 04 | ☘️ **Moss** | At least one free neighbour | Spreads a thin layer of Moss | 4% |

### Plants — Things rooted in the ground that spread

| # | Cell | Condition — the IF | Use — the THEN | Fires |
|---|------|-------------------|----------------|-------|
| 05 | 🌰 **Seed** | Touches Water — or has waited 12 ticks dormant | Germinates into a Tree | 50% |
| 06 | 🌳 **Tree** | Has a free diagonal neighbour | Drops a Seed on the ground | 5% |
| 07 | 🌸 **Flower** | Touches at least 3 living cells | Blooms another Flower beside it | 10% |
| 08 | 🍃 **Vine** | A free cell in a cardinal direction | Climbs one cell in that direction | 50% |
| 09 | 🎋 **Bamboo** | The cell above is free | Shoots one cell upwards | 45% |

### Growth — Cells whose only job is to get taller / deeper

| # | Cell | Condition — the IF | Use — the THEN | Fires |
|---|------|-------------------|----------------|-------|
| 10 | 🫚 **Root** | The cell below is free | Digs one cell deeper | 55% |
| 11 | 🎍 **Stem** | The cell above is free | Grows one cell higher | 35% |

### Motion — Cells that relocate across the grid

| # | Cell | Condition — the IF | Use — the THEN | Fires |
|---|------|-------------------|----------------|-------|
| 12 | 🚶 **Walker** | The cell east of it is free | Walks one cell east | 100% |
| 13 | 🏃 **Runner** | The two cells east of it are free | Sprints two cells east | 100% |
| 14 | 🐇 **Jumper** | A free cell two cells away diagonally | Hops there, leaving its square empty | 100% |
| 15 | 🛸 **Drone** | Touches a Beacon | Leaps two cells towards the Beacon | 70% |

### Energy — Light, charge and conduction

| # | Cell | Condition — the IF | Use — the THEN | Fires |
|---|------|-------------------|----------------|-------|
| 16 | ☀️ **Sun** | At least one free neighbour | Shines a Light into it | 50% |
| 17 | ✨ **Light** | Always (it is a photon) | Fades away one tick after it appears | 100% |
| 18 | 🔋 **Battery** | Touches a Light and has a free neighbour | Stores the charge and releases a Wire | 80% |
| 19 | 🔌 **Wire** | Touches a Battery | Conducts: turns itself into Light | 90% |
| 20 | ⚡ **Plasma** | Touches a Wire or a Battery | Overloads, flooding its free neighbours with Light | 60% |

### Time — Clocks, cooldowns and timed releases

| # | Cell | Condition — the IF | Use — the THEN | Fires |
|---|------|-------------------|----------------|-------|
| 21 | ⏰ **Clock** | Every second tick (tick is even) | Rings: paints its free neighbours with Blink | 100% |
| 22 | 💡 **Blink** | Two ticks have passed since it lit up | Switches itself off (goes dark again) | 100% |
| 23 | 🕯️ **Fuel** | Always (it is flammable) | Ignites into Fire, spreading a Flame above | 100% |
| 24 | 🥚 **Egg** | 4 ticks have passed since it was laid | Hatches into a random small creature | 100% |
| 25 | 💦 **Geyser** | Every 5th tick | Erupts, hurling Magma into its free neighbours | 100% |
| 26 | 🧭 **Sundial** | Touches a Sun | Aligns: becomes a Clock | 50% |

### Mutation — Cells that rewrite other cells

| # | Cell | Condition — the IF | Use — the THEN | Fires |
|---|------|-------------------|----------------|-------|
| 27 | 🧬 **Mutator** | Touches another Mutator | Mutates a living neighbour into a random cell | 35% |
| 28 | 🪞 **Mirror** | Touches a Mirror and another living cell | Copies that cell into a free neighbour | 40% |
| 29 | 🦎 **Chimera** | Every 6th tick | Cycles: Life → Algae → Spore → Wolf → Moss → Life | 100% |
| 30 | 🔁 **Echo** | Touches a Light | Repeats it: places a new Light further out | 50% |
| 31 | 🌈 **Prism** | Touches a Light | Refracts it into four Lights in the cardinal directions | 60% |

### Chemistry — Dissolving, drying and crystallising

| # | Cell | Condition — the IF | Use — the THEN | Fires |
|---|------|-------------------|----------------|-------|
| 32 | 🧪 **Acid** | Touches a living cell that is not a Crystal | Dissolves it and takes its form | 50% |
| 33 | 🧂 **Salt** | Touches Water | Dries the Water into Salt | 50% |
| 34 | 💎 **Crystal** | Touches a Crystal, has a free neighbour | Grows one more facet | 18% |

### Elements — Fire, water, ice, steam and magma

| # | Cell | Condition — the IF | Use — the THEN | Fires |
|---|------|-------------------|----------------|-------|
| 35 | 🔥 **Fire** | Touches something flammable — otherwise it dies out | Spreads into the fuel, then burns out | 90% |
| 36 | 💧 **Water** | Touches Fire or Magma | Boils into Steam | 90% |
| 37 | 🧊 **Ice** | Touches Water and has a free neighbour | Freezes the Water and creeps one cell outward | 40% |
| 38 | ♨️ **Steam** | Always (it rises) | Floats one cell up, then slowly dissolves | 90% |
| 39 | 🌋 **Magma** | Touches Water or Ice | Vaporises it into Steam | 80% |

### Creatures — Predators, hosts, pollinators

| # | Cell | Condition — the IF | Use — the THEN | Fires |
|---|------|-------------------|----------------|-------|
| 40 | 🐺 **Wolf** | Touches Algae, a Flower or a Bee — starves after 25 ticks | Eats it: the prey becomes another Wolf | 50% |
| 41 | 👾 **Virus** | Touches a host that is not immune — starves after 15 ticks | Infects the host: it becomes a Virus | 50% |
| 42 | 🐝 **Bee** | Touches a Flower | Pollinates: grows another Flower | 35% |
| 43 | 🦋 **Butterfly** | Touches a Flower or a Bee | Flutters to a free neighbour | 60% |

### Society — Settlements and industry

| # | Cell | Condition — the IF | Use — the THEN | Fires |
|---|------|-------------------|----------------|-------|
| 44 | 🏠 **Colonist** | Touches a Colonist and has room | Founds another Colonist; with 3+ it becomes a Town | 25% |
| 45 | 🏘️ **Town** | Touches a Colonist and has room | Sends out a new Colonist | 30% |
| 46 | 🏭 **Factory** | Touches a Wire (it is powered) | Assembles a Drone in a free neighbour | 40% |
| 47 | 🛡️ **Soldier** | Touches a Wolf, Virus or Acid | Destroys the threat and rests for 3 ticks | 90% |

### Structures — Static builds and traversable gates

| # | Cell | Condition — the IF | Use — the THEN | Fires |
|---|------|-------------------|----------------|-------|
| 48 | 🧱 **Wall** | Touches a Wall and has a free side | Lays another brick next to it | 30% |
| 49 | 🔆 **Beacon** | Has a free neighbour | Sends a Light pulse outward (and attracts Drones) | 70% |
| 50 | 🚪 **Door** | Touches a Walker or a Runner | Opens: throws the traveller 2 cells forward | 100% |

---

## Files

```
index.html      markup + panels
styles.css      dark UI theme
js/data.js      the 50 cells, families, crowding table  ← edit rules here
js/engine.js    World, tick loop, presets, stamps
js/render.js    canvas renderer + emoji sprite cache
js/app.js       palette, inspector, painting, controls, catalog
serve.js        zero-dependency static server
test/           smoke.js (engine) · dom.js (UI harness)
```

### Adding a 51st cell

Drop one object into `CELLS` in `js/data.js`:

```js
{
  id: 'lantern', emoji: '🏮', name: 'Lantern', family: 'energy', chance: 0.4,
  condition: 'Touches a Fire',
  effect: 'Floats a Light upwards',
  cond: (c, w) => touches(w, c.x, c.y, ['fire']),
  act: (c, w) => { if (w.emptyAt(c.x, c.y - 1)) w.place(c.x, c.y - 1, 'light'); },
}
```

The palette, inspector, catalog modal and tests pick it up automatically.

---

MIT licensed.
