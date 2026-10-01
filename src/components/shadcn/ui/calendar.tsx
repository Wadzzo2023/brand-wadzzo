"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import * as React from "react";
import { DayPicker } from "react-day-picker";

import { buttonVariants } from "~/components/shadcn/ui/button";
import { cn } from "~/lib/utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

/** Month calendar (react-day-picker v9) in the portal's tokens. */
function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "relative flex flex-col gap-4 sm:flex-row",
        month: "flex flex-col gap-4",
        month_caption: "flex h-7 items-center justify-center",
        caption_label: "text-sm font-medium",
        nav: "absolute inset-x-0 top-0 flex items-center justify-between",
        button_previous: cn(buttonVariants({ variant: "outline" }), "size-7 bg-transparent p-0 opacity-60 hover:opacity-100"),
        button_next: cn(buttonVariants({ variant: "outline" }), "size-7 bg-transparent p-0 opacity-60 hover:opacity-100"),
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday: "w-9 text-[0.8rem] font-normal text-muted-foreground",
        week: "mt-2 flex w-full",
        day: "relative size-9 p-0 text-center text-sm focus-within:z-20 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md",
        day_button: cn(buttonVariants({ variant: "ghost" }), "size-9 p-0 font-normal aria-selected:opacity-100"),
        range_start: "rounded-l-md",
        range_end: "rounded-r-md",
        selected: "[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary [&>button]:hover:text-primary-foreground",
        today: "[&>button]:bg-accent [&>button]:text-accent-foreground",
        outside: "text-muted-foreground opacity-60 aria-selected:bg-accent/50",
        disabled: "text-muted-foreground opacity-50",
        range_middle: "aria-selected:bg-accent aria-selected:text-accent-foreground",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: cls }) =>
          orientation === "left" ? <ChevronLeft className={cn("size-4", cls)} /> : <ChevronRight className={cn("size-4", cls)} />,
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
