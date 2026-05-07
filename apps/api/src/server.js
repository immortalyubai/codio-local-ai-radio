import Fastify from "fastify";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hostIntroWav, musicWav } from "./audio.js";
import { createRadioChatReply, createRadioHostIntroCopy } from "./chat.js";
import { generateTodayProgramAsync, getTodayProgram, getVoiceScript, getVoiceSegments, openDatabase } from "./db.js";
import {
  findLocalTrack,
  getNeteaseSongPlayback,
  listLocalTracks,
  previewOnlinePlaylist,
  saveTrackIdentityOverride
} from "./library.js";
import { ensureMemoryStorage, getMemoryProfile, saveListenerFeedback } from "./memory.js";
import { ensureHostVoiceFile, synthesizeMiniMaxPreview } from "./tts.js";
import {
  ensureDailyProgramStorage,
  getCurrentSlot,
  getOrCreateDailyPlan,
  regenerateDailyPlan
} from "./planner.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../../..");
const generatedAudioDir = path.join(rootDir, "audio", "generated");
loadLocalEnv(path.join(rootDir, ".env"));

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "0.0.0.0";
const db = openDatabase();
ensureMemoryStorage(db);
ensureDailyProgramStorage(db);
getOrCreateDailyPlan(db);

export const app = Fastify({
  logger: true
});

app.addHook("onRequest", async (request, reply) => {
  reply.header("Access-Control-Allow-Origin", "*");
  reply.header("Access-Control-Allow-Headers", "Content-Type");
  reply.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");

  if (request.method === "OPTIONS") {
    return reply.code(204).send();
  }
});

app.get("/health", async () => ({ ok: true, service: "local-ai-radio-api" }));

app.get("/api/program/today", async () => getTodayProgram(db));

app.post("/api/program/regenerate", async () => regenerateDailyPlan(db));

app.get("/api/program/current", async () => {
  const plan = getOrCreateDailyPlan(db);
  return {
    date: plan.date,
    weekday: plan.weekday,
    host: plan.host,
    generatedAt: plan.generatedAt,
    source: plan.source,
    slot: getCurrentSlot(plan)
  };
});

app.get("/api/planner/today", async () => asPlannerResponse(getOrCreateDailyPlan(db)));

app.post("/api/planner/regenerate", async () => asPlannerResponse(regenerateDailyPlan(db)));

app.get("/api/planner/current", async () => {
  const plan = getOrCreateDailyPlan(db);
  const planner = asPlannerResponse(plan);

  return {
    ...planner,
    slot: getCurrentSlot(plan)
  };
});

app.post("/api/memory/feedback", async (request, reply) => {
  try {
    saveListenerFeedback(db, request.body);
    reply.send({
      ok: true,
      message: "feedback saved"
    });
  } catch (error) {
    request.log.warn({ error }, "Unable to save listener feedback");
    reply.code(500).send({
      ok: false,
      error: error instanceof Error ? error.message : "Unable to save feedback"
    });
  }
});

app.get("/api/memory/profile", async () => getMemoryProfile(db));

app.post("/api/program/today/generate", async () => {
  const program = await generateTodayProgramAsync(db);
  const voiceCache = await warmHostVoices();

  return {
    ...program,
    voiceCache
  };
});

app.post("/api/chat", async (request, reply) => {
  const body = request.body ?? {};
  const message = typeof body.message === "string" ? body.message : "";
  const playback = body.playback && typeof body.playback === "object" ? body.playback : null;
  const currentSlot = body.currentSlot && typeof body.currentSlot === "object" ? body.currentSlot : null;

  try {
    const result = await createRadioChatReply({
      message,
      program: getTodayProgram(db),
      playback,
      currentSlot,
      libraryTracks: listLocalTracks().map(({ path: _path, ...track }) => track)
    });

    reply.send(result);
  } catch (error) {
    request.log.warn({ error }, "Radio chat failed");
    reply.code(500).send({
      error: error instanceof Error ? error.message : "Radio chat failed"
    });
  }
});

app.post("/api/host/intro-copy", async (request, reply) => {
  const body = request.body ?? {};
  const currentSlot = body.currentSlot && typeof body.currentSlot === "object" ? body.currentSlot : null;
  const currentTrack = body.currentTrack && typeof body.currentTrack === "object" ? body.currentTrack : null;

  try {
    const result = await createRadioHostIntroCopy({
      program: getTodayProgram(db),
      currentSlot,
      currentTrack
    });

    reply.send(result);
  } catch (error) {
    request.log.warn({ error }, "Host intro copy failed");
    reply.code(500).send({
      error: error instanceof Error ? error.message : "Host intro copy failed"
    });
  }
});

app.post("/api/audio/host-intro/warm", async () => ({
  voiceCache: await warmHostVoices()
}));

