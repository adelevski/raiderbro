const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.join(__dirname, "..", "app", "tools", "requirement-tracker", "src", "tracker-state.js"),
  "utf8"
);
const context = vm.createContext({ window: {}, Date, Intl, Number, Array, Object, Set, String });
vm.runInContext(source, context);
const state = context.window.RequirementTrackerState;

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test("tracker normalization keeps explicit zero sort order first", () => {
  const normalized = state.normalizeTrackerData({
    schemaVersion: 3,
    cards: [
      { id: "later", title: "Later" },
      { id: "first", title: "First", sortOrder: 0 },
      { id: "middle", title: "Middle", sortOrder: 10 },
    ],
  });

  assert.deepEqual(normalized.cards.map((card) => card.id), ["first", "middle", "later"]);
  assert.equal(state.normalizeTrackerData({ unexpected: true }), null);
});

test("imported tracker state drops invalid counters and normalizes card order", () => {
  const sanitized = plain(state.sanitizeState({
    levels: { valid: "3.9", negative: -2, blank: "", boolean: true },
    progress: { valid: 4, infinite: Infinity },
    variants: { card: " alpha " },
    cardOrder: [" first ", "first", "", 42, "second"],
    shoppingMode: "unexpected",
    cardScope: "unexpected",
  }, 2));

  assert.deepEqual(sanitized.levels, { valid: 3 });
  assert.deepEqual(sanitized.progress, { valid: 4 });
  assert.deepEqual(sanitized.variants, { card: "alpha" });
  assert.deepEqual(sanitized.cardOrder, ["first", "second"]);
  assert.equal(sanitized.shoppingMode, "card");
  assert.equal(sanitized.cardScope, "all");
});
