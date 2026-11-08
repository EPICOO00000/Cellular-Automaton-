/* =====================================================================
   CELLARIUM — drawing
   Tiles are drawn on a canvas: a soft coloured square, the cell's emoji,
   and a chevron showing which way it faces. Beams and blasts are drawn on
   top as short-lived effects.
   ===================================================================== */

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

class Renderer {
  constructor(canvas, sim) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.sim = sim;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.sprites = new Map();
    this.spriteSize = -1;
    this.showGrid = true;
    this.hover = null;
    this.ghost = null;   // { type, d } preview of the brush
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const cssW = Math.max(1, Math.floor(rect.width));
    const cssH = Math.max(1, Math.floor(rect.height));
    this.canvas.width = Math.floor(cssW * this.dpr);
    this.canvas.height = Math.floor(cssH * this.dpr);
    this.cssW = cssW;
    this.cssH = cssH;

    const s = this.sim;
    // integer tile size keeps the grid razor sharp
    this.tile = Math.max(8, Math.floor(Math.min(cssW / s.w, cssH / s.h)));
    this.boardW = this.tile * s.w;
    this.boardH = this.tile * s.h;
    this.ox = Math.round((cssW - this.boardW) / 2);
    this.oy = Math.round((cssH - this.boardH) / 2);
    this.buildSprites();
  }

  buildSprites() {
    const size = Math.floor(this.tile * this.dpr);
    if (size === this.spriteSize) return;
    this.spriteSize = size;
    this.sprites.clear();
    for (const def of CELLS) this.sprites.set(def.id, this.spriteWithFallback(def.emoji, size, def.name));
    for (const def of Object.values(EFFECTS)) this.sprites.set(def.id, this.spriteWithFallback(def.emoji, size, def.name));
  }

  sprite(emoji, size) {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const g = c.getContext('2d');
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `${Math.floor(size * 0.74)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    g.fillText(emoji, size / 2, size / 2 + size * 0.04);
    return c;
  }

  /* if the device has no emoji font the sprite comes out blank — draw a
     letter instead so the board is still readable */
  spriteWithFallback(emoji, size, label) {
    const c = this.sprite(emoji, size);
    if (size < 12) return c;
    let ink = true;
    try {
      const g = c.getContext('2d');
      const data = g.getImageData(0, 0, size, size).data;
      ink = false;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] > 12) { ink = true; break; }
      }
    } catch (e) {
      ink = true;
    }
    if (ink) return c;
    const g = c.getContext('2d');
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `700 ${Math.floor(size * 0.56)}px system-ui, sans-serif`;
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.fillText((label || '?').slice(0, 1).toUpperCase(), size / 2, size / 2);
    return c;
  }

  /* screen position of a board square */
  px(x) { return this.ox + x * this.tile; }
  py(y) { return this.oy + y * this.tile; }

  cellFromEvent(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const x = Math.floor((clientX - r.left - this.ox) / this.tile);
    const y = Math.floor((clientY - r.top - this.oy) / this.tile);
    if (x < 0 || y < 0 || x >= this.sim.w || y >= this.sim.h) return null;
    return { x, y };
  }

  draw() {
    const g = this.g;
    const s = this.sim;
    const T = this.tile;

    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.cssW, this.cssH);

    /* ---- board ---- */
    const r = Math.min(T * 0.28, 10);
    g.fillStyle = '#0d1117';
    g.beginPath();
    this.roundRect(this.ox - 6, this.oy - 6, this.boardW + 12, this.boardH + 12, r + 4);
    g.fill();

    for (let y = 0; y < s.h; y++) {
      for (let x = 0; x < s.w; x++) {
        const cell = s.cells[y * s.w + x];
        const X = this.px(x);
        const Y = this.py(y);

        if (!cell) {
          // empty case
          if (this.showGrid) {
            g.fillStyle = '#11161f';
            g.fillRect(X + 0.5, Y + 0.5, T - 1, T - 1);
            g.strokeStyle = 'rgba(120,150,200,0.055)';
            g.lineWidth = 1;
            g.strokeRect(X + 0.5, Y + 0.5, T - 1, T - 1);
          }
          continue;
        }

        this.drawTile(g, cell, X, Y, T, 1);
      }
    }

    /* ---- effects ---- */
    for (const b of s.beams) {
      const a = b.ttl / 2;
      g.strokeStyle = `rgba(255,110,140,${0.25 + a * 0.55})`;
      g.lineWidth = Math.max(2, T * 0.12);
      g.beginPath();
      g.moveTo(this.px(b.x1) + T / 2, this.py(b.y1) + T / 2);
      g.lineTo(this.px(b.x2) + T / 2, this.py(b.y2) + T / 2);
      g.stroke();
      g.strokeStyle = `rgba(255,220,230,${0.4 + a * 0.6})`;
      g.lineWidth = Math.max(1, T * 0.04);
      g.stroke();
    }
    for (const b of s.blasts) {
      const a = b.ttl / 2;
      g.strokeStyle = `rgba(255,170,110,${a * 0.9})`;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(this.px(b.x) + T / 2, this.py(b.y) + T / 2, T * (1.1 + (2 - b.ttl) * 0.8), 0, Math.PI * 2);
      g.stroke();
    }

    /* ---- ghost / brush preview ---- */
    if (this.hover && this.ghost) {
      const X = this.px(this.hover.x);
      const Y = this.py(this.hover.y);
      g.globalAlpha = 0.45;
      if (this.ghost.type === null) {
        g.strokeStyle = '#fb7185';
        g.lineWidth = 2;
        g.strokeRect(X + 1, Y + 1, T - 2, T - 2);
      } else {
        this.drawTile(g, { type: this.ghost.type, d: this.ghost.d, flash: 0 }, X, Y, T, 1);
      }
      g.globalAlpha = 1;

      const bs = this.brushSize || 1;
      if (bs > 1) {
        const d = (bs - 1) / 2;
        g.strokeStyle = 'rgba(125,211,252,0.55)';
        g.lineWidth = 1.5;
        g.strokeRect(this.px(this.hover.x - d) + 1, this.py(this.hover.y - d) + 1, T * bs - 2, T * bs - 2);
      } else {
        g.strokeStyle = 'rgba(125,211,252,0.9)';
        g.lineWidth = 2;
        g.strokeRect(X + 1, Y + 1, T - 2, T - 2);
      }
    }
  }

  roundRect(x, y, w, h, r) {
    const g = this.g;
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  drawTile(g, cell, X, Y, T, alpha) {
    const def = ALL[cell.type];
    if (!def) return;
    const isEffect = !!def.effect;
    const fam = FAMILIES[def.family];
    const color = isEffect ? def.color : (fam ? fam.color : '#94a3b8');
    const pad = Math.max(1, T * 0.06);

    if (isEffect) {
      // pulses and bullets: small bright dot
      const cx = X + T / 2;
      const cy = Y + T / 2;
      const rr = T * 0.22;
      const grad = g.createRadialGradient(cx, cy, 0, cx, cy, rr * 2.2);
      grad.addColorStop(0, color);
      grad.addColorStop(1, hexA(color, 0));
      g.fillStyle = grad;
      g.beginPath();
      g.arc(cx, cy, rr * 2.2, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(cx, cy, rr * 0.75, 0, Math.PI * 2);
      g.fill();
      return;
    }

    /* base square */
    g.fillStyle = hexA(color, cell.flash > 0.15 ? 0.42 : 0.18);
    g.beginPath();
    this.roundRect(X + pad, Y + pad, T - pad * 2, T - pad * 2, Math.max(2, T * 0.16));
    g.fill();
    g.strokeStyle = hexA(color, cell.flash > 0.15 ? 0.95 : 0.5);
    g.lineWidth = Math.max(1, T * 0.035);
    g.stroke();

    /* frozen tint */
    if (cell.frozen > 0) {
      g.fillStyle = 'rgba(140,200,255,0.35)';
      g.beginPath();
      this.roundRect(X + pad, Y + pad, T - pad * 2, T - pad * 2, Math.max(2, T * 0.16));
      g.fill();
    }

    /* emoji */
    const sp = this.sprites.get(cell.type);
    if (sp) g.drawImage(sp, X, Y, T, T);

    /* direction chevron */
    if (cell.d != null) {
      const cx = X + T / 2;
      const cy = Y + T / 2;
      const off = T * 0.36;
      const len = T * 0.16;
      const ang = [-Math.PI / 2, 0, Math.PI / 2, Math.PI][cell.d];
      const tipX = cx + Math.cos(ang) * off;
      const tipY = cy + Math.sin(ang) * off;
      g.fillStyle = hexA(color, 0.95);
      g.beginPath();
      g.moveTo(tipX, tipY);
      g.lineTo(tipX - Math.cos(ang - 0.9) * len, tipY - Math.sin(ang - 0.9) * len);
      g.lineTo(tipX - Math.cos(ang + 0.9) * len, tipY - Math.sin(ang + 0.9) * len);
      g.closePath();
      g.fill();
    }

    /* memory dot */
    if (cell.on) {
      g.fillStyle = '#fbbf24';
      g.beginPath();
      g.arc(X + T * 0.8, Y + T * 0.2, Math.max(1.5, T * 0.07), 0, Math.PI * 2);
      g.fill();
    }
  }
}
