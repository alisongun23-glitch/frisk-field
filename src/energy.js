// The energy field: deaths deposit into it, it diffuses and decays, and extreme cells spawn or destroy particles.

// Falloff kernel for a death: the center gets the largest share, each ring outward less, shares sum to 1.
export function buildKernel(radius) {
  if (radius <= 0) return Object.assign([{ dx: 0, dy: 0, w: 1 }], { reach: 0 });
  const sigma = Math.max(0.6, radius / 2);
  const kernel = [];
  let sum = 0;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const d2 = dx * dx + dy * dy;
      if (d2 > (radius + 0.5) ** 2) continue;
      const w = Math.exp(-d2 / (2 * sigma * sigma));
      kernel.push({ dx, dy, w });
      sum += w;
    }
  }
  for (const k of kernel) k.w /= sum;
  kernel.reach = radius;
  return kernel;
}

// Spread `amount` around `cell`. Near a wall the kernel is renormalized, so the total is still exactly `amount`.
export function deposit(world, field, cell, amount, kernel) {
  if (!amount) return;
  const x = cell % world.width;
  const y = Math.floor(cell / world.width);
  let inside = 0;
  for (const k of kernel) if (world.index(x + k.dx, y + k.dy) >= 0) inside += k.w;
  const scale = amount / inside;
  for (const k of kernel) {
    const c = world.index(x + k.dx, y + k.dy);
    if (c >= 0) field[c] += k.w * scale;
  }
}

// Take `amount` out of the positive energy around `cell`, each cell giving in proportion to what it holds.
export function drain(world, field, cell, amount, kernel) {
  const x = cell % world.width;
  const y = Math.floor(cell / world.width);
  const cells = [];
  let total = 0;
  for (const k of kernel) {
    const c = world.index(x + k.dx, y + k.dy);
    if (c >= 0 && field[c] > 0) {
      cells.push(c);
      total += field[c];
    }
  }
  if (total <= 0) return;
  const keep = Math.max(0, 1 - amount / total);
  for (const c of cells) field[c] *= keep;
}

// One explicit diffusion step (4-neighbor Laplacian) followed by decay, written into `out`.
// A wall counts as the cell itself, so no energy leaks out. Returns the new positive and negative totals.
export function diffuse(world, field, out, rate, decay) {
  const { width: W, height: H, wrap } = world;
  const keep = 1 - decay;
  // With decay on, energy that has faded to almost nothing becomes exactly 0 rather than shrinking forever.
  const faded = decay > 0 ? 1e-4 : 0;
  let pos = 0;
  let neg = 0;
  for (let y = 0, i = 0; y < H; y++) {
    const up = y > 0 ? -W : wrap ? W * (H - 1) : 0;
    const down = y < H - 1 ? W : wrap ? -W * (H - 1) : 0;
    for (let x = 0; x < W; x++, i++) {
      const e = field[i];
      const west = x > 0 ? i - 1 : wrap ? i + W - 1 : i;
      const east = x < W - 1 ? i + 1 : wrap ? i - W + 1 : i;
      let v = (e + rate * (field[i + up] + field[i + down] + field[west] + field[east] - 4 * e)) * keep;
      if (v > faded) pos += v;
      else if (v < -faded) neg += v;
      else v = 0;
      out[i] = v;
    }
  }
  return { pos, neg };
}

// The same with diffusion off, when each cell only fades: done in place, and empty cells cost next to nothing.
export function fade(field, decay) {
  const keep = 1 - decay;
  const faded = decay > 0 ? 1e-4 : 0;
  let pos = 0;
  let neg = 0;
  for (let i = 0, n = field.length; i < n; i++) {
    const e = field[i];
    if (e === 0) continue;
    let v = e * keep;
    if (v > faded) pos += v;
    else if (v < -faded) neg += v;
    else v = 0;
    field[i] = v;
  }
  return { pos, neg };
}

// The class with the highest Energy_level that `excess` can pay for (ties broken at random), or -1. With `anySign` on,
// energy pays for the size of a level, so a -3 costs the same as a +3; otherwise only positive classes count.
export function spawnClassFor(classes, excess, rng, anySign = false) {
  let best = 0;
  let picks = [];
  classes.forEach((c, k) => {
    const e = anySign ? Math.abs(c.traits.energy) : c.traits.energy;
    if (c.spawns === false || e <= 0 || e > excess) return;
    if (e > best) {
      best = e;
      picks = [k];
    } else if (e === best) {
      picks.push(k);
    }
  });
  if (picks.length === 0) return -1;
  return picks.length === 1 ? picks[0] : picks[rng.int(picks.length)];
}
