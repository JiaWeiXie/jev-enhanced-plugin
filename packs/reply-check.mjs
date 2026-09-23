/**
 * reply-check — does the draft answer the request that was actually made?
 *
 * Split by what each part is good at:
 *   - The literal strings in `state.banned` are located in code. A literal is
 *     an exact substring, so its position in `draft` is a fact, not a
 *     probability, and a model has nothing to add. A match is not a violation:
 *     the same words can be a quotation, a code sample, or the subject under
 *     discussion.
 *     Matches are reported as inspection candidates with their positions, and
 *     the calling skill — which knows its own protected spans, such as fenced
 *     code or quoted text — decides what counts. This pack parses no markup.
 *   - Whether the draft leads with its answer, and whether it hands work back
 *     to the requester, are meaning questions. Those are Nouls, and they are
 *     advisory.
 *
 * State:
 *   {
 *     draft:         string,     // the reply under review
 *     request:       string,     // what the requester asked for
 *     requestItems?: [string],   // optional: each question or instruction in `request`
 *     banned?:       [string]    // optional literal strings to locate in the draft
 *   }
 *
 * The model sees `buildState(state)`, not this state: `banned` never leaves the
 * process, and the draft's opening paragraph (text up to the first blank line)
 * is cut in code so the answer-first question points at it directly.
 *
 * With `requestItems`, coverage is one Noul per item and the pack reports the
 * weakest one, following the "iterate in code, ask per item" guidance for
 * anything that resembles counting. Without it, one holistic Noul is asked.
 */

