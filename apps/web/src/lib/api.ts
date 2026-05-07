export type ProgramItem = {
  id: string;
  type: "voice" | "music";
  title: string;
  artist: string;
  durationSeconds: number;
  script?: string | null;
  audioFormat?: string | null;
  mood?: string | null;
  audioUrl: string;
};

export type Program = {
  date: string;
  title: string;
  host: string;
  description: string;
  daypart?: string | null;
  mood?: string | null;
  items: ProgramItem[];
  voiceCache?: Array<{
    segment: string;
    contentType?: string;
    ok: boolean;
    error?: string;
  }>;
};

export type LibraryTrack = {
  id: string;
  title: string;
  artist: string;
  filename: string;
  format: string;
  mood?: string | null;
  source?: string | null;
  sourceDir?: string | null;
  mimeType: string;
  size: number;
  durationSeconds: number;
};

export type PlannerTrack = {
  id?: string;
  title: string;
  artist?: string;
  source?: string;
  audioUrl?: string;
  audioSrc?: string;
  durationSeconds?: number;
  mood?: string | null;
  tags?: string[];
  reason?: string;
};

export type PlannerSlot = {
  id: string;
  timeRange: string;
  title: string;
  scene?: string;
  mood?: string;
  energy?: string;
  musicDirection?: string[];
  hostOpening?: string;
  reason?: string;
  routineContext?: {
    source?: string;
    label?: string;
    activity?: string;
    intent?: string;
    musicIntent?: string;
    displayStyles?: string[];
    timeRange?: string;
  };
  tracks?: PlannerTrack[];
};

export type PlannerDay = {
  date: string;
  weekday: string;
  host: string;
  generatedAt: string;
  source: string;
  slots: PlannerSlot[];
};

export type ListenerFeedbackType = "like" | "dislike" | "more_like_this" | "less_like_this";

export type ListenerFeedbackPayload = {
  messageId: string;
  feedbackType: ListenerFeedbackType;
  userMessage?: string;
  hostReply: string;
  slotId?: string;
  slotTitle?: string;
  track?: PlannerTrack;
  musicDirection?: string[];
  scene?: string;
  mood?: string;
  createdAt: string;
};

export type MemoryProfileItem = {
  name: string;
  score: number;
};

export type MemoryProfile = {
  preferredDirections: MemoryProfileItem[];
  dislikedDirections: MemoryProfileItem[];
  favoriteScenes: MemoryProfileItem[];
  feedbackCount: number;
  lastUpdated?: string | null;
};

export type CurrentPlaybackItemContext = {
  id: string;
  type: "voice" | "music";
  title: string;
  artist: string;
  source: string;
  durationSeconds: number;
  mood?: string | null;
};

export type HostChatResponse = {
  reply: string;
  intent: string;
  detectedMood?: string;
  detectedPreferences?: {
    energy?: string | null;
    language?: string | null;
    tags?: string[];
  };
  memorySaved?: boolean;
  actions?: unknown[];
};

export type HostVoiceResponse = {
  audioUrl?: string;
  text: string;
  source: string;
  fallback?: boolean;
  reason?: string;
};

export const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";

export async function getTodayProgram(): Promise<Program> {
  const response = await fetch(`${apiBase}/api/program/today`, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error("Failed to load today's program");
  }

  return response.json();
}

export async function generateTodayProgram(): Promise<Program> {
  const response = await fetch(`${apiBase}/api/program/today/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: "{}"
  });

  if (!response.ok) {
    throw new Error("Failed to generate today's program");
  }

  return response.json();
}

export async function getLibraryTracks(): Promise<LibraryTrack[]> {
  const response = await fetch(`${apiBase}/api/library/tracks`, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error("Failed to load local audio library");
  }

  const data = (await response.json()) as { tracks: LibraryTrack[] };
  return data.tracks;
}

export async function fetchCurrentPlannerSlot(): Promise<PlannerSlot> {
  const response = await fetch(`${apiBase}/api/planner/current`, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error("Failed to load current planner slot");
  }

  const data = (await response.json()) as { slot?: PlannerSlot } & PlannerSlot;
  const slot = data.slot ?? data;

  if (!slot?.id || !slot.timeRange || !slot.title) {
    throw new Error("Planner slot response is incomplete");
  }

  return slot;
}

export async function fetchTodayPlanner(): Promise<PlannerDay> {
  const response = await fetch(`${apiBase}/api/planner/today`, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error("Failed to load today's planner");
  }

  return response.json();
}

export async function regenerateTodayPlanner(): Promise<PlannerDay> {
  const response = await fetch(`${apiBase}/api/planner/regenerate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: "{}"
  });

  if (!response.ok) {
    throw new Error("Failed to regenerate today's planner");
  }

  return response.json();
}

export async function saveListenerFeedback(payload: ListenerFeedbackPayload): Promise<{ ok: boolean; message?: string }> {
  const response = await fetch(`${apiBase}/api/memory/feedback`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error("Failed to save listener feedback");
  }

  return response.json();
}

export async function fetchMemoryProfile(): Promise<MemoryProfile> {
  const response = await fetch(`${apiBase}/api/memory/profile`, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error("Failed to load memory profile");
  }

  return response.json();
}

export async function sendHostChat(payload: {
  message: string;
  currentSlot?: PlannerSlot | null;
  currentPlaybackItem?: CurrentPlaybackItemContext | null;
}): Promise<HostChatResponse> {
  const response = await fetch(`${apiBase}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: payload.message,
      playback: payload.currentPlaybackItem
        ? {
            currentItemId: payload.currentPlaybackItem.id,
            currentTitle: payload.currentPlaybackItem.title,
            currentType: payload.currentPlaybackItem.type,
            artist: payload.currentPlaybackItem.artist,
            source: payload.currentPlaybackItem.source,
            durationSeconds: payload.currentPlaybackItem.durationSeconds,
            mood: payload.currentPlaybackItem.mood
          }
        : undefined,
      currentSlot: payload.currentSlot
    })
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error ?? "Host chat failed");
  }

  return response.json();
}

export async function fetchHostVoice(payload: { text: string; slotId?: string }): Promise<HostVoiceResponse> {
  const response = await fetch(`${apiBase}/api/host/voice`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error ?? "Host voice failed");
  }

  return response.json();
}

export function audioUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  return `${apiBase}${path}`;
}

export async function sendRadioChat(
  message: string,
  playback?: { currentIndex: number; currentItemId?: string; currentTitle?: string; currentType?: "voice" | "music" }
): Promise<{ reply: string; source?: string }> {
  const response = await fetch(`${apiBase}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ message, playback })
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error ?? "Chat failed");
  }

  return response.json();
}

export async function createVoicePreview(options: {
  text: string;
  voiceId: string;
  speed: number;
  pitch: number;
  volume: number;
  model?: string;
}): Promise<Blob> {
  const response = await fetch(`${apiBase}/api/audio/voice-preview`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(options)
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error ?? "Voice preview failed");
  }

  return response.blob();
}
