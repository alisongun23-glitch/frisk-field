# Mechanisms that are known to work

Each of these is a mechanism that has worked in a shipped protein, with the numbers that made it work and where to see it. Combine them before inventing anything new. Levels are Energy_levels, sides are as in `physics.md`, and "stay" is `stayProb`.

## Contents

- Moving: 1 Neutral courier · 2 Charged mover · 3 Slingshot · 4 Steam
- Holding: 5 Guest decides · 6 Holder post · 7 Pocket · 7b Berth · 8 Wedge
- Releasing: 9 Release by contrast · 10 Load hosts the socket · 11 Docked adds up to 0 · 12 Three come apart · 13 Sealed charges · 14 Lowered Disagreement
- Selecting: 15 Orthogonal levels · 16 Start_Prob 0 · 17 Divide when full
- Layout: 18 Dock as the heaviest mass · 19 Space behind the dock · 20 Clear exits · 21 Loading bay · 22 Aim the way out
- Reuse: 23 The depot loop
- Triggers: 24 Full carrier · 25 Gate · 26 Roof and hole · 27 Lure · 28 Driver that can't steer back
- Chaining gates: 29 Hook · 30 Upright gate · 31 Short ceiling · 32 Static scan

## Moving

### 1. Neutral courier
A carrier and its load add up to 0, which makes the molecule neutral. From then on charge doesn't steer it, nothing senses it, it can't bond anything else, and it creeps toward the heaviest mass on the density map at about 0.1 cells a tick.
- **Courier:**
  - Grip −2, pattern [W, E], stay 1.
  - Tail −1, pattern [E], stay 1, bonded to the grip.
  - Parcel +3, pattern [E], stay 0.
- **Freighter:** a −3 driver plus three +1 crates.
- **Bus:** a −6 bus plus two +3 parcels.
- **Speed:** about 300 ticks for 30 cells.
- **Why it works:** it's the only way to carry something past the 6-cell sense radius on purpose. Charged movers lose their pull there and drift.

### 2. Charged mover
An empty carrier keeps its charge, so it's pushed off same-sign things and pulled toward opposite ones within 6 cells.
- **The Retriever's carrier (−3)** is pushed off the −3 dock and finds +3 parcels.
- **Speed:** a molecule moves with chance 1/size per tick, and a free particle every tick.
- **Range:** beyond 6 cells it goes on its last heading plus random walk. Use that inertia (22).

### 3. Slingshot
A same-sign push down a walled barrel.
- **The breech:** +3, frisk 0, stay 1, bonded to a wall.
- **The shot:** +3, randomWalk 0.
- **The barrel:** two rows of neutral wall with the back closed.
- **Why it works:** the shot can only move away, and with no random walk it flies dead straight once out of range. It reaches 30+ cells in about 70 ticks. The Lock's key is fired the same way.

### 4. Steam
A cold pocket (−500 in the field) behind a shot builds pressure, which pushes the shot out of the barrel. It's the only mechanism that uses pressure, and it has no charge at all.

## Holding

### 5. The guest decides
In a pair only the guest (the second member of the bond) may leave. Give the guest stay 1 and the pair holds forever.
- **Dock sockets** are the guests of the loads they hold.
- **The Lock is the parcel's guest**, and the garage and decoy are their drivers'.
- **Hand-placed bonds:** in a hand-built protein, `bonds: [[host, guest]]` sets who's the guest.

### 6. Holder post
A +8 post (frisk 0, stay 1, pattern [N]) bonded by hand to a wall, so its one bond is used up.
- **Holding the load:** a +3 load is 5 away from +8, so it's pulled at 0.5 but can never bond, and stays by the post.
- **Keeping it still:** give the load randomWalk 0. A free particle that nothing pulls keeps its last heading at 0.25, and the post's 0.5 × (1 − d/7) drops below that at about 3.5 cells. So with any random walk, a load sooner or later strays far enough to leave for good.
- **Carriers:** a post pulls a +3 load and a negative carrier the same way, so it never makes a carried load let go.

