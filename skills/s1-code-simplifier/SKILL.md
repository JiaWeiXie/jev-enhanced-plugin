---
name: s1-code-simplifier
description: Simplify code for clarity and maintainability without changing behavior. Use when the user asks to simplify or refactor code, or when another skill needs a post-change cleanup pass.
license: Apache-2.0
---

# Code simplifier

Refine only code modified in the current session, unless the user names a broader scope. Preserve its observable behavior: inputs, outputs, errors, side effects, and ordering.

## Refinement process

1. **Set the scope.** Identify the changed hunks and their callers. Leave unrelated code untouched.
2. **Read local precedent.** Follow documented repository standards (`CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING.md`, and style guides) and the surrounding code's established conventions. Do not introduce a language or framework convention merely because it is familiar.
3. **Make the smallest clear rewrite.** Remove redundancy and obsolete comments; flatten needless nesting; use names that reveal purpose; and consolidate logic that belongs together. Keep helpful abstractions and separations of concern. Prefer explicit, debuggable code over clever compression.
4. **Check the behavioral contract.** Compare the before and after hunks for return values, failure paths, types, side effects, and ordering. Run the focused tests that exercise the changed behavior. If no such coverage exists, exercise the relevant path with a temporary smoke test and inspect the affected callers. Record what ran and any behavior that could not be verified.
5. **Finish only when the result is clearer.** Keep a rewrite only when it reduces real complexity or makes the code easier to understand and extend. If no such improvement exists, make no change. Mention only changes that alter a reader's understanding.

## Jev rewrite check (advisory)

Read `../jev-advisory.md` first. Build a task-local, absolute-path `job.json` containing the smallest original and rewritten hunk plus the contract:

```json
{
  "before": "<the original function or hunk>",
  "after": "<your rewritten version>",
  "contract": "<observable inputs, outputs, errors, side effects, and ordering that must not change>"
}
```

Use the shared command with the `simplify-gate` pack. Start with `--dry-run`; remove it only after the user authorizes the live payload. The pack identifies places to inspect, never proves equivalence.

For every live signal, reread the relevant code and test the suspected path. A missing signal is not a pass. Keep the normal source inspection and test result as the basis for accepting or reverting the rewrite; report any live value only as `Jev (advisory, p=…)`.

---

Adapted from the `code-simplifier` agent by Anthropic (Apache-2.0), packaged here as a skill. See `../../NOTICE` and `../../audit.json`.
