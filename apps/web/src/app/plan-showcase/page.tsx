"use client";

import { useEffect, useMemo, useState } from "react";
import { apiBase, type PlannerDay, type PlannerSlot } from "../../lib/api";
import styles from "./plan-showcase.module.css";

type RoutineContext = {
  source?: string;
  label?: string;
  activity?: string;
  intent?: string;
  musicIntent?: string;
  displayStyles?: string[];
  timeRange?: string;
};

type PlannerSlotWithRoutine = PlannerSlot & {
  routineContext?: RoutineContext;
};

type PlannerDayWithRoutine = PlannerDay & {
  routine?: {
    source?: string;
    note?: string;
    blocks?: RoutineContext[];
  };
  slots: PlannerSlotWithRoutine[];
};

const fallbackDay: PlannerDayWithRoutine = {
  date: "2026-05-07",
  weekday: "Thursday",
  host: "Codio",
  generatedAt: new Date().toISOString(),
  source: "video-showcase",
  slots: [
    {
      id: "morning-wake",
      timeRange: "08:00-09:00",
      title: "早上苏醒",
      scene: "morning",
      mood: "clear",
      energy: "low-to-medium",
      musicDirection: ["温暖人声", "钢琴", "轻一点"],
      hostOpening: "先把人和房间慢慢叫醒，不急着进入高压状态。"
    },
    {
      id: "deep-work",
      timeRange: "09:00-12:00",
      title: "上午专注",
      scene: "work",
      mood: "focused",
      energy: "medium",
      musicDirection: ["专注", "少人声", "稳定"],
      hostOpening: "和 Codex 写代码时，减少打扰，用稳定节奏托住专注。"
    },
    {
      id: "noon-breath",
      timeRange: "12:00-13:30",
      title: "午间休息",
      scene: "noon",
      mood: "warm",
      energy: "low",
      musicDirection: ["放松", "舒服", "轻流行"],
      hostOpening: "吃饭休息时不追求兴奋，只做一次柔和的重置。"
    },
    {
      id: "afternoon-drive",
      timeRange: "13:30-18:00",
      title: "下午推进",
      scene: "afternoon",
      mood: "steady",
      energy: "medium",
      musicDirection: ["城市感", "轻电子", "节奏流行"],
      hostOpening: "下午需要一点推进力，但不能把人推得太累。"
    },
    {
      id: "evening-soften",
      timeRange: "18:00-21:00",
      title: "晚上整理",
      scene: "evening",
      mood: "soft",
      energy: "low-to-medium",
      musicDirection: ["温暖", "陪伴感", "慢一点"],
      hostOpening: "放松和整理素材时，把一天的输出慢慢收回来。"
    },
    {
      id: "night-close",
      timeRange: "21:00-00:00",
      title: "睡前降噪",
      scene: "night",
      mood: "quiet",
      energy: "low",
      musicDirection: ["钢琴", "氛围", "柔和人声"],
      hostOpening: "最后一段只保留低亮度的声音，让人慢慢收心。"
    }
  ]
};

function periodName(slot: PlannerSlotWithRoutine) {
  if (slot.id.includes("morning")) return "早上";
  if (slot.id.includes("work")) return "上午";
  if (slot.id.includes("noon")) return "午间";
  if (slot.id.includes("afternoon")) return "下午";
  if (slot.id.includes("evening")) return "晚上";
  if (slot.id.includes("night")) return "睡前";
  return slot.scene ?? "时段";
}

function displayTitle(slot: PlannerSlotWithRoutine) {
  if (slot.routineContext?.label) return slot.routineContext.label;

  const titleMap: Record<string, string> = {
    "morning-wake": "早上苏醒",
    "deep-work": "上午专注",
    "noon-breath": "午间休息",
    "afternoon-drive": "下午推进",
    "evening-soften": "晚上整理",
    "night-close": "睡前降噪"
  };

  return titleMap[slot.id] ?? slot.title;
}

function displayReason(slot: PlannerSlotWithRoutine) {
  if (slot.routineContext?.intent || slot.routineContext?.musicIntent) {
    return [slot.routineContext.intent, slot.routineContext.musicIntent].filter(Boolean).join(" ");
  }

  if (slot.hostOpening) return slot.hostOpening;
  if (slot.reason) return slot.reason;

  if (slot.id.includes("morning")) return "先让人醒过来，再慢慢进入工作状态。";
  if (slot.id.includes("work")) return "根据工作时间，减少人声干扰，保留稳定节奏。";
  if (slot.id.includes("noon")) return "午间需要短暂休息，所以安排更轻、更柔和的歌单。";
  if (slot.id.includes("afternoon")) return "下午需要一点动力，用节奏感帮助继续推进。";
  return "晚上要把情绪收回来，让声音更安静、更贴近。";
}

function displayActivity(slot: PlannerSlotWithRoutine) {
  if (slot.routineContext?.activity) return slot.routineContext.activity;
  if (slot.id.includes("morning")) return "起床 / 洗漱 / 打开房间";
  if (slot.id.includes("work")) return "Codex 工作 / 写作 / 编程";
  if (slot.id.includes("noon")) return "午饭 / 短休 / 重置";
  if (slot.id.includes("afternoon")) return "继续工作 / 处理杂事";
  if (slot.id.includes("evening")) return "结束工作 / 回到房间";
  return "睡前 / 回看今天 / 放轻内心";
}

function displayStyles(slot: PlannerSlotWithRoutine) {
  if (slot.routineContext?.displayStyles?.length) {
    return slot.routineContext.displayStyles.slice(0, 3).join(" / ");
  }

  return (slot.musicDirection ?? [slot.mood ?? "私人电台"]).slice(0, 3).join(" / ");
}

