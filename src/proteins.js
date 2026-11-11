// Proteins: little machines that carry a particle from one place to another and bond it onto something there, found by
// trying designs in the simulator. They're laid out and placed just like compounds.
//
// Most of them share three tricks:
// - A carrier and its parcel add up to 0. At about 0 charges stop mattering to a molecule, and it creeps toward the
//   densest thing within about 32 cells instead, so the dock comes with a thick wall to make it the densest thing around.
// - A molecule member lets go when it pulls the opposite way from all the rest. At the dock the parcel is drawn in while
//   the carrier is pushed away, so only there does the parcel let go. Only the member that differs most may leave, so the
//   carrier's own parts, which never let go, can't fall apart.
// - The parcel bonds onto a socket with its own side. In a pair it's always the second one, the socket, that may leave,
//   and a socket never does, so the parcel stays. The Lock and key protein turns this into a lock: see lockRun.
//
// The Replicator is different: it doesn't carry anything, it makes more of itself. See replicatorRun.

import { createRng } from './rng.js';

const N = 1;
const NE = 2;
const E = 3;
const S = 5;
const SW = 6;
const W = 7;

const column = (c, x, y0, h) => Array.from({ length: h }, (_, i) => ({ c, x, y: y0 + i }));
const row = (c, x0, y, w) => Array.from({ length: w }, (_, i) => ({ c, x: x0 + i, y }));

// A dock: a column of sockets facing out, with a block of neutral wall behind them, centered on row `y`.
export function dockAt(parts, x, h, thick, y = 0) {
  const y0 = y - Math.floor(h / 2);
  parts.push(...column('socket', x, y0, h));
  for (let k = 0; k < thick; k++) parts.push(...column('wall', x + 1 + k, y0, h));
}

// A carrier, its grip at (x, y) with its tail behind it, and a parcel waiting `gap` cells ahead of it, if any.
function carrierAt(parts, bonds, x, y, gap = 0) {
  const g = parts.length;
  parts.push({ c: 'grip', x, y }, { c: 'tail', x: x - 1, y });
  bonds.push([g, g + 1]);
  if (gap) parts.push({ c: 'parcel', x: x + gap, y: y + 1 });
}

function courierRun() {
  const parts = [];
  const bonds = [];
  dockAt(parts, 18, 9, 5);
  carrierAt(parts, bonds, -16, 0, 4);
  return { parts, bonds };
}

function crewRun() {
  const parts = [];
  const bonds = [];
  dockAt(parts, 14, 17, 4);
  for (let i = 0; i < 4; i++) carrierAt(parts, bonds, -(i % 2) * 4, Math.round((i - 1.5) * 10), 4);
  return { parts, bonds };
}

function retrieverRun() {
  const parts = [];
  const bonds = [];
  dockAt(parts, 14, 13, 5);
  carrierAt(parts, bonds, 11, 0);
  for (const [x, y] of [[-4, -9], [-8, 0], [-4, 9]]) {
    const p = parts.length;
    parts.push({ c: 'post', x, y }, { c: 'wall', x: x - 1, y }, { c: 'parcel', x: x + 1, y });
    bonds.push([p, p + 1]);
  }
  return { parts, bonds };
}

// A barrel of neutral wall with its back closed, a shot inside, and a dock across the map.
function barrel(parts) {
  parts.push(...row('wall', -38, -1, 14), ...row('wall', -38, 1, 14), { c: 'wall', x: -39, y: 0 });
  dockAt(parts, 30, 7, 2);
}

function slingshotRun() {
  const parts = [];
  barrel(parts);
  const b = parts.length;
  parts.push({ c: 'breech', x: -37, y: 0 }, { c: 'wall', x: -38, y: 0 }, { c: 'shot', x: -35, y: 0 });
  return { parts, bonds: [[b, b + 1]] };
}

