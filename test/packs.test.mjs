import test from "node:test";
import assert from "node:assert/strict";

import * as reviewFindings from "../packs/review-findings.mjs";
import * as humanizer from "../packs/humanizer.mjs";
import * as replyCheck from "../packs/reply-check.mjs";
import * as simplifyGate from "../packs/simplify-gate.mjs";
import * as grillingFrontier from "../packs/grilling-frontier.mjs";
import { packs, getPack } from "../packs/registry.mjs";

const PACK_STATES = {
  "review-findings": { findings: [{ axis: "standards", claim: "c", evidence: "e" }], diff: "d", standards: "s" },
  humanizer: { locale: "en-US", context: "c", passages: ["p"] },
  "reply-check": { request: "r", draft: "d", banned: [] },
  "simplify-gate": { before: "a", after: "b", contract: "c" },
  "grilling-frontier": { questions: [{ id: "q1", text: "t" }], settled: [], context: "c" },
};

test("every registered pack answers to its own name and survives a judgment-free run", () => {
  assert.deepEqual(Object.keys(packs).sort(), Object.keys(PACK_STATES).sort());
  for (const [name, state] of Object.entries(PACK_STATES)) {
    const pack = getPack(name);
    assert.equal(pack.name, name);
    const questions = pack.buildQuestions(state, {});
    assert.ok(Object.keys(questions).length > 0, `${name} must ask something`);
    const result = pack.decide({ answers: null, degraded: true, reason: "missing_api_key" }, state, {});
    assert.equal(typeof pack.render(result, state), "string");
  }
  assert.equal(getPack("no-such-pack"), null);
});

test("every registered pack validates its own state shape, and accepts a well-formed one", () => {
  for (const [name, state] of Object.entries(PACK_STATES)) {
    const pack = getPack(name);
    assert.equal(typeof pack.validateState, "function", `${name} must gate its state`);
    assert.equal(pack.validateState(state), null, `${name} must accept its own example state`);
    assert.match(pack.validateState({}), /^State requires /, `${name} must reject an empty state`);
  }
});

/** Mock response: every question answered with `value`, or per-id overrides. */
function answerAll(questions, value, overrides = {}) {
  const answers = Object.fromEntries(
    Object.keys(questions).map((id) => [id, { type: "noul", noul: value }]),
  );
  for (const [id, noul] of Object.entries(overrides)) answers[id] = { type: "noul", noul };
  return { answers };
}

/** Mock choice answer: a full distribution over the labels that were offered. */
function choiceAnswer(labels, picked, confidence) {
  return {
    type: "choice",
    choice: picked,
    confidence,
    probabilities: Object.fromEntries(labels.map((label) => [label, 1 / labels.length])),
  };
}

const DEGRADED = { answers: null, degraded: "TYPESAFE_API_KEY is not set" };

const reviewState = {
  findings: [
    { axis: "spec", file: "src/a.mjs", line: 12, claim: "Does not emit the required event", evidence: "spec §3" },
    { axis: "standards", file: "src/b.mjs", line: 4, claim: "Uses var", evidence: "line 4: var x = 1" },
    { axis: "spec", file: "src/c.mjs", line: 99, claim: "Timeout is hard-coded", evidence: "" },
  ],
  diff: [
    "--- a/src/b.mjs",
    "+++ b/src/b.mjs",
    "@@ -1,3 +4,3 @@",
    " const y = 0",
    "-let x = 1",
    "+var x = 1",
    " export default x",
    "",
  ].join("\n"),
  standards: "Use const or let. Never var.",
  spec: "The handler must emit `done` after flushing.",
};

test("review-findings keeps every finding, its order, and its axis", () => {
  const questions = reviewFindings.buildQuestions(reviewState, {});
  const responses = [
    answerAll(questions, 0.01), // everything reads unsupported
    answerAll(questions, 0.99),
    { answers: {} }, // answered request, no usable answers
    DEGRADED,
  ];

  for (const response of responses) {
    const result = reviewFindings.decide(response, reviewState, {});
    assert.equal(result.findings.length, reviewState.findings.length);
    assert.deepEqual(
      result.findings.map((f) => f.claim),
      reviewState.findings.map((f) => f.claim),
    );
    assert.deepEqual(result.axes, ["spec", "standards", "spec"]);
    assert.equal(result.droppedFindings, 0);

    const rendered = reviewFindings.render(result, reviewState);
    for (const finding of reviewState.findings) {
      assert.ok(rendered.includes(finding.claim), `render must show "${finding.claim}"`);
    }
  }
});

