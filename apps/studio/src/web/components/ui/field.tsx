import type { ReactNode } from "react"
import { cn } from "@/web/lib/utils"

/** A field label's text: the label, then ` for <context>` for assistive tech only (see lib/field-name.ts). */
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
