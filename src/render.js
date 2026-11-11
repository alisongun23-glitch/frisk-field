import { TRAIT_BY_KEY } from './config.js';
import { PRESSURE_BLOCK } from './pressure.js';

// Draws the chamber: particles and the energy field go into a buffer with one pixel per cell, the part the camera
// can see is copied onto the screen with crisp edges, and marks like the brush outline are drawn on top.

const rgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [n >>> 16, (n >>> 8) & 255, n & 255];
};
// ImageData is little-endian RGBA, so a Uint32 pixel reads as 0xAABBGGRR.
const packRGB = (r, g, b) => ((255 << 24) | (Math.round(b) << 16) | (Math.round(g) << 8) | Math.round(r)) >>> 0;
const pack = (hex) => packRGB(...rgb(hex));

function ramp(stops, n = 256) {
  const cols = stops.map(rgb);
  const out = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * (cols.length - 1);
    const j = Math.min(cols.length - 2, Math.floor(t));
    const f = t - j;
    const [a, b] = [cols[j], cols[j + 1]];
    out[i] = packRGB(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f);
  }
  return out;
}

export const SCREEN = '#0a0f14';
// Device pixels per cell at which bonds start being drawn.
const BONDS_FROM = 6;
const EDGE = '#222d36';

// Field overlay. Every field color is darker than any class color, so a particle never reads as energy.
// Cells at or past a threshold get a checkerboard, a texture no particle has.
const FIELD = {
  pos: ramp([SCREEN, '#24120d', '#45190f']),
  neg: ramp([SCREEN, '#0d1629', '#172c57']),
  hot: [pack('#6a2617'), pack('#45190f')],
  cold: [pack('#1d3d7a'), pack('#172c57')],
};

export const STATE_COLORS = { free: '#5c6872', touching: '#c2cbd3', neutral: '#3987e5', primed: '#199e70', crushed: '#b39b00', fusing: '#199e70', unstable: '#ffffff', steadied: '#d24bb8', doomed: '#e66767' };
const STATE_PACKED = Object.fromEntries(Object.entries(STATE_COLORS).map(([k, v]) => [k, pack(v)]));

// Trait coloring: one blue hue dark to light for magnitudes; Energy_level is signed, so blue, gray, red.
export const TRAIT_RAMP = ['#184f95', '#2a78d6', '#5598e7', '#86b6ef', '#cde2fb'];
export const ENERGY_RAMP = ['#86b6ef', '#59636c', '#f08b78'];
const TRAIT_LUT = ramp(TRAIT_RAMP);
const ENERGY_LUT = ramp(ENERGY_RAMP);