test("review-findings reports unknown, not a value, when answers are missing", () => {
  const result = reviewFindings.decide(DEGRADED, reviewState, {});
  assert.equal(result.judgmentsAvailable, false);
  assert.ok(result.degraded);
  for (const finding of result.findings) {
    assert.deepEqual(Object.values(finding.signals), [null, null, null]);
    assert.equal(finding.attention, "unknown");
  }
  assert.match(reviewFindings.render(result, reviewState), /unavailable/i);
});

test("review-findings treats malformed or out-of-range probabilities as unknown", () => {
  const questions = reviewFindings.buildQuestions(reviewState, {});
  const ids = Object.keys(questions);
  const result = reviewFindings.decide(
    {
      answers: {
        [ids[0]]: { type: "noul", noul: 1.4 },
        [ids[1]]: { type: "noul", noul: Number.NaN },
        [ids[2]]: { type: "noul" },
        [ids[3]]: { type: "choice", choice: "yes", noul: 0.9 },
      },
    },
    reviewState,
    {},
  );
  assert.deepEqual(Object.values(result.findings[0].signals), [null, null, null]);
  assert.deepEqual(Object.values(result.findings[1].signals), [null, null, null]);
});

test("review-findings reports unknown test coverage when no contextTests is supplied", () => {
  const questions = reviewFindings.buildQuestions(reviewState, {});
  assert.ok(
    !Object.keys(questions).some((id) => id.endsWith("covered_by_tests")),
    "nothing to compare against, so nothing is asked",
  );

  const result = reviewFindings.decide(answerAll(questions, 0.9), reviewState, {});
  assert.equal(result.testContextSupplied, false);
  for (const finding of result.findings) {
    assert.equal(finding.testCoverage.status, "unknown");
    assert.equal(finding.testCoverage.probability, null);
  }
  const rendered = reviewFindings.render(result, reviewState);
  assert.ok(!/gap/i.test(rendered), "absent test context must never be reported as a test gap");

});

test("review-findings compares against contextTests when it is supplied", () => {
  const state = { ...reviewState, contextTests: "test('emits done', ...) // unchanged, still relevant" };
  const questions = reviewFindings.buildQuestions(state, {});
  const coverageIds = Object.keys(questions).filter((id) => id.endsWith("covered_by_tests"));
  assert.equal(coverageIds.length, state.findings.length);

  const result = reviewFindings.decide(
    answerAll(questions, 0.5, { finding_0_covered_by_tests: 0.9, finding_1_covered_by_tests: 0.05 }),
    state,
    {},
  );
  assert.equal(result.findings[0].testCoverage.probability, 0.9);
  assert.match(result.findings[1].testCoverage.status, /may lack a covering test/);
  assert.match(
    reviewFindings.render(result, state),
    /test coverage: may lack a covering test 5% \(leans no\)/,
  );
  assert.equal(result.findingCount, state.findings.length);
});

const candidateState = {
  ...reviewState,
  findings: reviewState.findings.map((finding, index) => ({
    ...finding,
    candidates: [
      { id: `h${index}a`, excerpt: "var x = 1", file: finding.file, line: finding.line },
      { id: `h${index}b`, excerpt: "return x", file: finding.file, line: finding.line + 3 },
    ],
  })),
};

test("review-findings offers only supplied candidates plus a way to decline", () => {
  const questions = reviewFindings.buildQuestions(candidateState, {});
  candidateState.findings.forEach((finding, index) => {
    const options = Object.keys(questions[`finding_${index}_evidence_location`].criteria);
    assert.deepEqual(options, [...finding.candidates.map((c) => c.id), "noMatch"]);
  });
});

