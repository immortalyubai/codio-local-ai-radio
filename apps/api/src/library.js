import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../../..");
export const audioDir = path.join(rootDir, "audio");
const trackOverridesPath = path.join(rootDir, "data", "track-overrides.json");
const defaultExternalDirs = [
  path.join(rootDir, "VipSongsDownload"),
  path.join(rootDir, "\u7f51\u6613\u4e91\u6b4c\u5355"),
  path.join(audioDir, "VipSongsDownload"),
  path.join(audioDir, "\u7f51\u6613\u4e91\u6b4c\u5355"),
  "D:\\VipSongsDownload",
  "D:\\CloudMusic\\VipSongsDownload",
  "D:\\CloudMusic\\\u7f51\u6613\u4e91\u6b4c\u5355"
];
const defaultNeteaseApiBase = "http://localhost:3001";

const supportedAudio = new Map([
  [".mp3", "audio/mpeg"],
  [".flac", "audio/flac"],
  [".m4a", "audio/mp4"],
  [".m4r", "audio/mp4"],
  [".wav", "audio/wav"],
  [".ogg", "audio/ogg"]
]);

export function slugifyTrackId(filename) {
  return path
    .basename(filename, path.extname(filename))
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function listLocalTracks() {
  const seen = new Set();
  const overrides = readTrackOverrides();

  return getLibraryRoots().flatMap((root) => {
    if (!fs.existsSync(root.dir) || isGeneratedAudioDir(root.dir)) return [];

    return listAudioFiles(root.dir)
      .map((entry) => {
        const extension = path.extname(entry.name).toLowerCase();
        const baseId = `${root.id}-${slugifyTrackId(entry.name) || "local-track"}`;
        let id = baseId;
        let suffix = 2;

        while (seen.has(id)) {
          id = `${baseId}-${suffix}`;
          suffix += 1;
        }
        seen.add(id);

        const filePath = entry.path;
        const stats = fs.statSync(filePath);
        const identity = parseTrackIdentity(entry.name, root.label, root.dir);
        const override = normalizeTrackOverride(overrides[id]);
        const finalIdentity = override ?? identity;
        const baseTrack = {
          id,
          title: finalIdentity.title,
          artist: finalIdentity.artist,
          originalTitle: identity.title,
          originalArtist: identity.artist,
          identityCorrected: Boolean(override),
          filename: entry.name,
          format: extension.slice(1).toUpperCase(),
          source: root.label,
          sourceDir: root.dir,
          path: filePath,
          mimeType: supportedAudio.get(extension),
          size: stats.size,
          durationSeconds: 180
        };
        const analysis = analyzeTrackMetadata(baseTrack);

        return {
          ...baseTrack,
          mood: analysis.mood,
          tags: analysis.tags,
          energy: analysis.energy,
          sceneFit: analysis.sceneFit,
          language: analysis.language,
          source: analysis.source
        };
      });
  });
}

function listAudioFiles(rootDir) {
  const files = [];
  const pending = [rootDir];

  while (pending.length > 0) {
    const currentDir = pending.pop();
    if (!currentDir || isGeneratedAudioDir(currentDir)) continue;

    let entries = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const entryPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        pending.push(entryPath);
        continue;
      }

      if (entry.isFile() && supportedAudio.has(path.extname(entry.name).toLowerCase())) {
        files.push({
          name: entry.name,
          path: entryPath
        });
      }
    }
  }

  return files;
}

export function saveTrackIdentityOverride(trackId, identity) {
  const id = String(trackId ?? "").trim();
  const title = cleanTrackName(identity?.title);
  const artist = cleanTrackName(identity?.artist);

  if (!id || !title || !artist) {
    throw new Error("Track id, title, and artist are required.");
  }

  const existing = listLocalTracks().find((track) => track.id === id);
  if (!existing) {
    throw new Error("Track not found in local library.");
  }

  const overrides = readTrackOverrides();
  overrides[id] = {
    title,
    artist,
    updatedAt: new Date().toISOString()
  };
  writeTrackOverrides(overrides);

  return {
    ...existing,
    title,
    artist,
    identityCorrected: true
  };
}

