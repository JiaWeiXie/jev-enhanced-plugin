# Running a Jev judgment pass

Shared reference for every skill in this plugin. Each skill points here instead of
repeating the rules.

## System One model

The `s1-` prefix is this plugin's System One namespace: skills augmented with System
One judgments, plus `s1-migrate-skill`, the procedure that produces them. Jev is
TypeSafe's flagship System One model: it reads text or structured text state and
returns typed decisions and probabilities. Its output is only those typed answers.
Images, audio, and video are not supported by this integration. The host agent
still writes, explains, investigates, and runs tests.

Use Noul for the probability of a yes/no condition; it has no separate confidence.
Choice selects a supplied option and returns a distribution and confidence. Score
returns a probability-weighted position on ordered levels. Calibration is a property
of groups of predictions; a single answer carries no such guarantee. Independent
questions sharing state belong in one request; they cannot see each other's answers.

Source: https://docs.typesafe.ai/concepts/system-one

## Building the state

The packs own the questions and the payload; you own the job file. Every pack
turns the `job.json` you write into a smaller *model state* with its own
`buildState`, and only that model state is posted. `--dry-run` prints it under
`request.state`, so what you see there is exactly what a live run would send.

What the packs do for you, following TypeSafe's published guidance
(https://docs.typesafe.ai/concepts/how-to-build-with-system-one,
https://docs.typesafe.ai/model-jaggedness/jev-1.13):

- **Code-only fields stay local.** A review's `diff`, reply-check's `banned`
  list, grilling's ids, prerequisites, settled and blocked questions, and every
  file path or line number are used by code and never sent.
- **Reference first, material after.** Contracts, specs, standards, requests, and
  context come before the text being judged. In live checks this ordering alone
  changed a correct catch from missed to found.
- **One narrow question per judgment, pointing at a named field.** Whatever code
  can compute (the opening paragraph of a draft, a language name for a locale
  tag, whether a quote occurs in the diff) is computed before anything is asked.
- **Unsupported questions are not asked.** A question whose field is empty (no
  `contract`, no `context`, a finding without `evidence`, a single passage with
  nothing to repeat) is reported as `not asked`. That is different from
  `unknown`, which means a question was asked and no usable answer came back.
  Neither is a pass.

What stays yours:

- Fill the named fields the active skill documents. Evidence fields hold the
  actual text, such as a quoted hunk, a spec line, or a passage, because Jev
  cannot open a path. Keep the paths, lines, and ids the schema asks for: code
  uses them, even though the model never sees them.
- Send the smallest excerpt that answers the question. Extra text is a distraction for
  the model and extra data sent to a third party.
- Keep content in the state and the judgment in the questions. Never write
  instructions to the model into a state field, and never edit a pack's questions to
  steer an answer for one run.
- Jev's primary training language is English. Other languages, including Traditional
  Chinese, are accepted with lower accuracy. The questions stay in English; for zh-TW
  state, say that the reading is lower-accuracy and weigh it accordingly.
- A Choice answer carries a confidence. Report it beside the choice, and treat low
  confidence as a reason to reread, never as a reason to act or to drop anything.

## The command

Resolve the installed CLI and an absolute state-file path before running it. Keep
the working directory unchanged so state files stay in the task workspace. Start
with a local payload preview; remove `--dry-run` only for an authorized live run.

```bash
# Claude Code
node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" <pack> --state /absolute/path/to/job.json --dry-run --json

# OpenAI Codex or Oh My Pi: use the absolute skill directory supplied by the host
node "<skill-directory>/../../src/cli.mjs" <pack> --state /absolute/path/to/job.json --dry-run --json
```

- Use a task-local temporary file for `job.json`; do not overwrite an existing
  file or write payloads into the installed plugin. Remove your payload after use.
- `job.json` uses the state shape documented by the active skill.
- `--state <file|->` points at that state file; `-` reads the state from stdin.
- `--json` gives machine-readable output; drop it for a human-readable report.
- `--dry-run` makes **no** inference. It prints
  `{"mode":"dry-run","request":{"state":…,"model":…,"questions":…},"answers":null}`,
  where `state` is the filtered model state, so you can show the user exactly what a
  live run would send.
- `--mock <file>` replays recorded answers (`mode: "mock"`). Mock answers are fixtures,
  not judgments; never present them to the user as model output.
- `--list` prints the registered pack names. `--help` prints the usage.
- There is no `--pack-arg`. Everything the pack needs goes in the state file.
- The CLI calls the pack's `validateState(state)` before it builds any question. A
  state the pack rejects prints that message to stderr and exits 2.
- From the repo root, `mise run jev -- <pack> --state /absolute/path/to/job.json --dry-run --json` runs the same local preview.

## Exit codes and modes

Read `mode` in the output, and the exit code:

| exit | `mode` | meaning |
| --- | --- | --- |
| 0 | `live` | real judgments in `answers` |
| 0 | `dry-run` | payload only, `answers: null`, nothing sent |
| 0 | `mock` | replayed fixtures |
| 0 | `not-needed` | the pack built zero questions: `answers: {}`, `judgmentsAvailable: false` |
| 2 | n/a | bad input: unknown pack, missing or unreadable `--state`, malformed JSON, or a state the pack's `validateState` rejects. Fix the call. |
| 3 | `unavailable` | **no usable Jev result**: `answers: null`, `reason` says why |

Exit 3 is a normal outcome. `reason: "missing_api_key"` means no request
was sent at all. Any other reason means the request failed somewhere between here and
an answer; the service may already have computed something, but nothing usable came
back, so treat it as no result. When you get exit 3:

1. Carry out the skill's original workflow in full. The judgment pass is an extra
   check, never the work itself.
2. Tell the user plainly that no usable Jev result came back, and what `reason` said.
3. Never report success, a probability, a score, or a label that did not come from a
   real `live` response. An invented number is worse than no number.

A host helper such as an Eval `judge()` is not a substitute for this CLI unless the response identifies TypeSafe Jev as the model that answered. Some hosts fall back to a chat model when no TypeSafe credential is available, and a chat model's `0`/`1` distributions are not System One probabilities. If the answering backend is not TypeSafe Jev, or cannot be identified, treat the pass as `unavailable`.

Where the user's output contract is strict (only JSON, only code, only the final text),
the contract wins: never inject a Jev note or an unavailability note into the artifact.
Say it outside the artifact, or not at all.

`not-needed` is also not a judgment. It arrives with `answers: {}` and
`judgmentsAvailable: false`: nothing was asked, so report it as "no judgment was
needed", never as a pass.

## What a judgment is worth

Jev answers are **advisory**. They are probabilities from a model that is not
calibrated to your repo, and they carry no authority over the user, the diff, or the
source text.

Never use a judgment to:

- approve a change, declare two versions equivalent, or sign off on a review;
- delete, suppress, downgrade, threshold-filter, or reorder a finding, especially
  across review axes;
- decide who wrote a piece of text, or whether it is machine-generated;
- settle a question the user is supposed to answer;
- justify skipping a check you can perform literally in code.

Deterministic work stays deterministic: string and pattern matches, diffs, dependency
graphs, and file lookups are computed, not judged. Reserve judgments for the part that
is genuinely semantic, such as whether two wordings mean the same thing, or whether a
question is ambiguous.

Report a judgment as what it is: `Jev (advisory, p=0.78)`. Present confidence and
probabilities as model output, never as measurement.

Every pack question and every display band lives in one reviewable place: the
questions in `packs/<pack>.mjs` and the shared bands in `ADVISORY_BANDS`
(`packs/shared.mjs`). Review and edit them there rather than inventing a private
cutoff in a skill. The bands are readability buckets; none of them is a validated threshold.

## Sending text to a third party

`--dry-run` stays local. A live run posts the state you built to the TypeSafe API.

Before the first live run in a session, ask the user for permission and say what will
be sent. Send the minimum evidence the pack needs: the passage, hunk, or question under
review, and nothing else. Never include credentials, tokens, private keys, `.env`
contents, customer data, or whole files when an excerpt answers the question. If you
cannot build a payload without secrets, skip the judgment pass and say so.
