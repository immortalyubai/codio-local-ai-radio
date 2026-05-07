import styles from "./recommend-card.module.css";

const waveBars = [
  20, 26, 32, 44, 58, 72, 92, 100, 82, 64, 48, 34, 28, 24, 22, 26, 30, 36, 44, 52, 58, 54, 48, 40, 32, 28, 24, 22, 24,
  28, 30, 34, 42, 58, 72, 94, 76, 58, 42, 32, 28
];

export default function RecommendCardPage() {
  return (
    <main className={styles.stage}>
      <section className={styles.device} aria-label="Codio recommendation card">
        <div className={styles.screen}>
          <button className={styles.close} type="button">
            CLOSE
          </button>

          <div className={styles.wave} aria-hidden="true">
            {waveBars.map((height, index) => (
              <span key={`${height}-${index}`} style={{ height: `${height}%` }} />
            ))}
          </div>

          <article className={styles.card}>
            <p className={styles.eyebrow}>Codio · 0:00</p>
            <h1>Codio&apos;s Host Break</h1>
            <p className={styles.track}>HIT ME HARD AND SOFT / Billie Eilish</p>

            <div className={styles.playline}>
              <span>0:00</span>
              <i>
                <b />
              </i>
              <span>5:43</span>
            </div>

            <div className={styles.script}>
              <p className={styles.scriptMeta}>Codio · 0:01</p>
              <p>
                Before we close tonight, I want to leave you with Billie Eilish&apos;s <strong>HIT ME HARD AND SOFT</strong>.
              </p>
              <p>
                It feels built for the moment after the room gets quiet.
              </p>
              <p>
                Soft at the edge, heavy underneath, and honest enough to stay with you after the screen goes dark.
              </p>
              <p className={styles.fade}>Codio · 0:18</p>
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}