test("review-findings attaches only a supplied candidate, never a generated location", () => {
  const questions = reviewFindings.buildQuestions(candidateState, {});
  const result = reviewFindings.decide(
    {
      answers: {
        finding_0_evidence_location: choiceAnswer(["h0a", "h0b", "noMatch"], "h0b", 0.31),
        finding_1_evidence_location: choiceAnswer(["h1a", "h1b", "noMatch"], "src/invented.mjs:7", 0.99),
      },
    },
    candidateState,
    {},
  );

  const first = result.findings[0].evidenceLocation;
  assert.equal(first.status, "selected");
  assert.deepEqual(first.selected, candidateState.findings[0].candidates[1]);
  // Low confidence is reported, not thresholded: the finding is still whole.
  assert.equal(first.confidence, 0.31);
  assert.equal(result.findings[0].claim, candidateState.findings[0].claim);

  const invented = result.findings[1].evidenceLocation;
  assert.equal(invented.status, "unknown");
  assert.equal(invented.selected, null);
});

test("review-findings reads a half-formed choice answer as unknown, not as a selection", () => {
  const labels = ["h0a", "h0b", "noMatch"];
  const complete = choiceAnswer(labels, "h0a", 0.9);
  const cases = {
    "no confidence": { ...complete, confidence: undefined },
    "no probabilities": { ...complete, probabilities: undefined },
    "a label left unscored": { ...complete, probabilities: { h0a: 0.6, h0b: 0.4 } },
    "not a choice answer": { ...complete, type: "noul" },
  };

  for (const [label, answer] of Object.entries(cases)) {
    const result = reviewFindings.decide(
      { answers: { finding_0_evidence_location: answer } },
      candidateState,
      {},
    );
    const location = result.findings[0].evidenceLocation;
    assert.equal(location.status, "unknown", label);
    assert.equal(location.selected, null, label);
    assert.equal(location.confidence, null, label);
  }

  const selected = reviewFindings.decide(
    { answers: { finding_0_evidence_location: complete } },
    candidateState,
    {},
  );
  assert.equal(selected.findings[0].evidenceLocation.status, "selected");
});

test("review-findings keeps a noMatch finding exactly as written", () => {
  const questions = reviewFindings.buildQuestions(candidateState, {});
  const result = reviewFindings.decide(
    answerAll(questions, 0.02, {}),
    candidateState,
    {},
  );
  const noMatched = reviewFindings.decide(
    {
      answers: {
        finding_0_evidence_location: choiceAnswer(["h0a", "h0b", "noMatch"], "noMatch", 0.88),
        finding_1_evidence_location: choiceAnswer(["h1a", "h1b", "noMatch"], "noMatch", 0.2),
        finding_2_evidence_location: choiceAnswer(["h2a", "h2b", "noMatch"], "noMatch", 0.5),
      },
    },
    candidateState,
    {},
  );

  assert.equal(result.findingCount, candidateState.findings.length);
  assert.equal(noMatched.findings.length, candidateState.findings.length);
  assert.equal(noMatched.droppedFindings, 0);
  assert.deepEqual(
    noMatched.axes,
    candidateState.findings.map((f) => f.axis),
  );
  for (const finding of noMatched.findings) {
    assert.equal(finding.evidenceLocation.status, "noMatch");
    assert.equal(finding.evidenceLocation.selected, null);
  }
  const rendered = reviewFindings.render(noMatched, candidateState);
  for (const finding of candidateState.findings) assert.ok(rendered.includes(finding.claim));
  assert.match(rendered, /the finding stands as written/);
});

test("review-findings never asks whether a finding is inside the diff", () => {
  const asked = JSON.stringify(Object.values(reviewFindings.buildQuestions(candidateState, {})));
  assert.ok(!/`diff`/.test(asked), "diff position is arithmetic, so it is never sent to a model");
});

const diffState = {
  findings: [
    { axis: "spec", file: "src/b.mjs", line: 4, claim: "at the first changed line", evidence: "e" },
    { axis: "spec", file: "src/b.mjs", line: 6, claim: "at the last changed line", evidence: "e" },
    { axis: "spec", file: "src/b.mjs", line: 7, claim: "one line past the hunk", evidence: "e" },
    { axis: "spec", file: "src/b.mjs", claim: "no line at all", evidence: "e" },
    { axis: "standards", file: "src/untouched.mjs", line: 4, claim: "a file the diff never names", evidence: "e" },
  ],
  diff: reviewState.diff,
  standards: "s",
  spec: "p",
};

