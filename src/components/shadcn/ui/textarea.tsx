import * as React from "react";

import { cn } from "~/lib/utils";

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "border-foreground/12 bg-surface ring-offset-background placeholder:text-muted-foreground hover:border-foreground/25 focus-visible:border-primary focus-visible:ring-ring flex min-h-[80px] w-full rounded-xl border-2 py-3 pr-4 pl-4 text-sm focus-visible:ring-0 focus-visible:ring-offset-2 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
