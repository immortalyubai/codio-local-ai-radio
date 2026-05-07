const positiveFeedbackTypes = new Set(["like", "more_like_this"]);
const negativeFeedbackTypes = new Set(["dislike", "less_like_this"]);

export function ensureMemoryStorage(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS listener_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id TEXT,
      feedback_type TEXT NOT NULL,
      user_message TEXT,
      host_reply TEXT,
      slot_id TEXT,
      slot_title TEXT,
      track_title TEXT,
      track_artist TEXT,
      track_source TEXT,
      music_direction_json TEXT,
      scene TEXT,
      mood TEXT,
      created_at TEXT NOT NULL
    );
  `);

  ensureColumn(db, "listener_feedback", "track_tags_json", "TEXT");
  ensureColumn(db, "listener_feedback", "track_energy", "TEXT");
  ensureColumn(db, "listener_feedback", "track_scene_fit_json", "TEXT");
  ensureColumn(db, "listener_feedback", "track_language", "TEXT");
}

export function saveListenerFeedback(db, input) {
  ensureMemoryStorage(db);
  const feedback = normalizeFeedbackInput(input);

  db
    .prepare(
      `INSERT INTO listener_feedback (
        message_id,
        feedback_type,
        user_message,
        host_reply,
        slot_id,
        slot_title,
        track_title,
        track_artist,
        track_source,
        track_tags_json,
        track_energy,
        track_scene_fit_json,
        track_language,
        music_direction_json,
        scene,
        mood,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      feedback.messageId,
      feedback.feedbackType,
      feedback.userMessage,
      feedback.hostReply,
      feedback.slotId,
      feedback.slotTitle,
      feedback.track.title,
      feedback.track.artist,
      feedback.track.source,
      JSON.stringify(feedback.track.tags),
      feedback.track.energy,
      JSON.stringify(feedback.track.sceneFit),
      feedback.track.language,
      JSON.stringify(feedback.musicDirection),
      feedback.scene,
      feedback.mood,
      feedback.createdAt
    );

  return feedback;
}

export function getMemoryProfile(db) {
  ensureMemoryStorage(db);
  const rows = db
    .prepare(
      `SELECT
         feedback_type,
         music_direction_json,
         scene,
         mood,
         track_title,
         track_source,
         track_tags_json,
         track_energy,
         track_scene_fit_json,
         track_language,
         created_at
       FROM listener_feedback
       ORDER BY created_at ASC`
    )
    .all();

  const directionScores = new Map();
  const sceneScores = new Map();
  const tagScores = new Map();
  const energyScores = new Map();
  const languageScores = new Map();
  const sourceScores = new Map();
  const trackScores = new Map();
  let lastUpdated = null;

  for (const row of rows) {
    const score = scoreForFeedback(row.feedback_type);
    const positive = positiveFeedbackTypes.has(row.feedback_type);
    const directions = parseList(row.music_direction_json);
    const tags = parseList(row.track_tags_json);
    const sceneFit = parseList(row.track_scene_fit_json);
    const weightedSceneScore = positive ? Math.abs(score) : -Math.abs(score);

    for (const direction of directions) addScore(directionScores, direction, score);
    for (const tag of tags) addScore(tagScores, tag, score);
    for (const scene of sceneFit) addScore(sceneScores, scene, weightedSceneScore * 0.7);

    if (row.scene) addScore(sceneScores, row.scene, weightedSceneScore);
    if (row.mood) addScore(directionScores, row.mood, score * 0.5);
    if (row.track_energy) addScore(energyScores, row.track_energy, score);
    if (row.track_language) addScore(languageScores, row.track_language, score);
    if (row.track_source) addScore(sourceScores, row.track_source, score);
    if (row.track_title) addScore(trackScores, row.track_title, score);
    if (!lastUpdated || row.created_at > lastUpdated) lastUpdated = row.created_at;
  }

  return {
    preferredDirections: scoredItems(directionScores, (score) => score > 0),
    dislikedDirections: scoredItems(directionScores, (score) => score < 0),
    preferredTags: scoredItems(tagScores, (score) => score > 0),
    dislikedTags: scoredItems(tagScores, (score) => score < 0),
    favoriteScenes: scoredItems(sceneScores, (score) => score > 0),
    avoidedScenes: scoredItems(sceneScores, (score) => score < 0),
    preferredEnergy: topPositiveName(energyScores),
    dislikedEnergy: scoredItems(energyScores, (score) => score < 0),
    preferredLanguage: topPositiveName(languageScores),
    preferredSources: scoredItems(sourceScores, (score) => score > 0),
    dislikedSources: scoredItems(sourceScores, (score) => score < 0),
    favoriteTracks: scoredItems(trackScores, (score) => score > 0),
    dislikedTracks: scoredItems(trackScores, (score) => score < 0),
    feedbackCount: rows.length,
    lastUpdated
  };
}

