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
 *     context?: string     // what the document is for, and what its reader knows
 *   }
 *
 * The model reads `buildState(state)`: the locale tag becomes a language name
 * in code, because a tag is one more hop for the model to resolve. The
 * question that compares against `context` is asked only when it has text, and
 * the restatement question only when there is another passage to compare with;
 * a question that was not asked is reported as `not asked`, never as a reading.
 */

import { noul } from "../src/jev.mjs";
import {
 ADVISORY_BANDS, ADVISORY_NOTE,
 anyUnknown,
 asArray,
 asText,
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

/** Language names for common locale tags. Unlisted tags pass through as written. */
const LANGUAGES = Object.freeze({
 en: "English",
 "en-US": "American English",
 "en-GB": "British English",
 zh: "Chinese",
 "zh-TW": "Traditional Chinese as written in Taiwan",
 "zh-Hant": "Traditional Chinese",
 "zh-HK": "Traditional Chinese as written in Hong Kong",
 "zh-CN": "Simplified Chinese as written in mainland China",
 "zh-Hans": "Simplified Chinese",
 ja: "Japanese",
 "ja-JP": "Japanese",
 ko: "Korean",
 "ko-KR": "Korean",
});

/**
 * Boundary examples for the wording question, by language family. They are
 * deliberately not drawn from any test passage. Other languages get none: an
 * example in the wrong language would mislead more than it helps.
 */
const TRADITIONAL_CHINESE = { good: ["部署時間從十分鐘降到兩分鐘。"], bad: ["透過全方位的布局，全面提升用戶體驗", "該方案有效地解決了相關問題"] };
const ENGLISH = { good: ["Deploys now take two minutes instead of ten."], bad: ["serves as a testament to our commitment", "In today's fast-paced landscape"] };

function wordingExamples(locale) {
 const tag = asText(locale).trim();
 if (["zh-TW", "zh-Hant", "zh-HK"].includes(tag)) return TRADITIONAL_CHINESE;
 if (tag.split("-")[0].toLowerCase() === "en") return ENGLISH;
 return null;
}

export function languageOf(locale) {
 const tag = asText(locale).trim();
 if (tag === "") return "the language the passages are written in";
 return LANGUAGES[tag] ?? `the language and region of locale "${tag}"`;
}

function hasContext(state) {
 return asText(state?.context).trim() !== "";
}

/** Which signals this state can support. Arithmetic on the state, not a judgment. */
function askedSignals(state) {
 const passages = asArray(state?.passages);
 return {
  carriesInformation: true,
  restatesOther: passages.length > 1,
  claimExceedsContext: hasContext(state),
  readsNaturalForLocale: true,
 };
}

/** What the model reads: language and context first, then the passages under judgment. */
export function buildState(state) {
 const out = { language: languageOf(state?.locale) };
 if (hasContext(state)) out.context = asText(state.context);
 out.passages = asArray(state?.passages).map(asText);
 return out;
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
 const asked = askedSignals(state);
 const examples = wordingExamples(state?.locale);
 const questions = {};

 passages.forEach((_passage, index) => {
  const at = `\`passages[${index}]\``;

  // Asks what the passage says, judged on the passage alone. Comparing it with
  // `context` failed in live checks: when `context` held the source facts,
  // a passage that stated them read as telling the reader nothing new.
  questions[qid(index, "carries_information")] = noul(
   {
    question: `Does ${at} state a fact, result, claim, constraint, or instruction?`,
    inspect: at,
    focus: "Judge what the passage says, not how well it says it. A wrong or overstated claim still counts.",
   },
   {
    true: {
     what: "Says something specific the reader can act on, check, or disagree with",
     examples: ["Deploys now take two minutes instead of ten.", "Back up the database before upgrading."],
    },
    false: {
     what: "Only greets, announces, frames, thanks, or summarizes without saying anything specific",
     examples: ["Here is a quick overview of what's new.", "We hope you enjoy these improvements."],
    },
   },
  );

  if (asked.restatesOther) questions[qid(index, "restates_other_passage")] = noul(
   {
    question: `Does ${at} repeat a point that another entry of \`passages\` already makes?`,
    compare: [at, "`passages`"],
    focus: "Compare the points made, not the wording used.",
   },
   {
    true: { what: "Another passage already makes the same point; this one adds wording, not content" },
    false: {
     what: "The point is made only here",
     not_for: "A deliberate summary the reader needs, such as a closing recap of a long document",
    },
   },
  );

  if (asked.claimExceedsContext) questions[qid(index, "claim_exceeds_context")] = noul(
   {
    question: `Does ${at} state something more certain or more sweeping than \`context\` supports?`,
    compare: [at, "`context`"],
    focus: "Compare the strength of each claim with what `context` establishes, including its hedges.",
   },
   {
    true: {
     what: "The passage asserts a result, guarantee, or scale that `context` does not establish",
     examples: ["\"eliminates all downtime\" when `context` reports fewer incidents"],
    },
    false: { what: "The strength of the wording matches what `context` establishes" },
   },
  );

  // Asked as the narrow, observable act ("would an editor reword it?") rather
  // than "is it natural?": in live checks on en-US and zh-TW passages, the
  // editor wording separated stock phrasing from plain text far more sharply.
  questions[qid(index, "reads_natural_for_locale")] = noul(
   {
    question: `Would a copy editor who writes \`language\` leave ${at} as it is, without rewording it?`,
    inspect: at,
    focus: "Judge wording only. The facts, technical terms, product names, and code do not count.",
   },
   {
    true: {
     what: "Plain, specific wording a fluent writer of `language` would use",
     ...(examples ? { examples: examples.good } : {}),
    },
    false: {
     what: "Filler, abstract nouns stacked where a verb would do, promotional hype, stock phrasing, or regional usage that does not fit `language`",
     ...(examples ? { examples: examples.bad } : {}),
    },
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
 const asked = askedSignals(state);

 const annotated = passages.map((text, index) => {
  const signals = Object.fromEntries(
   SIGNAL_IDS.map(([key, suffix]) => [key, asked[key] ? readNoul(response, qid(index, suffix)) : null]),
  );
  const values = SIGNAL_IDS.filter(([key]) => asked[key]).map(([key]) => signals[key]);
  return {
   index,
   text, // returned verbatim; this pack does not edit
   signals,
   focus: focusOf(signals),
   priorityScore: priorityScore(signals, asked),
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
  // Signals this state could not support, so no question was sent for them.
  notAsked: SIGNAL_IDS.filter(([key]) => !asked[key]).map(([key]) => key),
  priorityOrder,
  unranked,
  rewritten: false,
  authorshipJudged: false,
  advisoryOnly: true,
  note: available ? ADVISORY_NOTE : unavailableNote(reason),
 };
}

/** Each signal's contribution to editing attention: high means "look here". */
const ATTENTION = {
 carriesInformation: (p) => 1 - p,
 restatesOther: (p) => p,
 claimExceedsContext: (p) => p,
 readsNaturalForLocale: (p) => 1 - p,
};

/**
 * Editing attention as a single number over the signals that were asked, only
 * when every asked signal is present. A partially answered passage stays
 * unranked rather than being scored against assumed values.
 */
function priorityScore(signals, asked) {
 const keys = Object.keys(ATTENTION).filter((key) => asked[key]);
 if (keys.some((key) => signals[key] === null)) return null;
 return keys.reduce((total, key) => total + ATTENTION[key](signals[key]), 0);
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
  (result.notAsked.length > 0 ? `Not asked (the state cannot support them): ${result.notAsked.join(", ")}\n` : "") +
  `${result.note}\nThe passages above are your text, unchanged. This pack proposes where to edit, ` +
  "never what to write, and makes no claim about who or what wrote a passage.",
 );
 return report(blocks);
}
