#!/bin/zsh
# Usage: ./convert-to-mov.sh [input.webm]   (defaults to ~/Downloads/anamorphic-logo.webm)
# Converts a transparent WebM into a ProRes 4444 .mov with alpha channel.
in="${1:-$HOME/Downloads/anamorphic-logo.webm}"
out="${in%.*}.mov"
# -c:v libvpx-vp9 decoder is needed to read the alpha plane from WebM
ffmpeg -y -c:v libvpx-vp9 -i "$in" -c:v prores_ks -profile:v 4444 -pix_fmt yuva444p10le -vendor apl0 "$out" \
  && echo "Wrote $out"
