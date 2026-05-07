import { Disc3 } from "lucide-react";
import { getLibraryTracks } from "../../lib/api";

const moodLabels: Record<string, string> = {
  morning: "清晨",
  daytime: "白天",
  focus: "专注",
  evening: "傍晚",
  midnight: "深夜",
  drive: "城市",
  warm: "温柔",
  open: "未分类"
};

function formatSize(size: number) {
  if (size > 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

export default async function LibraryPage() {
  const tracks = await getLibraryTracks();
  const sourceCount = tracks.reduce<Record<string, number>>((counts, track) => {
    const source = track.source ?? track.artist ?? "Unknown";
    counts[source] = (counts[source] ?? 0) + 1;
    return counts;
  }, {});
  const grouped = tracks.reduce<Record<string, typeof tracks>>((groups, track) => {
    const mood = track.mood ?? "open";
    groups[mood] = groups[mood] ?? [];
    groups[mood].push(track);
    return groups;
  }, {});

  return (
    <section className="panel" style={{ marginTop: 24 }}>
      <p className="eyebrow">Local Library</p>
      <h1 className="hero-title">音乐库</h1>
      <p className="subtle">
        已接入 {tracks.length} 首本地歌曲。电台会按文件名和氛围标签整理曲库，用来生成不同时间段的节目。
      </p>

      <div className="source-strip" aria-label="Music sources">
        {Object.entries(sourceCount).map(([source, count]) => (
          <span className="source-pill" key={source}>
            {source} · {count} 首
          </span>
        ))}
      </div>

      <div className="library-groups">
        {Object.entries(grouped).map(([mood, moodTracks]) => (
          <section className="library-group" key={mood}>
            <div className="library-group-header">
              <span className="status-icon">
                <Disc3 size={18} />
              </span>
              <div>
                <h2>{moodLabels[mood] ?? mood}</h2>
                <p className="subtle">{moodTracks.length} 首</p>
              </div>
            </div>

            <div className="queue">
              {moodTracks.slice(0, 36).map((track) => (
                <article className="track-card" key={track.id}>
                  <span className="track-icon">
                    <Disc3 size={18} />
                  </span>
                  <div>
                    <h3>{track.title}</h3>
                    <p>{track.source ?? track.artist} · {track.filename}</p>
                  </div>
                  <span className="track-meta">
                    <span className="format-pill">{track.format}</span>
                    <span className="duration">{formatSize(track.size)}</span>
                  </span>
                </article>
              ))}
            </div>
            {moodTracks.length > 36 ? <p className="subtle">还有 {moodTracks.length - 36} 首会参与节目生成。</p> : null}
          </section>
        ))}
      </div>
    </section>
  );
}
