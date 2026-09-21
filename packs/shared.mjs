/**
 * Helpers shared by the judgment packs.
 *
 * Two rules drive everything here:
 *
 *  1. A missing, malformed, or out-of-range answer is `null` — "unknown" — and
 *     never a default value. Packs degrade to their deterministic result rather
 *     than inventing a probability.
 *  2. A probability is an advisory signal. The bands below are display buckets
 *     chosen for readability. They are not thresholds calibrated on this
 *     repository's data, and no pack may treat a band as a decision.
 */

/** Human wording for an unknown probability, used in every renderer. */
export const UNKNOWN = "unknown";

// Display/attention bands only. Not calibrated approval or rejection thresholds.
export const ADVISORY_BANDS = Object.freeze({ low: 0.35, high: 0.65 });

export const ADVISORY_NOTE =
 "Jev answers are advisory signals for a human reviewer. They are not proof, " +
 "not approval, and the display bands in this report are readability buckets " +
 "rather than thresholds validated on this repository.";

/** Reason text when the workflow ran without any judgments at all. */
export function unavailableNote(reason) {
 return (
  `Jev judgments unavailable (${reason}). Every item in this report is kept ` +
  "and shown without advisory signals; the deterministic part of this pack is " +
  "unaffected."
 );
}

/**
 * `{ available, reason }` for a CLI response.
 *
 * `answers: null` is the degraded path the CLI takes when no API key is set, and
 * also what `--dry-run` produces. `mode: "not-needed"` is the path where the
 * pack asked nothing at all, so its empty answers are not judgments either.
 * All of them mean: no judgments, keep working.
 */
export function judgmentAvailability(response) {
 if (response?.mode === "not-needed") {
  return { available: false, reason: "no questions were needed for this state" };
 }
 const answers = response?.answers;
 if (answers === null || answers === undefined) {
  return { available: false, reason: response?.degraded ?? "no answers returned" };
 }
 if (!isPlainObject(answers)) {
  return { available: false, reason: "malformed answers payload" };
 }
 return { available: true, reason: null };
}

/**
 * Probability for a noul question id, or `null` when the answer is absent or
 * not a usable probability. The runtime validates ranges; this stays
 * conservative so a pack can never read a half-present payload as a signal.
 */
export function readNoul(response, id) {
 const answers = response?.answers;
 if (!isPlainObject(answers)) return null;
 const answer = answers[id];
 if (!isPlainObject(answer)) return null;
 if (answer.type !== "noul") return null;
 const value = answer.noul;
 if (!isUnitNumber(value)) return null;
 return value;
}

/**
 * `{ choice, confidence }` for a choice question, or `null` when the answer is
 * absent, names a label that was not offered, or is missing its confidence or
 * probabilities. A label outside `allowed` is a malformed answer, not a new
 * option, and a half-formed choice answer is unknown rather than a selection.
 */
export function readChoice(response, id, allowed = null) {
 const answers = response?.answers;
 if (!isPlainObject(answers)) return null;
 const answer = answers[id];
 if (!isPlainObject(answer)) return null;
 if (answer.type !== "choice") return null;
 const selected = answer.choice;
 if (typeof selected !== "string" || selected === "") return null;
 if (allowed && !allowed.includes(selected)) return null;
 if (!isUnitNumber(answer.confidence)) return null;
 if (allowed && !coversLabels(answer.probabilities, allowed)) return null;
 return { choice: selected, confidence: answer.confidence };
}

/** A distribution is usable only when it scores exactly the offered labels. */
function coversLabels(probabilities, allowed) {
 if (!isPlainObject(probabilities)) return false;
 const keys = Object.keys(probabilities);
 if (keys.length !== allowed.length) return false;
 return allowed.every((label) => isUnitNumber(probabilities[label]));
}

function isUnitNumber(value) {
 return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

/**
 * Display bucket for a probability. `unknown` is a first-class outcome: it means
 * the pack has no signal, not that the signal was negative.
 */
export function band(probability) {
 if (probability === null) return UNKNOWN;
 if (probability >= ADVISORY_BANDS.high) return "leans yes";
 if (probability <= ADVISORY_BANDS.low) return "leans no";
 return "unclear";
}

/** `62%`, or `unknown` when there is no probability. */
export function pct(probability) {
 return probability === null ? UNKNOWN : `${Math.round(probability * 100)}%`;
}

/** Highest probability among the given values, ignoring unknowns. */
export function maxKnown(values) {
 const known = values.filter((v) => typeof v === "number");
 return known.length === 0 ? null : Math.max(...known);
}

/** True when at least one of the values is unknown. */
export function anyUnknown(values) {
 return values.some((v) => v === null);
}

/**
 * A plain data object: what a JSON payload or a state file produces. Arrays and
 * exotic objects are malformed input, never a record to read fields from.
 */
export function isPlainObject(value) {
 if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
 const proto = Object.getPrototypeOf(value);
 return proto === Object.prototype || proto === null;
}

export function asArray(value) {
 return Array.isArray(value) ? value : [];
}

export function asText(value) {
 return typeof value === "string" ? value : "";
}

/** One-line preview for report output. */
export function preview(text, limit = 96) {
 const flat = asText(text).replace(/\s+/g, " ").trim();
 if (flat.length <= limit) return flat;
 return `${flat.slice(0, limit - 1)}…`;
}

/** Report section helper: title plus a rule of the same width. */
export function heading(title) {
 return `${title}\n${"─".repeat(title.length)}`;
}

/** Join report blocks, dropping empties, and end with exactly one newline. */
export function report(blocks) {
 return `${blocks.filter(Boolean).join("\n\n")}\n`;
}

/** `signals` block printed under each item, or the unknown marker. */
export function signalLine(entries) {
 return entries.map(([label, value]) => `${label} ${pct(value)} (${band(value)})`).join(" · ");
}