test("review-findings places each finding against the diff by arithmetic", () => {
  const result = reviewFindings.decide(DEGRADED, diffState, {});
  assert.deepEqual(
    result.findings.map((f) => f.withinDiff.status),
    ["inside", "inside", "outside", "unknown", "outside"],
  );

  const rendered = reviewFindings.render(result, diffState);
  assert.match(rendered, /diff: inside\n/);
  assert.match(rendered, /diff: outside \(line is outside the changed ranges\)/);
  assert.match(rendered, /diff: outside \(`diff` does not change this file\)/);
  assert.match(rendered, /diff: unknown \(finding has no integer `line`\)/);

  // The diff position is a fact, so it — not a probability — settles this note.
  const supported = reviewFindings.decide(
    answerAll(reviewFindings.buildQuestions(diffState, {}), 0.95),
    diffState,
    {},
  );
  assert.equal(supported.findings[0].attention, "evidence reads consistent");
  assert.equal(supported.findings[2].attention, "worth re-reading the evidence");
});

test("review-findings reads an unparseable diff as unknown, not as outside", () => {
  const result = reviewFindings.decide(DEGRADED, { ...diffState, diff: "a prose summary of the change" }, {});
  for (const finding of result.findings) {
    assert.equal(finding.withinDiff.status, "unknown");
  }
});

test("review-findings rejects findings it cannot place or label", () => {
  assert.match(reviewFindings.validateState({ findings: {} }), /`findings` array/);
  assert.match(reviewFindings.validateState({ findings: [null] }), /`findings\[0\]` to be an object/);
  assert.match(reviewFindings.validateState({ findings: [{ axis: "spec" }] }), /`findings\[0\]\.claim`/);
  assert.match(
    reviewFindings.validateState({ findings: [{ axis: "Standards", claim: "c" }] }),
    /`findings\[0\]\.axis`/,
  );
  assert.match(
    reviewFindings.validateState({
      findings: [{ axis: "spec", claim: "c", candidates: [{ id: "h1" }, { id: "h1" }] }],
    }),
    /unique candidate ids/,
  );
  assert.equal(
    reviewFindings.validateState({
      findings: [{ axis: "spec", claim: "c", candidates: [{ id: "h1" }, { excerpt: "no id" }] }],
    }),
    null,
  );
});

const humanizerState = {
  passages: [
    "In today's fast-paced world, logging matters.",
    "The retry budget is three attempts over ten seconds.",
    "Logging, as we noted, matters a great deal.",
  ],
  locale: "en-US",
  context: "Runbook for on-call engineers who already know the service.",
};

test("humanizer never judges authorship and never rewrites", () => {
  const questions = humanizer.buildQuestions(humanizerState, {});


  const result = humanizer.decide(answerAll(questions, 0.9), humanizerState, {});
  assert.equal(result.rewritten, false);
  assert.equal(result.authorshipJudged, false);
  assert.deepEqual(
    result.passages.map((p) => p.text),
    humanizerState.passages,
  );
});

test("humanizer ranks editing attention without reordering the passages", () => {
  const questions = humanizer.buildQuestions(humanizerState, {});
  const result = humanizer.decide(
    answerAll(questions, 0.5, {
      passage_1_carries_information: 0.95,
      passage_1_restates_other_passage: 0.02,
      passage_1_claim_exceeds_context: 0.03,
      passage_1_reads_natural_for_locale: 0.95,
      passage_2_carries_information: 0.05,
      passage_2_restates_other_passage: 0.93,
      passage_2_claim_exceeds_context: 0.2,
      passage_2_reads_natural_for_locale: 0.8,
    }),
    humanizerState,
    {},
  );

  assert.deepEqual(
    result.passages.map((p) => p.index),
    [0, 1, 2],
    "document order is preserved",
  );
  assert.ok(
    result.priorityOrder.indexOf(2) < result.priorityOrder.indexOf(1),
    "the restating passage gets attention before the informative one",
  );
});

