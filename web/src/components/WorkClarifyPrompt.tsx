import { Button } from "@nous-research/ui/ui/components/button";
import { Loader2, MessageCircleQuestion } from "lucide-react";
import { useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import type { WorkClarifyRequest } from "@/lib/work-chat";
import { cn } from "@/lib/utils";

interface WorkClarifyPromptProps {
  onRespond: (answer: string) => void | Promise<void>;
  request: WorkClarifyRequest;
  submitting: boolean;
}

export function WorkClarifyPrompt({ onRespond, request, submitting }: WorkClarifyPromptProps) {
  const [draft, setDraft] = useState("");
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const submitInFlightRef = useRef(false);
  const trimmedDraft = draft.trim();
  const answer = useMemo(() => selectedChoice ?? trimmedDraft, [selectedChoice, trimmedDraft]);
  const hasChoices = request.choices.length > 0;

  const submitAnswer = (nextAnswer = answer, allowEmpty = false) => {
    if (submitting || submitInFlightRef.current || (!allowEmpty && !nextAnswer)) return;
    submitInFlightRef.current = true;
    void Promise.resolve()
      .then(() => onRespond(nextAnswer))
      .catch(() => undefined)
      .finally(() => {
        submitInFlightRef.current = false;
      });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitAnswer();
  };

  const handleAnswerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submitAnswer();
    }
  };

  return (
    <article className="max-w-3xl rounded-2xl bg-midground/[0.055] p-4">
      <div className="flex items-start gap-3">
        <MessageCircleQuestion className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="whitespace-pre-wrap text-sm font-medium leading-relaxed text-text-primary">
            {request.question}
          </p>

          <form className="mt-3 grid gap-3" onSubmit={handleSubmit}>
            {hasChoices ? (
              <div className="grid gap-2">
                {request.choices.map((choice) => (
                  <button
                    key={choice}
                    type="button"
                    disabled={submitting}
                    onClick={() => {
                      setDraft("");
                      setSelectedChoice(choice);
                    }}
                    className={cn(
                      "rounded-xl border px-3 py-2 text-left text-sm transition-colors",
                      selectedChoice === choice
                        ? "border-primary/60 bg-primary/10 text-text-primary"
                        : "border-current/15 bg-background-base/70 text-text-secondary hover:border-primary/35 hover:text-text-primary",
                    )}
                  >
                    {choice}
                  </button>
                ))}
                <textarea
                  value={draft}
                  rows={2}
                  disabled={submitting}
                  onChange={(event) => {
                    setDraft(event.target.value);
                    if (event.target.value.trim()) setSelectedChoice(null);
                  }}
                  onFocus={() => setSelectedChoice(null)}
                  onKeyDown={handleAnswerKeyDown}
                  placeholder="Andere Antwort"
                  className="min-h-16 resize-y rounded-xl border border-current/15 bg-background-base/70 px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-primary/60"
                />
              </div>
            ) : (
              <textarea
                autoFocus
                value={draft}
                rows={2}
                disabled={submitting}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleAnswerKeyDown}
                placeholder="Antwort eingeben…"
                className="min-h-16 resize-y rounded-xl border border-current/15 bg-background-base/70 px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-primary/60"
              />
            )}

            <div className="flex justify-end gap-2">
              <Button type="button" ghost size="sm" disabled={submitting} onClick={() => submitAnswer("", true)}>
                Überspringen
              </Button>
              <Button type="submit" size="sm" disabled={submitting || !answer}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Weiter"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </article>
  );
}
