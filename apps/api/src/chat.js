const hostProfile = {
  name: "Codio",
  identity: "a private local AI radio host and music curator",
  temperament: "calm, intimate, precise, a little nocturnal, never like a generic assistant",
  taste:
    "local-library-first selections: remixes, piano versions, live versions, covers, obscure edits, soft late-night tracks, and focused work music",
  boundaries:
    "Do not invent real song history, album facts, collaborators, or release background. If a fact is unknown, say it as an impression from the title, artist, source, mood, and local library context."
};

const moodAliases = [
  { mood: "midnight", words: ["深夜", "安静", "失眠", "emo", "低落", "孤独", "慢一点", "夜色", "放空"] },
  { mood: "warm", words: ["温柔", "治愈", "舒服", "陪伴", "暖", "放松", "回家", "不累"] },
  { mood: "focus", words: ["工作", "专注", "学习", "写东西", "效率", "白天", "稳定", "背景"] },
  { mood: "drive", words: ["开车", "通勤", "节奏", "运动", "嗨", "提神", "城市", "路上"] },
  { mood: "morning", words: ["早上", "清晨", "醒来", "咖啡", "阳光", "开始"] },
  { mood: "open", words: ["随便", "随机", "换一首", "推荐", "想听歌", "来点"] }
];

export async function createRadioChatReply({ message, program, playback, currentSlot, libraryTracks = [] }) {
  const cleanMessage = sanitizeMessage(message);
  const currentContext = buildCurrentContext(program, playback, currentSlot);
  const intent = detectIntent(cleanMessage);
  const candidates = intent === "recommendation" ? selectRecommendationCandidates(cleanMessage, libraryTracks, program) : [];

  if (!cleanMessage) {
    return {
      reply: "我在。你可以直接问我现在正在放什么，也可以告诉我你现在的状态，我会按当前节目时段和本地曲库来接歌。",
      intent: "empty",
      source: "local-template"
    };
  }

  if (intent === "current_track") {
    return {
      reply: createCurrentTrackReply(currentContext),
      intent,
      source: "local-template"
    };
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return createFallbackReply(cleanMessage, currentContext, candidates, intent);
  }

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
            content: buildSystemPrompt({ currentContext, candidates, intent })
          },
          {
            role: "user",
            content: cleanMessage
          }
        ],
        temperature: intent === "recommendation" ? 0.58 : 0.42,
        max_tokens: 360
      })
    });

    if (!response.ok) {
      throw new Error(`DeepSeek chat failed: ${response.status}`);
    }

    const data = await response.json();
    const reply = cleanReply(data.choices?.[0]?.message?.content);

    return {
      reply: reply || createFallbackReply(cleanMessage, currentContext, candidates, intent).reply,
      intent,
      detectedMood: inferRequestedMood(cleanMessage) ?? currentContext.slot.mood,
      detectedPreferences: {
        energy: currentContext.slot.energy,
        language: null,
        tags: currentContext.slot.musicDirection
      },
      source: `deepseek:${model}`
    };
  } catch (error) {
    console.warn("DeepSeek chat failed; falling back to local reply.", error);
    return createFallbackReply(cleanMessage, currentContext, candidates, intent);
  }
}

