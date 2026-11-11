// Processes: proteins put together into something that keeps going on its own. They're laid out and placed just like
// compounds, and they use the proteins' own classes, so a world with both shares them.

import { PARTS, dockAt } from './proteins.js';

// The depot: a column of loads, each waiting against a +8 post that's already full, so it holds the load near it without
// ever bonding it. A package waits in a pocket, walls above and below it, so it can only be picked up and carried off on
// the dock's side. The cargo of three crates waits in a berth, walls along both sides of its back two, so it can only
// leave toward the dock, and can't wander off and push the packages out of their pockets.
const DEPOT_X = -14;
const LOADS = [[-12, 'package'], [-6, 'package'], [0, 'cargo'], [6, 'package'], [12, 'package']];

function depotAt(parts, bonds, x) {
  for (const [y, kind] of LOADS) {
    const p = parts.length;
    parts.push({ c: 'post', x, y }, { c: 'wall', x: x - 1, y });
    bonds.push([p, p + 1]);
    if (kind === 'cargo') {
      const c = parts.length;
      for (let k = 1; k <= 3; k++) parts.push({ c: 'crate', x: x + k, y });
      bonds.push([c, c + 1], [c + 1, c + 2]);
      for (let k = 1; k <= 2; k++) parts.push({ c: 'wall', x: x + k, y: y - 1 }, { c: 'wall', x: x + k, y: y + 1 });
    } else {
      parts.push({ c: 'package', x: x + 1, y });
      for (let k = 0; k <= 1; k++) parts.push({ c: 'wall', x: x + k, y: y - 1 }, { c: 'wall', x: x + k, y: y + 1 });
    }
  }
}

// Where the drivers start, by how many there are: between the depot and the dock, facing the depot.
const DRIVERS = [[], [[6, 0]], [[6, -3], [6, 3]], [[6, -6], [6, 0], [6, 6]]];

function depotRun(drivers = 2) {
  const parts = [];
  const bonds = [];
  depotAt(parts, bonds, DEPOT_X);
  for (const [x, y] of DRIVERS[drivers]) parts.push({ c: 'driver', x, y });
  // A tall dock with a thick wall, so that from anywhere in the depot it's the heaviest thing around, and with room
  // behind it: past a solid edge counts as empty, which would turn a loaded driver back near the dock.
  dockAt(parts, 10, 21, 8);
  return { parts, bonds };
}

const N = 1;
const NE = 2;
const E = 3;
const W = 7;

// The relay's own classes. The messenger and the tail each hold one bond, and it's to each other, so once the payload is
// off neither has room for another: the empty carrier can't take the payload back, get into the gate or take B's package.
const messenger = { name: 'Messenger', color: '#5b6ee1', energy: -2, pattern: [W], stayProb: 1 };
const payload = { name: 'Payload', color: '#e03e6b', energy: 3, pattern: [E], stayProb: 0 };
// The gate's second side faces the wall above it, so once B has gone nothing can dock there again.
const gate = { name: 'Gate', color: '#e0c341', energy: 8, frisk: 0, randomWalk: 0, pattern: [NE, N], stayProb: 1 };
// B's bonding side faces up. Parked under the gate it's already where it would dock, and on its way out there's wall
// right above it, so it never steers back to the gate.
const driverB = { name: 'Driver B', color: '#2bb39a', energy: -3, pattern: [N], stayProb: 0 };

// The relay's gate at (gx, gy), its slot up and to the right at (gx+1, gy-1).
// - The driver is parked under the gate, which is the guest of their bond, so the pair is the gate's to break and it
//   never does. Two charges are sealed beside the gate, and walls wedge the pair in.
// - A roof along row gy-2 hides the gate from the route above it, and ends at the hole right over the slot. The
//   backstop at x gx+2 stops a courier there. Its charge at (gx+2, gy-3) draws a payload let go over the roof along to
//   the hole, and pushes the empty carrier away. The wall east of the slot means nothing gets in but through the hole.
// `at` places a part and returns its index.
function gateAt(at, bonds, gx, gy, driver) {
  bonds.push([at(driver, gx, gy + 1), at('gate', gx, gy)]);
  bonds.push([at('charge', gx - 1, gy - 1), at('charge', gx - 1, gy)]);
  for (const [x, y] of [[0, -1], [1, 0], [-1, 1], [0, 2], [1, 2], [2, 0]]) at('wall', gx + x, gy + y);
  for (let y = gy - 12; y <= gy - 2; y++) if (y !== gy - 3 && y !== gy - 4) at('wall', gx + 2, y);
  for (let x = gx - 8; x <= gx; x++) at('wall', x, gy - 2);
  at('wall', gx + 2, gy - 1);
  bonds.push([at('charge', gx + 2, gy - 3), at('wall', gx + 2, gy - 4)]);
}

