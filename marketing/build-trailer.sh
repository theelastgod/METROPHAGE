#!/bin/sh
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
FF="$DIR/node_modules/ffmpeg-static/ffmpeg"
FR="$DIR/frames"
MUSIC="$HOME/METROPHAGE/dist/assets/menu-PKxaYjJR.m4a"
OUT="$HOME/METROPHAGE/marketing/metrophage-trailer-30s.mp4"

# 8 segments x 4.2s @30fps (d=126), 0.45s crossfades; trimmed to exactly 30.0s.
D=126
"$FF" -y -hide_banner \
  -loop 1 -t 4.2 -i "$FR/t0_intro.jpg" \
  -loop 1 -t 4.2 -i "$FR/t2_city.jpg" \
  -loop 1 -t 4.2 -i "$FR/t3_district.jpg" \
  -loop 1 -t 4.2 -i "$FR/t4_vault.jpg" \
  -loop 1 -t 4.2 -i "$FR/05_bosscard.jpg" \
  -loop 1 -t 4.2 -i "$FR/t6_death.jpg" \
  -loop 1 -t 4.2 -i "$FR/t7_gate.jpg" \
  -loop 1 -t 4.8 -i "$FR/t8_outro.jpg" \
  -i "$MUSIC" \
  -filter_complex "[0:v]scale=1600:900,zoompan=z='1.04-0.0002*on':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=$D:s=1280x720:fps=30[v0];[1:v]scale=1600:900,zoompan=z='1.0+0.0011*on':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=$D:s=1280x720:fps=30[v1];[2:v]scale=1600:900,zoompan=z='1.12-0.0009*on':x='iw/2-(iw/zoom/2)':y='ih-(ih/zoom)':d=$D:s=1280x720:fps=30[v2];[3:v]scale=1600:900,zoompan=z='1.0+0.0013*on':x='iw-(iw/zoom)':y='ih/2-(ih/zoom/2)':d=$D:s=1280x720:fps=30[v3];[4:v]scale=1600:900,zoompan=z='1.10-0.0007*on':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=$D:s=1280x720:fps=30[v4];[5:v]scale=1600:900,zoompan=z='1.0+0.0016*on':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=$D:s=1280x720:fps=30[v5];[6:v]scale=1600:900,zoompan=z='1.0+0.0009*on':x='0':y='ih/2-(ih/zoom/2)':d=$D:s=1280x720:fps=30[v6];[7:v]scale=1600:900,zoompan=z='1.0+0.0004*on':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=144:s=1280x720:fps=30[v7];[v0][v1]xfade=transition=fade:duration=0.45:offset=3.75[x1];[x1][v2]xfade=transition=fade:duration=0.45:offset=7.5[x2];[x2][v3]xfade=transition=fade:duration=0.45:offset=11.25[x3];[x3][v4]xfade=transition=fade:duration=0.45:offset=15.0[x4];[x4][v5]xfade=transition=fade:duration=0.45:offset=18.75[x5];[x5][v6]xfade=transition=fade:duration=0.45:offset=22.5[x6];[x6][v7]xfade=transition=fade:duration=0.45:offset=26.25,fade=t=out:st=28.8:d=1.2,format=yuv420p[vout];[8:a]atrim=0:30,afade=t=in:st=0:d=0.8,afade=t=out:st=27:d=3[aout]" \
  -map "[vout]" -map "[aout]" -t 30 -r 30 -c:v libx264 -preset medium -crf 19 -c:a aac -b:a 160k -movflags +faststart "$OUT"
