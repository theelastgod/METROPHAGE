# METROPHAGE — 35s cinematic trailer

Cut length **35s**, timed to a temp track segment at **3:40–4:15**.
Format 16:9, 1080p. Eight shots. Per-shot model audio OFF — one bed under all.

> ⚠️ **The temp track is not clearable.** See "Audio" at the bottom before this
> goes anywhere public. Timings below are valid regardless — the final bed gets
> built to this same grid.

## The grid (measured, not guessed)

| | |
|---|---|
| Tempo | **~75 BPM** (median onset gap 0.800s) |
| Beat | **0.8s** · Bar (4/4) | **3.2s** |
| Bar anchor | **220.0s** — validated: track's loudest instant (233.0s) sits on bar 5 |
| Segment energy | **−15.7 to −17.6 dBFS. Flat.** No build, no drop, no climax. |

**Consequence:** the source gives you no dynamics, so the cut creates them. The
whole trailer is engineered around one manufactured hole — **bar 6 mutes to near
silence, and bar 7 slams**. That contrast is the only reason this reads epic.
Cut everything hard on bar lines. No dissolves; on a flat bed, dissolves turn to mush.

Bar lines: `220.0 · 223.2 · 226.4 · 229.6 · 232.8 · 236.0 · 239.2 · 242.4 · 245.6 · 248.8 · 252.0 · 255.2`

---

## Shot 01 — bars 1–2 · `0:00–0:06.4` · track `220.0–226.4` · COLD OPEN

Black. A cyan scanline resolves into a lease ledger — endless rows, each tagged
`LEASED`. Slow push down the list. On the onset at **224.4** (beat 3 of bar 2)
one row corrupts and dies: `STATUS: REPOSSESSED → ???`

**Title:** `Every mind in Metro City is leased.`

**Prompt:** Extreme close-on a black CRT terminal in a dark room, cyan monospace
rows scrolling upward, each tagged LEASED. Slow dolly-in. One row glitches,
chromatic aberration tears through it, the line dies to black. Neon-noir, heavy
grain, shallow depth of field, cyan on pure black, locked camera. Silent.

**Model:** `cinematic_studio_video_v2` · genre `suspense` · mode `pro` · sound `off` · 7s

---

## Shot 02 — bars 3–4 · `0:06.4–0:12.8` · track `226.4–232.8` · THE WAKE

Low angle, rain. A soaked figure comes up off wet concrete, magenta signage
bleeding down the alley behind. Face never legible — a Blank has no file. Time
the rise so they reach full height on the **232.8** bar line.

**Title:** `You woke free.`

**Prompt:** Low-angle cinematic shot, rain-slick alley in a neon-noir cyberpunk
sprawl. A lone hooded figure rises from wet concrete, face lost in shadow.
Magenta and cyan signage reflected in standing water. Volumetric rain,
anamorphic flares, slow rise with the figure. Silent.

**Model:** `cinematic_studio_video_v2` · genre `action` · mode `pro` · sound `off` · 7s

---

## Shot 03 — bar 5 · `0:12.8–0:16` · track `232.8–236.0` · THE HUNT

**Cut lands on the track's single loudest instant (233.0).** Spend it. A REPO
MECH's floodlight rakes a tenement wall; drones fan out. 3.2s only — one idea.

**Title:** `The Human Security System wants you back.`

**Prompt:** A hulking armored repossession mech sweeps a searchlight across a
dense cyberpunk tenement wall at night, wasp drones fanning out in formation.
Amber warning strobes cut smog. Fast push-in, handheld urgency, sparks.
Neon-noir, cyan and amber. Silent.

**Model:** `cinematic_studio_video_v2` · genre `action` · mode `pro` · sound `off` · 4s

---

## Shot 04 — bar 6 · `0:16–0:19.2` · track `236.0–239.2` · **THE HOLE**

**The most important 3.2 seconds in the cut. Mute the bed to near-silence.**
(The source's quietest point — 236.3 — sits inside this bar, so the mute reads
as intentional rather than as damage.)

Everything stops. One static frame: the Blank, back to camera, facing THE
KERNEL's red glow across the sprawl. No motion but rain. No music. Just rain and
a sub-bass hum.

No title. Let the silence do it.

**Prompt:** Static locked wide shot, a lone hooded figure seen from behind,
small in frame, standing on a rooftop facing a distant blood-red megastructure
tower across a vast night cityscape. Almost no movement, only falling rain and
slow drifting haze. Held, contemplative, ominous. Neon-noir. Silent.

**Model:** `cinematic_studio_video_v2` · genre `suspense` · mode `pro` · sound `off` · 4s

---

## Shot 05 — bars 7–8 · `0:19.2–0:25.6` · track `239.2–245.6` · THE GAME

**The slam.** Bed returns at full level on **239.2**, hard, no fade. Snap into
clean top-down orthographic: four faction colors moving as one squad through THE
KERNEL. Infection nodes flip violet → green along the graph. Cut internally on
the **242.4** bar line — two 3.2s beats, not one long take.

