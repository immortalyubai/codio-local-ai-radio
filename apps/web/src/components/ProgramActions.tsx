"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { generateTodayProgram } from "../lib/api";

export function ProgramActions() {
  const router = useRouter();
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setIsGenerating(true);
    setError(null);

    try {
      await generateTodayProgram();
      router.refresh();
    } catch {
      setError("节目生成失败，请稍后再试。");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="actions">
      <button className="primary-button" type="button" onClick={generate} disabled={isGenerating}>
        <RefreshCw size={18} />
        {isGenerating ? "生成中" : "重新生成节目"}
      </button>
      {error ? <p className="error-text">{error}</p> : null}
    </div>
  );
}
