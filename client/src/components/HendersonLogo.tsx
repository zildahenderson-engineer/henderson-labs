import { cn } from "@/lib/utils";

type HendersonLogoProps = { compact?: boolean; inverse?: boolean; className?: string };

export function HendersonLogo({ compact = false, inverse = false, className }: HendersonLogoProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#141f19] text-sm font-black tracking-[-0.12em] text-[#d8ff70] shadow-[0_8px_20px_rgba(24,39,30,0.18)]">
        H
      </div>
      {!compact && (
        <div className="min-w-0 leading-none">
          <p className={cn("text-[13px] font-semibold tracking-[-0.02em]", inverse ? "text-white" : "text-[#152018]")}>Henderson</p>
          <p className={cn("mt-1 text-[10px] font-bold uppercase tracking-[0.22em]", inverse ? "text-[#a6bea8]" : "text-[#638069]")}>Labs</p>
        </div>
      )}
    </div>
  );
}
