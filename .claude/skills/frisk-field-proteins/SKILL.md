---
name: frisk-field-proteins
description: Find, tune and combine "proteins" (small machines built from particles) in the Frisk Field particle simulator under its energy rules, and assemble them into processes. Use this whenever the user asks to make, fix, tune or explain a protein, courier, dock, lock, key, garage, bus, freighter, replicator or any machine that carries, holds, releases, sorts or copies particles in this simulator, wants several proteins combined into a process or production line, wants carriers reused, or asks why a protein or process fails some of the time. Use it even if they don't say "protein", for example "make something that brings these parcels to the dock" or "why does my courier get stuck".
---

# Finding and combining proteins

A protein here is a small arrangement of classes and bonds that reliably does one job, such as carrying a parcel to a dock, holding it until a key arrives, or copying itself. Proteins live in `src/proteins.js` (processes in `src/processes.js`), each with a card, its own world, its own rules if it needs them, and tests.

The method below is a design–build–test–learn loop with two things borrowed from the literature on tuning noisy systems: **race** variants against each other over random seeds, and **classify every failure before changing anything**. The physics is stochastic, so a design that works on one seed proves very little. A design that works on 60 seeds, with every failure explained, is a building block.

Read `references/physics.md` before designing anything new. It is the short version of the rules that decide bonds, splits and movement, and almost every design mistake is a misreading of one of them. The other references are for later steps:

- `references/tricks.md`: the mechanisms that are known to work, with the numbers that made them work.
- `references/failures.md`: symptoms, causes and fixes, from every failure met so far.
- `references/catalog.md`: a datasheet for each existing protein, which is what you combine.

## Part 1: finding one protein

### Step 1. Write the job down as a check

Before any design, write the predicate a script can test, plus a target. For example: "the parcel is bonded to a Dock within 1,500 ticks, the carrier is free afterwards, and the decoy's driver never leaves", and "at least 57 of 60 seeds". A fuzzy goal ("it delivers") lets a flaky design look finished.

Also decide what else must stay true: which existing worlds must not change (they never should; see Step 8), and whether new rules are allowed. Prefer designs that work under the default rules. A protein that needs its own rules sets `needsRules` and says why on its card.

### Step 2. Pick mechanisms, not numbers

Map each part of the job to a mechanism from `references/tricks.md`:

| The job needs | Ask | Typical mechanism |
|---|---|---|
| Moving a load far | Charged or neutral while it travels? | Carrier plus load add up to 0, so they creep to the densest mass (the dock). |
| Moving something short and straight | | Same-sign push in a walled barrel, `randomWalk` 0. |
| Holding something | Who decides the pair? | The guest of a pair decides. Give it `stayProb` 1 and the pair never splits. |
| Releasing something on cue | What makes it the odd one out? | Contrast at a dock, a third member arriving, sealed charges, the Stable limit. |
| Selecting partners | Which pairs may bond? | Opposite charges always can. The same sign can only if the levels are at least 5 apart (Free gap). Geometry decides where. |
| Keeping parts from assembling on their own | | `Start_Prob` 0, or a pair that adds up to about 0 (dead). |
| Reuse | What brings the empty carrier back? | Loaded is neutral and goes by density; empty is charged and goes by charge. |

If no row fits, combine two rows before inventing a new rule. Every protein so far has been found in the physics as it was, apart from Start_Prob and Divide when full. Those were added for the Replicator, because nothing in the old rules could tell a finished copy to let go. Add a rule only after showing on the bench that no layout can do the job, and gate it so that every existing world runs exactly as before.

### Step 3. Check it on paper

Most failed designs fail for a reason you could have worked out first. Before building, check:

