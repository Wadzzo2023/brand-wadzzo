"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "~/lib/utils";

const Tabs = TabsPrimitive.Root;

/**
 * Two looks: `pill` (default) — a segmented control for switching views in a
 * card; `line` — underlined tabs for a page's main sections. Triggers pick up
 * the list's variant, so pages only set it once.
 */
type Variant = "pill" | "line";
const VariantContext = React.createContext<Variant>("pill");

const LIST: Record<Variant, string> = {
  pill: "inline-flex h-12 items-center justify-center gap-1 rounded-2xl bg-surface-2 p-1 text-muted-foreground",
  line: "flex h-auto w-full items-stretch justify-start gap-1 overflow-x-auto border-b border-foreground/[0.08] text-muted-foreground [scrollbar-width:none]",
};
const TRIGGER: Record<Variant, string> = {
  pill: "blob px-4 py-2 font-hud text-base uppercase tracking-wide transition-colors hover:text-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground",
  line: "relative -mb-px rounded-none border-b-[3px] border-transparent px-3.5 py-3 font-hud text-xl uppercase tracking-wide transition-colors hover:text-foreground data-[state=active]:border-primary data-[state=active]:text-foreground",
};

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & {
    variant?: Variant;
  }
>(({ className, variant = "pill", ...props }, ref) => (
  <VariantContext.Provider value={variant}>
    <TabsPrimitive.List ref={ref} className={cn(LIST[variant], className)} {...props} />
  </VariantContext.Provider>
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => {
  const variant = React.useContext(VariantContext);
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        "ring-offset-background hover:text-foreground focus-visible:ring-ring inline-flex shrink-0 items-center justify-center gap-1.5 text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
        TRIGGER[variant],
        className,
      )}
      {...props}
    />
  );
});
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "ring-offset-background focus-visible:ring-ring mt-4 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

/** A count after a tab label: `Entries <TabCount n={4} />`. */
function TabCount({ n }: { n: number }) {
  return (
    <span className="bg-muted text-muted-foreground rounded-full px-1.5 text-xs tabular-nums">
      {n.toLocaleString()}
    </span>
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent, TabCount };
