#!/bin/sh
# Usage: scripts/import-downloads.sh id1 id2 ...   (oldest new Gemini download -> first id)
# Imports the newest N Gemini_Generated_Image_*.jpg files from ~/Downloads in the order they were saved.
D="$HOME/Downloads"
files=$(ls -tr "$D"/Gemini_Generated_Image_*.jpg 2>/dev/null)
n=$(echo "$files" | grep -c .)
if [ "$n" -ne "$#" ]; then echo "expected $# files, found $n"; exit 1; fi
i=0
for f in $files; do
  i=$((i+1)); id=$(eval echo "\${$i}")
  node scripts/import-scene.mjs "$f" "$id" && rm "$f"
done
