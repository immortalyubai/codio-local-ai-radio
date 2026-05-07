const daypartProfiles = {
  morning: {
    title: "Morning Signal",
    label: "清晨频道",
    description: "清晨、干净、轻一点，适合慢慢醒来。",
    preferredMoods: ["morning", "warm", "focus", "open"]
  },
  daytime: {
    title: "Daylight Desk Radio",
    label: "白天频道",
    description: "白天、清爽、稳定，适合工作和整理思路。",
    preferredMoods: ["focus", "morning", "drive", "open"]
  },
  evening: {
    title: "After Hours",
    label: "傍晚频道",
    description: "傍晚、松弛、有人情味，适合从白天退出来。",
    preferredMoods: ["warm", "drive", "midnight", "open"]
  },
  midnight: {
    title: "Midnight Room",
    label: "深夜频道",
    description: "深夜、低声、克制、有画面感，适合一个人听。",
    preferredMoods: ["midnight", "warm", "focus", "open"]
  }
};

export function createHostScripts(musicItems, profile = getDaypartProfile()) {
  const [first, second, third] = musicItems;

  return {
    opening: createRecommendationIntro(first, profile, true),
    breaks: [
      createTransitionIntro(first, second, profile),
      createTransitionIntro(second, third, profile)
    ].filter(Boolean),
    closing: createClosing(profile),
    source: "local-mature-host"
  };
}

