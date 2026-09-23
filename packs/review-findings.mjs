/**
 * review-findings — advisory support signals for an existing two-axis review.
 *
 * The review is the reviewer's, and the two axes it was produced with
 * (standards and spec) stay primary. This pack never reranks, filters, merges,
 * or drops a finding, and never rewrites its axis: `decide` returns exactly the
 * findings it was given, in the order it was given them. All it adds is, per
 * finding, a small set of advisory signals a human can use to decide where to
 * look first.
 *
 * Evidence-location shape is adapted from the candidate/`noMatch` Choice in
 * devagrawal09/jev-review `src/review/judgments.ts` (MIT, Copyright (c) 2026
 * Dev Agrawal). Two differences are deliberate: candidates are supplied by the
 * caller and never generated here, and `noMatch` or a low-confidence answer
 * leaves the finding fully intact instead of discarding it — upstream drops the
 * finding below a fixed location-confidence constant, and no such threshold is
 * justified for this workflow.
 *
 * State:
 *   {
 *     findings: [{
 *       axis, file, line, claim, evidence,
 *       candidates?: [{ id, excerpt, file, line }]   // optional, caller-supplied
 *     }],
 *     diff:          string,   // the changes the review covers
 *     standards:     string,   // repository coding standards the review cites
 *     spec:          string,   // issue / spec text the review cites
 *     contextTests?: string    // relevant tests, including unchanged ones
 *   }
 *
 * `contextTests` is optional, and its absence is not evidence of anything: with
 * no test text in state the coverage signal is `unknown`, never a test gap.
 *
 * Whether a finding sits inside the change is arithmetic on the hunk headers of
 * `diff`, so it is computed here and never asked: each finding carries a
 * `withinDiff` of `inside`, `outside`, or `unknown`.
 *
 * Whether `evidence` is quoted verbatim from `diff` is a string match, also
 * computed here (the citation-check pattern: find the quote in code first,
 * then ask a model only how it relates to the claim). A quote outside the diff
 * is not fabricated: it may come from unchanged code in the touched files.
 *
 * How the evidence relates to the claim is one three-way Choice
 * (`supports` / `contradicts` / `says_nothing`), so an unrelated quote and a
 * quote that shows the opposite never collapse into the same "no".
 *
 * All findings are judged in one request; questions run in parallel.
 *
 * The model reads `buildState(state)`, never this state. `diff` is used only
 * by the code checks above and is not sent. Each finding goes out as its
 * `claim` and `evidence`; candidate excerpts travel inside the options of the
 * location Choice, where the model reads them, so they are not repeated in
 * state. Empty text fields are left out, and a question whose field is empty
 * is not asked: a finding with no `evidence` has no relation to judge, and a
 * finding whose axis text (`standards` or `spec`) is empty has no basis to
 * check. The basis question reads only the finding's own axis.
 */

import { choice, noul } from "../src/jev.mjs";
import {
 ADVISORY_BANDS, ADVISORY_NOTE,
 anyUnknown,
 asArray,
 asText,
 band,
 heading,
 isPlainObject,
 judgmentAvailability,
 pct,
 preview,
 readChoice,
 readNoul,
 report,
 signalLine,
 unavailableNote,
} from "./shared.mjs"

export const name = "review-findings";
export const description = "Advisory support signals per review finding; never reranks or drops findings.";

export const NO_MATCH = "noMatch";

/** Evidence relation labels, in the order they are offered to the model. */
export const RELATIONS = ["supports", "contradicts", "says_nothing"];

const AXES = ["standards", "spec"];

const SIGNALS = [
 ["basisDocumented", "basis_documented"],
 ["coveredByTests", "covered_by_tests"],
];

function qid(index, suffix) {
 return `finding_${index}_${suffix}`;
}

/** Candidates are the caller's; only their ids are ever selected. */
function candidatesOf(finding) {
 return asArray(finding?.candidates).filter((c) => c && typeof c === "object");
}

/** Choice label for a candidate: its id, kept clear of the `noMatch` label. */
function labelOf(candidate, index) {
 const raw = candidate?.id;
 const base = typeof raw === "string" && raw !== "" ? raw : `c${index + 1}`;
 return base === NO_MATCH ? `${base}_candidate` : base;
}

function hasText(value) {
 return asText(value).trim() !== "";
}

function hasTestContext(state) {
 return hasText(state?.contextTests);
}