function displayTrack(track: NonNullable<PlannerSlotWithRoutine["tracks"]>[number]) {
  return track.artist ? `${track.title} - ${track.artist}` : track.title;
}

function displayTrackList(slot: PlannerSlotWithRoutine, limit = 3) {
  const tracks = (slot.tracks ?? []).filter((track) => track.title).slice(0, limit);

  if (tracks.length === 0) {
    return "等待本地曲库匹配";
  }

  return tracks.map(displayTrack).join(" / ");
}

function sortSlotsBySchedule(slots: PlannerSlotWithRoutine[]) {
  return [...slots].sort((left, right) => slotStartMinutes(left.timeRange) - slotStartMinutes(right.timeRange));
}

function slotStartMinutes(timeRange: string) {
  const [start = "00:00"] = timeRange.split("-");
  const [hour = "0", minute = "0"] = start.split(":");
  return Number(hour) * 60 + Number(minute);
}

function buildTerminalLines(day: PlannerDayWithRoutine, status: string) {
  const routineSource = day.routine?.source || "user/routines.json";
  const slots = sortSlotsBySchedule(day.slots);
  const lines = [
    "$ codio show today-plan --final",
    `> 日程来源：${routineSource}`,
    `> 生成状态：${status}`,
    `> 主持人：${day.host}`,
    `> 日期：${day.weekday} / ${day.date}`,
    ""
  ];

  slots.forEach((slot, index) => {
    lines.push(`${String(index + 1).padStart(2, "0")}  ${slot.timeRange}  ${displayTitle(slot)}`);
    lines.push(`    日程：${displayActivity(slot)}`);
    lines.push(`    节目方向：${displayStyles(slot)}`);
    lines.push(`    播放歌曲：${displayTrackList(slot)}`);
    lines.push("");
  });

  lines.push("> 今日最终节目单已生成");

  return lines;
}

export default function PlanShowcasePage() {
  const [plannerDay, setPlannerDay] = useState<PlannerDayWithRoutine>(fallbackDay);
  const [status, setStatus] = useState("正在读取本地曲库");
  const [visibleLineCount, setVisibleLineCount] = useState(1);

  useEffect(() => {
    let ignore = false;

    async function loadPlanner() {
      try {
        const response = await fetch(`${apiBase}/api/planner/today`, { cache: "no-store" });
        if (!response.ok) throw new Error("Planner unavailable");
        const day = (await response.json()) as PlannerDayWithRoutine;

        if (!ignore && Array.isArray(day.slots) && day.slots.length > 0) {
          setPlannerDay(day);
          setStatus("今日策划已完成");
        }
      } catch {
        if (!ignore) {
          setStatus("演示策划已准备");
        }
      }
    }

    void loadPlanner();

    return () => {
      ignore = true;
    };
  }, []);

  const slots = useMemo(() => sortSlotsBySchedule(plannerDay.slots), [plannerDay.slots]);
  const terminalLines = useMemo(() => buildTerminalLines(plannerDay, status), [plannerDay, status]);
  const visibleTerminalLines = terminalLines.slice(0, visibleLineCount);

  useEffect(() => {
    setVisibleLineCount(1);
  }, [terminalLines]);

  useEffect(() => {
    if (visibleLineCount >= terminalLines.length) return;

    const line = terminalLines[visibleLineCount - 1] ?? "";
    const timer = window.setTimeout(
      () => setVisibleLineCount((count) => Math.min(count + 1, terminalLines.length)),
      line ? 300 : 140
    );

    return () => window.clearTimeout(timer);
  }, [terminalLines, visibleLineCount]);

  return (
    <main className={styles.stage}>
      <section className={styles.frame} aria-label="Codio 今日策划终端">
        <div className={styles.header}>
          <div>
            <span>CODIO DAILY PLAN</span>
            <h1>今日节目单</h1>
          </div>
          <div className={styles.signal}>
            <i />
            {status}
          </div>
        </div>

        <div className={styles.sourceStrip} aria-label="日程来源">
          <span>ROUTINE SOURCE</span>
          <b>{plannerDay.routine?.source || "user/routines.json"}</b>
          <em>按 Immortal 的真实日程生成</em>
        </div>

        <div className={styles.grid}>
          <section className={styles.leftColumn} aria-label="Codio 今日节目单生成过程">
            <section className={styles.console} aria-label="Codio planning terminal">
              {visibleTerminalLines.map((line, index) => (
                <p className={line.startsWith("> 今日") || line.startsWith("> Codio") ? styles.done : ""} key={`${line}-${index}`}>
                  {line || "\u00a0"}
                </p>
              ))}
              {visibleLineCount < terminalLines.length ? <span className={styles.cursor} aria-hidden="true" /> : null}
            </section>
          </section>

          <aside className={styles.timeline} aria-label="节目单主题">
            {slots.map((slot, index) => (
              <article className={styles.slot} key={slot.id} style={{ animationDelay: `${index * 160}ms` }}>
                <div className={styles.slotMeta}>
                  <span>{String(index + 1).padStart(2, "0")} · {periodName(slot)}</span>
                  <b>{slot.timeRange}</b>
                </div>
                <div className={styles.slotBody}>
                  <h2>{displayTitle(slot)}</h2>
                  <p>{displayTrackList(slot, 2)}</p>
                </div>
              </article>
            ))}
          </aside>
        </div>

        <div className={styles.footer}>
          <span>LOCAL AI RADIO</span>
          <span>CODIO FM / 今日策划终端 / 准备播报</span>
        </div>
      </section>
    </main>
  );
}
