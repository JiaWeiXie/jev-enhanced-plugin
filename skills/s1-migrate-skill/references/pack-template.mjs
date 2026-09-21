/**
 * <pack-name> — <one line: what this pack adds to the skill, and what it never does>.
 *
 * Deterministic parts (computed in code, present with or without judgments):
 *   - <e.g. exact literal positions, graph eligibility, diff membership>
 * Judged parts (advisory, `unknown` when the answer is missing or malformed):
 *   - <question 1 in one sentence>
 *   - <question 2 in one sentence>
 *
 * State:
 *   {
 *     items:   [{ id?, text }],   // the things under review, in the caller's order
 *     context: string             // the minimum evidence needed to answer
 *   }
 */

import { noul } from "../src/jev.mjs";
import {
 ADVISORY_NOTE,
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

export const name = "<pack-name>";
export const description = "<one line; state what it never does>";

const SIGNALS = [
 ["carriesInformation", "carries_information"],
];

function qid(index, suffix) {
 return `item_${index}_${suffix}`;
}

/** Message for exit 2, or null. Shape only; content is the caller's. */
export function validateState(state) {
 if (!Array.isArray(state?.items)) return "State requires an array: items";
 if (state.items.some((item) => !item || typeof item.text !== "string")) return "Every item needs a text field";
 if (typeof state.context !== "string") return "State requires text fields: context";
 return null;
}

export function buildQuestions(state, _args = {}) {
 const items = asArray(state?.items);
 const questions = {};

 items.forEach((item, index) => {
  if (asText(item?.text).trim() === "") return;
  questions[qid(index, "carries_information")] = noul(
   `\`items[${index}].text\` tells the reader something not already stated in \`context\`.`,
   {
    true: "A reader who skipped this item would miss a fact, decision, or instruction.",
    false: "The item restates, warms up, or decorates; removing it loses nothing.",
   },
  );
 });

 return questions;
}

export function decide(response, state, _args = {}) {
 const { available, reason } = judgmentAvailability(response);
 const items = asArray(state?.items);

 // Same list, same order, same fields as the input.
 const annotated = items.map((item, index) => ({
  ...item,
  signals: Object.fromEntries(
   SIGNALS.map(([key, suffix]) => [key, readNoul(response, qid(index, suffix))]),
  ),
 }));

 return {
  pack: name,
  judgmentsAvailable: available,
  degraded: reason,
  itemCount: items.length,
  items: annotated,
  droppedItems: 0,
  advisoryOnly: true,
  note: available ? ADVISORY_NOTE : unavailableNote(reason),
 };
}

export function render(result, _state) {
 const blocks = [heading(`${name} — ${result.itemCount} item(s), all retained`)];

 if (result.itemCount === 0) {
  blocks.push("No items in state. Nothing to check.");
  return report(blocks);
 }

 for (const [index, item] of result.items.entries()) {
  blocks.push(
   `[${index}] ${preview(item.text)}\n  ` +
   signalLine([["carries information", item.signals.carriesInformation]]),
  );
 }

 blocks.push(result.note);
 return report(blocks);
}
