"use client";

import { Heart, Pause, Play, SkipBack, SkipForward } from "lucide-react";

type RadioControlsProps = {
  isPlaying: boolean;
  onNext: () => void;
  onPrevious: () => void;
  onTogglePlay: () => void;
};

export function RadioControls({ isPlaying, onNext, onPrevious, onTogglePlay }: RadioControlsProps) {
  return (
    <div className="claudio-controls" aria-label="Playback controls">
      <button type="button" onClick={onPrevious} aria-label="Previous">
        <SkipBack size={15} />
      </button>
      <button className="claudio-play-button" type="button" onClick={onTogglePlay} aria-label={isPlaying ? "Pause" : "Play"}>
        {isPlaying ? <Pause size={17} /> : <Play size={17} />}
      </button>
      <button type="button" onClick={onNext} aria-label="Next">
        <SkipForward size={15} />
      </button>
      <button type="button" aria-label="Like">
        <Heart size={15} />
      </button>
    </div>
  );
}
