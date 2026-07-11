import { Button } from "@nous-research/ui/ui/components/button";
import { Spinner } from "@nous-research/ui/ui/components/spinner";
import {
  AlertCircle,
  BookOpen,
  Bot,
  FileText,
  Loader2,
  MessageSquarePlus,
  Paperclip,
  Quote,
  Send,
  Square,
  UploadCloud,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent as ReactClipboardEvent,
  type DragEvent as ReactDragEvent,
  type FormEvent,
} from "react";

import { WorkActivityRows } from "@/components/WorkActivityFeed";
import { WorkClarifyPrompt } from "@/components/WorkClarifyPrompt";
import { useProfileScope } from "@/contexts/useProfileScope";
import { Markdown } from "@/components/Markdown";
import { api } from "@/lib/api";
import { GatewayClient, type ConnectionState, type GatewayEventName } from "@/lib/gatewayClient";
import {
  acknowledgeWorkBusyMessage,
  canSubmitWorkMessage,
  clarifyRequestFromPayload,
  gatewayEventBelongsToSession,
  resizeWorkComposer,
  serializeWorkSessionOperation,
  shouldReconnectWorkSession,
  startWorkBusyQueue,
  workMessageContextPrompt,
  workReconnectDelay,
  type WorkClarifyRequest,
  type WorkMessageContext,
} from "@/lib/work-chat";
import {
  activityFromGatewayEvent,
  usedSkillNames,
  type WorkActivityItem,
} from "@/lib/work-activity";
import {
  dataTransferHasFiles,
  fallbackUploadFileName,
  filesFromDataTransfer,
  managedUploadRoot,
  workUploadPrompt,
  workUploadTargetPath,
  type WorkUploadAttachment,
} from "@/lib/work-uploads";
import { cn } from "@/lib/utils";

interface WorkMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  context?: WorkMessageContext;
}

interface GatewayMessage {
  role?: unknown;
  text?: unknown;
  content?: unknown;
}

interface SessionPayload {
  session_id: string;
  stored_session_id?: string;
  session_key?: string;
  resumed?: string;
  messages?: GatewayMessage[];
  info?: {
    model?: string;
    provider?: string;
  };
  running?: boolean;
}

interface MessagePayload {
  text?: string;
  status?: string;
  warning?: string;
}

interface PromptSubmitPayload {
  status?: string;
}

const ACTIVITY_LIMIT = 80;
const EMPTY_MESSAGE = "Schreib einfach los. Bilder, PDFs und Dokumente kannst du direkt anhängen.";

function textFromGatewayMessage(message: GatewayMessage): string {
  const raw = message.text ?? message.content;
  return typeof raw === "string" ? raw : "";
}

function hydrateMessages(messages: GatewayMessage[] | undefined): WorkMessage[] {
  if (!Array.isArray(messages)) return [];
  return messages.flatMap((message, index) => {
    const role = message.role === "user" || message.role === "assistant" ? message.role : null;
    const text = textFromGatewayMessage(message).trim();
    if (!role || !text) return [];
    return [{ id: `history-${index}`, role, text }];
  });
}

function readableConnectionState(state: ConnectionState): string {
  if (state === "open") return "live";
  if (state === "connecting") return "verbinde";
  if (state === "error") return "Fehler";
  if (state === "closed") return "getrennt";
  return "bereit";
}

