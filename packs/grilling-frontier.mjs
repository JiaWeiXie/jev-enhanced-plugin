/**
 * grilling-frontier — which open question can be asked next.
 *
 * The frontier is graph arithmetic, so code owns it: a question is askable when
 * it is not already settled and every one of its prerequisites is settled. That
 * answer is exact, and a probability must never override it — an unmet
 * prerequisite keeps a question blocked no matter what any judgment says.
 *
 * Jev is used for one thing only: noticing that `context` may already contain
 * the user's answer, or that a question needs a decision only the user can make.
 * Both are advisory. Nothing in this pack moves an id into `settled`; settling a
 * question is the user's act.
 *
 * State:
 *   {
 *     questions: [{ id, text, prerequisites: [id] }],
 *     settled:   [id],    // ids the user has already answered
 *     context:   string   // the conversation / document so far
 *   }
 *
 * `id` is optional; a question without one gets the positional id `q<n>`, which
 * is what `prerequisites` and `settled` must then use.
 *
 * The model reads `buildState(state)`: the text of the askable questions only,
 * renumbered in order, plus `context`. Ids, prerequisites, settled and blocked
 * questions are graph bookkeeping for code and are never sent. The
 * already-answered question is asked only when `context` has text.
 */

import { noul } from "../src/jev.mjs";
import {
 ADVISORY_BANDS, ADVISORY_NOTE,
 asArray,
 heading,
 isPlainObject,
 judgmentAvailability,
 preview,
 readNoul,
 report,
 signalLine,
 unavailableNote,
} from "./shared.mjs"

export const name = "grilling-frontier";
export const description = "Deterministic prerequisite frontier for open questions, with advisory user-decision signals.";

/** Positional fallback id, so prerequisite graphs work without hand-written ids. */
function idOf(question, index) {
 const raw = question?.id;
 return typeof raw === "string" && raw !== "" ? raw : `q${index + 1}`;
}

function qid(id, suffix) {
 return `question_${id}_${suffix}`;
}

/**
 * Structural gate for the CLI. Effective ids — written or positional — must be
 * unique, because they are what `prerequisites` and `settled` refer to.
 */
export function validateState(state) {
 if (!Array.isArray(state?.questions)) return "State requires a `questions` array";
 if (typeof state?.context !== "string") return "State requires a string `context`";

 const ids = new Set();
 for (const [index, question] of state.questions.entries()) {
  const at = `questions[${index}]`;
  if (!isPlainObject(question)) return `State requires \`${at}\` to be an object`;
  if (typeof question.text !== "string") return `State requires \`${at}.text\` to be a string`;
  const id = idOf(question, index);
  if (ids.has(id)) return `State requires unique question ids (\`${id}\` repeats at \`${at}\`)`;
  ids.add(id);
  if (question.prerequisites !== undefined) {
   if (!Array.isArray(question.prerequisites)) return `State requires \`${at}.prerequisites\` to be an array`;
   for (const [position, prerequisite] of question.prerequisites.entries()) {
    if (typeof prerequisite !== "string") return `State requires \`${at}.prerequisites[${position}]\` to be a string`;
   }
  }
 }

 if (state.settled !== undefined) {
  if (!Array.isArray(state.settled)) return "State requires `settled` to be an array";
  for (const [index, id] of state.settled.entries()) {
   if (typeof id !== "string") return `State requires \`settled[${index}]\` to be a string`;
  }
 }
 return null;
}

/**
 * The open questions whose prerequisites are all settled, in state order. Settled
 * questions need no advice; blocked ones are not asked, because their signals
 * would be stale by the time a prerequisite is settled and `context` changes.
 */
function askable(state) {
 const settled = new Set(asArray(state?.settled));
 return asArray(state?.questions)
  .map((question, index) => ({ question, id: idOf(question, index) }))
  .filter(({ question, id }) => {
   if (settled.has(id)) return false;
   const prerequisites = asArray(question?.prerequisites).filter((p) => typeof p === "string");
   return prerequisites.every((p) => settled.has(p));
  });
}

function hasContext(state) {
 return typeof state?.context === "string" && state.context.trim() !== "";
}

/** What the model reads: `context` when it has text, then askable question text, renumbered. */
export function buildState(state) {
 const out = {};
 if (hasContext(state)) out.context = state.context;
 out.questions = askable(state).map(({ question }) => question.text);
 return out;
}

export function buildQuestions(state, _args = {}) {
 const withContext = hasContext(state);
 const out = {};

 askable(state).forEach(({ id }, position) => {
  const at = `\`questions[${position}]\``;

  if (withContext) out[qid(id, "already_answered_in_context")] = noul(
   {
    question: `Does \`context\` already contain the user's answer to ${at}?`,
    compare: [at, "`context`"],
    focus: "Look for a position the user stated, not a topic the conversation mentioned.",
   },
   {
    true: {
     what: `The user stated, in \`context\`, a position that answers ${at}; asking again would repeat it back`,
    },
    false: {
     what: `${at} is still open`,
     not_for: "A related remark that touches the topic without answering the question",
    },
   },
  );

  out[qid(id, "needs_user_decision")] = noul(
   {
    question: `Does ${at} ask for a preference or trade-off that only the user can settle?`,
    ...(withContext ? { compare: [at, "`context`"] } : { inspect: at }),
    focus: "Separate the user's priorities from facts that code, documentation, or context can establish.",
   },
   {
    true: { what: "Answering requires the user's priorities, taste, risk appetite, or knowledge only they hold" },
    false: {
     what: "The answer is a fact that the conversation, the codebase, or documentation can establish",
    },
   },
  );
 });

 return out;
}

