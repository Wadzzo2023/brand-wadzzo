"use client";

import { Plus } from "lucide-react";
import Link from "next/link";

import { Button } from "~/components/shadcn/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "~/components/shadcn/ui/dropdown-menu";
import { cn } from "~/lib/utils";

import { CREATE_ACTIONS } from "./nav";

/** Desktop "Create" button: every new-thing flow in one menu. */
export function CreateMenu({
  navPermission,
  collapsed = false,
}: {
  navPermission: boolean;
  collapsed?: boolean;
}) {
  const actions = CREATE_ACTIONS.filter((a) => !a.gated || navPermission);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className={cn("bg-side-ink text-side hover:bg-side-ink w-full", collapsed && "px-0")}
          aria-label="Create"
        >
          <Plus />
          {!collapsed && "Create"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side={collapsed ? "right" : "bottom"} className="w-72">
        <DropdownMenuLabel className="font-hud text-muted-foreground text-[11px] tracking-wider uppercase">
          Create
        </DropdownMenuLabel>
        {actions.map((a) => {
          const Icon = a.icon;
          return (
            <DropdownMenuItem key={a.href} asChild className="cursor-pointer gap-3 py-2">
              <Link href={a.href}>
                <span className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-md">
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{a.label}</span>
                  <span className="text-muted-foreground block truncate text-xs">
                    {a.description}
                  </span>
                </span>
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