/** The state field a finding's basis lives in: its own axis. */
function basisField(finding) {
 return finding?.axis === "standards" ? "standards" : "spec";
}

/** Which judgments a finding's state can support. Arithmetic on the state, not a judgment. */
function askedFor(finding, state) {
 return { relation: hasText(finding?.evidence), basis: hasText(state?.[basisField(finding)]) };
}

/** What the model reads: the non-empty reference texts first, then claims and quoted evidence. */
export function buildState(state) {
 const out = {};
 for (const field of ["standards", "spec", "contextTests"]) {
  if (hasText(state?.[field])) out[field] = asText(state[field]);
 }
 out.findings = asArray(state?.findings).map((finding) => ({
  claim: asText(finding?.claim),
  evidence: asText(finding?.evidence),
 }));
 return out;
}

/**
 * Structural gate for the CLI: shape only. Nothing here reads a claim's merit.
 */
export function validateState(state) {
 if (!Array.isArray(state?.findings)) return "State requires a `findings` array";
 for (const [index, finding] of state.findings.entries()) {
  const at = `findings[${index}]`;
  if (!isPlainObject(finding)) return `State requires \`${at}\` to be an object`;
  if (typeof finding.claim !== "string" || finding.claim === "") {
   return `State requires a string \`${at}.claim\``;
  }
  if (!AXES.includes(finding.axis)) {
   return `State requires \`${at}.axis\` to be one of: ${AXES.join(", ")}`;
  }
  if (finding.candidates !== undefined) {
   if (!Array.isArray(finding.candidates)) return `State requires \`${at}.candidates\` to be an array`;
   const labels = new Set();
   for (const [position, candidate] of finding.candidates.entries()) {
    if (!isPlainObject(candidate)) return `State requires \`${at}.candidates[${position}]\` to be an object`;
    const label = labelOf(candidate, position);
    if (labels.has(label)) return `State requires unique candidate ids in \`${at}.candidates\` (\`${label}\` repeats)`;
    labels.add(label);
   }
  }
 }
 return null;
}

export function buildQuestions(state, _args = {}) {
 const findings = asArray(state?.findings);
 const testContext = hasTestContext(state);
 const questions = {};

 findings.forEach((finding, index) => {
  const claim = `\`findings[${index}].claim\``;
  const evidence = `\`findings[${index}].evidence\``;

  const asked = askedFor(finding, state);
  if (asked.relation) questions[qid(index, "evidence_relation")] = choice(
   {
    question: `How does ${evidence} relate to the problem asserted in ${claim}?`,
    compare: [evidence, claim],
    focus: "Judge only what the quoted text shows. Do not judge whether the problem matters.",
   },
   {
    supports: {
     what: "The evidence quotes the code or requirement the claim is about and shows the asserted problem",
     examples: ["Claim \"Uses var\" with evidence \"var x = 1\""],
    },
    contradicts: {
     what: "The evidence shows the code or requirement does not have the asserted problem",
     examples: ["Claim \"Uses var\" with evidence \"const x = 1\""],
    },
    says_nothing: {
     what: "The evidence is only a reference such as a section number or path, or text unrelated to the claim",
     not_for: "Evidence that shows the problem in different words than the claim uses",
     examples: ["Claim \"Does not emit the required event\" with evidence \"spec §3\""],
    },
   },
  );

  const field = basisField(finding);
  const rule = field === "standards" ? "rule" : "requirement";
  if (asked.basis) questions[qid(index, "basis_documented")] = noul(
   {
    question: `Does \`${field}\` state a ${rule} that ${claim} applies?`,
    compare: [claim, `\`${field}\``],
    focus: "Look for stated wording the claim applies, not for general good practice.",
   },
   {
    true: {
     what: `A reader can point at wording in \`${field}\` that the claim applies`,
     examples: [field === "standards"
      ? "Claim \"Uses var\" with standards \"Never var.\""
      : "Claim \"Empty input throws\" with spec \"Empty input returns 0.\""],
    },
    false: {
     what: `\`${field}\` states no such ${rule}; the claim rests on general judgment or preference`,
     not_for: `A ${rule} that \`${field}\` states in different words`,
    },
   },
  );

  // Only asked when the caller supplied test text. With no `contextTests`,
  // there is nothing to compare against and the signal stays unknown.
  if (testContext) {
   questions[qid(index, "covered_by_tests")] = noul(
    {
     question: `Does \`contextTests\` contain a test that would fail while the problem asserted in ${claim} is present?`,
     compare: [claim, "`contextTests`"],
     focus: "A test counts whether or not the change touched it.",
    },
    {
     true: { what: "A test in `contextTests` asserts the behavior the claim is about and would report a failure" },
     false: {
      what: "No test in `contextTests` asserts that behavior, so the problem could be present without a failure",
      not_for: "A test that asserts the behavior under a different name",
     },
    },
   );
  }

  // Evidence location, from caller-supplied candidates only. Same request.
  const candidates = candidatesOf(finding);
  if (candidates.length > 0) {
   // Each option carries its own excerpt, the way a Choice over a roster
   // carries each entry's description: the model reads the candidate where it
   // weighs it, and the excerpt is sent once. File and line stay in code; the
   // label maps the answer back to the caller's candidate.
   const options = Object.fromEntries(
    candidates.map((candidate, position) => [labelOf(candidate, position), asText(candidate.excerpt)]),
   );
   options[NO_MATCH] = { what: `None of the other options shows the problem asserted in ${claim}` };

   questions[qid(index, "evidence_location")] = choice(
    {
     question: `Which option's excerpt most directly shows the problem asserted in ${claim}?`,
     inspect: claim,
     focus: `Pick the excerpt that shows the problem itself, not merely nearby code. Select ${NO_MATCH} when none does.`,
    },
    options,
   );
  }
 });

 return questions;
}

