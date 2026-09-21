---
name: s1-grilling
description: Grill the user relentlessly about a plan, decision, or idea. Use when the user wants to stress-test their thinking, or uses any 'grill' trigger phrases.
license: MIT
---

Interview the user relentlessly until you reach a shared understanding. Map this as a **design tree**: every decision branches into the decisions that hang off it.

Build the dependency graph before drafting the round. Work backward from each
decision: which facts, constraints, or choices could change the available options
or your recommendation? Give each unresolved input its own node and put its id in
the dependent decision's `prerequisites`. A dependency can be an unanswered
user-held fact as well as a decision. A condition in a recommendation such as
"choose A unless Q2 says otherwise" is an edge from Q2 to that decision.

Compute the current frontier from this graph. Ask only nodes whose prerequisites
are already settled, not prerequisites that you hope will be answered in the same
round. Put blocked decisions in a short deferred list with their blocking ids; do
not ask for an answer or a provisional choice on them. Wait for answers, update
the ledger, then recompute the next frontier.

If an architectural choice depends on unknown contractual constraints or workload,
first ask only for those inputs. The architectural choice follows in a later round;
its implementation strategy follows after that. If the user already supplied those
inputs, record them as settled and ask the choice now. Do not invent dependencies
to delay a decision whose prerequisites are genuinely known.

Keep observed facts, assumptions, and user decisions separate. A fixed budget does
not establish customer count, workload, provider pricing, or feasibility. Preserve
settled constraints. Research environment facts yourself; ask for genuinely
user-held facts you cannot retrieve. For a fact question, say what evidence is
needed rather than invent a recommended answer. Give a recommendation only for
a decision whose prerequisites are settled.

Before sending, inspect each proposed question and recommendation for references
to another unanswered node. Add any missing edge, recompute the frontier, and
remove the newly blocked question from the current round. A conditional
recommendation is not a workaround for an unresolved prerequisite.

Format a round like so:

```
❓ **Q1** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

➡️ <your recommended answer>

---

❓ **Q2** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

➡️ <your recommended answer>
```

Each round the user answers reshapes the tree: settled decisions push the frontier outward and unblock questions that depended on them. Recompute the frontier and ask the next round. A question whose answer depends on another question still open in this round belongs to a _later_ round, not this one.

Finding _facts_ is your job, never the user's. When a frontier question needs a fact from the environment (filesystem, tools, etc.), dispatch a sub-agent to find it; don't ask the user for anything you could look up yourself. Don't block on it: a running exploration is an unsettled prerequisite, so only the questions downstream of it wait for the sub-agent to report; ask the rest of the frontier now. The _decisions_ are the user's: put each to them and wait.

The session is done when the frontier is empty: every branch of the design tree visited, nothing left silently assumed. Do not act on it until the user confirms you have reached a shared understanding.

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

```bash
# Claude Code
node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" grilling-frontier --state job.json --json

# OpenAI Codex or Oh My Pi: replace the placeholder with the absolute skill directory shown by the host
(cd "<skill-directory>" && node "../../src/cli.mjs" grilling-frontier --state job.json --json)
```

The frontier itself is graph arithmetic: a question is on the frontier when every id in its `prerequisites` appears in `settled`. The pack computes that literally, and you should too; no judgment is involved and none is needed.

What the judgments add is the semantic half the graph cannot see. For each question
that is eligible this round, the pack asks two things:

- `already_answered_in_context`: the `context` you supplied may already hold the user's
  answer, so confirm it before spending a round asking again;
- `needs_user_decision`: the question asks for a preference or trade-off that is
  genuinely the user's call.

Read each answer as a leaning: `leans yes` above 0.65, `leans no` at or below 0.35,
`unclear` in between, and `unknown` when no answer came back for that question, which
tells you only that the pack said nothing about it.

Treat every one of these as a prompt to reread your own question and rewrite it. Rewrite
the wording, drop a question the context already answers, or move the question to a later
round yourself.

The judgments never answer a question, never mark one settled, and never choose for the user. A decision leaves the frontier when the user decides it, and only then. If the pass did not run, ask the round anyway; the design tree is the skill, the judgments are a proofreader.

Exit code 3 with `"mode":"unavailable"` means no usable Jev result came back: ask the round as written and say the check did not run.

---

Adapted from `grilling` by Matt Pocock (MIT). See `../../NOTICE` and `../../audit.json`.
