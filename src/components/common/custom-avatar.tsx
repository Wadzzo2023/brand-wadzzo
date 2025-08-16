import clsx from "clsx";
import { Trophy, User } from "lucide-react";
import Image from "next/image";
import React from "react";
import { cn } from "~/lib/utils";

interface HexagonAvatarProps {
  url?: string | null;
  size?: number;
  className?: string;
  winnerCount?: number;
}

export default function CustomAvatar({
  url,

  size = 200,
  className,
  winnerCount,
}: HexagonAvatarProps) {

  return (
    <div className=" relative avatar">
      <div
        className={cn("h-14 w-14 overflow-hidden  mask mask-hexagon     rounded-full", className)}
      >
        {url ? (
          <Image
            src={url}
            alt="Avatar"
            width={size}
            height={size}
            className="h-14 w-14 rounded-full  object-cover -rotate-90"
          />
        ) : (
          <Image
            src={"/images/icons/avatar-icon.png"}
            alt="Avatar"
            width={size}
            height={size}
            className="h-14 w-14 rounded-full object-cover -rotate-90"
          />
        )}
      </div>
      {winnerCount && winnerCount > 0 ? (
        <span className="absolute -left-3   bottom-0 h-7 w-7 rounded-full bg-[#DBDC2C]">
          <span className="absolute bottom-[.4rem]    right-2 flex h-3.5 w-3.5 items-center justify-center rounded-full ">
            <Trophy size={14} />
          </span>
          <span className="absolute bottom-[.4rem]   right-[.1rem] text-xs font-bold">
            {winnerCount}
          </span>
        </span>
      ) : (
        <></>
      )}
    </div>
  );

}

// export function HexagonAvatar({
//   url = "https://avatars.githubusercontent.com/u/47269261?v=4",
// }: {
//   url?: string;
// }) {
//   return (
//     <div className="avatar">
//       <div className="mask mask-hexagon ">
//         <Image src={url}
//           alt="Avatar"
//           width={40}
//           height={40}
//           className="h-6 w-6 object-cover"
//         />
//       </div>
//     </div>
//   );
// }
