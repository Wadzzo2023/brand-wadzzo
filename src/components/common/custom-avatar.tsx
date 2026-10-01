import { Trophy } from "lucide-react";

import { cn } from "~/lib/utils";

interface CustomAvatarProps {
  url?: string | null;
  size?: number;
  className?: string;
  winnerCount?: number;
}

/**
 * Round profile picture. Size comes from `className` (default 56px); the
 * image fills it. Falls back to the default avatar icon.
 */
export default function CustomAvatar({ url, size = 200, className, winnerCount }: CustomAvatarProps) {
  return (
    <div className="relative shrink-0">
      <div className={cn("size-14 overflow-hidden rounded-full border bg-surface-2", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url ?? "/images/icons/avatar-icon.png"} alt="Avatar" width={size} height={size} className="size-full object-cover" />
      </div>
      {winnerCount && winnerCount > 0 ? (
        <span className="absolute -bottom-1 -left-1 flex h-6 min-w-6 items-center justify-center gap-0.5 rounded-full bg-[#DBDC2C] px-1 text-[10px] font-bold text-black">
          <Trophy className="size-3" />
          {winnerCount}
        </span>
      ) : null}
    </div>
  );
}
