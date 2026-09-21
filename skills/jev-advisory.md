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

## The command

Claude Code exposes the installed root as `${CLAUDE_PLUGIN_ROOT}`. Oh My Pi appends
the absolute skill directory to an invoked skill and requires relative assets to be resolved
against it. Use the command for the active host:

```bash
# Claude Code
node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" <pack> --state job.json --json

# Oh My Pi: replace the placeholder with the absolute skill directory shown by the host
(cd "<skill-directory>" && node "../../src/cli.mjs" <pack> --state job.json --json)
```

- `job.json` is a file you write yourself, in the state shape the skill documents.
- `--state <file|->` points at that state file; `-` reads the state from stdin.
- `--json` gives machine-readable output; drop it for a human-readable report.
- `--dry-run` makes **no** inference. It prints
  `{"mode":"dry-run","request":{"state":…,"model":…,"questions":…},"answers":null}`,
  so you can show the user exactly what a live run would send.
- `--mock <file>` replays recorded answers (`mode: "mock"`). Mock answers are fixtures,
  not judgments; never present them to the user as model output.
- `--list` prints the registered pack names. `--help` prints the usage.
- There is no `--pack-arg`. Everything the pack needs goes in the state file.
- The CLI calls the pack's `validateState(state)` before it builds any question. A
  state the pack rejects prints that message to stderr and exits 2.
- From the repo root, `mise run jev -- <pack> --state job.json --json` runs the same CLI.

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