export function decide(response, state, _args = {}) {
 const { available, reason } = judgmentAvailability(response);
 const findings = asArray(state?.findings);
 const testContext = hasTestContext(state);
 const diffRanges = parseDiffRanges(state?.diff);

 const annotated = findings.map((finding, index) => {
  const relation = readChoice(response, qid(index, "evidence_relation"), RELATIONS);
  const signals = {
   // P(supports) from the relation distribution: one probability, same scale as a Noul.
   evidenceSupports: relation ? relation.probabilities.supports : null,
   ...Object.fromEntries(SIGNALS.map(([key, suffix]) => [key, readNoul(response, qid(index, suffix))])),
  };
  // Only the signals that were asked count toward "partial" or "unknown": a
  // question the state could not support is not a missing answer.
  const asked = askedFor(finding, state);
  const supportValues = [
   ...(asked.relation ? [signals.evidenceSupports] : []),
   ...(asked.basis ? [signals.basisDocumented] : []),
  ];

  const candidates = candidatesOf(finding);
  const labels = candidates.map(labelOf);
  const selection =
   candidates.length > 0
    ? readChoice(response, qid(index, "evidence_location"), [...labels, NO_MATCH])
    : null;

  // The attached location is always a candidate object the caller supplied.
  // Nothing here constructs a file or line.
  const selectedIndex =
   selection && selection.choice !== NO_MATCH ? labels.indexOf(selection.choice) : -1;
  const selectedCandidate = selectedIndex >= 0 ? candidates[selectedIndex] : null;

  // Deterministic: computed from `diff`, never asked.
  const withinDiff = withinDiffOf(finding, diffRanges);
  const evidenceQuoted = quotedInDiff(finding, state?.diff);

  return {
   index,
   // Reviewer-owned fields, copied through untouched.
   axis: finding?.axis ?? null,
   file: finding?.file ?? null,
   line: finding?.line ?? null,
   claim: finding?.claim ?? null,
   evidence: finding?.evidence ?? null,
   signals,
   withinDiff,
   evidenceQuoted,
   evidenceRelation: relation ? { choice: relation.choice, confidence: relation.confidence } : null,
   // Questions the state could not support for this finding, so none was sent.
   notAsked: [
    ...(asked.relation ? [] : ["evidenceRelation: no `evidence` text"]),
    ...(asked.basis ? [] : [`basisDocumented: no \`${basisField(finding)}\` text`]),
   ],
   testCoverage: coverageOf(testContext, signals.coveredByTests),
   candidateCount: candidates.length,
   evidenceLocation: {
    // "not asked" (no candidates), "noMatch", "selected", or "unknown".
    status: locationStatus(candidates.length, selection, selectedCandidate),
    selected: selectedCandidate,
    selectedId: selectedCandidate ? selection.choice : null,
    // Reported, never thresholded: no cut-off is justified here, and a
    // low-confidence answer never removes a finding.
    confidence: selection?.confidence ?? null,
   },
   // Advisory reading order only. Nothing here removes or demotes a finding.
   attention: attentionOf(supportValues, withinDiff, relation),
   unknownSignals: anyUnknown(supportValues),
  };
 });

 return {
  pack: name,
  judgmentsAvailable: available,
  degraded: reason,
  findingCount: findings.length,
  // Same list, same order, same axes as the input: an explicit invariant.
  findings: annotated,
  axes: findings.map((f) => f?.axis ?? null),
  droppedFindings: 0,
  testContextSupplied: testContext,
  advisoryOnly: true,
  note: available ? ADVISORY_NOTE : unavailableNote(reason),
 };
}

