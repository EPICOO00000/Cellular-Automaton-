# ◈ Cellarium

A grid cellular automaton sandbox. **Pick a cell, paint it on the board,
rotate it, press Run.** Every tick, every cell checks its rule once and
either does its thing or does nothing.

No dashboards, no ecosystems to manage — just a board and 50 cells that
each do one simple action.

```
node serve.js          # http://localhost:8080   (or just open index.html)
npm test               # engine + UI tests
```

---

## How it works

```
every tick:
    for each cell on the board (random order):
        if it is frozen  → tick down, do nothing
        if it has a cooldown timer → maybe do nothing
        run its rule
    draw the result
```

A cell that is born during a tick waits for the next one, so nothing
snowballs across the board in a single frame.

**Every cell is one line of behaviour**, defined in `js/data.js`:

| field | meaning |
|-------|---------|
| `emoji` | what is drawn on the tile |
| `if` | the situation it reacts to |
| `then` | what it does |
| `dir` | `true` if the cell has a facing direction (rotate it with `R`) |
| `period` | optional: only acts every N ticks |
| `do(cell, sim)` | the action itself |

---

## Controls

| | |
|---|---|
| **left-click / drag** | paint the selected cell |
| **right-click** | rotate the cell under the cursor (or erase an empty square) |
| **R** | rotate the brush (`Shift+R` turns it back) |
| **Space** | run / pause |
| **S** | one tick |
| **1 / 3** | brush size |
| **E** | toggle erase |
| **C** | clear the board |
| **Ctrl+Z** | undo |
| **?** | the cheat sheet |

Hover any square to read its rule in the tooltip.

---

## The 50 cells

### Move — cells that go somewhere
| | Cell | If | Then |
|---|------|----|------|
| 🚶 | Mover | the square ahead is empty | moves one square ahead |
| 🏃 | Dasher | the next two squares ahead are empty | runs two squares |
| 🐇 | Hopper | two squares ahead is empty | hops over anything in between |
| 👐 | Pusher | a moveable cell is ahead and there is room past it | shoves it, then follows |
| 🏓 | Bouncer | ahead empty → move, blocked → turn around | bounces off walls |
| 🎈 | Drifter | ahead empty → move, blocked → turn right | drifts, turning at obstacles |
| 🐍 | Slither | ahead blocked | turns a random way, otherwise creeps |
| 🎲 | Wanderer | any neighbour is free | wanders into a random one |
| 🌀 | Spinner | always | turns itself 90° |

### Make — cells that create
| | Cell | If | Then |
|---|------|----|------|
| 🏭 | Generator | every 3 ticks, square ahead free | prints a Blob |
| 👯 | Duplicator | every 4 ticks, square ahead free | copies itself |
| 🔀 | Splitter | every 4 ticks, a front diagonal free | spits a Blob out of each |
| 🌱 | Grower | every 2 ticks, square ahead free | extends itself — a growing stem |
| ⛲ | Fountain | a neighbour is free | throws a Spark into it |
| ✳️ | Spawner | every 5 ticks, a neighbour free | drops a Blob next to itself |
| 💥 | Blaster | every 3 ticks | fires a Bullet that destroys what it hits |
| 🪞 | Mirror | next to any cell, with a free neighbour | casts a copy of that cell beside it |
| 🎨 | Painter | every 2 ticks, a cell is ahead | repaints it into a copy of itself |

### Break — cells that destroy
| | Cell | If | Then |
|---|------|----|------|
| ⚙️ | Shredder | something breakable is ahead | destroys it |
| 🔫 | Laser | every 2 ticks, a target within 8 squares ahead | fires a beam that destroys the first thing it hits |
| 💣 | Bomb | 3 ticks after being placed | explodes a 3×3 hole, then is gone |
| 🕳️ | Black hole | anything is next to it | swallows all 8 neighbours |
| 🪚 | Saw | something is to its left or right | cuts both sides |
| 🔥 | Fire | a living or burnable cell is ahead | burns it, then fades |
| 🧪 | Acid | every 2 ticks, something breakable ahead | dissolves it and flows into the square |
| 🗡️ | Grinder | every 2 ticks | destroys both front diagonals |

