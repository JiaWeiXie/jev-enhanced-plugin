import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const skillsDirectory = fileURLToPath(new URL('../skills/', import.meta.url));
const expectedSkills = [
  's1-code-review',
  's1-code-simplifier',
  's1-grilling',
  's1-humanizer',
  's1-humanizer-zh-tw',
  's1-i-have-adhd-zh-tw',
  's1-migrate-skill',
];

function readFrontmatter(skill) {
  const source = readFileSync(`${skillsDirectory}/${skill}/SKILL.md`, "utf8");
  const match = source.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(match, `${skill} must have YAML frontmatter`);
  return match[1];
}

function parseFrontmatter(frontmatter, skill) {
  const fields = new Map();
  let current = null;

  for (const [index, line] of frontmatter.split("\n").entries()) {
    if (!line.trim()) continue;
    if (/^\s/.test(line)) {
      assert.ok(current, `${skill} has an indented line before a top-level key (line ${index + 1})`);
      assert.ok(
        current.value === "" || current.value === "|" || current.value === ">",
        `${skill} has a dangling continuation after ${current.key}`,
      );
      current.continuations.push(line.trim());
      continue;
    }

    const match = line.match(/^([a-z][\w-]*):(?:[ \t]*(.*))?$/);
    assert.ok(match, `${skill} has an invalid top-level frontmatter line: ${line}`);
    const [, key, value = ""] = match;
    assert.equal(fields.has(key), false, `${skill} repeats frontmatter key ${key}`);
    current = { key, value, continuations: [] };
    fields.set(key, current);
  }

  return fields;
}

test('bundled skills expose concise model-invocation metadata', () => {
  const skills = readdirSync(skillsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  assert.deepEqual(skills, expectedSkills);

  for (const skill of skills) {
    const frontmatter = readFrontmatter(skill);
    const fields = parseFrontmatter(frontmatter, skill);

    assert.notEqual(fields.get("disable-model-invocation")?.value, "true");
    assert.equal(fields.get("name")?.value, skill);

    const descriptionField = fields.get("description");
    assert.ok(descriptionField, `${skill} must expose a description`);
    const description = descriptionField.value === "|"
      ? descriptionField.continuations.join("\n")
      : descriptionField.value === ">"
        ? descriptionField.continuations.join(" ")
        : descriptionField.value;
    assert.ok(description.trim(), `${skill} must have a non-empty description`);
    assert.ok(description.length <= 300, `${skill} description exceeds 300 characters`);
    assert.equal(
      description.match(/\bUse when\b/g)?.length ?? 0,
      1,
      `${skill} description must state its invocation branches once`,
    );
  }
});
