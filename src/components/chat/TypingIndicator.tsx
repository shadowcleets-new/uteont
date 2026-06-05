import { Bot } from "lucide-react";

/**
 * Three-dot pulsing indicator shown while the Director composes its
 * reply. Mirrors the assistant-bubble visual so the row height stays
 * roughly constant once the reply lands.
 */
export function TypingIndicator() {
  return (
    <div className="flex items-start gap-3" aria-live="polite" aria-label="Director is thinking">
      <div className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f3f1ea] text-[#d97757] ring-1 ring-[#e8e6dc]">
        <Bot className="h-4 w-4" aria-hidden />
      </div>
      <div className="rounded-[10px] bg-[#faf9f5] border border-[#e8e6dc] px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[#9a988e] animate-bounce [animation-delay:-0.3s]" />
          <span className="h-1.5 w-1.5 rounded-full bg-[#9a988e] animate-bounce [animation-delay:-0.15s]" />
          <span className="h-1.5 w-1.5 rounded-full bg-[#9a988e] animate-bounce" />
        </div>
      </div>
    </div>
  );
}
