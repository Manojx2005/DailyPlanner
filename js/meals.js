"use strict";
/* ---------- meal planner engine ----------
   Pure module. A small recipe DB, plus logic to cross-reference a meal plan
   against pantry stock and emit the *missing* ingredients as shopping items
   shaped exactly like shop.items ({name, qty, price, cat, got}). */

// cat drives Japan consumption tax in the shopping tab: "food" 8%, "other" 10%.
// `price` is a rough Tokyo-supermarket pack price in ¥ (estimate, editable later).
export const RECIPES=[
  {id:"gyudon", name:"Gyūdon (beef bowl)", cuisine:"Japanese", serves:2, ingredients:[
    {name:"Thinly sliced beef", qty:200, unit:"g", cat:"food", price:520},
    {name:"Onion", qty:1, unit:"", cat:"food", price:60},
    {name:"Short-grain rice", qty:1, unit:"cup", cat:"food", price:0, staple:true},
    {name:"Soy sauce", qty:0, unit:"", cat:"food", price:0, staple:true},
    {name:"Mirin", qty:0, unit:"", cat:"food", price:0, staple:true},
    {name:"Dashi", qty:0, unit:"", cat:"food", price:0, staple:true},
    {name:"Sugar", qty:0, unit:"", cat:"food", price:0, staple:true},
  ], instructions:[
    "Thinly slice the onion.",
    "In a pan, bring the dashi, soy sauce, mirin, and sugar to a boil.",
    "Add the sliced onion and simmer until tender.",
    "Add the thinly sliced beef and simmer until fully cooked.",
    "Serve hot over a bowl of steamed short-grain rice."
  ], nutrition:{kcal:540, protein:28, carbs:62, fat:16}},
  {id:"mapotofu", name:"Mapo tofu", cuisine:"Chinese", serves:2, ingredients:[
    {name:"Tofu", qty:2, unit:"pack", cat:"food", price:160},
    {name:"Ground pork", qty:150, unit:"g", cat:"food", price:300},
    {name:"Spring onion", qty:1, unit:"", cat:"food", price:90},
    {name:"Doubanjiang", qty:0, unit:"", cat:"food", price:0, staple:true},
    {name:"Garlic", qty:0, unit:"", cat:"food", price:0, staple:true},
    {name:"Ginger", qty:0, unit:"", cat:"food", price:0, staple:true},
  ], instructions:[
    "Mince the garlic and ginger, and chop the spring onion.",
    "Cut the tofu into small cubes and blanch in hot water for 2 minutes.",
    "Stir-fry the ground pork until browned, then add garlic, ginger, and doubanjiang.",
    "Add water or broth, bring to a boil, and gently fold in the tofu cubes.",
    "Simmer for a few minutes, thicken with cornstarch slurry if desired, and garnish with spring onion."
  ], nutrition:{kcal:380, protein:26, carbs:8, fat:25}},
  {id:"naan", name:"Homemade naan", cuisine:"Indian", serves:4, ingredients:[
    {name:"Flour", qty:300, unit:"g", cat:"food", price:0, staple:true},
    {name:"Yogurt", qty:1, unit:"cup", cat:"food", price:200},
    {name:"Yeast", qty:1, unit:"pack", cat:"food", price:150},
    {name:"Salt", qty:0, unit:"", cat:"food", price:0, staple:true},
    {name:"Cooking oil", qty:0, unit:"", cat:"food", price:0, staple:true},
  ], instructions:[
    "Mix warm water, yeast, and a pinch of sugar; let sit until frothy.",
    "Combine flour, salt, yogurt, and the yeast mixture to form a dough.",
    "Knead until smooth, cover, and let rise for 1-2 hours.",
    "Divide dough into balls and roll out flat.",
    "Cook on a hot, dry skillet until bubbly and browned on both sides."
  ], nutrition:{kcal:290, protein:8, carbs:50, fat:6}},
  {id:"biryani", name:"Chicken biryani", cuisine:"Indian", serves:4, ingredients:[
    {name:"Chicken thigh", qty:400, unit:"g", cat:"food", price:420},
    {name:"Basmati rice", qty:2, unit:"cup", cat:"food", price:600},
    {name:"Onion", qty:2, unit:"", cat:"food", price:120},
    {name:"Yogurt", qty:1, unit:"cup", cat:"food", price:200},
    {name:"Tomato", qty:2, unit:"", cat:"food", price:160},
    {name:"Garam masala", qty:0, unit:"", cat:"food", price:0, staple:true},
    {name:"Turmeric", qty:0, unit:"", cat:"food", price:0, staple:true},
    {name:"Garlic", qty:0, unit:"", cat:"food", price:0, staple:true},
    {name:"Ginger", qty:0, unit:"", cat:"food", price:0, staple:true},
  ], instructions:[
    "Marinate chicken in yogurt, garlic, ginger, turmeric, and garam masala for 30 mins.",
    "Wash and soak basmati rice for 20 minutes, then parboil and drain.",
    "Fry thinly sliced onions until golden brown; set half aside for garnish.",
    "In the same pot, cook tomatoes and marinated chicken until the chicken is tender.",
    "Layer the parboiled rice over the chicken, cover tightly, and steam on low heat (dum) for 15-20 minutes."
  ], nutrition:{kcal:610, protein:34, carbs:72, fat:18}},
  {id:"palakpaneer", name:"Palak paneer", cuisine:"Indian", serves:3, ingredients:[
    {name:"Paneer", qty:200, unit:"g", cat:"food", price:380},
    {name:"Spinach", qty:1, unit:"bunch", cat:"food", price:200},
    {name:"Cream", qty:1, unit:"pack", cat:"food", price:250},
    {name:"Tomato", qty:1, unit:"", cat:"food", price:80},
    {name:"Garam masala", qty:0, unit:"", cat:"food", price:0, staple:true},
    {name:"Garlic", qty:0, unit:"", cat:"food", price:0, staple:true},
    {name:"Cooking oil", qty:0, unit:"", cat:"food", price:0, staple:true},
  ], instructions:[
    "Blanch the spinach in boiling water, then immediately cool in ice water and blend into a puree.",
    "Cube the paneer and optionally pan-fry until lightly golden.",
    "Sauté minced garlic and chopped tomatoes in oil until tomatoes break down.",
    "Stir in garam masala and the spinach puree, cooking for a few minutes.",
    "Add the paneer cubes and cream, simmer gently, and serve."
  ], nutrition:{kcal:420, protein:18, carbs:12, fat:33}},
  {id:"agedashi", name:"Agedashi tofu + miso soup", cuisine:"Japanese", serves:2, ingredients:[
    {name:"Tofu", qty:2, unit:"pack", cat:"food", price:160},
    {name:"Miso paste", qty:0, unit:"", cat:"food", price:0, staple:true},
    {name:"Dashi", qty:0, unit:"", cat:"food", price:0, staple:true},
    {name:"Potato starch", qty:1, unit:"pack", cat:"food", price:130},
    {name:"Spring onion", qty:1, unit:"", cat:"food", price:90},
  ], instructions:[
    "Cut one pack of tofu into cubes, dust generously with potato starch, and deep-fry until crispy.",
    "Make a simple broth by boiling dashi and a splash of soy sauce/mirin, pour over the fried tofu, and garnish with spring onion.",
    "For the soup: heat remaining dashi in a pot, add cubed tofu (from the second pack).",
    "Turn off the heat, dissolve miso paste into the soup, and serve."
  ], nutrition:{kcal:280, protein:16, carbs:20, fat:14}},
];

