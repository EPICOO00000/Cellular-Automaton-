/* =====================================================================
   CELLARIUM — renderer
   Emoji are rasterised once per cell-size into small offscreen canvases,
   so a full grid redraw stays smooth even with thousands of cells.
   ===================================================================== */

function hexToRgba(hex, a) {
  const h = hex.replace('#', '');
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

class Renderer {
  constructor(canvas, world) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });
    this.world = world;
    this.sprites = new Map();   // `${emoji}|${size}` -> canvas
    this.spriteSize = 0;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.hover = null;
    this.showGrid = true;
    this.showGlow = true;
    this.tints = {};
    for (const def of CELLS) this.tints[def.id] = hexToRgba(FAMILIES[def.family].color, 0.26);
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.cssW = w;
    this.cssH = h;
    this.cellSize = Math.min(w / this.world.width, h / this.world.height);
    this.offsetX = (w - this.cellSize * this.world.width) / 2;
    this.offsetY = (h - this.cellSize * this.world.height) / 2;
    this.buildSprites();
  }

  buildSprites() {
    const size = Math.max(6, Math.floor(this.cellSize * this.dpr));
    if (size === this.spriteSize) return;
    this.spriteSize = size;
    this.sprites.clear();
    for (const def of CELLS) {
      this.sprites.set(def.id, this.rasterise(def.emoji, size));
    }
  }

  rasterise(emoji, size) {
    const pad = Math.ceil(size * 0.16);
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const g = c.getContext('2d');
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `${Math.floor(size - pad * 2)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    g.fillText(emoji, size / 2, size / 2 + size * 0.04);
    return c;
  }

  pixelToCell(px, py) {
    const x = Math.floor((px - this.offsetX) / this.cellSize);
    const y = Math.floor((py - this.offsetY) / this.cellSize);
    if (!this.world.inBounds(x, y)) return null;
    return { x, y };
  }

  cellRect(x, y) {
    return {
      x: this.offsetX + x * this.cellSize,
      y: this.offsetY + y * this.cellSize,
      s: this.cellSize,
    };
  }

  draw() {
    const g = this.ctx;
    const dpr = this.dpr;
    const cs = this.cellSize;
    const w = this.world;

    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, this.cssW, this.cssH);

    // background plate
    g.fillStyle = 'rgba(8, 12, 22, 0.55)';
    g.fillRect(this.offsetX, this.offsetY, cs * w.width, cs * w.height);

    // grid
    if (this.showGrid && cs > 7) {
      g.strokeStyle = 'rgba(120, 160, 220, 0.10)';
      g.lineWidth = 1;
      g.beginPath();
      for (let x = 0; x <= w.width; x++) {
        const px = Math.round(this.offsetX + x * cs) + 0.5;
        g.moveTo(px, this.offsetY);
        g.lineTo(px, this.offsetY + cs * w.height);
      }
      for (let y = 0; y <= w.height; y++) {
        const py = Math.round(this.offsetY + y * cs) + 0.5;
        g.moveTo(this.offsetX, py);
        g.lineTo(this.offsetX + cs * w.width, py);
      }
      g.stroke();
    }

    // cells
    const spriteSize = this.spriteSize / dpr;
    for (let y = 0; y < w.height; y++) {
      for (let x = 0; x < w.width; x++) {
        const cell = w.cells[w.idx(x, y)];
        if (!cell) continue;
        const px = this.offsetX + x * cs;
        const py = this.offsetY + y * cs;

        // family colour bed — keeps the mosaic readable even without emoji fonts
        const inset = cs * 0.07;
        g.fillStyle = this.tints[cell.v] || 'rgba(255,255,255,0.12)';
        g.fillRect(px + inset, py + inset, cs - inset * 2, cs - inset * 2);

        // action glow
        if (this.showGlow && cell.flash > 0.06) {
          g.fillStyle = `rgba(190, 235, 255, ${Math.min(0.55, cell.flash * 0.5)})`;
          g.fillRect(px + inset, py + inset, cs - inset * 2, cs - inset * 2);
        }

        const sprite = this.sprites.get(cell.v);
        if (sprite) {
          g.drawImage(sprite, px, py, spriteSize, spriteSize);
        } else {
          g.fillStyle = '#fff';
          g.fillRect(px, py, cs, cs);
        }
      }
    }

    // hover / brush preview
    if (this.hover) {
      const r = this.cellRect(this.hover.x, this.hover.y);
      g.strokeStyle = 'rgba(125, 211, 252, 0.95)';
      g.lineWidth = 2;
      g.strokeRect(r.x + 1, r.y + 1, r.s - 2, r.s - 2);
    }
  }
}
