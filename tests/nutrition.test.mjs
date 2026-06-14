import { test } from "node:test";
import assert from "node:assert/strict";
import { recipeNutrition, planNutrition, fmtKcal, fmtMacros } from "../js/nutrition.js";
import { RECIPES, coerceRecipe } from "../js/meals.js";

// ── helpers ───────────────────────────────────────────────────────────────────
const gyudon     = RECIPES.find(r => r.id === "gyudon");      // kcal:540 per serving
const mapotofu   = RECIPES.find(r => r.id === "mapotofu");    // kcal:380
const agedashi   = RECIPES.find(r => r.id === "agedashi");    // kcal:280

// ── recipeNutrition: per-serving baseline ────────────────────────────────────
test("recipeNutrition: portions=1 returns per-serving values unchanged", () => {
  const result = recipeNutrition(gyudon, 1);
  assert.equal(result.kcal,    gyudon.nutrition.kcal);
  assert.equal(result.protein, gyudon.nutrition.protein);
  assert.equal(result.carbs,   gyudon.nutrition.carbs);
  assert.equal(result.fat,     gyudon.nutrition.fat);
});

test("recipeNutrition: default portions=1 matches explicit portions=1", () => {
  assert.deepEqual(recipeNutrition(gyudon), recipeNutrition(gyudon, 1));
});

// ── recipeNutrition: scaling ──────────────────────────────────────────────────
test("recipeNutrition: portions=2 doubles every macro", () => {
  const one = recipeNutrition(gyudon, 1);
  const two = recipeNutrition(gyudon, 2);
  assert.equal(two.kcal,    one.kcal    * 2);
  assert.equal(two.protein, one.protein * 2);
  assert.equal(two.carbs,   one.carbs   * 2);
  assert.equal(two.fat,     one.fat     * 2);
});

test("recipeNutrition: portions=0 returns all zeros", () => {
  const result = recipeNutrition(gyudon, 0);
  assert.deepEqual(result, { kcal: 0, protein: 0, carbs: 0, fat: 0 });
});

test("recipeNutrition: fractional portions rounds correctly", () => {
  // gyudon kcal=540; 0.5 portions → 270
  const result = recipeNutrition(gyudon, 0.5);
  assert.equal(result.kcal, Math.round(gyudon.nutrition.kcal * 0.5));
});

