"use client";

import { useState } from "react";

type AvatarBadgeProps = {
  kind: "host" | "user";
  className?: string;
};

const avatarConfig = {
  host: {
    src: "/avatars/claudio.jpeg",
    label: "C",
    alt: "Codio"
  },
  user: {
    src: "/avatars/user.jpg",
    label: "你",
    alt: "You"
  }
};

export function AvatarBadge({ kind, className = "" }: AvatarBadgeProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const config = avatarConfig[kind];

  return (
    <span className={`avatar-badge avatar-badge-${kind} ${className}`.trim()} aria-label={config.alt}>
      {!imageFailed ? (
        <img alt="" src={config.src} onError={() => setImageFailed(true)} />
      ) : (
        <span className="avatar-badge-fallback">{config.label}</span>
      )}
    </span>
  );
}
