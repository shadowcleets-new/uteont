import { cn } from "@/lib/utils";
import { pillClasses, type PillState } from "@/lib/theme";

interface StatusPillProps {
  state: PillState;
  className?: string;
}

export function StatusPill({ state, className }: StatusPillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-[3px]",
        "font-semibold text-[10px] uppercase tracking-wider font-sans",
        pillClasses[state],
        className,
      )}
    >
      {state}
    </span>
  );
}
