import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { AnthropicTransport, finalText, fetchedSources } from "@/lib/ai/anthropic-model";
import { LLMLearningModel, type JsonTransport, type TransportRequest } from "@/lib/ai/openai-model";
import { FallbackLearningModel } from "@/lib/ai/fallback-model";
import { MockLearningModel } from "@/lib/ai/mock-model";
import { containsUrl, type LearningModel } from "@/lib/ai/model-adapter";

process.env.ADA_SILENT_LOGS = "true";

const JOB = "https://job-boards.greenhouse.io/anthropic/jobs/5096878008";
const SITE = "https://www.marcstraymond.com/";
const topic = `I want to fill any knowledge gaps to earn this role: ${JOB} Here is my experience: ${SITE}`;

const ask = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({ status: "ask", question: "How many hours a week can you study?", quick_replies: ["2", "5"], field: "time_budget", reason_code: "budget", link_context: "Role needs X and Y; learner has Z.", ...extra });

type Block = Anthropic.Beta.BetaContentBlock;
const fetchResult = (url: string, title: string): Block =>
  ({ type: "web_fetch_tool_result", tool_use_id: "t1", content: { type: "web_fetch_result", url, retrieved_at: "2026-11-08T00:00:00Z", content: { type: "document", title, source: { type: "text", media_type: "text/plain", data: "..." } } } }) as unknown as Block;
const text = (t: string): Block => ({ type: "text", text: t, citations: null }) as unknown as Block;
const toolUse: Block = { type: "server_tool_use", id: "t1", name: "web_fetch", input: { url: JOB } } as unknown as Block;

function fakeClient(responses: { content: Block[]; stop_reason: string }[]) {
  const calls: Record<string, unknown>[] = [];
  const client = {
    beta: {
      messages: {
        create: (async (body: Record<string, unknown>) => {
          calls.push(JSON.parse(JSON.stringify(body)));
          const r = responses.shift()!;
          return { ...r, usage: { input_tokens: 10, output_tokens: 5 }, stop_details: null };
        }) as unknown as Anthropic["beta"]["messages"]["create"],
      },
    },
  };
  return { client, calls };
}

const req = (webFetch: boolean): TransportRequest => ({ model: "claude-opus-5-5", system: "s", user: topic, maxTokens: 1000, timeoutMs: 1000, webFetch });

describe("Anthropic web fetch transport", () => {
  it("declares the server-side web_fetch tool only when asked", async () => {
    const { client, calls } = fakeClient([{ content: [text(ask())], stop_reason: "end_turn" }, { content: [text(ask())], stop_reason: "end_turn" }]);
    const t = new AnthropicTransport("k", { client });
    await t.complete(req(false));
    await t.complete(req(true));
    expect(calls[0].tools).toBeUndefined();
    expect(calls[1].tools).toEqual([{ type: "web_fetch_20260209", name: "web_fetch", max_uses: 3, max_content_tokens: 12000 }]);
  });

  it("returns only the text after the last tool block, and the pages actually fetched", async () => {
    const { client } = fakeClient([
      { content: [text("Let me read the posting."), toolUse, fetchResult(JOB, "Research Engineer"), text(ask())], stop_reason: "end_turn" },
    ]);
    const r = await new AnthropicTransport("k", { client }).complete(req(true));
    expect(JSON.parse(r.text).status).toBe("ask");
    expect(r.sources).toEqual([{ url: JOB, title: "Research Engineer", retrievedAt: "2026-11-08T00:00:00Z" }]);
  });

  it("resumes a paused server-tool turn by re-sending the assistant content", async () => {
    const paused = [text("Reading…"), toolUse, fetchResult(JOB, "Job")];
    const { client, calls } = fakeClient([
      { content: paused, stop_reason: "pause_turn" },
      { content: [fetchResult(SITE, "Marc"), text(ask())], stop_reason: "end_turn" },
    ]);
    const r = await new AnthropicTransport("k", { client }).complete(req(true));
    expect(calls).toHaveLength(2);
    const msgs = calls[1].messages as { role: string }[];
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant"]); // no extra "continue" user turn
    expect(r.sources!.map((s) => s.url)).toEqual([JOB, SITE]);
    expect(JSON.parse(r.text).status).toBe("ask");
  });

  it("skips fetch errors when recording sources", () => {
    const err = { type: "web_fetch_tool_result", tool_use_id: "t", content: { type: "web_fetch_tool_result_error", error_code: "url_not_accessible" } } as unknown as Block;
    expect(fetchedSources([err])).toEqual([]);
    expect(finalText([text("a"), err, text("b")])).toBe("b");
  });
});

class Recorder implements JsonTransport {
  readonly calls: TransportRequest[] = [];
  constructor(
    readonly supportsWebFetch: boolean,
    private out = ask(),
  ) {}
  async complete(r: TransportRequest) {
    this.calls.push(r);
    return { text: this.out, sources: r.webFetch ? [{ url: JOB, title: "Job", retrievedAt: null }] : [] };
  }
}
const models = { clarify: "c", compile: "c", tutor: "t", evaluate: "e" };
const clarifyCtx = { topic, answers: [], askedFields: [], questionsAsked: 0, maxQuestions: 4, startNow: false, linkContext: null };