export async function previewOnlinePlaylist(playlistUrl) {
  const url = normalizePlaylistUrl(playlistUrl);
  const neteaseId = extractNeteasePlaylistId(url);
  const localTracks = listLocalTracks();
  const playlist = neteaseId ? await previewNeteasePlaylist(neteaseId) : await previewJsonPlaylist(url);

  return {
    ...playlist,
    tracks: playlist.tracks.map((track) => ({
      ...track,
      match: matchOnlineTrackToLocal(track, localTracks)
    }))
  };
}

export async function getNeteaseSongPlayback(songId) {
  const id = String(songId ?? "").trim();

  if (!/^\d+$/u.test(id)) {
    throw new Error("A NetEase numeric song id is required.");
  }

  const enhanced = await requestNeteaseEnhancedSongUrl(id);

  if (enhanced.url) {
    return {
      id,
      playable: true,
      url: enhanced.url,
      source: "netease-player-url",
      br: enhanced.br,
      size: enhanced.size,
      reason: ""
    };
  }

  const outer = await requestNeteaseOuterSongUrl(id);

  if (outer.url) {
    return {
      id,
      playable: true,
      url: outer.url,
      source: "netease-outer-url",
      br: null,
      size: null,
      reason: ""
    };
  }

  return {
    id,
    playable: false,
    url: "",
    source: "netease",
    br: enhanced.br ?? null,
    size: enhanced.size ?? null,
    reason: enhanced.reason || outer.reason || "NetEase did not return a playable URL for this song."
  };
}

function parseTrackIdentity(filename, fallbackArtist, sourceDir = "") {
  const rawName = path.basename(filename, path.extname(filename));
  const artistFirst = isArtistFirstLibraryRoot(sourceDir, fallbackArtist);
  const normalizedName = artistFirst ? cleanArtistName(rawName) : cleanTrackName(rawName);
  const rawParts = normalizedName
    .split(/\s+(?:-|–|—|~|／|\/|\|)\s+|_-_|--/u)
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  const parts = rawParts.map(cleanTrackName).filter(Boolean);

  if (rawParts.length >= 2) {
    if (artistFirst) {
      return {
        title: rawParts.slice(1).map(cleanTrackName).filter(Boolean).join(" - "),
        artist: cleanArtistName(rawParts[0]) || fallbackArtist
      };
    }

    const titleParts = parts.slice(0, -1);
    const artistPart = parts.at(-1);
    const ordered = orderTitleAndArtist(titleParts.join(" - "), artistPart);

    return {
      title: ordered.title,
      artist: ordered.artist || fallbackArtist
    };
  }

  const compactMatch = normalizedName.match(/^(.+?)[\s_]*[-–—][\s_]*(.+)$/u);

  if (compactMatch) {
    if (artistFirst) {
      return {
        title: cleanTrackName(compactMatch[2]),
        artist: cleanArtistName(compactMatch[1]) || fallbackArtist
      };
    }

    const ordered = orderTitleAndArtist(cleanTrackName(compactMatch[1]), cleanTrackName(compactMatch[2]));

    return {
      title: ordered.title,
      artist: ordered.artist || fallbackArtist
    };
  }

  return {
    title: normalizedName || rawName,
    artist: fallbackArtist
  };
}

