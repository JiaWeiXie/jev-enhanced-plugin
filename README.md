# jev-enhanced-plugin

A Claude Code plugin with six judgment-bearing skills. Each one is a skill already in use plus a single addition: a typed judgment from [TypeSafe](https://typesafe.ai) Jev (System One) at the points where the skill previously relied on the agent's own impression. A seventh skill, `s1-migrate-skill`, is the procedure for bringing further skills in.

Jev output here is advisory. It never approves a change, never removes a finding, and never decides anything on the user's behalf. Anything a program can check exactly (string matches, dependency graphs, diff boundaries) is checked in code and never sent to a model.

## Skills

| Skill | Judgment pack | What the pack answers |
| --- | --- | --- |
| `s1-code-review` | `review-findings` | Per finding: does the quoted evidence support the claim, is the basis documented, is it covered by a supplied test, and which supplied code excerpt is the best citation (`noMatch` allowed). Diff membership is computed in code from the finding's file and line. |
| `s1-code-simplifier` | `simplify-gate` | Risk that a rewrite changes observable behavior, drops a handled case, changes the contract surface, or changes failure paths. |
| `s1-grilling` | `grilling-frontier` | Whether a question is already answered by context and whether it needs a user decision. Prerequisite eligibility is computed from the dependency graph in code, not judged. |
| `s1-humanizer` | `humanizer` | Per passage: carries information, restates another passage, claims more than the context supports, reads naturally for the locale. |
| `s1-humanizer-zh-tw` | `humanizer` | Same pack, `zh-TW` locale. |
| `s1-i-have-adhd-zh-tw` | `reply-check` | Whether a draft answers first, delegates work back to the user, covers the request, and adds unrequested scope. |

Every skill keeps its original procedure. The pack runs alongside it and adds probabilities the human reader can use or ignore.

## Adding a skill

`s1-migrate-skill` is the procedure for bringing another skill into this plugin: license audit, deciding which steps become judgments and which stay code, the pack, the adapted `SKILL.md`, tests, and documentation. It has no pack of its own. Its `references/pack-template.mjs` is the starting point for a new pack.
## Install

Requires [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Add this GitHub repository as a marketplace, then install its plugin:

```bash
claude plugin marketplace add JiaWeiXie/jev-enhanced-plugin
claude plugin install jev-enhanced-plugin@jev-enhanced-plugin
```

The first command registers the marketplace. The second installs this plugin from that marketplace. Restart Claude Code after installation; its seven skills are then available by their `s1-` names.

To update later, run `claude plugin update jev-enhanced-plugin@jev-enhanced-plugin` and restart Claude Code. The plugin package requires Node 20 or newer.

For development only, Claude Code can load the repository for one session with `claude --plugin-dir /absolute/path/to/jev-enhanced-plugin`.

## Requirements

- Node 20 or newer (`package.json` engines); this repo pins 24.18.0 in `mise.toml`.
- `TYPESAFE_API_KEY` in the environment for live judgments. Without it, the skills run their original procedure and state plainly that no judgment was available.

```
mise install
mise run install
mise run test
```

## Running a pack directly

```
node src/cli.mjs <pack> --state state.json --json
```

Flags: `--state <file|->` (`-` reads the state from stdin), `--dry-run` (build questions, contact nothing), `--mock <file>` (replay recorded answers), `--json`, `--help`, `--list`. The pack's own `validateState` runs before any request is made; a malformed state is reported on stderr and exits 2. `npm install -g .` or `npx` exposes the same CLI as `jev-pack`.

Exit codes: `0` success, `2` input error, `3` no judgment available. Exit 3 also sets `"mode": "unavailable"` in the JSON body, so a skill can distinguish a missing service from a negative answer.

Each pack's `--state` shape is documented at the top of its file in `packs/`. State text is judged as given: a path or a shell command placed in a code field is provenance, and the packs judge only the text supplied.

## Failure behavior

A missing key, a network failure, an HTTP error, or a malformed answer all resolve to the same thing: `unknown`, reported as `unknown`. `unknown` means the absence of a signal. The packs never invent a probability, and service failures do not leak response contents into the report.

## Evaluation

`evals/evals.json` holds three synthetic cases comparing each adapted skill against its original: two-axis review retention, `zh-TW` rewriting with evidence preserved, and grilling with unsettled prerequisites. Results live outside this repository in the workspace directory.

These are single runs on synthetic inputs. They measure instruction-following only, and they support no claim about Jev accuracy, calibration, or speed.

## License

This plugin is distributed under `MIT AND Apache-2.0 AND CC-BY-SA-4.0`. New code in `src/`, `packs/`, `test/`, and `skills/s1-migrate-skill/` is MIT (`LICENSE`). Adapted material keeps the license it arrived with, listed below. Full texts are in `licenses/`; per-file provenance, source hashes, and the audit of every candidate considered (included, redirected, and excluded) are in `NOTICE` and `audit.json`.

### Adapted skills

| Packaged skill | Upstream | Provenance / credits | License |
| --- | --- | --- | --- |
| `s1-code-review` | [`mattpocock/skills`](https://github.com/mattpocock/skills): `skills/engineering/code-review` | Matt Pocock | MIT |
| `s1-grilling` | [`mattpocock/skills`](https://github.com/mattpocock/skills): `skills/productivity/grilling` | Matt Pocock | MIT |
| `s1-humanizer` | [`blader/humanizer`](https://github.com/blader/humanizer) | Siqi Chen; Wikipedia contributors and WikiProject AI Cleanup for the catalog | MIT; CC BY-SA 4.0 for the Wikipedia-derived catalog |
| `s1-humanizer-zh-tw` | [`kevintsai1202/Humanizer-zh-TW`](https://github.com/kevintsai1202/Humanizer-zh-TW) | Repository maintainer: `kevintsai1202`; Traditional Chinese adaptation of [`op7418/Humanizer-zh`](https://github.com/op7418/Humanizer-zh); core translation: `blader/humanizer`; practical sections reference `hardikpandya/stop-slop`; MIT copyright holder: 歸藏 | MIT; CC BY-SA 4.0 for the Wikipedia-derived catalog |
| `s1-i-have-adhd-zh-tw` | [`panda850819/i-have-adhd-zh-tw`](https://github.com/panda850819/i-have-adhd-zh-tw) | Repository maintainer: `panda850819`; non-official Traditional Chinese derivative of [`ayghri/i-have-adhd`](https://github.com/ayghri/i-have-adhd), created by Ayoub Ghriss; MIT copyright retained from Ayoub Ghriss | MIT |
| `s1-code-simplifier` | `claude-plugins-official/code-simplifier` 1.0.0, `agents/code-simplifier.md` | Anthropic | Apache-2.0 |

Every packaged skill in this table is modified from its upstream. The `s1-humanizer` and `s1-humanizer-zh-tw` catalogs include Wikipedia-derived CC BY-SA 4.0 material; their attribution and required redistribution notice are in `NOTICE`. The Apache-2.0 material carries its required statement of changes in `NOTICE`, section 4(b).

### Design reference only

[`devagrawal09/jev-review`](https://github.com/devagrawal09/jev-review) (MIT, Dev Agrawal) informed the evidence shape used by `s1-code-review`: bounded candidate excerpts carrying file and line, an explicit `noMatch` answer, and covering tests supplied as context. No code or prose was copied, and its threshold filtering, list truncation, cross-axis severity ranking, and dashboard were deliberately not adopted.

`grill-me` from `mattpocock/skills` is a one-line trampoline into `grilling` and was not copied.

### Share-alike material

The pattern catalogs in both humanizer skills derive from Wikipedia's ["Signs of AI writing"](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing) by Wikipedia contributors, including WikiProject AI Cleanup. That material is CC BY-SA 4.0 and stays CC BY-SA 4.0: the plugin-level MIT grant does not override share-alike terms. If you redistribute an adapted catalog, keep the attribution and the license. No endorsement by Wikipedia or its contributors is implied.

### Runtime dependency

[`@typesafe-ai/sdk`](https://www.npmjs.com/package/@typesafe-ai/sdk) 0.6.0 is the only runtime dependency; it is installed from npm under its own license and is not vendored here. Using it requires a TypeSafe account and sends the state you pass to a pack to the TypeSafe API. Packs send only the text placed in `--state`. Decide what goes in there accordingly.