> Produce as **image-to-video from a real screenshot**, never text-to-video.
> Capture a live `OnlineScene` frame at high contagion, feed as `start_image`,
> let the model add drift and node-flip glow only. Nothing invents geometry.
> Text-to-video will hallucinate an isometric city — the exact bug that shipped before.

**Title:** `Fight. Infect. Wake the city.`

**Prompt:** Top-down orthographic view, locked overhead camera, zero perspective
tilt. Four neon combatants — green, magenta, cyan, violet — move through a
red-lit grid arcology. Hexagonal nodes pulse violet to green, contagion spreads
outward along glowing links. Subtle parallax drift only, camera stays perfectly
overhead. Pure black background. Silent.

**Model:** `seedance_2_0` · `start_image` = live capture · genre `action` ·
`1080p` · mode `std` · `generate_audio` false · 7s

---

## Shot 06 — bars 9–10 · `0:25.6–0:32` · track `245.6–252.0` · THE SCALE

Pull back and up off THE KERNEL until eight districts read as one sprawl under
storm light — magenta, yellow, cyan, violet, amber, red — HELIOS at the center.
Continuous retreat across both bars, no internal cut. This is the "it's shared,
it's live" beat.

**Title:** `Your campaign is personal. The city is shared.`

**Prompt:** Sweeping aerial pull-back over a vast cyberpunk megacity at night,
districts distinguished by district-wide color casts — magenta, yellow, cyan,
violet, amber — converging on a single blood-red master grid tower at center.
Storm clouds, lightning, rain haze. Epic scale, slow continuous retreat.
Neon-noir. Silent.

**Model:** `cinematic_studio_video_v2` · genre `spectacle` · mode `pro` · sound `off` · 7s

---

## Shot 07 — bar 11 · `0:32–0:35` · track `252.0–255.0` · CARD

Sprawl burns to black on **252.0**. `METROPHAGE` strikes on in cyan, magenta
scanline crossing. Under it, small:

```
NEON-NOIR ACTION MMO · IN YOUR BROWSER
metrophagev1.pages.dev
```

Bed cuts dead at **255.0**. Hold the card two beats into silence.

**Title:** `The sprawl doesn't wait for a download.`

**Model:** still from `gpt_image_2`, held — or a 3s `kling3_0_turbo` scanline
pass. Never spend a pro video credit on a title card.

---

## Canon guardrails

- District names/accents/bosses per `src/game/districts.ts`.
- **Four** factions (METROPHAGE, K-GUERILLA, WINTERMUTE, SWARM). README's "3" is stale.
- Top-down-orthographic / pure-`#000` style bible governs **in-game art only** —
  it does not bind the cinematic shots. Shot 05 is the exception and must match exactly.
- Voice: neon-noir, short, confident. No pump language, no price talk, no
  promised returns. $METRO is deliberately absent — a 35s cinematic sells the world.

## Titles

Burn in during edit, not in-model — generated text is unreliable and typography
must match the game. Cyan `#00e5ff` on black, magenta `#ff2bd6` scanline,
monospace, uppercase. Strike each title on its bar line.

---

## Audio — read before publishing

The timing above was derived from **Gigi D'Agostino — "L'amour Toujours" (Organ
version, slowed + reverb)**, in `~/Downloads`. Treat it as a **temp track only**:
cut to it, then replace. Two blockers, both real:

1. **It's a copyrighted commercial recording** — and this project's own hard rule
   (`docs/HIGGSFIELD_ASSET_WISHLIST.md`, launch copy rules) is "no copyrighted
   assets, characters, logos, or music. Original, CC0, or AI-generated only." A
   trailer carrying it gets Content ID'd on YouTube and muted or pulled on X, and
   it's a licensing liability the moment the game takes money.
2. **That specific song carries a reputational problem.** Since 2024 it's been
   widely reported as the backing track for a racist chant meme in Germany (the
   Sylt video and the wave after it). For a game whose villain is a security
   apparatus that repossesses people, being scored by that meme is a headline
   waiting to happen. This is worth knowing even if the copyright were solved.

**The fix keeps everything above intact** — cut to the temp, then generate an
original bed to the same 75 BPM / 3.2s bar grid:

> **Prompt:** Slow neon-noir synth score, 75 BPM, 4/4, 35 seconds. Dark organ
> pad and sub-bass pulse, degraded tape hiss, cavernous reverb. Sustained and
> hypnotic for 16 seconds, then a full stop to near silence for one bar, then a
> hard percussive re-entry with driving kick and a rising cyan-bright arpeggio
> that carries to the end and cuts dead. Instrumental, no vocals, no melody quotation.
>
> **Model:** `seed_audio` · ~5–15 credits

Note the generated bed can do what the temp can't: a **real** dropout at bar 6
and a **real** slam at bar 7, instead of the edit faking both. The cut gets
stronger, not weaker.
