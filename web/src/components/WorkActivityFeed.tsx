import { Activity, AlertCircle, BookOpen, Brain, CheckCircle2, Clock, ShieldQuestion, Wrench } from "lucide-react";

import { cn } from "@/lib/utils";
import type { WorkActivityItem, WorkActivityKind, WorkActivityStatus } from "@/lib/work-activity";

interface WorkActivityFeedProps {
  activities: WorkActivityItem[];
  className?: string;
  connectionLabel: string;
  running: boolean;
}

interface WorkActivityRowsProps {
  activities: WorkActivityItem[];
  className?: string;
  empty?: string;
  limit?: number;
}

const KIND_ICON: Record<WorkActivityKind, typeof Activity> = {
  approval: ShieldQuestion,
  error: AlertCircle,
  reasoning: Brain,
  skill: BookOpen,
  status: Activity,
  tool: Wrench,
};

const STATUS_CLASS: Record<WorkActivityStatus, string> = {
  done: "text-success",
  error: "text-destructive",
  info: "text-text-secondary",
  running: "text-warning",
};

function statusLabel(status: WorkActivityStatus): string {
  if (status === "done") return "fertig";
  if (status === "error") return "Fehler";
  if (status === "running") return "läuft";
  return "Info";
}

function StatusGlyph({ status }: { status: WorkActivityStatus }) {
  if (status === "running") {
    return <span className="h-2 w-2 animate-pulse rounded-full bg-warning" aria-label="läuft" />;
  }
  if (status === "error") {
    return <AlertCircle className="h-3.5 w-3.5 text-destructive" aria-label="Fehler" />;
  }
  if (status === "done") {
    return <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-label="fertig" />;
  }
  return <span className="h-2 w-2 rounded-full bg-text-tertiary" aria-label="Info" />;
}

export function WorkActivityRows({ activities, className, empty, limit }: WorkActivityRowsProps) {
  const visible = activities.slice(0, limit ?? activities.length);

  if (visible.length === 0) {
    return empty ? (
      <div className="rounded-lg border border-dashed border-current/15 px-3 py-6 text-center text-xs text-text-tertiary">
        {empty}
      </div>
    ) : null;
  }

  return (
    <div className={cn("grid min-w-0 gap-1.5", className)}>
      {visible.map((item) => {
        const Icon = KIND_ICON[item.kind];
        return (
          <div
            key={item.id}
            className={cn(
              "group min-w-0 overflow-hidden rounded-md px-2 py-1.5 text-xs",
              "text-text-tertiary transition-colors hover:bg-midground/[0.05] hover:text-text-secondary",
              item.status === "error" && "text-destructive/90 hover:text-destructive",
            )}
          >
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="grid h-4 w-4 shrink-0 place-items-center">
                <StatusGlyph status={item.status} />
              </span>
              <Icon className={cn("h-3.5 w-3.5 shrink-0", STATUS_CLASS[item.status])} />
              <span className="min-w-0 flex-1 truncate font-medium text-text-secondary group-hover:text-text-primary">
                {item.title}
              </span>
              <span className="shrink-0 text-[0.625rem] uppercase tracking-[0.08em] text-text-tertiary">
                {statusLabel(item.status)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function WorkActivityFeed({
  activities,
  className,
  connectionLabel,
  running,
}: WorkActivityFeedProps) {
  const visible = activities.slice(0, 24);

  return (
    <aside
      className={cn(
        "flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-current/15 bg-background-base/80",
        className,
      )}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-current/10 px-4 py-3">
        <div>
          <div className="text-display text-xs tracking-[0.12em] text-text-tertiary">
            Aktivität
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-text-secondary">
            <span className={cn("h-1.5 w-1.5 rounded-full", running ? "bg-warning animate-pulse" : "bg-success")} />
            <span>{running ? "Hermes arbeitet" : "Bereit"}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-current/10 px-2 py-1 text-[0.6875rem] text-text-tertiary">
          <Clock className="h-3 w-3" />
          {connectionLabel}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        <WorkActivityRows
          activities={visible}
          empty="Tool- und Statusmeldungen erscheinen hier kompakt — wie in der Desktop-App, ohne Terminalausgabe."
        />
      </div>
    </aside>
  );
}
