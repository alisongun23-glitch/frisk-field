# Failures: symptom, cause, fix

Every failure met so far while building the proteins, grouped by what you'd see. Find the symptom, confirm the cause with a probe (a trace, a state dump, or the density-direction check below), then apply the fix. If none fits, write the new one down here once you've found its cause.

**The probe that finds most of these.** For any stuck neutral molecule, print three things:

1. `sim.density.towardMore(world, first.x, first.y)`, the side it wants to go;
2. whether shifting every member one step that way is free;
3. its `net`.

A neutral molecule whose one step is blocked waits forever. One whose side points away from the dock is following the wrong mass.

## Triggers, gates and hand-offs (from the Relay)

| Symptom | Cause | Fix |
|---|---|---|
| The carrier lets go of its load, and takes it back a tick later, over and over. | The free load's nearest bondable thing is its own carrier, right next to it, and it pulls hardest. A dock's many sockets would push the carrier away, but a few charges don't. | Make the empty carrier full: every part holds one bond, used by its partner (Messenger [W] with a Tail). Or give one of the two Start_Prob 0, if both are free particles. |
| The empty carrier steals the next driver's package. | It's free and charged, and nothing stops it bonding. | The same: a carrier that's full when empty can't take anything. |
| The empty carrier gets into the gate's slot before the payload. | A free particle within 3 cells of something it can bond with steers straight to it, whatever pulls it. The gate is a molecule, so Start_Prob doesn't stop this. | Make the carrier a full molecule. Molecules never steer, and its shape can't fit the slot. |
| The released driver sits next to the gate for hundreds of ticks. | The gate has a free bond again, and the driver's own side wants it, so it steers toward a cell next to the gate that a charge or wall fills, and pushes into it forever. | Point the driver's bonding side at a wall along its way out (Driver B has [N], under a wall row). Parked, it's already at its docking cell, so it doesn't steer. |
| After the trigger, B and its package keep getting pulled back to the gate. | The gate and payload stay charged (+11), and the payload pulls B at full strength. | Get B out fast, and keep the package more than 6.5 cells from the gate, its charges and parked B. |
| The payload is let go early and gets stuck against the gate's walls. | The contrast reaches 1 several cells before the drop point, and the gate's charges pull the free payload into the wrong side. | A roof that hides the gate from the route, ending at a hole over the slot. A sealed charge at the drop point that draws an early payload along to it. |
| Things get into the slot from the side: a stray package, or the empty carrier. | Another open cell next to the slot. | Wall it off, so the only way in is the hole above. |
| The empty carrier gets over the backstop and comes down near the next driver's package. | Random walk, and it's charged. | Make the backstop taller (to row −12). A "parking" charge doesn't help: it repels the payload and causes early drops. |
| A ceiling over the courier's route makes things worse. | Walls take up the 12 sensed cells, so the payload can't sense the gate at the drop point. Once let go, it flies back down the channel. | Use only a roof, never a closed channel. |
| A launch tube for B makes things worse. | B is blind inside it, and random moves reverse it. | Clear the exit instead (above). |

## Carrying a load into a second gate (from the Relay chain)

