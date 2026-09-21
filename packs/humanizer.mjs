/**
 * humanizer — where to spend editing attention, in context.
 *
 * What this pack does NOT do, deliberately:
 *   - It never asks whether a passage was written by a model. Authorship
 *     detection is not reliable and is not the user's question; the questions
 *     below are about what a passage does for its reader.
 *   - It never rewrites. `decide` returns every passage unchanged, in order.
 *     The output is a reading order for a human editor, nothing else.
 *
 * State:
 *   {
 *     passages: [string],  // the passages to look at, in document order
 *     locale:   string,    // e.g. "en-US", "zh-TW" — what natural reads like here
 *     context:  string     // what the document is for, and what its reader knows
 *   }
 */

import { noul } from "../src/jev.mjs";
import {
 ADVISORY_BANDS, ADVISORY_NOTE,
 anyUnknown,
 asArray,
 heading,
 judgmentAvailability,
 preview,
 readNoul,
 report,
 signalLine,
 unavailableNote,
} from "./shared.mjs"

export const name = "humanizer";
export const description = "Contextual editing-priority signals per passage; no rewriting, no authorship claims.";

function qid(index, suffix) {
 return `passage_${index}_${suffix}`;
}

/** Structural gate for the CLI: passages are text, in a stated locale. */
export function validateState(state) {
 if (!Array.isArray(state?.passages)) return "State requires a `passages` array";
 for (const [index, passage] of state.passages.entries()) {
  if (typeof passage !== "string") return `State requires \`passages[${index}]\` to be a string`;
 }
 if (typeof state.locale !== "string") return "State requires a string `locale`";
 return null;
}

export function buildQuestions(state, _args = {}) {
 const passages = asArray(state?.passages);
 const questions = {};

 passages.forEach((_passage, index) => {
  const at = `\`passages[${index}]\``;

  questions[qid(index, "carries_information")] = noul(
   `${at} tells the reader described in \`context\` something they would not already have without it.`,
   {
    true: `Removing ${at} would cost the reader a fact, a constraint, an instruction, or a needed transition.`,
    false: `${at} is preamble, restatement, or filler: removing it would leave the reader with the same information.`,
   },
  );

  questions[qid(index, "restates_other_passage")] = noul(
   `${at} repeats a point already made by another entry of \`passages\`.`,
   {
    true: "Another passage already makes the same point; this one adds wording, not content.",
    false: "The point is made only here, or the overlap is a deliberate summary the reader needs.",
   },
  );

  questions[qid(index, "claim_exceeds_context")] = noul(
   `${at} states something more certain or more sweeping than \`context\` supports.`,
   {
    true: "The passage asserts a result, guarantee, or scale that `context` does not establish.",
    false: "The strength of the wording matches what `context` establishes, including its hedges.",
   },
  );

  questions[qid(index, "reads_natural_for_locale")] = noul(
   `${at} reads as natural, idiomatic prose in \`locale\` for the document described in \`context\`.`,
   {
    true: "A fluent reader of `locale` would accept the wording, register, and phrasing as ordinary for this kind of document.",
    false:
     "The wording is stilted, mechanically translated, or in a register that does not fit `locale` " +
     "and this document, so a reader would notice the language before the content.",
   },
  );
 });

 return questions;
}

const SIGNAL_IDS = [
 ["carriesInformation", "carries_information"],
 ["restatesOther", "restates_other_passage"],
 ["claimExceedsContext", "claim_exceeds_context"],
 ["readsNaturalForLocale", "reads_natural_for_locale"],
];