### 7. Pocket
Walls above and below a waiting load, and its post plus the post's wall behind it, so the pocket is open only on the dock's side.
- **Why:** the load can only be picked up from that side, and the loaded carrier leaves toward the dock.
- **Not for cargos:** a long pocket around a 3-crate cargo blocks its diagonal steps once it's loaded. Use a berth (7b).

### 7b. Berth
For a waiting cargo, a charged molecule: its post directly behind it (filled by a wall), and walls along both sides of its back two crates.
- **Why:** a charged molecule moves toward its heading, and random walk takes it around a post placed diagonally or behind. Then its +1 crates push the +3 packages out of their pockets. The berth stops every shift but east, and molecules have no inertia, so a cargo that slides out a step is pulled back toward its post.
- **Loaded:** the front crate and the driver are past the walls, so the loaded cargo only needs a couple of steps east before it's clear.
- **Numbers:** in the Depot loop with no drivers, it brought the packages that reached the dock on their own from 20 (in 30 runs) to none in 60. With two drivers, all five loads arrived in 236 of 240 runs.

### 8. Wedge
Walls around a fixed pair, so that every one of its 8 possible shifts hits a non-member. The Lock and the garages use one.
- **Check all 8 shifts:** a shift is blocked if any member's target cell holds a non-member or is past the edge.
- **Leave one exit:** open toward where the released particle must go next.

## Releasing

### 9. Release by contrast
Something near the destination pulls the load and pushes the carrier, so the load is the member that differs most, and it leaves.
- **At a dock:** −3 sockets pull a +3 load at 1. They push a −2 grip at −0.8 and a −1 tail at −0.6.
- **Timing:** a stay-0 load leaves on the next look (within 12 ticks), steers into a socket and bonds.

### 10. Load hosts the socket
The load's own side ([E]) lands on the socket, so the load hosts and the socket is the guest.
- **Why it holds:** the socket (stay 1) is the guest, so the docked pair never splits.
- **Socket pattern:** [E], into the wall behind it. That side is always blocked, so a socket never hosts anything.

### 11. Docked adds up to 0
Socket −3 plus load +3 is 0, so a docked load is neutral: nobody senses it, and it can't bond again.
- **Next loads go elsewhere:** they go to empty sockets, and a carrier is never drawn back to a delivered load.
- **Cargo:** the Freighter's +3 cargo plus one −3 socket is also 0.
- **Getting it wrong:** in an early freighter design the docked cargo didn't add up to 0, and the hauler took it back again.

### 12. Three come apart where two couldn't
A pair can only split by its guest, but a molecule of three can lose any member.
- **Unlocking:** adding a third member unlocks a pair whose guest is stay 1.
- **The Lock:** −7 Lock (guest, stay 1) holding a +3 parcel. A +7 key bonds into the Lock's slot (Lock pattern [N, S]).
- **What happens next:** with Courier B waiting outside, the parcel is the one pulled hardest away from the rest, so it leaves. Key and Lock add up to 0, so nothing bonds there again.

### 13. Sealed charges
Fixed charges (frisk 0) sealed in a wall bias who's the odd one out.
- **The garage:** two −3 garage charges under the garage and the decoy. They push the −3 driver and pull the +7 key and the +1 garage.
  - With the key in the garage, the driver is the only one pushed, so it leaves.
  - In the decoy (−3), driver and decoy are both pushed, so the key is the odd one out, and with stay 1 it stays.
- **Why two:** one charge left the driver's deviation at 0.98, just under Disagreement 1.

### 14. Lowered Disagreement
`rules: { disagreement: 0.3 }`, when the pull that should cause the release is weak, for example through walls. Set it and check that nothing else now splits early: two only ever come apart at the guest.

## Selecting

### 15. Orthogonal levels
Choose levels so that only the bonds you want can form:
- **Opposite signs always bond.**
- **Same sign bonds only if the levels are 5 or more apart.** Closer, it's refused in a protein's world, and it pushes weakly instead.
- **The key:** a +7 key bonds +1 (gap 6) and −3 (opposite) but not +3 (gap 4).
- **The mistake that taught this:** a +8 key is 5 from a +3 parcel, so it bonded the parcel.
- **Insulation:** parts more than 7 cells apart don't feel each other at all.

