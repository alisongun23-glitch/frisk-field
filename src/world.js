import { SIDES } from './config.js';

const NO_BONDS = [];

// Occupancy grid and particle store. At most one particle per cell; a cell's sides are its 8 neighbors.
export class World {
  constructor(width, height, wrap, classCount) {
    this.width = width;
    this.height = height;
    this.cells = new Array(width * height).fill(null);
    this.particles = [];
    this.counts = new Array(classCount).fill(0);
    this.nextId = 1;
    // Under energy rules, how close to 0 a molecule's overall energy must be for it to stop connecting.
    // null means hand-set matrices: touching is connecting, limited by Connect Amount.
    this.neutralBand = null;
    this.molecules = [];
    this.setWrap(wrap);
  }

  // Precompute every cell's 8 neighbor indices (-1 past a wall), in side order 1..8.
  setWrap(wrap) {
    const { width: W, height: H } = this;
    this.wrap = wrap;
    this.nbr = new Int32Array(W * H * 8);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const base = (y * W + x) * 8;
        for (let s = 0; s < 8; s++) this.nbr[base + s] = this.index(x + SIDES[s].dx, y + SIDES[s].dy);
      }
    }
    this.countTouching();
  }

  countTouching() {
    for (const p of this.particles) p.touching = this.neighborCount(p.cell);
  }

  index(x, y) {
    const { width: W, height: H } = this;
    if (x < 0 || x >= W) {
      if (!this.wrap) return -1;
      x = ((x % W) + W) % W;
    }
    if (y < 0 || y >= H) {
      if (!this.wrap) return -1;
      y = ((y % H) + H) % H;
    }
    return y * W + x;
  }

  neighborCount(cell) {
    const { nbr, cells } = this;
    let n = 0;
    for (let s = cell * 8, end = s + 8; s < end; s++) {
      const c = nbr[s];
      if (c >= 0 && cells[c] !== null) n++;
    }
    return n;
  }

  // Is every cell around this one taken or past a wall, so nothing here can go anywhere?
  boxedIn(cell) {
    const { nbr, cells } = this;
    for (let s = cell * 8, end = s + 8; s < end; s++) {
      const c = nbr[s];
      if (c >= 0 && cells[c] === null) return false;
    }
    return true;
  }

  neighbors(cell) {
    const out = [];
    for (let s = cell * 8, end = s + 8; s < end; s++) {
      const c = this.nbr[s];
      if (c >= 0 && this.cells[c] !== null) out.push(this.cells[c]);
    }
    return out;
  }

  adjacent(cell, other) {
    for (let s = cell * 8, end = s + 8; s < end; s++) if (this.nbr[s] === other) return true;
    return false;
  }

  // A particle's overall energy: the Energy_levels of its whole molecule added up.
  overallEnergy(p) {
    return p.mol === null ? p.energy : p.mol.net;
  }

  // Has this particle's molecule reached (about) 0 and stopped connecting?
  isNeutral(p) {
    return Math.abs(this.overallEnergy(p)) <= this.neutralBand;
  }

  // Can a particle with these traits occupy `cell`? Under energy rules touching means nothing, so any empty cell will
  // do; with hand-set matrices nobody may go over their Connect Amount. `mover` is the particle being moved there,
  // or null for a new one.
  canPlace(cell, traits, mover = null) {
    if (cell < 0 || this.cells[cell] !== null) return false;
    return this.neutralBand !== null || this.fitsConnectAmount(cell, traits.connect, mover);
  }

  fitsConnectAmount(cell, connect, mover) {
    const { nbr, cells } = this;
    let n = 0;
    for (let s = cell * 8, end = s + 8; s < end; s++) {
      const c = nbr[s];
      if (c < 0) continue;
      const q = cells[c];
      if (q === null || q === mover) continue;
      if (++n > connect) return false;
      // q gains a neighbor unless the mover already touches it.
      const gains = mover === null || !this.adjacent(mover.cell, c);
      if (gains && q.touching >= q.connect) return false;
    }
    return true;
  }

  add(cls, traits, cell, tick = 0) {
    const p = {
      id: this.nextId++,
      cls,
      cell,
      x: cell % this.width,
      y: Math.floor(cell / this.width),
      slot: this.particles.length,
      alive: true,
      primed: false,
      doomed: false,
      crushed: false,
      fusing: false,
      crowded: false,
      lastDir: -1,
      born: tick,
      touching: 0,
      bonds: NO_BONDS,
      mol: null,
      seek: null,
      seekAgain: 0,
      frisk: traits.frisk,
      randomWalk: traits.randomWalk,
      connect: traits.connect,
      stayProb: traits.stayProb,
      startProb: traits.startProb ?? 1,
      growthProb: traits.growthProb,
      patternMutation: traits.patternMutation,
      pattern: traits.growthPattern,
      step: traits.step ?? 0,
      deathProb: traits.deathProb,
      energy: traits.energy,
      variance: traits.variance,
    };
    this.cells[cell] = p;
    this.particles.push(p);
    this.counts[cls]++;
    if (this.neutralBand === null) this.join(p);
    return p;
  }

  move(p, cell) {
    this.cells[p.cell] = null;
    if (this.neutralBand === null) this.leave(p.cell);
    this.cells[cell] = p;
    p.cell = cell;
    p.x = cell % this.width;
    p.y = Math.floor(cell / this.width);
    if (this.neutralBand === null) this.join(p);
  }

  // With hand-set matrices every particle keeps a count of what touches it, since that is asked far more often than it
  // changes. Under energy rules touching means nothing, so it isn't kept up.
  join(p) {
    const { nbr, cells } = this;
    let n = 0;
    for (let s = p.cell * 8, end = s + 8; s < end; s++) {
      const c = nbr[s];
      if (c >= 0 && cells[c] !== null) {
        cells[c].touching++;
        n++;
      }
    }
    p.touching = n;
  }

  leave(cell) {
    const { nbr, cells } = this;
    for (let s = cell * 8, end = s + 8; s < end; s++) {
      const c = nbr[s];
      if (c >= 0 && cells[c] !== null) cells[c].touching--;
    }
  }

  remove(p) {
    this.cells[p.cell] = null;
    if (this.neutralBand === null) this.leave(p.cell);
    p.alive = false;
    const last = this.particles.pop();
    if (last !== p) {
      this.particles[p.slot] = last;
      last.slot = p.slot;
    }
    this.counts[p.cls]--;
  }

  // ---- Molecules: particles joined by bonds, which move as one and share an overall energy. ----

  addMolecule(members) {
    const mol = { slot: this.molecules.length, members, net: 0, turnAt: -1, checkAt: 0, crushCheckAt: 0, headX: 0, headY: 0, walk: 1, frisk: 1, seen: 0 };
    this.molecules.push(mol);
    for (const m of members) {
      m.mol = mol;
      mol.net += m.energy;
    }
    return mol;
  }

  removeMolecule(mol) {
    const last = this.molecules.pop();
    if (last !== mol) {
      this.molecules[mol.slot] = last;
      last.slot = mol.slot;
    }
    for (const m of mol.members) m.mol = null;
  }

  // Bond two particles. `host` is the one whose pattern the bond follows. Their molecules become one.
  addBond(host, guest, stored) {
    const bond = { host, guest, stored };
    if (host.bonds === NO_BONDS) host.bonds = [];
    if (guest.bonds === NO_BONDS) guest.bonds = [];
    host.bonds.push(bond);
    guest.bonds.push(bond);
    const a = host.mol;
    const b = guest.mol;
    if (a === null && b === null) {
      this.addMolecule([host, guest]);
    } else if (a !== b) {
      const big = b === null || (a !== null && a.members.length >= b.members.length) ? a : b;
      const small = big === a ? b : a;
      const incoming = small === null ? [big === a ? guest : host] : small.members.slice();
      if (small !== null) this.removeMolecule(small);
      for (const m of incoming) {
        m.mol = big;
        big.members.push(m);
        big.net += m.energy;
      }
    }
    return bond;
  }

  // Take a bond away. The molecule it held together is worked out again, and may come apart into several.
  removeBond(bond) {
    const { host, guest } = bond;
    host.bonds.splice(host.bonds.indexOf(bond), 1);
    guest.bonds.splice(guest.bonds.indexOf(bond), 1);
    this.regroup(host.mol);
  }

  // Sort a molecule's members into groups still joined by bonds. Anyone left without a bond is a free particle again.
  regroup(mol) {
    const { members } = mol;
    this.removeMolecule(mol);
    for (const start of members) {
      if (start.mol !== null || start.bonds.length === 0) continue;
      const group = [start];
      const seen = new Set(group);
      for (let i = 0; i < group.length; i++) {
        for (const b of group[i].bonds) {
          const other = b.host === group[i] ? b.guest : b.host;
          if (!seen.has(other)) {
            seen.add(other);
            group.push(other);
          }
        }
      }
      this.addMolecule(group);
    }
  }

  // Move a whole molecule by one offset at once, keeping its shape. False if a cell it needs is taken or past a wall.
  shift(members, dx, dy) {
    const targets = [];
    for (const m of members) {
      const t = this.index(m.x + dx, m.y + dy);
      if (t < 0) return false;
      const q = this.cells[t];
      if (q !== null && q.mol !== m.mol) return false;
      targets.push(t);
    }
    for (const m of members) this.cells[m.cell] = null;
    members.forEach((m, i) => {
      const t = targets[i];
      this.cells[t] = m;
      m.cell = t;
      m.x = t % this.width;
      m.y = Math.floor(t / this.width);
    });
    return true;
  }

  // How many particles are in molecules of each size: { size: particles }, with free particles under 1.
  census() {
    const out = {};
    let inMolecules = 0;
    for (const mol of this.molecules) {
      const n = mol.members.length;
      out[n] = (out[n] ?? 0) + n;
      inMolecules += n;
    }
    const free = this.particles.length - inMolecules;
    if (free > 0) out[1] = free;
    return out;
  }
}
