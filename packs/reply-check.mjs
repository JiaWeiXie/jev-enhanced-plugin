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
 *     draft:   string,     // the reply under review
 *     request: string,     // what the requester asked for
 *     banned:  [string]    // optional literal strings to locate in the draft
 *   }
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
 return null;
}

export function buildQuestions(state, _args = {}) {
 if (asText(state?.draft).trim() === "") return {};

 return {
  [IDS.answerFirst]: noul(
   "The first sentence of `draft` gives the answer, result, or decision that `request` asks for.",
   {
    true: "A reader who stops after the first sentence already has what they asked for.",
    false:
     "The opening restates the request, describes process, sets up context, or warms up, so the " +
     "answer arrives later in `draft`.",
   },
  ),
  [IDS.delegatesBack]: noul(
   "`draft` hands work back to the requester that `request` asked the writer to do.",
   {
    true: "`draft` tells the requester to run, check, decide, or find something that was part of the assignment.",
    false:
     "Any action left to the requester is genuinely theirs: a decision only they can make, or access " +
     "only they have.",
   },
  ),
  [IDS.coversRequest]: noul("Every question and instruction in `request` is addressed somewhere in `draft`.", {
   true: "Each asked item has a corresponding answer or an explicit statement of why it was not done.",
   false: "At least one asked item is silently missing from `draft`.",
  }),
  [IDS.addsUnrequestedScope]: noul("`draft` reports work or recommendations that `request` did not ask for.", {
   true: "`draft` contains material outside the request that the requester now has to read and judge.",
   false: "`draft` stays within what `request` asked for.",
  }),
 };
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

export function decide(response, state, _args = {}) {
 const { available, reason } = judgmentAvailability(response);

 const literals = watchedLiterals(state);
 const literalMatches = findLiterals(state?.draft, literals);

 const signals = {
  answerFirst: readNoul(response, IDS.answerFirst),
  delegatesBack: readNoul(response, IDS.delegatesBack),
  coversRequest: readNoul(response, IDS.coversRequest),
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

 blocks.push(result.note);
 return report(blocks);
}
