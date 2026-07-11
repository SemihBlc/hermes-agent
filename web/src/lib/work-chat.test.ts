import { describe, expect, it } from "vitest";

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
  workSubmitDisposition,
} from "./work-chat";

describe("clarifyRequestFromPayload", () => {
  it("keeps the request id, question, and string choices from a gateway event", () => {
    expect(
      clarifyRequestFromPayload({
        request_id: "clarify-42",
        question: "Welcher Zeitraum?",
        choices: ["07:00–08:00", 7, "08:00–09:00"],
      }),
    ).toEqual({
      requestId: "clarify-42",
      question: "Welcher Zeitraum?",
      choices: ["07:00–08:00", "08:00–09:00"],
    });
  });
});

describe("canSubmitWorkMessage", () => {
  it("allows sending another message while Hermes is already running", () => {
    expect(
      canSubmitWorkMessage({
        attachmentCount: 0,
        connectionState: "open",
        running: true,
        text: "Noch eine wichtige Ergänzung",
      }),
    ).toBe(true);
  });

  it("allows sending a marked message as context without additional text", () => {
    expect(
      canSubmitWorkMessage({
        attachmentCount: 0,
        connectionState: "open",
        contextCount: 1,
        running: false,
        text: "",
      }),
    ).toBe(true);
  });
});

describe("gateway session guards", () => {
  it("rejects late or unscoped events", () => {
    expect(gatewayEventBelongsToSession("old", "new")).toBe(false);
    expect(gatewayEventBelongsToSession("new", "new")).toBe(true);
    expect(gatewayEventBelongsToSession(undefined, "new")).toBe(false);
    expect(gatewayEventBelongsToSession("new", null)).toBe(false);
  });

  it("queues only explicit queued busy submissions", () => {
    expect(workSubmitDisposition(true, "queued")).toBe("queued");
    expect(workSubmitDisposition(true, "steered")).toBe("visible");
    expect(workSubmitDisposition(false, "queued")).toBe("visible");
  });
});

describe("work gateway recovery", () => {
  it("reconnects only a mounted active session after a terminal connection state", () => {
    expect(shouldReconnectWorkSession("closed", "session-1", true)).toBe(true);
    expect(shouldReconnectWorkSession("error", "session-1", true)).toBe(true);
    expect(shouldReconnectWorkSession("open", "session-1", true)).toBe(false);
    expect(shouldReconnectWorkSession("closed", null, true)).toBe(false);
    expect(shouldReconnectWorkSession("closed", "session-1", false)).toBe(false);
  });

  it("backs reconnect attempts off with a bounded delay", () => {
    expect([0, 1, 2, 10].map(workReconnectDelay)).toEqual([500, 1_000, 2_000, 10_000]);
  });

  it("serializes cleanup behind an in-flight session operation", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const order: string[] = [];

    const first = serializeWorkSessionOperation(Promise.resolve(), async () => {
      order.push("open:start");
      await gate;
      order.push("open:end");
    });
    const cleanup = serializeWorkSessionOperation(first.queue, async () => {
      order.push("cleanup");
    });

    await Promise.resolve();
    expect(order).toEqual(["open:start"]);
    release();
    await cleanup.operation;
    expect(order).toEqual(["open:start", "open:end", "cleanup"]);
  });
});

describe("busy work queue reconciliation", () => {
  const first = { id: "one", text: "Erste Ergänzung" };
  const second = { id: "two", text: "Zweite Ergänzung" };

  it("promotes every merged queued message on the single following message.start", () => {
    const acknowledged = acknowledgeWorkBusyMessage([first, second], [], first, "queued");
    expect(acknowledged).toEqual({ pending: [first, second], queued: [first], visible: [] });

    expect(startWorkBusyQueue(acknowledged.pending, acknowledged.queued)).toEqual({
      pending: [],
      queued: [],
      promoted: [first, second],
    });
  });

  it("does not recreate a queue row when message.start wins the response race", () => {
    const started = startWorkBusyQueue([first], []);
    const lateAcknowledgement = acknowledgeWorkBusyMessage(
      started.pending,
      started.queued,
      first,
      "queued",
    );

    expect(started.promoted).toEqual([first]);
    expect(lateAcknowledgement).toEqual({ pending: [], queued: [], visible: [] });
  });

  it("shows a steered busy message immediately instead of queueing it", () => {
    expect(acknowledgeWorkBusyMessage([first], [], first, "steered")).toEqual({
      pending: [],
      queued: [],
      visible: [first],
    });
  });
});

describe("workMessageContextPrompt", () => {
  it("places the marked message after the new instruction", () => {
    expect(
      workMessageContextPrompt(
        {
          id: "assistant-42",
          role: "assistant",
          text: "Das ist die relevante frühere Antwort.",
        },
        "Prüfe das bitte noch einmal.",
      ),
    ).toBe(
      [
        "Prüfe das bitte noch einmal.",
        "",
        "--- Markierter Kontext (Hermes) ---",
        "Das ist die relevante frühere Antwort.",
        "--- Ende markierter Kontext ---",
      ].join("\n"),
    );
  });

  it("creates a useful instruction when only context is submitted", () => {
    expect(
      workMessageContextPrompt(
        {
          id: "user-7",
          role: "user",
          text: "Die ursprünglich markierte Nachricht.",
        },
        "",
      ),
    ).toContain("Berücksichtige die markierte Nachricht als Kontext.");
  });
});

describe("resizeWorkComposer", () => {
  it("starts compact and grows only until the configured maximum", () => {
    const style = { height: "112px", overflowY: "auto" };
    const composer = { scrollHeight: 34, style };

    resizeWorkComposer(composer);
    expect(style).toEqual({ height: "34px", overflowY: "hidden" });

    Object.defineProperty(composer, "scrollHeight", { value: 240 });
    resizeWorkComposer(composer, 160);
    expect(style).toEqual({ height: "160px", overflowY: "auto" });
  });
});
