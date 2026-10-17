# Deutsch Buddy

Chat in German with Lena. Every message you send comes back with a correction card: what you wrote, the corrected sentence, and a one-line reason for each fix. Tap any of Lena's messages for the English.

**Stage 1 of 6:** text chat with real-time corrections. Voice, subtitles and an animated character come next.

## One-time setup (about 20 minutes)

### 1. Get a Claude API key
1. Go to [platform.claude.com](https://platform.claude.com), sign in and add a small amount of credit (US$5 lasts months).
2. In the Console's limits or billing settings, set a monthly spend limit (e.g. US$5).
3. Create an API key and keep it handy.

### 2. Deploy the Worker (holds your key safely)
You need a free [Cloudflare](https://dash.cloudflare.com/sign-up) account and Node.js on your computer.

```bash
cd worker
npm install
npx wrangler login
npx wrangler secret put ANTHROPIC_API_KEY   # paste your Claude key
npx wrangler secret put ACCESS_CODE         # make up a password, e.g. kaffee-und-kuchen-42
npx wrangler deploy
```

Wrangler prints your Worker URL, like `https://deutsch-buddy-api.<you>.workers.dev`.

### 3. Turn on GitHub Pages
In this repo on GitHub: **Settings → Pages → Source: GitHub Actions**. Every push to `main` then builds and publishes the app to:

`https://nickdav76-beep.github.io/deutsch-buddy/`

### 4. Connect the app
Open the app, tap the gear, paste the Worker URL and your access code, pick your level, and save. Lena says hello.

On iPhone: Share → **Add to Home Screen** to use it like an app.

### 5. Give Lena a voice (Stage 2)
1. In the [Azure portal](https://portal.azure.com), create a **Speech** resource with the **Free F0** pricing tier. Pick a region close to you, e.g. Australia East.
2. Open the resource → **Keys and Endpoint**. Copy **Key 1** and the **Location/Region** (e.g. `australiaeast`).
3. In Cloudflare → your Worker → **Settings → Variables and Secrets**, add:
   - `AZURE_SPEECH_KEY` (Secret): Key 1
   - `AZURE_SPEECH_REGION` (Text): the region, e.g. `australiaeast`
4. Paste the latest `worker/dist/worker.js` into the Worker's code editor and deploy.

Lena now reads each reply aloud, lighting up each word as she says it. **Listen** replays, **Slowly** plays at 75% speed, and the voice can be changed in settings.

## Running locally
```bash
npm install
npm run dev          # app on http://localhost:5173/deutsch-buddy/
cd worker && npx wrangler dev   # Worker on http://localhost:8787
```
Use `http://localhost:8787` as the Worker URL while testing locally.

## Costs
Claude Haiku 5.5 costs US$0.10 per million input tokens and US$0.50 per million output tokens. A 30-minute chat is about 2 US cents. The settings screen shows your running total.
