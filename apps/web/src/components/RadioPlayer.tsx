"use client";

import { Heart, Pause, Play, SkipForward, StepBack, Volume2 } from "lucide-react";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  audioUrl,
  fetchCurrentPlannerSlot,
  fetchHostVoice,
  type CurrentPlaybackItemContext,
  type PlannerSlot,
  type Program
} from "../lib/api";
import { AvatarBadge } from "./AvatarBadge";
import { HostProfileHoverCard } from "./HostProfileHoverCard";
import { RadioHostChat } from "./RadioHostChat";

type RadioPlayerProps = {
  program: Program;
};

type CurrentPlaybackItem = {
  id: string;
  type: Program["items"][number]["type"];
  title: string;
  artist: string;
  audioUrl: string;
  audioSrc: string;
  source: "program" | "planner";
  durationSeconds: number;
  mood?: string | null;
};

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

function formatClock(date: Date) {
  return date
    .toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    })
    .replace(":", " ");
}

function formatWeekday(date: Date) {
  return date.toLocaleDateString("en-US", { weekday: "long" });
}

function formatCalendar(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).formatToParts(date);
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value.toUpperCase() ?? "";
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  return `${day} · ${month} · ${year}`;
}

function voiceVersion(program: Program) {
  return program.items
    .filter((item) => item.type === "voice")
    .map((item) => `${item.id}:${item.script ?? ""}`)
    .join("|");
}

function cleanDisplayTitle(title: string) {
  return title.replace(/^(推荐：|下一首：)/, "").trim();
}