### 16. Start_Prob 0
Parts with Start_Prob 0 never start a molecule with each other, but they join one that exists. In the Replicator, loose ±3 parts only build onto the rod.

### 17. Divide when full
`rules: { divide: true, maxMolecule: 9 }` with a seed rod of 4: the rod grows to 9 and splits at its middle into two rods of 4.
- **Seed with 4:** a rod of 2 (+3.5 and −3) adds up to 0.5. That's neutral, so it's dead.

## Layout

### 18. Dock as the heaviest mass
A column of sockets plus a block of neutral wall behind it (thickness 5 to 8) makes the dock the heaviest thing in the world. Then every loaded carrier creeps to it.
- **What racing showed:** for a 38-cell trip, 5 and 8 thick were about equal (median 680 ticks over 20 seeds), and 0 or 1 thick took nearly twice as long (`race.mjs demo`).
- **A tall dock:** make the dock cover the rows the loads come from (21 tall for a depot spanning 25 rows).

### 19. Space behind the dock
At least about 10 empty cells between the dock's back wall and the world's edge. Otherwise the edge counts as an empty block, the density gradient flips near the dock, and docked or arriving loads drift away from it.

### 20. Clear exits
A neutral mover takes one direction and never steps around. Every step with a component toward its destination must be free of posts, pocket walls and other loads. Put posts behind loads, not beside their way out.

### 21. Loading bay
Start the vehicle on the destination side of where it loads, so once loaded nothing stands between it and the dock.
- **The Bus:** parcels above and below the lane, each pushed onto its post by the other, with a wall behind them so they can only come out toward the lane.

### 22. Aim the way out
A charged mover beyond 6 cells keeps going on inertia. Put the next stop straight ahead of its exit.
- **The garage:** its way out leads straight up to the package.
- **The key:** it waits straight above its slot.
- **Keep it small:** a small world means wanderers come back.

## Reuse

### 23. The depot loop
A carrier that's neutral when loaded and charged when empty shuttles on its own:
- **Loaded:** −3 driver plus +3 load is 0. It creeps to the dock, the heaviest mass (1, 18).
- **At the dock:** the load is pulled and the driver pushed, so the load leaves and docks (9, 10). The docked pair is 0 and nobody senses it (11).
- **Empty:** the driver is −3 again. The dock's free sockets push it off (same level), and the waiting +3 loads pull it back to the depot (2).
- **Picking up:** packages wait in pockets that open toward the dock (7), and the cargo in a berth (7b). So a driver arriving from the dock's side takes each one on its own side, then leads the way back to the dock (20).
- **Holding:** waiting loads have no random walk (6), so with no drivers nothing is delivered.
- **Numbers:** see the Depot loop's datasheet in `catalog.md`. With 2 drivers it delivers everything in about 97% of runs, and every delivery is a driver's.

## Triggers (from the Relay)

### 24. Full carrier
A carrier whose parts each hold exactly one bond, used by each other: the Messenger (−2, [W]) and the Tail (−1, [E]). The payload is bonded on by hand when the scene is built.
- **What it fixes:** once the payload is off, the carrier has no room for any bond. It can't take the payload back, can't take anyone else's load, and can't get into a gate.
- **Bonus:** it's a molecule, and molecules never steer.
- **Limit:** it can't pick a load up either, so it has to start loaded.

### 25. Gate
A +8 Gate, frisk 0, randomWalk 0, pattern [NE, N], holds a −3 driver in a pair the gate decides (stay 1).
- **How it opens:** a +3 payload bonds into its NE slot for free (gap 5), which makes three. Two sealed −3 charges beside it push the driver and pull the gate and payload, so the driver differs most (about 1.4 against 1) and leaves.
- **What can't open it:** a negative visitor in the slot, because then the gate is the odd one out, and it stays.
- **Shutting it:** its second side faces a wall, so nothing docks there once the driver has gone.

### 26. Roof and hole
A row of walls between the courier's route and the gate, ending at a hole right over the slot, with a backstop that stops the courier there.
- **How it works:** walls fill the sensed cells, so the payload barely senses the gate until it's over the hole. Then it can only fall into the slot.
- **Don't close it into a channel:** a ceiling as well blinds it completely.

