import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../../..");
const scriptPath = path.resolve(__dirname, "../scripts/speak.ps1");
const generatedDir = path.join(rootDir, "audio", "generated");

export async function ensureHostVoiceFile(segment, text) {
  await fs.mkdir(generatedDir, { recursive: true });

  const safeSegment = segment.replace(/[^a-z0-9-]/gi, "-").toLowerCase().slice(0, 72);
  const provider = (process.env.RADIO_TTS_PROVIDER ?? "minimax").toLowerCase();
  const voiceId = process.env.MINIMAX_VOICE_ID ?? "Chinese (Mandarin)_Warm-HeartedAunt";
  const cacheKey = [
    provider,
    voiceId,
    process.env.MINIMAX_TTS_MODEL ?? "",
    process.env.MINIMAX_VOICE_SPEED ?? "",
    process.env.MINIMAX_VOICE_PITCH ?? "",
    process.env.MINIMAX_VOICE_VOLUME ?? "",
    "minimax-v4",
    text
  ].join("|");
  const hash = crypto.createHash("sha1").update(cacheKey).digest("hex").slice(0, 10);

  if (provider === "minimax" && process.env.MINIMAX_API_KEY) {
    try {
      const filePath = await ensureMiniMaxVoiceFile(safeSegment, hash, text, voiceId);
      return { filePath, contentType: "audio/mpeg", source: "minimax" };
    } catch (error) {
      console.warn("MiniMax TTS failed; falling back to Windows TTS.", error);
    }
  }

  const filePath = await ensureWindowsVoiceFile(safeSegment, hash, text);
  return { filePath, contentType: "audio/wav", source: "windows-tts" };
}

export async function synthesizeMiniMaxPreview({
  text,
  voiceId,
  speed = 1,
  pitch = 0,
  volume = 1,
  model = process.env.MINIMAX_TTS_MODEL ?? "speech-2.8-hd"
}) {
  if (!process.env.MINIMAX_API_KEY) {
    throw new Error("MINIMAX_API_KEY is not configured.");
  }

  const audio = await requestMiniMaxAudio({
    text,
    voiceId,
    speed,
    pitch,
    volume,
    model
  });

  return {
    buffer: audio,
    contentType: "audio/mpeg"
  };
}

async function ensureMiniMaxVoiceFile(safeSegment, hash, text, voiceId) {
  const outFile = path.join(generatedDir, `${safeSegment}-${hash}.mp3`);
  try {
    await fs.access(outFile);
    return outFile;
  } catch {
    const audio = await requestMiniMaxAudio({
      text,
      voiceId,
      speed: Number(process.env.MINIMAX_VOICE_SPEED ?? 1),
      pitch: Number(process.env.MINIMAX_VOICE_PITCH ?? 0),
      volume: Number(process.env.MINIMAX_VOICE_VOLUME ?? 1),
      model: process.env.MINIMAX_TTS_MODEL ?? "speech-2.8-hd"
    });

    await fs.writeFile(outFile, audio);
    return outFile;
  }
}

async function requestMiniMaxAudio({ text, voiceId, speed, pitch, volume, model }) {
  const response = await fetch(`${process.env.MINIMAX_BASE_URL ?? "https://api.minimax.io"}/v1/t2a_v2`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.MINIMAX_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      text,
      stream: false,
      language_boost: "Chinese",
      output_format: "hex",
      voice_setting: {
        voice_id: voiceId,
        speed: Number(speed),
        vol: Number(volume),
        pitch: Number(pitch)
      },
      audio_setting: {
        sample_rate: Number(process.env.MINIMAX_SAMPLE_RATE ?? 32000),
        bitrate: Number(process.env.MINIMAX_BITRATE ?? 128000),
        format: "mp3",
        channel: 1
      }
    })
  });

  if (!response.ok) {
    throw new Error(`MiniMax TTS request failed: ${response.status}`);
  }

  const data = await response.json();
  if (data.base_resp?.status_code !== 0) {
    throw new Error(`MiniMax TTS failed: ${data.base_resp?.status_msg ?? "unknown error"}`);
  }

  const audioHex = data.data?.audio;
  if (!audioHex) {
    throw new Error("MiniMax TTS returned no audio data.");
  }

  return Buffer.from(audioHex, "hex");
}

async function ensureWindowsVoiceFile(safeSegment, hash, text) {
  const outFile = path.join(generatedDir, `${safeSegment}-${hash}.wav`);
  try {
    await fs.access(outFile);
    return outFile;
  } catch {
    await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath, "-Text", text, "-OutFile", outFile],
      { windowsHide: true, timeout: 30000 }
    );

    return outFile;
  }
}
