"use client";

import { Mic, Send } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import {
  saveListenerFeedback,
  sendHostChat,
  type CurrentPlaybackItemContext,
  type ListenerFeedbackType,
  type PlannerSlot
} from "../lib/api";
import { AvatarBadge } from "./AvatarBadge";
import { HostProfileHoverCard } from "./HostProfileHoverCard";

export const HOST_NAME = "Codio";

const storageKey = "open-radio-host-chat-memory";

type RadioHostChatProps = {
  currentTitle: string;
  currentArtist: string;
  currentMood?: string;
  currentPlaybackItem?: CurrentPlaybackItemContext | null;
  plannerSlot?: PlannerSlot | null;
  plannerStatus?: "loading" | "ready" | "error";
};

type ChatRole = "host" | "user";

type HostMemoryEntry = {
  userInput: string;
  hostReply: string;
  feedback?: string;
  scene: string;
  emotion: string;
  musicDirection: string;
  time: string;
};

type ChatMessage = {
  id: string;
  role: ChatRole;
  nickname: string;
  text: string;
  time: string;
  memory?: HostMemoryEntry;
  planningLabel?: string;
};

const demoMemory: HostMemoryEntry = {
  userInput: "今天下雨，想听一点松弛的歌。",
  hostReply:
    "收到。雨天我会先避开太密集的鼓点，给你放一点节奏慢、旋律清楚的声音。那种歌不会打断你，但会让房间慢慢有一点温度。",
  scene: "rainy",
  emotion: "calm",
  musicDirection: "慢节奏、旋律清楚、鼓点不密的中文歌",
  time: new Date().toISOString()
};

function defaultOpening() {
  return `我是 ${HOST_NAME}。你不用告诉我歌名，只要告诉我你现在的状态、心情，或者想要什么氛围。我会慢慢记住你的音乐口味，然后像一个真正的电台主持人一样，为你介绍接下来要播放的歌。`;
}

function initialMessages(): ChatMessage[] {
  return [
    {
      id: "host-opening",
      role: "host",
      nickname: HOST_NAME,
      text: defaultOpening(),
      time: "刚刚"
    },
    {
      id: "user-demo",
      role: "user",
      nickname: "你",
      text: demoMemory.userInput,
      time: "刚刚"
    },
    {
      id: "host-demo",
      role: "host",
      nickname: HOST_NAME,
      text: demoMemory.hostReply,
      time: "刚刚",
      memory: demoMemory
    }
  ];
}