export async function createRadioHostIntroCopy({ program, currentSlot, currentTrack }) {
  const context = buildCurrentContext(
    program,
    {
      currentType: "music",
      currentItemId: currentTrack?.id,
      currentTitle: currentTrack?.title,
      artist: currentTrack?.artist,
      source: currentTrack?.source,
      durationSeconds: currentTrack?.durationSeconds,
      mood: currentTrack?.mood,
      reason: currentTrack?.reason,
      tags: currentTrack?.tags
    },
    currentSlot
  );
  const fallback = createHostIntroFallback(context);
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    return {
      text: fallback,
      source: "local-template"
    };
  }

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
            content: `You are Codio, a private local AI radio host. Write one short Chinese voice intro before the current song plays.

Hard facts:
- Song title: ${context.playback.title || "unknown"}
- Artist: ${context.playback.artist || "unknown"}
- Source: ${context.playback.source || "local library"}
- Track planner reason: ${context.playback.reason || "unknown"}
- Track tags: ${context.playback.tags.join(" / ") || "unknown"}
- Current program slot: ${context.slot.timeRange || "unknown"} / ${context.slot.title || "unknown"}
- Slot host opening: ${context.slot.hostOpening || "unknown"}
- Slot mood: ${context.slot.mood || "unknown"}
- Slot music direction: ${context.slot.musicDirection.join(" / ") || "unknown"}
- Slot reason: ${context.slot.reason || "unknown"}
- Local routine activity: ${context.slot.routineContext.activity || "unknown"}
- Local routine intent: ${context.slot.routineContext.intent || "unknown"}
- Local routine music intent: ${context.slot.routineContext.musicIntent || "unknown"}

Required structure:
Write exactly four short Chinese sentences in this order, without headings:
1. Announce the song title and artist.
2. Explain the recommendation reason: why this song is being played now in this local routine slot.
3. Introduce the artist/creator only from the provided artist name, then infer the creative idea from the sound/title/version. If real background is unknown, say it as listening inference, not fact.
4. Describe the song's mood and listening image.

Rules:
1. Speak as Codio, not Claudio.
2. Do not invent release years, album facts, collaborators, biography, or real creative history.
3. The second sentence must clearly use the local routine intent if it is known.
4. The third sentence must include a phrase like "从听感上看" or "从这首歌的气质看".
5. 130 to 210 Chinese characters, natural for TTS, no Markdown, no emoji, no stage directions.`
          },
          {
            role: "user",
            content: "为当前这首歌写播放前口播。"
          }
        ],
        temperature: 0.54,
        max_tokens: 220
      })
    });

    if (!response.ok) {
      throw new Error(`DeepSeek host intro failed: ${response.status}`);
    }

    const data = await response.json();
    const text = cleanReply(data.choices?.[0]?.message?.content);

    return {
      text: text || fallback,
      source: text ? `deepseek:${model}` : "local-template"
    };
  } catch (error) {
    console.warn("DeepSeek host intro failed; falling back to local intro.", error);
    return {
      text: fallback,
      source: "local-template"
    };
  }
}

function buildSystemPrompt({ currentContext, candidates, intent }) {
  const current = currentContext.playback;
  const slot = currentContext.slot;
  const candidateLines = candidates.map(formatCandidateLine).join("\n");

  return `You are ${hostProfile.name}, ${hostProfile.identity}.

Codio persona:
- Temperament: ${hostProfile.temperament}.
- Taste: ${hostProfile.taste}.
- Factual boundary: ${hostProfile.boundaries}
- You are the DJ inside a private local AI radio terminal. Do not call yourself Claudio. Your name is Codio.

Hard current context:
- Current playback type: ${current.type}
- Current song title: ${current.title || "unknown"}
- Current artist: ${current.artist || "unknown"}
- Current source: ${current.source || "local library"}
- Current mood: ${current.mood || "unknown"}
- Current program slot: ${slot.timeRange || "unknown"} / ${slot.title || "unknown"}
- Slot scene: ${slot.scene || "unknown"}
- Slot mood: ${slot.mood || "unknown"}
- Slot music direction: ${slot.musicDirection.length ? slot.musicDirection.join(" / ") : "unknown"}
- Slot reason: ${slot.reason || "unknown"}
- User intent for this turn: ${intent}

Candidate local-library songs for recommendation:
${candidateLines || "No recommendation candidates were selected for this turn."}

Rules:
1. Always reply in Chinese.
2. If the user asks what is playing, what this song is, who sings it, the current song title, or the current track, answer ONLY with the current song: ${current.title || "unknown"} by ${current.artist || "unknown"}. Do not recommend another song in that answer.
3. If the user asks about the current program or time slot, answer from the current program slot above.
4. If the user asks for recommendations, recommend 1 to 3 songs only from the candidate local-library list. Make it clear this is a suggestion, not proof that playback already changed.
5. When explaining why a song is being played, connect it to the current slot, mood, and local-library taste. Do not invent external facts.
6. Keep the tone like a radio host: concise, warm, and specific. 2 to 5 sentences. No Markdown, no emoji, no stage directions.`;
}

