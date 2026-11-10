import { ModelError } from "@/lib/errors";
import { log } from "@/lib/log";
import { containsUrl, type LearningModel, type WithInfo } from "./model-adapter";

/**
 * Tries the primary provider, and on a provider failure (timeout, outage,
 * unusable output after its own repair attempt) runs the same operation on
 * the secondary provider. Validation is identical on both paths, and the
 * stored model info records which provider actually served the call.
 *
 * Calls whose learner text contains links that haven't been read yet go to a
 * provider that can fetch pages (Anthropic's server-side web fetch) first.
 */
export class FallbackLearningModel implements LearningModel {
  readonly provider: string;
  constructor(
    private primary: LearningModel,
    private secondary: LearningModel,
  ) {
    this.provider = `${primary.provider}+${secondary.provider}`;
  }

  private async run<T>(op: string, call: (m: LearningModel) => Promise<WithInfo<T>>, needsWebFetch = false): Promise<WithInfo<T>> {
    const swap = needsWebFetch && this.primary.provider !== "anthropic" && this.secondary.provider === "anthropic";
    const [first, second] = swap ? [this.secondary, this.primary] : [this.primary, this.secondary];
    try {
      return await call(first);
    } catch (err) {
      if (!(err instanceof ModelError)) throw err;
      log.warn("model_provider_fallback", { op, from: first.provider, to: second.provider, code: err.code });
      return call(second);
    }
  }

  clarifyCourse(i: Parameters<LearningModel["clarifyCourse"]>[0]) {
    return this.run("clarify", (m) => m.clarifyCourse(i), !i.linkContext && containsUrl(i.topic, ...i.answers.map((a) => a.answer)));
  }
  compileCurriculum(i: Parameters<LearningModel["compileCurriculum"]>[0]) {
    return this.run("compile", (m) => m.compileCurriculum(i), !i.linkContext && containsUrl(i.topic, i.goalText, i.baseline, i.adjustment));
  }
  expandCurriculum(i: Parameters<LearningModel["expandCurriculum"]>[0]) {
    return this.run("expand", (m) => m.expandCurriculum(i), containsUrl(i.request));
  }
  generateActivity(i: Parameters<LearningModel["generateActivity"]>[0]) {
    return this.run("activity", (m) => m.generateActivity(i), !!i.webGrounding && i.kind === "explanation");
  }
  evaluateAnswer(i: Parameters<LearningModel["evaluateAnswer"]>[0]) {
    return this.run("evaluate", (m) => m.evaluateAnswer(i));
  }
  explainDifferently(i: Parameters<LearningModel["explainDifferently"]>[0]) {
    return this.run("explain", (m) => m.explainDifferently(i));
  }
  hint(i: Parameters<LearningModel["hint"]>[0]) {
    return this.run("hint", (m) => m.hint(i));
  }
}
