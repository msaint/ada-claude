// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActivityView } from "@/components/lesson/activity-renderer";
import { FeedbackPanel } from "@/components/lesson/feedback";
import { Markdown } from "@/components/ui/markdown";

afterEach(cleanup);

const mc = { id: "a1", kind: "multiple_choice" as const, purpose: "check", conceptTitle: "C", promptMarkdown: "Which **one**?", choices: [{ id: "a", text: "Alpha" }, { id: "b", text: "Beta" }, { id: "c", text: "Gamma" }], difficulty: 1 };

describe("ActivityView", () => {
  it("renders multiple choice as an accessible radio group and reports the choice", async () => {
    const onChoice = vi.fn();
    render(<ActivityView activity={mc} onChoice={onChoice} text="" onText={() => {}} onSubmitShortcut={() => {}} disabled={false} feedback={null} altExplanations={[]} hints={[]} />);
    const group = screen.getByRole("radiogroup", { name: /Which one\?/ });
    expect(group).toBeTruthy();
    await userEvent.click(screen.getByRole("radio", { name: "Beta" }));
    expect(onChoice).toHaveBeenCalledWith("b");
  });

  it("Enter submits a free response, Shift+Enter does not", async () => {
    const submit = vi.fn();
    const fr = { id: "f1", kind: "free_response" as const, purpose: "apply", conceptTitle: "C", promptMarkdown: "Explain", difficulty: 2 };
    render(<ActivityView activity={fr} onChoice={() => {}} text="hi" onText={() => {}} onSubmitShortcut={submit} disabled={false} feedback={null} altExplanations={[]} hints={[]} />);
    const box = screen.getByLabelText("Your answer");
    box.focus();
    await userEvent.keyboard("{Shift>}{Enter}{/Shift}");
    expect(submit).not.toHaveBeenCalled();
    await userEvent.keyboard("{Enter}");
    expect(submit).toHaveBeenCalledTimes(1);
  });
});

describe("FeedbackPanel", () => {
  it("labels assisted answers and lists criteria", () => {
    render(
      <FeedbackPanel
        activityKind="free_response"
        feedback={{ status: "graded", result: "partial", independence: "assisted", feedbackMarkdown: "Close.", criteria: [{ criterion: "Names the cause", met: "partly", reason: "vague" }], exampleAnswer: "Because…" }}
      />,
    );
    expect(screen.getByText("Partly there")).toBeTruthy();
    expect(screen.getByText("(with help)")).toBeTruthy();
    expect(screen.getByText(/Names the cause/)).toBeTruthy();
  });
});

describe("Markdown", () => {
  it("drops raw HTML, scripts, images and javascript: links", () => {
    const { container } = render(<Markdown>{'Hi <script>alert(1)</script> <img src=x onerror=alert(1)> ![x](http://e.com/a.png) [bad](javascript:alert(1)) [ok](https://example.com)'}</Markdown>);
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    const links = [...container.querySelectorAll("a")];
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["https://example.com"]);
    expect(links[0].getAttribute("rel")).toContain("noopener");
  });
});