// ── recipeNutrition: missing nutrition graceful fallback ──────────────────────
test("recipeNutrition: recipe without nutrition field returns all zeros", () => {
  const noNutrition = { id: "x", name: "X", serves: 2, ingredients: [] };
  assert.deepEqual(recipeNutrition(noNutrition, 1), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
});

test("recipeNutrition: recipe with partial nutrition defaults missing fields to 0", () => {
  const partial = { id: "y", nutrition: { kcal: 100 } };
  const result = recipeNutrition(partial, 1);
  assert.equal(result.kcal,    100);
  assert.equal(result.protein, 0);
  assert.equal(result.carbs,   0);
  assert.equal(result.fat,     0);
});

test("recipeNutrition: null recipe returns all zeros without throwing", () => {
  assert.deepEqual(recipeNutrition(null, 1), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
});

test("recipeNutrition: undefined recipe returns all zeros without throwing", () => {
  assert.deepEqual(recipeNutrition(undefined, 1), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
});

// ── planNutrition: plain recipe array (1 serving each) ───────────────────────
test("planNutrition: empty array returns all zeros", () => {
  assert.deepEqual(planNutrition([]), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
});

test("planNutrition: null/undefined array returns all zeros", () => {
  assert.deepEqual(planNutrition(null),      { kcal: 0, protein: 0, carbs: 0, fat: 0 });
  assert.deepEqual(planNutrition(undefined), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
});

test("planNutrition: single recipe sums to that recipe's nutrition", () => {
  const result = planNutrition([gyudon]);
  assert.deepEqual(result, recipeNutrition(gyudon, 1));
});

test("planNutrition: two plain recipes sum their per-serving values", () => {
  const result = planNutrition([gyudon, mapotofu]);
  assert.equal(result.kcal,
    gyudon.nutrition.kcal + mapotofu.nutrition.kcal);
  assert.equal(result.protein,
    gyudon.nutrition.protein + mapotofu.nutrition.protein);
});

test("planNutrition: all RECIPES plain → kcal sum matches manual sum", () => {
  const expected = RECIPES.reduce((sum, r) => sum + r.nutrition.kcal, 0);
  assert.equal(planNutrition(RECIPES).kcal, expected);
});

// ── planNutrition: wrapped { recipe, portions } shape ─────────────────────────
test("planNutrition: wrapped shape with portions=2 doubles one recipe's values", () => {
  const plain   = planNutrition([gyudon]);
  const wrapped = planNutrition([{ recipe: gyudon, portions: 2 }]);
  assert.equal(wrapped.kcal, plain.kcal * 2);
});

test("planNutrition: mixed plain and wrapped items sum correctly", () => {
  const result = planNutrition([
    gyudon,                               // 1 serving
    { recipe: mapotofu, portions: 3 },    // 3 servings
  ]);
  const expected =
    recipeNutrition(gyudon,   1).kcal +
    recipeNutrition(mapotofu, 3).kcal;
  assert.equal(result.kcal, expected);
});

test("planNutrition: wrapped item with missing portions defaults to 1", () => {
  const plain   = planNutrition([gyudon]);
  const wrapped = planNutrition([{ recipe: gyudon }]);
  assert.deepEqual(wrapped, plain);
});

test("planNutrition: recipe without nutrition in plan contributes zeros", () => {
  const noNutrition = { id: "z", name: "Z", serves: 1, ingredients: [] };
  const result = planNutrition([gyudon, noNutrition]);
  assert.equal(result.kcal, gyudon.nutrition.kcal);
});

// ── fmtKcal ───────────────────────────────────────────────────────────────────
test("fmtKcal: formats integer as '<n> kcal'", () => {
  assert.equal(fmtKcal(540), "540 kcal");
});

test("fmtKcal: formats zero correctly", () => {
  assert.equal(fmtKcal(0), "0 kcal");
});

test("fmtKcal: rounds fractional values", () => {
  assert.equal(fmtKcal(540.6), "541 kcal");
});

test("fmtKcal: handles NaN/undefined gracefully → '0 kcal'", () => {
  assert.equal(fmtKcal(NaN),       "0 kcal");
  assert.equal(fmtKcal(undefined), "0 kcal");
});

// ── fmtMacros ─────────────────────────────────────────────────────────────────
test("fmtMacros: formats full object as 'P Xg · C Xg · F Xg'", () => {
  assert.equal(fmtMacros({ protein: 32, carbs: 60, fat: 18 }), "P 32g · C 60g · F 18g");
});

test("fmtMacros: missing fields default to 0", () => {
  assert.equal(fmtMacros({}), "P 0g · C 0g · F 0g");
});

test("fmtMacros: no argument defaults to all zeros", () => {
  assert.equal(fmtMacros(), "P 0g · C 0g · F 0g");
});

test("fmtMacros: rounds fractional grams", () => {
  assert.equal(fmtMacros({ protein: 32.4, carbs: 59.6, fat: 18.5 }),
    "P 32g · C 60g · F 19g");
});

// ── coerceRecipe: nutrition sanitization ──────────────────────────────────────
test("coerceRecipe: valid nutrition object is preserved", () => {
  const r = coerceRecipe({
    name: "Nutrition dish",
    ingredients: [{ name: "Chicken", qty: 200, unit: "g" }],
    nutrition: { kcal: 450, protein: 35, carbs: 20, fat: 18 },
  }, 0);
  assert.ok(r !== null);
  assert.deepEqual(r.nutrition, { kcal: 450, protein: 35, carbs: 20, fat: 18 });
});

test("coerceRecipe: negative nutrition values clamped to 0", () => {
  const r = coerceRecipe({
    name: "Negative nutrition",
    ingredients: [{ name: "X", qty: 1 }],
    nutrition: { kcal: -100, protein: -5, carbs: -20, fat: -3 },
  }, 0);
  assert.ok(r !== null);
  assert.deepEqual(r.nutrition, { kcal: 0, protein: 0, carbs: 0, fat: 0 });
});

test("coerceRecipe: NaN nutrition values coerced to 0", () => {
  const r = coerceRecipe({
    name: "NaN nutrition",
    ingredients: [{ name: "X", qty: 1 }],
    nutrition: { kcal: NaN, protein: NaN, carbs: "abc", fat: undefined },
  }, 0);
  assert.ok(r !== null);
  assert.deepEqual(r.nutrition, { kcal: 0, protein: 0, carbs: 0, fat: 0 });
});

test("coerceRecipe: missing nutrition object defaults all fields to 0", () => {
  const r = coerceRecipe({
    name: "No nutrition",
    ingredients: [{ name: "X", qty: 1 }],
  }, 0);
  assert.ok(r !== null);
  assert.deepEqual(r.nutrition, { kcal: 0, protein: 0, carbs: 0, fat: 0 });
});

test("coerceRecipe: partial nutrition fills missing fields with 0", () => {
  const r = coerceRecipe({
    name: "Partial nutrition",
    ingredients: [{ name: "X", qty: 1 }],
    nutrition: { kcal: 300 },
  }, 0);
  assert.ok(r !== null);
  assert.equal(r.nutrition.kcal,    300);
  assert.equal(r.nutrition.protein, 0);
  assert.equal(r.nutrition.carbs,   0);
  assert.equal(r.nutrition.fat,     0);
});

test("coerceRecipe: float nutrition values are rounded to integers", () => {
  const r = coerceRecipe({
    name: "Float nutrition",
    ingredients: [{ name: "X", qty: 1 }],
    nutrition: { kcal: 450.7, protein: 34.3, carbs: 20.9, fat: 17.1 },
  }, 0);
  assert.ok(r !== null);
  assert.equal(r.nutrition.kcal,    451);
  assert.equal(r.nutrition.protein, 34);
  assert.equal(r.nutrition.carbs,   21);
  assert.equal(r.nutrition.fat,     17);
});

test("coerceRecipe: nutrition as non-object is replaced with zeros", () => {
  const r = coerceRecipe({
    name: "String nutrition",
    ingredients: [{ name: "X", qty: 1 }],
    nutrition: "lots of calories",
  }, 0);
  assert.ok(r !== null);
  assert.deepEqual(r.nutrition, { kcal: 0, protein: 0, carbs: 0, fat: 0 });
});

// ── RECIPES: verify all have nutrition ───────────────────────────────────────
test("RECIPES: every recipe has a nutrition object with the 4 required fields", () => {
  for (const r of RECIPES) {
    assert.ok(r.nutrition,             `${r.id} missing nutrition`);
    assert.equal(typeof r.nutrition.kcal,    "number", `${r.id}.kcal not a number`);
    assert.equal(typeof r.nutrition.protein, "number", `${r.id}.protein not a number`);
    assert.equal(typeof r.nutrition.carbs,   "number", `${r.id}.carbs not a number`);
    assert.equal(typeof r.nutrition.fat,     "number", `${r.id}.fat not a number`);
  }
});

test("RECIPES: all nutrition values are non-negative integers", () => {
  for (const r of RECIPES) {
    const n = r.nutrition;
    for (const [field, val] of Object.entries(n)) {
      assert.ok(Number.isInteger(val) && val >= 0,
        `${r.id}.nutrition.${field}=${val} is not a non-negative integer`);
    }
  }
});

test("RECIPES: gyudon per-serving kcal is reasonable (400–700)", () => {
  assert.ok(gyudon.nutrition.kcal >= 400 && gyudon.nutrition.kcal <= 700);
});
