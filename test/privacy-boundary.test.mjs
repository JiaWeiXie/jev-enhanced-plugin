import test from "node:test";
import assert from "node:assert/strict";
import { packs } from "../packs/registry.mjs";

const marker = "LOCAL-ONLY-BOUNDARY-7821";
const local = { diff: marker, file: marker, path: marker, line: 7821, watchList: [marker], apiKey: marker, unexpected: { marker } };
const fixtures = {
  "review-findings": {
    input: { standards: "Rules", spec: "Contract", contextTests: "Tests", findings: [{ ...local, axis: "standards", claim: "Claim", evidence: "Evidence", candidates: [{ id: "a", text: marker }] }] },
    expected: { standards: "Rules", spec: "Contract", contextTests: "Tests", findings: [{ claim: "Claim", evidence: "Evidence" }] },
  },
  humanizer: {
    input: { locale: "zh-TW", context: "Audience", passages: ["Approved passage"] },
    expected: { language: "Traditional Chinese as written in Taiwan", context: "Audience", passages: ["Approved passage"] },
  },
  "reply-check": {
    input: { request: "Request", requestItems: ["Item", ""], draft: "Opening.\n\nBody.", banned: [marker] },
    expected: { request: "Request", requestItems: ["Item"], draftOpening: "Opening.", draft: "Opening.\n\nBody." },
  },
  "simplify-gate": {
    input: { contract: "Contract", before: "return 1", after: "return 2" },
    expected: { contract: "Contract", before: "return 1", after: "return 2" },
  },
  "grilling-frontier": {
    input: { context: "Context", settled: ["done"], questions: [{ id: "done", text: marker }, { id: "next", text: "Next question", prerequisites: ["done"], file: marker }, { id: "blocked", text: marker, prerequisites: ["next"] }] },
    expected: { context: "Context", questions: ["Next question"] },
  },
};

test("every registered pack has an explicit model-state boundary contract", () => {
  assert.deepEqual(Object.keys(packs).sort(), Object.keys(fixtures).sort());
});
for (const [name, { input, expected }] of Object.entries(fixtures)) {
  test(`${name}: only approved state fields survive the projection`, () => {
    const state = { ...local, ...input };
    const before = structuredClone(state);
    assert.equal(packs[name].validateState(state), null);
    const output = packs[name].buildState(state);
    assert.deepEqual(output, expected);
    assert.ok(!JSON.stringify(output).includes(marker), "local bookkeeping did not enter model state");
    assert.deepEqual(state, before, "local input was preserved");
  });
}
