ElevenLabs-generated music beds land here (menu.mp3, downtown.mp3, dive.mp3, …).

Generate:  npm run gen:music        # all missing beds
           node tools/gen-music.mjs --force   # regenerate all

They are picked up automatically (import.meta.glob in ../audio/musicTracks.ts).
Until a bed exists, that environment falls back to the procedural Synth.
