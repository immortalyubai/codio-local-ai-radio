import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { createHostScripts, createHostScriptsWithAI, getDaypartProfile } from "./hostCopy.js";
import { listLocalTracks } from "./library.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../../..");
const dataDir = path.join(rootDir, "data");
const dbPath = path.join(dataDir, "radio.sqlite");

const mockMusicItems = [
  {
    id: "track-morning-signal",
    type: "music",
    title: "Morning Signal",
    artist: "Local Mock Library",
    durationSeconds: 8,
    mood: "morning",
    audioFormat: "WAV",
    audioUrl: "/api/audio/music/morning-signal"
  },
  {
    id: "track-city-light",
    type: "music",
    title: "City Light",
    artist: "Local Mock Library",
    durationSeconds: 9,
    mood: "drive",
    audioFormat: "WAV",
    audioUrl: "/api/audio/music/city-light"
  },
  {
    id: "track-midnight-window",
    type: "music",
    title: "Midnight Window",
    artist: "Local Mock Library",
    durationSeconds: 10,
    mood: "midnight",
    audioFormat: "WAV",
    audioUrl: "/api/audio/music/midnight-window"
  }
];

function buildTodayProgram({ randomize = false } = {}) {
  const profile = getDaypartProfile();
  const localTracks = listLocalTracks();
  const selectedTracks = selectTracksForProfile(localTracks, profile, randomize);
  const localMusicItems = selectedTracks
    .map((track) => ({
      id: `track-${track.id}`,
      type: "music",
      title: track.title,
      artist: track.artist,
      durationSeconds: track.durationSeconds,
      audioFormat: track.format,
      mood: track.mood,
      audioUrl: `/api/audio/music/${track.id}`
    }));

  const musicItems = localMusicItems.length > 0 ? localMusicItems : mockMusicItems;
  const hostScripts = createHostScripts(musicItems, profile);

  return {
    date: new Date().toISOString().slice(0, 10),
    title: profile.title,
    host: "Oren",
    daypart: profile.daypart,
    mood: profile.label,
    description:
      localMusicItems.length > 0
        ? profile.description
        : `${profile.description} No local tracks are available, so local mock audio is used.`,
    items: buildProgramItems(musicItems, hostScripts)
  };
}

async function buildTodayProgramAsync({ randomize = false } = {}) {
  const profile = getDaypartProfile();
  const localTracks = listLocalTracks();
  const selectedTracks = selectTracksForProfile(localTracks, profile, randomize);
  const localMusicItems = selectedTracks.map((track) => ({
    id: `track-${track.id}`,
    type: "music",
    title: track.title,
    artist: track.artist,
    durationSeconds: track.durationSeconds,
    audioFormat: track.format,
    mood: track.mood,
    audioUrl: `/api/audio/music/${track.id}`
  }));

  const musicItems = localMusicItems.length > 0 ? localMusicItems : mockMusicItems;
  const hostScripts = await createHostScriptsWithAI(musicItems, profile);

  return {
    date: todayDate(),
    title: profile.title,
    host: "Oren",
    daypart: profile.daypart,
    mood: profile.label,
    description:
      localMusicItems.length > 0
        ? profile.description
        : `${profile.description} No local tracks are available, so local mock audio is used.`,
    items: buildProgramItems(musicItems, hostScripts)
  };
}

export function openDatabase() {
  fs.mkdirSync(dataDir, { recursive: true });
  let db;

  try {
    db = new DatabaseSync(dbPath);
    initializeDatabase(db);
  } catch (error) {
    console.warn("Unable to open local SQLite database; using in-memory mock database.", error);
    db = new DatabaseSync(":memory:");
    initializeDatabase(db);
  }

  try {
    seedToday(db);
  } catch (error) {
    console.warn("Unable to seed today's program database; local mock fallback will be used.", error);
  }
  return db;
}