// The lock and its parcel, wedged in walls so that the pair can't slide any way, with Courier B waiting by the way out and
// Dock B beyond it. With `keys` at 1, a slingshot far to the east fires the key along the row of the slot.
function lockRun(keys = 1) {
  const parts = [];
  const bonds = [];
  const [lx, ly] = [-14, -8];
  const p = parts.length;
  parts.push({ c: 'parcel', x: lx - 1, y: ly }, { c: 'lock', x: lx, y: ly });
  bonds.push([p, p + 1]);
  // The wedge, a cap over it and a wall out to each side, so that Courier B can only wait on the dock's side.
  const walls = [[1, 0], [-2, 0], [0, -1], [-1, -1], [0, 1], [-1, 1], [1, 1], [-2, -1], [-3, 1], [-3, -1], [-3, 0], [-3, -2], [-2, -2], [-1, -2], [0, -2],
    [2, 0], [3, 0], [4, 0], [5, 0], [6, 0]];
  for (const [dx, dy] of walls) parts.push({ c: 'wall', x: lx + dx, y: ly + dy });
  const g = parts.length;
  parts.push({ c: 'gripB', x: lx - 5, y: ly + 4 }, { c: 'tailB', x: lx - 6, y: ly + 4 });
  bonds.push([g, g + 1]);
  if (keys > 0) {
    const y = ly - 1;
    const x0 = lx + 32;
    parts.push(...row('wall', x0, y - 1, 12), ...row('wall', x0, y + 1, 12));
    const k = parts.length;
    parts.push({ c: 'launcher', x: x0 + 11, y }, { c: 'wall', x: x0 + 12, y }, { c: 'key', x: x0 + 9, y });
    bonds.push([k, k + 1]);
  }
  dockAt(parts, 0, 17, 8);
  // The dock sits lower than the others, out of the key's way.
  for (const part of parts.slice(-17 * 9)) part.y += 8;
  return { parts, bonds };
}

// A rod of four, + − + −, in the middle of loose parts. Its parts never bond with each other while both are loose
// (Start_Prob 0), so only a rod can grow, from both ends. At the Largest molecule the rod divides in the middle, and an
// even length means both halves are the same rod again. The parts are scattered the same way every time.
const ROD = 4;
function replicatorRun(rods = 1) {
  const parts = [];
  const bonds = [];
  const taken = new Set();
  const put = (c, x, y) => {
    taken.add(`${x},${y}`);
    parts.push({ c, x, y });
    return parts.length - 1;
  };
  if (rods > 0) {
    for (let i = 0; i < ROD; i++) {
      put(i % 2 === 0 ? 'plus' : 'minus', i - ROD / 2, 0);
      if (i > 0) bonds.push([parts.length - 2, parts.length - 1]);
    }
  }
  const rng = createRng(2024);
  for (const c of ['minus', 'plus']) {
    for (let k = 0; k < 110;) {
      const x = rng.int(62) - 31;
      const y = rng.int(42) - 21;
      if ((Math.abs(x) <= ROD && Math.abs(y) <= 2) || taken.has(`${x},${y}`)) continue;
      put(c, x, y);
      k++;
    }
  }
  return { parts, bonds };
}

// A loading bay: a parcel above and below the lane, each with a post beyond it, and a wall behind both. The two parcels
// push each other out against their posts, and the wall means they can only come out toward the lane. The bus starts on
// the dock's side of the bay, so once it's loaded nothing stands between it and the dock: a molecule at 0 never steps
// around anything in its way.
function busRun() {
  const parts = [];
  const bonds = [];
  parts.push({ c: 'bus', x: -13, y: 0 });
  for (const side of [-1, 1]) {
    const p = parts.length;
    parts.push({ c: 'post', x: -18, y: 2 * side }, { c: 'wall', x: -18, y: 3 * side }, { c: 'parcel', x: -18, y: side });
    bonds.push([p, p + 1]);
  }
  parts.push(...column('wall', -19, -2, 5));
  dockAt(parts, 10, 11, 6);
  return { parts, bonds };
}

