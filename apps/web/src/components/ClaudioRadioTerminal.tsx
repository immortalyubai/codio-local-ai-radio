"use client";

import type { CSSProperties, ChangeEvent, FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  apiBase,
  audioUrl,
  fetchCurrentPlannerSlot,
  fetchTodayPlanner,
  fetchHostVoice,
  saveListenerFeedback,
  sendHostChat,
  regenerateTodayPlanner,
  type PlannerDay,
  type PlannerSlot
} from "../lib/api";
import styles from "../app/visual-lab/visual-lab.module.css";

const dotDigits: Record<string, string[]> = {
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  ":": ["0", "1", "1", "0", "1", "1", "0"]
};

const dotLetters: Record<string, string[]> = {
  C: ["111", "100", "100", "100", "111"],
  L: ["100", "100", "100", "100", "111"],
  A: ["111", "101", "111", "101", "101"],
  U: ["101", "101", "101", "101", "111"],
  D: ["110", "101", "101", "101", "110"],
  I: ["111", "010", "010", "010", "111"],
  O: ["111", "101", "101", "101", "111"]
};

const fallbackTrack = {
  id: "fallback-track",
  title: "If",
  artist: "Bread",
  source: "Codio FM",
  audioSrc: "",
  durationSeconds: 158,
  reason: "A quiet fallback signal while Codio waits for the planner.",
  mood: "quiet" as string | null,
  tags: [] as string[],
  queueCount: 0
};

const beforeSleepDemoTrackId = "video-demo-warm-house-opening";
const beforeSleepDemoIntroSegments = [
  "This is Codio. Tonight's first song is Warm House by Hua Chenyu.",
  "I chose it as the opening track because it carries a very particular kind of warmth: not loud, not sentimental, but like a house with one light still on, waiting for you to walk in slowly.",
  "After a full day with Codex, don't rush to sort yourself out. Let this song soften the noise in your heart. Welcome back, Immortal. This is your private radio."
];
const beforeSleepDemoIntro = beforeSleepDemoIntroSegments.join(" ");

const defaultHostAvatar = "/avatars/codio.png";
const defaultUserAvatar = "/avatars/immortal.jpg";

type PlaybackTrack = typeof fallbackTrack;

type LibraryPreviewTrack = {
  id: string;
  title: string;
  artist: string;
  filename: string;
  durationSeconds?: number;
  source?: string | null;
  originalTitle?: string;
  originalArtist?: string;
  identityCorrected?: boolean;
};

type OnlinePlaylistTrack = {
  id: string;
  title: string;
  artist: string;
  album?: string;
  match?: {
    status: "matched-local" | "review" | "missing";
    confidence: number;
    localTrack?: {
      id: string;
      title: string;
      artist: string;
      filename: string;
    } | null;
  };
};

type OnlinePlaylistPreview = {
  source: string;
  title: string;
  trackCount: number;
  tracks: OnlinePlaylistTrack[];
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [index: number]: {
        transcript: string;
      };
    };
  };
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  abort: () => void;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type ProfileSourceTrack = {
  title?: string;
  artist?: string | null;
  filename?: string;
  source?: string | null;
  tags?: string[];
  mood?: string | null;
};

const profileFallbackTags = ["LOCAL LIBRARY", "PRIVATE RADIO", "NIGHT DRIVE", "ENGLISH POP", "SLOW BURN"];

const styleKeywordRules: Array<{ label: string; pattern: RegExp }> = [
  { label: "ENGLISH POP", pattern: /\b(pop|taylor|delacey|bread|kiss|slow|down|one last|dream)\b/i },
  { label: "R&B", pattern: /\b(r&b|soul|weeknd|bruno|rhythm)\b/i },
  { label: "HIP-HOP", pattern: /\b(hip.?hop|rap|lofi|jason|eminem)\b/i },
  { label: "CITY POP", pattern: /\b(city.?pop|shibuya|80s|90s)\b/i },
  { label: "J-POP", pattern: /\b(j-?pop|hikaru|utada|kiss|anime|japanese|japan)\b/i },
  { label: "ROCK", pattern: /\b(rock|guitar|band|punk)\b/i },
  { label: "ELECTRONIC", pattern: /\b(electro|edm|synth|dance|remix|mix)\b/i },
  { label: "BALLAD", pattern: /\b(ballad|live|acoustic|piano|love)\b/i },
  { label: "AMBIENT", pattern: /\b(ambient|dream|sleep|rain|ocean|deep|work)\b/i },
  { label: "MANDARIN POP", pattern: /华语|国语|中文|mandarin|c-?pop/i }
];

const nonMusicProfileTagPattern =
  /^(mp3|flac|wav|m4a|aac|ogg|ncm|local|local library|netease|netease library|netease playlist|cloud music|cloudmusic|codio fm|morning|afternoon|evening|night|drive|work|study|focus|rest|plan|playlist)$/i;

function normalizeMusicStyleTag(tag: string) {
  const cleaned = tag.replace(/[_/]+/g, " ").replace(/\s+/g, " ").trim();

  if (!cleaned || nonMusicProfileTagPattern.test(cleaned)) {
    return "";
  }

  if (/^(pop|english pop|j pop|j-pop|c pop|c-pop|mandarin pop|r&b|hip hop|hip-hop|rock|electronic|ballad|ambient|city pop|soul|jazz|lofi|lo-fi|folk|acoustic)$/i.test(cleaned)) {
    return cleaned.toUpperCase().replace(/\s+/g, " ");
  }

  return "";
}

function getSpeechRecognitionConstructor() {
  const speechWindow = window as typeof window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };

  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

function cleanDisplayTitle(title: string) {
  return title.replace(/^(鎺ㄨ崘锛殀涓嬩竴棣栵細)/, "").trim();
}

