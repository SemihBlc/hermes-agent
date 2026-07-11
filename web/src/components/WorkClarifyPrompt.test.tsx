import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { WorkClarifyPrompt } from "./WorkClarifyPrompt";

describe("WorkClarifyPrompt", () => {
  it("renders a gateway clarify question with its choices and response controls", () => {
    const html = renderToStaticMarkup(
      <WorkClarifyPrompt
        request={{
          requestId: "clarify-42",
          question: "Welcher Zeitraum?",
          choices: ["07:00–08:00", "08:00–09:00"],
        }}
        submitting={false}
        onRespond={vi.fn()}
      />,
    );

    expect(html).toContain("Welcher Zeitraum?");
    expect(html).toContain("07:00–08:00");
    expect(html).toContain("08:00–09:00");
    expect(html).toContain("Andere Antwort");
    expect(html).toContain("Überspringen");
    expect(html).toContain("Weiter");
  });
});
