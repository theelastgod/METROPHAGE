# METROPHAGE — 30s cinematic trailer

Voice: neon-noir, short, confident. No pump language, no price talk, no promised
returns. $METRO is not mentioned in this cut — the trailer sells the world.

Format: 16:9, 1080p. Six shots × 5s. Music/SFX generated separately and laid
under the whole cut; per-shot model audio stays OFF so the bed doesn't fight
itself.

Canon guardrails for every prompt:
- District names, accents and bosses per `src/game/districts.ts`.
- **Four** factions (METROPHAGE, K-GUERILLA, WINTERMUTE, SWARM) — README's "3" is stale.
- Cinematic trailer shots are *not* game sprites. The top-down-orthographic /
  pure-`#000` style bible governs in-game art only. It does not apply here —
  except Shot 04, which is a screen-accurate top-down beat and must match.

---

## Shot 01 — 0:00–0:05 · COLD OPEN

**On screen:** black. A single cyan scanline resolves into a lease ledger —
endless rows of names, each tagged `LEASED`. Camera pushes slowly down the list.
One row flickers, corrupts, and goes dark: `STATUS: REPOSSESSED → ???`

**Text:** `Every mind in Metro City is leased.`

**Prompt:** Extreme close-on a black CRT terminal in a dark room, cyan monospace
text rows scrolling upward, each row a name tagged LEASED. Slow dolly-in. One
row glitches, chromatic-aberration tears through it, the line dies to black.
Neon-noir, heavy grain, shallow depth of field, cyan on pure black, no camera
shake. Silent.

**Model:** `cinematic_studio_video_v2` · genre `suspense` · mode `pro` · sound `off`

---

## Shot 02 — 0:05–0:10 · THE WAKE

**On screen:** low angle, rain. A figure in a soaked coat comes up off wet
concrete in an alley, magenta signage bleeding down the walls behind. We never
see the face clearly — a Blank has no file.

**Text:** `You woke free.`

**Prompt:** Low-angle cinematic shot, rain-slick alley in a neon-noir cyberpunk
sprawl. A lone hooded figure rises from the wet concrete, face obscured in
shadow. Magenta and cyan signage reflects in standing water. Volumetric rain,
anamorphic lens flares, slow rise with the figure. Face never legible. Silent.

**Model:** `cinematic_studio_video_v2` · genre `action` · mode `pro` · sound `off`

---

## Shot 03 — 0:10–0:14 · THE HUNT

**On screen:** hard cut. A REPO MECH's floodlight rakes across a wall of Metro
City tenements. Drones fan out. The city is looking for something it lost.

**Text:** `The Human Security System wants you back on the ledger.`

**Prompt:** A hulking armored repossession mech sweeps a searchlight across a
dense cyberpunk tenement wall at night, wasp-like drones fanning out around it
in formation. Amber warning strobes cut through smog. Handheld urgency, fast
push-in, sparks. Neon-noir, harsh practical light, cyan and amber. Silent.

**Model:** `cinematic_studio_video_v2` · genre `action` · mode `pro` · sound `off`

---

## Shot 04 — 0:14–0:20 · THE GAME (the money shot)

**On screen:** the camera booms straight up and the trailer *snaps into the
game* — clean top-down orthographic, four faction colors moving as one squad
through THE KERNEL's red grid. Infection nodes flip violet → green along the
graph. This is the only shot that must read as actual gameplay.

> Best produced as **image-to-video from a real screenshot** of `OnlineScene`,
> not text-to-video. Capture a live frame at high contagion, use it as
> `start_image`, and let the model add only drift and node-flip glow. Nothing
> invents geometry.

**Text:** `Fight. Infect. Wake the city.`

**Prompt:** Top-down orthographic view, locked overhead camera, no perspective
tilt. Four neon combatants — green, magenta, cyan, violet — move through a
red-lit grid arcology. Hexagonal nodes pulse from violet to green and the
contagion spreads outward along glowing links. Subtle parallax drift only,
camera stays perfectly overhead. Pure black background. Silent.

**Model:** `seedance_2_0` · `start_image` = live capture · genre `action` ·
resolution `1080p` · mode `std` · `generate_audio` false

---

## Shot 05 — 0:20–0:25 · THE SCALE

**On screen:** pull back and up off THE KERNEL until eight districts read as one
sprawl under storm light, each burning its own accent — magenta, yellow, cyan,
violet, amber, red. HELIOS at the center. This is the "it's shared, it's live"
beat.

**Text:** `Your campaign is personal. The city is shared.`

**Prompt:** Sweeping aerial pull-back over a vast cyberpunk megacity at night,
districts distinguished by district-wide color casts — magenta, yellow, cyan,
violet, amber — converging on a single blood-red master grid tower at the
center. Storm clouds, lightning, rain haze. Epic scale, slow continuous
retreat. Neon-noir. Silent.

**Model:** `cinematic_studio_video_v2` · genre `spectacle` · mode `pro` · sound `off`

---

## Shot 06 — 0:25–0:30 · CARD

**On screen:** the sprawl burns down to black. `METROPHAGE` strikes on in cyan,
a magenta scanline crossing it. Under it, small:

```
NEON-NOIR ACTION MMO · IN YOUR BROWSER
metrophagev1.pages.dev
```

Last frame, held two beats after the music cuts:

**Text:** `The sprawl doesn't wait for a download.`

**Model:** logo card — build in `gpt_image_2` (still) and hold, or animate the
scanline with a cheap 3s `kling3_0_turbo` pass. Do not spend a pro video credit
on a title card.

---

## Audio

One bed, generated once, cut to 30s:
- **Prompt:** Slow-building neon-noir synth score. Sub-bass pulse, distant siren
  textures, degraded tape hiss. A single rising cyan-bright arpeggio enters at
  14s and breaks into a hard percussive hit at 25s, then cuts to silence.
  Instrumental, no vocals, no melody quotation. 30 seconds.
- **Model:** `seed_audio`
- Original/AI-generated only — no licensed or recognizable music. Hard rule.

## Titles

Burn in during edit, not in-model — generated text is unreliable and the
typography needs to match the game's. Cyan `#00e5ff` on black, magenta `#ff2bd6`
scanline, monospace, uppercase.