/**
 * Test coverage reading. Without `contextTests` in state the answer is
 * `unknown`: no test text means no information, not a missing test.
 */
function coverageOf(testContext, probability) {
 if (!testContext) return { status: "unknown", reason: "no `contextTests` in state", probability: null };
 if (probability === null) return { status: "unknown", reason: "no answer for this finding", probability: null };
 if (probability >= ADVISORY_BANDS.high) return { status: "a test may already cover this", reason: null, probability };
 if (probability <= ADVISORY_BANDS.low) return { status: "may lack a covering test", reason: null, probability };
 return { status: "coverage unclear", reason: null, probability };
}

function locationStatus(candidateCount, selection, selectedCandidate) {
 if (candidateCount === 0) return "not asked";
 if (!selection) return "unknown";
 if (selection.choice === NO_MATCH) return NO_MATCH;
 return selectedCandidate ? "selected" : "unknown";
}

/**
 * Where a human might look first. "unknown" when any signal is missing —
 * absence of a signal is never read as a clean bill of health. The diff
 * position is arithmetic, so it enters this reading as a fact.
 */
function attentionOf(values, withinDiff, relation) {
 if (values.length === 0) return "no judgment possible from the supplied text";
 if (values.every((v) => v === null)) return "unknown";
 if (anyUnknown(values)) return "partial";
 // The relation is a Choice, so its selected label is read, not its
 // `supports` probability against the Noul display bands.
 if (relation?.choice === "contradicts") return "evidence may contradict the claim; re-read it";
 if (relation?.choice === "says_nothing") return "evidence may not show the problem; re-read it";
 if (relation?.choice === "supports" && withinDiff.status === "inside") return "evidence reads consistent";
 return "worth re-reading the evidence";
}

/**
 * Searchable text of a unified diff, one entry per hunk side: the new side
 * (context and added lines) and the old side (context and removed lines).
 * Keeping hunks and sides apart stops a quote from matching across a hunk,
 * file, or old/new boundary.
 */
function diffSegments(diff) {
 const segments = [];
 let hunk = null;
 const flush = () => {
  if (hunk) segments.push(hunk.new.join("\n"), hunk.old.join("\n"));
  hunk = null;
 };
 for (const line of asText(diff).split("\n")) {
  if (/^(?:diff |index |--- |\+\+\+ )/.test(line)) { flush(); continue; }
  if (line.startsWith("@@")) { flush(); hunk = { new: [], old: [] }; continue; }
  if (!hunk) continue;
  const body = line.slice(1);
  if (line.startsWith("+")) hunk.new.push(body);
  else if (line.startsWith("-")) hunk.old.push(body);
  else if (line.startsWith(" ") || line === "") { hunk.new.push(body); hunk.old.push(body); }
 }
 flush();
 return segments.map(normalizeQuote).filter((text) => text !== "");
}

/** Collapse whitespace and fold curly quotes, so a quote matches across line wraps. */
function normalizeQuote(text) {
 return asText(text).replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();
}

/**
 * Whether the finding's `evidence` appears in one hunk side of `diff`, after
 * whitespace and curly-quote normalization. A string match, never asked.
 * `not in diff` is not a fabrication verdict: reviewers may quote unchanged
 * code from a touched file.
 */
function quotedInDiff(finding, diff) {
 const quote = normalizeQuote(finding?.evidence);
 if (quote === "") return { status: "unknown", reason: "finding has no quoted `evidence`" };
 const segments = diffSegments(diff);
 if (segments.length === 0) return { status: "unknown", reason: "no hunk text in `diff` to search" };
 return segments.some((segment) => segment.includes(quote))
  ? { status: "in diff", reason: null }
  : { status: "not in diff", reason: "check the touched file; the quote may be unchanged code" };
}

/**
 * New-side line ranges per file, read from the `@@` headers of a unified diff.
 * Whether a finding sits inside the change is arithmetic; nothing is asked.
 */