export default function WorkPage() {
  const { profile } = useProfileScope();
  const clientRef = useRef<GatewayClient | null>(null);
  const connectPromiseRef = useRef<Promise<void> | null>(null);
  const cleanupRef = useRef<Array<() => void>>([]);
  const sessionOperationRef = useRef<Promise<void>>(Promise.resolve());
  const pendingSessionOperationsRef = useRef(0);
  const sessionIdRef = useRef<string | null>(null);
  const streamRef = useRef("");
  const pendingBusyMessagesRef = useRef<WorkMessage[]>([]);
  const queuedMessagesRef = useRef<WorkMessage[]>([]);
  const reconnectAttemptRef = useRef(0);
  const mountedRef = useRef(false);
  const messageSeq = useRef(0);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const autoScrollRef = useRef(true);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const uploadSequenceRef = useRef(0);
  const uploadDragDepthRef = useRef(0);
  const uploadNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [activities, setActivities] = useState<WorkActivityItem[]>([]);
  const [attachments, setAttachments] = useState<WorkUploadAttachment[]>([]);
  const [clarifyRequest, setClarifyRequest] = useState<WorkClarifyRequest | null>(null);
  const [clarifySubmitting, setClarifySubmitting] = useState(false);
  const [composer, setComposer] = useState("");
  const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
  const [draggingUpload, setDraggingUpload] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<WorkMessage[]>([]);
  const [messageContext, setMessageContext] = useState<WorkMessageContext | null>(null);
  const [model, setModel] = useState("");
  const [openingSession, setOpeningSession] = useState(false);
  const [queuedMessages, setQueuedMessages] = useState<WorkMessage[]>([]);
  const [running, setRunning] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);

  const pushActivity = useCallback((type: GatewayEventName | "error", payload: unknown) => {
    const row = activityFromGatewayEvent(type, payload);
    if (!row) return;
    const payloadRecord = payload && typeof payload === "object"
      ? (payload as { id?: unknown; tool_call_id?: unknown; tool_id?: unknown })
      : null;
    const toolId = payloadRecord
      ? String(payloadRecord.tool_id || payloadRecord.tool_call_id || payloadRecord.id || "")
      : "";
    setActivities((prev) => {
      const nextPrev = toolId ? prev.filter((item) => !item.id.includes(`:${toolId}:`)) : prev;
      return [row, ...nextPrev].slice(0, ACTIVITY_LIMIT);
    });
  }, []);

  const scrollTranscriptToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    requestAnimationFrame(() => {
      transcriptEndRef.current?.scrollIntoView({ block: "end", behavior });
    });
  }, []);

  const handleTranscriptScroll = useCallback(() => {
    const el = transcriptRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    autoScrollRef.current = distanceFromBottom < 160;
  }, []);

  const showUploadNotice = useCallback((message: string) => {
    setUploadNotice(message);
    if (uploadNoticeTimerRef.current) {
      clearTimeout(uploadNoticeTimerRef.current);
    }
    uploadNoticeTimerRef.current = setTimeout(() => {
      setUploadNotice(null);
      uploadNoticeTimerRef.current = null;
    }, 4500);
  }, []);

  const uploadFilesToWork = useCallback(
    async (files: File[]) => {
      if (!files.length || uploading) return;

      setUploading(true);
      setError(null);
      showUploadNotice(`Lade ${files.length} Datei${files.length === 1 ? "" : "en"} hoch …`);
      let uploadedCount = 0;

      try {
        const sequence = ++uploadSequenceRef.current;
        const policy = await api.listFiles();
        const uploadRoot = managedUploadRoot(policy.locked_root);
        for (const [index, file] of files.entries()) {
          const targetPath = workUploadTargetPath(file, index, sequence, new Date(), uploadRoot);
          const result = await api.uploadFile(targetPath, file, true);
          const attachment: WorkUploadAttachment = {
            id: `upload-${Date.now()}-${sequence}-${index}`,
            name: fallbackUploadFileName(file, index),
            path: result.path,
            mimeType: file.type || result.entry.mime_type || "",
            size: file.size,
          };
          uploadedCount += 1;
          setAttachments((prev) => [...prev, attachment]);
        }

        showUploadNotice(
          `${uploadedCount} Upload${uploadedCount === 1 ? "" : "s"} angehängt — Text ergänzen oder Senden.`,
        );
      } catch (e) {
        const message = e instanceof Error ? e.message : "Upload fehlgeschlagen.";
        const partial = uploadedCount
          ? ` ${uploadedCount} erfolgreicher Upload${uploadedCount === 1 ? " bleibt" : "s bleiben"} angehängt.`
          : "";
        setError(`Upload fehlgeschlagen: ${message}.${partial}`);
        setUploadNotice(null);
        pushActivity("error", { message });
      } finally {
        setUploading(false);
      }
    },
    [pushActivity, showUploadNotice, uploading],
  );

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((attachment) => attachment.id !== id));
  }, []);

  const attachMessageAsContext = useCallback((message: WorkMessage) => {
    setMessageContext({ id: message.id, role: message.role, text: message.text });
    requestAnimationFrame(() => composerRef.current?.focus());
  }, []);

  const handleUploadInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.currentTarget.files ?? []);
      event.currentTarget.value = "";
      void uploadFilesToWork(files);
    },
    [uploadFilesToWork],
  );

  const handleUploadDragEnter = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    if (!dataTransferHasFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    if (uploading) return;
    uploadDragDepthRef.current += 1;
    setDraggingUpload(true);
  }, [uploading]);

  const handleUploadDragOver = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    if (!dataTransferHasFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    if (uploading) {
      event.dataTransfer.dropEffect = "none";
      return;
    }
    event.dataTransfer.dropEffect = "copy";
  }, [uploading]);

  const handleUploadDragLeave = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    if (!dataTransferHasFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    uploadDragDepthRef.current = Math.max(0, uploadDragDepthRef.current - 1);
    if (uploadDragDepthRef.current === 0) {
      setDraggingUpload(false);
    }
  }, []);

  const handleUploadDrop = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (!dataTransferHasFiles(event.dataTransfer)) return;
      event.preventDefault();
      event.stopPropagation();
      uploadDragDepthRef.current = 0;
      setDraggingUpload(false);
      if (uploading) return;
      void uploadFilesToWork(filesFromDataTransfer(event.dataTransfer));
    },
    [uploadFilesToWork, uploading],
  );

  const handleUploadPaste = useCallback(
    (event: ReactClipboardEvent<HTMLDivElement>) => {
      const files = filesFromDataTransfer(event.clipboardData);
      if (files.length > 0) {
        event.preventDefault();
        event.stopPropagation();
        void uploadFilesToWork(files);
      }
    },
    [uploadFilesToWork],
  );

  const registerClientHandlers = useCallback(
    (client: GatewayClient) => {
      const isCurrentSession = (event: { session_id?: string }) =>
        gatewayEventBelongsToSession(event.session_id, sessionIdRef.current);

      cleanupRef.current.push(
        client.onState((state) => {
          setConnectionState(state);
          if (state === "open") reconnectAttemptRef.current = 0;
        }),
        client.on<MessagePayload>("message.start", (event) => {
          if (!isCurrentSession(event)) return;
          const started = startWorkBusyQueue(
            pendingBusyMessagesRef.current,
            queuedMessagesRef.current,
          );
          pendingBusyMessagesRef.current = started.pending;
          queuedMessagesRef.current = started.queued;
          setQueuedMessages(started.queued);
          if (started.promoted.length > 0) {
            setMessages((prev) => [
              ...prev,
              ...started.promoted.filter(
                (message) => !prev.some((existing) => existing.id === message.id),
              ),
            ]);
          }
          streamRef.current = "";
          setStreamingText("");
          setRunning(true);
        }),
        client.on<MessagePayload>("message.delta", (event) => {
          if (!isCurrentSession(event)) return;
          const delta = event.payload?.text ?? "";
          if (!delta) return;
          streamRef.current += delta;
          setStreamingText(streamRef.current);
        }),
        client.on<MessagePayload>("message.complete", (event) => {
          if (!isCurrentSession(event)) return;
          const finalText = event.payload?.text || streamRef.current;
          if (finalText.trim()) {
            const id = `assistant-${Date.now()}-${messageSeq.current++}`;
            setMessages((prev) => [...prev, { id, role: "assistant", text: finalText }]);
          }
          if (event.payload?.warning) {
            pushActivity("status.update", { kind: "warning", text: event.payload.warning });
          }
          streamRef.current = "";
          setStreamingText("");
          setRunning(false);
          setClarifyRequest(null);
          setClarifySubmitting(false);
        }),
        client.on<{ message?: string }>("error", (event) => {
          if (!isCurrentSession(event)) return;
          const message = event.payload?.message || "Hermes hat einen Fehler gemeldet.";
          setError(message);
          setRunning(false);
          setClarifyRequest(null);
          setClarifySubmitting(false);
          pushActivity("error", { message });
        }),
        client.on<{ model?: string; provider?: string }>("session.info", (event) => {
          if (!isCurrentSession(event)) return;
          const nextModel = [event.payload?.provider, event.payload?.model]
            .filter(Boolean)
            .join(" / ");
          if (nextModel) setModel(nextModel);
        }),
        client.on("tool.start", (event) => {
          if (isCurrentSession(event)) pushActivity("tool.start", event.payload);
        }),
        client.on("tool.progress", (event) => {
          if (isCurrentSession(event)) pushActivity("tool.progress", event.payload);
        }),
        client.on<{ name?: string }>("tool.complete", (event) => {
          if (!isCurrentSession(event)) return;
          pushActivity("tool.complete", event.payload);
          if (event.payload?.name === "clarify") {
            setClarifyRequest(null);
            setClarifySubmitting(false);
          }
        }),
        client.on("clarify.request", (event) => {
          if (!isCurrentSession(event)) return;
          const request = clarifyRequestFromPayload(event.payload);
          if (!request) return;
          setClarifyRequest(request);
          setClarifySubmitting(false);
          setRunning(true);
          autoScrollRef.current = true;
          scrollTranscriptToBottom("smooth");
        }),
        client.on("status.update", (event) => {
          if (isCurrentSession(event)) pushActivity("status.update", event.payload);
        }),
        client.on("reasoning.available", (event) => {
          if (isCurrentSession(event)) pushActivity("reasoning.available", event.payload);
        }),
        client.on("approval.request", (event) => {
          if (isCurrentSession(event)) pushActivity("approval.request", event.payload);
        }),
      );
    },
    [pushActivity, scrollTranscriptToBottom],
  );

  const client = useCallback(async () => {
    let current = clientRef.current;
    if (!current) {
      current = new GatewayClient();
      registerClientHandlers(current);
      clientRef.current = current;
    }
    if ((current.connectionState as ConnectionState) === "open") return current;

    let pending = connectPromiseRef.current;
    if (!pending) {
      pending = current.connect();
      connectPromiseRef.current = pending;
    }
    try {
      await pending;
    } finally {
      if (connectPromiseRef.current === pending) connectPromiseRef.current = null;
    }
    return current;
  }, [registerClientHandlers]);

  const closeCurrentSession = useCallback(async (bestEffort = false) => {
    const currentClient = clientRef.current;
    const currentSession = sessionIdRef.current;
    if (!currentSession) return;

    try {
      if (!currentClient) throw new Error("Gateway-Client fehlt.");
      await currentClient.request("session.close", { session_id: currentSession });
    } catch (cause) {
      if (!bestEffort) throw cause;
    }

    if (sessionIdRef.current === currentSession) {
      sessionIdRef.current = null;
      if (mountedRef.current) setSessionId(null);
    }
  }, []);

  const openSession = useCallback(
    (resumeId?: string) => {
      pendingSessionOperationsRef.current += 1;
      setOpeningSession(true);

      const perform = async () => {
        const currentClient = await client();
        await closeCurrentSession();

        setError(null);
        setRunning(false);
        setClarifyRequest(null);
        setClarifySubmitting(false);
        setStreamingText("");
        setComposer("");
        setAttachments([]);
        setMessageContext(null);
        pendingBusyMessagesRef.current = [];
        queuedMessagesRef.current = [];
        setQueuedMessages([]);
        setDraggingUpload(false);
        autoScrollRef.current = true;
        streamRef.current = "";

        const payload = resumeId
          ? await currentClient.request<SessionPayload>("session.resume", {
              profile: profile || undefined,
              session_id: resumeId,
              source: "web",
            })
          : await currentClient.request<SessionPayload>("session.create", {
              profile: profile || undefined,
              source: "web",
              title: "Work Chat",
            });

        if (!mountedRef.current) {
          try {
            await currentClient.request("session.close", { session_id: payload.session_id });
          } catch {
            // Component is gone; only best-effort remote cleanup remains.
          }
          return;
        }

        sessionIdRef.current = payload.session_id;
        setSessionId(payload.session_id);
        setMessages(hydrateMessages(payload.messages));
        setModel([payload.info?.provider, payload.info?.model].filter(Boolean).join(" / "));
        setRunning(Boolean(payload.running));
        setActivities([]);
        scrollTranscriptToBottom("auto");
      };

      const serialized = serializeWorkSessionOperation(sessionOperationRef.current, perform);
      sessionOperationRef.current = serialized.queue;
      return serialized.operation.finally(() => {
        pendingSessionOperationsRef.current = Math.max(0, pendingSessionOperationsRef.current - 1);
        if (mountedRef.current && pendingSessionOperationsRef.current === 0) {
          setOpeningSession(false);
        }
      });
    },
    [client, closeCurrentSession, profile, scrollTranscriptToBottom],
  );

  useEffect(() => {
    mountedRef.current = true;
    queueMicrotask(() => {
      void openSession().catch((e: Error) => {
        if (!mountedRef.current) return;
        setError(e.message);
        pushActivity("error", { message: e.message });
      });
    });
    return () => {
      mountedRef.current = false;
      if (uploadNoticeTimerRef.current) {
        clearTimeout(uploadNoticeTimerRef.current);
        uploadNoticeTimerRef.current = null;
      }
      cleanupRef.current.forEach((off) => off());
      cleanupRef.current = [];
      const cleanup = serializeWorkSessionOperation(sessionOperationRef.current, async () => {
        try {
          await connectPromiseRef.current;
        } catch {
          // The socket is closed below regardless of the connect outcome.
        }
        await closeCurrentSession(true);
        clientRef.current?.close();
        clientRef.current = null;
        connectPromiseRef.current = null;
      });
      sessionOperationRef.current = cleanup.queue;
      void cleanup.operation;
    };
  }, [closeCurrentSession, openSession, pushActivity]);

  useEffect(() => {
    if (!shouldReconnectWorkSession(connectionState, sessionId, mountedRef.current)) return;

    const delay = workReconnectDelay(reconnectAttemptRef.current++);
    const timer = window.setTimeout(() => {
      void client().catch((cause: unknown) => {
        if (!mountedRef.current) return;
        const message = cause instanceof Error ? cause.message : "Work-Chat-Verbindung fehlgeschlagen.";
        setError(message);
      });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [client, connectionState, sessionId]);

  const submit = useCallback(
    async (event?: FormEvent) => {
      event?.preventDefault();
      const draftText = composer.trim();
      const draftAttachments = attachments;
      const draftContext = messageContext;
      const uploadPrompt = workUploadPrompt(draftAttachments, draftText);
      const text = workMessageContextPrompt(draftContext, uploadPrompt);
      if (!text) return;
      const wasRunning = running;
      autoScrollRef.current = true;
      setComposer("");
      setAttachments([]);
      setMessageContext(null);
      setError(null);
      const id = `user-${Date.now()}-${messageSeq.current++}`;
      const visibleText = uploadPrompt || "Berücksichtige die markierte Nachricht als Kontext.";
      const message: WorkMessage = {
        id,
        role: "user",
        text: visibleText,
        context: draftContext || undefined,
      };
      if (!wasRunning) {
        setMessages((prev) => [...prev, message]);
      } else {
        pendingBusyMessagesRef.current = [...pendingBusyMessagesRef.current, message];
      }
      setRunning(true);
      scrollTranscriptToBottom("smooth");
      try {
        const c = await client();
        const sid = sessionIdRef.current;
        if (!sid) throw new Error("Keine aktive Work-Chat-Session.");
        const result = await c.request<PromptSubmitPayload>("prompt.submit", {
          session_id: sid,
          text,
        });
        if (wasRunning) {
          const acknowledged = acknowledgeWorkBusyMessage(
            pendingBusyMessagesRef.current,
            queuedMessagesRef.current,
            message,
            result.status,
          );
          pendingBusyMessagesRef.current = acknowledged.pending;
          queuedMessagesRef.current = acknowledged.queued;
          setQueuedMessages(acknowledged.queued);
          if (acknowledged.visible.length > 0) {
            setMessages((prev) => [
              ...prev,
              ...acknowledged.visible.filter(
                (visible) => !prev.some((existing) => existing.id === visible.id),
              ),
            ]);
          }
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : "Senden fehlgeschlagen.";
        setError(message);
        setRunning(wasRunning);
        setMessages((prev) => prev.filter((item) => item.id !== id));
        pendingBusyMessagesRef.current = pendingBusyMessagesRef.current.filter(
          (item) => item.id !== id,
        );
        const queued = queuedMessagesRef.current.filter((item) => item.id !== id);
        queuedMessagesRef.current = queued;
        setQueuedMessages(queued);
        setComposer(draftText);
        setAttachments(draftAttachments);
        setMessageContext(draftContext);
        pushActivity("error", { message });
      }
    },
    [attachments, client, composer, messageContext, pushActivity, running, scrollTranscriptToBottom],
  );

  const respondToClarify = useCallback(
    async (answer: string) => {
      const request = clarifyRequest;
      if (!request) return;
      setClarifySubmitting(true);
      setError(null);
      try {
        const c = await client();
        await c.request("clarify.respond", {
          answer,
          request_id: request.requestId,
        });
        setClarifyRequest(null);
        setClarifySubmitting(false);
        if (answer.trim()) {
          const id = `user-${Date.now()}-${messageSeq.current++}`;
          setMessages((prev) => [...prev, { id, role: "user", text: answer.trim() }]);
          autoScrollRef.current = true;
          scrollTranscriptToBottom("smooth");
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : "Antwort konnte nicht gesendet werden.";
        setError(message);
        setClarifySubmitting(false);
      }
    },
    [clarifyRequest, client, scrollTranscriptToBottom],
  );

  const interrupt = useCallback(() => {
    const sid = sessionIdRef.current;
    if (!sid || !running) return;
    void client()
      .then((currentClient) => currentClient.request("session.interrupt", { session_id: sid }))
      .then(() => {
        pendingBusyMessagesRef.current = [];
        queuedMessagesRef.current = [];
        setQueuedMessages([]);
        setClarifyRequest(null);
        setClarifySubmitting(false);
      })
      .catch((e: Error) => {
        setError(e.message);
      });
  }, [client, running]);

  const visibleMessages = useMemo(() => messages, [messages]);
  const inlineActivities = useMemo(
    () =>
      activities
        .filter(
          (activity) =>
            activity.kind === "tool" ||
            activity.kind === "skill" ||
            activity.kind === "approval" ||
            activity.kind === "error" ||
            activity.status === "running",
        )
        .slice(0, 5)
        .reverse(),
    [activities],
  );
  const usedSkills = useMemo(() => usedSkillNames(activities), [activities]);
  const visibleActivityRows = useMemo(
    () => inlineActivities.filter((activity) => activity.kind !== "skill"),
    [inlineActivities],
  );
  const canSubmit = canSubmitWorkMessage({
    attachmentCount: attachments.length,
    connectionState,
    contextCount: messageContext ? 1 : 0,
    running,
    text: composer,
  });

  useLayoutEffect(() => {
    resizeWorkComposer(composerRef.current);
  }, [composer]);

  useEffect(() => {
    if (autoScrollRef.current || running || streamingText) {
      scrollTranscriptToBottom(streamingText ? "auto" : "smooth");
    }
  }, [error, messages.length, running, scrollTranscriptToBottom, streamingText]);

  return (
    <div
      className="flex h-full min-h-0 flex-1 flex-col overflow-hidden"
      onPasteCapture={handleUploadPaste}
    >
      <section
        className={cn(
          "relative flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden",
          draggingUpload && "ring-2 ring-sky-500/70",
        )}
        onDragEnter={handleUploadDragEnter}
        onDragOver={handleUploadDragOver}
        onDragLeave={handleUploadDragLeave}
        onDrop={handleUploadDrop}
      >
        <header className="shrink-0 px-4 sm:px-6">
          <div className="mx-auto flex h-11 w-full max-w-5xl items-center justify-between gap-3 border-b border-current/10">
            <div className="flex min-w-0 items-center gap-2 text-xs text-text-secondary">
              <span
                className={cn(
                  "h-1.5 w-1.5 shrink-0 rounded-full",
                  connectionState === "open" ? "bg-success" : "bg-warning",
                )}
              />
              <span className="truncate">{model || "Modell wird geladen…"}</span>
              {sessionId ? <span className="shrink-0">· {readableConnectionState(connectionState)}</span> : null}
            </div>
            <div className="flex items-center gap-1">
              <Button
                ghost
                size="icon"
                aria-label="Neue Unterhaltung"
                title="Neue Unterhaltung"
                disabled={openingSession || (running && connectionState === "open")}
                onClick={() => {
                  void openSession().catch((cause: unknown) => {
                    const message = cause instanceof Error ? cause.message : "Neue Unterhaltung konnte nicht geöffnet werden.";
                    setError(message);
                    pushActivity("error", { message });
                  });
                }}
              >
                <MessageSquarePlus className="h-4 w-4" />
              </Button>
              {running ? (
                <Button size="sm" ghost onClick={interrupt} prefix={<Square />}>
                  Stop
                </Button>
              ) : null}
            </div>
          </div>
        </header>

        <div
          ref={transcriptRef}
          onScroll={handleTranscriptScroll}
          className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-6 sm:px-6"
        >
          <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col gap-6">
            {error ? (
              <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            ) : null}

            {visibleMessages.length === 0 && !streamingText && !clarifyRequest ? (
              <div className="flex min-h-72 flex-1 items-center justify-center pb-20 text-center">
                <div className="max-w-xl px-6">
                  <div className="mx-auto mb-5 grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-primary">
                    <Bot className="h-5 w-5" />
                  </div>
                  <h2 className="text-2xl font-semibold tracking-[-0.025em] text-text-primary">
                    Womit kann ich dir helfen?
                  </h2>
                  <p className="mt-3 text-sm leading-relaxed text-text-tertiary">{EMPTY_MESSAGE}</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-8 py-2">
                {visibleMessages.map((message) => (
                  <article
                    key={message.id}
                    onDoubleClick={() => attachMessageAsContext(message)}
                    title="Doppelklicken, um diese Nachricht als Kontext anzuhängen"
                    className={cn(
                      "flex min-w-0 cursor-copy",
                      message.role === "user" ? "justify-end" : "justify-start",
                    )}
                  >
                    <div
                      className={cn(
                        "min-w-0 text-[0.9375rem] leading-7",
                        message.role === "user"
                          ? "max-w-[85%] rounded-3xl bg-midground/[0.09] px-4 py-2.5 text-text-primary"
                          : "w-full text-text-primary",
                        messageContext?.id === message.id &&
                          "rounded-2xl ring-2 ring-primary/45 ring-offset-2 ring-offset-background",
                      )}
                    >
                      {message.context ? (
                        <div className="mb-2 flex min-w-0 items-center gap-1.5 border-l-2 border-primary/45 pl-2 text-xs text-text-tertiary">
                          <Quote className="h-3 w-3 shrink-0" />
                          <span className="shrink-0">Kontext · {message.context.role === "assistant" ? "Hermes" : "Du"}</span>
                          <span className="truncate">{message.context.text}</span>
                        </div>
                      ) : null}
                      {message.role === "assistant" ? (
                        <Markdown content={message.text} />
                      ) : (
                        <p className="whitespace-pre-wrap">{message.text}</p>
                      )}
                    </div>
                  </article>
                ))}

                {usedSkills.length > 0 || visibleActivityRows.length > 0 ? (
                  <div className="border-l-2 border-current/15 pl-3">
                    {usedSkills.length > 0 ? (
                      <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs text-text-secondary">
                        <BookOpen className="h-3.5 w-3.5 shrink-0 text-primary/75" />
                        <span className="mr-0.5">Skills</span>
                        {usedSkills.map((skill) => (
                          <span
                            key={skill}
                            className="rounded-full bg-midground/[0.07] px-2 py-1 text-[0.6875rem] text-text-secondary"
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <WorkActivityRows activities={visibleActivityRows} />
                  </div>
                ) : null}

                {clarifyRequest ? (
                  <WorkClarifyPrompt
                    key={clarifyRequest.requestId}
                    request={clarifyRequest}
                    submitting={clarifySubmitting}
                    onRespond={respondToClarify}
                  />
                ) : null}

                {streamingText ? (
                  <article className="min-w-0 text-[0.9375rem] leading-7 text-text-primary">
                    <div className="w-full min-w-0">
                      <Markdown content={streamingText} streaming />
                    </div>
                  </article>
                ) : null}

                {running && !streamingText && !clarifyRequest ? (
                  <div className="flex items-center gap-2 text-xs text-text-tertiary">
                    <Spinner /> Hermes arbeitet…
                  </div>
                ) : null}

                {queuedMessages.length > 0 ? (
                  <div className="flex flex-col items-end gap-2">
                    {queuedMessages.map((message) => (
                      <div
                        key={message.id}
                        className="max-w-[85%] rounded-3xl border border-dashed border-current/15 bg-midground/[0.06] px-4 py-2.5 text-text-secondary"
                      >
                        <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.text}</p>
                        <p className="mt-1 text-[0.6875rem] text-text-tertiary">Wird als Nächstes verarbeitet</p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
            <div ref={transcriptEndRef} className="h-1 shrink-0" />
          </div>
        </div>

        <form onSubmit={submit} className="shrink-0 px-3 pb-3 pt-2 sm:px-6 sm:pb-4">
          <div className="mx-auto w-full max-w-5xl">
            {uploadNotice ? (
              <div className="mb-2 flex items-center gap-2 rounded-xl bg-sky-500/10 px-3 py-2 text-xs text-sky-300">
                {uploading ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> : <Paperclip className="h-3.5 w-3.5 shrink-0" />}
                <span>{uploadNotice}</span>
              </div>
            ) : null}

            <input
              ref={uploadInputRef}
              type="file"
              multiple
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={handleUploadInputChange}
              accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.md,.json,.yaml,.yml"
            />

            <div className="rounded-[1.65rem] border border-current/20 bg-midground/[0.055] px-2.5 py-2 shadow-[0_8px_30px_rgba(0,0,0,0.08)] transition-colors focus-within:border-primary/55">
              {messageContext ? (
                <div className="mb-2 flex min-w-0 items-start gap-2 rounded-2xl border border-primary/20 bg-primary/[0.055] px-3 py-2 text-xs text-text-secondary">
                  <Quote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-text-primary">
                      Kontext · {messageContext.role === "assistant" ? "Hermes" : "Du"}
                    </p>
                    <p className="mt-0.5 max-h-10 overflow-hidden whitespace-pre-wrap leading-5 text-text-tertiary">
                      {messageContext.text}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label="Markierten Kontext entfernen"
                    title="Kontext entfernen"
                    onClick={() => setMessageContext(null)}
                    className="rounded-full p-0.5 text-text-tertiary hover:bg-midground/10 hover:text-text-primary"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : null}

              {attachments.length > 0 ? (
                <div className="mb-2 flex flex-wrap gap-2 px-2 pt-1">
                  {attachments.map((attachment) => (
                    <span
                      key={attachment.id}
                      className="inline-flex max-w-full items-center gap-2 rounded-full bg-midground/[0.07] px-3 py-1.5 text-xs text-text-secondary"
                    >
                      <FileText className="h-3.5 w-3.5 shrink-0 text-primary" />
                      <span className="max-w-48 truncate">{attachment.name}</span>
                      <button
                        type="button"
                        aria-label={`${attachment.name} entfernen`}
                        onClick={() => removeAttachment(attachment.id)}
                        className="rounded-full p-0.5 text-text-tertiary hover:bg-midground/10 hover:text-text-primary"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="flex items-end gap-2">
                <Button
                  type="button"
                  ghost
                  size="icon"
                  disabled={uploading}
                  onClick={() => uploadInputRef.current?.click()}
                  title="Datei, Screenshot, PDF oder Dokument anhängen"
                  aria-label="Datei anhängen"
                  className="mb-0.5 shrink-0 rounded-full text-text-secondary hover:text-primary"
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                </Button>

                <textarea
                  ref={composerRef}
                  value={composer}
                  onChange={(event) => setComposer(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      void submit();
                    }
                  }}
                  disabled={connectionState !== "open" || openingSession || !sessionId}
                  rows={1}
                  placeholder={
                    messageContext
                      ? "Frage oder Anweisung zum markierten Kontext…"
                      : attachments.length > 0
                        ? "Optionaler Kontext zum Anhang…"
                        : "Nachricht an Hermes"
                  }
                  className="min-h-7 max-h-40 w-full resize-none bg-transparent py-2 text-[0.9375rem] leading-6 text-text-primary outline-none placeholder:text-text-tertiary disabled:opacity-60"
                />

                <Button
                  type="submit"
                  size="icon"
                  disabled={!canSubmit || uploading || openingSession || !sessionId}
                  title="Senden"
                  aria-label="Nachricht senden"
                  className="mb-0.5 shrink-0 rounded-full"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {clarifyRequest || running || attachments.length > 0 || messageContext ? (
              <p className="mt-1.5 px-3 text-[0.6875rem] text-text-tertiary">
                {clarifyRequest
                  ? "Rückfrage oben beantworten · weitere Nachrichten bleiben möglich"
                  : running
                    ? "Du kannst während der Bearbeitung weiterschreiben"
                    : messageContext
                      ? "Markierte Nachricht wird beim Senden als Kontext mitgegeben"
                      : `${attachments.length} Anhang${attachments.length === 1 ? "" : "e"} bereit`}
              </p>
            ) : null}
          </div>
        </form>

        {draggingUpload ? (
          <div className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-sky-950/80 text-sky-100 backdrop-blur-sm">
            <UploadCloud className="h-10 w-10 text-sky-300" />
            <div className="text-center">
              <p className="text-sm font-medium">Dateien hier ablegen</p>
              <p className="mt-1 text-xs text-sky-200/80">Screenshots, Bilder, PDFs und Dokumente werden lokal an Hermes übergeben.</p>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