export function getPlannerListenerProfile(db, fallbackProfile) {
  const memoryProfile = getMemoryProfile(db);
  if (memoryProfile.feedbackCount === 0) return fallbackProfile;

  return {
    ...fallbackProfile,
    preferredGenres: unique([
      ...memoryProfile.preferredTags.map((item) => item.name),
      ...memoryProfile.preferredDirections.map((item) => item.name),
      ...(fallbackProfile.preferredGenres ?? [])
    ]),
    dislikedGenres: unique([
      ...memoryProfile.dislikedTags.map((item) => item.name),
      ...memoryProfile.dislikedDirections.map((item) => item.name),
      ...(fallbackProfile.dislikedGenres ?? [])
    ]),
    preferredEnergy: memoryProfile.preferredEnergy ?? fallbackProfile.preferredEnergy,
    preferredLanguage: memoryProfile.preferredLanguage ?? fallbackProfile.preferredLanguage,
    recentFeedback: [
      ...memoryProfile.preferredTags.map((item) => ({
        type: "more_like_this",
        tags: [item.name],
        score: item.score
      })),
      ...memoryProfile.dislikedTags.map((item) => ({
        type: "less_like_this",
        tags: [item.name],
        score: item.score
      })),
      ...memoryProfile.favoriteScenes.map((item) => ({
        type: "more_like_this",
        tags: [],
        scene: item.name,
        score: item.score
      })),
      ...memoryProfile.avoidedScenes.map((item) => ({
        type: "less_like_this",
        tags: [],
        scene: item.name,
        score: item.score
      })),
      ...(fallbackProfile.recentFeedback ?? [])
    ],
    memoryProfile
  };
}

function normalizeFeedbackInput(input) {
  const body = input && typeof input === "object" ? input : {};
  const feedbackType = normalizeFeedbackType(body.feedbackType);
  const track = body.track && typeof body.track === "object" ? body.track : {};

  return {
    messageId: stringOrNull(body.messageId),
    feedbackType,
    userMessage: stringOrNull(body.userMessage),
    hostReply: stringOrNull(body.hostReply),
    slotId: stringOrNull(body.slotId),
    slotTitle: stringOrNull(body.slotTitle),
    track: {
      title: stringOrNull(track.title),
      artist: stringOrNull(track.artist),
      source: stringOrNull(track.source) ?? "local",
      tags: stringList(track.tags),
      energy: stringOrNull(track.energy),
      sceneFit: stringList(track.sceneFit),
      language: stringOrNull(track.language)
    },
    musicDirection: Array.isArray(body.musicDirection)
      ? body.musicDirection.map((item) => String(item).trim()).filter(Boolean)
      : [],
    scene: stringOrNull(body.scene),
    mood: stringOrNull(body.mood),
    createdAt: stringOrNull(body.createdAt) ?? new Date().toISOString()
  };
}

function normalizeFeedbackType(type) {
  const value = typeof type === "string" ? type.trim() : "";
  if ([...positiveFeedbackTypes, ...negativeFeedbackTypes].includes(value)) return value;
  return "like";
}

function scoreForFeedback(type) {
  if (type === "more_like_this") return 2;
  if (type === "like") return 1;
  if (type === "dislike") return -1;
  if (type === "less_like_this") return -2;
  return 0;
}

function parseList(value) {
  try {
    const parsed = JSON.parse(value ?? "[]");
    return Array.isArray(parsed) ? parsed.map((item) => String(item).trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function addScore(map, name, score) {
  if (!name) return;
  map.set(name, (map.get(name) ?? 0) + score);
}

function scoredItems(map, predicate) {
  return [...map.entries()]
    .filter(([, score]) => predicate(score))
    .map(([name, score]) => ({ name, score: roundScore(score) }))
    .sort((left, right) => Math.abs(right.score) - Math.abs(left.score) || left.name.localeCompare(right.name));
}

function topPositiveName(map) {
  return scoredItems(map, (score) => score > 0)[0]?.name ?? null;
}

function stringOrNull(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringList(value) {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function roundScore(score) {
  return Math.round(score * 100) / 100;
}

function ensureColumn(db, tableName, columnName, columnType) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (columns.some((column) => column.name === columnName)) return;
  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`);
}
