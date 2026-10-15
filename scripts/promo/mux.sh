#!/bin/zsh
# 갈라 홍보 영상 최종본: 프레임 렌더(make-promo.mjs) 결과 + 곡 A(Space Adventures, Pixabay Content License)
#   scripts/promo/build/galla-promo-16x9.mp4 · -9x16.mp4  (원본 화질)
#   assets/about/video/promo-9x16.mp4 · promo-16x9.mp4      (사이트용 경량본) + 포스터 webp
set -e
cd "$(dirname "$0")/../.."
B=scripts/promo/build; V=assets/about/video; mkdir -p $V
for AR in 16x9 9x16; do
  ffmpeg -v error -y -i $B/video-$AR.mp4 -i assets/about/bgm-a.m4a -map 0:v -map 1:a \
    -af "afade=t=out:st=44.3:d=1.7" -c:v copy -c:a aac -b:a 192k -shortest $B/galla-promo-$AR.mp4
done
ffmpeg -v error -y -i $B/galla-promo-9x16.mp4 -vf scale=720:1280 -c:v libx264 -preset slow -crf 26 -profile:v high -pix_fmt yuv420p -movflags +faststart -c:a aac -b:a 128k $V/promo-9x16.mp4
ffmpeg -v error -y -i $B/galla-promo-16x9.mp4 -vf scale=1280:720 -c:v libx264 -preset slow -crf 26 -profile:v high -pix_fmt yuv420p -movflags +faststart -c:a aac -b:a 128k $V/promo-16x9.mp4
ffmpeg -v error -y -ss 41.5 -i $B/video-9x16.mp4 -frames:v 1 -vf scale=720:1280 $B/p9.png && cwebp -quiet -q 78 $B/p9.png -o $V/promo-9x16.webp
ffmpeg -v error -y -ss 41.5 -i $B/video-16x9.mp4 -frames:v 1 -vf scale=1280:720 $B/p16.png && cwebp -quiet -q 78 $B/p16.png -o $V/promo-16x9.webp
ls -la $B/galla-promo-*.mp4 $V
