#!/bin/sh
# METROPHAGE — 30s cinematic cut to Elephant Music "Decay" (1:30–2:00).
# All gameplay is speed-ramped 2x and mastered at 50fps so the action reads fast+fluid.
# Music map (trailer t): 0–23.3 drive · 23.3 pull-back (SIGNAL LOST, 1x) · 26.5 return (title).
set -e
R="$(cd "$(dirname "$0")" && pwd)"
FF="$R/node_modules/ffmpeg-static/ffmpeg"
C="$R/clips"
OUT="$R/metrophage-trailer-30s-decay.mp4"

# 2x-speed grade for action, 1x for the death beat
G2="setpts=(PTS-STARTPTS)/2,fps=50,eq=contrast=1.06:saturation=1.2,vignette,setsar=1"
G1="setpts=PTS-STARTPTS,fps=50,eq=contrast=1.06:saturation=1.2,vignette,setsar=1"
CARD="fps=50,setsar=1"

# Shot windows (source seconds) — filled from contact-sheet review.
"$FF" -y -hide_banner \
  -i "$C/city.webm" -i "$C/creation.webm" -i "$C/d0.webm" -i "$C/d7.webm" \
  -i "$C/d1.webm" -i "$C/v2.webm" -i "$C/subway.webm" \
  -loop 1 -t 2.0 -i "$R/cards/c4.png" \
  -loop 1 -t 2.0 -i "$R/cards/c6.png" \
  -loop 1 -t 3.0 -i "$R/cards/p1.png" \
  -loop 1 -t 3.0 -i "$R/cards/p2.png" \
  -loop 1 -t 3.0 -i "$R/cards/p3.png" \
  -loop 1 -t 3.0 -i "$R/cards/p4.png" \
  -loop 1 -t 3.0 -i "$R/cards/p5.png" \
  -loop 1 -t 3.0 -i "$R/cards/p6.png" \
  -loop 1 -t 3.0 -i "$R/cards/p7.png" \
  -i "$R/music30.wav" \
  -filter_complex "\
[0:v]trim=74:80,${G2},fade=t=in:st=0:d=0.4[s1];\
[1:v]trim=36:42,${G2}[s2];\
[0:v]trim=80:86,${G2}[s3];\
[2:v]trim=86:92,${G2}[s4];\
[3:v]trim=100:106,${G2}[s5];\
[4:v]trim=74:80,${G2}[s6];\
[5:v]trim=92:98,${G2}[s7];\
[6:v]trim=66:70.6,${G2}[s8];\
[6:v]trim=117.5:120.6,${G1}[s9];\
[7:v]scale=1280:720,${CARD},fade=t=in:st=0:d=0.35[k1];\
[8:v]${CARD},fade=t=in:st=0:d=0.3[k2];\
[s1][s2][s3][s4][s5][s6][s7][s8][s9][k1][k2]concat=n=11:v=1:a=0[vc];\
[9:v]format=rgba,fade=t=in:st=0:d=0.25:alpha=1,fade=t=out:st=2.6:d=0.35:alpha=1,setpts=PTS-STARTPTS+0.15/TB[c1];\
[10:v]format=rgba,fade=t=in:st=0:d=0.25:alpha=1,fade=t=out:st=2.6:d=0.35:alpha=1,setpts=PTS-STARTPTS+3.05/TB[c2];\
[11:v]format=rgba,fade=t=in:st=0:d=0.25:alpha=1,fade=t=out:st=2.6:d=0.35:alpha=1,setpts=PTS-STARTPTS+6.05/TB[c3];\
[12:v]format=rgba,fade=t=in:st=0:d=0.25:alpha=1,fade=t=out:st=2.6:d=0.35:alpha=1,setpts=PTS-STARTPTS+9.05/TB[c4];\
[13:v]format=rgba,fade=t=in:st=0:d=0.25:alpha=1,fade=t=out:st=2.6:d=0.35:alpha=1,setpts=PTS-STARTPTS+12.05/TB[c5];\
[14:v]format=rgba,fade=t=in:st=0:d=0.25:alpha=1,fade=t=out:st=2.6:d=0.35:alpha=1,setpts=PTS-STARTPTS+15.05/TB[c6];\
[15:v]format=rgba,fade=t=in:st=0:d=0.25:alpha=1,fade=t=out:st=2.6:d=0.35:alpha=1,setpts=PTS-STARTPTS+18.05/TB[c7];\
[vc][c1]overlay=0:0:eof_action=pass[o1];\
[o1][c2]overlay=0:0:eof_action=pass[o2];\
[o2][c3]overlay=0:0:eof_action=pass[o3];\
[o3][c4]overlay=0:0:eof_action=pass[o4];\
[o4][c5]overlay=0:0:eof_action=pass[o5];\
[o5][c6]overlay=0:0:eof_action=pass[o6];\
[o6][c7]overlay=0:0:eof_action=pass[o7];\
[o7]fade=t=out:st=29.4:d=1.0,format=yuv420p[vout];\
[16:a]aresample=48000[aout]" \
  -map "[vout]" -map "[aout]" -t 30.4 -r 50 \
  -c:v libx264 -preset slow -crf 18 -c:a aac -b:a 192k -movflags +faststart \
  "$OUT"
echo "WROTE $OUT"
