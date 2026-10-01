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
export function CreateMenu({ navPermission, collapsed = false }: { navPermission: boolean; collapsed?: boolean }) {
  const actions = CREATE_ACTIONS.filter((a) => !a.gated || navPermission);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className={cn("w-full", collapsed && "px-0")} aria-label="Create">
          <Plus />
          {!collapsed && "Create"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side={collapsed ? "right" : "bottom"} className="w-72">
        <DropdownMenuLabel className="font-hud text-[11px] uppercase tracking-wider text-muted-foreground">Create</DropdownMenuLabel>
        {actions.map((a) => {
          const Icon = a.icon;
          return (
            <DropdownMenuItem key={a.href} asChild className="cursor-pointer gap-3 py-2">
              <Link href={a.href}>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{a.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">{a.description}</span>
                </span>
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
