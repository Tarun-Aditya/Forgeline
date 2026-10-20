import * as React from "react"
import { cn } from "cn"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-control-md w-full min-w-0 rounded-full bg-field px-3 text-body-sm text-foreground shadow-input outline-hidden transition-colors placeholder:text-placeholder disabled:cursor-not-allowed disabled:bg-field-disabled disabled:text-muted-foreground [&:hover:not(:focus-visible):not(:disabled)]:[--surface-tint:var(--fill-subtle)] focus-visible:[--surface-rim:var(--field-rim-focus)]",
        "aria-invalid:[--field-rim:var(--destructive-indicator)] aria-invalid:[--field-rim-focus:var(--destructive-indicator)]",
        className
      )}
      {...props}
    />
  )
}

export { Input }
