"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { audioUrl, type Program } from "../lib/api";
import { ClaudioAvatar } from "./ClaudioAvatar";
import { RadioControls } from "./RadioControls";

type ClaudioRadioShellProps = {
  program: Program;
};

function formatClock(date: Date) {
  return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatDate(date: Date) {
  return date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "2-digit" }).toUpperCase();
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

export function ClaudioRadioShell({ program }: ClaudioRadioShellProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentIndex, setCurrentIndex] = useState(() => Math.max(0, program.items.findIndex((item) => item.type === "music")));
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  const currentItem = program.items[currentIndex] ?? program.items[0];
  const hostItem = useMemo(
    () => program.items.find((item) => item.type === "voice" && item.script) ?? program.items.find((item) => item.script),
    [program.items]
  );
  const currentSrc = currentItem ? audioUrl(currentItem.audioUrl) : "";
  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentSrc) return;

    audio.src = currentSrc;
    audio.load();
    setCurrentTime(0);
    setDuration(currentItem.durationSeconds);
    setPlaybackError(null);

    if (isPlaying) {
      void audio.play().catch(() => {
        setIsPlaying(false);
        setPlaybackError("Playback is unavailable for this segment.");
      });
    }
  }, [currentSrc, currentItem.durationSeconds, isPlaying]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => setDuration(audio.duration || currentItem.durationSeconds);
    const onEnded = () => next();
    const onError = () => {
      setIsPlaying(false);
      setPlaybackError("Playback is unavailable for this segment.");
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
    };
  }, [currentItem.durationSeconds, program.items.length]);

  async function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      return;
    }

    try {
      await audio.play();
      setIsPlaying(true);
      setPlaybackError(null);
    } catch {
      setIsPlaying(false);
      setPlaybackError("Playback is unavailable for this segment.");
    }
  }

  function previous() {
    setCurrentIndex((index) => (index <= 0 ? program.items.length - 1 : index - 1));
  }

  function next() {
    setCurrentIndex((index) => (index + 1 >= program.items.length ? 0 : index + 1));
  }

  return (
    <main className="claudio-shell">
      <section className={`claudio-device ${theme === "light" ? "is-light" : "is-dark"} ${isPlaying ? "is-playing" : ""}`}>
        <audio ref={audioRef} crossOrigin="anonymous" preload="metadata" />

        <header className="claudio-header">
          <div className="claudio-identity">
            <ClaudioAvatar />
            <span>CODIO</span>
          </div>
          <div className="claudio-theme-switch" aria-label="Theme">
            <span>LOGIN</span>
            <button className={theme === "dark" ? "active" : ""} type="button" onClick={() => setTheme("dark")}>
              DARK
            </button>
            <button className={theme === "light" ? "active" : ""} type="button" onClick={() => setTheme("light")}>
              LIGHT
            </button>
          </div>
        </header>

        <section className="claudio-screen" aria-label="Codio FM player">
          <div className="claudio-clock">
            <p>{formatClock(now)}</p>
            <span>{formatDate(now)}</span>
            <strong>{isPlaying ? "ON AIR" : "STANDBY"}</strong>
          </div>

          <div className="claudio-player-panel">
            <div className="claudio-now-playing">
              <h1>{currentItem?.title ?? "No track loaded"}</h1>
              <p>{currentItem?.artist ?? "Codio FM"}</p>
            </div>

            <RadioControls isPlaying={isPlaying} onNext={next} onPrevious={previous} onTogglePlay={togglePlay} />

            <div className="claudio-progress-row">
              <span>{formatTime(currentTime)}</span>
              <div className="claudio-progress" aria-label="Playback progress">
                <span style={{ width: `${progress}%` }} />
              </div>
              <span>{formatTime(duration || currentItem?.durationSeconds || 0)}</span>
            </div>
            {playbackError ? <p className="claudio-error">{playbackError}</p> : null}
          </div>

          <div className="claudio-queue-bar">
            <span>QUEUE</span>
            <span>{program.items.length} TRACKS</span>
          </div>

          <section className="claudio-chat-panel" aria-label="Codio host message">
            <div className="claudio-host-status">
              <ClaudioAvatar className="claudio-chat-avatar" />
              <strong>Codio</strong>
              <em>ONLINE</em>
            </div>
            <div className="claudio-message-list">
              <div className="claudio-message claudio-message-host">
                <ClaudioAvatar className="claudio-chat-avatar" />
                <p>{hostItem?.script ?? "This is Codio. The station is live, quiet, and ready for the next track."}</p>
              </div>
              <div className="claudio-message claudio-message-user">
                <p>Keep it soft tonight.</p>
                <ClaudioAvatar kind="user" className="claudio-chat-avatar" />
              </div>
            </div>
          </section>
        </section>

        <footer className="claudio-input-row">
          <span>Say something to the DJ...</span>
          <button type="button">Mic</button>
          <button type="button">Send</button>
        </footer>
      </section>
    </main>
  );
}