function createFallbackReply(message, currentContext, candidates, intent) {
  if (intent === "current_track") {
    return {
      reply: createCurrentTrackReply(currentContext),
      intent,
      source: "local-template"
    };
  }

  if (intent === "program_slot") {
    const slot = currentContext.slot;
    return {
      reply: `现在是「${slot.title || "当前节目"}」这个时段，时间段是 ${slot.timeRange || "本地时间"}。这一段的方向是 ${slot.musicDirection.join(" / ") || slot.mood || "按你的状态慢慢接歌"}，我会围绕这个氛围来介绍和推荐。`,
      intent,
      detectedMood: slot.mood,
      detectedPreferences: { energy: slot.energy, language: null, tags: slot.musicDirection },
      source: "local-template"
    };
  }

  if (intent === "recommendation" && candidates.length) {
    const picks = candidates.slice(0, 2);
    return {
      reply:
        `我建议先听「${picks[0].title}」${picks[0].artist ? `，${picks[0].artist}` : ""}。它更贴近你刚才说的状态，也和现在「${currentContext.slot.title || "这个时段"}」的气质比较顺。` +
        (picks[1] ? ` 后面可以接「${picks[1].title}」，让情绪有一个自然的转弯。` : ""),
      intent,
      detectedMood: inferRequestedMood(message) ?? currentContext.slot.mood,
      detectedPreferences: { energy: currentContext.slot.energy, language: null, tags: currentContext.slot.musicDirection },
      source: "local-template"
    };
  }

  return {
    reply: `我听到了。现在 Codio 正在围绕「${currentContext.slot.title || "当前节目"}」这个时段工作，当前播放是「${currentContext.playback.title || "未知歌曲"}」${currentContext.playback.artist ? `，${currentContext.playback.artist}` : ""}。你可以继续问这首歌，也可以告诉我你想让接下来的歌更安静、更专注，还是更有节奏。`,
    intent,
    detectedMood: inferRequestedMood(message) ?? currentContext.slot.mood,
    detectedPreferences: { energy: currentContext.slot.energy, language: null, tags: currentContext.slot.musicDirection },
    source: "local-template"
  };
}

function createCurrentTrackReply(currentContext) {
  const current = currentContext.playback;
  if (!current.title) {
    return "现在播放器还没有拿到明确的歌曲信息。我会等曲库和播放器同步完成后，再告诉你准确歌名。";
  }

  const artist = current.artist ? `，歌手是 ${current.artist}` : "";
  const slot = currentContext.slot.title ? `它现在属于「${currentContext.slot.title}」这个节目时段。` : "";
  return `现在正在播放的是「${current.title}」${artist}。${slot}`.trim();
}

function createHostIntroFallback(currentContext) {
  const current = currentContext.playback;
  const slot = currentContext.slot;
  const title = current.title || "这首歌";
  const artistName = current.artist || "这位音乐人";
  const artist = current.artist ? `，歌手是 ${current.artist}` : "";
  const slotName = slot.title || "当前节目";
  const routineIntent = stripSentenceEnd(slot.routineContext.intent || slot.hostOpening || slot.reason || "它和当前时段的气质贴得比较近");
  const routineMusicIntent = stripSentenceEnd(slot.routineContext.musicIntent || "");
  const direction = formatDirectionForSpeech(slot.musicDirection.length ? slot.musicDirection.slice(0, 2) : [slot.mood || "现在的状态"]);
  const trackReason = stripSentenceEnd(current.reason || "它和当前时段的气质贴得比较近");
  const image = createListeningImage(current, slot);

  return `接下来播放「${title}」${artist}。我把它放在「${slotName}」，是因为${routineIntent}${routineMusicIntent ? `，${routineMusicIntent}` : `，${trackReason}`}。从听感上看，${artistName}像是在用克制的声音线条推进这首歌的创作思路，不急着把情绪说满。这首歌带来的意境会像${image}，让现在这段${direction}慢慢展开。`.trim();
}

function stripSentenceEnd(value) {
  return String(value ?? "").trim().replace(/[。.!！?？]+$/u, "");
}

