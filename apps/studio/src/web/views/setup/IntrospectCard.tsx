import { Database, Loader2, Sparkles } from "lucide-react";

export function IntrospectCard({
  stepNumber,
  busy,
  disabledReason,
  onIntrospect,
}: {
  stepNumber: number;
  busy: "config" | "introspect" | null;
  /** Why introspection can't run yet (the config didn't load); shown under the button. */
  disabledReason?: string;
  onIntrospect: () => void;
}) {
  return (
    <div className="card">
      <div className="card-hd">
        <h3><Sparkles size={14} /> {stepNumber} · Introspect your database</h3>
      </div>
      <div className="card-bd" style={{ display: "grid", gap: 10 }}>
        <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
          Reads your schema structure (tables, columns, relationships — never rows) and writes the
          schema artifact. When it finishes, Studio opens on the Overview.
        </p>
        <div>
          <button type="button" className="btn primary" disabled={busy === "introspect" || Boolean(disabledReason)} onClick={onIntrospect}>
            {busy === "introspect" ? <Loader2 size={14} className="animate-spin" /> : <Database size={14} />}
            Run introspection
          </button>
          {disabledReason && <p className="muted tiny" style={{ marginTop: 6 }}>{disabledReason}</p>}
        </div>
      </div>
    </div>
  );
}
