"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react";

import { DialogContent } from "~/components/shadcn/ui/dialog";
import { cn } from "~/lib/utils";

/**
 * Dialog content that can also render as a page section.
 *
 * The big create flows (pin, hotspot, bounty, post, asset) used to be modal
 * dialogs. They're pages now, but their forms are the same components: with
 * `page`, this renders the dialog's content inline — no overlay, no portal,
 * no close-on-outside-click, no size limits — so the form logic is reused
 * exactly and nothing about validation or submit changes. Pair with
 * `<Dialog modal={!page}>` on the Root.
 */
export const SurfaceContent = forwardRef<
  ElementRef<typeof DialogPrimitive.Content>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { page?: boolean }
>(function SurfaceContent({ page, className, children, ...props }, ref) {
  if (!page)
    return (
      <DialogContent ref={ref} className={className} {...props}>
        {children}
      </DialogContent>
    );
  return (
    <DialogPrimitive.Content
      ref={ref}
      forceMount
      onInteractOutside={(e) => e.preventDefault()}
      onEscapeKeyDown={(e) => e.preventDefault()}
      onOpenAutoFocus={(e) => e.preventDefault()}
      className={cn(
        className,
        // Undo dialog sizing/positioning from the caller's classes.
        "static m-0 grid w-full max-w-none translate-x-0 translate-y-0 gap-5 overflow-visible rounded-xl border bg-card p-5 shadow-none max-h-none sm:p-6",
        "[&_[data-slot=dialog-footer]]:sticky",
      )}
      {...props}
    >
      {children}
    </DialogPrimitive.Content>
  );
});
