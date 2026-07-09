Static Gemini TTS preview files live here.

The video export dialog plays these files directly, without making a Gemini API
request when the preview button is clicked.

Expected filenames:

- `Kore.wav`
- `Puck.wav`
- `Aoede.wav`
- `Leda.wav`
- `Callirrhoe.wav`
- `Charon.wav`
- `Achird.wav`
- `Laomedeia.wav`
- `Vindemiatrix.wav`
- `Sulafat.wav`

Each sample should say `매뉴얼메이커`.

Generate them once with:

```bash
npm run generate:tts-samples
```

The script asks for the Gemini API key at runtime and does not save it.
