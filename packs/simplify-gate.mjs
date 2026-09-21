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

export function buildQuestions(state, _args = {}) {
 if (asText(state?.before).trim() === "" || asText(state?.after).trim() === "") return {};

 return {
  [IDS.observableChange]: noul(
   "There is an input allowed by `contract` for which `after` produces a different observable result than `before`.",
   {
    true: "A caller could see a different return value, side effect, or ordering from `after`.",
    false: "For every input `contract` allows, the observable result of `after` matches `before`.",
   },
  ),
  [IDS.droppedCase]: noul("`after` no longer handles a case that `before` handled explicitly.", {
   true: "A branch, guard, or special case present in `before` has no equivalent in `after`.",
   false: "Every case `before` handled is still handled in `after`, possibly by more general code.",
  }),
  [IDS.surfaceChange]: noul(
   "`after` changes the surface described in `contract`: names, parameters, return shape, or thrown errors.",
   {
    true: "A caller written against `contract` would need to change to keep working with `after`.",
    false: "The surface in `contract` is untouched; only the implementation moved.",
   },
  ),
  [IDS.errorPathChange]: noul("`after` changes what happens on the failure paths that `before` handled.", {
   true: "An error is now swallowed, raised differently, raised at a different point, or no longer raised.",
   false: "Failures surface the same way, at the same point, with the same type and information.",
  }),
 };
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
  "Required regardless of the numbers above: run the tests that cover `contract`, and have a human " +
  "read the diff. This pack does not approve changes and cannot establish that `before` and `after` " +
  "are equivalent.",
 );

 blocks.push(result.note);
 return report(blocks);
}
