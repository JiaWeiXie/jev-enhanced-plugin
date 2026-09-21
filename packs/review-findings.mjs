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
 * All findings are judged in one request; questions run in parallel.
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

const AXES = ["standards", "spec"];

const SIGNALS = [
 ["evidenceSupports", "evidence_supports"],
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

function hasTestContext(state) {
 return asText(state?.contextTests).trim() !== "";
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
  const at = `\`findings[${index}]\``;
  const where = `\`findings[${index}].file\`:\`findings[${index}].line\``;

  questions[qid(index, "evidence_supports")] = noul(
   `The quoted evidence in \`findings[${index}].evidence\` shows the problem asserted in ` +
   `\`findings[${index}].claim\` at ${where}.`,
   {
    true: `The evidence names the same code as ${at} and demonstrates the asserted problem.`,
    false:
     "The evidence is missing, quotes unrelated code, or does not demonstrate the asserted " +
     "problem, so a reader must go back to the source to check the claim.",
   },
  );

  questions[qid(index, "basis_documented")] = noul(
   `\`findings[${index}].claim\` follows a rule stated in \`standards\` or a requirement stated in \`spec\`.`,
   {
    true: "A reader can point at wording in `standards` or `spec` that the claim applies.",
    false:
     "Neither `standards` nor `spec` states the rule; the claim rests on general judgment or " +
     "reviewer preference.",
   },
  );

  // Only asked when the caller supplied test text. With no `contextTests`,
  // there is nothing to compare against and the signal stays unknown.
  if (testContext) {
   questions[qid(index, "covered_by_tests")] = noul(
    `\`contextTests\` contains a test that would fail while the problem asserted in ` +
    `\`findings[${index}].claim\` is present.`,
    {
     true:
      "A test in `contextTests` — changed or unchanged — exercises the behavior the claim is " +
      "about and would report a failure.",
     false:
      "No test in `contextTests` exercises that behavior, so the problem could be present " +
      "without any test failing.",
    },
   );
  }

  // Evidence location, from caller-supplied candidates only. Same request.
  const candidates = candidatesOf(finding);
  if (candidates.length > 0) {
   const options = Object.fromEntries(
    candidates.map((candidate, position) => [
     labelOf(candidate, position),
     `Candidate \`findings[${index}].candidates[${position}]\` at ` +
     `${candidate.file ?? `\`findings[${index}].file\``}:${candidate.line ?? "?"}` +
     (candidate.excerpt ? ` — ${preview(candidate.excerpt, 160)}` : ""),
    ]),
   );
   options[NO_MATCH] = `None of the supplied candidates shows the problem asserted in \`findings[${index}].claim\`.`;

   questions[qid(index, "evidence_location")] = choice(
    `Which supplied candidate in \`findings[${index}].candidates\` most directly shows the problem ` +
    `asserted in \`findings[${index}].claim\`? Select ${NO_MATCH} when none of them does.`,
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
  const signals = Object.fromEntries(
   SIGNALS.map(([key, suffix]) => [key, readNoul(response, qid(index, suffix))]),
  );
  const supportValues = [signals.evidenceSupports, signals.basisDocumented];

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
   attention: attentionOf(signals, supportValues, withinDiff),
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
function attentionOf(signals, values, withinDiff) {
 if (values.every((v) => v === null)) return "unknown";
 if (anyUnknown(values)) return "partial";
 if (signals.evidenceSupports >= ADVISORY_BANDS.high && withinDiff.status === "inside") return "evidence reads consistent";
 return "worth re-reading the evidence";
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
     signalLine([
      ["evidence supports claim", f.signals.evidenceSupports],
      ["basis in standards/spec", f.signals.basisDocumented],
     ]),
     `   diff: ${f.withinDiff.status}` + (f.withinDiff.reason ? ` (${f.withinDiff.reason})` : ""),
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
