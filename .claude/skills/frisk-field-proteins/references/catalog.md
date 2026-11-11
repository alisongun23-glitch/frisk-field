# Catalog: a datasheet for every protein and process

These are the parts you combine. The numbers come from the bench, each shipped protein in its own world:

```bash
node <skill>/scripts/bench.mjs catalog 30
```

**What "done" means:** every load is docked. For the Replicator, it's 29 divisions (30 rods).

**Times** are in ticks, capped at 6,000 (8,000 to 12,000 for the Depot loop). Re-measure after changing anything, and update this page.

**Shared classes** match by name and level when a protein is placed into a world. The same name must always mean the same traits. They live in `src/proteins.js`, and `PARTS` exports the ones processes use (Dock wall, Dock, Post, Driver, Package, Crate, Tail and Garage charge). A process lists the ones it needs one by one: spreading all of `PARTS` into a process gives it unused classes, and changing that list later changes its world.

| Class | Level | Pattern | stay | Other |
|---|---|---|---|---|
| Dock wall | 0 | [N] | 1 | frisk 0 |
| Dock (socket) | −3 | [E] | 1 | frisk 0 |
| Post | +8 | [N] | 1 | frisk 0, always built with its one bond taken by a wall |
| Driver | −3 | [E] | 0 | |
| Package | +3 | [E] | 0 | randomWalk 0 |
| Parcel | +3 | [E] | 0 | randomWalk 0.1 |
| Crate | +1 | [W, E] | 1 | |
| Key | +7 | [SW] | 1 | randomWalk 0 |

## Summary

| Protein | Done | Median | Worst | Rules it needs |
|---|---|---|---|---|
| Replicator | 30/30 | 170 | 200 | `divide: true, maxMolecule: 9` |
| Courier | 30/30 | 310 | 450 | none |
| Delivery crew | 30/30 | 210 | 640 | none |
| Bus | 30/30 | 250 | 380 | none |
| Freighter | 30/30 | 500 | 1,610 | none |
| Retriever | 29/30 | 1,110 | 3,630 | none |
| Slingshot | 30/30 | 70 | 70 | none |
| Lock and key | 30/30 | 350 | 2,270 | `disagreement: 0.3` |
| Garage and decoy | 29/30 | 190 | 280 | none |
| Steam cannon | 30/30 | 70 | 70 | none (uses pressure) |
| **Depot loop** (process, 2 drivers) | 233/240 | 1,470 | 5,670 | none |
| **Relay** (process) | 233/240 | 341 | 1,871 | none |
| **Relay chain** (process) | 236/240 | 575 | 2,050 | none |

## Replicator
- **Does:** one rod of four, + − + −, builds copies of itself from loose parts until they run out.
- **Classes:** Rod + is +3.5, [E, W]. Rod − is −3, [W, E]. Both have Start_Prob 0.
- **Charge by stage:** a rod of 4 adds up to +1 (charged, alive). A rod of 9 divides into two rods of 4.
- **Footprint:** 64×44 with 220 loose parts. Seed rods 0 or 1.
- **Off:** Seed rods 0 means nothing ever bonds.
- **Combine:** it's a source of identical rods. Nothing consumes them yet.

## Courier
- **Does:** picks up a parcel 4 cells ahead, carries it about 30 cells and docks it.
- **Classes:**
  - Grip −2, [W, E], stay 1.
  - Tail −1, [E], stay 1.
  - Parcel +3, [E], stay 0.
  - A dock 9 tall and 5 thick.
- **Charge by stage:** empty −3. Loaded 0, so it creeps. Docked parcel and socket 0.
- **Takes:** a +3 load on the grip's E side. **Gives:** the load, docked; the carrier leaves empty.
- **Footprint:** x −17..23, one row tall.
- **Combine:** the basic mover. Crew and Retriever are made from it.

## Delivery crew
- **Does:** four couriers fill four sockets.
- **Dock:** 17 tall and 4 thick, so it outweighs the couriers, which would otherwise creep toward each other.
- **Lesson:** several neutral movers attract each other, so the destination must outweigh them all.