export function decide(response, state, _args = {}) {
 const { available, reason } = judgmentAvailability(response);
 const passages = asArray(state?.passages);

 const annotated = passages.map((text, index) => {
  const signals = Object.fromEntries(
   SIGNAL_IDS.map(([key, suffix]) => [key, readNoul(response, qid(index, suffix))]),
  );
  const values = Object.values(signals);
  return {
   index,
   text, // returned verbatim; this pack does not edit
   signals,
   focus: focusOf(signals),
   priorityScore: priorityScore(signals),
   unknownSignals: anyUnknown(values),
  };
 });

 // A reading order, not a reordering of the document: `passages` above stays in
 // document order and is what a caller writes back.
 const priorityOrder = annotated
  .filter((p) => p.priorityScore !== null)
  .slice()
  .sort((a, b) => b.priorityScore - a.priorityScore || a.index - b.index)
  .map((p) => p.index);
 const unranked = annotated.filter((p) => p.priorityScore === null).map((p) => p.index);

 return {
  pack: name,
  judgmentsAvailable: available,
  degraded: reason,
  locale: state?.locale ?? null,
  passageCount: passages.length,
  passages: annotated,
  priorityOrder,
  unranked,
  rewritten: false,
  authorshipJudged: false,
  advisoryOnly: true,
  note: available ? ADVISORY_NOTE : unavailableNote(reason),
 };
}

/**
 * Editing attention as a single number, only when every signal is present.
 * A partially answered passage stays unranked rather than being scored against
 * assumed values.
 */
function priorityScore(signals) {
 const { carriesInformation, restatesOther, claimExceedsContext, readsNaturalForLocale } = signals;
 if ([carriesInformation, restatesOther, claimExceedsContext, readsNaturalForLocale].some((v) => v === null)) {
  return null;
 }
 return (1 - carriesInformation) + restatesOther + claimExceedsContext + (1 - readsNaturalForLocale);
}

/** Short reasons a human might open this passage first. */
function focusOf(signals) {
 const reasons = [];
 if (signals.carriesInformation !== null && signals.carriesInformation <= ADVISORY_BANDS.low) {
  reasons.push("may carry no information of its own");
 }
 if (signals.restatesOther !== null && signals.restatesOther >= ADVISORY_BANDS.high) {
  reasons.push("may restate another passage");
 }
 if (signals.claimExceedsContext !== null && signals.claimExceedsContext >= ADVISORY_BANDS.high) {
  reasons.push("may claim more than context supports");
 }
 if (signals.readsNaturalForLocale !== null && signals.readsNaturalForLocale <= ADVISORY_BANDS.low) {
  reasons.push("may read unnatural for the locale");
 }
 if (reasons.length === 0) {
  return Object.values(signals).every((v) => v === null) ? ["no signals available"] : ["nothing flagged"];
 }
 return reasons;
}

export function render(result, _state) {
 const blocks = [heading(`${name} — ${result.passageCount} passage(s), none rewritten`)];

 if (result.passageCount === 0) {
  blocks.push("No passages in state. Nothing to judge; nothing changed.");
  return report(blocks);
 }

 blocks.push(
  result.passages
   .map((p) => {
    const head = `${p.index + 1}. ${preview(p.text)}`;
    const signals =
     `   signals: ` +
     signalLine([
      ["carries information", p.signals.carriesInformation],
      ["restates another passage", p.signals.restatesOther],
      ["claim exceeds context", p.signals.claimExceedsContext],
      ["natural for locale", p.signals.readsNaturalForLocale],
     ]);
    return [head, signals, `   focus: ${p.focus.join("; ")}`].join("\n");
   })
   .join("\n\n"),
 );

 const order =
  result.priorityOrder.length > 0
   ? `Suggested editing order: ${result.priorityOrder.map((i) => i + 1).join(", ")}`
   : "Suggested editing order: none available.";
 const unranked =
  result.unranked.length > 0
   ? `Unranked (incomplete signals): ${result.unranked.map((i) => i + 1).join(", ")}`
   : "";

 blocks.push([order, unranked].filter(Boolean).join("\n"));
 blocks.push(
  `${result.note}\nThe passages above are your text, unchanged. This pack proposes where to edit, ` +
  "never what to write, and makes no claim about who or what wrote a passage.",
 );
 return report(blocks);
}
