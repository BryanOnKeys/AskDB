import { useState } from "react"
import { parseList } from "@/web/lib/format"
import { Input } from "./input"

function formatList(list: string[] | undefined): string {
  return list?.join(", ") ?? ""
}

export function ListInput({
  id,
  value,
  onChange,
}: {
  id?: string
  value: string[] | undefined
  onChange: (value: string[]) => void
}) {
  const [editValue, setEditValue] = useState<string | null>(null)
  const display = editValue ?? formatList(value)

  return (
    <Input
      id={id}
      value={display}
      onChange={(e) => setEditValue(e.target.value)}
      onFocus={() => setEditValue(formatList(value))}
      onBlur={() => {
        onChange(parseList(editValue ?? formatList(value)))
        setEditValue(null)
      }}
    />
  )
}
