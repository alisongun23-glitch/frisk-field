# Frisk Field

A simulator for a made-up pixel physics. Particles belong to classes with a charge, and they move, bond, split, fuse, grow and die in an energy field.

Small machines built from particles ("proteins") carry, hold, release and copy other particles using charge alone. They include couriers, docks, gates, the Relay and the 3-stage Relay chain, and a self-copying rod.

## Run it

You need [Node.js](https://nodejs.org) (tested on version 26). There are no packages to install.

```bash
node tools/serve.mjs
```

Then open http://localhost:8123. Opening `index.html` straight from the folder won't work, because browsers only load the app's modules from a server.

The server is for your own computer only. It listens on 127.0.0.1, so other devices on your network can't open it, and it only serves files inside this folder.

## Try it

- **Preset**, the menu at the top, starts whole worlds: Stars, Charge pairs, Costly bonds, Predator & prey and more.
- **The Compounds tab** opens one machine or process in its own world, from the Courier to the Relay chain.
- **Save / load** copies your settings out as JSON and loads them back in.

## Tests and headless runs

```bash
node --test
```

```bash
node tools/run.mjs stars 4000 500 --map
```

`tools/run.mjs` runs a preset, or a saved settings file, without the browser and prints how it evolves.

## How the machines were designed

`.claude/skills/frisk-field-proteins/` is a [Claude Code](https://claude.com/claude-code) skill holding the method behind the machines:

- a catalog with reliability numbers;
- the physics rules that matter for design;
- the tricks that worked;
- a table of every failure and its cause;
- a headless bench, for example:

```bash
node .claude/skills/frisk-field-proteins/scripts/bench.mjs protein chain 20
```

## Layout

| Folder | What's in it |
|---|---|
| `src/` | The simulation (`sim.js`, `world.js`, `movement.js`, `molecules.js`, …), the machines (`proteins.js`, `processes.js`, `compounds.js`) and the interface (`ui/`) |
| `tests/` | Tests for the rules and every machine |
| `tools/` | The local server and the headless runner |
