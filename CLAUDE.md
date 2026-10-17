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

## Speaking (Stage 3)
- `src/listen.ts`: Azure continuous recognition (de-DE, same `/speech-token`) or the browser's SpeechRecognition; both report the running transcript via `onText`.
- Tap the mic to talk; a 2.2 s pause (or tapping again) ends the turn and, with auto-send on, submits it.
- Spoken turns carry `spoken: true`; `/chat` gets `lastSpoken`, and the Worker adds `SPOKEN_NOTE` as a second, uncached system block so Lena ignores recogniser spelling/punctuation and likely mishearings.
- Lena's audio is stopped before the mic opens so she isn't transcribed.
- Each Lena message has an **English** button (also tap the bubble); shown translations survive redraws via `shownEnglish`.

## Tap a word
- Every word in Lena's bubbles is a `.w` span (timed or not). Tapping one calls `POST /word` with the word and its sentence (`sentenceAround`); the Worker asks Claude via the `word_info` tool for meaning-in-context, lemma (nouns with article), part of speech and an optional note.
- Answers are cached in `localStorage` (`db.words`, max 400) so repeat taps are instant and free; the popup's speaker button synthesises just that word.
- The bubble tap no longer toggles English; the **English** button does.

## Lena's face (Stage 4)
- `src/avatar.ts`: the portrait (`src/assets/lena.webp`, a cropped, background-free trace of design E) inside one SVG, with a face rig drawn over it: a skin patch over the original lips, redrawn lips (upper, lower, dark interior + teeth) and two eyelids.
- Lip-sync: `voice.ts` collects Azure `visemeReceived` events (`{t, id}`, id 0–21); `player.ts` calls `onFrame(audio.currentTime)`; `Avatar.at(t)` maps the current viseme through `VISEME_SHAPES` (open 0–1, wide −1…1) and eases the mouth towards it. Device voice has no visemes, so `speak([])` animates a natural-looking rhythm instead.
- Moods: `listening` while the mic is open (slight lean-in), `thinking` while waiting for a reply, `nod()` after a sentence with no corrections. Blink and breathing are CSS.
- The panel (`#stage`) shrinks to 104 px while typing or when tapped (remembered in `db.stageSmall`); compact mode switches the SVG viewBox so eyes and mouth both stay in frame. Settings → "Show Lena's animated portrait" hides it.

## Roadmap
1. Text chat with corrections ← done
2. Azure neural voice + word-by-word subtitles (word-boundary events) ← done
3. Voice input (Azure STT, browser recognition option) ← done
4. Animated Lena (portrait E), lip-sync from Azure viseme events ← done
5. Learning memory: mistakes log, review mode, more scenarios
6. Polish, Rive character
