type CommentRow = {
  id: string;
  content: string;
  mentions: string[] | null;
  created_at: string;
  author: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string;
  } | null;
};

type EmailRow = {
  id: string;
  to_email: string;
  subject: string;
  body: string;
  created_at: string;
  sender: { first_name: string | null; last_name: string | null } | null;
  isAutomated: boolean;
};

type SmsRow = {
  id: string;
  to_phone: string;
  body: string;
  created_at: string;
  sender: { first_name: string | null; last_name: string | null } | null;
  isAutomated: boolean;
};

export function ActivityTimeline({
  comments,
  emails,
  sms,
  staffById,
}: {
  comments: CommentRow[];
  emails: EmailRow[];
  sms: SmsRow[];
  staffById: Record<string, string>;
}) {
  type Item =
    | { kind: "comment"; at: string; payload: CommentRow }
    | { kind: "email"; at: string; payload: EmailRow }
    | { kind: "sms"; at: string; payload: SmsRow };

  const items: Item[] = [
    ...(comments ?? []).map((c) => ({ kind: "comment" as const, at: c.created_at, payload: c })),
    ...(emails ?? []).map((e) => ({ kind: "email" as const, at: e.created_at, payload: e })),
    ...(sms ?? []).map((s) => ({ kind: "sms" as const, at: s.created_at, payload: s })),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No activity yet.</p>;
  }

  return (
    <ul className="space-y-4">
      {items.map((item) => {
        if (item.kind === "comment") {
          const c = item.payload;
          const name = c.author
            ? `${c.author.first_name ?? ""} ${c.author.last_name ?? ""}`.trim() || c.author.email
            : "User";
          const mentionLabels =
            Array.isArray(c.mentions) && c.mentions.length > 0
              ? c.mentions.map((id) => staffById[id] ?? id).join(", ")
              : null;
          return (
            <li key={`c-${c.id}`} className="rounded-lg border border-border bg-background/50 p-3 text-sm">
              <div className="flex justify-between gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{name}</span>
                <time dateTime={c.created_at}>{new Date(c.created_at).toLocaleString()}</time>
              </div>
              <p className="mt-2 whitespace-pre-wrap">{c.content}</p>
              {mentionLabels && (
                <p className="mt-1 text-xs text-muted-foreground">Mentioned: {mentionLabels}</p>
              )}
            </li>
          );
        }
        if (item.kind === "email") {
          const e = item.payload;
          const senderLabel = e.isAutomated
            ? "Automated"
            : e.sender
              ? `${e.sender.first_name ?? ""} ${e.sender.last_name ?? ""}`.trim() || "Staff"
              : "Staff";
          return (
            <li key={`e-${e.id}`} className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-sm">
              <div className="flex justify-between gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Email · {senderLabel}</span>
                <time dateTime={e.created_at}>{new Date(e.created_at).toLocaleString()}</time>
              </div>
              <p className="mt-1 text-xs">
                To {e.to_email} — <span className="font-medium">{e.subject}</span>
              </p>
              <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{e.body}</p>
            </li>
          );
        }
        const s = item.payload;
        const senderLabel = s.isAutomated
          ? "Automated"
          : s.sender
            ? `${s.sender.first_name ?? ""} ${s.sender.last_name ?? ""}`.trim() || "Staff"
            : "Staff";
        return (
          <li key={`s-${s.id}`} className="rounded-lg border border-dashed border-primary/20 bg-muted/20 p-3 text-sm">
            <div className="flex justify-between gap-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">SMS · {senderLabel}</span>
              <time dateTime={s.created_at}>{new Date(s.created_at).toLocaleString()}</time>
            </div>
            <p className="mt-1 text-xs">To {s.to_phone}</p>
            <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{s.body}</p>
          </li>
        );
      })}
    </ul>
  );
}
