import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RECIPES,
  neededIngredients,
  toShopItem,
  coerceRecipe,
  suggestWeek,
} from "../js/meals.js";

// ── neededIngredients ─────────────────────────────────────────────────────────
test("neededIngredients: no pantry → all non-staple ingredients returned", () => {
  const gyudon = RECIPES.find(r => r.id === "gyudon");
  const result = neededIngredients([gyudon], []);
  const names = result.map(i => i.name);
  // Staples (rice, soy sauce, mirin, dashi, sugar) should be excluded
  assert.ok(!names.some(n => /rice|soy sauce|mirin|dashi|sugar/i.test(n)),
    "Staples should not appear");
  // Non-staples should appear
  assert.ok(names.some(n => /beef/i.test(n)),  "Beef should appear");
  assert.ok(names.some(n => /onion/i.test(n)), "Onion should appear");
});

test("neededIngredients: pantry item excluded from results", () => {
  const gyudon = RECIPES.find(r => r.id === "gyudon");
  const result = neededIngredients([gyudon], ["Onion"]);
  const names = result.map(i => i.name);
  assert.ok(!names.some(n => /onion/i.test(n)), "Onion should be excluded by pantry");
  assert.ok(names.some(n => /beef/i.test(n)), "Beef should still appear");
});

test("neededIngredients: pantry matching is case-insensitive", () => {
  const gyudon = RECIPES.find(r => r.id === "gyudon");
  const result = neededIngredients([gyudon], ["ONION"]);
  const names = result.map(i => i.name);
  assert.ok(!names.some(n => /onion/i.test(n)));
});

test("neededIngredients: staples excluded even without pantry", () => {
  const gyudon = RECIPES.find(r => r.id === "gyudon");
  const all = neededIngredients([gyudon], []);
  // soy sauce is marked staple → should not appear
  assert.ok(!all.some(i => /soy sauce/i.test(i.name)));
});

test("neededIngredients: quantities are summed when same ingredient across recipes", () => {
  // both biryani and palakpaneer have Tomato
  const biryani     = RECIPES.find(r => r.id === "biryani");
  const palakpaneer = RECIPES.find(r => r.id === "palakpaneer");
  const result = neededIngredients([biryani, palakpaneer], []);
  const tomato = result.find(i => /tomato/i.test(i.name));
  assert.ok(tomato, "Tomato should appear");
  // biryani has qty:2, palakpaneer has qty:1
  assert.equal(tomato.qty, 3);
});

test("neededIngredients: empty recipes list → empty result", () => {
  assert.deepEqual(neededIngredients([], []), []);
});

// ── toShopItem ────────────────────────────────────────────────────────────────
test("toShopItem shapes ingredient into a shop item", () => {
  const item = toShopItem({ name: "Tofu", qty: 2, unit: "pack", cat: "food", price: 160 });
  assert.equal(item.qty,   1);
  assert.equal(item.cat,   "food");
  assert.equal(item.got,   false);
  assert.ok(item.name.includes("Tofu"));
  assert.ok(item.name.includes("2"));
});

test("toShopItem: zero qty produces clean name (no spurious annotation)", () => {
  const item = toShopItem({ name: "Soy sauce", qty: 0, unit: "", cat: "food", price: 0 });
  assert.equal(item.name, "Soy sauce");
});

// ── coerceRecipe ─────────────────────────────────────────────────────────────
test("coerceRecipe: valid input returns a clean recipe", () => {
  const raw = {
    name: "Test Dish",
    cuisine: "Test",
    serves: 2,
    ingredients: [
      { name: "Chicken", qty: 200, unit: "g", cat: "food", price: 400, staple: false },
    ],
    instructions: ["Step 1", "Step 2"],
  };
  const r = coerceRecipe(raw, 0);
  assert.ok(r !== null);
  assert.equal(r.name, "Test Dish");
  assert.equal(r.ingredients.length, 1);
  assert.equal(r.ingredients[0].name, "Chicken");
  assert.equal(r.ai, true);
});

test("coerceRecipe: null input returns null", () => {
  assert.equal(coerceRecipe(null, 0), null);
});

test("coerceRecipe: missing name returns null", () => {
  assert.equal(coerceRecipe({ ingredients: [{ name: "X" }] }, 0), null);
});

test("coerceRecipe: missing ingredients returns null", () => {
  assert.equal(coerceRecipe({ name: "No ingredients", ingredients: [] }, 0), null);
});

