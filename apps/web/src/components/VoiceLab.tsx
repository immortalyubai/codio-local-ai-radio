"use client";

import { Pause, Play, Wand2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createVoicePreview } from "../lib/api";

export function VoiceLab() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [voiceId, setVoiceId] = useState("Chinese (Mandarin)_Warm-HeartedAunt");
  const [model, setModel] = useState("speech-2.8-hd");
  const [speed, setSpeed] = useState(1);
  const [pitch, setPitch] = useState(0);
  const [volume, setVolume] = useState(1);
  const [text, setText] = useState("晚上好，这里是你的私人电台。把灯光调暗一点，让这一首歌慢慢靠近。");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  async function generate() {
    setIsGenerating(true);
    setError(null);
    setIsPlaying(false);

    try {
      const blob = await createVoicePreview({ text, voiceId, speed, pitch, volume, model });
      const nextUrl = URL.createObjectURL(blob);

      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(nextUrl);

      window.setTimeout(async () => {
        if (!audioRef.current) return;
        audioRef.current.src = nextUrl;
        await audioRef.current.play();
        setIsPlaying(true);
      }, 0);
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "Voice preview failed");
    } finally {
      setIsGenerating(false);
    }
  }

  function toggle() {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      return;
    }

    void audio.play().then(() => setIsPlaying(true));
  }

  return (
    <section className="voice-lab-panel">
      <audio ref={audioRef} onEnded={() => setIsPlaying(false)} />

      <div className="voice-lab-header">
        <div>
          <p className="eyebrow">MiniMax Voice Lab</p>
          <h1>试听主持人声音</h1>
          <p>调 voice_id、模型、语速、音高和音量，找到最像官方试听的电台主持人。</p>
        </div>
        <button className="primary-button" type="button" onClick={generate} disabled={isGenerating}>
          <Wand2 size={18} />
          {isGenerating ? "生成中" : "生成试听"}
        </button>
      </div>

      <label className="field-stack">
        <span>Voice ID</span>
        <input value={voiceId} onChange={(event) => setVoiceId(event.target.value)} />
      </label>

      <label className="field-stack">
        <span>Model</span>
        <select value={model} onChange={(event) => setModel(event.target.value)}>
          <option value="speech-2.8-hd">speech-2.8-hd</option>
          <option value="speech-2.8-turbo">speech-2.8-turbo</option>
          <option value="speech-02-hd">speech-02-hd</option>
          <option value="speech-02-turbo">speech-02-turbo</option>
        </select>
      </label>

      <label className="field-stack">
        <span>Preview text</span>
        <textarea value={text} onChange={(event) => setText(event.target.value)} rows={4} />
      </label>

      <div className="voice-controls-grid">
        <label className="slider-field">
          <span>Speed</span>
          <input min="0.5" max="2" step="0.05" type="range" value={speed} onChange={(event) => setSpeed(Number(event.target.value))} />
          <strong>{speed.toFixed(2)}</strong>
        </label>
        <label className="slider-field">
          <span>Pitch</span>
          <input min="-12" max="12" step="1" type="range" value={pitch} onChange={(event) => setPitch(Number(event.target.value))} />
          <strong>{pitch}</strong>
        </label>
        <label className="slider-field">
          <span>Volume</span>
          <input min="0.1" max="2" step="0.05" type="range" value={volume} onChange={(event) => setVolume(Number(event.target.value))} />
          <strong>{volume.toFixed(2)}</strong>
        </label>
      </div>

      <div className="voice-lab-player">
        <button className="round-button main" type="button" onClick={toggle} disabled={!audioUrl}>
          {isPlaying ? <Pause size={17} /> : <Play size={17} />}
        </button>
        <span>{audioUrl ? "试听已生成" : "先生成一段试听"}</span>
      </div>

      {error ? <p className="player-error">{error}</p> : null}
    </section>
  );
}
