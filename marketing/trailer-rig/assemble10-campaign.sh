#!/bin/sh
# METROPHAGE — three 10s trailers, each one focused gameplay source + Decay audio.
# 01 city  |  02 combat (d0)  |  03 ice vault (v2)
# Audio: Decay 1:15–1:25 (75–85s) for brand continuity across the campaign.
set -e
R="$(cd "$(dirname "$0")" && pwd)"
FF="${FF:-$R/node_modules/ffmpeg-static/ffmpeg}"
C="$R/clips"
MKT="$(cd "$R/.." && pwd)"
AUDIO="${AUDIO:-/Users/wendellphillips/Downloads/Blade Runner 2049 - Trailer Music _ Elephant Music - Decay.mp3}"
AUDIO_SS="${AUDIO_SS:-75}"
AUDIO_T=10

LOOK="eq=contrast=1.08:saturation=1.25,vignette=PI/4.2,setsar=1,format=yuv420p"
SCALE="scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2"
G2="setpts=(PTS-STARTPTS)/2,fps=30,${SCALE},${LOOK}"
G15="setpts=(PTS-STARTPTS)/1.5,fps=30,${SCALE},${LOOK}"
G1="setpts=PTS-STARTPTS,fps=30,${SCALE},${LOOK}"

FLASH="drawbox=c=white@0.40:t=fill:enable='between(t,2.0,2.06)+between(t,5.0,5.06)+between(t,8.0,8.06)',drawbox=c=white@0.12:t=fill:enable='between(t,2.06,2.14)+between(t,5.06,5.14)+between(t,8.06,8.14)'"

render() {
  NAME="$1"
  CLIP="$2"
  T0="$3"
  T1="$4"
  T2="$5"
  T3="$6"
  SPEED="$7"   # G2 | G15 | G1
  CARD="$8"
  OUT="$MKT/$NAME"
  eval "GX=\$$SPEED"

  echo "=== $NAME  clip=$(basename "$CLIP")  $SPEED ==="
  "$FF" -y -hide_banner -loglevel error -stats \
    -i "$CLIP" \
    -loop 1 -t 2.5 -i "$CARD" \
    -ss "$AUDIO_SS" -t "$AUDIO_T" -i "$AUDIO" \
    -filter_complex "\
[0:v]trim=start=${T0}:end=${T1},${GX},fade=t=in:st=0:d=0.22[a];\
[0:v]trim=start=${T2}:end=${T3},${GX}[b];\
[1:v]zoompan=z='min(1.12,1.0+0.005*on)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=75:s=1280x720:fps=30,${LOOK},fade=t=in:st=0:d=0.2[c];\
[a][b][c]concat=n=3:v=1:a=0[vc];\
[vc]${FLASH},fade=t=out:st=9.35:d=0.65,format=yuv420p[vout];\
[2:a]atrim=0:10,afade=t=in:st=0:d=0.08,afade=t=out:st=9.2:d=0.8,aresample=48000,loudnorm=I=-14:TP=-1.5:LRA=11[aout]" \
    -map "[vout]" -map "[aout]" -t 10.0 -r 30 \
    -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p \
    -c:a aac -b:a 192k -ar 48000 -movflags +faststart \
    "$OUT"
  ls -la "$OUT"
  "$FF" -i "$OUT" 2>&1 | grep Duration | head -1
}

# 01 — CITY only (hub / streets identity)
render "metrophage-10s-01-city.mp4" \
  "$C/city.webm" \
  74.0 80.0 \
  80.0 86.0 \
  G2 \
  "$R/cards/c6.png"

# 02 — COMBAT only (district d0)
render "metrophage-10s-02-combat.mp4" \
  "$C/d0.webm" \
  88.0 94.0 \
  94.0 100.0 \
  G15 \
  "$R/cards/c4.png"

# 03 — DIVE only (ICE vault v2)
render "metrophage-10s-03-dive.mp4" \
  "$C/v2.webm" \
  90.0 96.0 \
  96.0 102.0 \
  G15 \
  "$R/cards/c5.png"

# Desktop copies for easy open
cp -f "$MKT/metrophage-10s-01-city.mp4" \
      "$MKT/metrophage-10s-02-combat.mp4" \
      "$MKT/metrophage-10s-03-dive.mp4" \
      "$HOME/Desktop/" 2>/dev/null || true

echo "DONE"
ls -la "$MKT"/metrophage-10s-*.mp4