1. **The bond table.** For every pair of classes that will meet: can they bond, does it cost energy (needs field energy, so usually no), and who hosts? The host is whoever's pattern side the other lands on. "Theirs" is checked first.
2. **Net charge at every stage.** Is each molecule alive (|net| > Neutral range, 0.5), or neutral? A neutral molecule can't bond, isn't felt by anything, and moves only by density.
3. **Who leaves.** In a pair, the guest (index 1) leaves if the two pulls differ by Disagreement. In three or more, the member farthest from the mean of the others leaves, and only if that member has `stayProb` below 1. Estimate each member's pull from its level and what's near it (`chargePull`, falloff `1 − d/7`, capped at 1). The minority sign is usually the odd one out, so check it with numbers. Pulls involve no chance, so you can get them exactly: build the molecule by hand where the hand-off should happen, and at every cell before it, and read `deviations` from `bench.mjs` (tricks.md, 32).
4. **Geometry.** Next sides in pattern order, which cells are blocked, and whether a wedge really stops every one of the 8 shifts. A shift is blocked if any member's target is taken by a non-member.
5. **The density map.** Neutral movers climb a coarse map (8-cell blocks, about 32 cells of reach) and take one direction only, never stepping around anything. Is the destination the dominant mass from the start point? Is there empty space behind the dock? Is every step with a component toward the destination free?

### Step 4. Build it on the bench

Use `scripts/bench.mjs`. Describe a scene as `{ world, rules, classes, build }`, where `build` returns `{ parts, bonds, heat }`. Then run it headless, without touching the app. Keep every bench file in the scratchpad, not the project.

```bash
node <skill>/scripts/bench.mjs demo   # from the project folder: shows the API on the Courier
```

Run from the project folder, because the bench imports `src/` from the current directory.

### Step 5. Race variants instead of hand-tuning one

When a design has knobs (levels, distances, positions, dock size), generate variants and race them with successive halving (`scripts/race.mjs`):

- Run every variant on a few seeds (5).
- Keep the better half, ranked by success rate, then median time.
- Double the seeds for the survivors, and repeat until one or two are left.
- Confirm the winner on at least 30 seeds, and 60 for anything going into the app.

This spends seeds where they matter, and is the same idea as irace's racing and Hyperband's successive halving. Change one mechanism per race. If nothing in a race works, the mechanism is wrong, and more numbers won't fix it. Go back to Step 2.

### Step 6. Diagnose every failure before changing anything

For each failing seed:

1. **Trace the key particles over time:** position, molecule members, and when bonds formed and broke.
2. **Dump the final state:** each loose or stuck particle, its neighbours, and its molecule's net charge. For a stuck neutral mover, print the direction the density map gives it, and whether that one step is free. That single probe found most of the depot-loop bugs.
3. **Draw frames** around the moment it went wrong (`bench.mjs` `pictures`).
4. **Scan a hand-off that happens in the wrong place.** Something lets go too early, the wrong member leaves, or a free load doesn't head for its slot: build that moment by hand and read `deviations` and `headingOf`. It's the same on every seed, so one scan explains every run that fails that way.
5. **Name the failure** with `references/failures.md`, and fix the cause in the layout or the levels. If a failure is new, add it to that file.

Never accept a fix you can't explain. "Moving the package one cell made it 59 of 60" is only a fix once you know why: from there the driver feels it as soon as it steps out of the garage.

### Step 7. Robustness

Report three numbers: success over N seeds, median time and worst time. Run a few hundred ticks past success to check that the result stays: delivered loads stay docked, a lock stays locked, the decoy still holds. Also test the "off" input (no key, no seed), which must do nothing.

### Step 8. Ship it

1. **The entry:** add it to `src/proteins.js`, or `src/processes.js` for a process, with `blurb`, `math` (the mechanism in plain words, with the real numbers), `world`, `preview`, `classes` and `build`. Reuse shared classes; they match by name and level, so the same name must mean the same traits.
2. **Tests:** add them to `tests/` (10 seeds is enough there). Assert the predicate from Step 1, plus the "off" case.
3. **Fingerprints:** check every existing world against its fingerprint from before the change. Run every preset and compound headless for a fixed number of ticks and compare a hash of the final state. Identical, or you broke something.
4. **The browser:** check it with saves blocked (`Storage.prototype.setItem` made a no-op for `frisk-field*` keys before anything replaces the world). Check the card, its own world, its input, the console, phone width and the light theme.
5. **The catalog:** add a datasheet to `references/catalog.md`.