### Turn — cells that re-aim other cells
| | Cell | If | Then |
|---|------|----|------|
| 🔄 | Rotator | every 2 ticks | turns every neighbour 90° clockwise |
| ↩️ | Turner | every 2 ticks, a cell is ahead | turns it 90° clockwise |
| 🔃 | Flipper | every 2 ticks, a cell is ahead | sends it back the way it came |
| 🧭 | Aligner | every 2 ticks, a cell is ahead | points it the same way it faces |
| 🧊 | Freezer | every 3 ticks, a cell is ahead | freezes it for 6 ticks |
| 🌪️ | Twister | every 2 ticks | turns a random neighbour a random 90° |

### Signal — pulses and logic
| | Cell | If | Then |
|---|------|----|------|
| ⏰ | Clock | every 2 ticks | pulses to every free neighbour |
| 📡 | Emitter | every 3 ticks | sends a pulse forward (it runs along wires) |
| ➖ | Wire | a pulse is next to it | pulses travel through it and branch out |
| 🔁 | Relay | a pulse touches it | repeats the pulse forward |
| ▶️ | Diode | a pulse arrives from behind | lets it continue only forward |
| 👁️ | Sensor | every 2 ticks, something is ahead | sends a pulse forward |
| 💾 | Memory | a pulse arrives | toggles on/off, and pulses while on |
| 🔢 | Counter | it has counted 3 pulses | sends one pulse out and starts again |

### Life — growing, spreading, dying
| | Cell | If | Then |
|---|------|----|------|
| 🌱 | Life | exactly 3 living neighbours | sprouts a new Life — dies if lonely or crowded |
| 🍄 | Fungus | every 3 ticks, if not crowded | creeps into a free neighbour (dies at age 12) |
| 👾 | Virus | a living cell is next to it | infects it (starves after 12 ticks) |
| 🌿 | Plant | every 2 ticks, square ahead free | grows in the direction it faces (dies when crowded) |
| 🦠 | Colony | 2–3 neighbours and room | buds a new Colony |
| 💎 | Crystal | exactly 2 Crystal neighbours | grows one more facet |
| 🐺 | Hunter | a living cell is ahead | eats it, then walks in |

### Solid — build with these
| | Cell | If | Then |
|---|------|----|------|
| 🧱 | Wall | always | never moves, never breaks (stops lasers) |
| 🪟 | Glass | always | blocks movement but lets pulses and lasers through |
| 🟡 | Blob | empty space next to it, 35% of the time | drifts — plain matter to build with |

Plus two **effects** that appear on the board but are not in the palette:
✨ **Spark** (a pulse, travels 4 ticks) and ⚪ **Bullet** (destroys what it hits).

---

## Example boards

Six starting boards in the bottom bar — **Conveyor**, **Factory**, **Laser
range**, **Garden**, **Pulse circuit** and **Blank** — all built from the same
cells, just arranged.

---

## Files

```
index.html      the page: bar, palette, board
styles.css      dark theme
js/data.js      the 50 cells + their rules   ← edit cells here
js/engine.js    the tick loop, board, example layouts
js/render.js    canvas drawing (tiles, arrows, beams)
js/app.js       palette, painting, rotating, running
serve.js        zero-dependency static server
test/           smoke.js (engine + every cell) · dom.js (UI harness)
```

### Adding a 51st cell

```js
{
  id: 'lantern', emoji: '🏮', name: 'Lantern', family: 'life', period: 4,
  if: 'Every 4 ticks',
  then: 'Lights up its neighbours with Sparks',
  do: (c, sim) => {
    for (const p of sim.around(c)) if (sim.free(p.x, p.y)) sim.spawn(p.x, p.y, 'spark', sim.dirTo(c, p));
  },
}
```

It shows up in the palette, the tooltip and the cheat sheet automatically.

MIT licensed.