test("coerceRecipe: truncates long name to 60 chars", () => {
  const longName = "A".repeat(100);
  const r = coerceRecipe({
    name: longName,
    ingredients: [{ name: "X", qty: 1 }],
  }, 0);
  assert.ok(r !== null);
  assert.ok(r.name.length <= 60);
});

test("coerceRecipe: serves clamped to 1–12", () => {
  const r = coerceRecipe({
    name: "Big meal",
    serves: 999,
    ingredients: [{ name: "X", qty: 1 }],
  }, 0);
  assert.ok(r !== null);
  assert.equal(r.serves, 12);
});

test("coerceRecipe: ingredient cat defaults to food for unknown values", () => {
  const r = coerceRecipe({
    name: "Test",
    ingredients: [{ name: "Thing", qty: 1, cat: "weird" }],
  }, 0);
  assert.ok(r !== null);
  assert.equal(r.ingredients[0].cat, "food");
});

// ── suggestWeek ───────────────────────────────────────────────────────────────
test("suggestWeek: returns an array of recipe IDs", () => {
  const ids = suggestWeek(RECIPES, 14);
  assert.ok(Array.isArray(ids));
  assert.ok(ids.length > 0);
  ids.forEach(id => assert.equal(typeof id, "string"));
});

test("suggestWeek: total portions covers the target", () => {
  const ids = suggestWeek(RECIPES, 14);
  let portions = 0;
  for (const id of ids) {
    const r = RECIPES.find(r => r.id === id);
    portions += r ? (r.serves || 1) : 1;
  }
  assert.ok(portions >= 14, `Expected >=14 portions, got ${portions}`);
});

test("suggestWeek: picks recipes from varied cuisines first", () => {
  const ids = suggestWeek(RECIPES, 14);
  const cuisines = ids.map(id => {
    const r = RECIPES.find(r => r.id === id);
    return r ? r.cuisine : null;
  });
  const uniqueCuisines = new Set(cuisines.filter(Boolean));
  assert.ok(uniqueCuisines.size > 1, "Should pick from more than one cuisine");
});

test("suggestWeek: targetPortions=0 returns empty array", () => {
  assert.deepEqual(suggestWeek(RECIPES, 0), []);
});

test("suggestWeek: no duplicate recipe IDs", () => {
  const ids = suggestWeek(RECIPES, 14);
  assert.equal(ids.length, new Set(ids).size, "IDs should be unique");
});

// ── neededIngredients: edge cases ────────────────────────────────────────────
test("neededIngredients: null pantry treated as empty", () => {
  const gyudon = RECIPES.find(r => r.id === "gyudon");
  const result = neededIngredients([gyudon], null);
  // Should not throw; non-staple ingredients should appear
  assert.ok(result.some(i => /beef/i.test(i.name)));
});

test("neededIngredients: pantry covers all non-staple ingredients → empty result", () => {
  const agedashi = RECIPES.find(r => r.id === "agedashi");
  // Non-staples for agedashi: Tofu, Potato starch, Spring onion
  const result = neededIngredients([agedashi], ["Tofu", "Potato starch", "Spring onion"]);
  assert.deepEqual(result, []);
});

test("neededIngredients: ingredient appears in both recipes but pantry has it → not in result", () => {
  const biryani     = RECIPES.find(r => r.id === "biryani");
  const palakpaneer = RECIPES.find(r => r.id === "palakpaneer");
  const result = neededIngredients([biryani, palakpaneer], ["Tomato"]);
  assert.ok(!result.some(i => /tomato/i.test(i.name)), "Tomato should be excluded by pantry");
});

test("neededIngredients: ingredient in one recipe but pantry covers only the other", () => {
  const biryani     = RECIPES.find(r => r.id === "biryani");     // has Onion qty:2
  const gyudon      = RECIPES.find(r => r.id === "gyudon");      // has Onion qty:1
  // Pantry does NOT cover Onion — both should be merged
  const result = neededIngredients([biryani, gyudon], []);
  const onion = result.find(i => /onion/i.test(i.name));
  assert.ok(onion, "Onion should appear");
  assert.equal(onion.qty, 3); // biryani: 2, gyudon: 1
});

// ── toShopItem: unit vs qty annotation logic ──────────────────────────────────
test("toShopItem: qty=1 with no unit → no annotation in name", () => {
  const item = toShopItem({ name: "Onion", qty: 1, unit: "", cat: "food", price: 60 });
  assert.equal(item.name, "Onion"); // no qty annotation when qty=1 and no unit
});

