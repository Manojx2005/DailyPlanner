"use strict";
/* ---------- nutrition engine ----------
   Pure functions — no DOM, no globals, no side-effects.

   Nutrition shape (per serving, all integers):
     { kcal: number, protein: number, carbs: number, fat: number }

   A recipe with a missing or partial `nutrition` field is treated as all-zeros
   rather than throwing, so callers never need to guard. */

const ZERO = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

/** Clamp a raw nutrition field to a non-negative integer (0 when invalid). */
const toNonNegInt = v => Math.max(0, Math.round(Number(v) || 0));

/** Extract a safe nutrition object from a recipe, defaulting any missing/invalid
 *  field to 0.  Works even when recipe.nutrition is absent altogether. */
function safeNutrition(recipe) {
  const n = (recipe && recipe.nutrition) || {};
  return {
    kcal   : toNonNegInt(n.kcal),
    protein: toNonNegInt(n.protein),
    carbs  : toNonNegInt(n.carbs),
    fat    : toNonNegInt(n.fat),
  };
}

/**
 * recipeNutrition(recipe, portions = 1)
 *
 * Returns the nutrition totals for `portions` servings of `recipe`.
 * The stored values are per-serving, so each macro is multiplied by portions.
 *
 * @param {object} recipe   - A recipe object (nutrition may be absent).
 * @param {number} portions - Number of servings eaten (default 1).
 * @returns {{ kcal: number, protein: number, carbs: number, fat: number }}
 */
export function recipeNutrition(recipe, portions = 1) {
  const p = Math.max(0, Number(portions) || 0);
  const n = safeNutrition(recipe);
  return {
    kcal   : Math.round(n.kcal    * p),
    protein: Math.round(n.protein * p),
    carbs  : Math.round(n.carbs   * p),
    fat    : Math.round(n.fat     * p),
  };
}

/**
 * planNutrition(items)
 *
 * Sums nutrition across a meal plan. Each item may be either:
 *   - a plain recipe object  → counted as 1 serving, OR
 *   - { recipe, portions }   → counted as `portions` servings.
 *
 * @param {Array<object|{recipe:object,portions:number}>} items
 * @returns {{ kcal: number, protein: number, carbs: number, fat: number }}
 */
export function planNutrition(items) {
  const totals = { ...ZERO };
  for (const item of (items || [])) {
    // Detect the { recipe, portions } wrapper shape
    const isWrapped = item && item.recipe !== undefined;
    const recipe   = isWrapped ? item.recipe   : item;
    const portions = isWrapped ? (item.portions ?? 1) : 1;
    const n = recipeNutrition(recipe, portions);
    totals.kcal    += n.kcal;
    totals.protein += n.protein;
    totals.carbs   += n.carbs;
    totals.fat     += n.fat;
  }
  return totals;
}

/**
 * fmtKcal(n)
 * Formats a kilocalorie value as a display string.
 * @example fmtKcal(540) → "540 kcal"
 */
export function fmtKcal(n) {
  return `${Math.round(Number(n) || 0)} kcal`;
}

/**
 * fmtMacros({ protein, carbs, fat })
 * Formats macro breakdown as a compact display string.
 * @example fmtMacros({ protein:32, carbs:60, fat:18 }) → "P 32g · C 60g · F 18g"
 */
export function fmtMacros({ protein = 0, carbs = 0, fat = 0 } = {}) {
  return `P ${Math.round(protein)}g · C ${Math.round(carbs)}g · F ${Math.round(fat)}g`;
}