describe("adapter web fetch decisions", () => {
  it("enables fetch for links not yet summarized, and reports sources", async () => {
    const t = new Recorder(true);
    const r = await new LLMLearningModel(t, models, { timeoutMs: 10, provider: "anthropic" }).clarifyCourse(clarifyCtx);
    expect(t.calls[0].webFetch).toBe(true);
    expect(t.calls[0].user).toContain("web_fetch tool is available");
    expect(r.info.sources).toHaveLength(1);
    expect(r.value.status === "ask" && r.value.link_context).toContain("Role needs");
  });
  it("doesn't fetch without links, after a summary exists, or on providers without a fetch tool", async () => {
    const a = new Recorder(true);
    await new LLMLearningModel(a, models, { timeoutMs: 10 }).clarifyCourse({ ...clarifyCtx, topic: "Black holes" });
    const b = new Recorder(true);
    await new LLMLearningModel(b, models, { timeoutMs: 10 }).clarifyCourse({ ...clarifyCtx, linkContext: "already read" });
    const c = new Recorder(false);
    await new LLMLearningModel(c, models, { timeoutMs: 10 }).clarifyCourse(clarifyCtx);
    for (const t of [a, b, c]) {
      expect(t.calls[0].webFetch).toBe(false);
      expect(t.calls[0].user).not.toContain("web_fetch tool is available");
    }
    expect(b.calls[0].user).toContain("already read");
  });
  it("detects links", () => {
    expect(containsUrl("see https://example.com/x")).toBe(true);
    expect(containsUrl("no links here", null)).toBe(false);
  });
});

describe("routing calls with links to the provider that can fetch", () => {
  const named = (provider: string, seen: string[]): LearningModel => {
    const m = new MockLearningModel();
    return new Proxy(m, {
      get: (target, k) => {
        if (k === "provider") return provider;
        const v = (target as unknown as Record<string | symbol, unknown>)[k];
        return typeof v === "function" ? (...args: unknown[]) => (seen.push(provider), (v as (...a: unknown[]) => unknown).apply(target, args)) : v;
      },
    });
  };
  it("tries Anthropic first for unread links even when OpenAI is primary", async () => {
    const seen: string[] = [];
    const m = new FallbackLearningModel(named("openai", seen), named("anthropic", seen));
    await m.clarifyCourse(clarifyCtx);
    await m.clarifyCourse({ ...clarifyCtx, topic: "Black holes" });
    await m.clarifyCourse({ ...clarifyCtx, linkContext: "read already" });
    expect(seen).toEqual(["anthropic", "openai", "openai"]);
  });
});

import { searchSources } from "@/lib/ai/anthropic-model";
import { lessonLimits } from "@/lib/learning/next-action";

describe("web search for explanations", () => {
  const result = (items: { url: string; title: string }[]): Block => ({ type: "web_search_tool_result", tool_use_id: "s1", content: items.map((x) => ({ type: "web_search_result", encrypted_content: "", page_age: null, ...x })) }) as unknown as Block;
  const cited = (t: string, url: string): Block => ({ type: "text", text: t, citations: [{ type: "web_search_result_location", url, title: "Cited page", cited_text: "", encrypted_index: "" }] }) as unknown as Block;
  const explanation = JSON.stringify({ kind: "explanation", bodyMarkdown: "Tides come from gravity." });

  it("declares the search tool only when asked, and takes the JSON after the search blocks", async () => {
    const { client, calls } = fakeClient([{ content: [text("Checking."), result([{ url: "https://a.example/1", title: "A" }]), text(explanation)], stop_reason: "end_turn" }]);
    const r = await new AnthropicTransport("k", { client }).complete({ ...req(false), webSearch: true });
    expect(calls[0].tools).toEqual([{ type: "web_search_20260209", name: "web_search", max_uses: 2 }]);
    expect(JSON.parse(r.text).kind).toBe("explanation");
    expect(r.sources).toEqual([{ url: "https://a.example/1", title: "A", retrievedAt: null }]);
  });
  it("prefers cited pages over raw results, caps the list, and ignores non-http URLs and errors", () => {
    const many = result(Array.from({ length: 9 }, (_, i) => ({ url: `https://r.example/${i}`, title: `R${i}` })));
    expect(searchSources([many])).toHaveLength(4);
    expect(searchSources([many, cited("x", "https://cited.example/p")]).map((s) => s.url)).toEqual(["https://cited.example/p"]);
    const err = { type: "web_search_tool_result", tool_use_id: "s", content: { type: "web_search_tool_result_error", error_code: "unavailable" } } as unknown as Block;
    expect(searchSources([err, result([{ url: "javascript:alert(1)", title: "bad" }])])).toEqual([]);
  });
  it("the adapter searches only for explanations with grounding on, and routes them to Anthropic", async () => {
    const t = new Recorder(true, explanation);
    (t as unknown as { supportsWebSearch: boolean }).supportsWebSearch = true;
    const m = new LLMLearningModel(t, models, { timeoutMs: 10, provider: "anthropic" });
    const concept = { slug: "x", title: "X", description: "", assessmentCriteria: ["c"], prerequisites: [] };
    const base = { topic: "t", intent: "curiosity" as const, goalText: "g", baseline: "", timeBudgetMinutesWeekly: null, concept, purpose: "teach" as const, difficulty: 1 as const, recentEvidence: [], misconceptions: [], priorPrompts: [], assistanceUsed: 0 };
    await m.generateActivity({ ...base, kind: "explanation", webGrounding: true });
    await m.generateActivity({ ...base, kind: "explanation" });
    expect(t.calls.map((c) => !!c.webSearch)).toEqual([true, false]);
    expect(t.calls[0].user).toContain("web_search tool is available");
    expect(t.calls[1].user).not.toContain("web_search tool is available");
  });
});

describe("lesson length", () => {
  it("scales with weekly time and depth", () => {
    expect(lessonLimits(null, "standard").lesson).toBe(8);
    expect(lessonLimits(15, "standard").lesson).toBe(5);
    expect(lessonLimits(60, "standard").lesson).toBe(8);
    expect(lessonLimits(180, "deep").lesson).toBe(10);
    expect(lessonLimits(180, "quick").lesson).toBe(5);
  });
});
