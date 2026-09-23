/**
 * simplify-gate — risk signals for a simplification, and nothing else.
 *
 * A simplification is supposed to preserve behavior. A model cannot establish
 * that it does: no probability is a proof of equivalence, and a low risk reading
 * is not evidence of safety. So this pack asks only where the risk is, and its
 * result never contains an approval, an "apply" decision, or a claim that the
 * two versions are equivalent. `testsRequired` is true in every result,
 * including the one produced when no judgments ran at all.
 *
 * State:
 *   {
 *     before:   string,   // the code before simplification
 *     after:    string,   // the code after
 *     contract: string    // the observable behavior callers depend on
 *   }
 *
 * The two questions that read `contract` are asked only when it has text;
 * with an empty contract they are `not asked`, and their risk stays open.
 */

import { noul } from "../src/jev.mjs";
import {
 ADVISORY_BANDS, ADVISORY_NOTE,
 anyUnknown,
 asText,
 band,
 heading,
 judgmentAvailability,
 maxKnown,
 pct,
 readNoul,
 report,
 unavailableNote,
} from "./shared.mjs"

export const name = "simplify-gate";
export const description = "Risk signals for a simplification; never approves a change and always requires tests.";

const IDS = {
 observableChange: "observable_behaviour_change",
 droppedCase: "dropped_case",
 surfaceChange: "contract_surface_change",
 errorPathChange: "error_path_change",
};

/** Structural gate for the CLI: all three texts must be present as strings. */
export function validateState(state) {
 for (const field of ["before", "after", "contract"]) {
  if (typeof state?.[field] !== "string") return `State requires a string \`${field}\``;
 }
 return null;
}

function hasContract(state) {
 return asText(state?.contract).trim() !== "";
}

/** Risks that need `contract` to be judged. */
const CONTRACT_RISKS = ["observableChange", "surfaceChange"];

/**
 * What the model reads: the contract when there is one, then the two versions.
 * Reference first, material under judgment after: in live checks, the same
 * question caught a changed empty-input result only with `contract` leading.
 */
export function buildState(state) {
 const out = {};
 if (hasContract(state)) out.contract = asText(state.contract);
 out.before = asText(state?.before);
 out.after = asText(state?.after);
 return out;
}

export function buildQuestions(state, _args = {}) {
 if (asText(state?.before).trim() === "" || asText(state?.after).trim() === "") return {};

 const questions = {
  [IDS.observableChange]: noul(
   {
    question: "Would a caller relying on `contract` get a different return value, side effect, or ordering of side effects from `after` than from `before`?",
    compare: ["`before`", "`after`", "`contract`"],
    focus: "Only what a caller can observe counts; renamed locals and restructured internals do not.",
   },
   {
    true: {
     what: "Some call that `contract` allows returns a different value, has a different side effect, or orders side effects differently in `after`",
     examples: ["`before` returns 0 for an empty list and `after` returns undefined"],
    },
    false: { what: "Every call that `contract` allows returns the same value with the same side effects in the same order" },
   },
  ),
  [IDS.droppedCase]: noul(
   {
    question: "Does `after` stop handling a case that `before` handled explicitly?",
    compare: ["`before`", "`after`"],
    focus: "Look for branches, guards, and special cases in `before`.",
   },
   {
    true: { what: "A branch, guard, or special case in `before` has no equivalent in `after`" },
    false: {
     what: "Every case `before` handled is still handled in `after`",
     not_for: "A special case now covered by more general code",
    },
   },
  ),
  [IDS.surfaceChange]: noul(
   {
    question: "Does `after` change the surface described in `contract`: names, parameters, return shape, or thrown errors?",
    compare: ["`contract`", "`after`"],
    focus: "Judge what a caller written against `contract` depends on, not internal names.",
   },
   {
    true: { what: "A caller written against `contract` would need to change to keep working with `after`" },
    false: { what: "The surface in `contract` is untouched; only the implementation moved" },
   },
  ),
  [IDS.errorPathChange]: noul(
   {
    question: "Does `after` change what happens on the failure paths that `before` handled?",
    compare: ["`before`", "`after`"],
    focus: "Compare which errors are raised, where, with what type and information.",
   },
   {
    true: { what: "An error is now swallowed, raised differently, raised at a different point, or no longer raised" },
    false: { what: "Failures surface the same way, at the same point, with the same type and information" },
   },
  ),
 };

 if (!hasContract(state)) {
  for (const key of CONTRACT_RISKS) delete questions[IDS[key]];
 }
 return questions;
}

