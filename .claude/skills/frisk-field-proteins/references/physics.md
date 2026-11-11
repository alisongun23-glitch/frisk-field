# The physics proteins run on

This is the short version of the energy rules, as the code has them (`src/bonds.js`, `src/charge.js`, `src/movement.js`, `src/molecules.js`, `src/sim.js`). When this page and the code disagree, the code is right, so update this page.

## Contents

1. Sides and coordinates
2. A tick
3. What a particle senses
4. How a free particle moves
5. When a bond forms
6. What a molecule does with its turn
7. Who leaves a molecule
8. The density map
9. Things that only matter sometimes
10. Defaults in a protein's own world

## 1. Sides and coordinates

- Sides are numbered clockwise from the top: N 1, NE 2, E 3, SE 4, S 5, SW 6, W 7, NW 8.
- y grows downward, so N is up the screen.
- A protein's parts are placed relative to the middle of its world.

## 2. A tick

1. The density map refreshes every 16 ticks, and pressure refreshes.
2. Spawns and kills from the field run.
3. Every particle takes a turn, in a fresh random order:
   - a particle in a molecule runs its molecule's turn, at most once per molecule per tick;
   - a free particle walks if `frisk` > 0 and it isn't boxed in on all 8 sides.
4. The field diffuses and decays.

## 3. What a particle senses

`sensePull` looks at the **12 nearest occupied cells** within the Sense radius (6 cells), nearest first.

- **What counts toward the 12:** every occupied cell, including neutral walls and members of the particle's own molecule. A load boxed in by walls can sense almost nothing beyond them.
- **Who pulls:** members of its own molecule don't pull. Neither does anything in a neutral molecule (overall |net| ≤ Neutral range, 0.5). A free wall at 0 is neutral too.
- **How each one pulls**, from the particle's level `a` and the other's level `b` (the other's own level, not its molecule's net):

  | Case | Pull |
  |---|---|
  | Opposite signs | min(\|a\|,\|b\|) / max(\|a\|,\|b\|), so −3 and +3 pull at 1, −3 and +1 at 0.33, −3 and +8 at 0.375 |
  | Same sign, levels 5 or more apart (Free gap) | +0.5, so it pulls, and they bond for free |
  | Same sign, closer than 5 | gap/5 − 1, so −1 at an exact match and −0.2 at a gap of 4. This bond would cost energy, and in a protein's own world the field can never pay. If it could, the pull would be +0.25. |
  | Either level past the Stable limit (10), same sign | −1, since that bond is always refused |

- **Falloff and total:** each pull points along the line between them, scaled by `1 − d/7`. The total is capped at length 1, then multiplied by Charge pull (1).
- **Steering (free particles only):** if the nearest thing it could bond with is within **3 cells**, it heads straight for the cell it would dock from. That thing has to be payable, uncrushed, with room for a bond, and allowed by Start_Prob. The docking cell is the other's next open side, or failing that, the cell that puts the other on its own next open side.
- **How often:** a free particle reuses what it sensed for 4 ticks when nothing is close, and senses again every tick when something is within about 3 cells. In crowded worlds that becomes 8 and 3.

## 4. How a free particle moves

Each tick it picks a direction, then walks 1 to `frisk` cells in it, one cell at a time:

- **Random:** with chance `randomWalk × (1 − 0.9 × near)` it picks a random side. `near` is `1 − d/7` for the nearest thing it could bond with, and 0 if there's none. So a particle about to bond hardly wanders at all.
- **Otherwise:** it takes the side closest to its pull plus 0.25 × its last heading. With no pull and no heading, the side is random.
- **Inertia:** that 0.25 means a particle nothing pulls keeps going straight, and any pull weaker than 0.25 loses to its heading. A +3 load is held by a +8 post at 0.5 × (1 − d/7). That's below 0.25 from about 3.5 cells, so a load that gets that far leaves for good. Molecules have no inertia: they always go toward their heading.
- **Blocked:** it stops at the first cell that's taken or past a wall. There's no stepping around: a blocked move is a lost move.
- **Bonded:** it stops as soon as it bonds.
- **frisk 0** never moves on its own.

## 5. When a bond forms

Bonds form **only when something arrives**: a particle walks in, a molecule shifts, or a particle spawns. Two particles placed side by side never bond unless one of them moves. For the arriving particle `p` and each neighbour `q` outside its molecule:

1. **Theirs first:** if `p` sits on `q`'s next open side, then `q` hosts and `p` is the guest.
2. **Otherwise ours:** if `q` sits on `p`'s next open side, then `p` hosts and `q` is the guest.

**Next open side.** The first side, in pattern order, whose cell is empty or holds the would-be guest. Sides blocked by any other particle or a wall are passed over. So a pattern of [W, E] with W blocked offers E.

**How many bonds.** A particle holds one bond per distinct side in its pattern. That count is all that's checked: bonds placed by hand when a protein is built don't have to match the pattern.

**The bond is refused if any of these hold:**

