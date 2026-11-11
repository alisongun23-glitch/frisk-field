---
tags: [skill-creator]
max_turns: 40
timeout_seconds: 1800
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

In Frisk Field I want a parcel to wait at a pickup spot until a courier comes for it, so I put it next to a post: a +8 Post at (-12, 0) bonded to a Dock wall at (-13, 0), and an ordinary Parcel (+3, random walk 0.1) at (-11, 0). The Courier's dock is at x 18 and there's no courier yet. Within a few hundred ticks the parcel drifts off its post, and most of the time it ends up docked all by itself. Why doesn't the post hold it, and what's the fix? Show me it works.

Input files: index.html, package.json, src/, tests/, tools/