// Pressure overlay: a violet haze over everything, thicker with more pressure. Most of the map has a little, so the haze
// climbs quickly at first, and it stays thin enough to see the particles through.
const [HAZE_R, HAZE_G, HAZE_B] = rgb('#9085e9');
const THICKEST_AT = 40;
const THICKEST = 0.55;
const HAZE = Uint32Array.from({ length: 256 }, (_, i) => ((Math.round((i / 255) * THICKEST * 255) << 24) | (HAZE_B << 16) | (HAZE_G << 8) | HAZE_R) >>> 0);

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.buffer = document.createElement('canvas');
    this.bctx = this.buffer.getContext('2d', { alpha: false });
    this.bg = pack(SCREEN);
  }

  ensureSize(w, h) {
    if (this.buffer.width === w && this.buffer.height === h && this.image) return;
    this.buffer.width = w;
    this.buffer.height = h;
    this.image = this.bctx.createImageData(w, h);
    this.pixels = new Uint32Array(this.image.data.buffer);
  }

  draw(sim, view, cam) {
    const { world, field, config } = sim;
    const { canvas, ctx } = this;
    this.ensureSize(world.width, world.height);
    const cw = Math.max(1, Math.round(cam.viewW * cam.dpr));
    const ch = Math.max(1, Math.round(cam.viewH * cam.dpr));
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }

    // Only the cells on screen need filling in.
    const W = world.width;
    const dz = cam.deviceZoom;
    const left = cam.left;
    const top = cam.top;
    const x0 = Math.max(0, Math.floor(-left / dz));
    const y0 = Math.max(0, Math.floor(-top / dz));
    const x1 = Math.min(W, Math.ceil((cw - left) / dz));
    const y1 = Math.min(world.height, Math.ceil((ch - top) / dz));

    const px = this.pixels;
    const { cells } = world;
    const { spawnThreshold, spawnBuffer, burnThreshold, killThreshold } = config.globals;
    // The checkerboard marks energy that does something: under energy rules that's what burns.
    const hotAt = sim.energyRules ? spawnBuffer + burnThreshold : spawnThreshold;
    const classColors = config.classes.map((c) => pack(c.color));
    const colorOf = this.colorFn(sim, view.colorBy, classColors);
    for (let y = y0; y < y1; y++) {
      for (let x = x0, i = y * W + x0; x < x1; x++, i++) {
        const p = cells[i];
        if (p !== null) {
          px[i] = colorOf(p);
          continue;
        }
        const e = view.overlay ? field[i] : 0;
        if (e > 0) {
          px[i] = e >= hotAt ? FIELD.hot[(x + y) & 1] : FIELD.pos[Math.min(255, (Math.sqrt(e / hotAt) * 255) | 0)];
        } else if (e < 0) {
          px[i] = e <= killThreshold ? FIELD.cold[(x + y) & 1] : FIELD.neg[Math.min(255, (Math.sqrt(e / killThreshold) * 255) | 0)];
        } else {
          px[i] = this.bg;
        }
      }
    }
    const w = x1 - x0;
    const h = y1 - y0;
    this.bctx.putImageData(this.image, 0, 0, x0, y0, w, h);

    ctx.fillStyle = SCREEN;
    ctx.fillRect(0, 0, cw, ch);
    // Below one device pixel per cell, cells have to be blended or sparse ones would vanish.
    ctx.imageSmoothingEnabled = dz < 1;
    ctx.imageSmoothingQuality = 'high';
    if (w > 0 && h > 0) ctx.drawImage(this.buffer, x0, y0, w, h, left + x0 * dz, top + y0 * dz, w * dz, h * dz);
    ctx.strokeStyle = EDGE;
    ctx.lineWidth = 1;
    ctx.strokeRect(left - 0.5, top - 0.5, W * dz + 1, world.height * dz + 1);
  }

  // Thin lines along bonds, once cells are big enough to show them. Touching doesn't mean connected, so this is the
  // only way to see the difference.
  drawBonds(world, cam) {
    const dz = cam.deviceZoom;
    if (dz < BONDS_FROM || world.molecules.length === 0) return;
    const { ctx, canvas } = this;
    const { left, top } = cam;
    ctx.lineWidth = Math.max(1, dz * 0.14);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.beginPath();
    for (const mol of world.molecules) {
      for (const m of mol.members) {
        const x = left + (m.x + 0.5) * dz;
        const y = top + (m.y + 0.5) * dz;
        if (x < -dz || y < -dz || x > canvas.width + dz || y > canvas.height + dz) continue;
        for (const b of m.bonds) {
          if (b.host !== m) continue;
          // Bonds across a wrapped edge are skipped: a line right across the map would mean nothing.
          if (Math.abs(b.guest.x - m.x) > 1 || Math.abs(b.guest.y - m.y) > 1) continue;
          ctx.moveTo(x, y);
          ctx.lineTo(left + (b.guest.x + 0.5) * dz, top + (b.guest.y + 0.5) * dz);
        }
      }
    }
    ctx.stroke();
  }

  // One pixel per block of pressure, stretched smoothly over the map, on top of the particles.
  drawPressure(pressure, world, cam) {
    if (pressure.empty) return;
    const { cols, rows, level } = pressure;
    if (!this.haze || this.haze.width !== cols || this.haze.height !== rows) {
      this.haze = document.createElement('canvas');
      this.haze.width = cols;
      this.haze.height = rows;
      this.hctx = this.haze.getContext('2d');
      this.hazeImage = this.hctx.createImageData(cols, rows);
      this.hazePixels = new Uint32Array(this.hazeImage.data.buffer);
    }
    const px = this.hazePixels;
    for (let b = 0; b < px.length; b++) {
      const v = level[b];
      px[b] = v === 0 ? 0 : HAZE[Math.min(255, (Math.sqrt(v / THICKEST_AT) * 255) | 0)];
    }
    this.hctx.putImageData(this.hazeImage, 0, 0);
    const { ctx } = this;
    const dz = cam.deviceZoom;
    ctx.save();
    ctx.beginPath();
    ctx.rect(cam.left, cam.top, world.width * dz, world.height * dz);
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.haze, cam.left, cam.top, cols * PRESSURE_BLOCK * dz, rows * PRESSURE_BLOCK * dz);
    ctx.restore();
  }

  colorFn(sim, mode, classColors) {
    if (mode === 'state') return (p) => STATE_PACKED[sim.stateOf(p)];
    if (mode === 'overall') {
      const { world } = sim;
      return (p) => ENERGY_LUT[Math.round(((Math.max(-10, Math.min(10, world.overallEnergy(p))) + 10) / 20) * 255)];
    }
    const def = TRAIT_BY_KEY[mode];
    if (!def) return (p) => classColors[p.cls];
    const lut = mode === 'energy' ? ENERGY_LUT : TRAIT_LUT;
    const span = def.max - def.min;
    // Fusion can take a level past the end of the ramp.
    return (p) => lut[Math.round(((Math.max(def.min, Math.min(def.max, p[mode])) - def.min) / span) * 255)];
  }

  // Seed location rings, drawn for the Seeds brush: a ring for the area it fills and a dot to grab it by.
  drawSites(sites, cam) {
    const { ctx } = this;
    const dz = cam.deviceZoom;
    // With hundreds of them, plain dots leave the map visible. Outlines come back once zoomed in far enough to tell apart.
    const crowded = sites.length > 200;
    const dot = (crowded ? 1.5 : 4) * cam.dpr;
    for (const s of sites) {
      const x = cam.left + (s.x + 0.5) * dz;
      const y = cam.top + (s.y + 0.5) * dz;
      const ring = (s.radius + 0.5) * dz;
      if (!crowded || s.hot || ring >= dot * 8) {
        ctx.lineWidth = 1.5 * cam.dpr;
        ctx.strokeStyle = s.color;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(dot * 2, ring), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(x, y, s.hot ? dot * 1.5 : dot, 0, Math.PI * 2);
      ctx.fillStyle = s.color;
      ctx.fill();
      if (!crowded || s.hot) {
        ctx.lineWidth = cam.dpr;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
      }
    }
  }

  // The hovered cell or brush outline.
  drawCursor(cursor, cam) {
    if (!cursor) return;
    const { ctx } = this;
    const dz = cam.deviceZoom;
    const x = cam.left + cursor.x * dz;
    const y = cam.top + cursor.y * dz;
    ctx.lineWidth = Math.max(1, cam.dpr);
    ctx.strokeStyle = 'rgba(238, 161, 60, 0.9)';
    if (cursor.radius === null) {
      const size = Math.max(3 * cam.dpr, dz);
      ctx.strokeRect(x + (dz - size) / 2 + 0.5, y + (dz - size) / 2 + 0.5, size - 1, size - 1);
    } else {
      ctx.beginPath();
      ctx.arc(x + dz / 2, y + dz / 2, Math.max(3 * cam.dpr, (cursor.radius + 0.5) * dz), 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}
