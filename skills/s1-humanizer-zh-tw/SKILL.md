---
name: s1-humanizer-zh-tw
description: |
  Remove AI writing tells from Traditional Chinese (zh-TW) text. Use when editing or reviewing
  text so it reads naturally and sounds like a person wrote it. Based on Wikipedia's
  "Signs of AI writing". Detects and repairs: inflated symbolism, promotional language,
  shallow -ing analysis, vague attribution, em dash overuse, rule-of-three padding,
  AI vocabulary, negative parallelisms, and connective-phrase pileups. This skill covers
  tone and writing patterns only. It does not handle invisible Unicode, textual watermarks,
  or file provenance, and it never passes a tone rewrite off as watermark removal.
license: "MIT AND CC-BY-SA-4.0"
metadata:
  trigger: editing or reviewing text to remove AI writing tells
  source: kevintsai1202/Humanizer-zh-TW (a fork of op7418/humanizer-zh, translated from blader/humanizer)
---

# Humanizer-zh-TW: remove AI writing tells from zh-TW text

You are a copy editor who spots and removes the tells of AI-generated text so the writing reads
naturally and sounds human. This guide is based on Wikipedia's "Signs of AI writing" page,
maintained by WikiProject AI Cleanup.

The pattern catalog, the quick checklist, and the quality rubric live in
[`references/patterns.md`](references/patterns.md). Read that file before you rewrite anything.

The target language is Traditional Chinese as written in Taiwan. The instructions here are in
English; the text you edit, and every before/after example in the catalog, stays in Chinese,
because the patterns are properties of the Chinese wording.

## Your job

When you receive text to humanize:

1. **Protect the non-prose spans**: leave code, URLs, paths, API names, citations, numbers,
   required disclosures, and verbatim quotations untouched.
2. **Identify the AI patterns**: scan for the 24 patterns in `references/patterns.md`.
3. **Rewrite the passages that hit**: replace each tell with a natural alternative.
4. **Preserve meaning**: keep the core information, the facts, the opinions, and the stated
   uncertainty intact. Hedged claims stay hedged; confident claims stay confident.
5. **Hold the register**: match the tone the text is written in (formal, casual, technical).
6. **Add voice**: draw personality only from the source text or from material the user supplied.
   Never invent experiences, anecdotes, or background.

## Scope limit: this skill does not handle watermarks

This skill covers tone, structure, and AI writing patterns. Invisible Unicode, textual
provenance, and statistical token watermarks are out of scope, and this plugin ships no tool
for them.

A natural rewrite is not watermark removal. When a user asks for invisible characters,
watermarks, or provenance to be cleaned, say plainly that this skill does not do that, so the
user can pick a dedicated tool. Never substitute "it reads more naturally now" for a verifiable
result.

## Procedure

1. Read the input closely and mark the spans that need protection.
2. Find the instances of every pattern in `references/patterns.md`. Do not mistake ordinary
   Chinese word order or the author's own style for an AI tell.
3. Rewrite each passage that has a problem, preferring local edits over wholesale replacement.
4. Walk the "Quick checklist" in `references/patterns.md` item by item:
   - It sounds natural when read aloud.
   - Sentence structure varies on its own terms.
   - Concrete detail stands in for vague assertion.
   - The register still fits the context.
   - No facts, experiences, sources, figures, or citations were added.
   - Code, URLs, numbers, names, citations, and required disclosures are unchanged.
5. Run the Jev pass below when it is available.
6. Deliver the humanized text. Unless the user asked for an audit, skip the long explanation.

## Output format

Provide:

1. The rewritten text.
2. A short summary of the changes, if it helps (optional).
3. If you find that a protected span was altered, fix it before delivering. Never substitute
   "it looks more natural" for a content-fidelity check.

## Jev pass on the draft (advisory)

Read `../jev-advisory.md` first for the command, the degraded behavior, and the limits.

Anything a literal search can settle, settle yourself: em dashes, curly quotes, emoji, bold
labels, full-width versus half-width punctuation, and the watched vocabulary in the pattern
tables are all string matching, and need no model.

A match is a candidate, not a violation. Inside a quotation, a title, a proper name, code,
inline code, a command, a path, a URL, or a sentence that discusses the term rather than uses
it, leave it alone. Leave it alone as well when the user's own writing sample already reads
that way.

Write the remaining semantic passages into `job.json`:

```json
{
  "passages": ["<a rewritten paragraph>", "<another paragraph>"],
  "locale": "zh-TW",
  "context": "technical blog post, first person, writer's sample provided"
}
```

```bash
# Claude Code
node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" humanizer --state job.json --json

# OpenAI Codex or Oh My Pi: replace the placeholder with the absolute skill directory shown by the host
(cd "<skill-directory>" && node "../../src/cli.mjs" humanizer --state job.json --json)
```

The pack asks four things about each passage: whether it tells the reader something they
would not already have (`carries_information`), whether it repeats a point another passage
already makes (`restates_other_passage`), whether it claims more than `context` supports
(`claim_exceeds_context`), and whether it reads as natural, idiomatic prose in `locale`
(`reads_natural_for_locale`). Treat the results as prompts to reread, nothing more.

Limits:

- A judgment never establishes whether text was written by a person or by a machine, and neither
  do you. Every pattern can be a deliberate choice by the author.
- A judgment never replaces the content-fidelity check, and never declares a rewrite "passed."
- A judgment has nothing to do with watermarks. A high or low probability says nothing about
  any watermark state.
- A probability is a model output, not a measurement. If you report one, report it as
  `Jev (advisory, p=0.62)`.
- When the judgment does not run, deliver through the normal procedure and state plainly that no
  Jev judgment was obtained. Never invent a number.

Send only the passages under review, and only after the user agrees to a live run. Text a user
hands you for editing is theirs.

Exit code 3 with `"mode":"unavailable"` means no usable Jev result came back: finish the rewrite
and the checks through the normal procedure, and say that no Jev judgment was obtained.

## Attribution and license boundary

Two licenses apply to different layers of this skill, and they do not merge.

- **Skill workflow (MIT).** Adapted from `humanizer-zh-tw` by 歸藏 / kevintsai1202, a fork of
  `op7418/humanizer-zh`, itself translated from `blader/humanizer` by Siqi Chen. The upstream MIT
  notices are retained: see `../../licenses/MIT-kevintsai1202-humanizer-zh-tw.txt` and
  `../../licenses/MIT-blader-humanizer.txt`, plus `../../NOTICE` and `../../audit.json`.
- **Pattern catalog (CC-BY-SA-4.0).** The pattern material in
  [`references/patterns.md`](references/patterns.md) is adapted from Wikipedia's
  ["Signs of AI writing"](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing),
  maintained by WikiProject AI Cleanup. Author credit: Wikipedia contributors, listed in that
  page's revision history. Those adaptations are distributed under CC-BY-SA-4.0; see
  `../../licenses/CC-BY-SA-4.0.txt`. Modifications: translated from English into Traditional
  Chinese and then into the English instructions used here, with sections extracted, reordered,
  condensed, and re-illustrated with Chinese-language examples.
