# Audio licences

## Music, ambience and sound effects
Synthesised in code by `tools/sound.py` (sine waves, seeded noise, simple filters). No recordings, samples, loops or
downloaded files: original work made for this project, owned by the project.

## Voice-over (AI)
Generated locally (nothing sent to any service) by `tools/voice.py` from the narration lines in `script/beats.py`.

| Part | Source | Author | Licence |
|---|---|---|---|
| Kokoro-82M speech model + voices (voice used: `af_heart`) | github.com/hexgrad/kokoro; ONNX export from github.com/thewh1teagle/kokoro-onnx releases, `model-files-v1.0` | hexgrad | Apache-2.0 (checked: LICENSE in github.com/hexgrad/kokoro, 28 Nov 2026) |
| kokoro-onnx (runner) | PyPI `kokoro-onnx` 0.6.1 | thewh1teagle | MIT (licence file in the package) |
| onnxruntime | PyPI `onnxruntime` 1.32.0 | Microsoft | MIT |

The voice is synthetic and does not imitate a real person. Apache-2.0 allows commercial use; keep this attribution
with the project. The speech audio it produces is ours to use.

## Files (generated, not committed; rebuild with the tools above)
- `voice/b01.wav` … `voice/b99.wav`, `voice/voice.json` — one narration line per beat.
- `tts-model/` — the downloaded model files.
- `soundtrack.wav` — the full mix.
