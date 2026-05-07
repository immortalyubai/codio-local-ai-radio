# Codio Local AI Radio

Codio is a local-first private AI radio experiment. It reads your local music library and your daily routine, then plans a personal radio schedule for the day.

It is inspired by the idea of a private AI radio host like Claudio, but this project is built as an open-source local terminal-style radio: local library first, editable routine file, AI host copy, optional TTS voice, and a visual radio terminal UI.

## What It Does

- Plays local audio files from your library.
- Scans and normalizes song title / artist metadata.
- Reads your editable routine from `user/routines.json`.
- Generates a daily radio plan for morning, work, noon, afternoon, evening, and bedtime.
- Lets Codio explain why a song fits the current time slot.
- Supports text chat with Codio.
- Supports optional host voice generation through MiniMax TTS.
- Includes a planner showcase page for demos and videos.

## Project Structure

```text
apps/web                 Next.js frontend
apps/api                 Fastify backend
user/routines.json       Your editable daily routine
audio/                   Local audio folder, not committed
audio/generated/         Generated TTS cache, not committed
data/                    Local SQLite state, not committed
```

## Quick Start

Install dependencies:

```bash
npm install
```

Copy the environment template:

```bash
cp .env.example .env
```

Start the API server:

```bash
npm run dev:api
```

Start the web app in another terminal:

```bash
npm run dev:web
```

Open:

```text
http://localhost:3000
http://localhost:3000/plan-showcase
```

## Windows Clean Web Restart

If the Next.js dev server reports a missing `.next` chunk such as `Cannot find module './383.js'`, run:

```powershell
cd D:\Projects\local-ai-radio
powershell -ExecutionPolicy Bypass -File D:\Projects\local-ai-radio\scripts\dev-web-clean.ps1
```

## Daily Routine

Codio reads your schedule from:

```text
user/routines.json
```

Each block describes one part of the day:

```json
{
  "slotId": "deep-work",
  "label": "上午专注",
  "timeRange": "09:00-12:00",
  "activity": "和 Codex 写代码",
  "intent": "把注意力稳定下来，让上午进入持续创作和编码状态。",
  "musicIntent": "希望音乐专注、少人声、稳定，像一条不打扰思路的工作轨道。",
  "displayStyles": ["专注", "少人声", "稳定"],
  "scoringTags": ["steady-groove", "instrumental", "light-electronic", "ambient"],
  "energy": "medium"
}
```

After editing `user/routines.json`, restart the API server or regenerate the planner so Codio reads the latest routine.

## Music Library

Supported playable formats include:

```text
.mp3 .flac .m4a .wav .ogg
```

NetEase `.ncm` files are not directly playable here. Convert or provide playable local files before importing.

The library parser tries to understand common filename patterns like:

```text
Artist - Song
Song - Artist
```

You can correct title / artist identity in the library UI when a file is parsed incorrectly.

## Optional AI Features

Codio works without API keys by falling back to local templates.

For AI chat and host intro copy, fill in:

```text
RADIO_LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-chat
```

For host voice generation, fill in:

```text
RADIO_TTS_PROVIDER=minimax
MINIMAX_API_KEY=
MINIMAX_TTS_MODEL=speech-2.8-hd
MINIMAX_VOICE_ID=Chinese (Mandarin)_Warm-HeartedAunt
```

Generated voice files are cached in `audio/generated/` and should not be committed.

## Demo Pages

- `/` main Codio radio terminal
- `/plan-showcase` daily plan showcase for recording videos
- `/visual-lab` visual experiment page
- `/voice-lab` voice preview lab

## Open Source Safety

Do not commit:

- `.env` or any API keys
- local songs
- `audio/generated/`
- `data/*.sqlite`
- logs
- `.next` / build caches

The repository includes `.env.example` as a safe template.

## Scripts

```bash
npm run dev:api
npm run dev:web
npm run build
```

## License

Add your license before publishing publicly. MIT is a common default for this kind of project.
