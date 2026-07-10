# METROPHAGE — project brief for Claude

Top-down neon-noir cyberpunk **action-RPG MMO** in the browser. Phaser 3 + Vite + TS
client; **server-authoritative** world on Cloudflare (Worker + per-zone Durable
Objects at 20Hz + D1). The server owns every number — clients only render and send
intents. 9-act questline ("THE WAKE" → REISSUE conspiracy), 4 classes with full kits
(dash/Q/E/R + HEAT), districts/dives/world-events/bosses/elites, parties/guilds/
trade/market/PvP, weekly PROVING vault, $METRO token bridge (dormant).

## LIVE (deployed 2026-07-07)

- **Game: https://metrophagev1.pages.dev** (CF Pages, project `metrophagev1`, production branch `main`)
- **Server: https://metrophage-server.wendellphillips.workers.dev** (free tier — SQLite-backed DO)
- wrangler OAuth for this account works from the shell on this machine.

**Redeploy server:** `cd server && npx wrangler deploy`
**Redeploy client:**
```sh
VITE_SERVER_URL=wss://metrophage-server.wendellphillips.workers.dev/ws npx vite build
npx wrangler pages deploy dist --project-name=metrophagev1 --branch=main --commit-dirty=true
```
⚠ `VITE_SERVER_URL` is **build-time**; forget it and the client silently targets
localhost. Always `--branch=main` or the deploy becomes a preview URL.

## Dev environment

- No system node: `export PATH="$HOME/.local/node/bin:$PATH"` in every shell.
- Local server: `cd server && npm run dev` (wrangler dev :8787). Local client: vite :5188.
- Typecheck both sides: `npx tsc --noEmit` in repo root AND in `server/`.
- Shared sim/game code lives in `src/` and is imported by `server/src/world.ts` —
  nothing under `src/net|game|world` may touch DOM globals (server bundles it).

## Testing (server/scripts/smoke.mjs — ~34 modes, one per run)

`node scripts/smoke.mjs <mode>` against a running local server. Policies learned the
hard way:
- **Battery failures are usually harness artifacts** (seed/flake). A mode that fails
  in-battery but whose systems pass in sibling modes → re-run STANDALONE before
  calling it a regression. Standalone is truth.
- Harness pre-seeds (whale/pauper/crafter/galice/gbob/mseller/mbuyer/repvip/dresser,
  metro ledger clears) must run with **wrangler STOPPED** — live DOs flush dirty
  player state over your reseed.
- Use **fresh bot identities** (`"xx" + Date.now()%1e6`) — persisted bots drift
  across runs (corner-parking, board crowding).
- Fresh bots fight with the MELEE starter (ranged whiffs at distance; close to ~45px).
- Read world dims from the login welcome (`w.world`), never hardcode (districts are
  3× scaled: 3840×2880).

## Hard constraints (do not violate)

- **$METRO economy (Robinhood Chain launch)**: rates **100 in / 125 out**, min **250 ₵**,
  daily cap **50k ₵**, player-funded pool. Don't redesign mid-launch without a note.
- **Mainnet is counsel-gated**: `METRO_MAINNET_ARMED` stays off. Devnet only.
- CA go-live order (SHIPPING.md §5): server secrets FIRST, then client
  `VITE_METRO_MINT` — sim settlement trusts claimed deposits, so a live panel
  without server secrets lets players fabricate credits.
- Treasury never holds or spends SOL (claims: player is fee payer).
- `TILESET_PX` must equal `TILE` (32) — pixelArt NEAREST minification shimmers.
  96px master: `public/assets/tilesets/metrophage_tiles@96.png`, re-bake per-cell.
- Characters/cops/NPCs are **code-baked** from `src/assets/charart.ts`
  (32×32, 4 facings × 4 steps, facing-major). Don't point their manifest entries
  at files; don't change CHAR without touching manifest+anim+origins.

## Verification rig (marketing/trailer-rig/)

Headed-Chromium Playwright + injected fake wallet. `node <script>.mjs` with vite:5188
+ wrangler:8787 up. Key scripts: terrain-audit, tier-audit (TIER=low|high),
charview/charclose, depth-audit, coldopen-view, flicker-audit, verify-session.
Gotchas: use CDP `Page.captureScreenshot` (page.screenshot hangs on the Google-Fonts
import); double-shot (full-screen juice flashes eat single frames); **never press ESC
to dismiss dialogue in the online scene — ESC quits to menu**; rig pre-sets
`metrophage_coldopen_v1=1` (coldopen-view clears it).

## Docs

- `SHIPPING.md` — deploy runbook (dry-run-verified) + $0-launch table + CA go-live.
- `README.md` — world map, class kits, economy, smoke modes.
- Session-scale history lives in Claude's project memory under
  `~/.claude/projects/-Users-wendellphillips-Desktop-Claude-Code/memory/` (sessions
  started in `~/Desktop/Claude Code` load it automatically).