app.post("/api/host/voice", async (request, reply) => {
  const body = request.body ?? {};
  const text = typeof body.text === "string" ? body.text.trim().slice(0, 900) : "";
  const slotId = typeof body.slotId === "string" && body.slotId.trim() ? body.slotId.trim() : "host-opening";

  if (!text) {
    reply.code(400).send({
      error: "Host voice text is required"
    });
    return;
  }

  if (!process.env.MINIMAX_API_KEY) {
    reply.send({
      text,
      source: "speechSynthesis",
      fallback: true,
      reason: "MINIMAX_API_KEY is not configured"
    });
    return;
  }

  try {
    fs.mkdirSync(generatedAudioDir, { recursive: true });

    const safeSlotId = slotId.replace(/[^a-z0-9-]/gi, "-").toLowerCase().slice(0, 72);
    const voiceId = process.env.MINIMAX_VOICE_ID ?? "Chinese (Mandarin)_Warm-HeartedAunt";
    const model = process.env.MINIMAX_TTS_MODEL ?? "speech-2.8-hd";
    const cacheKey = [
      "host-voice-v1",
      voiceId,
      model,
      process.env.MINIMAX_VOICE_SPEED ?? "",
      process.env.MINIMAX_VOICE_PITCH ?? "",
      process.env.MINIMAX_VOICE_VOLUME ?? "",
      text
    ].join("|");
    const hash = crypto.createHash("sha1").update(cacheKey).digest("hex").slice(0, 10);
    const filename = `${safeSlotId}-${hash}.mp3`;
    const filePath = path.join(generatedAudioDir, filename);

    if (!fs.existsSync(filePath)) {
      const preview = await synthesizeMiniMaxPreview({
        text,
        voiceId,
        speed: Number(process.env.MINIMAX_VOICE_SPEED ?? 1),
        pitch: Number(process.env.MINIMAX_VOICE_PITCH ?? 0),
        volume: Number(process.env.MINIMAX_VOICE_VOLUME ?? 1),
        model
      });
      fs.writeFileSync(filePath, preview.buffer);
    }

    reply.send({
      audioUrl: `/api/audio/generated/${encodeURIComponent(filename)}`,
      text,
      source: "minimax"
    });
  } catch (error) {
    request.log.warn({ error }, "Host voice generation failed");
    reply.send({
      text,
      source: "speechSynthesis",
      fallback: true,
      reason: error instanceof Error ? error.message : "Host voice generation failed"
    });
  }
});

app.post("/api/audio/voice-preview", async (request, reply) => {
  const body = request.body ?? {};
  const text =
    typeof body.text === "string" && body.text.trim()
      ? body.text.trim().slice(0, 500)
      : "晚上好，这里是你的私人电台。把灯光调暗一点，让这一首歌慢慢靠近。";
  const voiceId =
    typeof body.voiceId === "string" && body.voiceId.trim()
      ? body.voiceId.trim()
      : process.env.MINIMAX_VOICE_ID ?? "Chinese (Mandarin)_Warm-HeartedAunt";

  try {
    const preview = await synthesizeMiniMaxPreview({
      text,
      voiceId,
      speed: Number(body.speed ?? 1),
      pitch: Number(body.pitch ?? 0),
      volume: Number(body.volume ?? 1),
      model: typeof body.model === "string" && body.model.trim() ? body.model.trim() : undefined
    });

    reply
      .header("Content-Type", preview.contentType)
      .header("Cache-Control", "no-store")
      .send(preview.buffer);
  } catch (error) {
    request.log.warn({ error }, "MiniMax voice preview failed");
    reply.code(500).send({
      error: error instanceof Error ? error.message : "MiniMax voice preview failed"
    });
  }
});

app.get("/api/library/tracks", async () => ({
  tracks: listLocalTracks().map(({ path: _path, ...track }) => track)
}));

app.post("/api/library/tracks/:trackId/identity", async (request, reply) => {
  const body = request.body ?? {};

  try {
    const track = saveTrackIdentityOverride(request.params.trackId, {
      title: body.title,
      artist: body.artist
    });
    const { path: _path, ...safeTrack } = track;

    reply.send({ track: safeTrack });
  } catch (error) {
    request.log.warn({ error }, "Track identity update failed");
    reply.code(400).send({
      error: error instanceof Error ? error.message : "Track identity update failed"
    });
  }
});

app.post("/api/library/online-playlist/preview", async (request, reply) => {
  const body = request.body ?? {};

  try {
    const playlist = await previewOnlinePlaylist(body.url);

    reply.send(playlist);
  } catch (error) {
    request.log.warn({ error }, "Online playlist preview failed");
    reply.code(400).send({
      error: error instanceof Error ? error.message : "Online playlist preview failed"
    });
  }
});

app.get("/api/music/song-url", async (request, reply) => {
  const songId = typeof request.query.id === "string" ? request.query.id : "";

  try {
    const result = await getNeteaseSongPlayback(songId);

    reply.send(result);
  } catch (error) {
    request.log.warn({ error }, "NetEase song URL test failed");
    reply.code(400).send({
      error: error instanceof Error ? error.message : "NetEase song URL test failed"
    });
  }
});

