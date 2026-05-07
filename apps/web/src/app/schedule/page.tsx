import { Radio, Volume2 } from "lucide-react";
import { getTodayProgram } from "../../lib/api";

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

function labelType(type: "voice" | "music") {
  return type === "voice" ? "主持" : "音乐";
}

export default async function SchedulePage() {
  const program = await getTodayProgram();

  return (
    <section className="panel" style={{ marginTop: 24 }}>
      <p className="eyebrow">
        {program.date} / {program.mood ?? "私人电台"}
      </p>
      <h1 className="hero-title">今日节目单</h1>
      <p className="subtle">
        {program.title} / {program.host} / {program.description}
      </p>

      <div className="schedule-list">
        {program.items.map((item, index) => (
          <article className="schedule-item" key={item.id}>
            <span className="badge">{item.type === "voice" ? <Radio size={20} /> : <Volume2 size={20} />}</span>
            <div>
              <p className="eyebrow">
                {String(index + 1).padStart(2, "0")} / {labelType(item.type)} / {formatTime(item.durationSeconds)}
                {item.mood ? ` / ${item.mood}` : ""}
              </p>
              <h2>{item.title}</h2>
              <p className="subtle">{item.artist}</p>
              {item.script ? <p>{item.script}</p> : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