## Bus
- **Does:** takes two parcels at once in a loading bay and docks both.
- **Classes:** Bus −6, [N, S], stay 0. Parcels +3. Posts and a back wall form the bay.
- **Charge by stage:** with one parcel it's −3, so it stays charged and stays in the bay. With two it's 0, so it creeps. At the dock the bus is the odd one out, so it leaves and both parcels dock.
- **Lesson:** start the vehicle on the dock's side of the bay.

## Freighter
- **Does:** a driver docks a cargo of three bonded crates in one piece.
- **Classes:** Driver −3. Three Crates of +1, bonded in a row.
- **Charge by stage:** cargo +3, loaded 0. At the dock the driver is pushed while the crates are pulled, so it leaves.
- **Docked:** cargo and socket add up to 0.
- **Stopping short:** if the cargo stops short of the dock, the driver can grab it again and push it the rest of the way.

## Retriever
- **Does:** a carrier starts at the dock, goes out to three parcels on posts and brings them back one at a time.
- **How:** the −3 dock pushes the empty carrier out, and the +3 parcels pull it in.
- **Failure:** seed 6 of 30 didn't bring all three back within 6,000 ticks. The cause hasn't been looked into; trace it before relying on the Retriever.
- **Combine:** it's the first reuse loop. The Depot loop is its grown-up version.

## Slingshot
- **Does:** fires a +3 shot dead straight down a walled barrel, across the map and onto the dock.
- **Classes:** a breech of +3, frisk 0, stay 1, bonded to a wall. The shot is +3 with randomWalk 0.
- **Combine:** delivers a single particle along a row, fast. The Lock fires its key this way.

## Lock and key
- **Does:** a −7 Lock holds a parcel so Courier B can't take it. A +7 key fired into the Lock's slot makes it three, and the parcel leaves to Courier B.
- **Needs:** `disagreement: 0.3`.
- **Charge by stage:** key and Lock add up to 0, so nothing bonds there again.
- **Off:** Keys 0 means it stays locked for good (checked over 3,000 ticks).
- **Combine:** a gate. Anything that delivers a +7 into the slot opens it.

## Garage and decoy
- **Does:** one +7 key fits both. The garage (+1) releases its −3 driver, which fetches a package and docks it. The decoy (−3) keeps its driver.
- **Classes:**
  - Garage +1, [NE, E], stay 1.
  - Decoy −3, [NE, E], stay 1.
  - Garage charges −3, sealed in the wall.
  - Package +3, randomWalk 0.
- **Failure:** on seed 17 of 30 the package wasn't delivered within 6,000 ticks. The cause hasn't been looked into yet.
- **Off:** Keys 0 means both drivers stay parked.
- **Combine:** a key-selected release of a driver. Its driver is the same class as the Freighter's and the Depot loop's.

## Steam cannon
- **Does:** −500 of cold behind the shot builds pressure, which blows the shot out onto the dock.
- **Off:** with Pressure push 0, the shot goes back into the barrel as often as out.

## Depot loop (process)
- **Does:** drivers shuttle between a depot and a dock until all five loads are delivered: four packages and a cargo of three crates. The same drivers make every trip.
- **Classes:** Dock wall, Dock, Post, Driver, Package and Crate, all shared with the proteins. Placed after the Garage and the Freighter, it brings no classes of its own.
- **Layout:** 60×36, no wrap.
  - **Depot** at x −14, one load per row at rows −12, −6, 0, 6 and 12.
  - **Package rows:** a post at x −14, filled by a wall behind it. The package sits at x −13, in a pocket with walls above and below at x −14..−13.
  - **Cargo row (0):** the post behind, crates at x −13..−11, and a berth with walls along both sides of the back two crates (x −13..−12).
  - **Drivers** start at x 6: at row 0 for 1 driver, rows ±3 for 2, rows 0 and ±6 for 3.
  - **Dock:** 21 tall and 8 thick, at x 10..18, with 11 empty columns behind it.
