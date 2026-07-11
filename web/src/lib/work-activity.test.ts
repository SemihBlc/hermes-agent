import { describe, expect, it, vi } from "vitest";

import {
  activityFromGatewayEvent,
  usedSkillNames,
  workActivityKey,
} from "@/lib/work-activity";

describe("activityFromGatewayEvent", () => {
  it("turns tool events into label-only activity rows", () => {
    const row = activityFromGatewayEvent(
      "tool.start",
      { name: "web_extract", context: "https://example.com with extra context" },
      123,
    );

    expect(row).toMatchObject({
      kind: "tool",
      title: "Nutze web_extract",
      status: "running",
      timestamp: 123,
    });
    expect(row).not.toHaveProperty("detail");

    expect(
      activityFromGatewayEvent(
        "tool.start",
        { name: "/Users/semih/secret.txt", context: "private" },
        124,
      ),
    ).toMatchObject({ title: "Nutze tool", status: "running" });
  });

  it("summarizes completed tools without exposing summaries", () => {
    const row = activityFromGatewayEvent(
      "tool.complete",
      { name: "terminal", summary: "Finished command", duration_s: 1.234 },
      456,
    );

    expect(row).toMatchObject({
      kind: "tool",
      title: "terminal fertig · 1.2s",
      status: "done",
    });
    expect(row).not.toHaveProperty("detail");
  });

  it("maps explicit tool progress without exposing its text", () => {
    const row = activityFromGatewayEvent(
      "tool.progress",
      { tool_id: "42", tool_name: "terminal", text: "secret output" },
      12,
    );

    expect(row).toMatchObject({ title: "terminal läuft", status: "running" });
    expect(row).not.toHaveProperty("detail");
  });

  it("shows the concrete skill name without exposing file paths", () => {
    expect(
      activityFromGatewayEvent(
        "tool.start",
        { name: "skill_view", context: "Reading skill hermes-dashboard-native-ui" },
        10,
      ),
    ).toMatchObject({
      kind: "skill",
      title: "Lade Skill: hermes-dashboard-native-ui",
      status: "running",
    });

    const completed = activityFromGatewayEvent(
      "tool.complete",
      {
        name: "skill_view",
        args: { name: "hermes-agent", file_path: "references/native-mcp.md" },
      },
      11,
    );
    expect(completed).toMatchObject({
      kind: "skill",
      title: "Skill: hermes-agent",
      status: "done",
    });
    expect(completed).not.toHaveProperty("detail");

    const startedWithReference = activityFromGatewayEvent(
      "tool.start",
      {
        name: "skill_view",
        context: "Reading skill hermes-agent → references/native-mcp.md",
      },
      12,
    );
    expect(startedWithReference).toMatchObject({
      skillName: "hermes-agent",
      title: "Lade Skill: hermes-agent",
    });
    expect(startedWithReference?.title).not.toContain("references/");

    expect(
      activityFromGatewayEvent(
        "tool.complete",
        { name: "skill_view", args: { name: "../../secrets" } },
        13,
      ),
    ).toMatchObject({ title: "Skill geladen", status: "done" });
  });

  it("keeps used skill names visible once and in usage order", () => {
    const rows = [
      activityFromGatewayEvent(
        "tool.complete",
        { name: "skill_view", args: { name: "test-driven-development" } },
        3,
      ),
      activityFromGatewayEvent(
        "tool.complete",
        { name: "skill_view", args: { name: "hermes-agent", file_path: "references/native-mcp.md" } },
        2,
      ),
      activityFromGatewayEvent(
        "tool.complete",
        { name: "skill_view", args: { name: "hermes-agent" } },
        1,
      ),
    ].filter((row) => row !== null);

    expect(usedSkillNames(rows)).toEqual(["hermes-agent", "test-driven-development"]);
  });

  it("maps commentary to a separate activity row", () => {
    expect(
      activityFromGatewayEvent("message.commentary", { text: "Ich prüfe das Repository." }, 4),
    ).toMatchObject({
      kind: "status",
      title: "Ich prüfe das Repository.",
      status: "info",
      timestamp: 4,
    });
  });

  it("maps status, reasoning, and errors to labels only", () => {
    const status = activityFromGatewayEvent(
      "status.update",
      { kind: "compacting", text: "Summarizing secret context" },
      1,
    );
    expect(status).toMatchObject({ title: "Compacting", status: "info" });
    expect(status).not.toHaveProperty("detail");

    const reasoning = activityFromGatewayEvent(
      "reasoning.available",
      { text: "private chain of thought" },
      2,
    );
    expect(reasoning).toMatchObject({ title: "Denkt nach", status: "info" });
    expect(reasoning).not.toHaveProperty("detail");

    const error = activityFromGatewayEvent("error", { message: "boom" }, 3);
    expect(error).toMatchObject({ kind: "error", title: "Fehler", status: "error" });
    expect(error).not.toHaveProperty("detail");
  });

  it("uses stable tool ids when present", () => {
    expect(workActivityKey("tool.start", { tool_id: "abc" }, 99)).toBe("tool.start:abc:99");
  });

  it("falls back to a generated key otherwise", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    expect(workActivityKey("status.update", {}, 99)).toBe("status.update:99:i");
  });
});