const norm=s=>String(s).trim().toLowerCase();

/* Aggregate the ingredients of the selected recipes, drop anything already in
   the pantry, and merge duplicates across recipes (sum qty, keep first price). */
export function neededIngredients(selectedRecipes, pantry){
  const have=new Set((pantry||[]).map(norm));
  const map=new Map();
  for(const r of selectedRecipes){
    for(const ing of r.ingredients){
      if(ing.staple)continue;                          // basics the user almost always keeps stocked
      if(have.has(norm(ing.name)))continue;            // pantry already has it
      const key=norm(ing.name);
      if(map.has(key)){map.get(key).qty+=ing.qty;}
      else map.set(key,{name:ing.name,qty:ing.qty,unit:ing.unit,cat:ing.cat,price:ing.price||0});
    }
  }
  return [...map.values()];
}

/* Turn a needed-ingredient into a shop.items row. Amount folds into the name
   ("Beef (200g)") so the shopping tab's qty×unitprice math stays sensible. */
export function toShopItem(ing){
  const amt=ing.qty&&ing.unit?` (${ing.qty}${ing.unit})`:ing.qty>1?` ×${ing.qty}`:"";
  return {name:`${ing.name}${amt}`, qty:1, price:ing.price||0, cat:ing.cat||"food", got:false};
}

/* Validate + normalize an AI-generated recipe into the trusted schema.
   Returns a clean recipe object, or null if it's unusable. */
export function coerceRecipe(r,idx){
  if(!r||!r.name||!Array.isArray(r.ingredients))return null;
  const ingredients=r.ingredients.map(ing=>({
    name:String(ing&&ing.name||"").slice(0,50),
    qty:Number(ing&&ing.qty)||1,
    unit:String(ing&&ing.unit||"").slice(0,12),
    cat:ing&&ing.cat==="other"?"other":"food",
    price:Math.max(0,Math.round(Number(ing&&ing.price)||0)),
    staple:!!(ing&&ing.staple),
  })).filter(i=>i.name);
  const instructions = Array.isArray(r.instructions) ? r.instructions.map(s=>String(s).trim()).filter(Boolean) : [];
  if(!ingredients.length)return null;
  const n=r.nutrition&&typeof r.nutrition==="object"?r.nutrition:{};
  const nutrition={
    kcal   :Math.max(0,Math.round(Number(n.kcal   )||0)),
    protein:Math.max(0,Math.round(Number(n.protein)||0)),
    carbs  :Math.max(0,Math.round(Number(n.carbs  )||0)),
    fat    :Math.max(0,Math.round(Number(n.fat    )||0)),
  };
  return {
    id:"ai-"+Date.now().toString(36)+"-"+idx,
    name:String(r.name).slice(0,60),
    cuisine:String(r.cuisine||"Other").slice(0,30),
    serves:Math.min(12,Math.max(1,Number(r.serves)||2)),
    ingredients, instructions, nutrition, ai:true,
  };
}
/* Propose a varied week: pick recipes until total portions meets the target. */
export function suggestWeek(recipes, targetPortions = 14){
  if (targetPortions <= 0) return [];
  const seen=new Set(),pick=[];
  let currentPortions = 0;
  // First pass: variety
  for(const r of recipes){
    if(!seen.has(r.cuisine)){
      seen.add(r.cuisine);
      pick.push(r.id);
      currentPortions += (r.serves || 1);
      if(currentPortions>=targetPortions)break;
    }
  }
  // Second pass: fill remaining
  for(const r of recipes){
    if(currentPortions>=targetPortions)break;
    if(!pick.includes(r.id)){
      pick.push(r.id);
      currentPortions += (r.serves || 1);
    }
  }
  return pick;
}