| Symptom | Cause | Fix |
|---|---|---|
| The driver never takes the hook (59 of 60 runs). | The hook was −0.25, the driver's own sign and closer than 5, so the bond costs energy and is refused. A level of exactly 0 is refused the same way. | Give the hook the driver's opposite sign: +0.25 (tricks.md, 29). |
| A driver carrying a single load lets go 4 to 6 cells early. | In a pair, the two pulls are compared directly, so a load pulled one way and a driver pushed the other differ by twice as much. | Carry it on a hook (29), so there are three, and run a static scan (32). |
| The driver falls off the loaded trio instead of the load letting go. | With a near-0 hook, of the driver and the load, the one with the stronger pull leaves. The gate's charges under the roof push the driver at the back harder than anything pulls the key at the front. | Keep the charges away from where the driver stops: low, beside the gate's driver. Check with a static scan who leaves at each cell. |
| The key lets go 3 to 4 cells before the hole, every time. | The gate's charges are felt through the roof from 2.8 cells. Pulls don't depend on chance, so it happens on every seed. | A short ceiling over the cells before the drop point (31), and the charges low. |
| The key lets go over the hole, then sits there pushing against the lure. | The free key only steers to the gate if it's within 3 cells. The diagonal gate is 3.16 away. Or a ceiling over the drop point pushes the gate out of the key's 12 nearest cells. | An upright gate, 3 cells below (30), and no ceiling at the drop point. |
| A waiting hook and key drift off, and once reached the drop point by themselves. | Random walk on any member moves a charged molecule. With walls under it, its way back is diagonal and blocked, so every step away is kept. | randomWalk 0 on every member of a waiting molecule. |
| The upright gate turns up two cells higher, with its driver in the slot. | The gate and its driver are a charged pair, and one frisk-0 member only halves how often it moves. With the driver straight under the gate, nothing blocks a shift up into the empty slot. | Park the driver diagonally, under a wall, and check all 8 shifts are blocked. |
| The released driver sits in its exit for hundreds of ticks. | Walls fill its 12 nearest cells, so it doesn't feel the charges that should push it out, only the gate and its new load, which pull it back into a wall. | Open the side its pull points to as it's let go (here NE), and remove walls the lock doesn't need, so it feels the charges again. |
| The driver's loaded pair stops 7 cells short of the dock (half the runs). | The dock was 8 columns from the world's edge. | Move everything so the dock has 10 empty columns behind it. That took the chain from 33 of 60 to 30 of 30. |
| The driver pulls its package off the post, and the two never dock. | It came at the package diagonally from 2 rows up, and pulled the package toward itself before reaching its far side. | Bring the driver along the row right above the package, the way the Relay's B comes. |
| The empty driver and hook take a dock socket and drag it away (1 in 240). | The hook still has a free side, and a −3 socket is its opposite. | Not fixed. A hook with nothing but full or same-sign neighbours on its way out would stop it. |

## Carriers that never pick up

| Symptom | Cause | Fix |
|---|---|---|
| The carrier wanders and never finds the load. | The load is more than 6 cells off, so nothing pulls the carrier there. Beyond that range it moves on inertia and random walk. | Put the load straight ahead of the carrier's way out, within 6 cells, or make the world smaller. |
| The carrier comes close but doesn't grab it. | Walls around the load use up the 12 cells a particle senses. Or the load has no open side facing the carrier. | Fewer walls between them. Open the pocket toward where the carrier comes from. Check `nextSide` for both. |
| Two loads, or a load and a post, bond with each other instead. | Same sign, 5 or more apart, so they bond for free. Or the post had a free side. | Change one level so the gap is under 5. Fill the post's one bond with a wall when building it. |
| A key grabs the parcel (+8 key, +3 parcel). | A gap of exactly 5 bonds for free. | Use +7: a gap of 4 is refused, and only pushes. |
| Couriers form behind the posts and pull loads out the wrong way. | A driver reached the load from the back, and the loaded pair then faces away from the dock. | Use pockets, open only on the dock's side. |

## Loads that let go too early or not at all

| Symptom | Cause | Fix |
|---|---|---|
| The load drops off on the way. | Something on the route pulls it harder than it pulls the carrier, like another dock or a stray negative. | Insulate the route, keeping other parts more than 7 cells away. Or make the carrier's parts more like the load, so nothing tells them apart. |
| The load never lets go at the dock. | Its deviation stays under Disagreement (1): the sockets pull it too weakly, or the carrier's parts are pulled too. | Raise the socket level to match the load (−3 for +3). Make the carrier's parts the same sign as the sockets. As a last resort, lower Disagreement in the protein's rules. |
| The wrong member leaves, so the carrier falls apart. | That member differs most, and its stay is below 1. | Give every carrier part stay 1. Only the load has stay 0. |
| A pair that should split never does. | Only the guest can leave a pair, and the guest has stay 1. Or it's the host that disagrees. | Swap who hosts (the order in `bonds`, or which side lands on which). Or add a third member (Three come apart). |
| The garage driver stays put although the key is in (deviation 0.98). | Just under Disagreement 1. | Add a second sealed charge, so the push on the driver is stronger. |

## Neutral movers that get stuck