export function RadioPlayer({ program }: RadioPlayerProps) {
  const deviceRef = useRef<HTMLElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const meterFrameRef = useRef<number | null>(null);
  const hostIntroAudioRef = useRef<HTMLAudioElement | null>(null);
  const hostUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const hostSpeechCancelledRef = useRef(false);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isHostSpeaking, setIsHostSpeaking] = useState(false);
  const [hasSpokenHostOpening, setHasSpokenHostOpening] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [plannerSlot, setPlannerSlot] = useState<PlannerSlot | null>(null);
  const [plannerStatus, setPlannerStatus] = useState<"loading" | "ready" | "error">("loading");

  const programKey = useMemo(
    () => `${program.items.map((item) => item.id).join("|")}::${voiceVersion(program)}`,
    [program]
  );
  const programPlaybackQueue = useMemo<CurrentPlaybackItem[]>(
    () =>
      program.items.map((item) => {
        const baseSrc = audioUrl(item.audioUrl);
        const audioSrc =
          item.type === "voice"
            ? `${baseSrc}${baseSrc.includes("?") ? "&" : "?"}v=${encodeURIComponent(programKey)}`
            : baseSrc;

        return {
          id: item.id,
          type: item.type,
          title: cleanDisplayTitle(item.title),
          artist: item.artist,
          audioUrl: item.audioUrl,
          audioSrc,
          source: "program",
          durationSeconds: item.durationSeconds,
          mood: item.mood
        };
      }),
    [program.items, programKey]
  );
  const plannerPlaybackQueue = useMemo<CurrentPlaybackItem[]>(
    () => {
      if (!plannerSlot) return [];

      return (plannerSlot.tracks ?? [])
        .filter((track) => Boolean(track.audioUrl ?? track.audioSrc))
        .map((track, index) => {
          const rawAudioUrl = track.audioUrl ?? track.audioSrc ?? "";

          return {
            id: track.id ?? `${plannerSlot.id}-track-${index + 1}`,
            type: "music" as const,
            title: cleanDisplayTitle(track.title),
            artist: track.artist ?? "Unknown",
            audioUrl: rawAudioUrl,
            audioSrc: audioUrl(rawAudioUrl),
            source: "planner" as const,
            durationSeconds: track.durationSeconds ?? 180,
            mood: track.mood ?? track.tags?.[0] ?? plannerSlot.mood ?? null
          };
        });
    },
    [plannerSlot]
  );
  const playbackQueue = plannerPlaybackQueue.length > 0 ? plannerPlaybackQueue : programPlaybackQueue;
  const playbackQueueKey = playbackQueue.map((item) => `${item.source}:${item.id}:${item.audioUrl}`).join("|");
  const currentPlaybackItem = playbackQueue[currentIndex] ?? playbackQueue[0];
  const displayTitle = currentPlaybackItem.title;
  const displayArtist = currentPlaybackItem.artist;
  const displaySlotLabel = plannerSlot ? `${plannerSlot.title} · ${plannerSlot.timeRange}` : "Local radio mode";
  const displayDirection = plannerSlot?.musicDirection?.join(" / ") ?? currentPlaybackItem.mood ?? "Codio Selection";
  const queueCount = playbackQueue.length;
  const currentPlaybackContext: CurrentPlaybackItemContext = {
    id: currentPlaybackItem.id,
    type: currentPlaybackItem.type,
    title: currentPlaybackItem.title,
    artist: currentPlaybackItem.artist,
    source: currentPlaybackItem.source,
    durationSeconds: currentPlaybackItem.durationSeconds,
    mood: currentPlaybackItem.mood
  };

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("claudio-theme");
    if (savedTheme === "dark" || savedTheme === "light") {
      setTheme(savedTheme);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("claudio-theme", theme);
  }, [theme]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let ignore = false;

    async function loadPlannerSlot() {
      setPlannerStatus("loading");

      try {
        const slot = await fetchCurrentPlannerSlot();
        if (ignore) return;
        setPlannerSlot(slot);
        setPlannerStatus("ready");
      } catch {
        if (ignore) return;
        setPlannerSlot(null);
        setPlannerStatus("error");
      }
    }

    void loadPlannerSlot();

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (meterFrameRef.current) {
        window.cancelAnimationFrame(meterFrameRef.current);
      }
      cancelHostSpeech();
      void audioContextRef.current?.close();
    };
  }, []);

  useEffect(() => {
    cancelHostSpeech();
    audioRef.current?.pause();
    setCurrentIndex(0);
    setIsPlaying(false);
    setCurrentTime(0);
    setPlaybackError(null);
  }, [playbackQueueKey]);

  useEffect(() => {
    setHasSpokenHostOpening(false);
  }, [plannerSlot?.id, plannerSlot?.hostOpening]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.crossOrigin = "anonymous";
    audio.src = currentPlaybackItem.audioSrc;
    audio.load();
    setCurrentTime(0);
    setDuration(currentPlaybackItem.durationSeconds);
    setPlaybackError(null);

    if (isPlaying) {
      void audio.play().catch(() => handlePlaybackFailure(currentPlaybackItem.title));
    }
  }, [currentPlaybackItem, isPlaying]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => setDuration(audio.duration || currentPlaybackItem.durationSeconds);
    const onError = () => handlePlaybackFailure(currentPlaybackItem.title);
    const onEnded = () => goToNext();

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("error", onError);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("error", onError);
      audio.removeEventListener("ended", onEnded);
    };
  }, [currentPlaybackItem.durationSeconds, currentPlaybackItem.title, playbackQueue.length]);

  async function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying || isHostSpeaking) {
      cancelHostSpeech();
      audio.pause();
      setIsPlaying(false);
      return;
    }

    try {
      await ensureAudioMeter();
      const shouldSpeakHostOpening = Boolean(plannerSlot?.hostOpening && !hasSpokenHostOpening);
      if (shouldSpeakHostOpening) {
        const introResult = await playHostOpening(plannerSlot?.hostOpening ?? "");
        if (introResult === "cancelled") return;
        setHasSpokenHostOpening(true);
      }
      await audio.play();
      setIsPlaying(true);
      setPlaybackError(null);
    } catch {
      handlePlaybackFailure(currentPlaybackItem.title);
    }
  }

  function previous() {
    goToPrevious();
  }

  function next() {
    goToNext();
  }

  function goToPrevious() {
    cancelHostSpeech();
    setCurrentTime(0);
    setPlaybackError(null);
    setCurrentIndex((index) => (index <= 0 ? playbackQueue.length - 1 : index - 1));
  }

  function goToNext() {
    cancelHostSpeech();
    setCurrentTime(0);
    setPlaybackError(null);
    setCurrentIndex((index) => (index + 1 >= playbackQueue.length ? 0 : index + 1));
  }

  function cancelHostSpeech() {
    hostSpeechCancelledRef.current = true;
    hostUtteranceRef.current = null;
    setIsHostSpeaking(false);

    if (hostIntroAudioRef.current) {
      hostIntroAudioRef.current.pause();
      hostIntroAudioRef.current.src = "";
      hostIntroAudioRef.current = null;
    }

    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }

  async function playHostOpening(text: string): Promise<"ended" | "cancelled"> {
    const hostOpening = text.trim();
    if (!hostOpening) return "ended";

    hostSpeechCancelledRef.current = false;
    setIsHostSpeaking(true);

    try {
      const voice = await fetchHostVoice({
        text: hostOpening,
        slotId: plannerSlot?.id
      });

      if (hostSpeechCancelledRef.current) return "cancelled";

      if (voice.audioUrl && !voice.fallback) {
        const result = await playHostVoiceAudio(audioUrl(voice.audioUrl));
        setIsHostSpeaking(false);
        return result;
      }
    } catch (error) {
      console.warn("Host voice audio unavailable, falling back to browser speech.", error);
    }

    if (hostSpeechCancelledRef.current) return "cancelled";
    return speakHostOpening(hostOpening);
  }

  function playHostVoiceAudio(src: string): Promise<"ended" | "cancelled"> {
    return new Promise((resolve, reject) => {
      const intro = new Audio(src);
      let settled = false;

      const finish = (result: "ended" | "cancelled") => {
        if (settled) return;
        settled = true;
        intro.onended = null;
        intro.onerror = null;
        intro.onpause = null;
        if (hostIntroAudioRef.current === intro) {
          hostIntroAudioRef.current = null;
        }
        resolve(result);
      };

      intro.crossOrigin = "anonymous";
      intro.preload = "auto";
      intro.onended = () => finish(hostSpeechCancelledRef.current ? "cancelled" : "ended");
      intro.onpause = () => {
        if (hostSpeechCancelledRef.current) finish("cancelled");
      };
      intro.onerror = () => {
        if (settled) return;
        settled = true;
        if (hostIntroAudioRef.current === intro) {
          hostIntroAudioRef.current = null;
        }
        reject(new Error("Host voice audio failed"));
      };
      hostIntroAudioRef.current = intro;

      void intro.play().catch((error) => {
        if (hostIntroAudioRef.current === intro) {
          hostIntroAudioRef.current = null;
        }
        reject(error);
      });
    });
  }

  function speakHostOpening(text: string): Promise<"ended" | "cancelled"> {
    const hostOpening = text.trim();
    if (!hostOpening || !("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
      setIsHostSpeaking(false);
      return Promise.resolve("ended");
    }

    return new Promise((resolve) => {
      cancelHostSpeech();
      hostSpeechCancelledRef.current = false;

      const utterance = new SpeechSynthesisUtterance(hostOpening);
      utterance.lang = /[\u4e00-\u9fff]/.test(hostOpening) ? "zh-CN" : "en-US";
      utterance.rate = 0.92;
      utterance.pitch = 0.85;
      utterance.volume = 0.95;
      hostUtteranceRef.current = utterance;
      setIsHostSpeaking(true);

      utterance.onend = () => {
        const result = hostSpeechCancelledRef.current ? "cancelled" : "ended";
        hostUtteranceRef.current = null;
        setIsHostSpeaking(false);
        resolve(result);
      };
      utterance.onerror = () => {
        hostUtteranceRef.current = null;
        setIsHostSpeaking(false);
        resolve("ended");
      };

      window.speechSynthesis.speak(utterance);
    });
  }

  function handlePlaybackFailure(title: string) {
    setIsPlaying(false);
    setPlaybackError(`无法播放《${title}》，正在切换到下一段。`);
    window.setTimeout(() => {
      goToNext();
      setIsPlaying(true);
    }, 1000);
  }

  async function ensureAudioMeter() {
    const audio = audioRef.current;
    if (!audio) return;

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      analyserRef.current.smoothingTimeConstant = 0.72;
    }

    const context = audioContextRef.current;
    const analyser = analyserRef.current;

    if (!sourceRef.current && analyser) {
      sourceRef.current = context.createMediaElementSource(audio);
      sourceRef.current.connect(analyser);
      analyser.connect(context.destination);
    }

    if (context.state === "suspended") {
      await context.resume();
    }

    startAudioMeter();
  }

  function startAudioMeter() {
    if (meterFrameRef.current) return;

    const tick = () => {
      const analyser = analyserRef.current;
      const node = deviceRef.current;

      if (analyser && node) {
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        const average = data.reduce((sum, value) => sum + value, 0) / data.length;
        const level = Math.min(1, Math.max(0, average / 150));
        node.style.setProperty("--audio-level", level.toFixed(3));
      }

      meterFrameRef.current = window.requestAnimationFrame(tick);
    };

    meterFrameRef.current = window.requestAnimationFrame(tick);
  }

  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <section
      className={`radio-device theme-${theme} ${isPlaying || isHostSpeaking ? "is-playing" : ""}`}
      data-theme={theme}
      ref={deviceRef}
      style={{ "--audio-level": 0 } as CSSProperties}
      aria-label="24 hour AI radio"
    >
      <audio ref={audioRef} crossOrigin="anonymous" preload="metadata" src={currentPlaybackItem.audioSrc} />

      <header className="device-header">
        <div className="device-host-lockup">
          <HostProfileHoverCard>
            <AvatarBadge kind="host" className="device-host-avatar" />
          </HostProfileHoverCard>
          <strong>Codio</strong>
        </div>
        <div className="device-header-actions">
          <span>LOGIN</span>
          <button aria-pressed={theme === "dark"} className={theme === "dark" ? "active" : ""} type="button" onClick={() => setTheme("dark")}>DARK</button>
          <button aria-pressed={theme === "light"} className={theme === "light" ? "active" : ""} type="button" onClick={() => setTheme("light")}>LIGHT</button>
        </div>
      </header>

      <section className="device-player" aria-label="播放界面">
        <div className="device-time-block">
          <p className="device-time">{formatClock(now)}</p>
          <p className="device-weekday">{formatWeekday(now)}</p>
          <p className="device-date">{formatCalendar(now)}</p>
        </div>

        <div className="device-track">
          <span className="device-air live">ON AIR</span>
          {isHostSpeaking ? <span className="device-host-voice">HOST VOICE</span> : null}
          <span className="device-slot-label">{displaySlotLabel}</span>
          <span className="device-now-label">Now Playing</span>
          <h2>{displayTitle}</h2>
          <p>{displayArtist} · Codio Selection</p>
          <small>{displayDirection}</small>
          {plannerStatus === "loading" ? (
            <span className="device-planner-note">Connecting to Codio planner...</span>
          ) : null}
          {plannerStatus === "error" ? (
            <span className="device-planner-note warning">Planner 暂时离线，先使用本地电台模式。</span>
          ) : null}
        </div>

        <div className="device-controls">
          <button type="button" onClick={previous} aria-label="Previous"><StepBack size={15} /></button>
          <button className="device-play" type="button" onClick={togglePlay} aria-label={isPlaying ? "Pause" : "Play"}>
            {isPlaying ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <button type="button" onClick={next} aria-label="Next"><SkipForward size={15} /></button>
          <button type="button" aria-label="Favorite"><Heart size={15} /></button>
          <button type="button" aria-label="Volume"><Volume2 size={15} /></button>
        </div>

        <div className="device-progress-row">
          <span>{formatTime(currentTime)}</span>
          <div className="device-progress" aria-label="Playback progress"><span style={{ width: `${progress}%` }} /></div>
          <span>{formatTime(duration)}</span>
        </div>
        {playbackError ? <p className="device-error">{playbackError}</p> : null}
      </section>

      <div className="device-queue-bar">
        <span>QUEUE</span>
        <span>{queueCount} TRACKS</span>
      </div>

      <RadioHostChat
        currentArtist={displayArtist}
        currentMood={plannerSlot?.mood ?? currentPlaybackItem.mood ?? undefined}
        currentTitle={displayTitle}
        currentPlaybackItem={currentPlaybackContext}
        plannerSlot={plannerSlot}
        plannerStatus={plannerStatus}
      />
    </section>
  );
}
