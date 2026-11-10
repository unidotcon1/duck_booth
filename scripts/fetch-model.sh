#!/usr/bin/env bash
# Reproduces public/vendor/mediapipe/: wasm + bundle from node_modules, model from Google storage.
set -euo pipefail
cd "$(dirname "$0")/.."
D=public/vendor/mediapipe
SRC=node_modules/@mediapipe/tasks-vision
[ -d "$SRC" ] || npm install
mkdir -p "$D"
cp "$SRC"/vision_bundle.mjs "$D"/
cp "$SRC"/wasm/vision_wasm_internal.js "$SRC"/wasm/vision_wasm_internal.wasm \
   "$SRC"/wasm/vision_wasm_nosimd_internal.js "$SRC"/wasm/vision_wasm_nosimd_internal.wasm "$D"/
curl -sSfL -o "$D"/selfie_segmenter.tflite \
  https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite
ls -l "$D"
