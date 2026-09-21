import * as reviewFindings from "./review-findings.mjs";
import * as humanizer from "./humanizer.mjs";
import * as replyCheck from "./reply-check.mjs";
import * as simplifyGate from "./simplify-gate.mjs";
import * as grillingFrontier from "./grilling-frontier.mjs";

export const packs = Object.fromEntries(
  [reviewFindings, humanizer, replyCheck, simplifyGate, grillingFrontier].map((p) => [p.name, p]),
);

export function getPack(name) {
  return packs[name] ?? null;
}
