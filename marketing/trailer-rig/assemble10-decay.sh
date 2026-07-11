#!/bin/sh
# METROPHAGE — 10s trailer cut to Elephant Music "Decay" [1:15–1:25].
# Real gameplay captures + title card. Audio from the user Downloads mp3.
set -e
R="$(cd "$(dirname "$0")" && pwd)"
FF="${FF:-$R/node_modules/ffmpeg-static/ffmpeg}"
C="$R/clips"
AUDIO="${AUDIO:-/Users/wendellphillips/Downloads/Blade Runner 2049 - Trailer Music _ Elephant Music - Decay.mp3}"
OUT="${OUT:-$R/../metrophage-trailer-10s-decay.mp4}"
MKT="$(cd "$R/.." && pwd)"

LOOK="eq=contrast=1.08:saturation=1.25,vignette=PI/4.2,setsar=1,format=yuv420p"
# 2× drive for neon/combat; 1× for the title hold
G2="setpts=(PTS-STARTPTS)/2,fps=30,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,${LOOK}"
G1="setpts=PTS-STARTPTS,fps=30,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,${LOOK}"

# White flash accents on beats ~2.0 / 4.0 / 6.0 / 8.0 within the 10s cut
FLASH="drawbox=c=white@0.45:t=fill:enable='between(t,1.95,2.02)+between(t,3.95,4.02)+between(t,5.95,6.02)+between(t,7.95,8.02)',drawbox=c=white@0.15:t=fill:enable='between(t,2.02,2.10)+between(t,4.02,4.10)+between(t,6.02,6.10)+between(t,8.02,8.10)'"

# Title still: prefer baked card, else marketing poster
TITLE="$R/cards/c6.png"
if [ ! -f "$TITLE" ]; then TITLE="$MKT/poster-title.jpg"; fi

echo "FF=$FF"
echo "AUDIO=$AUDIO  [ss 75  t 10]"
echo "OUT=$OUT"

"$FF" -y -hide_banner \
  -i "$C/city.webm" \
  -i "$C/d0.webm" \
  -i "$C/v2.webm" \
  -i "$C/subway.webm" \
  -loop 1 -t 2.2 -i "$TITLE" \
  -ss 75 -t 10 -i "$AUDIO" \
  -filter_complex "\
[0:v]trim=start=74.0:end=78.2,${G2},fade=t=in:st=0:d=0.25[s0];\
[1:v]trim=start=88.0:end=92.2,${G2}[s1];\
[2:v]trim=start=92.0:end=96.2,${G2}[s2];\
[3:v]trim=start=117.4:end=119.6,${G1},fade=t=in:st=0:d=0.12[s3];\
[4:v]zoompan=z='min(1.14,1.0+0.006*on)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=66:s=1280x720:fps=30,${LOOK},fade=t=in:st=0:d=0.18[s4];\
[s0][s1][s2][s3][s4]concat=n=5:v=1:a=0[vc];\
[vc]${FLASH},fade=t=out:st=9.35:d=0.65,format=yuv420p[vout];\
[5:a]atrim=0:10,afade=t=in:st=0:d=0.08,afade=t=out:st=9.2:d=0.8,aresample=48000,loudnorm=I=-14:TP=-1.5:LRA=11[aout]" \
  -map "[vout]" -map "[aout]" -t 10.0 -r 30 \
  -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p \
  -c:a aac -b:a 192k -ar 48000 -movflags +faststart \
  "$OUT"

echo "WROTE $OUT"
"$FF" -i "$OUT" 2>&1 | grep -E 'Duration|Stream|Video|Audio' | head -10
ls -la "$OUT"
