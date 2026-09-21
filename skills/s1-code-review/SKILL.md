---
name: s1-code-review
description: "Review the changes since a fixed point (commit, branch, tag, or merge-base) along two axes: Standards (does the code follow this repo's documented coding standards?) and Spec (does the code match what the originating issue/spec asked for?). Runs both reviews in parallel sub-agents and reports them side by side. Use when the user wants to review a branch, a PR, work-in-progress changes, or asks to \"review since X\"."
license: MIT
---

Two-axis review of the diff between `HEAD` and a fixed point the user supplies:

- **Standards**: does the code conform to this repo's documented coding standards?
- **Spec**: does the code faithfully implement the originating issue / spec?

Both axes run as **parallel sub-agents** so they don't pollute each other's context, then this skill aggregates their findings.

## Process

### 1. Pin the fixed point

Whatever the user said is the fixed point (a commit SHA, branch name, tag, `main`, `HEAD~5`, etc.). If they didn't specify one, ask for it.

Capture the diff command once: `git diff <fixed-point>...HEAD` (three-dot, so the comparison is against the merge-base). Also note the list of commits via `git log <fixed-point>..HEAD --oneline`.

Before going further, confirm the fixed point resolves (`git rev-parse <fixed-point>`) and the diff is non-empty. A bad ref or empty diff should fail here, not inside two parallel sub-agents.

### 2. Identify the spec source

Look for the originating spec, in this order:

1. Issue references in the commit messages (`#123`, `Closes #45`, GitLab `!67`, etc.). Fetch them with whatever issue-tracker access this repo already has: a documented workflow under `docs/`, a configured CLI (`gh`, `glab`), or a URL the user gives you. If none is available, treat the issue as unfetched and say so rather than guessing at its contents.
2. A path the user passed as an argument.
3. A spec file under `docs/`, `specs/`, or `.scratch/` matching the branch name or feature.
4. If nothing is found, ask the user where the spec is. If they say there isn't one, the **Spec** sub-agent will skip and report "no spec available".

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

**Standards sub-agent prompt** should include:

- The full diff command and commit list.
- The list of standards-source files you found in step 3, **plus the smell baseline from step 3** pasted in full (the sub-agent has no other access to it).
- The brief: "Report, per file/hunk where relevant, (a) every place the diff violates a documented standard: cite the standard (file + the rule); and (b) any baseline smell you spot: name it and quote the hunk. Distinguish hard violations from judgement calls: documented-standard breaches can be hard, but baseline smells are always judgement calls, and a documented repo standard overrides the baseline. Skip anything tooling enforces. Under 400 words."

**Spec sub-agent prompt** should include:

- The diff command and commit list.
- The path or fetched contents of the spec.
- The brief: "Report: (a) requirements the spec asked for that are missing or partial; (b) behaviour in the diff that wasn't asked for (scope creep); (c) requirements that look implemented but where the implementation looks wrong. Quote the spec line for each finding. Under 400 words."

If the spec is missing, skip the Spec sub-agent and note this in the final report.

Both briefs carry the same instruction about tests: "Read the tests that cover the changed behavior, including tests the diff does not touch. Find them by searching the test tree for the changed symbols and file names. A behavior missing from the diff's test changes is not evidence that it is untested; only report a missing test after you have looked and found none, and say where you looked."

### 5. Jev pass on the findings (advisory)

Read `../jev-advisory.md` first; it covers the command, degradation, and the limits.

Once both sub-agents have reported, extract their findings into `job.json`:

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

```bash
# Claude Code
node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" review-findings --state job.json --json

# Oh My Pi: replace the placeholder with the absolute skill directory shown by the host
(cd "<skill-directory>" && node "../../src/cli.mjs" review-findings --state job.json --json)
```

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

Exit code 3 with `"mode":"unavailable"` means no usable Jev result came back. Finish the review exactly as written above, report both axes in full, and say that no Jev pass ran. Never describe an unavailable run as a pass.

### 6. Aggregate

Present the two reports under `## Standards` and `## Spec` headings, verbatim or lightly cleaned. Do **not** merge or rerank findings, because the two axes are deliberately separate (see _Why two axes_).

End with a one-line summary: total findings per axis, and the worst issue _within each axis_ (if any). Don't pick a single winner across axes: that's the reranking the separation exists to prevent.

If a Jev pass ran, say so in one line and mark the labels advisory. If it did not run, say that too.

## Why two axes

A change can pass one axis and fail the other:

- Code that follows every standard but implements the wrong thing → **Standards pass, Spec fail.**
- Code that does exactly what the issue asked but breaks the project's conventions → **Spec pass, Standards fail.**

Reporting them separately stops one axis from masking the other.

---

Adapted from `code-review` by Matt Pocock (MIT). The bounded-candidate evidence shape with `noMatch`, and passing covering tests as context, follow the design of `jev-review` by Dev Agrawal (MIT); its threshold filtering, severity ranking, and dashboard are deliberately not adopted. See `../../NOTICE` and `../../audit.json`.
