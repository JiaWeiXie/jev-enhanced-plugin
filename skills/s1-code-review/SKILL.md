---
name: s1-code-review
description: Review a working tree, PR, branch, or fixed-point change set against repository standards and requested behavior. Use when the user asks for a code review, PR or branch review, review of uncommitted work, or review since a commit, tag, branch, or merge-base.
license: MIT
---

Two-axis review of a selected change set:

- **Standards**: does the code conform to this repo's documented coding standards?
- **Spec**: does the code faithfully implement the originating issue or spec?

Both axes run as **parallel sub-agents**, then this skill aggregates their findings.

## Process

### 1. Select and capture the change set

If the user supplies a complete patch or before/after example, review that material directly. Record its limits; repository discovery is unnecessary unless the requested claims need missing context.

Use the scope the user names. If they ask for uncommitted work, or ask for a review without naming a comparison, review the working tree:

- Capture staged and unstaged tracked changes with `git diff HEAD`.
- List untracked, non-ignored files with `git ls-files --others --exclude-standard`; append a `git diff --no-index -- /dev/null <file>` patch for each relevant file.
- Treat the combined patch as the review material. Stop if it is empty. There is no commit range to infer a spec from; use a user-supplied spec or an existing repository source.

For a PR, resolve its actual base and head through the repository tracker; do not assume the local `HEAD` is the PR head. For a named commit, branch, tag, or merge-base, resolve the reference and use local `HEAD` as the head unless the user specifies another. Capture `git diff <base>...<head>` and `git log <base>..<head> --oneline`. The three-dot patch compares from the merge-base. A bad reference stops the review.

Finish scope selection with the exact target, complete captured patch, and any excluded or unavailable material recorded. An empty patch ends with a no-changes report.

### 2. Identify the spec source

Use the first available source, in this order:

1. Requirements in the current conversation, or a spec path, issue, or URL the user supplied.
2. Issue references in the relevant commit messages (for a fixed-point review). Fetch them through the repository's documented workflow or configured tracker CLI; if unavailable, say it was not fetched rather than guessing.
3. A file under `docs/`, `specs/`, or `.scratch/` that matches the branch or feature.
4. If no source is available, continue the Standards review and mark Spec as unavailable. Ask for clarification only when competing sources or ambiguous requirements would change the review.

### 3. Identify the standards sources

Anything in the repo that documents how code should be written, such as `CODING_STANDARDS.md` or `CONTRIBUTING.md`.

On top of whatever the repo documents, the Standards axis always carries the **smell baseline** below: a fixed set of Fowler code smells (_Refactoring_, ch.3) that applies even when a repo documents nothing. Two rules bind it:

- **The repo overrides.** A documented repo standard always wins; where it endorses something the baseline would flag, suppress the smell.
- **Always a judgement call.** Each smell is a labelled heuristic ("possible Feature Envy"), never a hard violation. Like any standard here, skip anything tooling already enforces.

Report a smell only when the changed code demonstrates a concrete maintenance
consequence; a matching label or a trivial expression alone is not evidence.
Do not pad the report with weak guesses. Verify runtime claims using the
project's actual language and module mode; when not executed, label the claim
as source-based reasoning and do not invent exact errors or universal outcomes.

Each smell reads *what it is* → *how to fix*; match it against the diff:

- **Mysterious Name**: a function, variable, or type whose name doesn't reveal what it does or holds. → rename it; if no honest name comes, the design's murky.
- **Duplicated Code**: the same logic shape appears in more than one hunk or file in the change. → extract the shared shape, call it from both.
- **Feature Envy**: a method that reaches into another object's data more than its own. → move the method onto the data it envies.
- **Data Clumps**: the same few fields or params keep travelling together (a type wanting to be born). → bundle them into one type, pass that.
- **Primitive Obsession**: a primitive or string standing in for a domain concept that deserves its own type. → give the concept its own small type.
- **Repeated Switches**: the same `switch`/`if`-cascade on the same type recurs across the change. → replace with polymorphism, or one map both sites share.
- **Shotgun Surgery**: one logical change forces scattered edits across many files in the diff. → gather what changes together into one module.
- **Divergent Change**: one file or module is edited for several unrelated reasons. → split so each module changes for one reason.
- **Speculative Generality**: abstraction, parameters, or hooks added for needs the spec doesn't have. → delete it; inline back until a real need shows.
- **Message Chains**: long `a.b().c().d()` navigation the caller shouldn't depend on. → hide the walk behind one method on the first object.
- **Middle Man**: a class or function that mostly just delegates onward. → cut it, call the real target direct.
- **Refused Bequest**: a subclass or implementer that ignores or overrides most of what it inherits. → drop the inheritance, use composition.

### 4. Spawn both sub-agents in parallel

Give each sub-agent the **complete review patch**, a short target summary (working tree or `<fixed-point>...HEAD`), and the relevant commit list when the target has one. Do not give a command in place of the patch; untracked working-tree files have no normal commit diff.

**Standards sub-agent prompt** also includes the standards-source files from step 3 and the full smell baseline above. Ask it to report every grounded finding, per file/hunk: (a) each documented-standard violation, citing the source file and rule; and (b) each baseline smell with the quoted hunk and concrete maintenance consequence. Mark documented breaches separately from judgement calls; the repo overrides the baseline. Skip tooling-enforced matters. Be concise without omitting findings.

**Spec sub-agent prompt** also includes the fetched spec text. Ask it to report every grounded finding: (a) missing or partial requirements; (b) unrequested behavior; and (c) apparently implemented requirements whose implementation is wrong. Quote the relevant spec line for each finding. Be concise without omitting findings.

