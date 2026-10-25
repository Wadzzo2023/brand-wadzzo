"use client";

import {
  Check,
  LogOut,
  Monitor,
  Moon,
  Settings,
  Sun,
  User,
  ChevronsUpDown,
  Wallet,
} from "lucide-react";
import { useDialogStore } from "package/connect_wallet/src/state/connect_wallet_dialog";
import { signOut, useSession } from "next-auth/react";
import { useTheme } from "next-themes";
import Link from "next/link";

import { Avatar, AvatarFallback, AvatarImage } from "~/components/shadcn/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/shadcn/ui/dropdown-menu";
import { cn } from "~/lib/utils";
import { api } from "~/utils/api";

const THEMES = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "system", label: "System", icon: Monitor },
] as const;

const short = (id: string) => `${id.slice(0, 5)}…${id.slice(-5)}`;

/** Avatar → name, theme, settings, sign out. Used in the sidebar and phone top bar. */
export function UserMenu({
  collapsed = false,
  compact = false,
}: {
  collapsed?: boolean;
  compact?: boolean;
}) {
  const session = useSession();
  const creator = api.fan.creator.meCreator.useQuery(undefined, {
    enabled: session.status === "authenticated",
  });
  const { theme, setTheme } = useTheme();
  const openAccount = useDialogStore((s) => s.setIsOpen);

  const name = creator.data?.name ?? session.data?.user?.name ?? "Your account";
  const image = creator.data?.profileUrl ?? session.data?.user?.image ?? undefined;
  const id = session.data?.user?.id;

  const avatar = (
    <Avatar className="ring-side-ink/25 size-9 ring-2">
      <AvatarImage src={image} alt="" />
      <AvatarFallback className="bg-side-ink text-side">
        <User className="size-4" />
      </AvatarFallback>
    </Avatar>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "hover:bg-side-ink/10 flex w-full items-center gap-2.5 rounded-xl p-1.5 text-left transition-colors",
          (collapsed || compact) && "w-auto justify-center",
        )}
        aria-label="Account menu"
      >
        {avatar}
        {!collapsed && !compact && (
          <>
            <span className="min-w-0 flex-1">
              <span className="display block truncate text-lg leading-none">{name}</span>
              {id && (
                <span className="mt-0.5 block truncate font-mono text-[10px] opacity-60">
                  {short(id)}
                </span>
              )}
            </span>
            <ChevronsUpDown className="size-4 shrink-0 opacity-60" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={compact ? "end" : "start"}
        side={compact ? "bottom" : "top"}
        className="w-60"
      >
        <DropdownMenuLabel className="font-normal">
          <span className="block truncate text-sm font-semibold">{name}</span>
          {id && (
            <span className="text-muted-foreground block truncate font-mono text-[11px]">
              {short(id)}
            </span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => openAccount(true)} className="gap-2">
          <Wallet className="size-4" />
          Account &amp; wallets
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="font-hud text-muted-foreground text-[10px] tracking-wider uppercase">
          Theme
        </DropdownMenuLabel>
        {THEMES.map((t) => (
          <DropdownMenuItem key={t.id} onSelect={() => setTheme(t.id)} className="gap-2">
            <t.icon className="size-4" />
            {t.label}
            {theme === t.id && <Check className="text-primary ml-auto size-4" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="gap-2">
          <Link href="/settings">
            <Settings className="size-4" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => void signOut({ callbackUrl: "/" })}
          className="text-destructive focus:text-destructive gap-2"
        >
          <LogOut className="size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
