import { analyzeTrackMetadata, listLocalTracks } from "./library.js";
import { getPlannerListenerProfile } from "./memory.js";
import { applyRoutineToSlot, getDailyRoutine } from "./routine.js";

const HOST_NAME = "Codio";
const SOURCE = "daily-planner-v1";
const MIN_TRACKS_PER_SLOT = 3;
const MAX_TRACKS_PER_SLOT = 5;

const slotTemplates = [
  {
    id: "morning-wake",
    timeRange: "07:00-09:00",
    title: "Morning Wake",
    scene: "morning",
    mood: "clear",
    energy: "low-to-medium",
    musicDirection: ["light-electronic", "mandarin-pop", "piano"],
    hostOpening: "A clean, gentle start with enough motion to wake the room up."
  },
  {
    id: "deep-work",
    timeRange: "09:00-12:00",
    title: "Deep Work",
    scene: "work",
    mood: "focused",
    energy: "medium",
    musicDirection: ["steady-groove", "light-electronic", "instrumental"],
    hostOpening: "A steady block for attention, with rhythm kept present but not pushy."
  },
  {
    id: "noon-breath",
    timeRange: "12:00-13:30",
    title: "Noon Breath",
    scene: "noon",
    mood: "warm",
    energy: "low",
    musicDirection: ["mandarin-pop", "acoustic", "relax"],
    hostOpening: "A softer pause for the middle of the day."
  },
  {
    id: "afternoon-drive",
    timeRange: "13:30-18:00",
    title: "Afternoon Drive",
    scene: "afternoon",
    mood: "steady",
    energy: "medium",
    musicDirection: ["rhythm-pop", "light-electronic", "city"],
    hostOpening: "A little more forward motion, still controlled enough to work beside."
  },
  {
    id: "evening-soften",
    timeRange: "18:00-21:00",
    title: "Evening Soften",
    scene: "evening",
    mood: "soft",
    energy: "low-to-medium",
    musicDirection: ["warm-vocal", "neo-classical", "chill"],
    hostOpening: "The room gets softer here, with warmer edges and less pressure."
  },
  {
    id: "night-close",
    timeRange: "21:00-00:00",
    title: "Night Close",
    scene: "night",
    mood: "quiet",
    energy: "low",
    musicDirection: ["late-night", "ambient", "piano"],
    hostOpening: "A quieter late-night close, keeping the signal near and restrained."
  }
];

const mockTrackLibrary = [
  mockTrack("mock-piano-love-story", "Piano Tribute Conservatory - Love Story", "Local Mock Library", {
    tags: ["piano", "instrumental", "relax", "warm"],
    energy: "low",
    sceneFit: ["morning", "noon", "evening", "night"],
    language: "instrumental"
  }),
  mockTrack("mock-morning-signal", "Morning Signal", "Local Mock Library", {
    tags: ["light-electronic", "clear", "morning"],
    energy: "low-to-medium",
    sceneFit: ["morning", "work"],
    language: "instrumental"
  }),
  mockTrack("mock-city-light", "City Light", "Local Mock Library", {
    tags: ["city", "rhythm-pop", "steady-groove"],
    energy: "medium",
    sceneFit: ["afternoon", "work"],
    language: "instrumental"
  }),
  mockTrack("mock-midnight-window", "Midnight Window", "Local Mock Library", {
    tags: ["ambient", "late-night", "relax"],
    energy: "low",
    sceneFit: ["night", "evening"],
    language: "instrumental"
  })
];

const listenerProfile = {
  preferredGenres: ["mandarin-pop", "light-electronic", "piano"],
  dislikedGenres: ["dense-vocal", "heavy-metal"],
  preferredEnergy: "medium",
  preferredLanguage: "chinese",
  recentFeedback: [
    { type: "more_like_this", tags: ["rainy-day", "relax"], score: 1 },
    { type: "less_like_this", tags: ["too-loud"], score: -1 }
  ]
};

