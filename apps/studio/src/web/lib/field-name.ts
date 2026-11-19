/**
 * A repeated field's accessible name: its label, plus the thing it belongs to (a column, a root),
 * so `Description` for each column reads `Description for email` (#1048). `FieldLabelText`
 * (components/ui/field.tsx) renders the same name with the context visible to assistive tech
 * only; use this one for `aria-label`s.
 */
export function fieldName(label: string, context?: string): string {
  return context ? `${label} for ${context}` : label;
}
