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
 *
 * Model state (`buildState`): reference first, then the material under
 * judgment, and nothing code-only. Here `context` leads and `items` becomes a
 * plain list of text; ids stay local.
 */

// Replace `noul` and `readNoul` together when the designed question is Choice or Score.
import { noul } from "../src/jev.mjs";
import {
 ADVISORY_NOTE,
 asArray,
 asText,
 heading,
 isPlainObject,
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

/** Message for exit 2, or null. Validate the exact state shape before building a payload. */
export function validateState(state) {
 if (!Array.isArray(state?.items)) return "State requires an `items` array";
 if (typeof state.context !== "string") return "State requires a string `context`";
 for (const [index, item] of state.items.entries()) {
  if (!isPlainObject(item)) return `State requires \`items[${index}]\` to be an object`;
  if (typeof item.text !== "string") return `State requires \`items[${index}].text\` to be a string`;
  if (item.id !== undefined && typeof item.id !== "string") {
   return `State requires \`items[${index}].id\` to be a string when present`;
  }
 }
 return null;
}

/** The only state sent to the model. Every backticked path in a question must resolve here. */
export function buildState(state) {
 const out = {};
 if (asText(state?.context).trim() !== "") out.context = asText(state.context);
 out.items = asArray(state?.items).map((item) => asText(item?.text));
 return out;
}

export function buildQuestions(state, _args = {}) {
 const items = asArray(state?.items);
 const questions = {};

 items.forEach((item, index) => {
  if (asText(item?.text).trim() === "") return;
  // Ask a question, name the state it compares, and say what to attend to.
  // Criteria say what each outcome covers and what it is not for.
  // Ask for the narrowest observable fact, judged on the item itself.
  questions[qid(index, "carries_information")] = noul(
   {
    question: `Does \`items[${index}]\` state a fact, result, claim, constraint, or instruction?`,
    inspect: `\`items[${index}]\``,
    focus: "Judge what the item says, not how well it says it.",
   },
   {
    true: { what: "Says something specific the reader can act on, check, or disagree with" },
    false: {
     what: "Only greets, announces, frames, thanks, or summarizes without saying anything specific",
     not_for: "A short transition the reader needs to follow the argument",
    },
   },
  );
 });

 return questions;
}

export function decide(response, state, _args = {}) {
 const { available, reason } = judgmentAvailability(response);
 const items = asArray(state?.items);

 // Same list, same order, same fields as the input. Do not mutate `state`.
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
  // This skeleton retains every item; remove this field if it is not meaningful
  // to the migrated skill rather than inventing a second reporting convention.
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

 blocks.push(`${result.note}\nSignals are advisory; they do not decide what to remove, approve, or change.`);
 return report(blocks);
}
