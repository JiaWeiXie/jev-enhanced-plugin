---
name: s1-migrate-skill
description: Migrate an existing agent skill into this plugin as an `s1-` skill with advisory TypeSafe Jev judgments. Use when the user asks to port a skill into the plugin, add Jev or System One judgments to a skill, or create a judgment pack for an existing skill.
license: MIT
---

# Migrate a skill to an `s1-` Jev-enhanced skill

Take a skill that already works and add one thing: typed judgments from Jev at the points where the skill previously relied on the agent's own impression. Everything else in the skill stays as it was. The result is a new directory `skills/s1-<name>/` and, usually, a new pack `packs/<pack>.mjs`.

Read `../jev-advisory.md` first. It is the shared contract every migrated skill points to. Treat `src/cli.mjs`, `src/jev.mjs`, `packs/shared.mjs`, and `references/pack-template.mjs` as the local runtime contract: inspect them before designing or changing a pack. Consult the TypeSafe System One documentation only to resolve a primitive-design question; do not change the vendored SDK or invent a local API from the documentation.

Never copy a skill you have not read in full. Never modify the installed original under `~/.agents`, `~/.claude`, or `~/.omp`; read it and copy from it.

## Step 1: license audit

Do this before writing anything. A skill whose license you cannot establish is excluded, not adapted.

1. Locate the installed source and its upstream. `~/.agents/.skill-lock.json` records `sourceUrl` and `skillPath` for skills installed through the skills CLI; plugin caches keep either a root Agent Plugins `plugin.json` or a host manifest such as `.claude-plugin/plugin.json` next to the source.
2. Record the license actually shipped with the component. When the installed copy has no license file, establish the upstream license from its `LICENSE` or another authoritative license declaration and record the evidence; an absent or conflicting license excludes the source.
3. Compute `shasum -a 256` of every installed source file you read, so a later diff can show upstream drift.
4. Add a component to `audit.json` with `decision`, `localPath`, `skillName`, `upstream` (`project`, `url`, `path`, `installedAt`, `sha256`), `license` (`spdx`, `holder`, `text`, `evidence`), `adaptations`, and `guardrails`. Copy the shape of an existing `included` component, and identify the source files represented by each recorded hash.
5. Add a section to `NOTICE` for `skills/s1-<name>/`: upstream, copyright holder, license file, and a `Modifications:` list. Apache-2.0 material requires the notice retention and change notice required by its section 4. CC BY-SA material remains CC BY-SA; preserve its attribution and license notices and do not relicense it.
6. If the license text is not yet in `licenses/`, add it as `licenses/<SPDX>-<owner>-<repo>.txt`.
7. Update the `license` field in `package.json`, root `plugin.json`, and `.claude-plugin/plugin.json` if a new SPDX identifier joins the `AND` expression.

Record also what you deliberately did not copy and why, as the existing components do for `grill-me` and `jev-review`.

## Step 2: find the judgment points

Walk the original skill's procedure step by step and label every step with exactly one of three kinds:

| Kind | Examples | What happens to it |
| --- | --- | --- |
| Deterministic | substring or pattern match, diff boundary, dependency graph, file lookup, count, order | Stays code. Compute it in the pack's `decide`, independent of any answer. |
| Semantic | "does this evidence support the claim", "is this passage restating another", "does the draft lead with the answer" | Becomes a Jev question. |
| Authority | approve, apply, revert, decide for the user, judge who wrote the text, declare two versions equivalent | Stays with the user or the agent's own verification. Never asked, never derived from a probability. |

Keep the list small. A skill with no semantic step gets no pack; adding one anyway is padding. A semantic question is justified only when its answer changes the agent's own inspection, explanation, or wording without making an authority decision.

For each semantic step write down what evidence a reader would need to answer it. That evidence is the pack's state, and it is the minimum text the skill will later send to a third party. Excerpts, not whole files.

## Step 3: design the questions

Pick the primitive by what the answer means:

- Noul for "does this condition hold". One Noul per label when several may apply.
- Choice for "which of these supplied options". Always include a `noMatch` outcome when nothing may fit. The candidates come from the caller or from code; the pack never generates them.
- Score for "how far along this described dimension". Every level must describe a concrete situation.

Rules that the existing packs follow and this one must too:

- One narrow judgment per question. Independent questions over the same state go in one request; they cannot see each other's answers.
- Question ids are for code, are stable, and are unique across the whole request. Positional ids (`finding_3_evidence_supports`) are fine; caller-supplied ids must be checked for duplicates.
- Put the full meaning in `instructions` and `criteria`. Reference state with backticked paths such as `` `findings[0].claim` ``.
- Never ask about authorship, machine generation, approval, or equivalence. Never ask what code can check exactly.
- Never send a watched literal, credential, customer data, or whole file as part of a question.

Write the questions down in the pack header before writing code; they are the reviewable artifact.

## Step 4: write the pack

