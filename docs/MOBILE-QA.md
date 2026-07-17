# Real-device mobile QA checklist

Everything below has been verified in emulated viewports (`?mobile=1`, Playwright,
`tools/panel-smoke.mjs`) — but **never on physical hardware**. Emulators lie about
touch latency, screen cutouts, browser chrome, thermal throttling, and audio
unlock. Run this on at least one iPhone (Safari) and one Android (Chrome);
~15 minutes per device. Prod: https://metrophagev1.pages.dev

## Boot & display
- [ ] Portrait: "TURN PHONE SIDEWAYS" gate appears; rotating dismisses it
- [ ] Landscape: canvas fills the ENTIRE browser window — no black side bars,
      no spill/scroll (widescreen fill: `landscapeAspect()` → buffer widening)
- [ ] Notch/cutout phones: HUD corners (radar, ✕, top bar) not hidden under the cutout
- [ ] URL bar collapse/expand (scroll gesture at screen edge) refits the canvas
- [ ] First tap attempts fullscreen on Android Chrome; iOS stays windowed without breaking layout

## Touch controls
- [ ] Floating stick: touch lower-left region → stick centres under thumb; walk all 8 directions
- [ ] Tap-to-walk: tap mid-screen → runner paths there; taps on HUD do NOT pathfind
- [ ] Long-press on an NPC/player → context menu; drag cancels it
- [ ] Action arc: ATK hold auto-fires; dash / ◆ / Q / E / R all fire; cooldown rings sweep
- [ ] Haptics tick on arc buttons (Android; iOS Safari has no vibrate — expected)

## Panels & exits (the tap-trap sweep)
- [ ] Bag / Map / Quests / Chat / Opts buttons on the HUD all open their panel
- [ ] Floating red ✕ (top-right) appears whenever ANY panel is open; tap closes it
- [ ] Tap the dim area OUTSIDE a panel card → closes; tap ON the card body → stays open
- [ ] Walk to a vendor stall → tap operative → Vendor opens → both exits work
- [ ] Options: every slider draggable with a thumb; "tap ✕ or outside to close" hint reads right
- [ ] Chat: keyboard slides up WITHOUT permanently shrinking the canvas after dismiss

## Session & performance
- [ ] Guest login persists across a full browser kill + relaunch (device secret)
- [ ] Solana wallet picker (mobile Safari/Chrome, no injector): tap Connect → a
      fitted, vertically scrollable picker opens in the game tab with Phantom
      visible near the top; there is no horizontal clipping in short landscape.
- [ ] Choose Phantom → the native app opens for connection approval → return to
      the same Safari/Chrome tab → Phantom receives one free login signature.
      The game must never load or become playable inside Phantom's browser.
- [ ] Kill/relaunch Safari/Chrome after connecting: the cached address appears,
      the WalletConnect signer rehydrates, and Retry Sign Up can sign without
      choosing the wallet again.
- [ ] No-WalletConnect fallback build only: Phantom's encrypted connect and
      signMessage protocol round-trips approval through the app and returns to
      the original browser tab.
- [ ] 10 min in the hub: FPS acceptable, no thermal runaway, no memory crash
- [ ] Lock screen / switch app / return: WebSocket reconnects, runner where you left it
- [ ] Audio: music starts after first tap (autoplay policy); volume sliders apply live

## File bugs with
Device model, OS + browser version, screenshot, and repro steps.
