"use client";
/* Adapted from Mastra Studio's Message, Composer, ChatShell and EmptyState (Apache-2.0). See THIRD_PARTY_NOTICES.md. */
import { CircleSlashIcon } from "lucide-react";
import { forwardRef, type ComponentProps, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useComposerPointer } from "./use-composer-pointer.ts";

/** One user turn gets a bubble on the right; the assistant's turn is plain text in the column. */
export function Message({ from, footer, children, className, ...props }: ComponentProps<"div"> & { from: "user" | "assistant"; footer?: ReactNode }) {
  const isUser = from === "user";
  return (
    <div
      {...props}
      data-slot="message"
      data-from={from}
      className={cn("group/message max-w-full min-w-0", isUser && "my-3 ml-auto flex w-fit max-w-[85%] items-start gap-2", !isUser && footer && "mb-3", className)}
    >
      <div className={cn("min-w-0", isUser && "flex flex-col items-end")}>
        {children !== undefined && children !== null && children !== false && (
          <div
            data-slot="message-content"
            className={cn("max-w-full min-w-0 text-body break-words", isUser && "rounded-xl bg-fill-subtle px-4 py-2 text-foreground shadow-(--elevation-raised)", !isUser && footer && "[&>:last-child]:mb-0")}
          >
            {children}
          </div>
        )}
        {footer && <div className="mt-1 max-w-full">{footer}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ title, description, icon = <CircleSlashIcon /> }: { title: string; description?: string; icon?: ReactNode }) {
  return (
    <div data-slot="empty-state-fill" className="flex h-full items-center-safe justify-center-safe">
      <div className="flex max-w-full flex-col items-center justify-center px-4 py-6 text-center">
        <div className="mb-3 text-muted-foreground [&>svg]:size-5">{icon}</div>
        <h3 className="text-subheading text-foreground">{title}</h3>
        {description && <p className="mt-1.5 max-w-md text-caption wrap-anywhere text-muted-foreground">{description}</p>}
      </div>
    </div>
  );
}

/** The reading column every chat region goes through. */
export function ChatColumn({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="chat-shell-column" className={cn("mx-auto flex w-full max-w-3xl min-w-0 flex-col px-3 md:px-4", className)} {...props} />;
}

/** Composer region, sticky at the bottom with a fade so the transcript dissolves above it. */
export function ChatDock({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      data-slot="chat-shell-dock"
      className={cn(
        "sticky bottom-0 z-10 mt-8 shrink-0 pb-3",
        "before:pointer-events-none before:absolute before:inset-x-0 before:-top-8 before:bottom-0 before:-z-10",
        "before:bg-(--chat-surface,var(--background)) before:[mask-image:linear-gradient(to_bottom,transparent,rgb(0_0_0)_2rem)]",
        className,
      )}
      {...props}
    />
  );
}

export const Composer = forwardRef<HTMLFormElement, ComponentPropsWithoutRef<"form">>(({ children, ...props }, ref) => (
  <form ref={ref} data-slot="composer" {...props}>{children}</form>
));
Composer.displayName = "Composer";

export function ComposerRing({ busy = false, className, style, onPointerEnter, onPointerMove, ...props }: ComponentPropsWithoutRef<"div"> & { busy?: boolean }) {
  const { trackPointer, pointerStyle } = useComposerPointer(!busy);
  return (
    <div
      data-slot="composer-ring"
      data-composer-tone="green"
      data-busy={busy ? "true" : "false"}
      className={cn("composer-ring relative mx-auto w-full max-w-3xl rounded-[23px] p-px", className)}
      style={{ ...pointerStyle, ...style }}
      onPointerEnter={(e) => { onPointerEnter?.(e); trackPointer(e); }}
      onPointerMove={(e) => { onPointerMove?.(e); trackPointer(e); }}
      {...props}
    />
  );
}

export function ComposerBox({ className, children, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div data-slot="composer-box" className={cn("composer-box @container relative mx-auto mt-auto w-full max-w-3xl overflow-hidden rounded-[22px] border border-border transition-colors duration-normal focus-within:border-border-strong", className)} {...props}>
      <div className="relative z-10">{children}</div>
    </div>
  );
}

export const ComposerInput = forwardRef<HTMLTextAreaElement, ComponentPropsWithoutRef<"textarea">>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    data-slot="composer-input"
    rows={1}
    className={cn("field-sizing-content max-h-52 min-h-10 w-full resize-none overflow-y-auto bg-transparent px-3 pt-2.5 pb-2 text-body text-foreground outline-hidden placeholder:text-placeholder focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50", className)}
    {...props}
  />
));
ComposerInput.displayName = "ComposerInput";

export function ComposerActions({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div data-slot="composer-actions" className={cn("flex w-full flex-wrap items-end justify-between gap-2 px-3 pb-3", className)} {...props} />;
}
