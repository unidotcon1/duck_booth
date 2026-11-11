# Third-party notices

Photo Booth's own code is released under the [MIT License](LICENSE) (Copyright (c) 2026 unidotcon1).
It bundles the open-source components below. Their licences require that their copyright notices and licence
texts travel with the code, so the full texts are in the [`licenses/`](licenses) folder. Please keep that folder and
this file if you copy or redistribute the project.

## Software and AI models that are shipped inside this repository

| Component | What it does here | Licence | Where it is | Full text |
|---|---|---|---|---|
| **MODNet** (Z. Ke et al.) portrait-matting model, ONNX conversion by yakhyo | Cuts the person out of the photo | Apache-2.0 | `public/vendor/modnet/modnet.onnx` | [MODNet](licenses/MODNet-Apache-2.0.txt) · [ONNX port](licenses/modnet-onnx-port-Apache-2.0.txt) |
| **ONNX Runtime Web** (Microsoft) | Runs the MODNet model in the browser | MIT | `public/vendor/ort/` | [text](licenses/onnxruntime-MIT.txt) |
| **MediaPipe Tasks Vision** and the *selfie segmenter* model (Google) | Rough whole-body mask used as a backup | Apache-2.0 | `public/vendor/mediapipe/` | [text](licenses/MediaPipe-Apache-2.0.txt) |
| **qrcode-generator** (Kazuhiko Arase) | Draws the QR code | MIT | `public/vendor/qrcode.js` | [text](licenses/qrcode-generator-MIT.txt) |

Development tools that are **not** shipped to guests: Wrangler / Miniflare (Cloudflare, MIT OR Apache-2.0) and Playwright
(Microsoft, Apache-2.0, only used for testing). `npm audit` reported no known vulnerabilities when this was written.

"QR Code" is a registered trademark of DENSO WAVE INCORPORATED. "WhatsApp" is a trademark of Meta Platforms, Inc. and is
only used to describe the optional chat link. This project is not affiliated with or endorsed by any of these companies.

## Artwork and content — NOT covered by the MIT licence

The MIT licence covers the **code** (and the built-in stickers, sample picture and cursor files that were created for
this project). The items below belong to other people, or their rights are unknown, so **check you are allowed to use
them before running the booth in public, and remove or replace them if not**:

| Item | Note |
|---|---|
| `public/logo.png`, `public/logo-crest.png` | The logo of **Providence Presbyterian Church (长老会恩泽堂)**. It belongs to the church. Use it only with their permission; replace it with your own logo for any other event. |
| `public/stickers/optional/tung-tung-sahur.png` | Fan-made internet-meme character supplied by the project owner; the rights holder is unclear. It is **off by default** (settings → Optional stickers). Delete the file if you cannot confirm you may use it. |
| `public/cursors/*.png` | Retro pixel-art cursors made from images supplied by the project owner; their original source is not recorded here. Replace them if unsure. |
| `public/backgrounds/*` | Pictures added by the project owner. The licence of each picture is not recorded here. |
| Anything you add later (backgrounds, stickers, filter pictures, frames) | You are responsible for having the right to use it. Never use pictures taken from Pinterest, Google Images etc. without permission. |

If you are the owner of something listed here and want it removed, please open an issue on the repository.
