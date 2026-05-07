"use client";

import { Radio } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { fetchMemoryProfile, type MemoryProfile } from "../lib/api";
import { HOST_NAME } from "./RadioHostChat";

type HostProfileHoverCardProps = {
  children: ReactNode;
  align?: "left" | "right";
};

export const hostTasteProfile = {
  name: HOST_NAME,
  status: "一开机我就打碟",
  lines: [
    "Your mood is my prompt.",
    "I hate algorithm. I have taste.",
    "一个会从你的曲库里长出口味的私人电台主持人。"
  ],
  stats: [
    { label: "ON AIR", value: "24/7" },
    { label: "GENRES", value: "∞" },
    { label: "LISTENER", value: "1" }
  ],
  tasteTags: [
    "JAZZ-HIPHOP",
    "NEO-CLASSICAL",
    "90s华语",
    "HIP-HOP",
    "POST-PUNK",
    "J-ROCK",
    "雨天白噪音",
    "CHILL",
    "AMBIENT",
    "轻电子",
    "深夜中文"
  ]
};

function mergeTasteTags(profile: MemoryProfile | null) {
  const preferredTags = profile?.preferredDirections?.map((item) => item.name).filter(Boolean) ?? [];
  return [...new Set([...preferredTags, ...hostTasteProfile.tasteTags])].slice(0, 12);
}

export function HostProfileHoverCard({ children, align = "left" }: HostProfileHoverCardProps) {
  const [memoryProfile, setMemoryProfile] = useState<MemoryProfile | null>(null);
  const [memoryStatus, setMemoryStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const tasteTags = useMemo(() => mergeTasteTags(memoryProfile), [memoryProfile]);
  const memoryValue =
    memoryStatus === "loading" ? "..." : memoryStatus === "error" ? "LOCAL" : String(memoryProfile?.feedbackCount ?? 0);
  const stats = [
    { label: "ON AIR", value: "24/7" },
    { label: "MEMORY", value: memoryValue },
    { label: "GENRES", value: "∞" }
  ];

  async function refreshMemoryProfile() {
    setMemoryStatus("loading");

    try {
      const profile = await fetchMemoryProfile();
      setMemoryProfile(profile);
      setMemoryStatus("ready");
    } catch (error) {
      console.warn("Unable to load Claudio memory profile.", error);
      setMemoryStatus("error");
    }
  }

  return (
    <span
      className={`host-profile-trigger align-${align}`}
      onFocus={refreshMemoryProfile}
      onMouseEnter={refreshMemoryProfile}
    >
      {children}
      <span className="host-profile-card" role="tooltip">
        <span className="host-profile-head">
          <span className="host-profile-avatar">
            <Radio size={18} />
          </span>
          <span>
            <strong>{hostTasteProfile.name}</strong>
            <small><i />{hostTasteProfile.status}</small>
          </span>
        </span>

        <span className="host-profile-copy">
          {hostTasteProfile.lines.map((line) => (
            <em key={line}>{line}</em>
          ))}
        </span>

        <span className="host-profile-stats">
          {stats.map((stat) => (
            <span key={stat.label}>
              <strong>{stat.value}</strong>
              <small>{stat.label}</small>
            </span>
          ))}
        </span>

        <span className="host-taste-tags">
          {tasteTags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </span>

        <span className="host-profile-foot">CLAUDIO × YOU</span>
      </span>
    </span>
  );
}
