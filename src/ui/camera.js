import { clamp } from '../config.js';

// How far the chamber can zoom in, in screen pixels per cell.
export const MAX_ZOOM = 40;

// Once cells are this many device pixels wide, the zoom sticks to whole device pixels so they all come out the same
// size. Below this the unevenness doesn't show, and filling the chamber matters more.
const CRISP_FROM = 4;

// Which part of the map the chamber shows. Positions are in CSS pixels from the chamber's corner; drawing happens
// in device pixels.
export class Camera {
  constructor() {
    this.viewW = 1;
    this.viewH = 1;
    this.dpr = 1;
    this.worldW = 1;
    this.worldH = 1;
    this.fit();
  }

  setView(viewW, viewH, dpr) {
    if (viewW === this.viewW && viewH === this.viewH && dpr === this.dpr) return;
    const wider = Math.max(1, viewW) - this.viewW;
    const taller = Math.max(1, viewH) - this.viewH;
    this.viewW = Math.max(1, viewW);
    this.viewH = Math.max(1, viewH);
    this.dpr = dpr;
    if (this.fitted || this.zoom < this.fitZoom) {
      this.fit();
      return;
    }
    // Zoomed in, what's on screen stays where it is, and only the far edges of the view move.
    this.cx += wider / (2 * this.zoom);
    this.cy += taller / (2 * this.zoom);
    this.clampCenter();
  }

  setWorld(worldW, worldH) {
    if (worldW === this.worldW && worldH === this.worldH) return;
    this.worldW = worldW;
    this.worldH = worldH;
    this.fit();
  }

  // The zoom that shows the whole map.
  get fitZoom() {
    const z = Math.min(this.viewW / this.worldW, this.viewH / this.worldH);
    const device = z * this.dpr;
    return device >= CRISP_FROM ? Math.floor(device) / this.dpr : z;
  }

  fit() {
    this.fitted = true;
    this.zoom = this.wanted = this.fitZoom;
    this.cx = this.worldW / 2;
    this.cy = this.worldH / 2;
  }

  snap(z) {
    const device = z * this.dpr;
    return device >= CRISP_FROM ? Math.round(device) / this.dpr : z;
  }

  // Zoom by `factor`, keeping the map point under (px, py) where it is. Returns true if the view changed.
  zoomAt(factor, px, py) {
    const fit = this.fitZoom;
    const before = this.zoom;
    const wx = (px - this.left / this.dpr) / this.zoom;
    const wy = (py - this.top / this.dpr) / this.zoom;
    this.wanted = clamp(this.wanted * factor, fit, MAX_ZOOM);
    this.zoom = Math.max(fit, this.snap(this.wanted));
    if (this.zoom === fit) {
      this.fit();
      return before !== fit;
    }
    this.fitted = false;
    this.cx = wx - (px - this.viewW / 2) / this.zoom;
    this.cy = wy - (py - this.viewH / 2) / this.zoom;
    this.clampCenter();
    return this.zoom !== before;
  }

  // One press of a zoom button, around the middle of the view. Always moves at least one whole step.
  zoomStep(direction) {
    this.wanted = direction > 0 ? Math.max(this.zoom * 1.5, this.zoom + 1 / this.dpr) : this.zoom / 1.5;
    return this.zoomAt(1, this.viewW / 2, this.viewH / 2);
  }

  pan(dx, dy) {
    this.cx -= dx / this.zoom;
    this.cy -= dy / this.zoom;
    this.clampCenter();
  }

  clampCenter() {
    const halfW = this.viewW / (2 * this.zoom);
    const halfH = this.viewH / (2 * this.zoom);
    this.cx = this.worldW <= 2 * halfW ? this.worldW / 2 : clamp(this.cx, halfW, this.worldW - halfW);
    this.cy = this.worldH <= 2 * halfH ? this.worldH / 2 : clamp(this.cy, halfH, this.worldH - halfH);
  }

  get deviceZoom() {
    return this.zoom * this.dpr;
  }

  // Where the map's top-left corner lands, in whole device pixels.
  get left() {
    return Math.round((this.viewW * this.dpr) / 2 - this.cx * this.deviceZoom);
  }

  get top() {
    return Math.round((this.viewH * this.dpr) / 2 - this.cy * this.deviceZoom);
  }

  toCell(px, py) {
    return {
      x: Math.floor((px * this.dpr - this.left) / this.deviceZoom),
      y: Math.floor((py * this.dpr - this.top) / this.deviceZoom),
    };
  }

  // The CSS-pixel position of a point on the map, counted in cells.
  toView(x, y) {
    return {
      x: (this.left + x * this.deviceZoom) / this.dpr,
      y: (this.top + y * this.deviceZoom) / this.dpr,
    };
  }
}