// Courier A, the messenger with its tail behind and the payload in front, on the route over the gate at (0, 0).
function messengerAt(at, bonds, payloads) {
  const m = at('messenger', -14, -3);
  bonds.push([m, at('tail', -15, -3)]);
  if (payloads > 0) bonds.push([m, at('payload', -13, -3)]);
}

// The relay, around the gate at (0, 0). B's package waits on a post a little way off, and dock B is beyond it.
// Parts go down in the order the bench measured them in, so the numbers on the card are this layout's own.
function relayRun(payloads = 1) {
  const parts = [];
  const bonds = [];
  const at = (c, x, y) => parts.push({ c, x, y }) - 1;
  gateAt(at, bonds, 0, 0, 'driverB');
  messengerAt(at, bonds, payloads);
  bonds.push([at('post', 5, 2), at('wall', 4, 2)]);
  at('package', 6, 2);
  dockAt(parts, 16, 21, 8, 2);
  return { parts, bonds };
}

// The Relay chain's own classes. The key package waits on the hook, and B docks onto the hook's other side. The hook is a
// little positive, so B, at -3, bonds to it for free, and the three add up to about 0. The hook and the key are the same
// sign and closer than 5, so once the key is off, the hook can never take it back.
const keyPackage = { name: 'Key package', color: '#ff8a3d', energy: 3, randomWalk: 0, pattern: [W], stayProb: 0, startProb: 0 };
const hook = { name: 'Hook', color: '#b0a089', energy: 0.25, randomWalk: 0, pattern: [W, E], stayProb: 1, startProb: 0 };
const driverC = { name: 'Driver C', color: '#3fbf6f', energy: -3, pattern: [N], stayProb: 0 };

// The chain's second gate, at (gx, gy): the same Gate standing upright. A wall on its NE side makes its next open side N,
// so the slot is right above it, under the hole in the roof at (gx, gy-2), and the key stops over the hole 3 cells from
// the gate: close enough that, once it's let go, it steers straight down into the slot. Its driver is parked beside it,
// to the SE and under a wall, so the two can't slide up into the empty slot. It leaves to the NE, under another wall so it
// never turns back. The two sealed charges beside the gate sit low, away from the route over the roof.
function uprightGateAt(at, bonds, gx, gy, driver) {
  bonds.push([at(driver, gx + 1, gy + 1), at('gate', gx, gy)]);
  bonds.push([at('charge', gx - 1, gy), at('charge', gx - 1, gy + 1)]);
  at('wall', gx - 1, gy - 1);
  for (const [x, y] of [[1, -1], [1, 0], [0, 1], [2, -1], [0, 2], [1, 2], [2, 2]]) at('wall', gx + x, gy + y);
  for (let y = gy - 12; y <= gy - 2; y++) if (y !== gy - 3 && y !== gy - 4) at('wall', gx + 1, y);
  bonds.push([at('charge', gx + 1, gy - 3), at('wall', gx + 1, gy - 4)]);
  for (let x = gx - 11; x <= gx - 1; x++) at('wall', x, gy - 2);
}

// The Relay chain: gate 1 and Courier A as in the Relay, then the hook and its key package where B comes out, gate 2
// further along with its roof under the route, and C's package and dock C beyond. A short ceiling over the three cells
// before gate 2's backstop keeps the loaded trio from feeling gate 2's charges on the way. Everything is 14 cells west of
// gate 1 at the middle, so dock C has 10 empty columns behind it.
function chainRun(payloads = 1) {
  const parts = [];
  const bonds = [];
  const at = (c, x, y) => parts.push({ c, x: x - 14, y }) - 1;
  gateAt(at, bonds, 0, 0, 'driverB');
  messengerAt(at, bonds, payloads);
  for (let x = 13; x <= 15; x++) at('wall', x, 1);
  bonds.push([at('post', 6, 3), at('wall', 6, 4)]);
  at('wall', 5, 3);
  bonds.push([at('hook', 5, 2), at('key', 6, 2)]);
  uprightGateAt(at, bonds, 18, 5, 'driverC');
  bonds.push([at('post', 24, 7), at('wall', 23, 7)]);
  at('package', 25, 7);
  dockAt(parts, 35 - 14, 21, 8, 7);
  return { parts, bonds };
}

