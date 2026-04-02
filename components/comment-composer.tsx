"use client";

import { addComment } from "@/app/actions/comments";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

export function CommentComposer({
  applicationId,
  staffOptions,
}: {
  applicationId: string;
  staffOptions: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [content, setContent] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function submit() {
    startTransition(async () => {
      try {
        await addComment({
          applicationId,
          content,
          mentionUserIds: selected,
        });
        toast.success("Comment added");
        setContent("");
        setSelected([]);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to add comment");
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label>New comment</Label>
        <Textarea
          rows={3}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Leave a note for the team…"
          className="bg-background"
        />
      </div>
      {staffOptions.length > 0 && (
        <div className="space-y-2">
          <Label className="text-muted-foreground">Mention staff</Label>
          <div className="flex flex-wrap gap-2">
            {staffOptions.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => toggle(s.id)}
                className={`rounded-full border px-2 py-0.5 text-xs ${
                  selected.includes(s.id)
                    ? "border-primary bg-primary/10"
                    : "border-border bg-background"
                }`}
              >
                @{s.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <Button type="button" size="sm" onClick={() => void submit()} disabled={pending || !content.trim()}>
        {pending ? "Posting…" : "Post comment"}
      </Button>
    </div>
  );
}
