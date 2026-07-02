# METROPHAGE marketing assets

- `metrophage-trailer-30s.mp4` — 30.0s, 1280×720@30, h264+AAC. Cut from real
  gameplay captures (high graphics tier) with the game's own menu theme.
  Shot list: neon title → Metro City → district streets → ICE VAULT dive →
  ICE WARDEN boss card → SIGNAL LOST death → $METRO identity gate → end card.
- `poster-boss.jpg` / `poster-title.jpg` — thumbnail/poster frames.
- `build-trailer.sh` — the ffmpeg assembly (zoompan + crossfades + audio).
  Regenerate by re-capturing frames into a `frames/` dir beside it (titles are
  baked into the stills in-browser with the game's Orbitron/Plex Mono fonts —
  see the session notes; the static ffmpeg build has no drawtext).