## Part 2: combining proteins into processes

Combining works when every part has a datasheet and the parts can't interfere. These are the same principles synthetic biology uses for genetic circuits: standard parts, orthogonality and insulation.

1. **Start from the datasheets.** For each part, know:
   - what it takes in: charge, side, from which direction;
   - what it gives out, and where;
   - its net charge at every stage;
   - its footprint, plus about 7 cells of reach;
   - its timing, success rate and the rules it needs.
2. **Insulate.** Keep parts that shouldn't interact at least 7 cells apart, beyond the 6-cell Sense radius. If they must be close, make them orthogonal by charge: levels that neither bond nor pull. The same sign within 4 of each other is refused and only pushes weakly. Watch out for gaps of 5 or more, which bond for free and pull at 0.5: the +8 key that grabbed a +3 parcel did exactly that.
3. **Hand off by contrast.** A part passes something on by making it the odd one out: something nearby pulls it while pushing what holds it. Every hand-off needs a reason, from the "who leaves" list, for that member to differ from the rest.
4. **Shape the density landscape for neutral movers.** Each destination must be the dominant mass seen from its pick-ups, with:
   - empty space behind it;
   - its height covering the pick-up rows;
   - no posts, pocket walls or other loads in any step with a component toward it.
5. **Aim charged movers.** Beyond 6 cells they go on inertia, so put the next stop straight ahead of their way out, and keep the world small enough that wanderers come back.
6. **Reuse carriers like catalysts.**
   - A loaded carrier adds up to 0 and goes to the dense dock.
   - At the dock it lets go. A delivered load must add up to 0 with its socket, so nothing is drawn back to it.
   - The empty carrier is pushed off the dock (same level as the sockets) and pulled toward the remaining loads.
   - So the depot must sit on the carrier's way back, and loads must sit in pockets that open toward the dock, so they're only ever picked up from the dock's side. A cargo of several crates waits in a berth instead.
   - Waiting loads must never walk at random. A free particle keeps its last heading, so any random walk lets a load stray from its holder and make its own way to the dock. Check that with no carriers nothing is delivered.
7. **Test the process as a unit.** Race it like a single protein, and also check each part's own predicate inside the process: every load delivered, each one by a carrier, each carrier delivering more than once, nothing left stuck. Credit each delivery to the carrier that last held that load. `tests/processes.test.js` does this for the Depot loop.

## Part 3: exploring for new proteins (optional)

When the goal is "find interesting machines" rather than "build this one", run a quality-diversity search, MAP-Elites style:

1. Pick two or three behaviour measures: how far the load moved, whether it ended bonded and to what, how many times things bonded and broke, and time.
2. Generate random scenes from the tricks: random levels within ±10, patterns, `stayProb`, positions, walls.
3. Keep the best scene for each combination of measures.
4. Mutate the kept scenes and repeat.
5. Look at the archive for behaviours worth turning into proteins with Part 1.

Curiosity-driven explorers of self-organizing systems (IMGEP on Lenia) and ASAL find far more variety this way than random search does. Judge with scripted predicates rather than pictures, and save pictures for people.

## Reporting to the user

- Explain the mechanism in their words, with the real charges.
- Give success, median and worst time.
- Say plainly what still fails and why.
- Show the picture or the card, not the bench output.

## Sources for the method

- Racing and successive halving: López-Ibáñez et al., *The irace package* (2016); Hyperband and successive halving.
- Quality-diversity: Mouret and Clune, *Illuminating search spaces by mapping elites* (2015).
- Discovery in self-organizing systems: Reinke, Etcheverry and Oudeyer, ICLR 2020; Kumar et al., *Automating the Search for Artificial Life with Foundation Models* (2024).
- Composition:
  - synthetic-biology design-build-test-learn, orthogonality and insulation of parts;
  - catalytic, fuel-driven DNA strand displacement (seesaw gates), the model for reusing carriers.