function initializeDatabase(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS programs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      program_date TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      host TEXT NOT NULL,
      description TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS program_items (
      id TEXT PRIMARY KEY,
      program_date TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      artist TEXT NOT NULL,
      duration_seconds INTEGER NOT NULL,
      script TEXT,
      audio_format TEXT,
      audio_url TEXT NOT NULL,
      sort_order INTEGER NOT NULL
    );
  `);
  ensureColumn(db, "programs", "daypart", "TEXT");
  ensureColumn(db, "programs", "mood", "TEXT");
  ensureColumn(db, "program_items", "audio_format", "TEXT");
  ensureColumn(db, "program_items", "mood", "TEXT");
}

export function getTodayProgram(db) {
  try {
    let program = db
      .prepare("SELECT program_date, title, host, description, daypart, mood FROM programs WHERE program_date = ? LIMIT 1")
      .get(todayDate());

    if (!program) {
      seedToday(db);
      program = db
        .prepare("SELECT program_date, title, host, description, daypart, mood FROM programs WHERE program_date = ? LIMIT 1")
        .get(todayDate());
    }

    if (!program) {
      return buildTodayProgram();
    }

    const items = db
      .prepare(
        `SELECT id, type, title, artist, duration_seconds, script, audio_format, mood, audio_url
         FROM program_items
         WHERE program_date = ?
         ORDER BY sort_order ASC`
      )
      .all(program.program_date);

    return {
      date: program.program_date,
      title: program.title,
      host: program.host,
      description: program.description,
      daypart: program.daypart ?? "midnight",
      mood: program.mood ?? "Midnight Radio",
      items: items.map((item) => ({
        id: item.id,
        type: item.type,
        title: item.title,
        artist: item.artist,
        durationSeconds: item.duration_seconds,
        script: item.script,
        audioFormat: item.audio_format,
        mood: item.mood,
        audioUrl: item.audio_url
      }))
    };
  } catch (error) {
    console.warn("Unable to read today's program database; returning local mock program.", error);
    return buildTodayProgram();
  }
}

export function getLatestProgram(db) {
  const program = db
    .prepare("SELECT program_date, title, host, description, daypart, mood FROM programs ORDER BY program_date DESC LIMIT 1")
    .get();

  if (!program) {
    return null;
  }

  const items = db
    .prepare(
      `SELECT id, type, title, artist, duration_seconds, script, audio_format, mood, audio_url
       FROM program_items
       WHERE program_date = ?
       ORDER BY sort_order ASC`
    )
    .all(program.program_date);

  return {
    date: program.program_date,
    title: program.title,
    host: program.host,
    description: program.description,
    daypart: program.daypart ?? "midnight",
    mood: program.mood ?? "Midnight Radio",
    items: items.map((item) => ({
      id: item.id,
      type: item.type,
      title: item.title,
      artist: item.artist,
      durationSeconds: item.duration_seconds,
      script: item.script,
      audioFormat: item.audio_format,
      mood: item.mood,
      audioUrl: item.audio_url
    }))
  };
}

export function getVoiceScript(db, segment, itemId) {
  if (typeof itemId === "string" && itemId.trim()) {
    try {
      const item = db
        .prepare("SELECT script FROM program_items WHERE id = ? AND program_date = ? AND type = 'voice' LIMIT 1")
        .get(itemId.trim(), todayDate());
      if (item?.script) return item.script;
    } catch {
      return "Welcome to your local AI radio.";
    }
  }

  const itemIdBySegment = {
    opening: "host-opening",
    break1: "host-break-1",
    break2: "host-break-2",
    weather: "host-break-1",
    closing: "host-closing"
  };

  const id = itemIdBySegment[segment] ?? itemIdBySegment.opening;
  try {
    const item = db.prepare("SELECT script FROM program_items WHERE id = ? AND program_date = ? LIMIT 1").get(id, todayDate());
    return item?.script ?? "Welcome to your local AI radio.";
  } catch {
    return "Welcome to your local AI radio.";
  }
}

export function getVoiceSegments(db) {
  try {
    return db
      .prepare(
        `SELECT id, script
         FROM program_items
         WHERE program_date = ? AND type = 'voice' AND script IS NOT NULL
         ORDER BY sort_order ASC`
      )
      .all(todayDate())
      .map(toVoiceSegment);
  } catch {
    return buildTodayProgram().items.filter((item) => item.type === "voice").map(toVoiceSegment);
  }
}

export function generateTodayProgram(db) {
  throw new Error("Use generateTodayProgramAsync instead.");
}

export async function generateTodayProgramAsync(db) {
  const todayProgram = await buildTodayProgramAsync({ randomize: true });

  try {
    writeProgram(db, todayProgram);
    return getTodayProgram(db);
  } catch (error) {
    console.warn("Unable to write generated program database; returning local mock program.", error);
    return todayProgram;
  }
}

function seedToday(db) {
  const profile = getDaypartProfile();
  const existing = db.prepare("SELECT daypart FROM programs WHERE program_date = ? LIMIT 1").get(todayDate());
  if (existing && existing.daypart === profile.daypart && hasCurrentQueueShape(db)) return;

  const localTracks = listLocalTracks();
  const selectedTracks = selectTracksForProfile(localTracks, profile, false);
  const localMusicItems = selectedTracks.map((track) => ({
    id: `track-${track.id}`,
    type: "music",
    title: track.title,
    artist: track.artist,
    durationSeconds: track.durationSeconds,
    audioFormat: track.format,
    mood: track.mood,
    audioUrl: `/api/audio/music/${track.id}`
  }));
  const musicItems = localMusicItems.length > 0 ? localMusicItems : mockMusicItems;
  const hostScripts = createHostScripts(musicItems, profile);
  writeProgram(db, {
    date: todayDate(),
    title: profile.title,
    host: "Oren",
    daypart: profile.daypart,
    mood: profile.label,
    description:
      localMusicItems.length > 0
        ? profile.description
        : `${profile.description} No local tracks are available, so local mock audio is used.`,
    items: buildProgramItems(musicItems, hostScripts)
  });
}

function hasCurrentQueueShape(db) {
  const items = db
    .prepare(
      `SELECT type
       FROM program_items
       WHERE program_date = ?
       ORDER BY sort_order ASC`
    )
    .all(todayDate());

  if (items.length !== 7 || items[0].type !== "voice" || items[items.length - 1].type !== "voice") return false;
  return items.every((item, index) => item.type === (index % 2 === 0 ? "voice" : "music"));
}

function writeProgram(db, todayProgram) {
  const insertProgram = db.prepare(
    `INSERT INTO programs (program_date, title, host, description, daypart, mood)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(program_date) DO UPDATE SET
       title = excluded.title,
       host = excluded.host,
       description = excluded.description,
       daypart = excluded.daypart,
       mood = excluded.mood`
  );

  const deleteItems = db.prepare("DELETE FROM program_items");
  const insertItem = db.prepare(
    `INSERT INTO program_items (
      id, program_date, type, title, artist, duration_seconds, script, audio_format, mood, audio_url, sort_order
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )`
  );

  db.exec("BEGIN");
  try {
    insertProgram.run(
      todayProgram.date,
      todayProgram.title,
      todayProgram.host,
      todayProgram.description,
      todayProgram.daypart ?? null,
      todayProgram.mood ?? null
    );
    deleteItems.run();
    todayProgram.items.forEach((item, index) => {
      insertItem.run(
        item.id,
        todayProgram.date,
        item.type,
        item.title,
        item.artist,
        item.durationSeconds,
        item.script ?? null,
        item.audioFormat ?? null,
        item.mood ?? null,
        item.audioUrl,
        index
      );
    });
    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // The original write error is more useful than a rollback failure.
    }
    throw error;
  }
}

function buildProgramItems(musicItems, hostScripts) {
  const breaks = Array.isArray(hostScripts.breaks) ? hostScripts.breaks : [hostScripts.break].filter(Boolean);
  const items = [];

  musicItems.slice(0, 3).forEach((track, index) => {
    const isOpening = index === 0;
    const breakIndex = index;
    const segment = isOpening ? "opening" : `break${breakIndex}`;
    const voiceId = isOpening ? `host-opening-for-${track.id}` : `host-break-${breakIndex}-for-${track.id}`;

    items.push({
      id: voiceId,
      type: "voice",
      title: isOpening ? `推荐：${track.title}` : `下一首：${track.title}`,
      artist: "Oren",
      durationSeconds: isOpening ? 12 : 10,
      audioFormat: "MP3",
      mood: "host",
      script: isOpening ? hostScripts.opening : breaks[index - 1] ?? breaks[0] ?? "下一首歌，慢慢来。",
      audioUrl: `/api/audio/host-intro?segment=${segment}&itemId=${encodeURIComponent(voiceId)}`
    });

    items.push(track);
  });

  items.push({
    id: "host-closing",
    type: "voice",
    title: "Closing Signal",
    artist: "Oren",
    durationSeconds: 8,
    audioFormat: "MP3",
    mood: "host",
    script: hostScripts.closing,
    audioUrl: "/api/audio/host-intro?segment=closing"
  });

  return items;
}
function selectTracksForProfile(tracks, profile, randomize) {
  const source = randomize ? shuffle(tracks) : [...tracks];
  const scored = source
    .map((track, index) => ({
      track,
      score: scoreTrack(track, profile) - index * 0.001
    }))
    .sort((left, right) => right.score - left.score)
    .map(({ track }) => track);

  const selected = [];
  const seenTitles = new Set();

  for (const track of scored) {
    const titleKey = track.title.toLowerCase().replace(/\s+/g, " ").trim();
    if (seenTitles.has(titleKey)) continue;
    selected.push(track);
    seenTitles.add(titleKey);
    if (selected.length >= 3) break;
  }

  if (selected.length < 3) {
    for (const track of scored) {
      if (selected.some((item) => item.id === track.id)) continue;
      selected.push(track);
      if (selected.length >= 3) break;
    }
  }

  return selected;
}

function scoreTrack(track, profile) {
  const moodIndex = profile.preferredMoods.indexOf(track.mood);
  return moodIndex === -1 ? 0 : 10 - moodIndex;
}

function shuffle(items) {
  return [...items]
    .map((item) => ({ item, sort: Math.random() }))
    .sort((left, right) => left.sort - right.sort)
    .map(({ item }) => item);
}

function todayDate() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toVoiceSegment(item) {
  return {
    id: item.id,
    segment: item.id,
    script: item.script
  };
}

function ensureColumn(db, tableName, columnName, columnType) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (columns.some((column) => column.name === columnName)) return;
  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`);
}
