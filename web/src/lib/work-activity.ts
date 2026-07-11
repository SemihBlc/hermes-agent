export type WorkActivityStatus = "running" | "done" | "info" | "error";
export type WorkActivityKind = "tool" | "skill" | "status" | "reasoning" | "approval" | "error";

export interface WorkActivityItem {
  id: string;
  kind: WorkActivityKind;
  skillName?: string;
  title: string;
  status: WorkActivityStatus;
  timestamp: number;
}

interface GatewayPayload {
  args?: unknown;
  context?: unknown;
  duration_s?: unknown;
  id?: unknown;
  kind?: unknown;
  name?: unknown;
  status?: unknown;
  text?: unknown;
  tool_call_id?: unknown;
  tool_id?: unknown;
  tool_name?: unknown;
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function titleCase(value: string): string {
  if (!value) return value;
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function objectValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function safeLabelName(value: string): string {
  return /^[a-z0-9][a-z0-9:._-]{0,127}$/i.test(value) ? value : "";
}

function skillNameFromContext(context: string): string {
  const name = context.match(/^reading skill\s+([^\s]+)/i)?.[1] ?? "";
  return safeLabelName(name);
}

function toolName(payload: GatewayPayload): string {
  return safeLabelName(asText(payload.name) || asText(payload.tool_name)) || "tool";
}

export function workActivityKey(type: string, payload: unknown, timestamp: number): string {
  if (typeof payload === "object" && payload !== null) {
    const candidate = payload as GatewayPayload;
    const toolId = asText(candidate.tool_id) || asText(candidate.tool_call_id) || asText(candidate.id);
    if (toolId) return `${type}:${toolId}:${timestamp}`;
  }
  return `${type}:${timestamp}:${Math.random().toString(36).slice(2, 8)}`;
}

export function usedSkillNames(activities: WorkActivityItem[]): string[] {
  const names: string[] = [];
  for (const activity of [...activities].reverse()) {
    if (activity.kind !== "skill" || !activity.skillName || names.includes(activity.skillName)) {
      continue;
    }
    names.push(activity.skillName);
  }
  return names;
}

export function activityFromGatewayEvent(
  type: string,
  payload: unknown,
  timestamp = Date.now(),
): WorkActivityItem | null {
  const candidate = (typeof payload === "object" && payload !== null ? payload : {}) as GatewayPayload;

  if (type === "tool.start") {
    const name = toolName(candidate);
    if (name === "skill_view") {
      const skillName = skillNameFromContext(asText(candidate.context));
      return {
        id: workActivityKey(type, payload, timestamp),
        kind: "skill",
        skillName: skillName || undefined,
        title: skillName ? `Lade Skill: ${skillName}` : "Lade Skill",
        status: "running",
        timestamp,
      };
    }
    return {
      id: workActivityKey(type, payload, timestamp),
      kind: "tool",
      title: `Nutze ${name}`,
      status: "running",
      timestamp,
    };
  }

  if (type === "tool.progress") {
    return {
      id: workActivityKey(type, payload, timestamp),
      kind: "tool",
      title: `${toolName(candidate)} läuft`,
      status: "running",
      timestamp,
    };
  }

  if (type === "tool.complete") {
    const name = toolName(candidate);
    const duration = typeof candidate.duration_s === "number" ? ` · ${candidate.duration_s.toFixed(1)}s` : "";
    if (name === "skill_view") {
      const skillName = safeLabelName(asText(objectValue(candidate.args).name));
      return {
        id: workActivityKey(type, payload, timestamp),
        kind: "skill",
        skillName: skillName || undefined,
        title: skillName ? `Skill: ${skillName}` : "Skill geladen",
        status: "done",
        timestamp,
      };
    }
    return {
      id: workActivityKey(type, payload, timestamp),
      kind: "tool",
      title: `${name} fertig${duration}`,
      status: "done",
      timestamp,
    };
  }

  if (type === "status.update") {
    const kind = asText(candidate.kind);
    const text = asText(candidate.text);
    if (!kind && !text) return null;
    return {
      id: workActivityKey(type, payload, timestamp),
      kind: "status",
      title: titleCase(kind || "Status"),
      status: kind === "error" ? "error" : "info",
      timestamp,
    };
  }

  if (type === "reasoning.available") {
    return {
      id: workActivityKey(type, payload, timestamp),
      kind: "reasoning",
      title: "Denkt nach",
      status: "info",
      timestamp,
    };
  }

  if (type === "approval.request") {
    return {
      id: workActivityKey(type, payload, timestamp),
      kind: "approval",
      title: "Freigabe nötig",
      status: "running",
      timestamp,
    };
  }

  if (type === "error") {
    return {
      id: workActivityKey(type, payload, timestamp),
      kind: "error",
      title: "Fehler",
      status: "error",
      timestamp,
    };
  }

  return null;
}
