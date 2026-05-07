import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const routineConfigPath = path.join(rootDir, "user", "routines.json");

const routineBlocks = [
  {
    slotId: "morning-wake",
    label: "早上苏醒",
    timeRange: "07:00-09:00",
    activity: "起床 / 洗漱 / 打开房间",
    intent: "先让房间和人一起慢慢醒过来。",
    musicIntent: "安排温暖、清亮、不过度兴奋的人声和钢琴。",
    scoringTags: ["mandarin-pop", "piano", "warm-vocal", "light-electronic"],
    displayStyles: ["温暖人声", "钢琴", "轻电子"],
    energy: "low-to-medium"
  },
  {
    slotId: "deep-work",
    label: "深度工作",
    timeRange: "09:00-12:00",
    activity: "Codex 写作 / 编程 / 长时间专注",
    intent: "把注意力稳定下来，减少被歌词打断的概率。",
    musicIntent: "优先选择少人声、稳定律动、轻电子和器乐方向。",
    scoringTags: ["steady-groove", "instrumental", "light-electronic", "ambient"],
    displayStyles: ["稳定律动", "少人声", "轻电子"],
    energy: "medium"
  },
  {
    slotId: "noon-breath",
    label: "午间呼吸",
    timeRange: "12:00-13:30",
    activity: "午饭 / 短休 / 从上午抽离",
    intent: "不继续推高情绪，只做一次柔和重置。",
    musicIntent: "安排放松、原声、轻流行，让中午有一点空气感。",
    scoringTags: ["relax", "acoustic", "mandarin-pop", "chill"],
    displayStyles: ["放松", "原声", "轻流行"],
    energy: "low"
  },
  {
    slotId: "afternoon-drive",
    label: "下午推进",
    timeRange: "13:30-18:00",
    activity: "继续工作 / 处理杂事 / 稳住节奏",
    intent: "给下午一点推动力，但不把人推得太紧。",
    musicIntent: "安排城市感、节奏流行、轻电子，维持前进感。",
    scoringTags: ["city", "rhythm-pop", "light-electronic", "steady-groove"],
    displayStyles: ["城市感", "节奏流行", "轻电子"],
    energy: "medium"
  },
  {
    slotId: "evening-soften",
    label: "夜晚收束",
    timeRange: "18:00-21:00",
    activity: "结束工作 / 回到房间 / 放慢速度",
    intent: "把一天的噪声放下来，让电台离人更近一点。",
    musicIntent: "安排温暖人声、慢节奏、夜晚感的歌曲。",
    scoringTags: ["warm-vocal", "chill", "late-night", "neo-classical"],
    displayStyles: ["温暖人声", "慢节奏", "夜晚感"],
    energy: "low-to-medium"
  },
  {
    slotId: "night-close",
    label: "睡前降噪",
    timeRange: "21:00-00:00",
    activity: "睡前 / 回看今天 / 放轻内心",
    intent: "让声音收得更近，适合一天最后一段独处。",
    musicIntent: "安排低能量、钢琴、氛围和柔和人声。",
    scoringTags: ["late-night", "ambient", "piano", "warm-vocal"],
    displayStyles: ["钢琴", "氛围", "柔和人声"],
    energy: "low"
  }
];

export function getDailyRoutine(date = new Date()) {
  const day = typeof date === "string" ? date : toDateString(date);
  const routineConfig = loadRoutineConfig();

  return {
    source: routineConfig.source,
    date: day,
    note: routineConfig.note,
    blocks: routineConfig.blocks
  };
}

export function applyRoutineToSlot(slot, routine) {
  const block = routine.blocks.find((item) => item.slotId === slot.id);
  if (!block) return slot;

  return {
    ...slot,
    title: block.label,
    timeRange: block.timeRange ?? slot.timeRange,
    energy: block.energy ?? slot.energy,
    musicDirection: unique([...(slot.musicDirection ?? []), ...block.scoringTags]),
    hostOpening: `${block.intent} ${block.musicIntent}`,
    routineContext: {
      source: routine.source,
      label: block.label,
      activity: block.activity,
      intent: block.intent,
      musicIntent: block.musicIntent,
      displayStyles: block.displayStyles,
      timeRange: block.timeRange
    }
  };
}

function toDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function loadRoutineConfig() {
  try {
    const raw = fs.readFileSync(routineConfigPath, "utf8");
    const parsed = JSON.parse(raw);
    const blocks = Array.isArray(parsed.blocks) ? parsed.blocks : Array.isArray(parsed) ? parsed : [];
    const normalizedBlocks = blocks.map(normalizeRoutineBlock).filter((block) => block.slotId);

    if (normalizedBlocks.length > 0) {
      return {
        source: "user/routines.json",
        note:
          typeof parsed.note === "string" && parsed.note.trim()
            ? parsed.note.trim()
            : "Codio reads the editable user routine file before planning the daily radio schedule.",
        blocks: normalizedBlocks
      };
    }
  } catch {
    // Keep Codio usable even before the user creates a routine file.
  }

  return {
    source: "local-routine-v1",
    note: "Codio uses a built-in local routine signal. Create user/routines.json to customize it.",
    blocks: routineBlocks
  };
}

function normalizeRoutineBlock(block) {
  return {
    slotId: stringOrEmpty(block?.slotId),
    label: stringOrEmpty(block?.label),
    timeRange: stringOrEmpty(block?.timeRange),
    activity: stringOrEmpty(block?.activity),
    intent: stringOrEmpty(block?.intent),
    musicIntent: stringOrEmpty(block?.musicIntent),
    scoringTags: stringArray(block?.scoringTags),
    displayStyles: stringArray(block?.displayStyles),
    energy: stringOrEmpty(block?.energy)
  };
}

function stringOrEmpty(value) {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value) {
  return Array.isArray(value) ? value.map((item) => stringOrEmpty(item)).filter(Boolean) : [];
}