// Three crates bonded in a row, with the driver a few cells behind them.
function freighterRun() {
  const parts = [];
  const bonds = [];
  parts.push({ c: 'driver', x: -24, y: 0 });
  const c = parts.length;
  parts.push(...row('crate', -20, 0, 3));
  bonds.push([c, c + 1], [c + 1, c + 2]);
  dockAt(parts, 18, 9, 6);
  return { parts, bonds };
}

// A garage: the driver parked with the holder east of it, both wedged in walls so the pair can't slide, two −3 charges
// sealed in the wall under them, the way out straight above the driver and the key's slot above and right of the holder.
// The key waits four cells straight above its slot: from there the pull of the garage brings it straight down.
const GARAGE_WALLS = [[-1, -1], [-1, 0], [-1, 1], [1, -1], [2, 0], [2, 1], [-1, 2], [0, 2], [1, 2], [2, 2]];
function garageAt(parts, bonds, holder, x, y, withKey) {
  const d = parts.length;
  parts.push({ c: 'driver', x, y }, { c: holder, x: x + 1, y });
  bonds.push([d, d + 1]);
  for (const [dx, dy] of GARAGE_WALLS) parts.push({ c: 'wall', x: x + dx, y: y + dy });
  parts.push({ c: 'charge', x, y: y + 1 }, { c: 'charge', x: x + 1, y: y + 1 });
  if (withKey) parts.push({ c: 'key', x: x + 2, y: y - 5 });
}

// The garage and the decoy, far enough apart not to feel each other, each with its key waiting above. The package waits on
// a post up the garage's way out, just out of the parked driver's reach but in reach as soon as it steps out, with the
// post on the far side from the dock. The dock is off to the right.
function garageRun(keys = 1) {
  const parts = [];
  const bonds = [];
  garageAt(parts, bonds, 'garage', -24, -8, keys > 0);
  const p = parts.length;
  parts.push({ c: 'post', x: -24, y: -15 }, { c: 'wall', x: -25, y: -15 }, { c: 'package', x: -23, y: -15 });
  bonds.push([p, p + 1]);
  garageAt(parts, bonds, 'decoy', -24, 14, keys > 0);
  dockAt(parts, -6, 17, 8, -16);
  return { parts, bonds };
}

function steamRun() {
  const parts = [];
  barrel(parts);
  parts.push({ c: 'shot', x: -33, y: 0 });
  return { parts, heat: [{ x: -38, y: 0, amount: -250 }, { x: -37, y: 0, amount: -250 }] };
}

const wall = { name: 'Dock wall', color: '#3a4650', energy: 0, frisk: 0, pattern: [N] };
const socket = { name: 'Dock', color: '#59636c', energy: -3, frisk: 0, pattern: [E], stayProb: 1 };
const grip = { name: 'Grip', color: '#3987e5', energy: -2, pattern: [W, E], stayProb: 1 };
const tail = { name: 'Tail', color: '#86b6ef', energy: -1, pattern: [E], stayProb: 1 };
const parcel = { name: 'Parcel', color: '#d95926', energy: 3, pattern: [E], stayProb: 0 };
const shot = { name: 'Shot', color: '#c98500', energy: 3, randomWalk: 0, pattern: [E], stayProb: 0 };
const post = { name: 'Post', color: '#c98500', energy: 8, frisk: 0, pattern: [N], stayProb: 1 };
const key = { name: 'Key', color: '#d55181', energy: 7, randomWalk: 0, pattern: [SW], stayProb: 1 };
// A driver on its own, one particle, that carries whatever adds up to +3 and lets go of all of it at the dock.
const driver = { name: 'Driver', color: '#1aa6b7', energy: -3, pattern: [E], stayProb: 0 };
// A +3 load that never walks at random, so it stays where it's put until something takes it.
const pkg = { name: 'Package', color: '#f2a65a', energy: 3, randomWalk: 0, pattern: [E], stayProb: 0 };
// One of a cargo's crates: three bonded in a row add up to +3, the same as a package.
const crate = { name: 'Crate', color: '#9c6b3c', energy: 1, pattern: [W, E], stayProb: 1 };
// A charge sealed in a wall, to push negatives and pull positives near it without ever bonding.
const charge = { name: 'Garage charge', color: '#2b4a8a', energy: -3, frisk: 0, pattern: [S], stayProb: 1 };

