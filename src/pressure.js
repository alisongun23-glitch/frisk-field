// Energy rules: pressure, a second field laid over the whole map. It builds where the energy on a cell is very low, spreads
// out and fades, and pushes particles and molecules from high to low, the way charge pulls them in. It changes smoothly,
// so it's kept in blocks of cells and looked over every few ticks.

export const PRESSURE_BLOCK = 4;
const REFRESH_EVERY = 4;
// The strongest a push can get, against a pull that's never more than 1.
const STRONGEST = 2;
// Pressure smaller than this counts as none, so that a map with no pressure on it costs next to nothing.
const NOTHING = 1e-3;

export class PressureMap {
  constructor(world) {
    this.cols = Math.ceil(world.width / PRESSURE_BLOCK);
    this.rows = Math.ceil(world.height / PRESSURE_BLOCK);
    this.level = new Float64Array(this.cols * this.rows);
    this.next = new Float64Array(this.cols * this.rows);
    this.empty = true;
    this.highest = 0;
    this.pushX = 0;
    this.pushY = 0;
  }

  // Every few ticks: what the cold cells add, then the spread and the fade.
  refresh(world, field, globals, tick) {
    if (tick % REFRESH_EVERY !== 0) return;
    const built = this.build(world, field, globals.pressureLine);
    if (built || !this.empty) this.spread(world.wrap, globals.pressureSpread, (1 - globals.pressureFade) ** REFRESH_EVERY);
  }

  // A block gains the average of how far each of its cells is below the line, for each tick since the last look.
  build(world, field, line) {
    const { width: W, height: H } = world;
    const { level, cols } = this;
    const share = REFRESH_EVERY / (PRESSURE_BLOCK * PRESSURE_BLOCK);
    let built = false;
    for (let y = 0, i = 0; y < H; y++) {
      const row = Math.floor(y / PRESSURE_BLOCK) * cols;
      for (let x = 0; x < W; x++, i++) {
        const e = field[i];
        if (e < line) {
          level[row + Math.floor(x / PRESSURE_BLOCK)] += (line - e) * share;
          built = true;
        }
      }
    }
    return built;
  }

  // One step of flowing to the four neighboring blocks, written to the other array. A wall counts as the block itself, so
  // no pressure leaks out.
  spread(wrap, rate, keep) {
    const { level, next, cols, rows } = this;
    let highest = 0;
    for (let r = 0, b = 0; r < rows; r++) {
      const up = r > 0 ? -cols : wrap ? cols * (rows - 1) : 0;
      const down = r < rows - 1 ? cols : wrap ? -cols * (rows - 1) : 0;
      for (let c = 0; c < cols; c++, b++) {
        const v = level[b];
        const west = c > 0 ? -1 : wrap ? cols - 1 : 0;
        const east = c < cols - 1 ? 1 : wrap ? 1 - cols : 0;
        let n = (v + rate * (level[b + up] + level[b + down] + level[b + west] + level[b + east] - 4 * v)) * keep;
        if (n < NOTHING) n = 0;
        else if (n > highest) highest = n;
        next[b] = n;
      }
    }
    this.level = next;
    this.next = level;
    this.highest = highest;
    this.empty = highest === 0;
  }

  at(x, y) {
    return this.level[Math.floor(y / PRESSURE_BLOCK) * this.cols + Math.floor(x / PRESSURE_BLOCK)];
  }

  // Works out the push at a cell into pushX and pushY: from the side with more pressure toward the side with less.
  feel(world, x, y, strength) {
    if (this.empty || strength === 0) {
      this.pushX = 0;
      this.pushY = 0;
      return;
    }
    const { level, cols, rows } = this;
    const { wrap } = world;
    const c = Math.floor(x / PRESSURE_BLOCK);
    const r = Math.floor(y / PRESSURE_BLOCK);
    const b = r * cols + c;
    const west = level[c > 0 ? b - 1 : wrap ? b + cols - 1 : b];
    const east = level[c < cols - 1 ? b + 1 : wrap ? b + 1 - cols : b];
    const north = level[r > 0 ? b - cols : wrap ? b + cols * (rows - 1) : b];
    const south = level[r < rows - 1 ? b + cols : wrap ? b - cols * (rows - 1) : b];
    let fx = ((west - east) / 2) * strength;
    let fy = ((north - south) / 2) * strength;
    const size = Math.hypot(fx, fy);
    if (size > STRONGEST) {
      fx *= STRONGEST / size;
      fy *= STRONGEST / size;
    }
    this.pushX = fx;
    this.pushY = fy;
  }
}
