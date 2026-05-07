type ClaudioAvatarProps = {
  kind?: "host" | "user";
  className?: string;
};

export function ClaudioAvatar({ kind = "host", className = "" }: ClaudioAvatarProps) {
  const src = kind === "host" ? "/avatars/claudio.jpeg" : "/avatars/user.jpg";
  const alt = kind === "host" ? "Codio" : "You";

  return (
    <span className={`claudio-avatar claudio-avatar-${kind} ${className}`.trim()}>
      <img alt={alt} src={src} />
    </span>
  );
}