- Either one is crushed.
- They have the same sign and either is past the Stable limit.
- Either has no room left, or the two are already bonded.
- **Either one's molecule is neutral**, |net| ≤ 0.5. A free particle at 0, like a wall, can never bond. A loaded courier that adds up to 0 can't pick anything else up, and a docked load that adds up to 0 with its socket can't take another.
- Together they'd be bigger than the Largest molecule (16).
- It costs energy and the field within Spread radius (1 in a protein's own world) can't pay. That covers the same sign closer than 5: `cost = 6 × (1 − gap/5)`. In a protein's own world, with no trickle, this never happens.
- Both are free and Start_Prob says no. The chance is the smaller of their two Start_Probs, and joining an existing molecule is always allowed.

## 6. What a molecule does with its turn

In this order:

1. **Divide when full** (if on): at the Largest molecule, its middle member (`middleOf`) lets go.
2. **Look around**, every 12 ticks:
   - Each member works out its pull from its own level, with no steering.
   - The heading is the average of these, and the molecule's walk and frisk are the members' averages.
   - Then it checks whether someone leaves (section 7).
3. **Crush check**, every 24 ticks (section 9).
4. **Frisk gate:** with average frisk below 1, it only moves with that chance. A post and its wall, both frisk 0, never move. A pair with one frisk-0 member moves half as often.
5. **Neutral** (|net| ≤ 0.5): with chance Macro speed (**0.1**) it takes one step toward denser parts of the density map (section 8), as seen from **its first member**. It doesn't sense charge, and it doesn't step around anything. If that one step is blocked, it waits.
6. **Charged:** with chance **1/size** it takes the side closest to its heading. It moves randomly instead with chance equal to its average randomWalk, or whenever the heading is exactly 0.
7. **After any shift,** every member tries to bond (section 5). That's how a moving molecule picks things up.

So a loaded neutral courier moves about 0.1 cells a tick: around 300 ticks for 30 cells. A charged molecule of 4 moves about once in 4 ticks.

## 7. Who leaves a molecule

Only one member is considered per look, and it leaves only if `random ≥ its stayProb`. When it leaves, all its bonds break.

- **A pair:** only the **guest**, the second member of the bond that made the pair, can leave. It does if the two pulls differ by at least Disagreement (1). The host can never leave a pair, whatever its stayProb.
- **Three or more:** the candidate is the member whose pull is farthest from the average of the others' pulls, if that distance is at least Disagreement. Members with stayProb 1 are still candidates, and when one of them is picked, nothing leaves that time.
- **What "differs" means:** each pull is a vector of length at most 1, so two pulls can differ by up to 2. A member pulled hard one way while the rest are pushed the other way differs by about 1.5 to 2.

Patterns that follow from this:

- **To hold a pair forever:** make the guest stayProb 1.
- **To unlock a pair:** add a third member. Now anyone can be the odd one out.
- **The minority is usually the odd one out:** at a −3 dock, the single +3 load is pulled while every negative member is pushed. Check it with numbers, though. A +1 member near −3 sockets is pulled at only 0.33, and that can fall short of Disagreement 1.
- **Disagreement can be lowered** in a protein's rules (the Lock uses 0.3) when the hand-off needs a weaker pull, but then check that nothing else splits early.

## 8. The density map

- **Mass:** every particle counts, free or bonded, walls included, in 8×8-cell blocks (Macro range 32 ÷ 4).
- **Blur:** two passes of a sliding sum reaching 2 blocks each way, so mass is felt about 32 cells off, nearer blocks more.
- **Which way:** `towardMore` compares the blocks on either side of the anchor's block, (left versus right, up versus down) and takes the closest of the 8 sides to that vector.
- **Edges:** past a solid edge, blocks count 0. A dock right against the edge has an empty "block" behind it, which turns the gradient back toward the middle. So leave empty space behind a dock.
- **Coarse:** every cell in the same block gets the same direction, and the map is refreshed every 16 ticks. A neutral mover heads for whatever is heaviest at that scale: other couriers, the depot, a pile of walls. Make the destination clearly the heaviest.

## 9. Things that only matter sometimes

- **Crush:** a molecule breaks apart if 28 molecules surround it within Layer reach (4), with a quarter of them on each side. Free particles count as one each. A dock's walls are all on one side, so a dock face doesn't crush, but a load deep inside walls on every side can.
- **Fusion:** two free particles at the same level, touching, with 52 particles around, fuse into one at double the level. It doesn't happen at protein densities, but it can in big crowds.
- **Death:** a particle dies on a cell at or below the Kill threshold (−30 in a protein's own world) or past the burn line (Spawn buffer 20 + Burn threshold 10). Proteins' own worlds keep the field at about 0, so nothing dies unless a protein adds heat, like the Steam cannon's −500.
- **Pressure:** builds where the field is below −10, and pushes particles and molecules away. Only the Steam cannon uses it.

## 10. Defaults in a protein's own world

From `COMPOUND_WORLD` in `src/compounds.js` and `toTraits`:

- **The world:** the energy presets' field settings (`FIELD` in `src/presets.js`), with no trickle and nothing released when a bond breaks. So the field stays at about 0, and same-sign bonds closer than 5 never form.
- **Class defaults, unless a class says otherwise:** `frisk` 1, `randomWalk` 0.1, `stayProb` **1**, `startProb` 1, `deathProb` 0. These are not the app's usual class defaults.
- **Globals:** a protein's `rules` (for example `{ disagreement: 0.3 }`) and its `world` (width, height, wrap) are laid over that. Anything a protein needs past this sets `needsRules: true`, and the card offers to apply them.