test("toShopItem: qty>1 with unit produces '(qty unit)' annotation", () => {
  const item = toShopItem({ name: "Beef", qty: 200, unit: "g", cat: "food", price: 520 });
  assert.ok(item.name.includes("200"));
  assert.ok(item.name.includes("g"));
});

test("toShopItem: qty>1 with no unit produces '×qty' annotation", () => {
  const item = toShopItem({ name: "Egg", qty: 3, unit: "", cat: "food", price: 30 });
  assert.ok(item.name.includes("×3") || item.name.includes("3"));
});

test("toShopItem: price defaults to 0 when not provided", () => {
  const item = toShopItem({ name: "Water", qty: 1, unit: "L", cat: "food" });
  assert.equal(item.price, 0);
});

test("toShopItem: cat defaults to food when not provided", () => {
  const item = toShopItem({ name: "Misc", qty: 1, unit: "" });
  assert.equal(item.cat, "food");
});

// ── coerceRecipe: edge cases ──────────────────────────────────────────────────
// SOURCE BUG (js/meals.js): coerceRecipe uses `Number(r.serves)||2` which treats
// serves=0 as falsy and returns the default 2 instead of clamping to 1.
// The correct formula should be: Math.min(12, Math.max(1, Number(r.serves) ?? 2))
// or: Number(r.serves) > 0 ? ... : 2.
// This test documents the ACTUAL (buggy) behaviour; do NOT edit the source here.
test("coerceRecipe: serves=0 → BUG returns 2 instead of 1 (source bug in meals.js)", () => {
  const r = coerceRecipe({
    name: "Tiny dish",
    serves: 0,
    ingredients: [{ name: "Salt", qty: 1 }],
  }, 0);
  assert.ok(r !== null);
  // BUG: should be 1 (clamped), but the falsy || 2 fallback returns 2.
  assert.equal(r.serves, 2, "BUG: serves=0 should clamp to 1, but || 2 returns 2");
});

test("coerceRecipe: serves negative is clamped to 1", () => {
  const r = coerceRecipe({
    name: "Negative dish",
    serves: -5,
    ingredients: [{ name: "Pepper", qty: 1 }],
  }, 0);
  assert.ok(r !== null);
  assert.equal(r.serves, 1);
});

test("coerceRecipe: ingredient with cat='other' is preserved", () => {
  const r = coerceRecipe({
    name: "Household recipe",
    ingredients: [{ name: "Soap", qty: 1, cat: "other" }],
  }, 0);
  assert.ok(r !== null);
  assert.equal(r.ingredients[0].cat, "other");
});

test("coerceRecipe: non-array instructions produces empty instructions array", () => {
  const r = coerceRecipe({
    name: "No steps",
    ingredients: [{ name: "Thing", qty: 1 }],
    instructions: "just cook it",  // not an array
  }, 0);
  assert.ok(r !== null);
  assert.deepEqual(r.instructions, []);
});

test("coerceRecipe: ingredient price is clamped to 0 for negative values", () => {
  const r = coerceRecipe({
    name: "Price test",
    ingredients: [{ name: "Widget", qty: 1, price: -100 }],
  }, 0);
  assert.ok(r !== null);
  assert.equal(r.ingredients[0].price, 0);
});

test("coerceRecipe: ingredient with falsy name is filtered out", () => {
  const r = coerceRecipe({
    name: "Sparse",
    ingredients: [
      { name: "", qty: 1 },
      { name: "Carrot", qty: 2 },
    ],
  }, 0);
  assert.ok(r !== null);
  assert.equal(r.ingredients.length, 1);
  assert.equal(r.ingredients[0].name, "Carrot");
});

test("coerceRecipe: id field starts with 'ai-'", () => {
  const r = coerceRecipe({
    name: "AI dish",
    ingredients: [{ name: "Noodle", qty: 1 }],
  }, 5);
  assert.ok(r !== null);
  assert.ok(r.id.startsWith("ai-"));
});

// ── suggestWeek: additional edge cases ───────────────────────────────────────
test("suggestWeek: target smaller than first recipe's serves still returns at least one", () => {
  const ids = suggestWeek(RECIPES, 1);
  assert.ok(ids.length >= 1);
});

test("suggestWeek: negative targetPortions returns empty array", () => {
  assert.deepEqual(suggestWeek(RECIPES, -5), []);
});

test("suggestWeek: single-recipe pool returns that recipe", () => {
  const single = [RECIPES[0]];
  const ids = suggestWeek(single, 2);
  assert.ok(ids.length >= 1);
  assert.equal(ids[0], RECIPES[0].id);
});
