"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SlashCommand {
  command: string;
  placeholder: string;
  description: string;
}

const SLASH_COMMANDS: SlashCommand[] = [
  {
    command: "/research",
    placeholder: "[topic]",
    description: "Spawn a Research Agent job for the topic.",
  },
  {
    command: "/audit",
    placeholder: "[url]",
    description: "Start a competitive site audit against the URL.",
  },
  {
    command: "/status",
    placeholder: "[site]",
    description: "Return current multi-agent workflow health.",
  },
];

interface ChatInputProps {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => Promise<void> | void;
  disabled?: boolean;
}

const MAX_HEIGHT = 200;

function matchedCommands(input: string): SlashCommand[] {
  const trimmed = input.trimStart();
  if (!trimmed.startsWith("/")) return [];
  // Only show the popover until the user types a space — after that the
  // user is typing the argument and the menu would just be noise.
  if (/\s/.test(trimmed)) return [];
  const lowered = trimmed.toLowerCase();
  return SLASH_COMMANDS.filter((c) => c.command.startsWith(lowered));
}

export function ChatInput({
  value,
  onChange,
  onSubmit,
  disabled = false,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [active, setActive] = useState(0);
  const suggestions = matchedCommands(value);
  const showSuggestions = suggestions.length > 0;
  // Clamp the highlight to the current list during render instead of
  // resetting it via an effect — when the suggestion list shrinks (or the
  // user keeps typing), the index folds back to the head automatically.
  const activeIndex = active < suggestions.length ? active : 0;

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(MAX_HEIGHT, el.scrollHeight)}px`;
  }, [value]);

  function applyCommand(cmd: SlashCommand) {
    onChange(`${cmd.command} `);
    textareaRef.current?.focus();
  }

  function handleKeyDown(e: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (showSuggestions) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((activeIndex + 1) % suggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((activeIndex - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        applyCommand(suggestions[activeIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        onChange(""); // dismiss by clearing the leading slash
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (showSuggestions) {
        applyCommand(suggestions[activeIndex]);
        return;
      }
      void onSubmit();
    }
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!value.trim()) return;
    void onSubmit();
  }

  return (
    <form onSubmit={handleSubmit} className="relative">
      {showSuggestions && (
        <ul
          role="listbox"
          aria-label="Slash commands"
          className="absolute bottom-full left-0 right-0 mb-2 rounded-md border border-[#e8e6dc] bg-white shadow-lg overflow-hidden"
        >
          {suggestions.map((cmd, idx) => {
            const focused = idx === activeIndex;
            return (
              <li
                key={cmd.command}
                role="option"
                aria-selected={focused}
                onMouseDown={(e) => {
                  e.preventDefault();
                  applyCommand(cmd);
                }}
                className={cn(
                  "flex items-baseline gap-2 px-3 py-2 cursor-pointer transition-colors",
                  focused ? "bg-[#faf9f5]" : "hover:bg-[#faf9f5]",
                )}
              >
                <span className="text-[13px] font-mono text-[#d97757]">
                  {cmd.command}
                </span>
                <span className="text-[12px] text-[#9a988e] font-mono">
                  {cmd.placeholder}
                </span>
                <span className="text-[12px] text-[#6b6a64] flex-1 truncate font-serif">
                  {cmd.description}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <div className="rounded-[10px] border border-[#cfccc1] bg-white p-2 focus-within:border-[#d97757] focus-within:ring-2 focus-within:ring-[#d97757]/30 transition-colors">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder='Ask the Director — try /research, /audit, /status'
          disabled={disabled}
          rows={1}
          className="block w-full resize-none border-0 bg-transparent text-[14px] leading-6 text-[#141413] focus:outline-none placeholder:text-[#9a988e]"
          style={{ maxHeight: MAX_HEIGHT }}
        />
        <div className="flex items-center justify-between gap-2 pt-1">
          <span className="text-[10px] text-[#9a988e] font-serif italic">
            Enter to send · Shift+Enter for newline · / for commands
          </span>
          <button
            type="submit"
            disabled={disabled || value.trim().length === 0}
            className={cn(
              "inline-flex items-center gap-1 rounded-md bg-[#d97757] text-white px-3 py-1.5 text-[12px] font-medium",
              "hover:bg-[#c66948] disabled:bg-[#f3f1ea] disabled:text-[#9a988e] disabled:cursor-not-allowed transition-colors",
            )}
            aria-label="Send message"
          >
            <ArrowUp className="h-3.5 w-3.5" aria-hidden />
            Send
          </button>
        </div>
      </div>
    </form>
  );
}

// Exported for test coverage.
export { matchedCommands, SLASH_COMMANDS };