test("humanizer leaves partially answered passages unranked", () => {
  const questions = humanizer.buildQuestions(humanizerState, {});
  const answers = answerAll(questions, 0.5).answers;
  delete answers.passage_0_reads_natural_for_locale;
  const result = humanizer.decide({ answers }, humanizerState, {});
  assert.ok(result.unranked.includes(0));
  assert.ok(!result.priorityOrder.includes(0));
});

test("humanizer keeps the text when judgments are unavailable", () => {
  const result = humanizer.decide(DEGRADED, humanizerState, {});
  assert.deepEqual(
    result.passages.map((p) => p.text),
    humanizerState.passages,
  );
  assert.deepEqual(result.priorityOrder, []);
  const rendered = humanizer.render(result, humanizerState);
  assert.match(rendered, /unavailable/i);
  assert.ok(rendered.includes("The retry budget is three attempts over ten seconds."));
});

test("humanizer rejects passages that are not text", () => {
  assert.match(humanizer.validateState({ locale: "en-US", passages: null }), /`passages` array/);
  assert.match(humanizer.validateState({ locale: "en-US", passages: [null] }), /`passages\[0\]` to be a string/);
  assert.match(humanizer.validateState({ passages: ["p"] }), /string `locale`/);
  assert.equal(humanizer.validateState(humanizerState), null);
});

const replyState = {
  draft: "Let's dive into the problem.\nYou should run the tests yourself.\nLet's dive into it again.",
  request: "Fix the flaky test and tell me the root cause.",
  banned: ["Let's dive into", "moreover"],
};

test("reply-check locates watched literals exactly, with or without judgments", () => {
  for (const response of [DEGRADED, { answers: {} }]) {
    const result = replyCheck.decide(response, replyState, {});
    const hit = result.literals.matches.find((m) => m.literal === "Let's dive into");
    assert.equal(hit.count, 2);
    assert.deepEqual(
      hit.occurrences.map((o) => [o.line, o.column]),
      [
        [1, 1],
        [3, 1],
      ],
    );
    assert.ok(!result.literals.matches.some((m) => m.literal === "moreover"));
  }
});

test("a pack that asked nothing reports no judgments, not a clean run", () => {
  const state = { draft: "   ", request: "Fix the flaky test." };
  assert.deepEqual(replyCheck.buildQuestions(state, {}), {}, "an empty draft asks nothing");

  // What the CLI sends when a pack builds zero questions.
  const result = replyCheck.decide({ mode: "not-needed", answers: {} }, state, {});
  assert.equal(result.judgmentsAvailable, false);
  assert.match(result.note, /judgments unavailable \(no questions were needed for this state\)/i);
  assert.ok(!result.note.includes("advisory signals for a human reviewer"), "the advisory note must not stand in");
});

test("reply-check counts overlapping occurrences of a watched literal", () => {
  const state = { draft: "anana", request: "r", banned: ["ana"] };
  const result = replyCheck.decide({ answers: {} }, state, {});
  const hit = result.literals.matches.find((m) => m.literal === "ana");
  assert.equal(hit.count, 2);
  assert.deepEqual(
    hit.occurrences.map((o) => o.column),
    [1, 3],
  );
  assert.equal(result.literals.matchCount, 2);
});

test("reply-check reads an answers payload that is not an object as no judgments", () => {
  for (const answers of [[], "answers", 7]) {
    const result = replyCheck.decide({ answers }, replyState, {});
    assert.equal(result.judgmentsAvailable, false, `${JSON.stringify(answers)} is not a judgment payload`);
    assert.deepEqual(Object.values(result.signals), [null, null, null, null]);
  }
});

test("reply-check requires both texts before anything is sent", () => {
  assert.match(replyCheck.validateState({ draft: "d" }), /string `request`/);
  assert.match(replyCheck.validateState({ request: "r" }), /string `draft`/);
  assert.equal(replyCheck.validateState(replyState), null);
});

test("reply-check reports literal matches as candidates, never as a verdict", () => {
  const result = replyCheck.decide({ answers: {} }, replyState, {});
  assert.equal(result.literals.verdict, null, "the pack must not rule on a match");

});

test("reply-check never sends a watched literal to the model", () => {
  const questions = replyCheck.buildQuestions(replyState, {});
  for (const literal of replyState.banned) {
    assert.ok(!JSON.stringify(questions).includes(literal), `${literal} must stay local`);
  }
});