function formatDirectionForSpeech(items) {
  const labels = {
    "steady-groove": "稳定律动",
    instrumental: "器乐质感",
    "light-electronic": "轻电子",
    "mandarin-pop": "华语流行",
    piano: "钢琴",
    "rhythm-pop": "节奏流行",
    city: "城市感",
    "warm-vocal": "温暖人声",
    "neo-classical": "新古典",
    chill: "放松氛围",
    "late-night": "深夜感",
    ambient: "氛围",
    relax: "松弛"
  };

  return items.map((item) => labels[item] ?? item).filter(Boolean).join("、") || "现在的状态";
}

function createListeningImage(current, slot) {
  const signals = [
    String(current.mood ?? ""),
    ...(Array.isArray(current.tags) ? current.tags : []),
    String(slot.mood ?? ""),
    ...(Array.isArray(slot.musicDirection) ? slot.musicDirection : [])
  ]
    .join(" ")
    .toLowerCase();

  if (/night|midnight|late|ambient|quiet|夜/u.test(signals)) return "夜里低亮度的房间、远处的灯和一点悬浮感";
  if (/work|focus|steady|piano|instrumental|专注/u.test(signals)) return "一条稳定的专注轨道，像桌面上持续亮着的一盏小灯";
  if (/morning|clear|light|wake/u.test(signals)) return "清晨刚打开的空气，干净、轻一点，但仍然有推进";
  if (/warm|love|soft|relax|evening|noon/u.test(signals)) return "柔软的室内光线和慢慢放下来的呼吸";
  if (/drive|city|rhythm|beat|remix/u.test(signals)) return "城市路面上的节奏感，速度不急，但一直往前";
  return "一个安静展开的场景，让情绪先落地，再进入下一首歌";
}

function buildCurrentContext(program, playback, currentSlot) {
  const programItem = getCurrentItem(program, playback);
  const currentMusic =
    playback?.currentType === "music" || playback?.type === "music" || programItem?.type === "music"
      ? {
          type: "music",
          title: playback?.currentTitle ?? playback?.title ?? programItem?.title ?? "",
          artist: playback?.artist ?? programItem?.artist ?? "",
          source: playback?.source ?? programItem?.source ?? "",
          durationSeconds: playback?.durationSeconds ?? programItem?.durationSeconds ?? null,
          mood: playback?.mood ?? programItem?.mood ?? null,
          reason: playback?.reason ?? programItem?.reason ?? "",
          tags: Array.isArray(playback?.tags) ? playback.tags.map(String) : []
        }
      : {
          type: playback?.currentType ?? playback?.type ?? programItem?.type ?? "unknown",
          title: playback?.currentTitle ?? playback?.title ?? programItem?.title ?? "",
          artist: playback?.artist ?? programItem?.artist ?? "",
          source: playback?.source ?? programItem?.source ?? "",
          durationSeconds: playback?.durationSeconds ?? programItem?.durationSeconds ?? null,
          mood: playback?.mood ?? programItem?.mood ?? null,
          reason: playback?.reason ?? programItem?.reason ?? "",
          tags: Array.isArray(playback?.tags) ? playback.tags.map(String) : []
        };

  return {
    playback: currentMusic,
    slot: normalizeSlot(currentSlot),
    program: {
      title: program?.title ?? "",
      description: program?.description ?? "",
      mood: program?.mood ?? ""
    }
  };
}

function normalizeSlot(slot) {
  if (!slot || typeof slot !== "object") {
    return {
      id: "",
      title: "",
      timeRange: "",
      scene: "",
      mood: "",
      energy: "",
      reason: "",
      hostOpening: "",
      musicDirection: [],
      routineContext: emptyRoutineContext()
    };
  }

  return {
    id: String(slot.id ?? ""),
    title: String(slot.title ?? ""),
    timeRange: String(slot.timeRange ?? ""),
    scene: String(slot.scene ?? ""),
    mood: String(slot.mood ?? ""),
    energy: String(slot.energy ?? ""),
    reason: String(slot.reason ?? ""),
    hostOpening: String(slot.hostOpening ?? ""),
    musicDirection: Array.isArray(slot.musicDirection) ? slot.musicDirection.map(String) : [],
    routineContext: normalizeRoutineContext(slot.routineContext)
  };
}