// Classes that processes build from. They're the proteins' own, so that processes and proteins share them in a world.
export const PARTS = { wall, socket, post, driver, package: pkg, crate, tail, charge };

export const PROTEINS = [
  {
    id: 'replicator',
    kind: 'protein',
    name: 'Replicator',
    blurb: 'One rod of four builds copies of itself out of loose parts, and every copy does the same, until the parts run out.',
    math: 'The loose parts have Start_Prob at 0, so no two of them ever bond, and on their own they would drift for ever without building anything. A rod is already a molecule, so they can join it: + parts bond onto a − end and − parts onto a + end, which keeps the rod alternating as it grows from both ends. Divide when full is on, with Largest molecule at 9, so a rod that reaches 9 splits: the one in its middle lets go, leaving two rods of 4. Four is even, so both halves come out as the same rod, + − + −, however much each end grew. Then each of them does it again. Set Seed rods to 0 and nothing ever forms.',
    input: { label: 'Seed rods', min: 0, max: 1, def: 1, describe: (n) => (n > 0 ? 'One rod to start from' : 'No rod, so the parts never come together') },
    world: { width: 64, height: 44, wrap: false },
    preview: { width: 64, height: 44, wrap: false, ticks: 600, speed: 30 },
    speed: 30,
    needsRules: true,
    rules: { divide: true, maxMolecule: 2 * ROD + 1 },
    classes: {
      plus: { name: 'Rod +', color: '#d95926', energy: 3.5, pattern: [E, W], startProb: 0 },
      minus: { name: 'Rod −', color: '#3987e5', energy: -3, pattern: [W, E], startProb: 0 },
    },
    build: replicatorRun,
  },
  {
    id: 'courier',
    kind: 'protein',
    name: 'Courier',
    blurb: 'Picks up a parcel, carries it 30 cells to the dock, bonds it on and wanders off.',
    math: 'The carrier is a −2 grip and a −1 tail. The +3 parcel bonds to the grip, and the three add up to 0, so charge stops steering it and it creeps toward the densest thing around: the dock and its wall. At the dock the parcel is pulled in while the carrier is pushed away, so the parcel lets go and bonds onto a socket with its own side. That leaves the socket to decide whether to let go, and it never does. The empty carrier is −3 again, so the dock pushes it off.',
    world: { width: 64, height: 44, wrap: false },
    preview: { width: 64, height: 44, wrap: false, ticks: 1100, speed: 120 },
    speed: 120,
    classes: { wall, socket, grip, tail, parcel },
    build: courierRun,
  },
  {
    id: 'crew',
    kind: 'protein',
    name: 'Delivery crew',
    blurb: 'Four couriers deliver at once and fill a dock between them.',
    math: 'Each is a Courier. Loaded couriers creep toward the densest thing they can sense, which could just as well be each other, so this dock has a thicker wall to outweigh them. A delivered parcel and its socket add up to 0, so nothing else is drawn to that socket and the next parcel finds an empty one.',
    world: { width: 64, height: 48, wrap: false },
    preview: { width: 64, height: 48, wrap: false, ticks: 1200, speed: 120 },
    speed: 120,
    classes: { wall, socket, grip, tail, parcel },
    build: crewRun,
  },
  {
    id: 'bus',
    kind: 'protein',
    name: 'Bus',
    blurb: 'Pulls into a loading bay, takes on two parcels, carries both at once and drops both at the dock.',
    math: 'The −6 bus holds a +3 parcel above it and one below. In the bay the two parcels push each other apart onto their posts, and the wall behind them means they can only come out toward the bus, so it slots in between them. With one parcel on, the bus still adds up to −3, and the other parcel keeps it in the bay. Once both are on, the three add up to 0 and creep toward the dense dock like a courier. There both parcels are pulled in while the bus is pushed away, so the bus is the one that differs from the rest: it lets go, and both parcels dock.',
    world: { width: 72, height: 44, wrap: false },
    preview: { width: 72, height: 44, wrap: false, ticks: 500, speed: 60 },
    speed: 60,
    classes: { wall, socket, parcel, post, bus: { name: 'Bus', color: '#7b61ff', energy: -6, pattern: [N, S], stayProb: 0 } },
    build: busRun,
  },
  {
    id: 'freighter',
    kind: 'protein',
    name: 'Freighter',
    blurb: 'A driver picks up a cargo of three crates bonded together and docks it in one piece.',
    math: 'The cargo is three +1 crates bonded in a row, +3 in all, and a −3 driver takes its back end, so the four add up to 0 and creep toward the dense dock. There the sockets push the driver and pull the crates, so the driver is the one that differs from the rest and lets go of the whole cargo at once, since it holds it by a single bond. The front crate bonds onto a socket, and cargo and socket add up to 0, so nothing is drawn to it again. If the cargo stops short, the driver can grab it again and push it the rest of the way. It’s the same driver the Garage lets go of.',
    world: { width: 72, height: 44, wrap: false },
    preview: { width: 72, height: 44, wrap: false, ticks: 1200, speed: 120 },
    speed: 120,
    classes: { wall, socket, driver, crate },
    build: freighterRun,
  },
  {
    id: 'retriever',
    kind: 'protein',
    name: 'Retriever',
    blurb: 'Starts at the dock, goes out to the parcels waiting on posts, and brings them back one at a time.',
    math: 'A +8 post holds a +3 parcel near it: they’re 5 apart, which attracts, but the post is already full, so they never bond. The carrier starts at the dock, which pushes it out because both are negative. Within 6 cells of a parcel it gets drawn in, the parcel jumps on, and the pair creeps home. A post pulls the parcel and the carrier the same way, so nothing makes the parcel let go before the dock.',
    world: { width: 56, height: 44, wrap: false },
    preview: { width: 56, height: 44, wrap: false, ticks: 3600, speed: 240 },
    speed: 240,
    classes: { wall, socket, grip, tail, parcel, post },
    build: retrieverRun,
  },
  {
    id: 'slingshot',
    kind: 'protein',
    name: 'Slingshot',
    blurb: 'Fires a shot down its barrel and clean across the map, where it bonds onto the dock.',
    math: 'The breech and the shot are both +3, so the breech pushes the shot down the barrel, and the barrel’s neutral walls only let it go one way. The shot has no random walk, so once it’s out of the breech’s reach it flies dead straight until the dock draws it in.',
    world: { width: 84, height: 40 },
    preview: { width: 84, height: 40, ticks: 200, speed: 40 },
    speed: 40,
    classes: { wall, socket, shot, breech: { name: 'Breech', color: '#d55181', energy: 3, frisk: 0, pattern: [W], stayProb: 1 } },
    build: slingshotRun,
  },
  {
    id: 'lock',
    kind: 'protein',
    name: 'Lock and key',
    blurb: 'Holds Courier B’s parcel so that it can’t be taken, until a slingshot fires a key into its slot. Then Courier B carries the parcel off to its dock.',
    math: 'The −7 Lock holds the +3 parcel by the parcel’s own side, so the pair is the Lock’s to break up, and it never does. The parcel has no side left for Courier B to grab, however close it waits. The +7 key bonds into the slot above the Lock, and three can come apart where two couldn’t: now the one pulled hardest away from the rest leaves, and with Courier B at the door, that’s the parcel. Key and Lock add up to 0, so nothing can bond there again. Set Keys fired to 0 to see the Lock hold. It needs Disagreement at 0.3, so that Courier B’s pull through the walls is enough, and that can’t open the Lock early, because two never come apart unless the Lock lets go.',
    input: { label: 'Keys fired', min: 0, max: 1, def: 1, describe: (n) => (n > 0 ? 'The slingshot fires the key' : 'No key, so the parcel stays locked') },
    world: { width: 84, height: 56, wrap: false },
    preview: { width: 84, height: 56, wrap: false, ticks: 1600, speed: 120 },
    speed: 120,
    needsRules: true,
    rules: { disagreement: 0.3 },
    classes: {
      wall,
      socket,
      parcel,
      lock: { name: 'Lock', color: '#9085e9', energy: -7, frisk: 0, pattern: [N, S], stayProb: 1 },
      key,
      launcher: { name: 'Key launcher', color: '#8a3a5c', energy: 7, frisk: 0, pattern: [E], stayProb: 1 },
      gripB: { name: 'Grip B', color: '#199e70', energy: -3, pattern: [W, E], stayProb: 1 },
      tailB: { name: 'Tail B', color: '#86d6b4', energy: -0.5, pattern: [E], stayProb: 1 },
    },
    build: lockRun,
  },
  {
    id: 'garage',
    kind: 'protein',
    name: 'Garage and decoy',
    blurb: 'One key fits two garages. The garage lets its driver go to fetch a package and deliver it; the decoy takes the key and keeps its driver.',
    math: 'Each garage holds a −3 driver in a pair the garage decides, and a garage never lets go, so the driver stays parked. Two −3 charges sealed in the wall under it push the driver, and the decoy too, while they pull the positive key and garage in. The +7 key fits both slots: it’s 6 from the +1 garage, a free bond, and opposite to the −3 decoy. Once the key is in there are three, and the one that differs most from the rest may leave. In the garage the driver is the only one pushed, so it lets go, goes straight up the way out, takes the package waiting there and creeps with it to the dock. In the decoy the driver and the decoy are both pushed, so the key is the odd one out, and a key never lets go. The key is the Lock’s, and too close to +3 to bond with a package. Set Keys to 0 and both drivers stay parked.',
    input: { label: 'Keys', min: 0, max: 1, def: 1, describe: (n) => (n > 0 ? 'A key for each garage' : 'No keys, so both drivers stay parked') },
    world: { width: 84, height: 56, wrap: false },
    preview: { width: 84, height: 56, wrap: false, ticks: 500, speed: 30 },
    speed: 30,
    classes: {
      wall,
      socket,
      post,
      key,
      driver,
      package: pkg,
      charge,
      garage: { name: 'Garage', color: '#6cbf3c', energy: 1, frisk: 0, pattern: [NE, E], stayProb: 1 },
      decoy: { name: 'Decoy', color: '#c26fd6', energy: -3, frisk: 0, pattern: [NE, E], stayProb: 1 },
    },
    build: garageRun,
  },
  {
    id: 'steam',
    kind: 'protein',
    name: 'Steam cannon',
    blurb: 'A pocket of cold behind the shot builds pressure, which blows it across the map onto the dock.',
    math: 'The back of the barrel holds −500. Energy below the Pressure line builds pressure, which spreads out and pushes everything away from it, and the barrel only lets the shot go one way. With no random walk it flies dead straight. With Pressure push at 0 nothing picks its way, and it’s as likely to go back into the barrel as out.',
    world: { width: 84, height: 40 },
    preview: { width: 84, height: 40, ticks: 200, speed: 40 },
    speed: 40,
    classes: { wall, socket, shot },
    build: steamRun,
  },
];