export const PROCESSES = [
  {
    id: 'depot',
    kind: 'process',
    name: 'Depot loop',
    blurb: 'Drivers shuttle between a depot and a dock until every load is delivered: four packages and a cargo of three crates. After each drop a driver goes back to the depot for the next one.',
    math: 'Every trip is made by the same few −3 drivers. Loaded, a driver adds up to 0 with what it carries, a +3 package or the cargo of three +1 crates, so charge stops steering it and it creeps toward the heaviest thing around: the dock with its thick wall. At the dock the sockets pull the load and push the driver, so the driver is the one that differs from the rest. It lets go, and the load bonds onto a −3 socket. A docked load and its socket add up to 0, so nothing is drawn to that socket again. Empty, the driver is −3 again: the free sockets push it off the dock, and the packages and +8 posts still waiting pull it back to the depot, where it takes the next load. Each package waits against its post in a pocket that opens toward the dock, so it can only be picked up, and carried off, on that side. The cargo waits in a berth, walls along its sides. Packages never walk at random and the berth keeps the cargo in place, so set Drivers to 0 and nothing is delivered.',
    input: {
      label: 'Drivers',
      min: 0,
      max: 3,
      def: 2,
      describe: (n) => (n === 0 ? 'No drivers, so nothing leaves the depot' : n === 1 ? 'One driver makes every trip' : `${n} drivers share the trips`),
    },
    world: { width: 60, height: 36, wrap: false },
    preview: { width: 60, height: 36, wrap: false, ticks: 3000, speed: 240 },
    speed: 240,
    classes: { wall: PARTS.wall, socket: PARTS.socket, post: PARTS.post, driver: PARTS.driver, package: PARTS.package, crate: PARTS.crate },
    build: depotRun,
  },
  {
    id: 'relay',
    kind: 'process',
    name: 'Relay',
    blurb: 'A messenger carries a payload into a gate, and that sets a second driver loose: driver B picks up a package and drops it at the dock.',
    math: 'The messenger is a −2 carrier with a −1 tail, and with the +3 payload on they add up to 0, so charge stops steering them and they creep along the top of a roof toward the heavy dock. A backstop stops them right over the gate’s slot, where a sealed −3 charge pulls the payload in and pushes the carrier away, so the payload lets go and drops through a hole into the slot. The messenger and its tail each hold just one bond, to each other, so once the payload is off the empty carrier can’t take anything again. The +8 gate holds driver B in a pair the gate decides, and a gate never lets go. The payload is 5 below the gate, so they bond for free, and that makes three, where any one of them may leave. Two charges sealed beside the gate push B while they pull the gate and the payload, so B is the one that differs most, and it leaves. It takes the package waiting nearby, the two add up to 0 and creep to the dock, and there they part and the package docks. B’s bonding side faces up, with wall right above its way out, so it never turns back to the gate. Set Payload to 0 and B stays parked.',
    input: {
      label: 'Payload',
      min: 0,
      max: 1,
      def: 1,
      describe: (n) => (n > 0 ? 'The messenger brings the payload' : 'No payload, so the gate stays shut'),
    },
    world: { width: 80, height: 40, wrap: false },
    preview: { width: 80, height: 40, wrap: false, ticks: 1200, speed: 120 },
    speed: 60,
    classes: {
      wall: PARTS.wall, socket: PARTS.socket, messenger, tail: PARTS.tail, payload, driverB, package: PARTS.package, post: PARTS.post, charge: PARTS.charge, gate,
    },
    build: relayRun,
  },
  {
    id: 'chain',
    kind: 'process',
    name: 'Relay chain',
    blurb: 'Two relays in a row. A payload let into gate 1 sets driver B loose. B hooks onto a key package and drops it into gate 2, and that sets driver C loose to take its own package to the dock.',
    math: 'Gate 1 is the Relay’s: the messenger, its tail and the +3 payload add up to 0, creep along a roof and drop the payload through a hole into the gate, and that lets driver B go. B docks onto a hook, a +0.25 that’s already holding the +3 key package. B is −3, so the three add up to +0.25, close enough to 0 that charge stops steering them, and they creep along the top of gate 2’s roof with the key in front. A short ceiling over the last cells before the backstop hides gate 2’s charges from them, so nothing lets go early. At the backstop a sealed −3 charge pulls the key and pushes B while the hook feels hardly anything, so the key is the one that differs, and it lets go right over the hole. Gate 2 is the same +8 Gate standing upright, a wall on its NE side so that its open side faces up, 3 cells below the key: close enough that the key steers straight down into its slot. That makes three, and C, pushed by the two charges beside it, leaves, takes its package to the dock and docks it. C is parked to the side of the gate, not under it, so the pair can’t slide up into the empty slot. B is still on the hook when C leaves: on it, B has no room for another bond, and the hook can’t bond the key again, since they’re the same sign and too close, so the empty pair can’t take the key back or get into gate 2. Later, B sometimes lets go of the hook. Set Payload to 0 and nothing moves.',
    input: {
      label: 'Payload',
      min: 0,
      max: 1,
      def: 1,
      describe: (n) => (n > 0 ? 'The messenger brings the payload' : 'No payload, so neither gate opens'),
    },
    world: { width: 80, height: 40, wrap: false },
    preview: { width: 80, height: 40, wrap: false, ticks: 1800, speed: 120 },
    speed: 60,
    classes: {
      wall: PARTS.wall, socket: PARTS.socket, messenger, tail: PARTS.tail, payload, driverB, key: keyPackage, hook, post: PARTS.post, charge: PARTS.charge, gate, driverC, package: PARTS.package,
    },
    build: chainRun,
  },
];
