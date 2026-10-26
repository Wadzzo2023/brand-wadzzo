"use client";

import { Contrast, LogOut, Monitor, Moon, Settings, Sun, User } from "lucide-react";
import { useDialogStore } from "package/connect_wallet/src/state/connect_wallet_dialog";
import { signOut, useSession } from "next-auth/react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { useSyncExternalStore } from "react";

import { platformBranding } from "./platform";
import { cn } from "~/lib/utils";
import { api } from "~/utils/api";

import { AppDownload } from "./app-download";
import { SOCIALS } from "./social-icons";

const THEMES = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "contrast", label: "High contrast", icon: Contrast },
  { id: "system", label: "System", icon: Monitor },
] as const;

/** The fan app's info pages, at the bottom of the sidebar. */
const INFO_LINKS = [
  { path: "/about", label: "About" },
  { path: "/faq", label: "FAQ" },
  { path: "/support", label: "Support" },
  { path: "/privacy", label: "Privacy" },
];

const short = (id: string) => `${id.slice(0, 5)}…${id.slice(-5)}`;

const useMounted = () =>
  useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );

/** Who is signed in: picture, name and id (opening the wallet dialog), then settings and sign out. */
function ProfileRow() {
  const session = useSession();
  const creator = api.fan.creator.meCreator.useQuery(undefined, {
    enabled: session.status === "authenticated",
  });
  const openAccount = useDialogStore((s) => s.setIsOpen);
  const name = creator.data?.name ?? session.data?.user?.name ?? "Your account";
  const image = creator.data?.profileUrl ?? session.data?.user?.image ?? null;
  const id = session.data?.user?.id;
  return (
    <div className="bg-side-ink text-side-mint flex items-center gap-1.5 rounded-xl p-1.5">
      <button
        type="button"
        onClick={() => openAccount(true)}
        title="Account & wallets"
        className="group hover:bg-side-mint/10 -m-0.5 flex min-w-0 flex-1 items-center gap-2 rounded-lg p-0.5 text-left transition-colors"
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt=""
            className="border-side size-8 shrink-0 rounded-full border-2 object-cover"
          />
        ) : (
          <span className="border-side bg-side text-side-ink flex size-8 shrink-0 items-center justify-center rounded-full border-2">
            <User className="size-4" strokeWidth={2.4} />
          </span>
        )}
        <span className="min-w-0 flex-1 leading-tight">
          <span className="display text-side block truncate text-base group-hover:underline">
            {name}
          </span>
          {id && (
            <span className="text-side-mint/60 block truncate font-mono text-[10px]">
              {short(id)}
            </span>
          )}
        </span>
      </button>
      <Link
        href="/settings"
        aria-label="Settings"
        title="Settings"
        className="text-side-mint/80 hover:bg-side-mint/10 hover:text-side flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors"
      >
        <Settings className="size-3.5" strokeWidth={2.6} />
      </Link>
      <button
        type="button"
        onClick={() => void signOut({ callbackUrl: "/" })}
        aria-label="Sign out"
        title="Sign out"
        className="bg-side text-side-ink flex size-7 shrink-0 items-center justify-center rounded-lg transition-transform duration-200 hover:scale-105"
      >
        <LogOut className="size-3.5" strokeWidth={2.6} />
      </button>
    </div>
  );
}

function ThemeSwitch() {
  const { theme: stored, setTheme } = useTheme();
  // next-themes only knows the theme on the client; until then render the default so markup matches the server
  const theme = useMounted() ? stored : "dark";
  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="bg-side-ink/10 flex gap-0.5 rounded-full p-0.5"
    >
      {THEMES.map((t) => (
        <button
          key={t.id}
          type="button"
          role="radio"
          aria-checked={theme === t.id}
          aria-label={t.label}
          title={t.label}
          onClick={() => setTheme(t.id)}
          className={cn(
            "flex size-6 items-center justify-center rounded-full transition-colors",
            theme === t.id ? "bg-side-ink text-side" : "text-side-ink/60 hover:text-side-ink",
          )}
        >
          <t.icon className="size-3" strokeWidth={2.4} />
        </button>
      ))}
    </div>
  );
}

/**
 * The fixed footer of the expanded sidebar, as in the marketplace: who you are, theme and
 * socials, the app download buttons, and the info pages with the copyright on one small row.
 */
export function SidebarFooter() {
  const fanApp = platformBranding.urls.fanApp.replace(/\/$/, "");
  return (
    <div className="space-y-2">
      <ProfileRow />
      <div className="flex items-center justify-between gap-2">
        <ThemeSwitch />
        <div className="flex gap-1">
          {SOCIALS.map((so) => (
            <a
              key={so.href}
              href={so.href}
              target="_blank"
              rel="noreferrer"
              aria-label={so.label}
              className="bg-side-ink text-side flex size-6 items-center justify-center rounded-full transition-transform hover:scale-110"
            >
              <so.icon className="size-2.5" />
            </a>
          ))}
        </div>
      </div>
      <AppDownload />
      {/* info pages and the copyright share the last row */}
      <div className="border-side-ink/20 flex items-center justify-between gap-2 border-t-2 border-dashed pt-2 text-[9px] leading-none whitespace-nowrap">
        <div className="text-side-ink/70 flex gap-1.5 font-medium">
          {INFO_LINKS.map((l) => (
            <a
              key={l.path}
              href={`${fanApp}${l.path}`}
              target="_blank"
              rel="noreferrer"
              className="hover:text-side-ink hover:underline"
            >
              {l.label}
            </a>
          ))}
        </div>
        <span className="text-side-ink/60 font-medium">
          © {new Date().getFullYear()} {platformBranding.name}
        </span>
      </div>
    </div>
  );
}
