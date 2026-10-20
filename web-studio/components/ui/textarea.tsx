import * as React from "react"
import { cn } from "cn"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-xl bg-field px-3 py-2 text-body-sm text-foreground shadow-input outline-hidden transition-colors placeholder:text-placeholder disabled:cursor-not-allowed disabled:bg-field-disabled disabled:text-muted-foreground [&:hover:not(:focus-visible):not(:disabled)]:[--surface-tint:var(--fill-subtle)] focus-visible:[--surface-rim:var(--field-rim-focus)] aria-invalid:[--field-rim:var(--destructive-indicator)]",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
