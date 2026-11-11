#!/usr/bin/env bash
# Reproduces the vendored segmentation assets (run after `npm install`):
#   public/vendor/mediapipe/  MediaPipe tasks-vision bundle + wasm + selfie_segmenter.tflite  (Apache-2.0)
#   public/vendor/ort/        onnxruntime-web wasm runtime                                    (MIT)
#   public/vendor/modnet/     modnet.onnx, MODNet photographic matting model (~24.8 MiB)     (Apache-2.0)
# The MODNet file is optional: without it Segmenter falls back to MediaPipe automatically.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -d node_modules/@mediapipe/tasks-vision ] && [ -d node_modules/onnxruntime-web ] || npm install
M=public/vendor/mediapipe; O=public/vendor/ort; N=public/vendor/modnet
SRC=node_modules/@mediapipe/tasks-vision; OD=node_modules/onnxruntime-web/dist
mkdir -p "$M" "$O" "$N"
cp "$SRC"/vision_bundle.mjs "$SRC"/wasm/vision_wasm_internal.js "$SRC"/wasm/vision_wasm_internal.wasm \
   "$SRC"/wasm/vision_wasm_nosimd_internal.js "$SRC"/wasm/vision_wasm_nosimd_internal.wasm "$M"/
curl -sSfL -o "$M"/selfie_segmenter.tflite \
  https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite
cp "$OD"/ort.wasm.min.mjs "$OD"/ort-wasm-simd-threaded.mjs "$OD"/ort-wasm-simd-threaded.wasm "$O"/
# MODNet photographic (ONNX port by yakhyo/modnet of ZHKKKe/MODNet weights, Apache-2.0)
curl -sSfL -o "$N"/modnet.onnx https://github.com/yakhyo/modnet/releases/download/weights/modnet_photographic.onnx
ls -l "$M" "$O" "$N"
