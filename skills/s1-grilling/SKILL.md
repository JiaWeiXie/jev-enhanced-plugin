---
name: s1-grilling
description: Jev-checked variant of grilling. Stress-test a plan, design, or decision through a dependency-tree interview that asks only questions whose prerequisites are settled, recommends an answer to each, and waits per round; TypeSafe Jev flags questions the conversation already answered. Use when the user says "grill me", "poke holes", "challenge my plan", "stress-test this", "what am I missing", or 幫我挑毛病、質疑我的計畫; not for writing or implementing the plan.
license: MIT
---

Interview the user relentlessly until you reach a shared understanding. Map the work as a **design tree**: each node is either a fact to establish or a user decision, and each edge names a prerequisite.

Build the dependency graph before drafting the round. Work backward from each
decision: which facts, constraints, or choices could change the available options
or your recommendation? Give each unresolved input its own node and put its id in
the dependent decision's `prerequisites`. A dependency can be an unanswered
user-held fact as well as a decision. A condition in a recommendation such as
"choose A unless Q2 says otherwise" is an edge from Q2 to that decision.

Compute the current frontier from this graph. Ask only nodes whose prerequisites
are already settled, not prerequisites that you hope will be answered in the same
round. Put blocked nodes in a short deferred list with their blocking ids; do
not solicit a provisional choice for them. Wait for answers, update the ledger,
then recompute the next frontier.

If an architectural choice depends on unknown contractual constraints or workload,
first ask only for those inputs. The architectural choice follows in a later round;
its implementation strategy follows after that. If the user already supplied those
inputs, record them as settled and ask the choice now. Do not invent dependencies
to delay a decision whose prerequisites are genuinely known.

Keep observed facts, assumptions, and user decisions separate. A fixed budget does
not establish customer count, workload, provider pricing, or feasibility. Preserve
settled constraints. Research environment facts yourself; ask for genuinely
user-held facts you cannot retrieve. For a fact question, say what evidence is needed rather than invent an answer.
Give a recommendation only for a decision whose prerequisites are settled.

Before sending, inspect each proposed question and recommendation for references
to another unanswered node. Add any missing edge, recompute the frontier, and
remove the newly blocked question from the current round. A conditional
recommendation is not a workaround for an unresolved prerequisite.

Format a round like so:

```
❓ **Q1** - **<question title>**: <question body, possibly multiple paragraphs and choices>

➡️ **Evidence needed:** <what would establish the fact>

---

❓ **Q2** - **<question title>**: <question body, possibly multiple paragraphs and choices>

➡️ **Recommendation:** <recommendation grounded in settled prerequisites>
```

Each round the user answers reshapes the tree: settled decisions push the frontier outward and unblock questions that depended on them. Recompute the frontier and ask the next round. A question whose answer depends on another question still open in this round belongs to a _later_ round, not this one.

Finding environment facts is your job, not the user's. Obtain facts available from the filesystem, tools, codebase, or documentation before asking; while that work is pending, it remains an unsettled prerequisite, so ask only the independent frontier. Facts that only the user holds belong in the round. The decisions are the user's: put each to them and wait.

The session is done when the frontier is empty: every reachable node is settled or explicitly abandoned with the user's reason, every dependency has an owner, and nothing material is silently assumed. Summarize the settled tree and ask the user to confirm the shared understanding before acting.

## Checking the frontier with Jev (advisory)

Read `../jev-advisory.md` first; it covers the command, degradation, and the limits.

Before you send a round, write the tree to `job.json`:

```json
{
  "questions": [
    { "id": "constraints", "text": "Which existing requirements constrain the choice?", "prerequisites": [] },
    { "id": "design", "text": "Which design fits those requirements?", "prerequisites": ["constraints"] },
    { "id": "implementation", "text": "How should the chosen design be implemented?", "prerequisites": ["design"] }
  ],
  "settled": [],
  "context": "<one paragraph on the plan under discussion>"
}
```

Run the shared CLI command from `../jev-advisory.md` with pack `grilling-frontier`, first with `--dry-run`. After the user authorizes the minimal `context` excerpt for a live run, remove `--dry-run`; use `--json` when the result will be read programmatically.

The frontier itself is graph arithmetic: a question is on the frontier when every id in its `prerequisites` appears in `settled`. The pack computes that literally. Its state validator requires a `questions` array; `settled` defaults to `[]`, and `context` should be the minimum relevant conversation excerpt. Do not use a judgment to alter eligibility.

What the judgments add is the semantic half the graph cannot see. For each question
that is eligible this round, the pack asks two things:

- `already_answered_in_context`: the `context` you supplied may already hold the user's
  answer, so confirm it before spending a round asking again;
- `needs_user_decision`: the question asks for a preference or trade-off that is
  genuinely the user's call.

Jev receives only `context` and the text of those eligible questions. Ids,
prerequisites, `settled`, and blocked questions stay in code. With an empty
`context`, `already_answered_in_context` is not asked, so paste the relevant
excerpt of the conversation whenever one exists.

Read each answer as a leaning using the display bands in `../jev-advisory.md`: `unknown` means no signal came back for that question. The bands are readability buckets, not decision thresholds.

Use a signal only to reread the question: confirm whether context already answers it, rewrite it, or move it to a later round yourself. Preserve the ledger until evidence or the user's answer settles the node.

The judgments never answer a question, never mark one settled, and never choose for the user. A decision leaves the frontier when the user decides it, and only then. If the pass did not run, ask the round anyway; the design tree is the skill, the judgments are a proofreader.

`mode: "not-needed"` means there were no open questions to ask Jev about, not that the tree is complete. Exit code 3 with `mode: "unavailable"` means no usable Jev result came back: ask the round as written and say the advisory check did not run, unless the user requested a strict output contract.

---

Adapted from `grilling` by Matt Pocock (MIT). See `../../NOTICE` and `../../audit.json`.
