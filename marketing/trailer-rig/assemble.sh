#!/bin/sh
# METROPHAGE cinematic trailer — live gameplay cut.
# Sections: cold open (VO) → city → beat-drop montage (dive bed, 2-bar cuts)
#           → accelerando (1-bar cuts) → RUN/FIGHT card → SIGNAL LOST → title/CTA.
set -e
S="/private/tmp/claude-502/-Users-wendellphillips-Desktop-Claude-Code/881a4279-ffa0-487a-822c-61ed8cf16e71/scratchpad"
FF="$S/node_modules/ffmpeg-static/ffmpeg"
C="$S/clips"
A="$HOME/METROPHAGE/dist/assets"
OUT="$S/metrophage-trailer-cinematic.mp4"

# grade applied to every gameplay shot
G="eq=contrast=1.06:saturation=1.22,vignette,noise=alls=5:allf=t,fps=25,setsar=1"
# cards: scale down from 1600x900, fade in/out
CARD="scale=1280:720,fps=25,setsar=1"

"$FF" -y -hide_banner \
  -i "$C/city.webm"      -i "$C/downtown.webm" -i "$C/stacks.webm" \
  -i "$C/vault.webm"     -i "$C/subway.webm"   -i "$C/kernel.webm" \
  -i "$C/yards.webm"     -i "$C/kernel7.webm" \
  -loop 1 -t 3 -i "$S/cards/c1.png" \
  -loop 1 -t 3 -i "$S/cards/c2.png" \
  -loop 1 -t 3 -i "$S/cards/c3.png" \
  -loop 1 -t 5 -i "$S/cards/c4.png" \
  -loop 1 -t 5 -i "$S/cards/c5.png" \
  -i "$A/menu-PKxaYjJR.m4a" \
  -i "$A/dive-DkVMO0Vz.m4a" \
  -i "$A/meltdown-a5QbMO6a.m4a" \
  -i "$HOME/METROPHAGE/public/assets/audio/meltdown_vo.mp3" \
  -filter_complex "\
[8:v]${CARD},fade=t=in:st=0:d=0.6,fade=t=out:st=2.6:d=0.4[k1];\
[0:v]trim=59:63,setpts=PTS-STARTPTS,${G},fade=t=in:st=0:d=0.3[s1];\
[9:v]${CARD},fade=t=in:st=0:d=0.5,fade=t=out:st=2.6:d=0.4[k2];\
[0:v]trim=76.5:80,setpts=PTS-STARTPTS,${G}[s2];\
[1:v]trim=87:90.6,setpts=PTS-STARTPTS,${G}[m1];\
[6:v]trim=56.5:60.1,setpts=PTS-STARTPTS,${G}[m2];\
[3:v]trim=65:68.6,setpts=PTS-STARTPTS,${G}[m3];\
[1:v]trim=99:102.6,setpts=PTS-STARTPTS,${G}[m4];\
[7:v]trim=64.5:68.1,setpts=PTS-STARTPTS,${G}[m5];\
[3:v]trim=113:116.6,setpts=PTS-STARTPTS,${G}[m6];\
[2:v]trim=103:106.6,setpts=PTS-STARTPTS,${G}[m7];\
[5:v]trim=99.5:101.3,setpts=PTS-STARTPTS,${G}[a1];\
[6:v]trim=88.5:90.3,setpts=PTS-STARTPTS,${G}[a2];\
[1:v]trim=123.5:125.3,setpts=PTS-STARTPTS,${G}[a3];\
[7:v]trim=90.5:92.3,setpts=PTS-STARTPTS,${G}[a4];\
[5:v]trim=104.8:106.6,setpts=PTS-STARTPTS,${G}[a5];\
[1:v]trim=132.3:134.1,setpts=PTS-STARTPTS,${G}[a6];\
[10:v]${CARD},fade=t=in:st=0:d=0.4,fade=t=out:st=2.6:d=0.4[k3];\
[4:v]trim=78.5:84,setpts=PTS-STARTPTS,${G},fade=t=out:st=5.1:d=0.4[dl];\
[11:v]${CARD},fade=t=in:st=0:d=0.7[k4];\
[12:v]${CARD},fade=t=in:st=0:d=0.5[k5];\
[k1][s1][k2][s2][m1][m2][m3][m4][m5][m6][m7][a1][a2][a3][a4][a5][a6][k3][dl][k4][k5]concat=n=21:v=1:a=0[vc];\
[vc]fade=t=out:st=66.6:d=1.4,format=yuv420p[vout];\
[13:a]atrim=0:14,afade=t=in:st=0:d=1.2,afade=t=out:st=12.3:d=1.7,volume=0.55[mus1];\
[14:a]aloop=loop=1:size=2100000,atrim=0:39,afade=t=in:st=0:d=0.25,afade=t=out:st=37.4:d=1.6,volume=0.85,adelay=13500|13500[mus2];\
[15:a]atrim=0:15.5,afade=t=in:st=0:d=0.5,afade=t=out:st=12.2:d=3.3,volume=0.95,adelay=52500|52500[mus3];\
[16:a]volume=1.5,adelay=1000|1000[vo];\
[mus1][mus2][mus3][vo]amix=inputs=4:duration=longest:normalize=0,loudnorm=I=-14:TP=-1.2:LRA=11,aresample=48000[aout]" \
  -map "[vout]" -map "[aout]" -t 68 -r 25 \
  -c:v libx264 -preset slow -crf 18 -c:a aac -b:a 192k -movflags +faststart \
  "$OUT"
echo "WROTE $OUT"