### 27. Lure
A sealed −3 charge at the drop point, bonded to the wall above it. It pulls a payload let go early along the roof to the hole, and pushes the empty carrier away. In the Relay it took the success rate from 95.8% to 97.5% and the worst time from 2,952 ticks to 801.

### 28. Driver that can't steer back
A driver whose bonding side faces a wall along its way out (Driver B, [N], leaving under a row of walls). Free particles steer to any bondable thing within 3 cells, and a gate with a free side counts. This driver has no free side facing anything, so it leaves at once. With the same layout, the median run went from 660 ticks to 405.

## Chaining gates (from the Relay chain)

### 29. Hook
A handle the load waits on, so a single driver can carry it like a full carrier. The Hook (+0.25, [W, E], stay 1, Start_Prob 0, randomWalk 0) holds the Key package (+3, [W], randomWalk 0, Start_Prob 0) by hand. Driver B (−3) docks on the hook's free W side.
- **Why +0.25:** the hook must be the driver's opposite sign, or 5 or more away. A hook at −0.25 or 0 is a costly same-sign bond and is always refused.
- **Loaded:** −3 + 0.25 + 3 = +0.25, neutral, so the three creep with the key in front.
- **Who leaves:** the hook feels almost nothing, so of the driver and the key, the one with the stronger pull leaves. Make sure that's the key at the drop point, and only there (32).
- **After the drop:** the driver stays on the hook, at least at first: in a pair only the guest can leave, and B is the guest, so it lets go whenever the two are pulled 1 or more apart (21 of 236 runs before the next delivery docked). Its one side is used, the hook can't take the key back (same sign, gap 2.75), and the pair never steers, so it can't get into a gate or take another load.
- **Waiting:** every member needs randomWalk 0. A charged molecule that wanders over walls can't come back, because its way home is diagonal and blocked. With walk on the key, one waiting hook rode to the drop point by itself.
- **Leak:** the hook still has a free side, so in 1 of 240 runs the empty pair took a dock socket and dragged it off.

### 30. Upright gate
The same Gate (+8, [NE, N]) with a wall on its NE side, so its next open side is N and its slot sits straight above it.
- **Why:** a load let go 3 cells above an upright gate is within steering range, so it heads straight down the hole into the slot. The diagonal gate (25) is 3.16 away, out of range, so the load has to be pulled in by charges.
- **Park its driver diagonally:** the driver sits SE of the gate under a wall. Straight under the gate, the pair could slide up into the empty slot: a pair with a frisk-0 member still moves half as often.
- **Driver's exit:** the driver leaves NE, with a wall over that way out (28). Leave open the side its pull points to as it's let go.
- **Charges:** both sit low, W and SW of the gate, away from the route over the roof. In the chain the release deviation is 1.3 against 0.96.

### 31. Short ceiling
A few walls one row above the route, over the cells just before the drop point, but not over it.
- **How it works:** they fill the nearest 12 cells of the carrier and its load on the approach, so the gate's charges under the roof go unfelt, and nothing lets go early.
- **Keep the gate in the free load's view.** The gate has to stay among the 12 nearest occupied cells of the load at the drop point, or the load doesn't steer. In the chain, one ceiling wall 2.24 cells from the drop point was one wall too many.
- **In the chain:** walls over x 13 to 15, with the key stopping at x 18.

### 32. Static scan
Pulls involve no chance, so a hand-off can be designed on paper exactly instead of raced.
- **The route:** build the loaded molecule by hand at each cell of its route, read `deviations` from `bench.mjs` at tick 0, and see where someone first reaches Disagreement, and who.
- **The free load:** check where it heads right after it's let go (`headingOf`).
- **The gate:** check the gate with the load in.
- **What a good layout shows:** nobody leaves before the drop point, the load leaves at it, the free load heads straight for the slot, and the right member leaves the gate.
- **In the Relay chain:** the scan sorted dozens of charge, lure and ceiling layouts in seconds each. The layout it picked lets the key go exactly over the hole in every completed run, 236 of 236.
- **Still race it:** other molecules wander through, and wanderers aren't part of a static scene.