function parseDiffRanges(diff) {
 const ranges = new Map();
 let file = null;

 for (const line of asText(diff).split("\n")) {
  if (line.startsWith("+++ ")) {
   file = newSidePath(line.slice(4));
   continue;
  }
  if (file === null || !line.startsWith("@@")) continue;
  const header = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
  if (!header) continue;
  const start = Number(header[1]);
  const count = header[2] === undefined ? 1 : Number(header[2]);
  if (count === 0) continue; // pure deletion: the hunk adds no new-side line
  const hunks = ranges.get(file) ?? [];
  hunks.push([start, start + count - 1]);
  ranges.set(file, hunks);
 }

 return ranges;
}

/** `+++ b/src/a.mjs` → `src/a.mjs`. `/dev/null` is a deleted file, not a path. */
function newSidePath(raw) {
 const path = raw.split("\t")[0].trim();
 if (path === "" || path === "/dev/null") return null;
 return path.startsWith("b/") ? path.slice(2) : path;
}

/**
 * Whether the finding's own file and line fall inside the changed lines.
 * `unknown` means the question could not be decided from what was supplied —
 * never that the finding is off-target.
 */
function withinDiffOf(finding, ranges) {
 if (ranges.size === 0) return { status: "unknown", reason: "no parseable hunks in `diff`" };
 const file = typeof finding?.file === "string" ? finding.file.trim() : "";
 if (file === "") return { status: "unknown", reason: "finding has no `file`" };
 if (!Number.isInteger(finding?.line)) return { status: "unknown", reason: "finding has no integer `line`" };

 const hunks = ranges.get(file);
 if (hunks === undefined) return { status: "outside", reason: "`diff` does not change this file" };
 const inside = hunks.some(([start, end]) => finding.line >= start && finding.line <= end);
 return inside
  ? { status: "inside", reason: null }
  : { status: "outside", reason: "line is outside the changed ranges" };
}

export function render(result, _state) {
 const blocks = [heading(`${name} — ${result.findingCount} finding(s), all retained`)];

 if (result.findingCount === 0) {
  blocks.push("No findings in state. Nothing to judge; nothing changed.");
  return report(blocks);
 }

 blocks.push(
  result.findings
   .map((f) => {
    const lines = [
     `${f.index + 1}. [${f.axis ?? "no axis"}] ${f.file ?? "?"}:${f.line ?? "?"}`,
     `   claim: ${preview(f.claim)}`,
     `   evidence: ${preview(f.evidence)}`,
     `   signals: ` +
     signalLine([[`basis in ${f.axis === "standards" ? "standards" : "spec"}`, f.signals.basisDocumented]]),
     `   diff: ${f.withinDiff.status}` + (f.withinDiff.reason ? ` (${f.withinDiff.reason})` : ""),
     `   evidence quote: ${f.evidenceQuoted.status}` + (f.evidenceQuoted.reason ? ` (${f.evidenceQuoted.reason})` : ""),
     `   evidence relation: ` +
     (f.evidenceRelation
      ? `${f.evidenceRelation.choice} (confidence ${pct(f.evidenceRelation.confidence)})`
      : "unknown"),
     `   test coverage: ${f.testCoverage.status}` +
     (f.testCoverage.reason
      ? ` (${f.testCoverage.reason})`
      : ` ${pct(f.testCoverage.probability)} (${band(f.testCoverage.probability)})`),
    ];

    if (f.candidateCount > 0) {
     const location = f.evidenceLocation;
     const detail =
      location.status === "selected"
       ? `${location.selectedId} — ${location.selected.file ?? "?"}:${location.selected.line ?? "?"}` +
       (location.confidence === null ? "" : ` (confidence ${pct(location.confidence)})`)
       : location.status === NO_MATCH
        ? "no supplied candidate matched; the finding stands as written"
        : "unknown";
     lines.push(`   evidence candidate: ${detail}`);
    }

    if (f.notAsked.length > 0) lines.push(`   not asked: ${f.notAsked.join("; ")}`);
    lines.push(`   reading note: ${f.attention}`);
    return lines.join("\n");
   })
   .join("\n\n"),
 );

 blocks.push(
  `${result.note}\nFindings, their order, and their axes are unchanged by this pack. ` +
  (result.testContextSupplied
   ? "Test coverage readings compare each claim against `contextTests` only."
   : "No `contextTests` was supplied, so test coverage is unknown rather than missing."),
 );
 return report(blocks);
}
