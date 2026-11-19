import type { ReactNode } from "react"
import { cn } from "@/web/lib/utils"

/**
 * A repeated field's accessible name: its label, plus the thing it belongs to (a column, a root),
 * so `Description` for each column reads `Description for email` (#1048). `FieldLabelText` renders
 * the same name with the context visible to assistive tech only; use this one for `aria-label`s.
 */
export function fieldName(label: string, context?: string): string {
  return context ? `${label} for ${context}` : label
}

/** A field label's text: the label, then ` for <context>` for assistive tech only. */
export function FieldLabelText({ label, context }: { label: string; context?: string }) {
  return (
    <>
      {label}
      {context ? <span className="sr-only"> for {context}</span> : null}
    </>
  )
}

export function Field({
  label,
  context,
  description,
  children,
  className,
}: {
  label: string
  /** Read after the label by assistive tech only (e.g. the column), so repeated fields get unique names. */
  context?: string
  description?: string
  children: ReactNode
  className?: string
}) {
  return (
    <label className={cn("grid gap-1.5", className)}>
      <span className="text-xs font-semibold text-muted-foreground">
        <FieldLabelText label={label} context={context} />
      </span>
      {children}
      {description ? <span className="text-xs text-muted-foreground">{description}</span> : null}
    </label>
  )
}
