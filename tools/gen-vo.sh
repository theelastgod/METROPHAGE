#!/usr/bin/env bash
# Regenerate the meltdown VO stinger via ElevenLabs (build-time only).
# Reads ELEVENLABS_API_KEY from ../.env (gitignored). The key never ships to the
# browser — only the resulting mp3 in public/assets/audio/ is loaded at runtime.
#
# Usage:  bash tools/gen-vo.sh
set -euo pipefail
cd "$(dirname "$0")/.."

KEY=$(grep -E '^ELEVENLABS_API_KEY=' .env | cut -d= -f2-)
[ -n "$KEY" ] || { echo "No ELEVENLABS_API_KEY in .env"; exit 1; }

VOICE="N2lVS1w4EtoT3dr4eOWO"  # Callum — husky trickster
TEXT="Meltdown achieved. The Human Security System is offline. The city has accelerated past escape."
OUT="public/assets/audio/meltdown_vo.mp3"

mkdir -p "$(dirname "$OUT")"
code=$(curl -s --max-time 60 -w "%{http_code}" -o "$OUT" \
  -X POST "https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_44100_128" \
  -H "xi-api-key: $KEY" -H "Content-Type: application/json" \
  -d "{\"text\":\"${TEXT}\",\"model_id\":\"eleven_multilingual_v2\"}")

[ "$code" = "200" ] && echo "OK -> $OUT" || { echo "FAILED (HTTP $code)"; cat "$OUT"; exit 1; }