const preferenceAliases = {
  "中文": ["mandarin-pop", "chinese", "warm-vocal"],
  "华语": ["mandarin-pop", "chinese", "warm-vocal"],
  "轻松": ["relax", "chill", "ambient", "warm"],
  "放松": ["relax", "chill", "ambient", "warm"],
  "轻音乐": ["instrumental", "piano", "acoustic", "neo-classical"],
  "钢琴": ["piano", "neo-classical", "instrumental"],
  "纯音乐": ["instrumental", "ambient", "piano"],
  "轻电子": ["light-electronic", "ambient", "chill"],
  "工作": ["steady-groove", "instrumental", "light-electronic"],
  "专注": ["steady-groove", "instrumental", "light-electronic"],
  "雨天": ["rainy-day", "relax", "ambient", "piano"],
  "高能": ["rhythm-pop", "city", "medium"],
  "少鼓点": ["ambient", "piano", "low"]
};

export function ensureDailyProgramStorage(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_programs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      weekday TEXT NOT NULL,
      host TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      source TEXT NOT NULL,
      plan_json TEXT NOT NULL
    );
  `);
}

export function getListenerProfile(db) {
  if (!db) return listenerProfile;

  try {
    return getPlannerListenerProfile(db, listenerProfile);
  } catch {
    return listenerProfile;
  }
}

export function getTrackLibrary() {
  const localTracks = safeListLocalTracks();
  if (localTracks.length === 0) return mockTrackLibrary;

  return localTracks.map(toPlannerTrack);
}

export function getOrCreateDailyPlan(db, date = todayDate()) {
  ensureDailyProgramStorage(db);
  const stored = readDailyPlan(db, date);
  if (stored) return stored;
  return regenerateDailyPlan(db, date);
}

export function regenerateDailyPlan(db, date = todayDate()) {
  ensureDailyProgramStorage(db);
  const plan = generateDailyPlan(getListenerProfile(db), getTrackLibrary(), date);
  writeDailyPlan(db, plan);
  return plan;
}

export function getCurrentSlot(plan, date = new Date()) {
  const minutes = date.getHours() * 60 + date.getMinutes();
  return (
    plan.slots.find((slot) => {
      const [start, end] = slot.timeRange.split("-").map(toMinutes);
      if (end === 0) return minutes >= start;
      return minutes >= start && minutes < end;
    }) ?? plan.slots[0]
  );
}

export function generateDailyPlan(profile, tracks, date = todayDate()) {
  const safeTracks = tracks.length > 0 ? tracks : mockTrackLibrary;
  const planDate = parseLocalDate(date);
  const planningProfile = enrichProfileForPlanning(profile);
  const routine = getDailyRoutine(date);
  const adaptedSlots = slotTemplates.map((slot) => applyRoutineToSlot(adaptSlotForProfile(slot, planningProfile), routine));
  const libraryAnalysis = analyzeLibrary(safeTracks);
  const runSeed = `${date}-${Date.now()}-${Math.random()}`;

  return {
    date,
    weekday: weekdayName(planDate),
    host: HOST_NAME,
    generatedAt: new Date().toISOString(),
    source: SOURCE,
    strategy: {
      name: "Local-first hybrid radio",
      playbackPriority: ["local-playable", "online-playable", "taste-reference"],
      activePlaybackSource: "local-playable",
      routineSource: routine.source,
      note: "Codio uses online playlists as taste data, but daily playback is built from playable local tracks first."
    },
    routine,
    libraryAnalysis,
    listenerProfile: summarizeProfile(planningProfile),
    slots: adaptedSlots.map((slot, index) => buildSlot(slot, planningProfile, safeTracks, libraryAnalysis, `${runSeed}-${index}`)),
    items: buildCompatItems(safeTracks)
  };
}

function buildSlot(slot, profile, tracks, libraryAnalysis, seed = slot.id) {
  const selectedTracks = selectTracksForSlot(slot, profile, tracks, seed);

  return {
    ...slot,
    playbackPolicy: "local-first",
    trackTarget: Math.min(MAX_TRACKS_PER_SLOT, Math.max(MIN_TRACKS_PER_SLOT, tracks.length)),
    librarySnapshot: {
      playableTrackCount: libraryAnalysis.trackCount,
      topTags: libraryAnalysis.tags.slice(0, 5),
      topScenes: libraryAnalysis.sceneFit.slice(0, 5)
    },
    reason: slotReason(slot, profile),
    tracks: selectedTracks.map(({ track, score, match }) => ({
      id: track.id,
      title: track.title,
      artist: track.artist || "Unknown",
      source: track.source ?? "local",
      playbackSource: track.playbackSource ?? "local-playable",
      availability: track.availability ?? "playable",
      audioUrl: track.audioUrl ?? `/api/audio/music/${track.id}`,
      audioSrc: track.audioUrl ?? `/api/audio/music/${track.id}`,
      tags: track.tags,
      energy: track.energy,
      sceneFit: track.sceneFit,
      language: track.language,
      score: roundScore(score),
      match,
      reason: trackReason(track, slot, match)
    }))
  };
}

function selectTracksForSlot(slot, profile, tracks, seed = slot.id) {
  const picked = [];
  const seen = new Set();
  const targetCount = Math.min(MAX_TRACKS_PER_SLOT, Math.max(MIN_TRACKS_PER_SLOT, tracks.length));

  const ranked = tracks
    .map((track, index) => {
      const scored = scoreTrackForSlot(track, slot, profile);
      return {
        track,
        score: scored.score - index * 0.01 + seededNoise(`${seed}-${track.id}`) * 6,
        match: scored.match
      };
    })
    .sort((left, right) => right.score - left.score);

  for (const item of ranked) {
    const key = item.track.title.toLowerCase().replace(/\s+/g, " ").trim();
    if (seen.has(key)) continue;
    picked.push(item);
    seen.add(key);
    if (picked.length >= targetCount) break;
  }

  return picked;
}

function seededNoise(value) {
  let hash = 2166136261;
  const input = String(value);

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) / 4294967295;
}

function scoreTrackForSlot(track, slot, profile) {
  let score = 0;
  const match = {
    scene: false,
    time: false,
    direction: [],
    preferred: [],
    disliked: [],
    energy: false,
    language: false,
    feedback: 0,
    source: false
  };

  if (track.sceneFit?.includes(slot.scene)) {
    score += 12;
    match.scene = true;
  }

  if (track.sceneFit?.includes(sceneFromSlot(slot.id))) {
    score += 4;
    match.time = true;
  }

  const energyScore = scoreEnergy(track.energy, slot.energy, profile.preferredEnergy);
  score += energyScore;
  match.energy = energyScore > 0;

  const directionMatches = intersection(track.tags, slot.musicDirection);
  score += directionMatches.length * 5;
  match.direction = directionMatches;

  const preferredMatches = intersection(trackSignals(track), profile.planningPreferredTags ?? profile.preferredGenres ?? []);
  score += preferredMatches.length * 4;
  match.preferred = preferredMatches;

  const dislikedMatches = intersection(trackSignals(track), profile.planningDislikedTags ?? profile.dislikedGenres ?? []);
  score -= dislikedMatches.length * 12;
  match.disliked = dislikedMatches;

  if (matchesLanguage(track.language, profile.preferredLanguage)) {
    score += 3;
    match.language = true;
  }

  const feedbackScore = scoreFeedback(track, slot, profile);
  score += feedbackScore;
  match.feedback = feedbackScore;

  if ((track.playbackSource ?? track.source ?? "").toLowerCase().includes("local")) {
    score += 8;
    match.source = true;
  }

  return { score, match };
}

function adaptSlotForProfile(slot, profile) {
  const preferred = profile.planningPreferredTags ?? profile.preferredGenres ?? [];
  const disliked = new Set(profile.planningDislikedTags ?? profile.dislikedGenres ?? []);
  const favoriteScenes = profile.memoryProfile?.favoriteScenes?.map((item) => item.name) ?? [];
  const avoidedScenes = profile.memoryProfile?.avoidedScenes?.map((item) => item.name) ?? [];
  const shouldLeanIn = favoriteScenes.includes(slot.scene);
  const shouldHoldBack = avoidedScenes.includes(slot.scene);
  const preferredDirections = preferred.filter((tag) => !disliked.has(tag)).slice(0, shouldLeanIn ? 3 : 2);
  const musicDirection = unique([...slot.musicDirection, ...preferredDirections]);

  return {
    ...slot,
    musicDirection,
    energy: adaptSlotEnergy(slot.energy, profile.preferredEnergy, shouldLeanIn, shouldHoldBack),
    hostOpening: personalizeHostOpening(slot, profile, preferredDirections, shouldLeanIn, shouldHoldBack),
    preferenceTuning: {
      preferredDirections,
      dislikedDirections: [...disliked].slice(0, 6),
      favoriteSceneBoost: shouldLeanIn,
      avoidedSceneSoftening: shouldHoldBack,
      feedbackCount: profile.memoryProfile?.feedbackCount ?? 0
    }
  };
}

function analyzeLibrary(tracks) {
  const tagCounts = new Map();
  const energyCounts = new Map();
  const sceneCounts = new Map();
  const languageCounts = new Map();
  const sourceCounts = new Map();

  for (const track of tracks) {
    for (const tag of track.tags ?? []) addCount(tagCounts, tag);
    addCount(energyCounts, track.energy);
    addCount(languageCounts, track.language);
    addCount(sourceCounts, track.source);
    for (const scene of track.sceneFit ?? []) addCount(sceneCounts, scene);
  }

  return {
    trackCount: tracks.length,
    tags: rankedCounts(tagCounts),
    energy: rankedCounts(energyCounts),
    sceneFit: rankedCounts(sceneCounts),
    language: rankedCounts(languageCounts),
    source: rankedCounts(sourceCounts)
  };
}

function summarizeProfile(profile) {
  return {
    preferredGenres: profile.preferredGenres ?? [],
    dislikedGenres: profile.dislikedGenres ?? [],
    planningPreferredTags: profile.planningPreferredTags ?? [],
    planningDislikedTags: profile.planningDislikedTags ?? [],
    preferredEnergy: profile.preferredEnergy,
    preferredLanguage: profile.preferredLanguage,
    feedbackCount: profile.memoryProfile?.feedbackCount ?? 0,
    preferredDirections: profile.memoryProfile?.preferredDirections ?? [],
    dislikedDirections: profile.memoryProfile?.dislikedDirections ?? [],
    favoriteScenes: profile.memoryProfile?.favoriteScenes ?? []
  };
}

function slotReason(slot, profile) {
  if (slot.routineContext) {
    return `${slot.routineContext.label}: ${slot.routineContext.intent} ${slot.routineContext.musicIntent}`;
  }

  const avoided = (profile.dislikedGenres ?? []).slice(0, 3);
  const avoidText = avoided.length ? ` while avoiding ${avoided.join(", ")}` : "";
  return `${slot.title} is tuned for ${slot.scene}, ${slot.energy} energy, and ${slot.musicDirection.join(" / ")}${avoidText}. Codio will choose playable local tracks first, then treat online playlist songs as taste reference.`;
}

function trackReason(track, slot, match) {
  const localNote = match.source ? " It is already in the playable local library." : "";

  if (match.feedback > 0) {
    return `Picked because your feedback favors ${match.preferred.concat(match.direction).slice(0, 2).join(" / ") || "this direction"}.${localNote}`;
  }
  if (match.scene) {
    return `Fits the ${slot.scene} scene and keeps the slot energy at ${slot.energy}.${localNote}`;
  }
  if (match.direction.length > 0) {
    return `Matches the slot direction: ${match.direction.join(" / ")}.${localNote}`;
  }
  return `A local-first fallback pick that keeps this slot coherent.${localNote}`;
}

function enrichProfileForPlanning(profile) {
  const preferredGenres = profile.preferredGenres ?? [];
  const dislikedGenres = profile.dislikedGenres ?? [];
  const preferredTags = profile.memoryProfile?.preferredTags?.map((item) => item.name) ?? [];
  const dislikedTags = profile.memoryProfile?.dislikedTags?.map((item) => item.name) ?? [];
  const preferredDirections = profile.memoryProfile?.preferredDirections?.map((item) => item.name) ?? [];
  const dislikedDirections = profile.memoryProfile?.dislikedDirections?.map((item) => item.name) ?? [];

  return {
    ...profile,
    planningPreferredTags: unique(expandPreferenceTags([...preferredTags, ...preferredDirections, ...preferredGenres])),
    planningDislikedTags: unique(expandPreferenceTags([...dislikedTags, ...dislikedDirections, ...dislikedGenres]))
  };
}

function buildCompatItems(tracks) {
  return tracks.slice(0, 3).map((track, index) => ({
    id: `planned-track-${index + 1}`,
    type: "music",
    title: track.title,
    artist: track.artist || "Unknown",
    durationSeconds: 180,
    mood: track.tags?.[0] ?? "planned",
    audioFormat: track.format ?? "LOCAL",
    audioUrl: track.audioUrl ?? `/api/audio/music/${track.id ?? encodeURIComponent(track.title.toLowerCase().replace(/[^a-z0-9]+/g, "-"))}`
  }));
}

function readDailyPlan(db, date) {
  const row = db.prepare("SELECT plan_json FROM daily_programs WHERE date = ? LIMIT 1").get(date);
  if (!row) return null;
  try {
    const plan = JSON.parse(row.plan_json);
    return isCurrentPlanShape(plan) ? plan : null;
  } catch {
    return null;
  }
}

function writeDailyPlan(db, plan) {
  db
    .prepare(
      `INSERT INTO daily_programs (date, weekday, host, generated_at, source, plan_json)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(date) DO UPDATE SET
         weekday = excluded.weekday,
         host = excluded.host,
         generated_at = excluded.generated_at,
         source = excluded.source,
         plan_json = excluded.plan_json`
    )
    .run(plan.date, plan.weekday, plan.host, plan.generatedAt, plan.source, JSON.stringify(plan));
}

function isCurrentPlanShape(plan) {
  return Boolean(
    plan &&
      plan.source === SOURCE &&
      plan.strategy &&
      plan.libraryAnalysis &&
      plan.listenerProfile &&
      Array.isArray(plan.slots) &&
      plan.slots.every(
        (slot) =>
          Array.isArray(slot.tracks) &&
          slot.tracks.every((track) => Array.isArray(track.tags) && typeof track.audioUrl === "string")
      )
  );
}

function safeListLocalTracks() {
  try {
    return listLocalTracks();
  } catch {
    return [];
  }
}

function toPlannerTrack(track) {
  const analysis = analyzeTrackMetadata(track);
  return {
    id: track.id,
    title: track.title,
    artist: track.artist || "Unknown",
    format: track.format,
    audioUrl: `/api/audio/music/${track.id}`,
    source: analysis.source,
    playbackSource: "local-playable",
    availability: "playable",
    tags: analysis.tags,
    energy: analysis.energy,
    sceneFit: analysis.sceneFit,
    language: analysis.language
  };
}

function mockTrack(id, title, artist, analysis) {
  return {
    id,
    title,
    artist,
    format: "WAV",
    audioUrl: `/api/audio/music/${id.replace(/^mock-/, "")}`,
    source: "local-mock",
    playbackSource: "mock-local",
    availability: "mock-playable",
    ...analysis
  };
}

function scoreEnergy(trackEnergy, slotEnergy, preferredEnergy) {
  if (trackEnergy === slotEnergy) return 6;
  if (slotEnergy === "low-to-medium" && ["low", "medium"].includes(trackEnergy)) return 4;
  if (trackEnergy === preferredEnergy) return 3;
  if (preferredEnergy === "low-to-medium" && ["low", "medium"].includes(trackEnergy)) return 2;
  return 0;
}

function scoreFeedback(track, slot, profile) {
  return (profile.recentFeedback ?? []).reduce((sum, feedback) => {
    const weight = Math.abs(Number(feedback.score ?? 1)) || 1;
    const tagOverlap = overlap(trackSignals(track), expandPreferenceTags(feedback.tags ?? []));
    const sceneOverlap = feedback.scene && track.sceneFit?.includes(feedback.scene) ? 1 : 0;
    const slotOverlap = feedback.scene === slot.scene ? 1 : 0;
    const value = (tagOverlap * 3 + sceneOverlap * 2 + slotOverlap) * weight;

    if (["like", "more_like_this"].includes(feedback.type)) return sum + value;
    if (["dislike", "less_like_this"].includes(feedback.type)) return sum - value;
    return sum;
  }, 0);
}

function adaptSlotEnergy(slotEnergy, preferredEnergy, shouldLeanIn, shouldHoldBack) {
  if (shouldHoldBack) return slotEnergy === "high" ? "medium" : slotEnergy;
  if (!shouldLeanIn || !preferredEnergy) return slotEnergy;
  if (slotEnergy === preferredEnergy) return slotEnergy;
  if (slotEnergy === "low-to-medium" && ["low", "medium"].includes(preferredEnergy)) return slotEnergy;
  return preferredEnergy;
}

function matchesLanguage(trackLanguage, preferredLanguage) {
  if (!preferredLanguage) return false;
  const normalized = String(preferredLanguage).toLowerCase();
  return trackLanguage === normalized || (normalized === "中文" && trackLanguage === "chinese");
}

function sceneFromSlot(slotId) {
  if (slotId.includes("morning")) return "morning";
  if (slotId.includes("work")) return "work";
  if (slotId.includes("noon")) return "noon";
  if (slotId.includes("afternoon")) return "afternoon";
  if (slotId.includes("evening")) return "evening";
  if (slotId.includes("night")) return "night";
  return "daily";
}

function intersection(left = [], right = []) {
  const rightSet = new Set(right);
  return left.filter((item) => rightSet.has(item));
}

function expandPreferenceTags(tags = []) {
  return tags.flatMap((tag) => {
    const value = String(tag).trim();
    return [value, ...(preferenceAliases[value] ?? [])];
  }).filter(Boolean);
}

function trackSignals(track) {
  return unique([
    ...(track.tags ?? []),
    ...(track.sceneFit ?? []),
    track.energy,
    track.language,
    track.source
  ]);
}

function personalizeHostOpening(slot, profile, preferredDirections, shouldLeanIn, shouldHoldBack) {
  const feedbackCount = profile.memoryProfile?.feedbackCount ?? 0;
  if (feedbackCount === 0) return slot.hostOpening;

  const preferredText = preferredDirections.slice(0, 2).join(" / ");
  if (shouldHoldBack) {
    return `${slot.hostOpening} I heard the parts you want less of, so this block keeps the pressure down and leaves more air around the songs.`;
  }
  if (shouldLeanIn && preferredText) {
    return `${slot.hostOpening} I am leaning into your recent taste for ${preferredText}, keeping this hour closer to the texture you have been choosing.`;
  }
  if (preferredText) {
    return `${slot.hostOpening} I will thread a little of your recent ${preferredText} preference through this slot without letting it take over.`;
  }
  return slot.hostOpening;
}

function overlap(left = [], right = []) {
  return intersection(left, right).length;
}

function addCount(map, name) {
  if (!name) return;
  map.set(name, (map.get(name) ?? 0) + 1);
}

function rankedCounts(map) {
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function roundScore(score) {
  return Math.round(score * 100) / 100;
}

function toMinutes(time) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function todayDate() {
  const date = new Date();
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function parseLocalDate(date) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function weekdayName(date) {
  return date.toLocaleDateString("en-US", { weekday: "long" });
}