function cleanDisplayArtist(artist?: string | null) {
  const cleaned = String(artist ?? "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();

  if (!cleaned || /^unknown$/i.test(cleaned)) {
    return "";
  }

  if (/^(codio fm|local|local library|cloud music|netease cloud music|late|easy)$/i.test(cleaned)) {
    return "";
  }

  return cleaned;
}

function splitTrackTitleAndArtist(title: string, artist?: string | null) {
  const cleanedTitle = cleanDisplayTitle(title);
  const explicitArtist = cleanDisplayArtist(artist);
  const parts = cleanedTitle.split(/\s+-\s+/).map((part) => part.trim()).filter(Boolean);

  if (parts.length >= 2) {
    const left = parts[0];
    const right = parts.slice(1).join(" - ");

    if (looksLikeArtistFirst(left, right)) {
      return {
        title: right,
        artist: explicitArtist || left
      };
    }

    return {
      title: left,
      artist: explicitArtist || right
    };
  }

  if (looksLikeArtistFirst(cleanedTitle, explicitArtist)) {
    return {
      title: explicitArtist,
      artist: cleanedTitle
    };
  }

  return {
    title: cleanedTitle,
    artist: explicitArtist || "Unknown Artist"
  };
}

function looksLikeArtistFirst(left: string, right: string) {
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

function createCodioProfile(
  libraryTracks: LibraryPreviewTrack[],
  plannerDay: PlannerDay | null,
  currentTrack: PlaybackTrack
) {
  const plannerTracks =
    plannerDay?.slots.flatMap((slot) =>
      (slot.tracks ?? []).map((track) => ({
        title: track.title,
        artist: track.artist,
        source: track.source,
        tags: track.tags,
        mood: track.mood ?? slot.mood
      }))
    ) ?? [];
  const sourceTracks: ProfileSourceTrack[] =
    libraryTracks.length > 0 ? libraryTracks : plannerTracks.length > 0 ? plannerTracks : [currentTrack];
  const artistCounts = new Map<string, number>();
  const styleTags = new Set<string>();

  sourceTracks.forEach((track) => {
    const title = cleanDisplayTitle(track.title ?? "");
    const artist = cleanDisplayArtist(track.artist);
    const haystack = [title, artist, track.filename, track.source, track.mood, ...(track.tags ?? [])]
      .filter(Boolean)
      .join(" ");

    if (artist) {
      artistCounts.set(artist, (artistCounts.get(artist) ?? 0) + 1);
    }

    track.tags?.forEach((tag) => {
      const styleTag = normalizeMusicStyleTag(tag);

      if (styleTag) {
        styleTags.add(styleTag);
      }
    });

    styleKeywordRules.forEach((rule) => {
      if (rule.pattern.test(haystack)) {
        styleTags.add(rule.label);
      }
    });
  });

  const topArtists = Array.from(artistCounts.entries())
    .sort((first, second) => second[1] - first[1])
    .slice(0, 3)
    .map(([artist]) => artist);
  const tags = Array.from(styleTags).slice(0, 10);
  const displayTags = tags.length > 0 ? tags : profileFallbackTags;
  const favoriteStyles = displayTags.slice(0, 4).join(" / ");

  return {
    copy: "You can do anything you set your mind to, man.",
    sourceLabel: "喜欢的风格 / 个人风格",
    tags: displayTags,
    genresCount: String(displayTags.length).padStart(2, "0"),
    libraryLabel: "TASTE"
  };
}

function getTranscriptSegments(text: string) {
  const pattern = /\s+|[\u4e00-\u9fff]|[^\s\u4e00-\u9fff]+/gu;

  return Array.from(text.matchAll(pattern), (match) => {
    const value = match[0];
    const start = match.index ?? 0;

    return {
      text: value,
      start,
      end: start + value.length,
      isSpace: /^\s+$/.test(value)
    };
  });
}

function VoiceTranscriptWords({ isSpeaking, progress, text }: { isSpeaking: boolean; progress: number; text: string }) {
  const segments = getTranscriptSegments(text);
  const wordCount = segments.filter((segment) => !segment.isSpace).length;
  const activeWordIndex = isSpeaking ? Math.min(wordCount - 1, Math.floor(progress * wordCount)) : -1;
  let wordIndex = -1;

  return (
    <>
      {segments.map((segment, index) => {
        if (segment.isSpace) {
          return segment.text;
        }

        wordIndex += 1;

        const isCurrent = wordIndex === activeWordIndex;
        const isSpoken = wordIndex < activeWordIndex;

        return (
          <span
            className={`visual-lab-voice-word ${isSpoken ? "is-spoken" : ""} ${isCurrent ? "is-current" : ""}`}
            key={`${segment.text}-${index}`}
          >
            {segment.text}
          </span>
        );
      })}
    </>
  );
}

function splitHostScriptParagraphs(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  return (
    normalized
      .match(/[^.!?。！？]+[.!?。！？]?/g)
      ?.map((sentence) => sentence.trim())
      .filter(Boolean) ?? [normalized]
  );
}

function paragraphProgressRange(paragraphs: string[], index: number) {
  const totalCharacters = Math.max(1, paragraphs.join(" ").length);
  const startCharacters = paragraphs.slice(0, index).join(" ").length + (index > 0 ? 1 : 0);
  const paragraphCharacters = Math.max(1, paragraphs[index]?.length ?? 1);
  const start = startCharacters / totalCharacters;
  const end = Math.min(1, (startCharacters + paragraphCharacters) / totalCharacters);

  return { start, end };
}

function getCurrentTrack(slot: PlannerSlot | null) {
  const track = slot?.tracks?.find((item) => item.title);

  if (!track) {
    return fallbackTrack;
  }

  const display = splitTrackTitleAndArtist(track.title, track.artist);

  return {
    id: track.id ?? `${slot?.id ?? "planner"}-track`,
    title: display.title,
    artist: display.artist,
    source: track.source ?? "Codio FM",
    audioSrc: track.audioUrl ?? track.audioSrc ? audioUrl(track.audioUrl ?? track.audioSrc ?? "") : "",
    durationSeconds: track.durationSeconds ?? 158,
    reason: track.reason ?? slot?.reason ?? "Codio picked this track for the current slot.",
    mood: track.mood ?? slot?.mood ?? null,
    tags: track.tags ?? [],
    queueCount: slot?.tracks?.length ?? 0
  };
}

function getPlaybackQueue(slot: PlannerSlot | null) {
  const tracks =
    slot?.tracks
      ?.filter((track) => track.title && (track.audioUrl || track.audioSrc))
      .map((track, index) => {
        const display = splitTrackTitleAndArtist(track.title, track.artist);

        return {
          id: track.id ?? `${slot.id}-track-${index + 1}`,
          title: display.title,
          artist: display.artist,
          source: track.source ?? "Codio FM",
          audioSrc: audioUrl(track.audioUrl ?? track.audioSrc ?? ""),
          durationSeconds: track.durationSeconds ?? 158,
          reason: track.reason ?? slot.reason ?? "Codio picked this track for the current slot.",
          mood: track.mood ?? slot.mood ?? null,
          tags: track.tags ?? [],
          queueCount: slot.tracks?.length ?? 0
        };
      }) ?? [];

  return tracks.length > 0 ? tracks : [fallbackTrack];
}

function isBeforeSleepDemoTrack(track: PlaybackTrack) {
  const identity = `${track.id} ${track.title} ${track.artist}`;
  return (
    track.id === beforeSleepDemoTrackId ||
    /birds of a feather/i.test(identity) ||
    (/温暖的房子/u.test(identity) && /华晨宇/u.test(identity)) ||
    (/warm house/i.test(identity) && /hua chenyu/i.test(identity))
  );
}

function getBeforeSleepDemoTrack(libraryTracks: LibraryPreviewTrack[]): PlaybackTrack {
  const candidates = libraryTracks.filter((track) =>
    /温暖的房子/u.test(`${track.title} ${track.filename}`) && /华晨宇/u.test(`${track.artist} ${track.filename}`)
  );
  const formatRank = new Map([
    [".mp3", 0],
    [".flac", 1],
    [".m4a", 2],
    [".wav", 3],
    [".ogg", 4],
    [".m4r", 5]
  ]);
  const localMatch = candidates.sort((left, right) => {
    const leftRank = formatRank.get(left.filename.match(/\.[^.]+$/u)?.[0]?.toLowerCase() ?? "") ?? 99;
    const rightRank = formatRank.get(right.filename.match(/\.[^.]+$/u)?.[0]?.toLowerCase() ?? "") ?? 99;
    return leftRank - rightRank;
  })[0];

  return {
    id: localMatch?.id ?? beforeSleepDemoTrackId,
    title: "温暖的房子",
    artist: "华晨宇",
    source: localMatch ? "Local Library" : "Video Demo",
    audioSrc: localMatch ? audioUrl(`/api/audio/music/${encodeURIComponent(localMatch.id)}`) : "",
    durationSeconds: localMatch?.durationSeconds ?? 210,
    reason:
      "the opening song should make the room feel warmer before the day of radio begins",
    mood: "warm opening",
    tags: ["MANDARIN POP", "WARM OPENING"],
    queueCount: localMatch ? 1 : 0
  };
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "0:00";
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainingSeconds}`;
}

function estimateSpeechDuration(text: string) {
  const englishWords = text.match(/[A-Za-z0-9']+/g)?.length ?? 0;
  const chineseCharacters = text.match(/[\u4e00-\u9fff]/g)?.length ?? 0;
  const estimatedSeconds = englishWords * 0.38 + chineseCharacters * 0.22;
  return Math.max(2.8, estimatedSeconds);
}

function getSpeakableProgress(text: string, charIndex: number) {
  const words = getTranscriptSegments(text).filter((segment) => !segment.isSpace);

  if (words.length === 0) {
    return 0;
  }

  const activeWordIndex = words.findIndex((word) => charIndex >= word.start && charIndex < word.end);
  let fallbackWordIndex = 0;

  for (let index = 0; index < words.length; index += 1) {
    if (words[index].end <= charIndex) {
      fallbackWordIndex = index;
    }
  }

  const wordIndex = activeWordIndex >= 0 ? activeWordIndex : Math.max(0, fallbackWordIndex);

  return Math.min(1, wordIndex / words.length);
}

function getHostScriptSegments(slot: PlannerSlot | null, track: typeof fallbackTrack) {
  if (isBeforeSleepDemoTrack(track)) {
    return beforeSleepDemoIntroSegments;
  }

  const routine = slot?.routineContext;
  const slotTitle = routine?.label || slot?.title || "Codio FM";
  const slotContext = slot ? `${slotTitle} (${routine?.timeRange || slot.timeRange})` : "Codio FM";
  const slotIntent = [routine?.intent, routine?.musicIntent].filter(Boolean).join(" ");
  const reason = track.reason || slot?.reason || slotIntent || "it fits the way this part of the day wants to move";
  const directions = routine?.displayStyles?.slice(0, 2).join(" and ") || slot?.musicDirection?.slice(0, 2).join(" and ");
  const tags = track.tags?.slice(0, 3).join(", ");
  const mood = track.mood || slot?.mood || "close";
  const opening = slotIntent
    ? `这里是 Codio。现在是「${slotContext}」时段，${slotIntent}`
    : slot?.hostOpening
      ? `这里是 Codio。「${slotContext}」。${slot.hostOpening}`
      : `这里是 Codio。「${slotContext}」。我会把这一段的声音保持在 ${mood} 的状态。`;
  const reasonLine = `我选择「${track.title}」${track.artist ? `，${track.artist}` : ""}，是因为${reason}`;
  const detailLine = directions || tags
    ? `这一段会靠近 ${directions || tags}，让这首歌先把房间的情绪铺开。`
    : `先让这首歌在房间里停一会儿，再进入下一段。`;

  return [opening, reasonLine, detailLine];
}

function getHostMessage(slot: PlannerSlot | null, track: typeof fallbackTrack) {
  return getHostScriptSegments(slot, track).join(" ");
}

function toMinutes(time: string) {
  const [hour = "0", minute = "0"] = time.split(":");
  return Number(hour) * 60 + Number(minute);
}

function getCurrentPlannerSlotFromDay(day: PlannerDay | null, date = new Date()) {
  const minutes = date.getHours() * 60 + date.getMinutes();

  return (
    day?.slots.find((slot) => {
      const [start, end] = slot.timeRange.split("-").map(toMinutes);
      if (end === 0) return minutes >= start;
      return minutes >= start && minutes < end;
    }) ?? day?.slots[0] ?? null
  );
}

function patchPlannerSlotTrack(slot: PlannerSlot | null, track: LibraryPreviewTrack) {
  if (!slot?.tracks?.length) return slot;

  return {
    ...slot,
    tracks: slot.tracks.map((item) =>
      item.id === track.id
        ? {
            ...item,
            title: track.title,
            artist: track.artist
          }
        : item
    )
  };
}

function formatClockDate(date: Date) {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

function formatClockWeekday(date: Date) {
  return date.toLocaleDateString("en-US", { weekday: "long" }).toUpperCase();
}

function formatClockCalendar(date: Date) {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit"
  }).toUpperCase();
}

function DotMatrixClock({ value }: { value: string }) {
  return (
    <div className="visual-lab-dot-clock" aria-label={value}>
      {value.split("").map((character, index) => (
        <span className={`visual-lab-dot-char ${character === ":" ? "colon" : ""}`} key={`${character}-${index}`}>
          {dotDigits[character].flatMap((row, rowIndex) =>
            row.split("").map((cell, columnIndex) => (
              <i className={cell === "1" ? "on" : ""} key={`${rowIndex}-${columnIndex}`} aria-hidden="true" />
            ))
          )}
        </span>
      ))}
    </div>
  );
}

function DotMatrixLabel({ value }: { value: string }) {
  return (
    <span className="visual-lab-dot-label" aria-label={value}>
      {value.split("").map((character, index) => (
        <span className="visual-lab-dot-letter" key={`${character}-${index}`}>
          {dotLetters[character].flatMap((row, rowIndex) =>
            row.split("").map((cell, columnIndex) => (
              <i className={cell === "1" ? "on" : ""} key={`${rowIndex}-${columnIndex}`} aria-hidden="true" />
            ))
          )}
        </span>
      ))}
    </span>
  );
}

export function CodioRadioTerminal() {
  const [hostAvatar, setHostAvatar] = useState<string | null>(defaultHostAvatar);
  const [userAvatar, setUserAvatar] = useState<string | null>(defaultUserAvatar);
  const [isHostCardOpen, setIsHostCardOpen] = useState(false);
  const [isHostProfileOpen, setIsHostProfileOpen] = useState(false);
  const [isVoicePanelOpen, setIsVoicePanelOpen] = useState(false);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [libraryTracks, setLibraryTracks] = useState<LibraryPreviewTrack[]>([]);
  const [selectedLibraryTrackId, setSelectedLibraryTrackId] = useState("");
  const [identityTitle, setIdentityTitle] = useState("");
  const [identityArtist, setIdentityArtist] = useState("");
  const [libraryStatus, setLibraryStatus] = useState("");
  const [onlinePlaylistUrl, setOnlinePlaylistUrl] = useState("");
  const [onlinePlaylistPreview, setOnlinePlaylistPreview] = useState<OnlinePlaylistPreview | null>(null);
  const [onlinePlaylistStatus, setOnlinePlaylistStatus] = useState("");
  const [isLoadingOnlinePlaylist, setIsLoadingOnlinePlaylist] = useState(false);
  const [isSavingIdentity, setIsSavingIdentity] = useState(false);
  const [plannerDay, setPlannerDay] = useState<PlannerDay | null>(null);
  const [plannerSlot, setPlannerSlot] = useState<PlannerSlot | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isHostSpeaking, setIsHostSpeaking] = useState(false);
  const [hostSpeechProgress, setHostSpeechProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(fallbackTrack.durationSeconds);
  const [chatInput, setChatInput] = useState("");
  const [submittedUserMessage, setSubmittedUserMessage] = useState("I'm really happy today. Play me a bright English song.");
  const [hostChatReply, setHostChatReply] = useState<string | null>(null);
  const [typedHostMessage, setTypedHostMessage] = useState("");
  const [pendingHostVoiceText, setPendingHostVoiceText] = useState<string | null>(null);
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [isVoiceInputActive, setIsVoiceInputActive] = useState(false);
  const [volume, setVolume] = useState(72);
  const [likedTrackKey, setLikedTrackKey] = useState<string | null>(null);
  const [isSavingLike, setIsSavingLike] = useState(false);
  const [isReplanning, setIsReplanning] = useState(false);
  const [isDemoOpeningActive, setIsDemoOpeningActive] = useState(true);
  const [onlineTrack, setOnlineTrack] = useState<PlaybackTrack | null>(null);
  const [isLoadingOnlineTrackId, setIsLoadingOnlineTrackId] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hostVoiceAudioRef = useRef<HTMLAudioElement | null>(null);
  const hostSpeechCancelledRef = useRef(false);
  const hostSpeechProgressFrameRef = useRef<number | null>(null);
  const hostTypingTimerRef = useRef<number | null>(null);
  const hostSpeechStartedAtRef = useRef(0);
  const hostSpeechDurationRef = useRef(1);
  const musicVolumeBeforeDuckRef = useRef<number | null>(null);
  const pendingPlayAfterTrackChangeRef = useRef(false);
  const spokenIntroKeysRef = useRef(new Set<string>());
  const hostIntroCopyCacheRef = useRef(new Map<string, string>());
  const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const speechInputBaseRef = useRef("");
  const speechFinalTextRef = useRef("");
  const playbackQueue = getPlaybackQueue(plannerSlot);
  const beforeSleepDemoTrack = useMemo(() => getBeforeSleepDemoTrack(libraryTracks), [libraryTracks]);
  const currentTrack = onlineTrack ?? (isDemoOpeningActive ? beforeSleepDemoTrack : null) ?? playbackQueue[currentIndex] ?? getCurrentTrack(plannerSlot);
  const hostProfile = useMemo(
    () => createCodioProfile(libraryTracks, plannerDay, currentTrack),
    [libraryTracks, plannerDay, currentTrack]
  );
  const hostScriptSegments = getHostScriptSegments(plannerSlot, currentTrack);
  const hostMessage = getHostMessage(plannerSlot, currentTrack);
  const displayHostMessage = hostChatReply ?? hostMessage;
  const displayHostSegments = hostChatReply ? [hostChatReply] : hostScriptSegments;
  const displayHostParagraphs = splitHostScriptParagraphs(displayHostMessage);
  const hostIntroKey = `${plannerSlot?.id ?? "fallback"}:${currentIndex}:${currentTrack.title}`;
  const currentTrackKey = `${plannerSlot?.id ?? "fallback"}:${currentTrack.id}:${currentTrack.title}:${currentTrack.artist}`;
  const selectedLibraryTrack = libraryTracks.find((track) => track.id === selectedLibraryTrackId) ?? libraryTracks[0] ?? null;
  const hasLikedCurrentTrack = likedTrackKey === currentTrackKey;
  const clockValue = formatClockDate(now);
  const clockLabel = `${formatClockWeekday(now)} / ${formatClockCalendar(now)}`;
  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const canPlayPendingHostVoice =
    Boolean(pendingHostVoiceText) &&
    !isSendingChat &&
    !isHostSpeaking;
  const showPendingHostVoiceButton = Boolean(pendingHostVoiceText) && !isSendingChat;

  useEffect(() => {
    let ignore = false;

    async function loadPlanner() {
      try {
        const [slot, day] = await Promise.all([fetchCurrentPlannerSlot(), fetchTodayPlanner()]);

        if (!ignore) {
          setPlannerSlot(slot);
          setPlannerDay(day);
        }
      } catch {
        if (!ignore) {
          setPlannerSlot(null);
          setPlannerDay(null);
        }
      }
    }

    void loadPlanner();

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (hostTypingTimerRef.current !== null) {
      window.clearTimeout(hostTypingTimerRef.current);
      hostTypingTimerRef.current = null;
    }

    const messageCharacters = Array.from(displayHostMessage);
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion || messageCharacters.length === 0) {
      setTypedHostMessage(displayHostMessage);
      return;
    }

    let index = 0;
    setTypedHostMessage("");

    const typeNextCharacter = () => {
      index += 1;
      setTypedHostMessage(messageCharacters.slice(0, index).join(""));

      if (index < messageCharacters.length) {
        const character = messageCharacters[index - 1];
        const delay = /[，。！？,.!?]/.test(character) ? 120 : 28;
        hostTypingTimerRef.current = window.setTimeout(typeNextCharacter, delay);
      } else {
        hostTypingTimerRef.current = null;
      }
    };

    hostTypingTimerRef.current = window.setTimeout(typeNextCharacter, 90);

    return () => {
      if (hostTypingTimerRef.current !== null) {
        window.clearTimeout(hostTypingTimerRef.current);
        hostTypingTimerRef.current = null;
      }
    };
  }, [displayHostMessage]);

  useEffect(() => {
    setCurrentIndex(0);
    setOnlineTrack(null);
  }, [plannerSlot]);

  useEffect(() => {
    if (libraryTracks.length > 0 && !isLibraryOpen) return;

    let ignore = false;

    async function loadLibrary() {
      setLibraryStatus("正在读取曲库...");

      try {
        const response = await fetch(`${apiBase}/api/library/tracks`, { cache: "no-store" });

        if (!response.ok) {
          throw new Error("Library load failed");
        }

        const data = (await response.json()) as { tracks: LibraryPreviewTrack[] };
        const tracks = data.tracks ?? [];

        if (ignore) return;

        setLibraryTracks(tracks);
        const current = tracks.find((track) => track.id === currentTrack.id) ?? tracks[0];
        setSelectedLibraryTrackId(current?.id ?? "");
        setLibraryStatus(`已扫描 ${tracks.length} 首歌`);
      } catch {
        if (!ignore) {
          setLibraryStatus("曲库暂不可用");
        }
      }
    }

    void loadLibrary();

    return () => {
      ignore = true;
    };
  }, [isLibraryOpen, isHostCardOpen, isHostProfileOpen, currentTrack.id, libraryTracks.length]);

  useEffect(() => {
    if (!selectedLibraryTrack) return;

    setIdentityTitle(selectedLibraryTrack.title);
    setIdentityArtist(selectedLibraryTrack.artist);
  }, [selectedLibraryTrack]);

  useEffect(() => {
    setHostChatReply(null);
    setPendingHostVoiceText(null);
  }, [currentTrackKey]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    setCurrentTime(0);
    setDuration(currentTrack.durationSeconds);

    if (pendingPlayAfterTrackChangeRef.current) {
      pendingPlayAfterTrackChangeRef.current = false;
      void playMusicAfterIntro();
    }
  }, [currentTrack.audioSrc, currentTrack.durationSeconds]);

  useEffect(() => {
    return () => {
      if (hostTypingTimerRef.current !== null) {
        window.clearTimeout(hostTypingTimerRef.current);
      }
      cancelHostVoice();
      speechRecognitionRef.current?.abort();
      audioRef.current?.pause();
    };
  }, []);

  useEffect(() => {
    const normalizedVolume = volume / 100;

    if (audioRef.current) {
      audioRef.current.volume = normalizedVolume;
    }

    if (hostVoiceAudioRef.current) {
      hostVoiceAudioRef.current.volume = normalizedVolume;
    }
  }, [volume]);

  function handleAvatarUpload(target: "host" | "user") {
    return (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.currentTarget.files?.[0];

      if (!file) {
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          if (target === "host") {
            setHostAvatar(reader.result);
          } else {
            setUserAvatar(reader.result);
          }
        }
      };
      reader.readAsDataURL(file);
      event.currentTarget.value = "";
    };
  }

  function stopHostSpeechProgressLoop() {
    if (hostSpeechProgressFrameRef.current !== null) {
      window.cancelAnimationFrame(hostSpeechProgressFrameRef.current);
      hostSpeechProgressFrameRef.current = null;
    }
  }

  function duckMusicForHostVoice() {
    const audio = audioRef.current;
    if (!audio || audio.paused) return;

    if (musicVolumeBeforeDuckRef.current === null) {
      musicVolumeBeforeDuckRef.current = audio.volume;
    }

    audio.volume = Math.max(0.08, (volume / 100) * 0.24);
  }

  function restoreMusicAfterHostVoice() {
    const audio = audioRef.current;
    if (audio) {
      audio.volume = volume / 100;
    }

    musicVolumeBeforeDuckRef.current = null;
  }

  function startEstimatedHostSpeechProgress(text: string) {
    stopHostSpeechProgressLoop();
    hostSpeechStartedAtRef.current = window.performance.now();
    hostSpeechDurationRef.current = estimateSpeechDuration(text);

    const tick = () => {
      if (hostSpeechCancelledRef.current) {
        hostSpeechProgressFrameRef.current = null;
        return;
      }

      const elapsedSeconds = (window.performance.now() - hostSpeechStartedAtRef.current) / 1000;
      const nextProgress = Math.min(0.98, elapsedSeconds / hostSpeechDurationRef.current);
      setHostSpeechProgress((current) => Math.max(current, nextProgress));

      if (nextProgress < 0.98) {
        hostSpeechProgressFrameRef.current = window.requestAnimationFrame(tick);
      } else {
        hostSpeechProgressFrameRef.current = null;
      }
    };

    hostSpeechProgressFrameRef.current = window.requestAnimationFrame(tick);
  }

  function startAudioHostSpeechProgress(audio: HTMLAudioElement, text: string) {
    stopHostSpeechProgressLoop();

    const tick = () => {
      if (hostSpeechCancelledRef.current || audio.paused || audio.ended) {
        hostSpeechProgressFrameRef.current = null;
        return;
      }

      const durationSeconds = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : estimateSpeechDuration(text);
      setHostSpeechProgress(Math.min(0.98, audio.currentTime / durationSeconds));
      hostSpeechProgressFrameRef.current = window.requestAnimationFrame(tick);
    };

    hostSpeechProgressFrameRef.current = window.requestAnimationFrame(tick);
  }

  function cancelHostVoice() {
    const audio = audioRef.current;
    hostSpeechCancelledRef.current = true;
    stopHostSpeechProgressLoop();
    hostVoiceAudioRef.current?.pause();
    hostVoiceAudioRef.current = null;

    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    setIsHostSpeaking(false);
    setHostSpeechProgress(0);

    if (audio) {
      audio.pause();
    }

    restoreMusicAfterHostVoice();
  }

  function stopHostVoicePlayback() {
    hostSpeechCancelledRef.current = true;
    stopHostSpeechProgressLoop();
    hostVoiceAudioRef.current?.pause();
    hostVoiceAudioRef.current = null;

    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    setHostSpeechProgress(0);
    restoreMusicAfterHostVoice();
  }

  function playHostVoiceAudio(src: string, text = hostMessage) {
    return new Promise<void>((resolve, reject) => {
      const intro = new Audio(src);
      hostVoiceAudioRef.current = intro;
      intro.crossOrigin = "anonymous";
      intro.preload = "auto";
      intro.volume = volume / 100;
      intro.onloadedmetadata = () => {
        setHostSpeechProgress(0);
      };
      intro.ontimeupdate = () => {
        const durationSeconds = intro.duration || estimateSpeechDuration(text);
        setHostSpeechProgress(Math.min(1, intro.currentTime / durationSeconds));
      };

      intro.onended = () => {
        stopHostSpeechProgressLoop();
        setHostSpeechProgress(1);
        if (hostVoiceAudioRef.current === intro) {
          hostVoiceAudioRef.current = null;
        }
        resolve();
      };

      intro.onerror = () => {
        stopHostSpeechProgressLoop();
        if (hostVoiceAudioRef.current === intro) {
          hostVoiceAudioRef.current = null;
        }
        reject(new Error("Host voice audio failed"));
      };

      void intro.play().then(() => startAudioHostSpeechProgress(intro, text)).catch(reject);
    });
  }

  function speakHostMessage(text: string) {
    return new Promise<void>((resolve) => {
      if (!("speechSynthesis" in window)) {
        resolve();
        return;
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = /[\u4e00-\u9fff]/.test(text) ? "zh-CN" : "en-US";
      utterance.rate = 0.92;
      utterance.pitch = 0.86;
      utterance.volume = volume / 100;
      startEstimatedHostSpeechProgress(text);
      utterance.onboundary = (event) => {
        if (typeof event.charIndex === "number" && text.length > 0) {
          setHostSpeechProgress((current) => Math.max(current, getSpeakableProgress(text, event.charIndex)));
        }
      };
      utterance.onend = () => {
        stopHostSpeechProgressLoop();
        setHostSpeechProgress(1);
        resolve();
      };
      utterance.onerror = () => {
        stopHostSpeechProgressLoop();
        setHostSpeechProgress(1);
        resolve();
      };
      window.speechSynthesis.speak(utterance);
    });
  }

  async function playHostIntro() {
    if (!hostMessage || spokenIntroKeysRef.current.has(hostIntroKey)) {
      return true;
    }

    hostSpeechCancelledRef.current = false;
    setIsHostSpeaking(true);
    setHostSpeechProgress(0);
    duckMusicForHostVoice();

    try {
      const introText = await fetchHostIntroCopy();
      setHostChatReply(introText);
      const voice = await fetchHostVoice({
        text: introText,
        slotId: isBeforeSleepDemoTrack(currentTrack) ? "video-demo-warm-house-opening-english" : plannerSlot?.id
      });

      if (hostSpeechCancelledRef.current) {
        return false;
      }

      if (voice.audioUrl && !voice.fallback) {
        await playHostVoiceAudio(audioUrl(voice.audioUrl), voice.text || introText);
      } else {
        await speakHostMessage(voice.text || introText);
      }
    } catch {
      await speakHostMessage(hostMessage);
    } finally {
      stopHostSpeechProgressLoop();
      setIsHostSpeaking(false);
      setHostSpeechProgress(0);
      restoreMusicAfterHostVoice();
    }

    if (hostSpeechCancelledRef.current) {
      return false;
    }

    spokenIntroKeysRef.current.add(hostIntroKey);
    return true;
  }

  async function fetchHostIntroCopy() {
    const cached = hostIntroCopyCacheRef.current.get(hostIntroKey);
    if (cached) return cached;

    if (isBeforeSleepDemoTrack(currentTrack)) {
      hostIntroCopyCacheRef.current.set(hostIntroKey, beforeSleepDemoIntro);
      return beforeSleepDemoIntro;
    }

    const response = await fetch(`${apiBase}/api/host/intro-copy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        currentSlot: plannerSlot,
        currentTrack: {
          id: currentTrack.id,
          title: currentTrack.title,
            artist: currentTrack.artist,
            source: currentTrack.source,
            durationSeconds: currentTrack.durationSeconds,
            mood: currentTrack.mood,
            reason: currentTrack.reason,
            tags: currentTrack.tags
          }
        })
      });

    if (!response.ok) {
      throw new Error("Host intro copy failed");
    }

    const data = (await response.json()) as { text?: string };
    const text = data.text?.trim() || hostMessage;
    hostIntroCopyCacheRef.current.set(hostIntroKey, text);
    return text;
  }

  async function playHostReplyVoice(text: string) {
    const replyText = text.trim();
    if (!replyText) return;

    stopHostVoicePlayback();
    hostSpeechCancelledRef.current = false;
    setIsHostSpeaking(true);
    setHostSpeechProgress(0);
    duckMusicForHostVoice();

    try {
      const voice = await fetchHostVoice({ text: replyText, slotId: plannerSlot?.id });

      if (hostSpeechCancelledRef.current) {
        return;
      }

      if (voice.audioUrl && !voice.fallback) {
        await playHostVoiceAudio(audioUrl(voice.audioUrl), voice.text || replyText);
      } else {
        await speakHostMessage(voice.text || replyText);
      }
    } catch {
      await speakHostMessage(replyText);
    } finally {
      stopHostSpeechProgressLoop();
      setIsHostSpeaking(false);
      setHostSpeechProgress(0);
      restoreMusicAfterHostVoice();
    }
  }

  async function playMusicAfterIntro() {
    const audio = audioRef.current;
    const shouldLayerIntroOverPrelude =
      Boolean(audio && currentTrack.audioSrc) &&
      isBeforeSleepDemoTrack(currentTrack) &&
      !spokenIntroKeysRef.current.has(hostIntroKey);

    if (shouldLayerIntroOverPrelude && audio) {
      try {
        if (audio.currentTime < 1) {
          audio.currentTime = 0;
        }

        audio.volume = volume / 100;
        await audio.play();
        setIsPlaying(true);
        duckMusicForHostVoice();
      } catch {
        setIsPlaying(false);
      }
    }

    const canContinue = await playHostIntro();
    if (!canContinue) return;

    if (!audio || !currentTrack.audioSrc) {
      setIsPlaying(false);
      return;
    }

    try {
      await audio.play();
      setIsPlaying(true);
    } catch {
      setIsPlaying(false);
    }
  }

  async function togglePlay() {
    if (!currentTrack.audioSrc && !isBeforeSleepDemoTrack(currentTrack)) return;

    if (isPlaying || isHostSpeaking) {
      cancelHostVoice();
      setIsPlaying(false);
      return;
    }

    await playMusicAfterIntro();
  }

  function switchToScheduleSlot(slot: PlannerSlot, index: number, shouldContinuePlaying: boolean) {
    const nextQueue = getPlaybackQueue(slot);
    const safeIndex = Math.min(Math.max(index, 0), Math.max(nextQueue.length - 1, 0));

    if (shouldContinuePlaying) {
      pendingPlayAfterTrackChangeRef.current = true;
    }

    setIsPlaying(false);
    setPlannerSlot(slot);
    setCurrentIndex(safeIndex);
    setCurrentTime(0);
    setDuration(nextQueue[safeIndex]?.durationSeconds ?? fallbackTrack.durationSeconds);
    setHostChatReply(null);
  }

  function goToPrevious() {
    if (onlineTrack) {
      setOnlineTrack(null);
      setCurrentTime(0);
      setIsPlaying(false);
      return;
    }

    const shouldContinuePlaying = isPlaying || isHostSpeaking;
    const slots = plannerDay?.slots ?? [];
    const slotIndex = slots.findIndex((slot) => slot.id === plannerSlot?.id);

    cancelHostVoice();
    setCurrentTime(0);

    if (currentIndex > 0) {
      if (shouldContinuePlaying) {
        pendingPlayAfterTrackChangeRef.current = true;
      }

      setIsPlaying(false);
      setCurrentIndex((index) => index - 1);
      return;
    }

    if (slotIndex >= 0 && slots.length > 0) {
      const previousSlot = slots[slotIndex <= 0 ? slots.length - 1 : slotIndex - 1];
      switchToScheduleSlot(previousSlot, getPlaybackQueue(previousSlot).length - 1, shouldContinuePlaying);
      return;
    }

    if (shouldContinuePlaying) {
      pendingPlayAfterTrackChangeRef.current = true;
    }

    setIsPlaying(false);
    setCurrentIndex((index) => (index <= 0 ? playbackQueue.length - 1 : index - 1));
  }

  function goToNext() {
    if (onlineTrack) {
      setOnlineTrack(null);
      setCurrentTime(0);
      setIsPlaying(false);
      return;
    }

    const shouldContinuePlaying = isPlaying || isHostSpeaking;
    const slots = plannerDay?.slots ?? [];
    const slotIndex = slots.findIndex((slot) => slot.id === plannerSlot?.id);

    cancelHostVoice();
    setCurrentTime(0);

    if (currentIndex + 1 < playbackQueue.length) {
      if (shouldContinuePlaying) {
        pendingPlayAfterTrackChangeRef.current = true;
      }

      setIsPlaying(false);
      setCurrentIndex((index) => index + 1);
      return;
    }

    if (slotIndex >= 0 && slots.length > 0) {
      const nextSlot = slots[slotIndex + 1 >= slots.length ? 0 : slotIndex + 1];
      switchToScheduleSlot(nextSlot, 0, shouldContinuePlaying);
      return;
    }

    if (shouldContinuePlaying) {
      pendingPlayAfterTrackChangeRef.current = true;
    }

    setIsPlaying(false);
    setCurrentIndex((index) => (index + 1 >= playbackQueue.length ? 0 : index + 1));
  }

  async function handleHostChatSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const message = chatInput.trim();
    if (!message || isSendingChat) return;

    stopVoiceInput();
    setSubmittedUserMessage(message);
    setChatInput("");
    setIsSendingChat(true);

    try {
      const response = await sendHostChat({
        message,
        currentSlot: plannerSlot,
        currentPlaybackItem: {
          id: currentTrack.id,
          type: "music",
          title: currentTrack.title,
          artist: currentTrack.artist,
          source: currentTrack.source,
          durationSeconds: currentTrack.durationSeconds,
          mood: currentTrack.mood
        }
      });

      setHostChatReply(response.reply);
      setPendingHostVoiceText(response.reply);
      setIsSendingChat(false);
    } catch {
      const fallbackReply = "Signal dropped for a second. Codio is still here. Try that again.";
      setHostChatReply(fallbackReply);
      setPendingHostVoiceText(fallbackReply);
      setIsSendingChat(false);
    }
  }

  function stopVoiceInput() {
    const recognition = speechRecognitionRef.current;

    setIsVoiceInputActive(false);

    if (recognition) {
      recognition.onend = null;
      recognition.onerror = null;
      recognition.onresult = null;
      try {
        recognition.stop();
      } catch {
        try {
          recognition.abort();
        } catch {
          // The browser may have already stopped recognition.
        }
      }
      speechRecognitionRef.current = null;
    }
  }

  function toggleVoiceInput() {
    if (isSendingChat) return;

    if (isVoiceInputActive) {
      stopVoiceInput();
      return;
    }

    const Recognition = getSpeechRecognitionConstructor();

    if (!Recognition) {
      setHostChatReply("This browser does not support voice input yet. You can still type to Codio.");
      setPendingHostVoiceText(null);
      return;
    }

    const recognition = new Recognition();
    speechRecognitionRef.current = recognition;
    speechInputBaseRef.current = chatInput.trim();
    speechFinalTextRef.current = "";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "zh-CN";
    recognition.onresult = (event) => {
      let interimText = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result?.[0]?.transcript?.trim() ?? "";

        if (!transcript) continue;

        if (result.isFinal) {
          speechFinalTextRef.current = [speechFinalTextRef.current, transcript].filter(Boolean).join(" ");
        } else {
          interimText = [interimText, transcript].filter(Boolean).join(" ");
        }
      }

      const recognizedText = [speechFinalTextRef.current, interimText].filter(Boolean).join(" ").trim();
      const nextInput = [speechInputBaseRef.current, recognizedText].filter(Boolean).join(" ").trim();
      setChatInput(nextInput);
    };
    recognition.onerror = () => {
      speechRecognitionRef.current = null;
      setIsVoiceInputActive(false);
    };
    recognition.onend = () => {
      speechRecognitionRef.current = null;
      setIsVoiceInputActive(false);
    };

    try {
      recognition.start();
      setIsVoiceInputActive(true);
    } catch {
      speechRecognitionRef.current = null;
      setIsVoiceInputActive(false);
    }
  }

  async function replanToday() {
    if (isReplanning) return;

    setIsReplanning(true);

    try {
      const updatedPlanner = await regenerateTodayPlanner();
      const updatedSlot = getCurrentPlannerSlotFromDay(updatedPlanner);

      setPlannerDay(updatedPlanner);
      setPlannerSlot(updatedSlot);
      setCurrentIndex(0);
      setIsDemoOpeningActive(false);
      setOnlineTrack(null);
      setCurrentTime(0);
      setDuration(updatedSlot?.tracks?.[0]?.durationSeconds ?? fallbackTrack.durationSeconds);
      spokenIntroKeysRef.current.clear();
      setHostChatReply("I rebuilt today around the latest signal from your library and taste memory.");
      setPendingHostVoiceText(null);
    } catch {
      setHostChatReply("I tried to rebuild the schedule, but the planner did not answer. The current program is still safe.");
      setPendingHostVoiceText(null);
    } finally {
      setIsReplanning(false);
    }
  }

  function handleSelectScheduleSlot(slot: PlannerSlot) {
    cancelHostVoice();
    audioRef.current?.pause();
    setIsPlaying(false);
    setIsDemoOpeningActive(false);
    setPlannerSlot(slot);
    setCurrentIndex(0);
    setCurrentTime(0);
    setDuration(slot.tracks?.[0]?.durationSeconds ?? fallbackTrack.durationSeconds);
    setHostChatReply(null);
    setPendingHostVoiceText(null);
    setIsScheduleOpen(false);
  }

  async function handleLikeCurrentTrack() {
    if (isSavingLike || hasLikedCurrentTrack) return;

    setIsSavingLike(true);

    try {
      await saveListenerFeedback({
        messageId: `visual-lab-like-${Date.now()}`,
        feedbackType: "like",
        userMessage: "I like this track.",
        hostReply: displayHostMessage,
        slotId: plannerSlot?.id,
        slotTitle: plannerSlot?.title,
        track: {
          id: currentTrack.id,
          title: currentTrack.title,
          artist: currentTrack.artist,
          source: currentTrack.source,
          durationSeconds: currentTrack.durationSeconds,
          mood: currentTrack.mood,
          tags: currentTrack.tags,
          reason: currentTrack.reason
        },
        musicDirection: plannerSlot?.musicDirection,
        scene: plannerSlot?.scene,
        mood: plannerSlot?.mood,
        createdAt: new Date().toISOString()
      });

      setLikedTrackKey(currentTrackKey);
      await replanToday();
    } finally {
      setIsSavingLike(false);
    }
  }

  async function handleSaveTrackIdentity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedLibraryTrack || isSavingIdentity) return;

    setIsSavingIdentity(true);
    setLibraryStatus("正在保存...");

    try {
      const response = await fetch(`${apiBase}/api/library/tracks/${encodeURIComponent(selectedLibraryTrack.id)}/identity`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          title: identityTitle,
          artist: identityArtist
        })
      });

      if (!response.ok) {
        throw new Error("Save failed");
      }

      const data = (await response.json()) as { track: LibraryPreviewTrack };
      const updatedTrack = data.track;

      setLibraryTracks((tracks) => tracks.map((track) => (track.id === updatedTrack.id ? updatedTrack : track)));
      setPlannerSlot((slot) => patchPlannerSlotTrack(slot, updatedTrack));
      setPlannerDay((day) =>
        day
          ? {
              ...day,
              slots: day.slots.map((slot) => patchPlannerSlotTrack(slot, updatedTrack) ?? slot)
            }
          : day
      );
      setLibraryStatus("已保存，Codio 会使用这个歌名和歌手");
    } catch {
      setLibraryStatus("保存失败，请检查歌名和歌手");
    } finally {
      setIsSavingIdentity(false);
    }
  }

  async function handlePreviewOnlinePlaylist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!onlinePlaylistUrl.trim() || isLoadingOnlinePlaylist) return;

    setIsLoadingOnlinePlaylist(true);
    setOnlinePlaylistStatus("正在读取在线歌单...");
    setOnlinePlaylistPreview(null);

    try {
      const response = await fetch(`${apiBase}/api/library/online-playlist/preview`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ url: onlinePlaylistUrl.trim() })
      });

      if (!response.ok) {
        throw new Error("Online playlist preview failed");
      }

      const data = (await response.json()) as OnlinePlaylistPreview;
      setOnlinePlaylistPreview(data);
      const matchedCount = data.tracks.filter((track) => track.match?.status === "matched-local").length;
      const reviewCount = data.tracks.filter((track) => track.match?.status === "review").length;
      setOnlinePlaylistStatus(`${data.trackCount} 首在线歌曲 · ${matchedCount} 首已匹配本地 · ${reviewCount} 首待核对`);
    } catch {
      setOnlinePlaylistStatus("无法读取这个歌单链接");
    } finally {
      setIsLoadingOnlinePlaylist(false);
    }
  }

  async function useOnlineTrack(track: OnlinePlaylistTrack) {
    if (isLoadingOnlineTrackId) return;

    setIsLoadingOnlineTrackId(track.id);
    setOnlinePlaylistStatus(`正在测试：${track.title}`);

    try {
      const response = await fetch(`${apiBase}/api/music/song-url?id=${encodeURIComponent(track.id)}`, { cache: "no-store" });

      if (!response.ok) {
        throw new Error("Song URL failed");
      }

      const data = (await response.json()) as { playable: boolean; url?: string; reason?: string; source?: string };

      if (!data.playable || !data.url) {
        setOnlinePlaylistStatus(data.reason || "这首在线歌曲暂时不可播放");
        return;
      }

      cancelHostVoice();
      audioRef.current?.pause();
      setOnlineTrack({
        id: `netease-${track.id}`,
        title: track.title,
        artist: track.artist,
        source: data.source ?? "NetEase",
        audioSrc: data.url,
        durationSeconds: 180,
        reason: `Online track from ${onlinePlaylistPreview?.title ?? "NetEase playlist"}.`,
        mood: "online",
        tags: ["netease", "online"],
        queueCount: onlinePlaylistPreview?.trackCount ?? 0
      });
      setCurrentTime(0);
      setDuration(180);
      setHostChatReply(`Codio loaded ${track.title} by ${track.artist} from the online playlist.`);
      setPendingHostVoiceText(null);
      setOnlinePlaylistStatus(`已载入在线歌曲：${track.title}`);
      setIsLibraryOpen(false);
    } catch {
      setOnlinePlaylistStatus("无法载入这首在线歌曲");
    } finally {
      setIsLoadingOnlineTrackId(null);
    }
  }

  return (
    <div className={styles.moduleRoot}>
      <main className="visual-lab-page">
        <section className="visual-lab-device" aria-label="Codio FM radio terminal">
        <input className="visual-lab-theme-toggle" id="visual-lab-theme" type="checkbox" aria-label="Switch light theme" />
        <audio
          ref={audioRef}
          crossOrigin="anonymous"
          preload="metadata"
          src={currentTrack.audioSrc || undefined}
          onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
          onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || currentTrack.durationSeconds)}
          onEnded={goToNext}
        />

        <div className={`visual-lab-surface ${isPlaying || isHostSpeaking ? "is-on-air" : ""}`}>
          <header className="visual-lab-header">
            <div className="visual-lab-brand">
              <span className="visual-lab-pet visual-lab-brand-pet" aria-label="Electronic pet">
                <span className="visual-lab-pet-body" aria-hidden="true">
                  <span className="visual-lab-pet-ear visual-lab-pet-ear-left" />
                  <span className="visual-lab-pet-ear visual-lab-pet-ear-right" />
                  <span className="visual-lab-pet-eye visual-lab-pet-eye-left" />
                  <span className="visual-lab-pet-eye visual-lab-pet-eye-right" />
                  <span className="visual-lab-pet-mouth" />
                </span>
              </span>
              <DotMatrixLabel value="CODIO" />
            </div>

            <div className="visual-lab-actions">
              <button
                className={`visual-lab-library-button ${isLibraryOpen ? "is-open" : ""}`}
                type="button"
                aria-expanded={isLibraryOpen}
                onClick={() => setIsLibraryOpen((current) => !current)}
              >
                <span aria-hidden="true" />
                曲库
              </button>
              <label className="visual-lab-switch" htmlFor="visual-lab-theme">
                <span>DARK</span>
                <span>LIGHT</span>
              </label>
            </div>
          </header>

          <section className="visual-lab-clock" aria-label="Current broadcast time">
            <DotMatrixClock value={clockValue} />
            <p className="visual-lab-date">{clockLabel}</p>
            <p className="visual-lab-onair">ON AIR</p>
          </section>

          <section className="visual-lab-player" aria-label="Now playing">
            <div className="visual-lab-player-info">
              <div className="visual-lab-player-left">
                <button
                  className={`visual-lab-playing-bars ${isHostSpeaking ? "is-speaking" : ""}`}
                  type="button"
                  aria-label="Open Codio voice transcript"
                  aria-expanded={isVoicePanelOpen}
                  onClick={() => setIsVoicePanelOpen((current) => !current)}
                >
                  <span />
                  <span />
                  <span />
                  <span />
                </button>
                <div className="visual-lab-track">
                  <strong>{currentTrack.title}</strong>
                  <span>{currentTrack.artist}</span>
                </div>
              </div>

              <div className="visual-lab-controls" aria-label="Playback controls">
                <button type="button" aria-label="Previous" onClick={goToPrevious}>{"‹"}</button>
                <button className="visual-lab-play" type="button" aria-label={isPlaying || isHostSpeaking ? "Pause" : "Play"} onClick={togglePlay}>
                  {isPlaying || isHostSpeaking ? (
                    <span className="visual-lab-pause-icon" aria-hidden="true">
                      <span />
                      <span />
                    </span>
                  ) : (
                    <span aria-hidden="true">{"▶"}</span>
                  )}
                </button>
                <button type="button" aria-label="Next" onClick={goToNext}>{"›"}</button>
                <button
                  type="button"
                  aria-label="Like"
                  aria-pressed={hasLikedCurrentTrack}
                  disabled={isSavingLike}
                  onClick={handleLikeCurrentTrack}
                >
                  {hasLikedCurrentTrack ? "♥" : "♡"}
                </button>
              </div>

              <label className="visual-lab-volume-control">
                <span>VOL</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={volume}
                  aria-label="Volume"
                  onChange={(event) => setVolume(Number(event.currentTarget.value))}
                />
              </label>
            </div>

            <div className="visual-lab-progress-row" aria-label="Progress">
              <span>{formatTime(currentTime)}</span>
              <div className="visual-lab-progress">
                <span style={{ width: `${progress}%` }} />
              </div>
              <span>{formatTime(duration)}</span>
            </div>
          </section>

          <button
            className={`visual-lab-queue ${isScheduleOpen ? "is-open" : ""}`}
            type="button"
            aria-expanded={isScheduleOpen}
            aria-controls="visual-lab-schedule-panel"
            onClick={() => setIsScheduleOpen((current) => !current)}
          >
            <span>QUEUE</span>
            <span>{isReplanning ? "REPLANNING..." : `${plannerDay?.slots?.length ?? 0} SLOTS · ${currentTrack.queueCount} TRACKS`}</span>
          </button>

          {isScheduleOpen ? (
            <section className="visual-lab-schedule-panel" id="visual-lab-schedule-panel" aria-label="Today schedule">
              <div className="visual-lab-schedule-head">
                <span>CODIO DAILY PLANNER</span>
                <button type="button" onClick={replanToday} disabled={isReplanning}>
                  {isReplanning ? "REPLANNING" : "REPLAN"}
                </button>
                <span>{plannerDay?.weekday ?? "LOCAL"} · {plannerDay?.host ?? "CODIO"} · {libraryTracks.length || "LOADING LIBRARY"} TRACKS</span>
              </div>
              <div className="visual-lab-schedule-list">
                {(plannerDay?.slots ?? []).map((slot) => (
                  <button
                    className={`visual-lab-schedule-slot ${slot.id === plannerSlot?.id ? "is-current" : ""}`}
                    key={slot.id}
                    type="button"
                    onClick={() => handleSelectScheduleSlot(slot)}
                  >
                    <span>{slot.timeRange}</span>
                    <div>
                      <strong>{slot.title}</strong>
                      <em>{slot.musicDirection?.slice(0, 2).join(" / ") ?? slot.mood ?? "Codio selection"}</em>
                      <small>{slot.tracks?.slice(0, 2).map((track) => track.title).join(" · ") ?? "Waiting for library"}</small>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {isLibraryOpen ? (
            <section className="visual-lab-schedule-panel visual-lab-library-panel" aria-label="曲库管理">
              <div className="visual-lab-schedule-head">
                <span>曲库管理</span>
                <button type="button" onClick={() => setIsLibraryOpen(false)}>
                  关闭
                </button>
                <span>{libraryStatus || "就绪"}</span>
              </div>

              <form className="visual-lab-library-editor" onSubmit={handleSaveTrackIdentity}>
                <label>
                  <span>歌名</span>
                  <input
                    aria-label="修正歌名"
                    onChange={(event) => setIdentityTitle(event.currentTarget.value)}
                    value={identityTitle}
                  />
                </label>
                <label>
                  <span>歌手</span>
                  <input
                    aria-label="修正歌手"
                    onChange={(event) => setIdentityArtist(event.currentTarget.value)}
                    value={identityArtist}
                  />
                </label>
                <button type="submit" disabled={!selectedLibraryTrack || isSavingIdentity}>
                  {isSavingIdentity ? "保存中" : "保存"}
                </button>
              </form>

              <form className="visual-lab-library-editor" onSubmit={handlePreviewOnlinePlaylist}>
                <label>
                  <span>导入链接</span>
                  <input
                    aria-label="在线歌单链接"
                    onChange={(event) => setOnlinePlaylistUrl(event.currentTarget.value)}
                    placeholder="粘贴网易云歌单链接..."
                    value={onlinePlaylistUrl}
                  />
                </label>
                <button type="submit" disabled={isLoadingOnlinePlaylist || !onlinePlaylistUrl.trim()}>
                  {isLoadingOnlinePlaylist ? "读取中" : "预览"}
                </button>
              </form>

              {onlinePlaylistPreview ? (
                <div className="visual-lab-schedule-list" aria-label="在线歌单预览">
                  <button className="visual-lab-schedule-slot is-current" type="button">
                    <span>线上</span>
                    <div>
                      <strong>{onlinePlaylistPreview.title}</strong>
                      <em>{onlinePlaylistPreview.source}</em>
                      <small>{onlinePlaylistStatus}</small>
                    </div>
                  </button>
                  {onlinePlaylistPreview.tracks.slice(0, 12).map((track) => (
                    <button
                      className="visual-lab-schedule-slot"
                      key={`${track.id}-${track.title}`}
                      type="button"
                      onClick={() => useOnlineTrack(track)}
                    >
                      <span>{track.match?.status === "matched-local" ? "本地" : track.match?.status === "review" ? "待核" : "缺失"}</span>
                      <div>
                        <strong>{track.title}</strong>
                        <em>{track.artist}</em>
                        <small>
                          {isLoadingOnlineTrackId === track.id
                            ? "正在测试在线播放..."
                            : track.match?.localTrack
                            ? `${track.match.localTrack.title} / ${track.match.localTrack.artist} · ${Math.round(track.match.confidence * 100)}%`
                            : track.album || "在线歌单"}
                        </small>
                      </div>
                    </button>
                  ))}
                </div>
              ) : onlinePlaylistStatus ? (
                <div className="visual-lab-schedule-head">
                  <span>在线歌单</span>
                  <span>{onlinePlaylistStatus}</span>
                </div>
              ) : null}

              <div className="visual-lab-schedule-list">
                {libraryTracks.slice(0, 18).map((track) => (
                  <button
                    className={`visual-lab-schedule-slot ${track.id === selectedLibraryTrack?.id ? "is-current" : ""}`}
                    key={track.id}
                    type="button"
                    onClick={() => setSelectedLibraryTrackId(track.id)}
                  >
                    <span>{track.identityCorrected ? "已修正" : "自动"}</span>
                    <div>
                      <strong>{track.title}</strong>
                      <em>{track.artist}</em>
                      <small>{track.filename}</small>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <section className="visual-lab-host" aria-label="Codio host message">
            <div className="visual-lab-host-status">
              <div className={`visual-lab-host-avatar-wrap ${isHostCardOpen ? "is-open" : ""}`} tabIndex={0} aria-label="Codio profile card">
                <label className="visual-lab-avatar-upload" aria-label="Upload Codio avatar">
                  <span className={`visual-lab-chat-avatar ${isHostSpeaking ? "is-speaking" : ""}`} aria-hidden="true">
                    {hostAvatar ? <img src={hostAvatar} alt="" /> : <span />}
                  </span>
                  <input accept="image/*" type="file" onChange={handleAvatarUpload("host")} />
                </label>
                <aside
                  className="visual-lab-host-card"
                  id="visual-lab-host-card"
                  aria-label="Codio profile preview"
                >
                  <div className="visual-lab-host-card-head">
                    <span className="visual-lab-chat-avatar" aria-hidden="true">
                      {hostAvatar ? <img src={hostAvatar} alt="" /> : <span />}
                    </span>
                    <div>
                      <button
                        className="visual-lab-host-card-name"
                        type="button"
                        onClick={() => setIsHostProfileOpen(true)}
                      >
                        Codio
                      </button>
                      <p>{hostProfile.sourceLabel}</p>
                    </div>
                  </div>
                  <p className="visual-lab-host-card-copy">
                    {hostProfile.copy}
                  </p>
                  <div className="visual-lab-host-card-stats">
                    <div>
                      <small>ON AIR</small>
                      <strong>24/7</strong>
                    </div>
                    <div>
                      <small>GENRES</small>
                      <strong>{hostProfile.genresCount}</strong>
                    </div>
                    <div>
                      <small>STYLE</small>
                      <strong>{hostProfile.libraryLabel}</strong>
                    </div>
                  </div>
                  <div className="visual-lab-host-card-tags" aria-label="Codio library styles">
                    {hostProfile.tags.slice(0, 7).map((tag) => (
                      <b key={tag}>{tag}</b>
                    ))}
                  </div>
                </aside>
              </div>
              <button
                className="visual-lab-host-name"
                type="button"
                aria-controls="visual-lab-host-card"
                aria-expanded={isHostCardOpen}
                onClick={() => setIsHostCardOpen((current) => !current)}
              >
                Codio
              </button>
              <em className="visual-lab-live-indicator">
                <span />
                LIVE
              </em>
            </div>
            <div className={`visual-lab-message visual-lab-message-host ${isSendingChat ? "is-listening" : ""}`}>
              {isSendingChat ? (
                <div className="visual-lab-listening" aria-live="polite">
                  <span>Codio is listening</span>
                  <i aria-hidden="true" />
                  <i aria-hidden="true" />
                  <i aria-hidden="true" />
                  <i aria-hidden="true" />
                </div>
              ) : (
                <div className="visual-lab-host-reply">
                  <p>{typedHostMessage}</p>
                  {showPendingHostVoiceButton ? (
                    <button
                      className={`visual-lab-reply-voice-button ${canPlayPendingHostVoice ? "is-ready" : "is-waiting"}`}
                      type="button"
                      disabled={!canPlayPendingHostVoice}
                      onClick={() => {
                        if (!canPlayPendingHostVoice) return;
                        const text = pendingHostVoiceText;
                        setPendingHostVoiceText(null);
                        if (text) {
                          void playHostReplyVoice(text);
                        }
                      }}
                    >
                      <span aria-hidden="true">▶</span>
                      PLAY VOICE
                    </button>
                  ) : null}
                </div>
              )}
            </div>
            <div className="visual-lab-message visual-lab-message-user">
              <p>{submittedUserMessage}</p>
              <div className="visual-lab-user-identity">
                <span className="visual-lab-user-name">Immortal</span>
                <label className="visual-lab-avatar-upload visual-lab-user-upload" aria-label="Upload your avatar">
                  <span className="visual-lab-user-avatar" aria-hidden="true">
                    {userAvatar ? <img src={userAvatar} alt="" /> : <span />}
                  </span>
                  <input accept="image/*" type="file" onChange={handleAvatarUpload("user")} />
                </label>
              </div>
            </div>
          </section>

          <form
            className={`visual-lab-input ${chatInput.trim() ? "has-text" : ""} ${isVoiceInputActive ? "is-listening" : ""}`}
            onSubmit={handleHostChatSubmit}
          >
            <input
              aria-label="Say something to the DJ"
              onChange={(event) => setChatInput(event.currentTarget.value)}
              placeholder={isVoiceInputActive ? "Listening... speak to Codio" : "Say something to the DJ..."}
              type="text"
              value={chatInput}
            />
            <button
              className={`visual-lab-mic-button ${isVoiceInputActive ? "is-listening" : ""}`}
              type="button"
              aria-label={isVoiceInputActive ? "Stop voice input" : "Start voice input"}
              aria-pressed={isVoiceInputActive}
              onClick={toggleVoiceInput}
            >
              <span className="visual-lab-input-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" role="img">
                  <path d="M12 4.75c1.35 0 2.45 1.1 2.45 2.45v4.1c0 1.35-1.1 2.45-2.45 2.45s-2.45-1.1-2.45-2.45V7.2c0-1.35 1.1-2.45 2.45-2.45Z" />
                  <path d="M6.9 11.15c0 2.82 2.28 5.1 5.1 5.1s5.1-2.28 5.1-5.1" />
                  <path d="M12 16.25v3.15" />
                </svg>
              </span>
            </button>
            <button className="visual-lab-send-button" type="submit" aria-label="Send" disabled={isSendingChat}>
              <span className="visual-lab-input-icon" aria-hidden="true">
                {isSendingChat ? (
                  <span className="visual-lab-input-loading" />
                ) : (
                  <svg viewBox="0 0 24 24" role="img">
                    <path d="M12 18.5V5.5" />
                    <path d="M6.75 10.75 12 5.5l5.25 5.25" />
                  </svg>
                )}
              </span>
            </button>
          </form>
          <div className="visual-lab-status">
            <span>CODIO FM.</span>
            <span>CONNECTED.</span>
          </div>
          {isHostProfileOpen ? (
            <section className="visual-lab-profile-panel" aria-label="Codio full profile">
              <button type="button" aria-label="Close Codio profile" onClick={() => setIsHostProfileOpen(false)}>
                CLOSE
              </button>
              <div className="visual-lab-profile-head">
                <span className="visual-lab-chat-avatar" aria-hidden="true">
                  {hostAvatar ? <img src={hostAvatar} alt="" /> : <span />}
                </span>
                <div>
                  <strong>Codio</strong>
                  <p>{hostProfile.sourceLabel}</p>
                </div>
              </div>
              <p className="visual-lab-profile-copy">
                {hostProfile.copy}
              </p>
              <div className="visual-lab-profile-stats">
                <div>
                  <small>ON AIR</small>
                  <strong>24/7</strong>
                </div>
                <div>
                  <small>GENRES</small>
                  <strong>{hostProfile.genresCount}</strong>
                </div>
                <div>
                  <small>STYLE</small>
                  <strong>{hostProfile.libraryLabel}</strong>
                </div>
              </div>
              <div className="visual-lab-profile-tags" aria-label="Codio full library styles">
                {hostProfile.tags.map((tag) => (
                  <b key={tag}>{tag}</b>
                ))}
              </div>
            </section>
          ) : null}
          {isVoicePanelOpen ? (
            <section
              className={`visual-lab-voice-panel ${isHostSpeaking ? "is-speaking" : ""}`}
              aria-label="Codio voice transcript"
            >
              <button type="button" aria-label="Close Codio voice transcript" onClick={() => setIsVoicePanelOpen(false)}>
                CLOSE
              </button>
              <div className="visual-lab-voice-wave" aria-hidden="true">
                {Array.from({ length: 78 }).map((_, index) => {
                  const position = index / 77;
                  const peaks = [0.22, 0.52, 0.82];
                  const peak = peaks.reduce((max, center) => {
                    const distance = Math.abs(position - center);
                    return Math.max(max, Math.max(0, 1 - distance / 0.105));
                  }, 0);
                  const ripple = 0.74 + Math.sin(index * 1.7) * 0.14 + Math.sin(index * 0.53) * 0.08;
                  const height = Math.round(14 + peak * 72 * ripple + Math.abs(Math.sin(index * 0.9)) * 8);

                  return (
                    <span
                      key={index}
                      style={{
                        "--bar": `${height}%`,
                        "--delay": `${-(index % 19) * 0.045}s`,
                        "--alpha": `${0.38 + ((index * 11) % 42) / 100}`
                      } as CSSProperties}
                    />
                  );
                })}
              </div>
              <div className="visual-lab-voice-card">
                <p className="visual-lab-voice-eyebrow">Codio · {formatTime(currentTime)}</p>
                <h2>Codio&apos;s Host Break</h2>
                <p className="visual-lab-voice-track">{currentTrack.title} / {currentTrack.artist}</p>
                <div className="visual-lab-voice-playline">
                  <span>{formatTime(currentTime)}</span>
                  <i><b style={{ width: `${progress}%` }} /></i>
                  <span>{formatTime(duration)}</span>
                </div>
                <div className="visual-lab-voice-script">
                  {(displayHostParagraphs.length > 0 ? displayHostParagraphs : displayHostSegments).slice(0, 5).map((paragraph, index) => {
                    const range = paragraphProgressRange(displayHostParagraphs, index);
                    const isActiveParagraph = hostSpeechProgress >= range.start && hostSpeechProgress <= range.end;
                    const paragraphProgress =
                      isHostSpeaking && range.end > range.start
                        ? Math.min(1, Math.max(0, (hostSpeechProgress - range.start) / (range.end - range.start)))
                        : 0;

                    return (
                      <p
                        className={index === 0 || isActiveParagraph ? "visual-lab-voice-current" : ""}
                        key={`${paragraph}-${index}`}
                      >
                        <strong>Codio · 0:{String(index * 5 + 1).padStart(2, "0")}</strong>
                        {isActiveParagraph ? (
                          <VoiceTranscriptWords isSpeaking={isHostSpeaking} progress={paragraphProgress} text={paragraph} />
                        ) : (
                          paragraph
                        )}
                      </p>
                    );
                  })}
                </div>
              </div>
            </section>
          ) : null}
        </div>
        </section>
      </main>
    </div>
  );
}
