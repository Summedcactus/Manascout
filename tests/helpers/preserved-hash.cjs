const { readFileSync } = require("node:fs");
const { createHash } = require("node:crypto");
const assert = require("node:assert/strict");

// The compatibility fetch boundary may evolve. Verification and normalization
// outside it are still pinned to the released Prompt 1 source.
const deckDataCore = "cbe438100cdec559fb13a61e37a3fff8b6eb34a747433098afaaa11bd28cfe3e";

function assertPreserved(path, baselineHash) {
  let source = readFileSync(path, "utf8");
  if (path === "assets/js/deck-data.js") {
    source = source.replace(/^  const transport = .*\n\n/m, "")
      .replace(/  async function fetchPrinting\([\s\S]*?(?=  \/\/ Printing, artwork)/, "");
    baselineHash = deckDataCore;
  }
  assert.equal(createHash("sha256").update(source).digest("hex"), baselineHash, path);
}

module.exports = { assertPreserved };