Both briefs require: read tests that cover the changed behavior, including unchanged tests. Find them by changed symbols and file names. A missing test change is not evidence of no coverage; report a missing test only after searching and state where you searched. If no spec is available, do not spawn the Spec sub-agent; retain that fact for aggregation.

Require each active reviewer to account for every changed file or hunk, noting inspected material with no findings and any coverage limits. Completion is coverage of the captured change set, not reaching a word count.

### 5. Jev pass on the findings (advisory)

Read `../jev-advisory.md` first. After both reports, create a task-local `job.json` at an absolute path:

Populate it with the reports' findings and their minimal supporting text:

```json
{
  "findings": [
    { "axis": "standards", "file": "src/cache.ts", "line": 42,
      "claim": "possible Feature Envy: reaches into Session state",
      "evidence": "const ttl = session.policy.ttl; ...",
      "candidates": [
        { "id": "c1", "excerpt": "const ttl = session.policy.ttl;", "file": "src/cache.ts", "line": 42 },
        { "id": "c2", "excerpt": "session.policy.refresh(now);", "file": "src/cache.ts", "line": 51 }
      ] }
  ],
  "diff": "<the minimal diff TEXT for the hunks under review>",
  "standards": "<the TEXT of the standard rules that were cited>",
  "spec": "<the TEXT of the spec lines that were cited>",
  "contextTests": "<the TEXT of the tests that cover this code, changed or not>"
}
```

Jev reads the state and nothing else. It cannot open a file, resolve a path, or run a
command, so every field that is supposed to be evidence must contain the actual text.
A command line, a path, a file name, or a summary is provenance, and the state carries
none of it: keep the diff command and the spec path in your report text, where a reader
can trace an excerpt back. Paste the minimum that answers the question; leave whole
files out.

`axis` is `"standards"` or `"spec"`. Every finding needs `evidence`: the quoted hunk or spec line the sub-agent cited. A finding whose evidence you cannot paste as text goes into the report unjudged, and you say why. Never substitute a path to make a finding judgeable.

`candidates` is a bounded list of real excerpts copied out of the diff or the files it touches, each with the file and line it came from. The judgment picks among them, or answers `noMatch`. Never synthesize an excerpt, never paraphrase one, and keep the list short enough that every entry is a line a reader could go and look at.

`contextTests` is optional and worth filling in. Gather the tests that exercise the changed behavior, whether or not the diff touched them: search the test tree by symbol and by file name, not by what appears in the diff, and paste their text. **A test's absence from the diff does not mean the behavior is untested**, and a diff that changes no tests is not by itself a finding. If you looked and found nothing, say that you looked. When `contextTests` is absent the pack reports `testCoverage.status: "unknown"` for every finding; that is missing information, never a test gap, and you must not report it as one.

Use the shared command with the `review-findings` pack. Start with `--dry-run`; remove it only after the user authorizes the minimal live payload.

The pack asks whether each finding's evidence supports its claim (`evidenceSupports`),
whether the cited standard or spec text documents the basis for it (`basisDocumented`),
and, when `contextTests` is supplied, whether a test already covers the behavior
(`coveredByTests`). A separate Choice picks which supplied candidate excerpt the finding
is really about, or answers `noMatch`.

Whether a finding sits inside the change is arithmetic on the hunk headers of `diff`, so
the pack computes it and never asks: every finding carries
`withinDiff: { status, reason }`, where `status` is `inside`, `outside`, or `unknown`.
`unknown` means the finding has no `file` or no integer `line`, or `diff` had no
parseable hunks; it is missing location information, and it says nothing about whether
the finding is right.

Use the result only to:

- label a finding inside its own axis (`Jev (advisory, p=0.34): evidence may not support this claim`);
- attach the chosen excerpt to the finding so the reader can check it;
- report `withinDiff` and the coverage reading beside the finding. The coverage wording
  is a leaning: `may lack a covering test` stays exactly that wording, and never becomes
  "no covering test found".

`noMatch` means the evidence set is inadequate: go back to the diff, the files, and the tests, and either attach a real excerpt or rewrite the finding. It never means the finding is wrong, and it is never a reason to drop it.

Never let a judgment delete a finding, filter findings by a probability threshold, truncate the list, change a finding's axis, or rank findings across axes by severity. Cross-axis reranking is the exact thing the two-axis split exists to prevent, and a threshold silently turns an advisory number into a gate.

If Jev is unavailable, complete all active review axes from evidence and follow the shared reporting rules.

### 6. Aggregate

Present the two reports under `## Standards` and `## Spec` headings, verbatim or lightly cleaned. Do **not** merge or rerank findings, because the two axes are deliberately separate (see _Why two axes_).

End with a one-line summary: total findings per axis, and the worst issue _within each axis_ (if any). Don't pick a single winner across axes: that's the reranking the separation exists to prevent.

Account for every grounded finding in its original axis, report review coverage limits, and distinguish unavailable spec coverage from a clean Spec result. Follow the shared rules for reporting the actual Jev mode; dry-run and mock are not live judgments.

## Why two axes

A change can pass one axis and fail the other:

- Code that follows every standard but implements the wrong thing → **Standards pass, Spec fail.**
- Code that does exactly what the issue asked but breaks the project's conventions → **Spec pass, Standards fail.**

Reporting them separately stops one axis from masking the other.

---

Adapted from `code-review` by Matt Pocock (MIT). The bounded-candidate evidence shape with `noMatch`, and passing covering tests as context, follow the design of `jev-review` by Dev Agrawal (MIT); its threshold filtering, severity ranking, and dashboard are deliberately not adopted. See `../../NOTICE` and `../../audit.json`.
