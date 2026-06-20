"use client";

import { useEffect, useRef } from "react";

// 极简富文本编辑器：基于 contentEditable + document.execCommand。
// 满足 SOW 4.2 的基础富文本需求（加粗/斜体/标题/列表/引用/代码/链接）。
// MVP 阶段够用；后续可替换为 TipTap/Lexical 等。

const TOOLS: { cmd: string; arg?: string; label: string; title: string }[] = [
  { cmd: "bold", label: "B", title: "Bold" },
  { cmd: "italic", label: "I", title: "Italic" },
  { cmd: "formatBlock", arg: "H2", label: "H", title: "Heading" },
  { cmd: "insertUnorderedList", label: "•", title: "Bulleted list" },
  { cmd: "insertOrderedList", label: "1.", title: "Numbered list" },
  { cmd: "formatBlock", arg: "BLOCKQUOTE", label: "❝", title: "Quote" },
  { cmd: "formatBlock", arg: "PRE", label: "</>", title: "Code block" },
];

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Start writing…",
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // 仅在外部值与当前 DOM 不一致时写入，避免光标跳动。
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) {
      ref.current.innerHTML = value;
    }
  }, [value]);

  const exec = (cmd: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(cmd, false, arg);
    if (ref.current) onChange(ref.current.innerHTML);
  };

  const addLink = () => {
    const url = window.prompt("Link URL:", "https://");
    if (url) exec("createLink", url);
  };

  return (
    <div className="border border-slate-300 rounded-lg overflow-hidden bg-white">
      <div className="flex flex-wrap gap-1 border-b border-slate-200 bg-slate-50 px-2 py-1.5">
        {TOOLS.map((t, i) => (
          <button
            key={i}
            type="button"
            title={t.title}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec(t.cmd, t.arg)}
            className="min-w-[28px] h-7 px-1.5 rounded text-sm text-slate-600 hover:bg-slate-200"
          >
            {t.label}
          </button>
        ))}
        <button
          type="button"
          title="Link"
          onMouseDown={(e) => e.preventDefault()}
          onClick={addLink}
          className="min-w-[28px] h-7 px-1.5 rounded text-sm text-slate-600 hover:bg-slate-200"
        >
          🔗
        </button>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={(e) => onChange((e.target as HTMLDivElement).innerHTML)}
        className="rte-content min-h-[200px] p-3 focus:outline-none"
      />
    </div>
  );
}