function normalizeRoutineContext(context) {
  if (!context || typeof context !== "object") {
    return emptyRoutineContext();
  }

  return {
    source: String(context.source ?? ""),
    label: String(context.label ?? ""),
    activity: String(context.activity ?? ""),
    intent: String(context.intent ?? ""),
    musicIntent: String(context.musicIntent ?? ""),
    displayStyles: Array.isArray(context.displayStyles) ? context.displayStyles.map(String) : [],
    timeRange: String(context.timeRange ?? "")
  };
}

function emptyRoutineContext() {
  return {
    source: "",
    label: "",
    activity: "",
    intent: "",
    musicIntent: "",
    displayStyles: [],
    timeRange: ""
  };
}

function detectIntent(message) {
  if (isCurrentTrackQuestion(message)) return "current_track";
  if (isProgramSlotQuestion(message)) return "program_slot";
  if (isRecommendationRequest(message)) return "recommendation";
  return "chat";
}

function isCurrentTrackQuestion(message) {
  const normalized = message.toLowerCase();
  return [
    "现在放",
    "正在放",
    "当前播放",
    "当前歌曲",
    "这首歌",
    "歌名",
    "谁唱",
    "什么歌",
    "now playing",
    "current song",
    "what song"
  ].some((word) => normalized.includes(word));
}

function isProgramSlotQuestion(message) {
  const normalized = message.toLowerCase();
  return ["节目", "时段", "节目单", "现在是什么时间段", "slot", "program"].some((word) => normalized.includes(word));
}

function isRecommendationRequest(message) {
  return ["推荐", "想听", "来点", "换", "放", "适合", "音乐", "心情", "状态", "recommend"].some((word) =>
    message.toLowerCase().includes(word)
  );
}

function selectRecommendationCandidates(message, libraryTracks, program) {
  const targetMood = inferRequestedMood(message);
  const words = tokenize(message);
  const currentIds = new Set(getMusicItems(program).map((item) => String(item.id ?? "").replace(/^track-/, "")));

  return [...libraryTracks]
    .map((track, index) => ({
      track,
      score: scoreTrack(track, targetMood, words, currentIds) - index * 0.0001
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 24)
    .map(({ track }) => track);
}

function scoreTrack(track, targetMood, words, currentIds) {
  const haystack = `${track.title ?? ""} ${track.artist ?? ""} ${track.filename ?? ""} ${track.mood ?? ""}`.toLowerCase();
  let score = 0;

  if (targetMood && track.mood === targetMood) score += 16;
  if (!targetMood && track.mood === "open") score += 2;
  if (track.source?.includes("NetEase")) score += 1.2;
  if (currentIds.has(track.id)) score -= 6;

  for (const word of words) {
    if (word.length >= 2 && haystack.includes(word.toLowerCase())) score += 5;
  }

  if (/remix|bootleg|flip|cover|钢琴|纯音|live|翻自|翻唱/i.test(haystack)) score += 1.5;

  return score;
}

function formatCandidateLine(track, index) {
  return `${index + 1}. ${track.title ?? "unknown"} / ${track.artist ?? track.source ?? "unknown"} / mood: ${
    track.mood ?? "open"
  } / source: ${track.source ?? "local library"}`;
}

function inferRequestedMood(message) {
  return moodAliases.find((entry) => entry.words.some((word) => message.includes(word)))?.mood ?? null;
}

function tokenize(message) {
  return message
    .split(/[\s,，。！？?.、]+/)
    .map((word) => word.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function getMusicItems(program) {
  return Array.isArray(program?.items) ? program.items.filter((item) => item.type === "music") : [];
}

function getCurrentItem(program, playback) {
  if (!Array.isArray(program?.items) || !playback) return null;

  if (typeof playback.currentItemId === "string") {
    const byId = program.items.find((item) => item.id === playback.currentItemId);
    if (byId) return byId;
  }

  if (Number.isInteger(playback.currentIndex)) {
    return program.items[playback.currentIndex] ?? null;
  }

  return null;
}

function sanitizeMessage(message) {
  if (typeof message !== "string") return "";
  return message.replace(/\s+/g, " ").trim().slice(0, 600);
}

function cleanReply(reply) {
  if (typeof reply !== "string") return "";
  return reply.replace(/[<>#]/g, "").replace(/\s+/g, " ").trim();
}