- **Charge by stage:**
  - The driver alone is −3.
  - Loaded, it adds up to 0 with a package (+3) or the cargo (3 × +1).
  - A docked load and its socket add up to 0.
  - Empty again, it's pushed off the dock's free sockets and pulled back by the waiting packages (pull 1) and posts (0.375).
- **Measured** (`tests/processes.test.js` asserts the 2-driver and 1-driver cases on fewer seeds):

  | Drivers | Done | Median | Worst | Reuse |
  |---|---|---|---|---|
  | 2 | 233/240 (8,000-tick cap) | 1,470 | 5,670 | Both drivers delivered at least twice in about 70% of runs |
  | 1 | 55/60 (12,000-tick cap) | 2,563 | 7,931 | One driver delivers all five |
  | 3 | 60/60 (8,000-tick cap) | 1,246 | 3,899 | |
  | 0 | Nothing delivered in 30 runs of 8,000 ticks | | | |

  With 2 drivers, every delivery in 240 runs was made by a driver: no load reached the dock on its own.
- **Known failures,** about 3% with 2 drivers:
  1. **A package released right in front of a free socket never bonds:** bonds only form on arrival, and with randomWalk 0 it never moves again. This happens when a driver grabbed it from the west, so the package led.
  2. **A cargo pushed from behind gets stuck:** it's blocked by a docked package in its row, and its driver doesn't let go.
  3. **A loose cargo strands behind the depot,** where a driver takes it from behind and the depot blocks its way east.
- **Why the holds matter:** any random walk on the packages, even 0.01, lets them leave their posts on their own and drift to the dock. An unwalled cargo wanders and pushes packages out of their pockets.
- **Combine:** a Garage could release the drivers, a Lock could gate the depot, a Replicator could make the loads.

## Relay (process)
- **Does:** a messenger carries a payload into a gate, and that lets driver B go. B picks up a package and takes it to dock B. One delivery sets off the next.
- **Classes:**
  - **New:** Messenger −2, pattern [W], stay 1. Payload +3, [E], stay 0. Gate +8, frisk 0, randomWalk 0, [NE, N], stay 1. Driver B −3, [N], stay 0.
  - **Shared:** Tail, Garage charge, Post, Package, Dock and Dock wall.
- **Layout,** around the gate at (0, 0), in an 80×40 world with no wrap:
  - **The gate and B:** B is parked under the gate at (0, 1), in a pair the gate decides. Sealed charges at (−1, −1) and (−1, 0) are bonded to each other.
  - **The wedge:** walls at (0, −1), (1, 0), (−1, 1), (0, 2), (1, 2), (2, 0) and (2, −1). The slot is at (1, −1).
  - **The roof and backstop:** a roof along row −2 from x −8 to 0 ends at the hole (1, −2). The backstop column at x 2 runs from row −12 to −2, with a sealed "lure" charge at (2, −3) bonded to the wall above it.
  - **The courier:** the messenger at (−14, −3), its tail behind and the payload in front.
  - **B's side:** the package at (6, 2) on a post at (5, 2). Dock B is at x 16, 21 tall and 8 thick, centered on row 2.
- **Charge by stage:**
  - Courier A loaded: 0, so it creeps. Empty: −3, but both parts are full, so it bonds nothing.
  - The gate with B: +5. With the payload in: +8, three members, and B is the odd one out.
  - After B leaves, the gate and payload: +11, still visible. B's north-facing side and the wall above its exit stop it steering back.
  - B with the package: 0. Docked: 0.
- **Measured** over 240 runs, with a 5,000-tick cap:

  | Payload | Result | Median | Worst |
  |---|---|---|---|
  | 1 | 233/240 whole chain | 341 | 1,871 |
  | 0 | 80/80 gate stayed shut, nothing delivered | | |

  The app's layout matches the bench seed for seed.