export async function createHostScriptsWithAI(musicItems, profile = getDaypartProfile()) {
  const fallback = createHostScripts(musicItems, profile);
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) return fallback;

  try {
    const model = process.env.DEEPSEEK_MODEL ?? "deepseek-chat";
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "你是一位成熟、克制、有阅历的中文电台主持人。你的口播会直接送去语音合成，所以只写可朗读的中文。不要写舞台说明，不要 Markdown，不要表情符号。只输出 JSON。"
          },
          {
            role: "user",
            content: buildHostPrompt(musicItems, profile)
          }
        ],
        temperature: 0.72,
        max_tokens: 900
      })
    });

    if (!response.ok) {
      throw new Error(`DeepSeek host copy failed: ${response.status}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content ?? "";
    const scripts = parseJsonObject(text);
    return enforceTrackNames(normalizeScripts(scripts, fallback, `deepseek:${model}`), musicItems);
  } catch (error) {
    console.warn("AI host copy generation failed; falling back to local mature host.", error);
    return {
      ...fallback,
      source: "local-mature-host-fallback"
    };
  }
}

export function getDaypartProfile(date = new Date()) {
  const hour = date.getHours();

  if (hour >= 5 && hour < 10) {
    return { daypart: "morning", hour, ...daypartProfiles.morning };
  }

  if (hour >= 10 && hour < 17) {
    return { daypart: "daytime", hour, ...daypartProfiles.daytime };
  }

  if (hour >= 17 && hour < 22) {
    return { daypart: "evening", hour, ...daypartProfiles.evening };
  }

  return { daypart: "midnight", hour, ...daypartProfiles.midnight };
}

function buildHostPrompt(musicItems, profile) {
  const trackLines = musicItems
    .slice(0, 3)
    .map((track, index) => {
      const parsed = parseTrackTitle(track.title);
      return `${index + 1}. 标题：${parsed.songTitle}
歌手或来源标题：${parsed.artistName}
曲库来源：${sourceLabel(track)}
文件标题：${track.title}
氛围：${track.mood ?? "open"}`;
    })
    .join("\n\n");

  return `请为当前 AI 电台节目写主持人口播。

当前小时：${profile.hour} 点
当前频道：${profile.label}
频道气质：${profile.description}

节目单：
${trackLines}

请输出 JSON：
{
  "opening": "第一首歌前的导语",
  "breaks": ["第二首歌前的导语", "第三首歌前的导语"],
  "closing": "结束语"
}

口播要求：
- 必须像成熟电台主持人，不要像推荐算法。
- 每一首歌前都要说明：来自哪个曲库、歌手是谁、这首歌或这个版本大概是什么来路、为什么这个时间点播给听众。
- 如果你知道歌曲真实背景，可以自然讲出来；如果不确定，不要编造具体年份、专辑、创作动机，要说“从这个版本和标题看”“更像是一支改编/混音/本地收藏”。
- 不要把不确定的信息说成事实。
- 对 remix、bootleg、flip、cover、钢琴版、翻自这类文件名，必须说“标题里写着”“这个本地版本来自”“这个版本像是”，不要说两位艺人合作，不要说原作者为什么写它，除非这是公认的原曲信息。
- 如果不能确认“为什么写这首歌”，就讲“这首歌在这个版本里的情绪来源”和“它为什么适合此刻”，不要硬编创作动机。
- 每段 70 到 120 个中文字符，适合 TTS，有停顿感。
- 当前是 ${profile.hour} 点，问候和推荐理由必须匹配这个时间。
- 不要出现“API、模型、文件路径、prompt”等技术词。`;
}

function createRecommendationIntro(track, profile, isOpening = false) {
  if (!track) return "这里是 Open Radio，我们先把今天的信号调稳。";

  const source = sourceLabel(track);
  const reason = recommendationReason(track, profile);
  const parsed = parseTrackTitle(track.title);
  const greeting = isOpening ? openingGreeting(profile) : "";

  return `${greeting}这里是 Open Radio。接下来要播的是《${track.title}》。它来自${source}。如果按文件名看，${artistSentence(parsed)}这更像是一首被你收进本地歌单的${versionKind(track.title)}。${reason}`;
}

function createTransitionIntro(previous, next, profile) {
  if (!next) return "";

  const parsed = parseTrackTitle(next.title);
  const source = sourceLabel(next);
  const reason = recommendationReason(next, profile);
  const bridge = previous ? `刚才那首《${parseTrackTitle(previous.title).songTitle}》把气氛铺开了。` : "";

  return `${bridge}下一首要播的是《${next.title}》，来自${source}。${artistSentence(parsed)}我不硬讲故事，只从这个版本的质感说，它适合把上一段情绪接住。${reason}`;
}

function createClosing(profile) {
  const closings = {
    morning: "这一小段清晨节目到这里。愿今天的第一口空气，听起来也还不错。",
    daytime: "这组白天节目先到这里。把播放器留在旁边，下一轮我们继续换一种节奏。",
    evening: "这段傍晚节目到这里。愿你回到自己的时间里，慢一点也没关系。",
    midnight: "今晚的信号先收在这里。灯不用急着关，歌声会自己慢慢落下去。"
  };

  return closings[profile.daypart] ?? closings.midnight;
}

function openingGreeting(profile) {
  if (profile.daypart === "morning") return "早上好，";
  if (profile.daypart === "daytime") return `${profile.hour} 点了，`;
  if (profile.daypart === "evening") return "晚上好，";
  return "夜深了，";
}

function sourceLabel(track) {
  if (track.artist?.includes("NetEase")) return "你的网易云本地曲库";
  if (track.artist?.includes("Local")) return "本地 audio 曲库";
  return track.artist ? `${track.artist} 这份本地收藏` : "你的本地音乐库";
}

function parseTrackTitle(title = "") {
  const normalized = title.replace(/\s+/g, " ").trim();
  const parts = normalized.split(/\s+-\s+/);

  if (parts.length >= 2) {
    return {
      artistName: parts[0].trim(),
      songTitle: parts.slice(1).join(" - ").trim()
    };
  }

  return {
    artistName: "这位创作者",
    songTitle: normalized || "这首歌"
  };
}

function artistSentence(parsed) {
  if (!parsed.artistName || parsed.artistName === "这位创作者") {
    return "歌手信息没有被完整写进曲库，";
  }

  return `歌手是 ${parsed.artistName}，`;
}

function versionKind(title = "") {
  const lowered = title.toLowerCase();
  if (lowered.includes("remix") || lowered.includes("bootleg") || lowered.includes("flip") || title.includes("混音")) {
    return "混音版本";
  }
  if (lowered.includes("cover") || title.includes("翻自") || title.includes("翻唱")) {
    return "翻唱版本";
  }
  if (lowered.includes("live") || title.includes("现场")) {
    return "现场版本";
  }
  if (lowered.includes("piano") || title.includes("钢琴") || title.includes("纯音")) {
    return "器乐版本";
  }
  return "私人收藏";
}

function recommendationReason(track, profile) {
  const mood = track.mood ?? "open";

  const byDaypart = {
    morning: {
      morning: "早晨不适合一下子太满，它能把人轻轻叫醒。",
      warm: "它的温度比较柔和，适合让一天从松弛处开始。",
      focus: "它有稳定的线条，适合慢慢进入工作状态。",
      open: "它留了空间，适合早上的第一段声音。"
    },
    daytime: {
      focus: "白天最需要稳定和专注，所以我把它放在这里。",
      morning: "它有一点清爽的推进感，可以接住上午的精神。",
      drive: "它的节奏更有行动感，适合让白天继续往前走。",
      open: "它不会太占情绪，适合在工作间隙把注意力拉回来。"
    },
    evening: {
      warm: "傍晚需要从白天退出来，它的温度刚好能接住人。",
      drive: "它带一点城市感，适合下班路上和灯光一起出现。",
      midnight: "它比白天更低一点，适合把节奏慢慢放下来。",
      open: "它不把情绪推满，适合让傍晚自然落下去。"
    },
    midnight: {
      midnight: "深夜不需要太亮的声音，它适合把房间慢慢安静下来。",
      warm: "它有温柔的边缘，适合夜里一个人听。",
      focus: "它很稳，适合陪你做最后一点事，然后慢慢收尾。",
      open: "它给人留了空间，适合夜里不说太多的时候。"
    }
  };

  return byDaypart[profile.daypart]?.[mood] ?? byDaypart[profile.daypart]?.open ?? "它和现在的气氛合拍，所以我把它排进这一段。";
}

function parseJsonObject(text) {
  const trimmed = text.trim();
  const jsonText = trimmed.startsWith("{") ? trimmed : trimmed.match(/\{[\s\S]*\}/)?.[0];
  if (!jsonText) throw new Error("No JSON object returned.");
  return JSON.parse(jsonText);
}

function normalizeScripts(scripts, fallback, source) {
  return {
    opening: cleanScript(scripts.opening) || fallback.opening,
    breaks:
      Array.isArray(scripts.breaks) && scripts.breaks.length
        ? scripts.breaks.map(cleanScript).filter(Boolean).slice(0, 2)
        : fallback.breaks,
    closing: cleanScript(scripts.closing) || fallback.closing,
    source
  };
}

function enforceTrackNames(scripts, musicItems) {
  const tracks = musicItems.slice(0, 3);
  const opening = ensureStationName(ensureMentionsTrack(scripts.opening, tracks[0], "接下来要播的是"));
  const breaks = tracks.slice(1).map((track, index) => ensureMentionsTrack(scripts.breaks?.[index], track, "下一首要播的是"));

  return {
    ...scripts,
    opening,
    breaks: breaks.filter(Boolean)
  };
}

function ensureStationName(script) {
  if (!script) return script;
  if (script.includes("Open Radio")) return script;
  return `这里是 Open Radio。${script}`;
}

function ensureMentionsTrack(script, track, prefix) {
  if (!track || !script) return script;
  if (script.includes(track.title)) return script;
  return `${prefix}《${track.title}》。${script}`;
}

function cleanScript(value) {
  if (typeof value !== "string") return "";
  return value.replace(/[<>#]/g, "").replace(/\s+/g, " ").trim();
}
