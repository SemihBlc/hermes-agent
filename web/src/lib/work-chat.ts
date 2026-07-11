export interface WorkClarifyRequest {
  requestId: string;
  question: string;
  choices: string[];
}

export interface WorkMessageContext {
  id: string;
  role: "user" | "assistant";
  text: string;
}

interface ClarifyGatewayPayload {
  request_id?: unknown;
  question?: unknown;
  choices?: unknown;
}

interface WorkSubmitState {
  attachmentCount: number;
  connectionState: string;
  contextCount?: number;
  running: boolean;
  text: string;
}

interface WorkComposerElement {
  scrollHeight: number;
  style: {
    height: string;
    overflowY: string;
  };
}

export type WorkSubmitDisposition = "queued" | "visible";

interface WorkQueueItem {
  id: string;
}

interface WorkBusyAcknowledgement<T extends WorkQueueItem> {
  pending: T[];
  queued: T[];
  visible: T[];
}

interface WorkBusyQueueStart<T extends WorkQueueItem> {
  pending: T[];
  queued: T[];
  promoted: T[];
}

export function gatewayEventBelongsToSession(
  eventSessionId: string | undefined,
  activeSessionId: string | null,
): boolean {
  return Boolean(eventSessionId && activeSessionId && eventSessionId === activeSessionId);
}

export function workStoredSessionId(
  payload: { stored_session_id?: string; resumed?: string; session_id: string },
  requestedResumeId?: string,
): string {
  return payload.stored_session_id || payload.resumed || requestedResumeId || payload.session_id;
}

export function shouldReconnectWorkSession(
  connectionState: string,
  activeSessionId: string | null,
  mounted: boolean,
): boolean {
  return mounted && Boolean(activeSessionId) && (connectionState === "closed" || connectionState === "error");
}

export function workReconnectDelay(attempt: number): number {
  return Math.min(500 * 2 ** Math.max(0, attempt), 10_000);
}

export function serializeWorkSessionOperation<T>(
  queue: Promise<void>,
  perform: () => Promise<T>,
): { operation: Promise<T>; queue: Promise<void> } {
  const operation = queue.then(perform, perform);
  return {
    operation,
    queue: operation.then(() => undefined, () => undefined),
  };
}

function uniqueWorkQueueItems<T extends WorkQueueItem>(items: T[]): T[] {
  return items.filter((item, index) => items.findIndex((candidate) => candidate.id === item.id) === index);
}

export function acknowledgeWorkBusyMessage<T extends WorkQueueItem>(
  pending: T[],
  queued: T[],
  message: T,
  status: string | undefined,
): WorkBusyAcknowledgement<T> {
  const wasPending = pending.some((item) => item.id === message.id);
  const remainsPending = status === "queued";
  return {
    pending: remainsPending ? pending : pending.filter((item) => item.id !== message.id),
    queued: status === "queued" && wasPending
      ? uniqueWorkQueueItems([...queued, message])
      : queued,
    visible: !remainsPending && wasPending ? [message] : [],
  };
}

export function startWorkBusyQueue<T extends WorkQueueItem>(
  pending: T[],
  queued: T[],
): WorkBusyQueueStart<T> {
  return {
    pending: [],
    queued: [],
    promoted: uniqueWorkQueueItems([...queued, ...pending]),
  };
}

export function workSubmitDisposition(
  wasRunning: boolean,
  status: string | undefined,
): WorkSubmitDisposition {
  return wasRunning && status === "queued" ? "queued" : "visible";
}

export function resizeWorkComposer(
  element: WorkComposerElement | null,
  maxHeight = 160,
): void {
  if (!element) return;
  element.style.height = "auto";
  const height = Math.min(element.scrollHeight, maxHeight);
  element.style.height = `${height}px`;
  element.style.overflowY = element.scrollHeight > maxHeight ? "auto" : "hidden";
}

export function canSubmitWorkMessage(state: WorkSubmitState): boolean {
  return state.connectionState === "open" && Boolean(
    state.text.trim() || state.attachmentCount || state.contextCount,
  );
}

export function workMessageContextPrompt(
  context: WorkMessageContext | null,
  userText: string,
): string {
  const cleanedText = userText.trim();
  if (!context) return cleanedText;

  const instruction = cleanedText || "Berücksichtige die markierte Nachricht als Kontext.";
  const role = context.role === "assistant" ? "Hermes" : "Du";
  return [
    instruction,
    "",
    `--- Markierter Kontext (${role}) ---`,
    context.text.trim(),
    "--- Ende markierter Kontext ---",
  ].join("\n");
}

export function clarifyRequestFromPayload(payload: unknown): WorkClarifyRequest | null {
  if (!payload || typeof payload !== "object") return null;
  const candidate = payload as ClarifyGatewayPayload;
  const requestId = typeof candidate.request_id === "string" ? candidate.request_id.trim() : "";
  const question = typeof candidate.question === "string" ? candidate.question.trim() : "";
  if (!requestId || !question) return null;

  return {
    requestId,
    question,
    choices: Array.isArray(candidate.choices)
      ? candidate.choices.filter((choice): choice is string => typeof choice === "string")
      : [],
  };
}