import { noul } from "../src/jev.mjs";
import {
 ADVISORY_BANDS, ADVISORY_NOTE,
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

export const name = "reply-check";
export const description =
 "Answer-first and delegation signals for a draft reply; watched literals located exactly in code.";

const IDS = {
 answerFirst: "answer_first",
 delegatesBack: "delegates_back",
 coversRequest: "covers_request",
 addsUnrequestedScope: "adds_unrequested_scope",
};

/** Structural gate for the CLI: both texts must be present as strings. */
export function validateState(state) {
 for (const field of ["draft", "request"]) {
  if (typeof state?.[field] !== "string") return `State requires a string \`${field}\``;
 }
 if (state.requestItems !== undefined) {
  if (!Array.isArray(state.requestItems)) return "State requires `requestItems` to be an array";
  for (const [index, item] of state.requestItems.entries()) {
   if (typeof item !== "string") return `State requires \`requestItems[${index}]\` to be a string`;
  }
 }
 return null;
}

/** The draft up to its first blank line: what a reader sees before deciding to read on. */
export function openingOf(draft) {
 const text = asText(draft).replace(/\r\n/g, "\n").trim();
 return text.split(/\n[ \t]*\n/)[0].trim();
}

function requestItemsOf(state) {
 return asArray(state?.requestItems).filter((item) => typeof item === "string" && item.trim() !== "");
}

function itemId(index) {
 return `covers_request_item_${index}`;
}

/**
 * What the model reads, request first and draft after. Watched literals are
 * located in code and stay out of it.
 */
export function buildState(state) {
 const out = { request: asText(state?.request) };
 const items = requestItemsOf(state);
 if (items.length > 0) out.requestItems = items;
 out.draftOpening = openingOf(state?.draft);
 out.draft = asText(state?.draft);
 return out;
}

export function buildQuestions(state, _args = {}) {
 if (asText(state?.draft).trim() === "") return {};
 const items = requestItemsOf(state);

 const questions = {
  [IDS.answerFirst]: noul(
   {
    question: "Does `draftOpening` give the answer, result, or decision that `request` asks for?",
    compare: ["`draftOpening`", "`request`"],
    focus: "`draftOpening` is the first paragraph of `draft`. Judge it alone.",
   },
   {
    true: { what: "A reader who stops after `draftOpening` already has what they asked for" },
    false: {
     what: "The opening restates the request, describes process, sets up context, or warms up",
     examples: ["\"Let's take a look at this.\"", "\"Good question.\""],
    },
   },
  ),
  [IDS.delegatesBack]: noul(
   {
    question: "Does `draft` hand work back to the requester that `request` asked the writer to do?",
    compare: ["`draft`", "`request`"],
    focus: "Look for instructions to the requester to run, check, decide, or find something.",
   },
   {
    true: { what: "`draft` tells the requester to do something that was part of the assignment" },
    false: {
     what: "Any action left to the requester is genuinely theirs",
     not_for: "A decision only the requester can make, or access only they have",
    },
   },
  ),
  [IDS.addsUnrequestedScope]: noul(
   {
    question: "Does `draft` report work or recommendations that `request` did not ask for?",
    compare: ["`draft`", "`request`"],
    focus: "Look for material the requester now has to read and judge that falls outside the request.",
   },
   {
    true: { what: "`draft` contains material outside the request" },
    false: {
     what: "`draft` stays within what `request` asked for",
     not_for: "A short risk or blocker the requester needs to act on the answer",
    },
   },
  ),
 };

 if (items.length === 0) {
  questions[IDS.coversRequest] = noul(
   {
    question: "Does `draft` address every question and instruction in `request`?",
    compare: ["`request`", "`draft`"],
    focus: "An explicit statement of why an item was not done counts as addressed.",
   },
   {
    true: { what: "Each asked item has an answer or an explicit reason it was not done" },
    false: { what: "At least one asked item is silently missing from `draft`" },
   },
  );
  return questions;
 }

 items.forEach((_item, index) => {
  const at = `\`requestItems[${index}]\``;
  questions[itemId(index)] = noul(
   {
    question: `Does \`draft\` answer or carry out ${at}?`,
    compare: [at, "`draft`"],
    focus: "An explicit statement of why the item was not done counts as addressed.",
   },
   {
    true: { what: `\`draft\` answers ${at}, or says plainly why it was not done` },
    false: { what: `\`draft\` never deals with ${at}` },
   },
  );
 });
 return questions;
}

/**
 * Exact substring search: every occurrence, with 1-based line and column.
 * Positions only — whether an occurrence is legitimate (quoted, inside a code
 * sample, or the topic itself) is for the caller to judge against its own
 * protected spans.
 */
export function findLiterals(draft, literals) {
 const text = asText(draft);
 const matches = [];

 for (const literal of literals) {
  if (typeof literal !== "string" || literal === "") continue;
  const occurrences = [];
  let from = 0;
  for (; ;) {
   const at = text.indexOf(literal, from);
   if (at === -1) break;
   const before = text.slice(0, at);
   const line = before.split("\n").length;
   const column = at - (before.lastIndexOf("\n") + 1) + 1;
   occurrences.push({ index: at, line, column });
   from = at + 1; // overlapping occurrences are occurrences too
  }
  if (occurrences.length > 0) {
   matches.push({ literal, count: occurrences.length, occurrences });
  }
 }

 return matches;
}

function watchedLiterals(state) {
 const configured = asArray(state?.banned).filter((s) => typeof s === "string" && s !== "");
 return [...new Set(configured)];
}

/**
 * Whole-request coverage. Per item, the weakest item decides: one unaddressed
 * item leaves the request uncovered. Any unanswered item makes it unknown.
 */
function coverageOf(response, state) {
 const items = requestItemsOf(state);
 if (items.length === 0) return { value: readNoul(response, IDS.coversRequest), items: [] };
 const perItem = items.map((text, index) => ({ index, text, covered: readNoul(response, itemId(index)) }));
 const values = perItem.map((item) => item.covered);
 return { value: values.some((v) => v === null) ? null : Math.min(...values), items: perItem };
}

export function decide(response, state, _args = {}) {
 const { available, reason } = judgmentAvailability(response);
 const coverage = coverageOf(response, state);

 const literals = watchedLiterals(state);
 const literalMatches = findLiterals(state?.draft, literals);

 const signals = {
  answerFirst: readNoul(response, IDS.answerFirst),
  delegatesBack: readNoul(response, IDS.delegatesBack),
  coversRequest: coverage.value,
  addsUnrequestedScope: readNoul(response, IDS.addsUnrequestedScope),
 };

 return {
  pack: name,
  judgmentsAvailable: available,
  degraded: reason,
  // Exact positions, found in code, present with or without judgments.
  // These are inspection candidates, not rulings: the caller applies its own
  // quote and code-span exceptions.
  literals: {
   watched: literals,
   matches: literalMatches,
   matchCount: literalMatches.reduce((total, m) => total + m.count, 0),
   exactMatch: true,
   verdict: null,
  },
  // Advisory. Unknown when the answer is missing.
  signals,
  // Per-item coverage when `requestItems` was supplied; empty otherwise.
  requestItems: coverage.items,
  attention: attentionOf(signals),
  advisoryOnly: true,
  note: available ? ADVISORY_NOTE : unavailableNote(reason),
 };
}

function attentionOf(signals) {
 const reasons = [];
 if (signals.answerFirst !== null && signals.answerFirst <= ADVISORY_BANDS.low) reasons.push("may not lead with the answer");
 if (signals.delegatesBack !== null && signals.delegatesBack >= ADVISORY_BANDS.high) reasons.push("may hand assigned work back");
 if (signals.coversRequest !== null && signals.coversRequest <= ADVISORY_BANDS.low) reasons.push("may leave part of the request unanswered");
 if (signals.addsUnrequestedScope !== null && signals.addsUnrequestedScope >= ADVISORY_BANDS.high) {
  reasons.push("may report unrequested work");
 }
 if (reasons.length > 0) return reasons;
 return Object.values(signals).every((v) => v === null) ? ["no signals available"] : ["nothing flagged"];
}

export function render(result, state) {
 const blocks = [heading(`${name} — draft reply`)];

 if (asText(state?.draft).trim() === "") {
  blocks.push("No draft in state. Nothing to check.");
  return report(blocks);
 }

 blocks.push(`draft: ${preview(state.draft, 120)}`);

 if (result.literals.watched.length === 0) {
  blocks.push("Watched literals: none configured (`state.banned` is empty).");
 } else if (result.literals.matches.length === 0) {
  blocks.push(
   `Watched literals: no exact match for the ${result.literals.watched.length} configured string(s) in \`draft\`.`,
  );
 } else {
  blocks.push(
   [
    "Exact literal matches (found in code, not judged) — inspection candidates, not violations:",
   ]
    .concat(
     result.literals.matches.map(
      (m) =>
       `  "${m.literal}" ×${m.count} at ` +
       m.occurrences.map((o) => `${o.line}:${o.column}`).join(", "),
     ),
    )
    .concat([
     "  An occurrence inside quoted text, a code sample, or a discussion of the phrase itself is",
     "  legitimate; this pack reports positions and applies no exceptions of its own.",
    ])
    .join("\n"),
  );
 }

 blocks.push(
  "Signals: " +
  signalLine([
   ["answer first", result.signals.answerFirst],
   ["delegates work back", result.signals.delegatesBack],
   ["covers whole request", result.signals.coversRequest],
   ["adds unrequested scope", result.signals.addsUnrequestedScope],
  ]) +
  `\nAttention: ${result.attention.join("; ")}`,
 );

 if (result.requestItems.length > 0) {
  blocks.push(
   ["Coverage per request item:"]
    .concat(result.requestItems.map((item) => `  ${item.index + 1}. ${preview(item.text, 80)}: ${signalLine([["addressed", item.covered]])}`))
    .join("\n"),
  );
 }

 blocks.push(result.note);
 return report(blocks);
}
