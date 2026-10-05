import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runRulesOnElement } from "../dist/engine.js";

describe("runRulesOnElement", () => {
  it("flags img without alt", () => {
    const findings = runRulesOnElement({
      file: "x.tsx",
      tagName: "img",
      line: 1,
      column: 1,
      attributes: { src: "/a.png" },
      hasChildrenText: false,
      snippet: '<img src="/a.png" />',
      eventHandlers: [],
    });
    assert.equal(findings.some((f) => f.ruleId === "img-missing-alt"), true);
  });
});