test("reply-check reports the delegation and answer-first signals it was given", () => {
  const questions = replyCheck.buildQuestions(replyState, {});
  const result = replyCheck.decide(
    answerAll(questions, 0.5, { answer_first: 0.05, delegates_back: 0.95 }),
    replyState,
    {},
  );
  assert.equal(result.signals.answerFirst, 0.05);
  assert.equal(result.signals.delegatesBack, 0.95);
  assert.equal(result.attention.length, 2);
});

test("reply-check reports unknown signals rather than passing marks", () => {
  const result = replyCheck.decide(DEGRADED, replyState, {});
  assert.deepEqual(Object.values(result.signals), [null, null, null, null]);

  assert.equal(result.literals.matchCount, 2, "the exact-match positions still hold");
});



const simplifyState = {
  before: "function f(x) {\n  if (x == null) return 0;\n  return x * 2;\n}",
  after: "const f = (x) => x * 2;",
  contract: "f(null) returns 0; f(n) returns n doubled.",
};

test("simplify-gate never approves, at any risk reading", () => {
  const questions = simplifyGate.buildQuestions(simplifyState, {});
  const cases = [
    ["every risk answered no", answerAll(questions, 0)],
    ["every risk answered yes", answerAll(questions, 1)],
    ["no usable answers", { answers: {} }],
    ["judgments unavailable", DEGRADED],
  ];

  for (const [label, response] of cases) {
    const result = simplifyGate.decide(response, simplifyState, {});
    assert.equal(result.testsRequired, true, label);
    assert.equal(result.reviewRequired, true, label);
    assert.equal(result.equivalenceEstablished, false, label);

    const rendered = simplifyGate.render(result, simplifyState);
    assert.match(rendered, /run the tests that cover `contract`/, label);
    assert.match(rendered, /does not approve changes/, label);
    assert.ok(!/\bapproved\b|\bsafe\b|\bgo ahead\b/i.test(rendered), `${label}: no safety verdict`);
  }

  // Every risk read as absent is the strongest temptation to call it done.
  const clean = simplifyGate.decide(answerAll(questions, 0), simplifyState, {});
  assert.deepEqual(clean.focus, ["no risk stood out; the tests still decide"]);
});

test("simplify-gate requires the three texts it compares", () => {
  assert.match(simplifyGate.validateState({ after: "b", contract: "c" }), /string `before`/);
  assert.match(simplifyGate.validateState({ before: "a", after: "b" }), /string `contract`/);
  assert.equal(simplifyGate.validateState(simplifyState), null);
});

test("simplify-gate keeps unanswered risks open instead of assuming zero", () => {
  const questions = simplifyGate.buildQuestions(simplifyState, {});
  const answers = answerAll(questions, 0.02).answers;
  delete answers.dropped_case;
  const result = simplifyGate.decide({ answers }, simplifyState, {});
  assert.equal(result.risks.droppedCase, null);
  assert.deepEqual(result.unknownRisks, ["droppedCase"]);

});

test("simplify-gate surfaces the highest risk it was told about", () => {
  const questions = simplifyGate.buildQuestions(simplifyState, {});
  const result = simplifyGate.decide(
    answerAll(questions, 0.1, { dropped_case: 0.94 }),
    simplifyState,
    {},
  );
  assert.equal(result.highestRisk, 0.94);
  assert.equal(result.focus[0], "a handled case may have been dropped");
});

const grillingState = {
  questions: [
    { id: "scope", text: "Which surfaces are in scope?", prerequisites: [] },
    { id: "storage", text: "Postgres or SQLite?", prerequisites: ["scope"] },
    { id: "migration", text: "How do we migrate existing rows?", prerequisites: ["storage"] },
    { id: "budget", text: "What is the latency budget?", prerequisites: ["ghost"] },
  ],
  settled: ["scope"],
  context: "The user said earlier: latency must stay under 50ms.",
};

test("grilling-frontier eligibility ignores judgments entirely", () => {
  const questions = grillingFrontier.buildQuestions(grillingState, {});
  // Every semantic signal screams "ask it now"; the graph must not care.
  const result = grillingFrontier.decide(answerAll(questions, 0.99), grillingState, {});

  assert.deepEqual(result.ready, ["storage"]);
  const migration = result.questions.find((q) => q.id === "migration");
  assert.equal(migration.status, "blocked");
  assert.deepEqual(migration.unmetPrerequisites, ["storage"]);
});