Copy `references/pack-template.mjs` to `packs/<pack>.mjs` and replace its sample state and sample signal; it is a working Noul-shaped skeleton, not a generic implementation. If the questions use Choice or Score, change the `noul` import and the corresponding answer reader deliberately. A pack exports:

```
name            string, the CLI argument and registry key
description     one line
validateState   (state) => string | null   // error message for exit 2, or null
buildQuestions  (state, args) => { [id]: question }
decide          (response, state, args) => result
render          (result, state) => string
```

`decide` must satisfy these invariants; the tests in Step 6 check them:

- Every input item comes back, in input order, with its original fields. The pack never drops, merges, reranks, relabels, or mutates caller-owned state.
- A missing, malformed, wrong-type, or out-of-range answer reads as `null` through the matching `readNoul` / `readChoice` helper from `shared.mjs`, and `null` is reported as `unknown`. No default value, ever.
- Deterministic results are present whether or not judgments ran, and do not change when the answers change.
- The result carries `advisoryOnly: true`, `judgmentsAvailable`, `degraded`, and `note` (`ADVISORY_NOTE` or `unavailableNote(reason)`).
- No field of the result, and no line of the rendered report, states an approval, a pass, an equivalence, or a verdict. Bands from `band()` are readability buckets; render them next to the probability, never alone as a decision.

Register the module in `packs/registry.mjs`. The CLI discovers packs from there and calls `validateState` before building questions.

## Step 5: write the adapted skill

Create `skills/s1-<name>/SKILL.md`:

- Frontmatter: `name: s1-<name>` (equal to the directory name), a plain-string `description` that retains only the original workflow's real trigger branches, and a `license` that accurately reflects the copied material.
- Keep the original procedure. Rewrite only what the migration requires: dropped companion dependencies, the `s1-` name, and en-US instructions. Target-language examples, quoted patterns, and copyright names stay literal.
- Add one section, `## Jev <what it judges> (advisory)`, at the workflow step where the judgment belongs. It must say `Read ../jev-advisory.md first`, name the concrete pack, and show a `job.json` state shape that matches the pack header field for field. Point to the shared command reference instead of copying host-specific command blocks. State how the signals affect this workflow, its hard limits, the minimal text sent to the third party, the need for permission before the first live run, and the exit-3 fallback.
- End with an attribution line: `Adapted from <upstream> by <holder> (<SPDX>). See ../../NOTICE and ../../audit.json.`

If the original keeps a large reference catalog, split it into `skills/s1-<name>/references/` and copy it verbatim, as `s1-humanizer` does.

Do not add a second convention. The six existing skills are the style guide: read the closest one before writing.

## Step 6: tests

Add to `test/packs.test.mjs`:

1. A `PACK_STATES` entry for the new pack. The registry-wide test requires every registered pack to have one and to survive a run with `answers: {}` and with the degraded response.
2. Behavior tests, one per invariant that a plausible bug would break: unknown on missing and on malformed answers; input order and count preserved; deterministic part unchanged when every answer flips from 0 to 1; no approval field or wording in result or report; watched literals or candidates never appear in the questions when the skill promises that.

Test through `decide` and `render` output, not through property-name scans or question-id substrings.

## Step 7: register and document

- No manifest entry is needed: hosts discover `skills/*/SKILL.md`; confirm the actual target host does so before claiming availability.
- Add a row to both README tables: `## Skills` (skill, pack, what the pack answers) and `### Adapted skills` (upstream, author, license).
- Add a dry-run fixture `evals/<pack>-state.json` in the pack's state shape, with synthetic text only. It is what Step 8 runs, and it doubles as the example a reader copies into `job.json`.
- Add a replay fixture `evals/<pack>-mock.json`: `{"answers": {…}}` with a well-formed value for **every** question id. `src/jev.mjs` validates a replay as strictly as a live response, so one missing or mistyped id makes the whole run degrade with exit 3. The `unknown` path is covered by the Step 6 tests, not by this fixture.
- Add a synthetic case to `evals/evals.json` comparing the adapted skill against the original on the behaviors the pack is meant to support. Results stay outside the repo.

## Step 8: verify

Run the project's targeted pack tests and syntax check, then use the shared CLI instructions in `../jev-advisory.md` with the concrete `<pack>`, first with `--dry-run` and then with the replay fixture. The dry run must exit 0 and print the exact Step 3 questions with `answers: null`; a validation error (exit 2) means the fixture and pack header disagree. The replay must exit 0, preserve every input item, and show every signal as advisory. Do not run live during migration: the user must authorize both the run and the minimal data it sends.

Report what was migrated, what was deliberately left out, and the license decision, in that order.

## Refusals

Stop and tell the user when:

- the upstream license cannot be established, or forbids modification or redistribution;
- the only candidate judgment points are authority decisions (Step 2), so a pack would exist only to lend a probability to a decision it must not make;
- the skill cannot build a payload without secrets or whole private files.