export function decide(response, state, _args = {}) {
 const { available, reason } = judgmentAvailability(response);
 const withContext = hasContext(state);

 const rawQuestions = asArray(state?.questions);
 const settledIds = asArray(state?.settled).filter((id) => typeof id === "string");
 const settled = new Set(settledIds);
 const knownIds = new Set(rawQuestions.map((q, i) => idOf(q, i)));

 const annotated = rawQuestions.map((question, index) => {
  const id = idOf(question, index);
  const prerequisites = asArray(question?.prerequisites).filter((p) => typeof p === "string");

  // Conservative: a prerequisite id that matches no question and is not in
  // `settled` counts as unmet. An unresolvable reference is not a free pass.
  const unmet = prerequisites.filter((p) => !settled.has(p));
  const unknownRefs = prerequisites.filter((p) => !settled.has(p) && !knownIds.has(p));

  const isSettled = settled.has(id);
  const eligible = !isSettled && unmet.length === 0;

  const notAsked = !isSettled && eligible && !withContext ? ["alreadyAnsweredInContext: `context` is empty"] : [];
  const signals = isSettled
   ? { alreadyAnsweredInContext: null, needsUserDecision: null }
   : {
    alreadyAnsweredInContext: readNoul(response, qid(id, "already_answered_in_context")),
    needsUserDecision: readNoul(response, qid(id, "needs_user_decision")),
   };

  return {
   id,
   index,
   text: question?.text ?? null,
   prerequisites,
   unmetPrerequisites: unmet,
   unknownPrerequisites: unknownRefs,
   // Deterministic status. Judgments do not enter this line.
   status: isSettled ? "settled" : eligible ? "ready" : "blocked",
   eligible,
   signals,
   // Questions the state could not support, so none was sent. Not a reading.
   notAsked,
   advisory: advisoryFor(isSettled, eligible, signals),
  };
 });

 return {
  pack: name,
  judgmentsAvailable: available,
  degraded: reason,
  questions: annotated,
  ready: annotated.filter((q) => q.status === "ready").map((q) => q.id),
  blocked: annotated
   .filter((q) => q.status === "blocked")
   .map((q) => ({ id: q.id, unmetPrerequisites: q.unmetPrerequisites })),
  // Echoed unchanged: this pack never settles a question.
  settled: settledIds,
  autoSettled: [],
  eligibilityIsDeterministic: true,
  advisoryOnly: true,
  note: available ? ADVISORY_NOTE : unavailableNote(reason),
 };
}

function advisoryFor(isSettled, eligible, signals) {
 if (isSettled) return ["already settled by the user"];
 const notes = [];
 if (signals.alreadyAnsweredInContext !== null && signals.alreadyAnsweredInContext >= ADVISORY_BANDS.high) {
  notes.push("context may already hold the user's answer — confirm rather than re-ask");
 }
 if (signals.needsUserDecision !== null && signals.needsUserDecision <= ADVISORY_BANDS.low) {
  notes.push("may be derivable from context without asking");
 }
 if (signals.needsUserDecision !== null && signals.needsUserDecision >= ADVISORY_BANDS.high) {
  notes.push("genuinely needs the user's decision");
 }
 if (!eligible) notes.push("blocked regardless of the signals above");
 if (notes.length === 0) {
  notes.push(
   Object.values(signals).every((v) => v === null) ? "no signals available" : "nothing flagged",
  );
 }
 return notes;
}

export function render(result, _state) {
 const blocks = [heading(`${name} — ${result.questions.length} question(s)`)];

 if (result.questions.length === 0) {
  blocks.push("No questions in state. Nothing to judge.");
  return report(blocks);
 }

 const line = (q) => {
  const head = `[${q.status}] ${q.id}: ${preview(q.text)}`;
  const blockedBy =
   q.unmetPrerequisites.length > 0 ? `   blocked by: ${q.unmetPrerequisites.join(", ")}` : "";
  const unknown =
   q.unknownPrerequisites.length > 0
    ? `   unresolved prerequisite id(s): ${q.unknownPrerequisites.join(", ")}`
    : "";
  const signals =
   q.status === "settled"
    ? ""
    : "   signals: " +
    signalLine([
     ["already answered in context", q.signals.alreadyAnsweredInContext],
     ["needs user decision", q.signals.needsUserDecision],
    ]);
  const notAsked = q.notAsked.length > 0 ? `   not asked: ${q.notAsked.join("; ")}` : "";
  return [head, blockedBy, unknown, signals, notAsked, `   note: ${q.advisory.join("; ")}`].filter(Boolean).join("\n");
 };

 blocks.push(result.questions.map(line).join("\n\n"));
 blocks.push(
  `Askable now: ${result.ready.length > 0 ? result.ready.join(", ") : "none"}\n` +
  `Settled (unchanged by this pack): ${result.settled.length > 0 ? result.settled.join(", ") : "none"}`,
 );
 blocks.push(
  `${result.note}\nPrerequisites decide what is askable; a question is settled only when the user ` +
  "answers it, never by this pack.",
 );
 return report(blocks);
}
