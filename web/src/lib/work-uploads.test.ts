import { describe, expect, it } from "vitest";

import {
  appendComposerText,
  fallbackUploadFileName,
  formatUploadSize,
  managedUploadRoot,
  safeUploadFileName,
  workUploadPrompt,
  workUploadTargetPath,
  type WorkUploadAttachment,
} from "@/lib/work-uploads";

describe("work upload helpers", () => {
  it("sanitizes filenames for Hermes-local upload paths", () => {
    expect(safeUploadFileName("Bildschirmfoto 2026-07-09 um 12:34:56.png")).toBe(
      "Bildschirmfoto-2026-07-09-um-12-34-56.png",
    );
    expect(safeUploadFileName("ä/../evil file?.pdf")).toBe("evil-file-.pdf");
  });

  it("builds stable upload target paths", () => {
    const now = new Date("2026-07-09T12:34:56.789Z");
    const path = workUploadTargetPath({ name: "screen shot.png", type: "image/png" }, 0, 7, now);
    expect(path).toBe(
      "~/.hermes/web-uploads/2026-07-09/2026-07-09T12-34-56-789Z-7-1-screen-shot.png",
    );
  });

  it("uses relative paths when the Files API locks uploads to a managed root", () => {
    expect(managedUploadRoot("/opt/data")).toBe("web-uploads");
    expect(managedUploadRoot(null)).toBe("~/.hermes/web-uploads");
    const now = new Date("2026-07-09T12:34:56.789Z");
    expect(
      workUploadTargetPath(
        { name: "screen.png", type: "image/png" },
        0,
        1,
        now,
        managedUploadRoot("/opt/data"),
      ),
    ).toBe("web-uploads/2026-07-09/2026-07-09T12-34-56-789Z-1-1-screen.png");
  });

  it("creates useful names for pasted clipboard images", () => {
    expect(fallbackUploadFileName({ name: "", type: "image/png" }, 1)).toBe("clipboard-image-2.png");
    expect(fallbackUploadFileName({ name: "", type: "application/pdf" }, 0)).toBe("upload-1");
  });

  it("formats upload sizes", () => {
    expect(formatUploadSize(42)).toBe("42 B");
    expect(formatUploadSize(2048)).toBe("2.0 KB");
    expect(formatUploadSize(2 * 1024 * 1024)).toBe("2.0 MB");
  });

  it("combines user text with local attachment paths and tool hints", () => {
    const attachments: WorkUploadAttachment[] = [
      {
        id: "a",
        name: "screen.png",
        path: "/Users/semih/.hermes/web-uploads/screen.png",
        mimeType: "image/png",
        size: 1024,
      },
    ];

    const prompt = workUploadPrompt(attachments, "Was ist hier der nächste Schritt?");

    expect(prompt).toContain("Was ist hier der nächste Schritt?");
    expect(prompt).toContain("screen.png (image/png, 1.0 KB) unter /Users/semih/.hermes/web-uploads/screen.png");
    expect(prompt).toContain("vision_analyze");
  });

  it("appends dropped text snippets without crushing the existing draft", () => {
    expect(appendComposerText("Schon da", "Neu")).toBe("Schon da\n\nNeu");
    expect(appendComposerText("", "Neu")).toBe("Neu");
  });
});