| Symptom | Cause | Fix |
|---|---|---|
| A loaded courier parks next to a post or a wall forever. | Its one step toward the dock is blocked, and neutral molecules never step around. | Clear every step that has a component toward the dock. Put posts behind loads, and start vehicles on the dock's side of their bay. |
| A loaded cargo stops by its pocket. | A diagonal step is blocked by pocket walls. | No pockets for cargos. Put the post diagonally behind, on the side away from the depot's middle. |
| Loaded couriers drift to each other, or to the depot, instead of the dock. | The dock isn't the heaviest mass in the 32-cell blur. | Make the dock wall thicker, the dock taller, or move the depot farther off. |
| Docked pairs drift off the dock, leaving gaps between sockets. Arrivals near the dock turn back. | The dock is against the world's edge. Past the edge counts as empty, so the gradient points back toward the middle. | Leave about 10 empty cells behind the dock. |
| The bus jams against a post one row off. | It started in the bay and had to go around the post. | Start it on the dock's side of the bay, in line with the slots. |
| A molecule with a post in it never moves. | Its average frisk is below 1, so it only moves with that chance. Posts are frisk 0. | Never bond a mover to a frisk-0 part. That's a holder. |

## Things that wander off

| Symptom | Cause | Fix |
|---|---|---|
| With no carriers at all, loads still reach the dock (the Depot loop's first design: 119 of 120). | A free particle that nothing pulls keeps going on its last heading, at 0.25. A +8 post holds a +3 load at 0.5 × (1 − d/7), and that falls below 0.25 at about 3.5 cells. So a load that strays 4 cells from its post leaves in a straight line, and the dock pulls it in once it's within 6. | Loads that wait must have randomWalk 0. Even 0.01 leaked 666 of 960. Always run the no-carrier case and check that nothing is delivered. |
| A waiting cargo (a charged molecule) wanders off and pushes packages out of their pockets. | Charged molecules move toward their heading, and random walk takes them past a post that sits diagonally or behind. Its +1 crates push +3 packages. | A berth: the post behind it, and walls along both sides of its back two crates. Molecules have no inertia, so it always comes back toward its post. |
| A waiting package drifts away from its spot. | randomWalk 0.1, with nothing holding it. | A holder post, plus randomWalk 0, or 0.1 inside a pocket. |
| A package sits right in front of a **free** socket and never bonds (about 2% of Depot loop runs). | Bonds form only on arrival. It was let go while it was already next to the socket, because a carrier took it from the west and it led the way in. With randomWalk 0 it never moves, so it never arrives. | Make sure a carrier can only take a load on the load's own side, so the load hosts and the carrier leads into the dock. That's what pockets are for. A little random walk would unstick it, but it lets waiting loads leave (above). |
| A package is pinned against a socket that's already taken. | With randomWalk 0, nothing ever moves it off. | Give the dock more sockets than loads, or randomWalk 0.1 where loads don't have to wait. |
| Keys float away, or get drawn into the dock. | A key more than 6 cells from its slot has nothing pulling it. A −3 dock pulls a +7 key at 0.43. | Start keys straight above their slot, within 4 cells, with randomWalk 0. Keep docks more than 7 cells from keys. |
| A key misses its slot. | It came in at an angle: steering only takes over within 3 cells. | Put it on the slot's own line, straight above. |

## The Replicator and other self-assembly

| Symptom | Cause | Fix |
|---|---|---|
| Loose + and − parts pair up into dead pairs. | Two free opposite parts always bond. A +3.5 and −3 pair adds up to 0.5, which is neutral, so it's dead. | Start_Prob 0 for loose parts, so they only join an existing molecule. |
| Rods bridge into big tangles and stop growing. | Nothing tells a finished copy to let go. | Divide when full, with the Largest molecule at twice the rod plus 1. |
| A rod of 2 never grows. | It adds up to 0.5, inside the Neutral range. | Seed with a rod of 4. |

## Testing and measuring

| Symptom | Cause | Fix |
|---|---|---|
| A fix "works" on one seed and fails on the next. | Stochastic physics. | Race variants over the same seeds (`race.mjs`), and confirm on 30 to 60 seeds. |
| Fingerprints differ for worlds you didn't touch. | The baseline was made with different settings, or the change leaks into shared code. | Make a new baseline from an untouched copy of the code, and compare again. Gate new rules so that their default does exactly what the old code did. |
| A count says two parts are still together after they came apart. | `a.mol === b.mol` is also true when both are alone, since both are `null`. | Check `a.mol !== null && a.mol === b.mol`, as `together` in `bench.mjs` does. This overstated how long B stays on its hook in the Relay chain, as all 236 runs instead of 215. |
| A test that counts docked loads passes too early. | It counted a load bonded to a carrier as docked. | Count only loads whose molecule has a `Dock` member. For a cargo, count it once. |
| Screenshots of the browser pane look stale. | A hidden pane doesn't repaint. | Show the pane first, or check through the hover readout and `read_page`. |