- **Known failure,** about 3%: the payload is let go 2 to 4 cells early over the roof. It's pulled into the roof by the gate's charges below, gets drawn back by the empty carrier, and wanders off. It ends under the roof or at dock B, and the gate never opens.
- **How it was found:** 10 rounds of the method, each fixing one named failure:
  1. re-grab;
  2. theft;
  3. the empty messenger entering the slot;
  4. the gate's field trapping B;
  5. early drop;
  6. the package being dislodged;
  7. the courier escaping over the backstop;
  8. the slot's side entrance;
  9. B pinned by steering;
  10. the early-drop lure.

  See `failures.md`.
- **Combine:** the gate is a general "delivery starts the next job" switch. Anything that brings a +3 into the slot opens it, and nothing negative can. The Relay chain puts two in a row.

## Relay chain (process)
- **Does:** the Relay twice. The payload opens gate 1, which lets driver B go. B docks onto a hook holding a key package, carries it along gate 2's roof and drops it into gate 2. That lets driver C go, and C takes its package to dock C.
- **Classes:**
  - **New:** Key package +3, [W], randomWalk 0, stay 0, Start_Prob 0. Hook +0.25, [W, E], randomWalk 0, stay 1, Start_Prob 0. Driver C −3, [N], stay 0, the same traits as Driver B.
  - **From the Relay:** Messenger, Payload, Gate and Driver B.
  - **Shared:** Tail, Garage charge, Post, Package, Dock and Dock wall.
- **Layout,** around gate 1 at (0, 0), with everything placed 14 cells west so that dock C has 10 empty columns behind it, in an 80×40 world with no wrap:
  - **Gate 1 and Courier A:** exactly as in the Relay.
  - **The hook:** at (5, 2) with the key in front of it at (6, 2), a post under the key filled by a wall, and a wall under the hook. B comes out of gate 1 and docks on the hook's W side.
  - **The route:** row 2, over gate 2's roof along row 3 from x 7 to 17, with a short ceiling over x 13 to 15 on row 1.
  - **Gate 2:** the Gate standing upright at (18, 5), a wall on its NE side, its slot at (18, 4) under the hole at (18, 3). The key stops at (18, 2) against a sealed −3 lure in the backstop at x 19. Its charges are at (17, 5) and (17, 6). C is parked at (19, 6), SE of the gate under a wall, and leaves NE.
  - **C's side:** the package at (25, 7) on a post at (24, 7). Dock C is at x 35, 21 tall and 8 thick, centered on row 7.
- **Charge by stage,** with deviations from a static scan (tricks.md, 32):
  - B, the hook and the key add up to +0.25, so they creep.
  - On the way the key's deviation is 0 to x 15 and at most 0.69 at x 17. At the backstop it's 1.15 against B's 1.04, so the key lets go there.
  - The free key is 3 cells above gate 2 and steers straight down. In gate 2, C differs most, 1.3 against 0.96, and leaves.
  - B and the hook are left at −2.75, B full, and the hook unable to take the key back.
- **Measured** over 240 runs with an 8,000-tick cap:

  | Payload | Result | Median | Worst |
  |---|---|---|---|
  | 1 | 236/240 whole chain | 575 | 2,050 |
  | 0 | 60/60 neither gate opened, nothing delivered | | |

  In all 236 the key let go right over the hole, and B was still on its hook when C left gate 2. B and the hook later came apart in 21 of the 236, between 24 and 396 ticks after the drop, so by the time the package docked B was on its hook in 215. A first count said all 236, because it read two particles with no molecule as together. 500 ticks later every package was still docked and every key still in gate 2. The app's layout matches the bench seed for seed.
- **Known failures:**
  1. 3 of 240 are the Relay's own early payload drop at gate 1.
  2. 1 of 240: the empty B and hook took a dock socket and dragged it off, and C's loaded pair went around the dock.
- **How it was found:** a race got to 42 of 60 with B carrying the key as a pair. The hook and a static scan of every cell along the route found the layout. Then the race and failure traces fixed, in order:
  1. the hook's sign;
  2. who lets go;
  3. steering into an upright gate;
  4. the gate sliding;
  5. room behind the dock;
  6. C's exit.

  See `failures.md`.
- **Combine:** the hook is a way to make any single driver into a carrier that drops a load at an exact spot and then stays out of the way.