function cleanTrackName(value) {
  return String(value ?? "")
    .replace(/^\s*\d{1,3}[\s._-]+/u, "")
    .replace(/\s*\[[^\]]+\]\s*$/u, "")
    .replace(/\s*\((?:official|audio|lyrics?|mv|hd|hq|flac|mp3|cover)\)\s*$/iu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanArtistName(value) {
  return String(value ?? "")
    .replace(/\s*\[[^\]]+\]\s*$/u, "")
    .replace(/\s*\((?:official|audio|lyrics?|mv|hd|hq|flac|mp3|cover)\)\s*$/iu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTrackOverride(value) {
  if (!value || typeof value !== "object") return null;

  const title = cleanTrackName(value.title);
  const artist = cleanTrackName(value.artist);

  if (!title || !artist) return null;

  return { title, artist };
}

function normalizePlaylistUrl(value) {
  const rawUrl = String(value ?? "").trim();

  if (!/^https?:\/\//i.test(rawUrl)) {
    throw new Error("A public http or https playlist URL is required.");
  }

  return rawUrl;
}

function extractNeteasePlaylistId(url) {
  const hashId = url.match(/[#?&]id=(\d+)/u)?.[1];
  if (hashId && /music\.163\.com/i.test(url)) return hashId;

  return url.match(/music\.163\.com\/(?:#\/)?playlist\/(\d+)/iu)?.[1] ?? null;
}

async function previewNeteasePlaylist(playlistId) {
  const apiPlaylist = await previewNeteasePlaylistViaApi(playlistId);
  if (apiPlaylist) return apiPlaylist;

  const response = await fetch(`https://music.163.com/api/playlist/detail?id=${encodeURIComponent(playlistId)}`, {
    headers: {
      Referer: "https://music.163.com/",
      "User-Agent": "Mozilla/5.0 local-ai-radio"
    }
  });

  if (!response.ok) {
    throw new Error(`Online playlist request failed: ${response.status}`);
  }

  const data = await response.json();
  const playlist = data.result ?? data.playlist ?? {};
  let tracks = normalizeOnlineTracks(playlist.tracks ?? []);

  if (tracks.length === 0) {
    const pagePlaylist = await previewNeteasePlaylistPage(playlistId);
    tracks = pagePlaylist.tracks;

    return {
      source: "netease-cloud-music-page",
      title: pagePlaylist.title ?? playlist.name ?? `NetEase playlist ${playlistId}`,
      trackCount: pagePlaylist.totalCount ?? tracks.length,
      tracks
    };
  }

  return {
    source: "netease-cloud-music",
    title: playlist.name ?? `NetEase playlist ${playlistId}`,
    trackCount: tracks.length,
    tracks
  };
}

async function previewNeteasePlaylistViaApi(playlistId) {
  const data =
    (await requestNeteaseCloudMusicApi("/playlist/track/all", {
      id: playlistId,
      limit: "1000",
      offset: "0"
    })) ||
    (await requestNeteaseCloudMusicApi("/playlist/detail", {
      id: playlistId
    }));

  if (!data) return null;

  const tracks = normalizeOnlineTracks(data.songs ?? data.playlist?.tracks ?? data.result?.tracks ?? []);

  if (!tracks.length) return null;

  return {
    source: "netease-cloud-music-api",
    title: data.playlist?.name ?? data.result?.name ?? `NetEase playlist ${playlistId}`,
    trackCount: data.playlist?.trackCount ?? data.result?.trackCount ?? tracks.length,
    tracks
  };
}

async function previewNeteasePlaylistPage(playlistId) {
  const response = await fetch(`https://music.163.com/playlist?id=${encodeURIComponent(playlistId)}`, {
    headers: {
      Referer: "https://music.163.com/",
      "User-Agent": "Mozilla/5.0 local-ai-radio"
    }
  });

  if (!response.ok) {
    throw new Error(`NetEase playlist page request failed: ${response.status}`);
  }

  const html = await response.text();
  const title = decodeHtml(html.match(/<title>([\s\S]*?)<\/title>/iu)?.[1] ?? "")
    .replace(/\s*-\s*歌单\s*-\s*网易云音乐\s*$/u, "")
    .trim();
  const totalCount = Number(html.match(/id="playlist-track-count">(\d+)<\/span>/iu)?.[1] ?? 0);
  const songs = [...html.matchAll(/<a href="\/song\?id=(\d+)">([^<]+)<\/a>/giu)]
    .map((match) => ({
      id: match[1],
      title: decodeHtml(match[2])
    }))
    .slice(0, 100);

  const detailedTracks = await fetchNeteaseSongDetails(songs.map((song) => song.id));
  const detailById = new Map(detailedTracks.map((track) => [String(track.id), track]));

  return {
    title,
    totalCount,
    tracks: songs.map((song) => {
      const detail = detailById.get(song.id);

      return {
        id: song.id,
        title: detail?.title ?? song.title,
        artist: detail?.artist ?? "Unknown Artist",
        album: detail?.album ?? "",
        source: "online-playlist"
      };
    })
  };
}

async function fetchNeteaseSongDetails(ids) {
  if (!ids.length) return [];

  const response = await fetch(`https://music.163.com/api/song/detail?ids=${encodeURIComponent(JSON.stringify(ids))}`, {
    headers: {
      Referer: "https://music.163.com/",
      "User-Agent": "Mozilla/5.0 local-ai-radio"
    }
  });

  if (!response.ok) return [];

  const data = await response.json().catch(() => ({}));

  return normalizeOnlineTracks(data.songs ?? []);
}

async function requestNeteaseEnhancedSongUrl(id) {
  const apiSongUrl = await requestNeteaseSongUrlViaApi(id);
  if (apiSongUrl.url) return apiSongUrl;

  try {
    const response = await fetch(
      `https://music.163.com/api/song/enhance/player/url?id=${encodeURIComponent(id)}&ids=${encodeURIComponent(
        JSON.stringify([Number(id)])
      )}&br=320000`,
      {
        headers: {
          Referer: "https://music.163.com/",
          "User-Agent": "Mozilla/5.0 local-ai-radio"
        }
      }
    );

    if (!response.ok) {
      return { url: "", reason: `player-url request failed: ${response.status}` };
    }

    const data = await response.json().catch(() => ({}));
    const item = Array.isArray(data.data) ? data.data[0] : null;
    const url = typeof item?.url === "string" ? item.url : "";

    return {
      url,
      br: item?.br ?? null,
      size: item?.size ?? null,
      reason: url ? "" : item?.code ? `player-url returned code ${item.code}` : "player-url returned empty URL"
    };
  } catch (error) {
    return {
      url: "",
      reason: error instanceof Error ? error.message : "player-url request failed"
    };
  }
}

async function requestNeteaseSongUrlViaApi(id) {
  const data = await requestNeteaseCloudMusicApi("/song/url", {
    id,
    br: "320000"
  });
  const item = Array.isArray(data?.data) ? data.data[0] : null;
  const url = typeof item?.url === "string" ? item.url : "";

  return {
    url,
    br: item?.br ?? null,
    size: item?.size ?? null,
    reason: url ? "" : item?.code ? `NeteaseCloudMusicApi returned code ${item.code}` : "NeteaseCloudMusicApi returned empty URL"
  };
}

async function requestNeteaseCloudMusicApi(endpoint, params = {}) {
  const apiBase = (process.env.NETEASE_API_BASE ?? defaultNeteaseApiBase).replace(/\/+$/u, "");
  const url = new URL(`${apiBase}${endpoint}`);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 local-ai-radio"
      },
      signal: AbortSignal.timeout(2600)
    });

    if (!response.ok) return null;

    return response.json();
  } catch {
    return null;
  }
}

async function requestNeteaseOuterSongUrl(id) {
  const outerUrl = `https://music.163.com/song/media/outer/url?id=${encodeURIComponent(id)}.mp3`;

  try {
    const response = await fetch(outerUrl, {
      redirect: "manual",
      headers: {
        Referer: "https://music.163.com/",
        "User-Agent": "Mozilla/5.0 local-ai-radio"
      }
    });
    const location = response.headers.get("location");

    if (location && /^https?:\/\//i.test(location) && !/\/404(?:\?|$)/i.test(location)) {
      return { url: location, reason: "" };
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (response.ok && /^audio\//i.test(contentType)) {
      return { url: outerUrl, reason: "" };
    }

    return { url: "", reason: `outer-url returned ${response.status}` };
  } catch (error) {
    return {
      url: "",
      reason: error instanceof Error ? error.message : "outer-url request failed"
    };
  }
}

async function previewJsonPlaylist(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json,text/plain,*/*",
      "User-Agent": "Mozilla/5.0 local-ai-radio"
    }
  });

  if (!response.ok) {
    throw new Error(`Online playlist request failed: ${response.status}`);
  }

  const text = await response.text();
  const data = JSON.parse(text);
  const candidateTracks =
    data.tracks ??
    data.songs ??
    data.items ??
    data.playlist?.tracks ??
    data.result?.tracks ??
    data.data?.tracks ??
    [];
  const tracks = normalizeOnlineTracks(candidateTracks);

  return {
    source: "json-playlist",
    title: data.title ?? data.name ?? data.playlist?.name ?? data.result?.name ?? "Online playlist",
    trackCount: tracks.length,
    tracks
  };
}

function normalizeOnlineTracks(tracks) {
  if (!Array.isArray(tracks)) return [];

  return tracks
    .map((track, index) => {
      const title = cleanTrackName(track.name ?? track.title ?? track.songName ?? track.trackName ?? "");
      const artist = cleanTrackName(
        Array.isArray(track.artists)
          ? track.artists.map((item) => item.name).filter(Boolean).join(" / ")
          : Array.isArray(track.ar)
            ? track.ar.map((item) => item.name).filter(Boolean).join(" / ")
            : track.artist ?? track.artistName ?? track.singer ?? ""
      );

      if (!title) return null;

      return {
        id: String(track.id ?? track.songId ?? track.mid ?? `online-${index + 1}`),
        title,
        artist: artist || "Unknown Artist",
        album: cleanTrackName(track.album?.name ?? track.al?.name ?? track.albumName ?? ""),
        source: "online-playlist"
      };
    })
    .filter(Boolean)
    .slice(0, 100);
}

function matchOnlineTrackToLocal(onlineTrack, localTracks) {
  const scored = localTracks
    .map((localTrack) => ({
      track: localTrack,
      score: scoreTrackMatch(onlineTrack, localTrack)
    }))
    .sort((left, right) => right.score - left.score);
  const best = scored[0];

  if (!best || best.score < 0.5) {
    return {
      status: "missing",
      confidence: best?.score ?? 0,
      localTrack: null
    };
  }

  return {
    status: best.score >= 0.82 ? "matched-local" : "review",
    confidence: Number(best.score.toFixed(2)),
    localTrack: {
      id: best.track.id,
      title: best.track.title,
      artist: best.track.artist,
      filename: best.track.filename
    }
  };
}

function scoreTrackMatch(onlineTrack, localTrack) {
  const onlineTitle = normalizeMatchText(onlineTrack.title);
  const onlineArtist = normalizeMatchText(onlineTrack.artist);
  const localTitle = normalizeMatchText(localTrack.title);
  const localArtist = normalizeMatchText(localTrack.artist);
  const filename = normalizeMatchText(localTrack.filename);

  if (!onlineTitle || !localTitle) return 0;

  let score = 0;
  const titleScore = similarity(onlineTitle, localTitle);
  const artistScore = onlineArtist && localArtist ? similarity(onlineArtist, localArtist) : 0;

  score += titleScore * 0.68;
  score += artistScore * 0.24;

  if (filename.includes(onlineTitle)) score += 0.16;
  if (onlineArtist && filename.includes(onlineArtist)) score += 0.08;
  if (localTitle.includes(onlineTitle) || onlineTitle.includes(localTitle)) score += 0.08;

  return Math.min(1, score);
}

function normalizeMatchText(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/\.(mp3|flac|m4a|wav|ogg)$/iu, "")
    .replace(/\b(official|audio|lyrics?|mv|hd|hq|flac|mp3|cover|remaster(?:ed)?)\b/giu, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "")
    .trim();
}

function similarity(left, right) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) {
    return Math.min(left.length, right.length) / Math.max(left.length, right.length);
  }

  const distance = levenshtein(left, right);
  return Math.max(0, 1 - distance / Math.max(left.length, right.length));
}

function levenshtein(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    const current = [leftIndex + 1];

    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      current[rightIndex + 1] = Math.min(
        current[rightIndex] + 1,
        previous[rightIndex + 1] + 1,
        previous[rightIndex] + (left[leftIndex] === right[rightIndex] ? 0 : 1)
      );
    }

    previous.splice(0, previous.length, ...current);
  }

  return previous[right.length];
}

function decodeHtml(value) {
  return String(value ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/g, "/")
    .trim();
}

function readTrackOverrides() {
  try {
    if (!fs.existsSync(trackOverridesPath)) return {};
    const data = JSON.parse(fs.readFileSync(trackOverridesPath, "utf8"));
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

function writeTrackOverrides(overrides) {
  fs.mkdirSync(path.dirname(trackOverridesPath), { recursive: true });
  fs.writeFileSync(trackOverridesPath, JSON.stringify(overrides, null, 2), "utf8");
}

function orderTitleAndArtist(left, right) {
  const cleanedLeft = cleanTrackName(left);
  const cleanedRight = cleanTrackName(right);

  if (looksLikeArtistFirst(cleanedLeft, cleanedRight)) {
    return {
      title: cleanedRight,
      artist: cleanedLeft
    };
  }

  return {
    title: cleanedLeft,
    artist: cleanedRight
  };
}

function looksLikeArtistFirst(left, right) {
  if (!left || !right) return false;

  const leftHasChinese = /[\u4e00-\u9fff]/u.test(left);
  const rightHasChinese = /[\u4e00-\u9fff]/u.test(right);
  const rightLooksEnglishTitle = /^[a-z0-9][a-z0-9'’.\s]{1,48}$/iu.test(right);
  const leftLooksNamedArtist =
    /(?:的|dj|feat\.?|ft\.?|prod\.?|official)$/iu.test(left) ||
    /^[A-Z][\w'.]*(?:\s+[A-Z][\w'.]*){0,3}$/u.test(left);
  const rightLooksVersion = /\b(remix|mix|cover|live|edit|version|bootleg|flip|demo|one last)\b/iu.test(right);

  if (leftHasChinese && rightLooksEnglishTitle && !rightHasChinese) return true;
  if (leftLooksNamedArtist && rightLooksVersion && !rightHasChinese) return true;

  return false;
}

export function findLocalTrack(trackId) {
  if (typeof trackId !== "string" || !trackId.trim()) return undefined;
  return listLocalTracks().find((track) => track.id === trackId);
}

export function analyzeTrackMetadata(track) {
  const title = String(track.title ?? track.filename ?? "").toLowerCase();
  const source = normalizeSource(track.source, track.sourceDir);
  const language = inferLanguage(track.title ?? "");
  const mood = inferTrackMood(title);
  const tags = inferTags({ title, mood, format: track.format, language, source });
  const energy = inferEnergy({ title, mood, tags });
  const sceneFit = inferSceneFit({ title, mood, tags, energy });

  return {
    mood,
    tags,
    energy,
    sceneFit,
    language,
    source
  };
}

function inferTrackMood(normalizedTitle) {
  const rules = [
    {
      mood: "midnight",
      keywords: ["night", "late", "moon", "dream", "slow", "void", "ambient", "midnight"]
    },
    {
      mood: "morning",
      keywords: ["morning", "sun", "wake", "coffee", "light", "loaded"]
    },
    {
      mood: "focus",
      keywords: ["lofi", "study", "work", "focus", "piano", "tribute", "conservatory"]
    },
    {
      mood: "drive",
      keywords: ["city", "drive", "road", "beat", "dance", "run", "radio", "remix", "mix", "loaded"]
    },
    {
      mood: "warm",
      keywords: ["love", "warm", "soft", "home", "heart", "house"]
    }
  ];

  return rules.find((rule) => rule.keywords.some((keyword) => normalizedTitle.includes(keyword)))?.mood ?? "open";
}

function inferTags({ title, mood, format, language, source }) {
  const tags = new Set([mood, String(format ?? "").toLowerCase()].filter(Boolean));

  if (language === "chinese") tags.add("mandarin-pop");
  if (language === "instrumental") tags.add("instrumental");
  if (title.includes("piano") || title.includes("tribute") || title.includes("conservatory")) tags.add("piano");
  if (title.includes("remix") || title.includes("mix") || title.includes("beat")) tags.add("light-electronic");
  if (title.includes("city") || title.includes("road") || title.includes("loaded")) tags.add("city");
  if (title.includes("night") || title.includes("void") || mood === "midnight") tags.add("late-night");
  if (title.includes("rain")) tags.add("rainy-day");
  if (title.includes("love") || title.includes("warm") || title.includes("home") || mood === "warm") tags.add("warm-vocal");
  if (["warm", "midnight"].includes(mood)) tags.add("relax");
  if (["drive", "focus"].includes(mood)) tags.add("steady-groove");
  if (source === "netease-local") tags.add("netease-library");
  if (source === "local-audio") tags.add("local-library");

  return [...tags];
}

function inferEnergy({ title, mood, tags }) {
  if (title.includes("loaded") || title.includes("dance") || title.includes("run")) return "medium";
  if (tags.includes("piano") || tags.includes("ambient") || ["midnight", "warm"].includes(mood)) return "low";
  if (["drive", "focus"].includes(mood)) return "medium";
  if (mood === "morning") return "low-to-medium";
  return "medium";
}

function inferSceneFit({ mood, tags, energy }) {
  const scenes = new Set();
  const byMood = {
    morning: ["morning", "work"],
    focus: ["work", "afternoon"],
    drive: ["afternoon", "work"],
    warm: ["noon", "evening"],
    midnight: ["night", "evening"],
    open: ["daily", "afternoon"]
  };

  for (const scene of byMood[mood] ?? ["daily"]) scenes.add(scene);
  if (tags.includes("piano") || tags.includes("instrumental")) scenes.add("work");
  if (tags.includes("late-night") || tags.includes("ambient")) scenes.add("night");
  if (tags.includes("city") || tags.includes("steady-groove")) scenes.add("afternoon");
  if (tags.includes("warm-vocal") || tags.includes("relax")) scenes.add("evening");
  if (energy === "low") scenes.add("noon");

  return [...scenes];
}

function inferLanguage(title) {
  if (/[\u4e00-\u9fff]/u.test(title)) return "chinese";
  const normalized = String(title).toLowerCase();
  if (normalized.includes("piano") || normalized.includes("tribute") || normalized.includes("conservatory")) {
    return "instrumental";
  }
  return "unknown";
}

function normalizeSource(source, sourceDir) {
  const value = `${source ?? ""} ${sourceDir ?? ""}`.toLowerCase();
  if (isNeteaseLibraryRoot(value)) return "netease-local";
  if (value.includes("external")) return "external-local";
  return "local-audio";
}

function isNeteaseLibraryRoot(value) {
  const text = String(value ?? "").toLowerCase();
  return text.includes("netease") || text.includes("cloudmusic") || /网易云|歌单/u.test(text);
}

function isArtistFirstLibraryRoot(sourceDir, sourceLabel) {
  if (isNeteaseLibraryRoot(sourceDir) || isNeteaseLibraryRoot(sourceLabel)) return true;

  try {
    return path.resolve(String(sourceDir ?? "")) === path.resolve(audioDir);
  } catch {
    return false;
  }
}

function getLibraryRoots() {
  const externalDirs = (process.env.RADIO_LIBRARY_DIRS ?? defaultExternalDirs.join(";"))
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);

  const roots = [
    {
      id: "local",
      label: "Local Audio Library",
      dir: audioDir
    }
  ];

  externalDirs.forEach((dir, index) => {
    roots.push({
      id: `cloud-${index + 1}`,
      label: isNeteaseLibraryRoot(dir) ? "NetEase Cloud Music" : "External Music Library",
      dir
    });
  });

  return roots.filter((root) => !isGeneratedAudioDir(root.dir));
}

function isGeneratedAudioDir(dir) {
  return path.resolve(dir) === path.resolve(audioDir, "generated");
}