test("grilling-frontier treats an unresolvable prerequisite as unmet", () => {
  const result = grillingFrontier.decide({ answers: {} }, grillingState, {});
  const budget = result.questions.find((q) => q.id === "budget");
  assert.equal(budget.status, "blocked");
  assert.deepEqual(budget.unknownPrerequisites, ["ghost"]);
  assert.ok(!result.ready.includes("budget"));
});

test("grilling-frontier never settles a question", () => {
  const questions = grillingFrontier.buildQuestions(grillingState, {});
  for (const response of [answerAll(questions, 1), answerAll(questions, 0), DEGRADED]) {
    const result = grillingFrontier.decide(response, grillingState, {});
    assert.deepEqual(result.settled, grillingState.settled);
    assert.deepEqual(result.autoSettled, []);
    assert.equal(result.questions.filter((q) => q.status === "settled").length, 1);
  }
});


test("grilling-frontier asks only about the open question, even when a settled id is a prefix of it", () => {
  const state = {
    questions: [
      { id: "scope", text: "Which surfaces are in scope?" },
      { id: "scope_detail", text: "Which endpoints inside those surfaces?" },
    ],
    settled: ["scope"],
    context: "",
  };

  const questions = grillingFrontier.buildQuestions(state, {});
  assert.equal(Object.keys(questions).length, 2, "one open question, two signals");
  for (const question of Object.values(questions)) {
    assert.match(question.instructions, /`questions\[1\]\.text`/);
  }

  const result = grillingFrontier.decide({ answers: {} }, state, {});
  assert.deepEqual(result.ready, ["scope_detail"]);
});

test("grilling-frontier keeps a blocked question blocked whatever the judgments say", () => {
  const questions = grillingFrontier.buildQuestions(grillingState, {});
  const result = grillingFrontier.decide(answerAll(questions, 0.99), grillingState, {});
  const migration = result.questions.find((q) => q.id === "migration");
  assert.equal(migration.status, "blocked");
  assert.ok(!result.ready.includes("migration"));
});

test("grilling-frontier falls back to positional ids when questions have none", () => {
  const state = {
    questions: [{ text: "First?" }, { text: "Second?", prerequisites: ["q1"] }],
    settled: [],
    context: "",
  };
  const result = grillingFrontier.decide({ answers: {} }, state, {});
  assert.deepEqual(result.ready, ["q1"]);
  assert.deepEqual(result.blocked, [{ id: "q2", unmetPrerequisites: ["q1"] }]);
});

test("grilling-frontier validates the context and question text contract", () => {
  assert.match(
    grillingFrontier.validateState({ questions: [{ text: "q" }] }),
    /string `context`/,
  );
  assert.match(
    grillingFrontier.validateState({ questions: [{}], context: "c" }),
    /`questions\[0\]\.text`/,
  );
  assert.match(
    grillingFrontier.validateState({ questions: [{ text: 7 }], context: "c" }),
    /`questions\[0\]\.text`/,
  );
});

test("grilling-frontier rejects a state whose question ids collide", () => {
  assert.match(
    grillingFrontier.validateState({ questions: [{ id: "a", text: "first" }, { id: "a", text: "second" }], context: "c" }),
    /unique question ids/,
  );
  // The second question takes the positional id `q2`, which the first claims.
  assert.match(
    grillingFrontier.validateState({ questions: [{ id: "q2", text: "first" }, { text: "no id" }], context: "c" }),
    /unique question ids/,
  );
  assert.match(grillingFrontier.validateState({ questions: [[]], context: "c" }), /`questions\[0\]` to be an object/);
  assert.match(
    grillingFrontier.validateState({ questions: [{ id: "a", text: "q", prerequisites: [7] }], context: "c" }),
    /`questions\[0\]\.prerequisites\[0\]` to be a string/,
  );
  assert.match(grillingFrontier.validateState({ questions: [], settled: [1], context: "c" }), /`settled\[0\]`/);
  assert.equal(grillingFrontier.validateState(grillingState), null);
});



