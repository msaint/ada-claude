# Model evaluation

Ada's automated tests use a deterministic stand-in model, so they say nothing about the quality of what a real model writes. This evaluation does: it sends fixed inputs through Ada's real prompts and a real provider, and scores the results.

```bash
NODE_USE_ENV_PROXY=1 OPENAI_API_KEY=placeholder npm run eval:model -- --provider openai --reps 3
```

(In a Claude cloud session the proxy injects the real key; `NODE_USE_ENV_PROXY=1` makes Node use the proxy. Elsewhere, set a real key and drop that variable.) A full run is 170 gradings/topics, takes about 3 minutes and cost about $0.52 on 2026-11-10 with the default OpenAI models. To run it for Claude, use the `Model evaluation` workflow in GitHub Actions.

Output goes to `evals/runs/<run>/` (not committed): `report.md` to read, `results.jsonl` with every output, `summary.json` with the numbers. Re-running with the same `--run` name resumes instead of repeating finished cases. Reference runs are kept in `evals/baselines/`.

## Part 1: grading fairness

`grading-cases.json`: 12 questions across subjects, each with 4–6 learner answers (50 in total) labelled by hand as correct, partial or incorrect. They include correct answers with bad spelling or written in Spanish, vague answers, common misconceptions, long confident wrong answers, "I don't know", and three answers that try to instruct the grader. Each goes through Ada's real grader and the verdict is compared with the label. No judge model is involved.

The number to watch is **wrong or incomplete answers marked correct**, because that is what would let a learner "master" something they don't understand. Next is correct answers marked incorrect.

Where a label is genuinely debatable, the case lists two acceptable verdicts. `--reps 3` grades every answer three times, which shows how much the grader's verdict varies from one try to the next.

## Part 2: generated content

`topics.json`: 20 course requests (curiosity and goal, technical and not, legal, medical and financial ones, a time-sensitive one, a vague one). For each, Ada reads the request as if the learner pressed "start now", plans the course, and writes a multiple-choice question, an explanation and an open question for the first concept. A second model (the judge) then checks:

- **Multiple choice:** the judge answers the question without seeing Ada's answer key. A mismatch means the key or the question is probably wrong. It also lists any other defensible choice.
- **Explanation:** the judge lists factually wrong statements, as major or minor.
- **Open question:** is it clear, is the private reference answer right, does the rubric fit.
- **Course plan:** does it serve the goal, in a workable order.

Two checks need no judge: whether "start now" was honoured, and whether the right choice is given away by being much longer than the others.

## How far to trust it

- Part 1 labels were written by one person and have not been independently reviewed. Skim `grading-cases.json`; if you'd label an answer differently, change it.
- Part 2's judge is itself a model and makes mistakes in both directions. Treat a flagged item as "worth reading", not as proof, and a clean result as "nothing obvious". The report prints every item so you can check. By default the judge is `gpt-4.1`, which also writes Ada's course plans with the default settings, so plan scores are the least independent.
- 20 topics is a small sample: one item is 5 points, and the intervals in the report are wide. It will catch large problems and large improvements, not small ones.
- Only the first concept of each course is checked, and only one question of each kind. Hints, follow-up questions, re-explanations, reviews and plan revisions are not covered yet.
- Part 1 can be over-fitted: the grading instructions were adjusted once using these same 50 answers (see D22 in `DECISIONS.md`). New labelled answers would be a fairer test of that change.
