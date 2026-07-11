# METROPHAGE marketing assets

- `metrophage-trailer-10s-decay.mp4` — 10.0s montage (mixed footage) · Decay 1:15–1:25.
- **Campaign 10s (one source each)** · Decay 1:15–1:25 · rebuild
  `trailer-rig/assemble10-campaign.sh`:
  - `metrophage-10s-01-city.mp4` — hub/streets only
  - `metrophage-10s-02-combat.mp4` — district combat (d0) only
  - `metrophage-10s-03-dive.mp4` — ICE vault (v2) only
- Copy: `marketing/copy/social-campaign.md`
- `metrophage-trailer-30s.mp4` — 30.0s, 1280×720@30, h264+AAC. Cut from real
  gameplay captures (high graphics tier) with the game's own menu theme.
  Shot list: neon title → Metro City → district streets → ICE VAULT dive →
  ICE WARDEN boss card → SIGNAL LOST death → $METRO identity gate → end card.
- `poster-boss.jpg` / `poster-title.jpg` — thumbnail/poster frames.
- `build-trailer.sh` — the ffmpeg assembly (zoompan + crossfades + audio).
  Regenerate by re-capturing frames into a `frames/` dir beside it (titles are
  baked into the stills in-browser with the game's Orbitron/Plex Mono fonts —
  see the session notes; the static ffmpeg build has no drawtext).
