# Deutsch Buddy — notes for Claude

A personal German conversation tutor. The learner is Nick, an English speaker learning German. The tutor character is **Lena** from Hamburg.

## Stack
- Front end: Vite + TypeScript, no framework, in `src/`. Deployed to GitHub Pages at `/deutsch-buddy/` by `.github/workflows/deploy.yml`.
- Back end: one Cloudflare Worker in `worker/` that holds the API keys and calls Claude. The app never sees a key.
- Model: `claude-haiku-5-5` (set by `MODEL` in `worker/wrangler.toml`). Don't send `temperature`/`top_p` or assistant prefill: Haiku 5.5 rejects them.

## Conventions
- Lena's prompt and the `tutor_turn` tool schema live in `worker/src/prompt.ts`. Every reply returns `reply`, `translation`, `corrected_sentence`, `corrections[]` (`original`, `corrected`, `explanation`, `type`), optional `praise`.
- Lena's reply is German only and never mentions mistakes; corrections only appear in the correction card.
- Explanations are in English, one sentence.
- Settings and chat history live in `localStorage` (keys prefixed `db.`). No secrets in the repo.
- Keep calls cheap: history is trimmed to 20 messages, the system prompt is cached.
- Run `npm test` and `npm run build` before every commit.

## Voice (Stage 2)
- The Worker's `POST /speech-token` swaps `AZURE_SPEECH_KEY` for a 10-minute Azure token; the Azure key never reaches the app.
- `src/voice.ts` synthesises with the Speech SDK (lazy-loaded) to memory, collecting word-boundary timings; `src/player.ts` plays the MP3 through one shared `<audio>` element and reports the current word; `src/subtitles.ts` holds the pure timing/alignment logic (unit-tested).
- One audio element, unlocked on the first tap, because iOS blocks sound that doesn't follow a tap.
- Voices: Katja (default), Amala, Seraphina, Conrad; "device" uses the browser's own voice; "off" is text only.
- The Cloudflare dashboard runs `worker/dist/worker.js` (bundled with esbuild) — rebuild and re-paste it after Worker changes.

## Roadmap
1. Text chat with corrections ← done
2. Azure neural voice + word-by-word subtitles (word-boundary events) ← done
3. Voice input (browser speech recognition, Azure STT fallback)
4. Own SVG character, lip-sync from Azure viseme events
5. Learning memory: mistakes log, review mode, more scenarios
6. Polish, Rive character
