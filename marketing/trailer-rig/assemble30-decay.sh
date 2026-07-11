#!/bin/sh
# METROPHAGE — 30s P2E/web3 cut to Elephant Music "Decay" (1:30–2:00).
# Cuts land ON the detected bass hits: 1.55 5.70 9.90 13.70 17.45 21.20 | 23.20 breakdown | 26.40 return.
# Drive = 2x speed-ramp (sign-in gate 4x), breath = 1x SIGNAL LOST, title punch on the return.
# White flash-frames accent every hit; captions ride across internal cuts.
set -e
R="$(cd "$(dirname "$0")" && pwd)"
FF="$R/node_modules/ffmpeg-static/ffmpeg"
C="$R/clips"
OUT="$R/metrophage-trailer-30s-decay.mp4"

# grades: 2x / 4x / 1x + shared look
LOOK="eq=contrast=1.07:saturation=1.22,vignette=PI/4.4,setsar=1"
G2="setpts=(PTS-STARTPTS)/2,fps=50,${LOOK}"
G4="setpts=(PTS-STARTPTS)/4,fps=50,${LOOK}"
G1="setpts=PTS-STARTPTS,fps=50,${LOOK}"

# metro30b / pvp30 windows — filled after capture review
MB_IN=${MB_IN:-0}; MB_OUT=${MB_OUT:-7.5}
PV_IN=${PV_IN:-0}; PV_OUT=${PV_OUT:-4.0}

# hit times for flash accents (final timeline)
FLASH="drawbox=c=white@0.50:t=fill:enable='between(t,1.55,1.61)+between(t,9.90,9.96)+between(t,13.70,13.76)+between(t,17.45,17.51)+between(t,21.20,21.26)+between(t,26.40,26.46)',drawbox=c=white@0.18:t=fill:enable='between(t,1.61,1.69)+between(t,9.96,10.04)+between(t,13.76,13.84)+between(t,17.51,17.59)+between(t,21.26,21.34)+between(t,26.46,26.54)'"

"$FF" -y -hide_banner \
  -i "$C/city.webm" \
  -i "$C/metro30.webm" \
  -i "$C/city30.webm" \
  -i "$C/duo30.webm" \
  -i "$C/d0.webm" \
  -i "$C/v2.webm" \
  -i "$C/metro30b.webm" \
  -i "$C/pvp30.webm" \
  -i "$C/subway.webm" \
  -i "$R/cards/c4.png" \
  -loop 1 -t 1.6 -i "$R/cards/c6.png" \
  -i "$R/music30-fresh.wav" \
  -loop 1 -t 30 -i "$R/cards/p2.png" \
  -loop 1 -t 30 -i "$R/cards/p1.png" \
  -loop 1 -t 30 -i "$R/cards/p4.png" \
  -loop 1 -t 30 -i "$R/cards/p6.png" \
  -loop 1 -t 30 -i "$R/cards/p5.png" \
  -filter_complex "\
[0:v]trim=74.0:77.1,${G2},fade=t=in:st=0:d=0.30[s0];\
[1:v]trim=74.5:91.1,${G4}[s1];\
[0:v]trim=80.0:85.2,${G2}[s2];\
[2:v]trim=619.0:622.2,${G2}[s3];\
[3:v]trim=330.0:333.8,${G2}[s4];\
[4:v]trim=88.0:91.8,${G2}[s5];\
[3:v]trim=343.0:346.7,${G2}[s6];\
[5:v]trim=92.0:95.8,${G2}[s7];\
[6:v]trim=${MB_IN}:${MB_OUT},${G2}[s8];\
[7:v]trim=${PV_IN}:${PV_OUT},${G2}[s9];\
[8:v]trim=117.4:120.6,${G1},fade=t=in:st=0:d=0.14[s10];\
[9:v]zoompan=z='max(1.0,1.12-0.0072*on)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=100:s=1280x720:fps=50,${LOOK}[s11];\
[10:v]fps=50,${LOOK},fade=t=in:st=0:d=0.25[s12];\
[s0][s1][s2][s3][s4][s5][s6][s7][s8][s9][s10][s11][s12]concat=n=13:v=1:a=0[vc];\
[12:v]format=rgba,fade=t=in:st=1.85:d=0.25:alpha=1,fade=t=out:st=5.15:d=0.30:alpha=1[c1];\
[13:v]format=rgba,fade=t=in:st=5.95:d=0.25:alpha=1,fade=t=out:st=9.35:d=0.30:alpha=1[c2];\
[14:v]format=rgba,fade=t=in:st=10.15:d=0.25:alpha=1,fade=t=out:st=13.15:d=0.30:alpha=1[c3];\
[15:v]format=rgba,fade=t=in:st=17.70:d=0.25:alpha=1,fade=t=out:st=20.70:d=0.30:alpha=1[c4];\
[16:v]format=rgba,fade=t=in:st=21.35:d=0.20:alpha=1,fade=t=out:st=22.75:d=0.25:alpha=1[c5];\
[vc][c1]overlay=0:0:eof_action=pass[o1];\
[o1][c2]overlay=0:0:eof_action=pass[o2];\
[o2][c3]overlay=0:0:eof_action=pass[o3];\
[o3][c4]overlay=0:0:eof_action=pass[o4];\
[o4][c5]overlay=0:0:eof_action=pass[o5];\
[o5]${FLASH},fade=t=out:st=29.3:d=0.7,format=yuv420p[vout];\
[11:a]atrim=0:30,afade=t=in:st=0:d=0.12,afade=t=out:st=28.6:d=1.4,aresample=48000[aout]" \
  -map "[vout]" -map "[aout]" -t 30.0 -r 50 \
  -c:v libx264 -preset slow -crf 17 -c:a aac -b:a 192k -movflags +faststart \
  "$OUT"
echo "WROTE $OUT"