app.get("/api/audio/host-intro", async (request, reply) => {
  const segment = typeof request.query.segment === "string" ? request.query.segment : "opening";
  const itemId = typeof request.query.itemId === "string" ? request.query.itemId : "";

  try {
    const script = getVoiceScript(db, segment, itemId);
    const voiceFile = await ensureHostVoiceFile(itemId || segment, script);
    sendStaticFile(reply, voiceFile.filePath, voiceFile.contentType);
  } catch (error) {
    request.log.warn({ error }, "Falling back to mock host tone");
    const audio = hostIntroWav(segment);

    reply
      .header("Content-Type", "audio/wav")
      .header("Cache-Control", "no-store")
      .send(audio);
  }
});

app.get("/api/audio/generated/:filename", async (request, reply) => {
  const filename = typeof request.params.filename === "string" ? request.params.filename : "";

  if (!/^[a-z0-9._-]+\.(mp3|wav)$/i.test(filename)) {
    reply.code(404).send({ error: "Audio file not found" });
    return;
  }

  const filePath = path.join(generatedAudioDir, filename);
  const resolved = path.resolve(filePath);

  if (!resolved.startsWith(path.resolve(generatedAudioDir) + path.sep)) {
    reply.code(404).send({ error: "Audio file not found" });
    return;
  }

  try {
    const contentType = filename.toLowerCase().endsWith(".mp3") ? "audio/mpeg" : "audio/wav";
    sendStaticFile(reply, resolved, contentType);
  } catch {
    reply.code(404).send({ error: "Audio file not found" });
  }
});

app.get("/api/audio/music/:trackId", async (request, reply) => {
  const localTrack = findLocalTrack(request.params.trackId);

  if (localTrack) {
    sendLocalAudioFile(request, reply, localTrack);
    return;
  }

  const audio = musicWav(request.params.trackId);

  reply
    .header("Content-Type", "audio/wav")
    .header("Cache-Control", "no-store")
    .send(audio);
});

async function warmHostVoices() {
  const segments = getVoiceSegments(db);
  const results = await Promise.allSettled(
    segments.map(async (segment) => {
      const voiceFile = await ensureHostVoiceFile(segment.segment, segment.script);
      return {
        segment: segment.segment,
        contentType: voiceFile.contentType,
        ok: true,
        source: voiceFile.source
      };
    })
  );

  return results.map((result, index) => {
    if (result.status === "fulfilled") {
      return result.value;
    }

    return {
      segment: segments[index]?.segment ?? "unknown",
      ok: false,
      error: result.reason instanceof Error ? result.reason.message : "Unknown TTS error"
    };
  });
}

function sendStaticFile(reply, filePath, contentType) {
  const stats = fs.statSync(filePath);

  reply.hijack();
  reply.raw.writeHead(200, {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": contentType,
    "Content-Length": stats.size,
    "Cache-Control": "no-store"
  });

  const stream = fs.createReadStream(filePath);
  stream.on("error", () => reply.raw.destroy());
  stream.pipe(reply.raw);
}

function sendLocalAudioFile(request, reply, localTrack) {
  const range = request.headers.range;
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
    "Content-Type": localTrack.mimeType
  };

  let statusCode = 200;
  let start = 0;
  let end = localTrack.size - 1;

  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);

    if (!match) {
      reply.hijack();
      reply.raw.writeHead(416, {
        ...headers,
        "Content-Range": `bytes */${localTrack.size}`
      });
      reply.raw.end();
      return;
    }

    if (match[1] === "" && match[2] !== "") {
      const suffixLength = Number.parseInt(match[2], 10);
      start = Math.max(localTrack.size - suffixLength, 0);
    } else {
      start = Number.parseInt(match[1] || "0", 10);
    }

    if (match[2] !== "" && match[1] !== "") {
      end = Number.parseInt(match[2], 10);
    }

    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= localTrack.size) {
      reply.hijack();
      reply.raw.writeHead(416, {
        ...headers,
        "Content-Range": `bytes */${localTrack.size}`
      });
      reply.raw.end();
      return;
    }

    end = Math.min(end, localTrack.size - 1);
    statusCode = 206;
    headers["Content-Range"] = `bytes ${start}-${end}/${localTrack.size}`;
  }

  headers["Content-Length"] = end - start + 1;

  reply.hijack();
  reply.raw.writeHead(statusCode, headers);

  const stream = fs.createReadStream(localTrack.path, { start, end });
  stream.on("error", () => reply.raw.destroy());
  stream.pipe(reply.raw);
}

function loadLocalEnv(envPath) {
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, "utf8");
  let pendingKey = "";
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
    if (separator === -1) {
      if (pendingKey && process.env[pendingKey] !== undefined) {
        process.env[pendingKey] += trimmed.replace(/^["']|["']$/g, "");
      }
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1).trim();
    const value = rawValue.replace(/^["']|["']$/g, "");

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
    pendingKey = key;
  }
}

function asPlannerResponse(plan) {
  const { items: _items, ...planner } = plan;
  return planner;
}

if (isMainModule()) {
  try {
    await app.listen({ port, host });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

function isMainModule() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}