function timeLabel(date: Date) {
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

function inferScene(input: string) {
  if (/工作|上班|专注|学习/.test(input)) return "work";
  if (/雨|下雨|阴天/.test(input)) return "rainy";
  if (/晚上|夜|深夜|累|困/.test(input)) return "night";
  if (/健身|跑步|运动|训练/.test(input)) return "gym";
  if (/放松|松弛|休息|慢/.test(input)) return "relax";
  return "daily";
}

function inferEmotion(input: string) {
  if (/累|困|烦|焦虑|低落|难受/.test(input)) return "tired";
  if (/开心|兴奋|燃|高能|冲|健身/.test(input)) return "energetic";
  if (/放松|松弛|安静|温柔|慢/.test(input)) return "calm";
  return "neutral";
}

function inferDirection(scene: string, emotion: string) {
  if (scene === "rainy") return "慢节奏、旋律清楚、鼓点不密的中文歌";
  if (scene === "work") return "不抢注意力、有稳定律动的歌";
  if (scene === "gym") return "节奏明确、推进感强的歌";
  if (scene === "night") return "低频、留白、陪伴感强的声音";
  if (scene === "relax" || emotion === "calm") return "温柔、松弛、不会打断你的歌";
  return "中等能量、旋律舒服、适合继续听下去的歌";
}

function makeHostReply(
  input: string,
  currentTitle: string,
  currentArtist: string,
  currentMood?: string,
  plannerSlot?: PlannerSlot | null
) {
  const scene = inferScene(input);
  const emotion = inferEmotion(input);
  const plannerDirection = plannerSlot?.musicDirection?.join("、");
  const musicDirection = plannerDirection || inferDirection(scene, emotion);
  const slotLine = plannerSlot ? `现在这段是「${plannerSlot.title}」，我会顺着这个节目流往前走。` : "";
  const moodLine = currentMood ? `现在这首歌带一点 ${currentMood} 的颜色，` : "";
  const hostReply = `收到。你的状态我先记下了。${slotLine}我会把声音往「${musicDirection}」那边靠。${moodLine}先听 ${currentArtist} 的《${currentTitle}》，我们从这里开始调频。`;

  return { scene, emotion, musicDirection, hostReply };
}

function readMemory() {
  try {
    const saved = window.localStorage.getItem(storageKey);
    if (!saved) return [];
    return JSON.parse(saved) as HostMemoryEntry[];
  } catch {
    return [];
  }
}

const feedbackTypeByLabel: Record<string, ListenerFeedbackType> = {
  喜欢: "like",
  不喜欢: "dislike",
  多来点这种: "more_like_this",
  少推荐这种: "less_like_this"
};

export function RadioHostChat({
  currentTitle,
  currentArtist,
  currentMood,
  currentPlaybackItem,
  plannerSlot,
  plannerStatus = "ready"
}: RadioHostChatProps) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(() => initialMessages());
  const [memory, setMemory] = useState<HostMemoryEntry[]>([]);
  const [feedbackByMessage, setFeedbackByMessage] = useState<Record<string, string>>({});
  const [isSending, setIsSending] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    setMemory(readMemory());
    setIsReady(true);
  }, []);

  useEffect(() => {
    if (!isReady) return;
    window.localStorage.setItem(storageKey, JSON.stringify(memory));
  }, [isReady, memory]);

  useEffect(() => {
    if (!plannerSlot?.hostOpening) return;

    setMessages((current) =>
      current.map((message) =>
        message.id === "host-opening"
          ? {
              ...message,
              text: plannerSlot.hostOpening ?? defaultOpening(),
              planningLabel: `Now planning: ${plannerSlot.title}`
            }
          : message
      )
    );
  }, [plannerSlot?.hostOpening, plannerSlot?.title]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const userInput = input.trim();
    if (!userInput || isSending) return;

    const now = new Date();
    const stamp = now.getTime();
    const pendingHostId = `host-${stamp}`;

    setMessages((current) => [
      ...current,
      { id: `user-${stamp}`, role: "user", nickname: "你", text: userInput, time: timeLabel(now) },
      {
        id: pendingHostId,
        role: "host",
        nickname: HOST_NAME,
        text: "Codio 正在听...",
        time: timeLabel(now)
      }
    ]);
    setInput("");
    setIsSending(true);

    try {
      const response = await sendHostChat({
        message: userInput,
        currentSlot: plannerSlot,
        currentPlaybackItem: currentPlaybackItem ?? null
      });
      const memoryEntry: HostMemoryEntry = {
        userInput,
        hostReply: response.reply,
        scene: plannerSlot?.scene ?? "daily",
        emotion: response.detectedMood ?? currentMood ?? "neutral",
        musicDirection:
          response.detectedPreferences?.tags?.join(" / ") ||
          plannerSlot?.musicDirection?.join(" / ") ||
          "Codio Selection",
        time: new Date().toISOString()
      };

      setMessages((current) =>
        current.map((message) =>
          message.id === pendingHostId ? { ...message, text: response.reply, memory: memoryEntry } : message
        )
      );
      setMemory((current) => [...current, memoryEntry]);
    } catch (error) {
      console.warn("Host brain unavailable, using local fallback.", error);
      const reply = makeHostReply(userInput, currentTitle, currentArtist, currentMood, plannerSlot);
      const memoryEntry: HostMemoryEntry = {
        userInput,
        hostReply: reply.hostReply,
        scene: reply.scene,
        emotion: reply.emotion,
        musicDirection: reply.musicDirection,
        time: new Date().toISOString()
      };

      setMessages((current) =>
        current.map((message) =>
          message.id === pendingHostId ? { ...message, text: reply.hostReply, memory: memoryEntry } : message
        )
      );
      setMemory((current) => [...current, memoryEntry]);
    } finally {
      setIsSending(false);
    }
  }

  function rememberFeedback(message: ChatMessage, feedback: string) {
    if (!message.memory) return;
    const memoryEntry = message.memory;
    const feedbackType = feedbackTypeByLabel[feedback] ?? "like";
    setFeedbackByMessage((current) => ({ ...current, [message.id]: feedback }));
    setMemory((current) => {
      const exists = current.some(
        (entry) => entry.time === memoryEntry.time && entry.hostReply === memoryEntry.hostReply
      );
      if (!exists) return [...current, { ...memoryEntry, feedback }];
      return current.map((entry) =>
        entry.time === memoryEntry.time && entry.hostReply === memoryEntry.hostReply
          ? { ...entry, feedback }
          : entry
      );
    });
    void saveListenerFeedback({
      messageId: message.id,
      feedbackType,
      userMessage: memoryEntry.userInput,
      hostReply: memoryEntry.hostReply,
      slotId: plannerSlot?.id,
      slotTitle: plannerSlot?.title,
      track: {
        title: currentTitle,
        artist: currentArtist,
        source: plannerSlot?.tracks?.[0]?.source ?? "local"
      },
      musicDirection: plannerSlot?.musicDirection ?? [memoryEntry.musicDirection],
      scene: plannerSlot?.scene ?? memoryEntry.scene,
      mood: plannerSlot?.mood ?? memoryEntry.emotion,
      createdAt: new Date().toISOString()
    }).catch((error) => {
      console.warn("Feedback saved locally, but backend sync failed.", error);
    });
  }

  return (
    <section className="device-chat" aria-label="电台主持人聊天区">
      <header className="chat-host-bar">
        <div className="chat-host-status">
          <span className="online-dot" />
          <span>
            <strong>{HOST_NAME}</strong>
            <small>
              {plannerStatus === "loading"
                ? "Connecting to Codio planner..."
                : plannerStatus === "error"
                  ? "Planner 暂时离线，先使用本地电台模式。"
                  : "Connected to Codio planner"}
            </small>
          </span>
        </div>
        <span className="live-tag">LIVE</span>
      </header>

      <div className="chat-thread" aria-live="polite">
        {messages.map((message) => (
          <article className={`chat-message ${message.role}`} key={message.id}>
            {message.role === "host" ? (
              <HostProfileHoverCard>
                <AvatarBadge kind="host" className="chat-avatar host" />
              </HostProfileHoverCard>
            ) : (
              <AvatarBadge kind="user" className="chat-avatar user" />
            )}
            <div className="chat-message-body">
              <div className="chat-meta">
                <strong>{message.nickname}</strong>
                <time>{message.time}</time>
              </div>
              <p>{message.text}</p>
              {message.planningLabel ? <span className="chat-planning-note">{message.planningLabel}</span> : null}
              {message.role === "host" && message.memory ? (
                <div className="chat-feedback" aria-label="反馈这条推荐">
                  {["喜欢", "不喜欢", "多来点这种", "少推荐这种"].map((feedback) => (
                    <button key={feedback} type="button" onClick={() => rememberFeedback(message, feedback)}>
                      {feedback}
                    </button>
                  ))}
                  {feedbackByMessage[message.id] ? <span>已记住你的反馈</span> : null}
                </div>
              ) : null}
            </div>
          </article>
        ))}
      </div>

      <form className="chat-compose" onSubmit={sendMessage}>
        <input
          onChange={(event) => setInput(event.target.value)}
          placeholder="告诉主持人你现在的状态，或者想听什么氛围..."
          value={input}
        />
        <button type="button" aria-label="麦克风">
          <Mic size={16} />
        </button>
        <button type="submit" disabled={!input.trim() || isSending} aria-label="发送">
          <Send size={16} />
        </button>
      </form>

      <footer className="device-bottom-status">
        <span>CODIO FM.</span>
        <span>CONNECTED.</span>
      </footer>
    </section>
  );
}