export function decide(response, state, _args = {}) {
 const { available, reason } = judgmentAvailability(response);

 const risks = {
  observableChange: readNoul(response, IDS.observableChange),
  droppedCase: readNoul(response, IDS.droppedCase),
  surfaceChange: readNoul(response, IDS.surfaceChange),
  errorPathChange: readNoul(response, IDS.errorPathChange),
 };
 const values = Object.values(risks);
 const highest = maxKnown(values);

 return {
  pack: name,
  judgmentsAvailable: available,
  degraded: reason,
  risks,
  highestRisk: highest,
  riskBand: band(highest),
  unknownRisks: Object.entries(risks)
   .filter(([, v]) => v === null)
   .map(([k]) => k),
  // Asked for nothing about the contract when none was supplied; still open risks.
  notAsked: hasContract(state) ? [] : [...CONTRACT_RISKS],
  // Invariant: constant true. No probability, and no absence of one, removes
  // the need to run the tests that cover `contract`.
  testsRequired: true,
  reviewRequired: true,
  // Invariant: this pack states where to look, never that the change is safe.
  equivalenceEstablished: false,
  advisoryOnly: true,
  focus: focusOf(risks, values),
  note: available ? ADVISORY_NOTE : unavailableNote(reason),
 };
}

function focusOf(risks, values) {
 const labels = {
  observableChange: "observable behavior may differ",
  droppedCase: "a handled case may have been dropped",
  surfaceChange: "the contract surface may have changed",
  errorPathChange: "failure paths may behave differently",
 };
 const flagged = Object.entries(risks)
  .filter(([, v]) => v !== null && v >= ADVISORY_BANDS.low)
  .sort((a, b) => b[1] - a[1])
  .map(([k]) => labels[k]);

 if (flagged.length > 0) return flagged;
 if (values.every((v) => v === null)) return ["no signals available; review the diff unaided"];
 if (anyUnknown(values)) return ["some signals missing; treat the unanswered risks as open"];
 return ["no risk stood out; the tests still decide"];
}

export function render(result, state) {
 const blocks = [heading(`${name} — simplification risk`)];

 if (asText(state?.before).trim() === "" || asText(state?.after).trim() === "") {
  blocks.push("State needs both `before` and `after`. Nothing to judge.");
  blocks.push("Tests covering `contract` are still required before this change lands.");
  return report(blocks);
 }

 blocks.push(
  [
   `observable behavior differs   ${pct(result.risks.observableChange)} (${band(result.risks.observableChange)})`,
   `handled case dropped          ${pct(result.risks.droppedCase)} (${band(result.risks.droppedCase)})`,
   `contract surface changed      ${pct(result.risks.surfaceChange)} (${band(result.risks.surfaceChange)})`,
   `failure paths changed         ${pct(result.risks.errorPathChange)} (${band(result.risks.errorPathChange)})`,
  ].join("\n"),
 );

 blocks.push(`Look at: ${result.focus.join("; ")}`);

 blocks.push(
  (result.notAsked.length > 0 ? `Not asked, because \`contract\` is empty: ${result.notAsked.join(", ")}. Treat them as open.\n` : "") +
  "Required regardless of the numbers above: run the tests that cover `contract`, and have a human " +
  "read the diff. This pack does not approve changes and cannot establish that `before` and `after` " +
  "are equivalent.",
 );

 blocks.push(result.note);
 return report(blocks);
}
