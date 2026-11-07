import { ModelError } from "@/lib/errors";
import { log } from "@/lib/log";
import type { LearningModel, WithInfo } from "./model-adapter";

/**
 * Tries the primary provider, and on a provider failure (timeout, outage,
 * unusable output after its own repair attempt) runs the same operation on
 * the secondary provider. Validation is identical on both paths, and the
 * stored model info records which provider actually served the call.
 */
export class FallbackLearningModel implements LearningModel {
  readonly provider: string;
  constructor(
    private primary: LearningModel,
    private secondary: LearningModel,
  ) {
    this.provider = `${primary.provider}+${secondary.provider}`;
  }

  private async run<T>(op: string, call: (m: LearningModel) => Promise<WithInfo<T>>): Promise<WithInfo<T>> {
    try {
      return await call(this.primary);
    } catch (err) {
      if (!(err instanceof ModelError)) throw err;
      log.warn("model_provider_fallback", { op, from: this.primary.provider, to: this.secondary.provider, code: err.code });
      return call(this.secondary);
    }
  }

  clarifyCourse(i: Parameters<LearningModel["clarifyCourse"]>[0]) {
    return this.run("clarify", (m) => m.clarifyCourse(i));
  }
  compileCurriculum(i: Parameters<LearningModel["compileCurriculum"]>[0]) {
    return this.run("compile", (m) => m.compileCurriculum(i));
  }
  expandCurriculum(i: Parameters<LearningModel["expandCurriculum"]>[0]) {
    return this.run("expand", (m) => m.expandCurriculum(i));
  }
  generateActivity(i: Parameters<LearningModel["generateActivity"]>[0]) {
    return this.run("activity", (m) => m.generateActivity(i));
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
