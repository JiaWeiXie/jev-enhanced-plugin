---
name: s1-migrate-skill
description: Port an existing agent skill into the jev-enhanced-plugin repository as an `s1-` skill, with a license audit, a judgment pack of TypeSafe Jev questions (Noul, Choice, Score) with its model-state builder, the adapted SKILL.md, live wording checks, tests, and docs. Use when the user asks to migrate, port, or adapt a skill into this plugin, or to add or improve a Jev/System One judgment pack here; for TypeSafe in other applications use the typesafe-ai skill, and not for unrelated new skills.
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
- Question ids are for code, are stable, and are unique across the whole request. Positional ids (`finding_3_evidence_relation`) are fine; caller-supplied ids must be checked for duplicates.
- Put the full meaning in `instructions` and `criteria`. Reference state with backticked paths such as `` `findings[0].claim` ``.
- Make each `instructions` one narrow, complete judgment that points at the state it reads. Question form ("Does `x` …?") and directive form ("Determine the category of `x`") both appear in TypeSafe's examples; for a Noul, question form makes the yes outcome explicit. Use the structured form `{ question, compare | inspect, focus }` when the judgment compares state fields or needs a scope note; a short, unambiguous instruction may stay a string.
- Give criteria that separate near misses: `{ what, not_for, examples }` per Choice label or Noul outcome, with the same field names across options. `not_for` names the case a reader would otherwise put on the wrong side.
- When a "does the evidence support it" judgment can fail in two ways, use a Choice (`supports` / `contradicts` / `says_nothing`) rather than a Noul, so an unrelated quote and a contradicting one stay distinct. Check first in code whether the quote exists at all.
- Keep questions in English even for non-English state. Jev's primary training language is English; other languages, including CJK, are accepted with lower accuracy, so a zh-TW judgment warrants more human review.
- Never ask about authorship, machine generation, approval, or equivalence. Never ask what code can check exactly.
- Never send a watched literal, credential, customer data, or whole file as part of a question.
- Ask for the narrowest observable act, not an abstract property. "Would a copy editor leave this as it is?" separated stock phrasing from plain text far better than "Is this natural?", and "Does this state a fact, claim, or instruction?" beat "Does this tell the reader something new?".
- Do not compare against a field that may already contain the answer. When `context` held a passage's source facts, "does it tell the reader something `context` doesn't?" read correct passages as empty.
- Skip, in code, any question whose field is empty or whose comparison has nothing to compare with, and report it as `not asked`. An empty field turns a question into noise that still returns a confident-looking number.

## Step 3b: design the model state

The job file the skill writes and the state Jev reads are different objects. Export `buildState(state)` and return only what the questions reference:

- Leave out every code-only field: diffs used for arithmetic, watch lists, graph ids, prerequisites, file paths, line numbers.
- Compute what code can compute (an opening paragraph, a language name for a locale tag) and add it as its own field, so the question points at it instead of asking the model to find it.
- Put reference material first and the material under judgment after: contract before code, spec before findings, request before draft, context before passages. In live checks, moving `contract` ahead of `before`/`after` turned a missed behavior change into a caught one without new false positives.
- When the text of a Choice option is what the model weighs (a candidate excerpt, a skill description), put it in the option value, not in state as well.
- Every backticked path in a question must resolve to non-empty text in `buildState(state)`. The registry-wide path test enforces this.

## Step 3c: check the wording live, with the user's permission

Wording is empirical; TypeSafe's docs say to test phrasings on your own data. With the user's permission and a `TYPESAFE_API_KEY`, send 4 to 8 synthetic labeled cases (half should lean yes, half no) through two or three candidate wordings in one request each, and keep the wording that separates them best. Keep example phrases in criteria distinct from the test cases, or the check measures copying. Record the cases and results in the pull request, not in the repository.

Write the questions down in the pack header before writing code; they are the reviewable artifact.

## Step 4: write the pack

Copy `references/pack-template.mjs` to `packs/<pack>.mjs` and replace its sample state and sample signal; it is a working Noul-shaped skeleton, not a generic implementation. If the questions use Choice or Score, change the `noul` import and the corresponding answer reader deliberately. A pack exports:

```
name            string, the CLI argument and registry key
description     one line
validateState   (state) => string | null   // error message for exit 2, or null
buildState      (state) => modelState      // the only state sent to the model
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
2. `PATH_STATES` entries, one rich and one sparse (optional fields empty). The path test builds the model state from each and fails when a question names a field that `buildState` left out or left empty.
3. Behavior tests, one per invariant that a plausible bug would break: unknown on missing and on malformed answers; input order and count preserved; deterministic part unchanged when every answer flips from 0 to 1; no approval field or wording in result or report; code-only fields (watch lists, diffs, graph ids, paths, line numbers) absent from both `buildQuestions(state)` and `buildState(state)`; questions the state cannot support are absent and reported as `not asked`.

Test through `decide` and `render` output, not through property-name scans or question-id substrings.

## Step 7: register and document

- No manifest entry is needed: hosts discover `skills/*/SKILL.md`; confirm the actual target host does so before claiming availability.
- Add a row to both README tables: `## Skills` (skill, pack, what the pack answers) and `### Adapted skills` (upstream, author, license).
- Add a dry-run fixture `evals/<pack>-state.json` in the pack's state shape, with synthetic text only. It is what Step 8 runs, and it doubles as the example a reader copies into `job.json`.
- Add a replay fixture `evals/<pack>-mock.json`: `{"answers": {…}}` with a well-formed value for **every** question id. `src/jev.mjs` validates a replay as strictly as a live response, so one missing or mistyped id makes the whole run degrade with exit 3. The `unknown` path is covered by the Step 6 tests, not by this fixture.
- Add a synthetic case to `evals/evals.json` comparing the adapted skill against the original on the behaviors the pack is meant to support. Results stay outside the repo.

## Step 8: verify

Run the project's targeted pack tests and syntax check, then use the shared CLI instructions in `../jev-advisory.md` with the concrete `<pack>`, first with `--dry-run` and then with the replay fixture. The dry run must exit 0 and print the exact Step 3 questions and the Step 3b model state with `answers: null`; a validation error (exit 2) means the fixture and pack header disagree. The replay must exit 0, preserve every input item, and show every signal as advisory. Do not run the skill's real data live during migration: the user must authorize both the run and the minimal data it sends. The Step 3c wording check uses synthetic cases only, and also needs the user's permission.

Report what was migrated, what was deliberately left out, and the license decision, in that order.

## Refusals

Stop and tell the user when:

- the upstream license cannot be established, or forbids modification or redistribution;
- the only candidate judgment points are authority decisions (Step 2), so a pack would exist only to lend a probability to a decision it must not make;
- the skill cannot build a payload without secrets or whole private files.
