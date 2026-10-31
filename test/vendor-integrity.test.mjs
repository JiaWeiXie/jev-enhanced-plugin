import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";

test("vendored TypeSafe runtime matches its recorded audit hash", () => {
  const audit = JSON.parse(fs.readFileSync(new URL("../audit.json", import.meta.url), "utf8"));
  const entries = audit.components.filter((entry) => entry.id === "typesafe-sdk-runtime");
  assert.equal(entries.length, 1);
  const [sdk] = entries;
  assert.equal(sdk.localPath, "src/vendor/typesafe-sdk.mjs");
  assert.match(sdk.upstream.sha256, /^[0-9a-f]{64}$/);
  const bytes = fs.readFileSync(new URL("../src/vendor/typesafe-sdk.mjs", import.meta.url));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), sdk.upstream.sha256);
});
