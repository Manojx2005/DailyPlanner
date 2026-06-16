"use strict";
/* ---------- app controller ----------
   Owns state, persistence, DOM rendering, and event wiring.
   Pure logic lives in ./schedule.js and ./shopping.js.
   Auth via ./auth.js, cloud sync via ./sync.js. */

import { getLang, setLang, t, applyLanguage, availableLanguages, setCurrency } from "./i18n.js?v=1.7";
import { fmtDur, toHHMM, buildSchedule, asText, toMin } from "./schedule.js?v=1.6";
import { yen, fromDisplay } from "./shopping.js?v=1.6";
import { buildWeek } from "./week.js?v=1.7";
import { coerceRecipe } from "./meals.js?v=1.6";
import { buildICS, timelineToEvents, downloadICS } from "./calendar.js?v=1.6";
import { staggerCards, animateTabIndicator, animatePanel, animateModal } from "./fx.js?v=2.0";
import { initAuth, isConfigured as isFirebaseConfigured, signInWithGoogle, signInWithEmail,
         signUpWithEmail, resetPassword, signOut as fbSignOut, onAuthStateChanged, getApp } from "./auth.js?v=1.6";
import { initSync, stopAllListeners, migrateLocalStorage } from "./sync.js?v=1.6";
import { DEFAULT, DEFAULT_SHOP, DEFAULT_FIN, DEFAULT_KITCHEN, KEY, saveData, loadData, setState as storeSetState, setConnection, getViewDate, setViewDate } from "./store.js?v=1.0";
import { $, esc, cSel, safeUrl, getLocalYMD, formatDateDisplay, cTime, cDate } from "./ui-utils.js?v=1.0";
import { shop, resetShop, setShopData, saveShop, loadShop, renderShopRows, renderTaxToggle, updateShop, onShopField } from "./ui-shopping.js?v=1.0";
import { finance, setFinData, draft, saveFin, loadFin, renderIncome, renderCards, renderExpenses,
         renderFinInputs, updateFinance, onFinField,
         openReceipt, closeReceipt, renderDraft, draftTotal, onDraftField, confirmReceipt,
         payerOptionsArr } from "./ui-finance.js?v=1.0";
import { kitchen, setKitchenData, saveKitchen, loadKitchen, recipeById, renderPantry, renderRecipeList, renderMealPlan,
         currentNeeds, renderNeeds, updateAiPrompt, renderKitchen, addCustomMeal,
         generateShoppingList, planSuggestedWeek, clearMealPlan } from "./ui-kitchen.js?v=1.0";
import { dowPicker, renderFixed, renderMeals, renderTasks, renderInputs, getFilteredState,
         renderPlan, renderGoals, renderWeek } from "./ui-schedule.js?v=1.0";
import { renderNotes, renderPinnedNotes, initNotes } from "./ui-notes.js?v=1.0";
import { calcStreak, renderHabits, renderHabitHeatmap, initHabits } from "./ui-habits.js?v=1.0";
import { updatePomoDisplay, initPomo } from "./ui-pomo.js?v=1.0";
import { renderMonth, initMonth, syncMonthToViewDate, getMonthDate, navigateMonth } from "./ui-month.js?v=1.0";

/* ---------- state + persistence ---------- */
/* DEFAULT and KEY live in store.js — imported above.
   `state` stays a local mirror here until Agent 2 fully decouples the render functions. */
let state = structuredClone(DEFAULT);
export function getCurrency() { return state.currency || "¥"; }

let currentUser = null; // Firebase user object
let useCloud = false;   // true when Firebase is configured and user is logged in

async function save() {
  const data = { wake:state.wake, sleep:state.sleep, fixed:state.fixed, meals:state.meals, tasks:state.tasks, goals:state.goals, notes:state.notes||{}, pinnedNotes:state.pinnedNotes||[], habits:state.habits||[] };
  const { ok, cloud } = await saveData(data, currentUser?.uid, useCloud);
  $("savedNote").textContent = cloud
    ? (ok ? t("status.synced") : t("status.savedLocally"))
    : (ok ? t("status.saved")  : t("status.notSaved"));
}
async function load() {
  const loaded = await loadData(currentUser?.uid, useCloud);
  if (loaded) state = { ...structuredClone(DEFAULT), ...loaded };
  storeSetState({ currency: state.currency || "¥" });
}

function setPlanDate(dateStr) {
  const hidden = $("planDate");
  if (!hidden) return;
  hidden.value = dateStr || "";
  const head = $("planDateHead");
  if (head) head.textContent = dateStr ? formatDateDisplay(dateStr) : "No date";
  const trigger = $("planDateTrigger");
  if (trigger) {
    trigger.classList.toggle("empty", !dateStr);
    trigger.setAttribute("aria-label", "date " + (dateStr || "none"));
  }
  setViewDate(dateStr || new Date());
}

function onGoalField(e) {
  const tgt = e.target, i = +tgt.dataset.i, f = tgt.dataset.f;
  state.goals[i][f] = tgt.value;
  save(); renderWeek(state);
}

/* a11y: walk every .f label whose immediate next sibling is a native non-hidden
   control and wire them up with a generated id — no render site needs to know. */
let _lblSeq = 0;
function wireLabels(root = document) {
  root.querySelectorAll("label.f:not([for])").forEach(label => {
    const ctrl = label.nextElementSibling;
    if (!ctrl) return;
    if (!/^(INPUT|SELECT|TEXTAREA)$/.test(ctrl.tagName)) return;
    if (ctrl.type === "hidden") return;
    if (!ctrl.id) ctrl.id = "f-" + (++_lblSeq);
    label.htmlFor = ctrl.id;
  });
}

async function onTimetablePhoto(e){
  const file=e.target.files&&e.target.files[0];e.target.value="";if(!file)return;
  const shot=$("timetableShot"),status=$("timetableStatus");
  if(shot.dataset.url)URL.revokeObjectURL(shot.dataset.url);
  const url=URL.createObjectURL(file);shot.src=url;shot.dataset.url=url;shot.classList.add("has");
  status.className="finehint";
  status.textContent="Added as reference. (AI auto-fill has been removed).";
}

/* ---------- notifications ---------- */
function updateNotifBtn(){
  const btn=$("notifBtn");if(!btn)return;
  btn.classList.toggle("active",Notification.permission==="granted");
  btn.title=Notification.permission==="granted"?"Reminders on":"Enable reminders";
}
function scheduleBlockNotifs(){
  if(Notification.permission!=="granted")return;
  const dateStr=$("planDate")?.value||getLocalYMD(new Date());
  if(dateStr!==getLocalYMD(new Date()))return;
  const filtered=getFilteredState(state, dateStr);
  const now=new Date();
  (filtered.fixed||[]).forEach(b=>{
    const[h,m]=b.start.split(":").map(Number);
    const blockTime=new Date();blockTime.setHours(h,m-5,0,0);
    const delay=blockTime-now;
    if(delay>0&&delay<8*3600*1000){
      setTimeout(()=>{
        if(Notification.permission==="granted")
          new Notification("📅 "+b.label,{body:"Starting in 5 minutes ("+b.start+")",icon:"./icon.svg"});
      },delay);
    }
  });
}
if($("notifBtn")){
  $("notifBtn").onclick=async()=>{
    if(!("Notification" in window)){alert("Notifications not supported in this browser.");return;}
    if(Notification.permission==="granted"){updateNotifBtn();return;}
    const result=await Notification.requestPermission();
    updateNotifBtn();
    if(result==="granted")scheduleBlockNotifs();
  };
}

/* ---------- print ---------- */
if($("printBtn")) $("printBtn").onclick=()=>window.print();

/* ---------- tabs ---------- */
const TABS=["schedule","week","month","shopping","meals","finance","notes","habits"];
const DATE_TABS = new Set(["schedule","week","month"]);
let _activeTab = "schedule";

const _NM  = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const _NMS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const _ND  = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function updateNavLabel(tab) {
  const lbl = $("navLabel");
  if (!lbl) return;
  if (tab === "schedule") {
    const d = getViewDate();
    lbl.textContent = `${_ND[d.getDay()]}, ${_NMS[d.getMonth()]} ${d.getDate()}`;
  } else if (tab === "week") {
    const d = getViewDate();
    const end = new Date(d); end.setDate(d.getDate() + 6);
    lbl.textContent = d.getMonth() === end.getMonth()
      ? `${_NMS[d.getMonth()]} ${d.getDate()}–${end.getDate()}, ${d.getFullYear()}`
      : `${_NMS[d.getMonth()]} ${d.getDate()} – ${_NMS[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`;
  } else if (tab === "month") {
    const md = getMonthDate();
    lbl.textContent = `${_NM[md.getMonth()]} ${md.getFullYear()}`;
  }
}

function setTab(t){
  _activeTab = t;
  if(navigator.vibrate)navigator.vibrate(6);
  document.querySelectorAll(".tab").forEach(b=>b.setAttribute("aria-selected",String(b.dataset.tab===t)));
  for(const name of TABS){
    const p=$("panel-"+name);if(p)p.hidden=name!==t;
    const ro=$("ro-"+name);if(ro)ro.hidden=name!==t;
  }
  const navBar=$("dateNavBar");
  if(navBar) navBar.hidden=!DATE_TABS.has(t);
  updateNavLabel(t);
  if(t==="week")renderWeek(state);
  if(t==="month"){ syncMonthToViewDate(); _doRenderMonth(); }
  if(t==="notes")renderNotes(state);
  if(t==="habits"){renderHabits(state);updatePomoDisplay();}
  const panel=$("panel-"+t);
  animatePanel(panel);
  staggerCards(panel);
  // Spring-slide the indicator; re-measure after label expands (380ms)
  const tabEl=document.querySelector(`.tab[data-tab="${t}"]`);
  animateTabIndicator(tabEl);
  setTimeout(()=>animateTabIndicator(document.querySelector(`.tab[data-tab="${t}"]`)),380);
}

/* ---------- events ---------- */
function onField(e){
  const t=e.target;if(!t.dataset.k)return;
  const{k,i,f}=t.dataset;
  state[k][+i][f]= t.type==='checkbox' ? t.checked : t.value;
  save();
}
function routeField(e){
  const t=e.target,sc=t.dataset.scope;
  if(sc==="shop"){onShopField(e);return true;}
  if(sc==="fin"){onFinField(e);return true;}
  if(sc==="draft"){onDraftField(e);return true;}
  if(sc==="draftpaid"){if(draft)draft.paidBy=t.value;return true;}
  if(sc==="goal"){onGoalField(e);return true;}
  return false;
}
document.addEventListener("input",e=>{
  const t=e.target;
  if(routeField(e))return;
  if(t.id==="finInitial"){finance.initialBalance=fromDisplay(t.value);updateFinance();saveFin();return;}
  if(t.id==="wake"||t.id==="sleep"){state[t.id]=t.value;save();return;}
  onField(e);
});
document.addEventListener("change",e=>{
  if(routeField(e))return;
  if(e.target.id==="receiptCam")onPhoto(e);
  if(e.target.id==="timetableCam")onTimetablePhoto(e);
  if(e.target.id==="aiJsonUpload")onAiJsonUpload(e);
});
document.addEventListener("click",e=>{
  const tgt=e.target;
  const del=tgt.dataset.del;
  if(del){state[del].splice(+tgt.dataset.i,1);({fixed:renderFixed,meals:renderMeals,tasks:renderTasks})[del]();save();return;}
  if(tgt.dataset.stockshop!==undefined){
    const it=shop.items[+tgt.dataset.stockshop];
    const m = it.name.match(/^(.*?)(?:\s*\((.*?)\))?(?:\s*×\d+)?$/);
    const baseName = m ? m[1].trim() : it.name;
    const existing = kitchen.pantry.find(p=>p.name.toLowerCase()===baseName.toLowerCase());
    if (existing) {
      existing.qty += Number(it.qty) || 1;
    } else {
      kitchen.pantry.push({name: baseName, qty: Number(it.qty) || 1, unit: "unit"});
    }
    shop.items.splice(+tgt.dataset.stockshop,1);
    renderShopRows();updateShop();saveShop();
    renderKitchen(state);saveKitchen();
    updateAiPrompt();
    return;
  }
  if(tgt.dataset.delshop!==undefined){shop.items.splice(+tgt.dataset.delshop,1);renderShopRows();updateShop();saveShop();return;}
  if(tgt.dataset.delfin!==undefined){const a=tgt.dataset.delfin;finance[a].splice(+tgt.dataset.i,1);renderFinInputs();updateFinance();saveFin();return;}
  if(tgt.dataset.deldraft!==undefined){draft.items.splice(+tgt.dataset.deldraft,1);if(!draft.items.length)draft.items.push({name:"",qty:1,price:0,cat:"food"});renderDraft();return;}
  if(tgt.dataset.dowtoggle!==undefined){
    const scope=tgt.dataset.dowscope||"fixed";
    const i=+tgt.dataset.dowtoggle,d=+tgt.dataset.dow,item=state[scope][i];
    if(!item.days)item.days=[];const k=item.days.indexOf(d);
    if(k>=0)item.days.splice(k,1);else item.days.push(d);
    item.days.sort((a,b)=>a-b);
    if(scope==="fixed") renderFixed(state); else renderMeals(state);
    save();return;
  }
  if(tgt.id==="copyAiPromptBtn"){
    const txt=$("aiPromptText").value;
    navigator.clipboard.writeText(txt).then(()=>alert("Prompt copied to clipboard!"))
      .catch(()=>alert("Failed to copy. Please copy manually."));
    return;
  }
  if(tgt.dataset.recipe){
    const id=tgt.dataset.recipe,k=kitchen.plan.findIndex(p=>p.recipeId===id);
    if(k>=0)kitchen.plan.splice(k,1);else kitchen.plan.push({recipeId: id, made: false});
    renderKitchen(state);saveKitchen();return;
  }
  if(tgt.dataset.viewrecipe) {
    const r=recipeById(tgt.dataset.viewrecipe);
    if(r) {
      $("recipeTitle").textContent = r.name || "Recipe";
      $("recipeSubtitle").textContent = `${r.cuisine || "Custom"} · serves ${r.serves || 1}`;
      $("recipeIngredients").innerHTML = (r.ingredients||[]).map(ing => {
         const amt=ing.qty&&ing.unit?`${ing.qty}${ing.unit}`:ing.qty>1?`×${ing.qty}`:"";
         return `<li style="margin-bottom:4px"><b>${esc(ing.name)}</b> <span style="color:var(--text-muted)">${esc(amt)}</span></li>`;
      }).join("");
      const steps = r.instructions && r.instructions.length > 0 ? r.instructions : ["No instructions provided."];
      $("recipeInstructions").innerHTML = steps.map(step => `<li style="margin-bottom:6px">${esc(step)}</li>`).join("");
      const url=safeUrl(r.url);
      if(url) {
        $("recipeLinkWrap").hidden = false;
        $("recipeLink").href = url;
        $("recipeLink").rel = "noopener noreferrer";
      } else {
        $("recipeLinkWrap").hidden = true;
      }
      $("recipeModal").hidden = false;
      animateModal($("recipeModal").querySelector(".modal"));
    }
    return;
  }
  if(tgt.id==="recipeClose"){
    $("recipeModal").hidden=true;
    return;
  }
  if(tgt.dataset.mademeal!==undefined){
    const i = +tgt.dataset.mademeal;
    const p = kitchen.plan[i];
    if(!p.made) {
      p.made = true;
      const r = recipeById(p.recipeId);
      if(r) {
        for(const ing of r.ingredients) {
          const existing = kitchen.pantry.find(pi => pi.name.toLowerCase() === ing.name.toLowerCase());
          if(existing && existing.qty > 0) {
            existing.qty -= (ing.qty || 1);
            if(existing.qty < 0) existing.qty = 0;
          }
        }
      }
      renderKitchen(state);saveKitchen();
      updateAiPrompt();
    }
    return;
  }
  if(tgt.dataset.delmeal!==undefined){kitchen.plan.splice(+tgt.dataset.delmeal,1);renderKitchen(state);saveKitchen();return;}
  if(tgt.dataset.delpantry!==undefined){kitchen.pantry.splice(+tgt.dataset.delpantry,1);renderPantry();renderNeeds(state);saveKitchen();return;}
  if(tgt.dataset.delgoal!==undefined){state.goals.splice(+tgt.dataset.delgoal,1);renderGoals(state);save();renderWeek(state);return;}
  const tabBtn=tgt.closest(".tab[data-tab]");if(tabBtn){setTab(tabBtn.dataset.tab);return;}
  if(tgt.dataset.mode){shop.taxMode=tgt.dataset.mode;renderTaxToggle();updateShop();saveShop();return;}
});

/* ---------- drag to reorder tasks ---------- */
let _dragFromHandle=false,_dragTaskIdx=null,_dragOverIdx=null;
document.addEventListener("mousedown",e=>{_dragFromHandle=!!e.target.closest(".drag-handle");});
document.addEventListener("touchstart",e=>{_dragFromHandle=!!e.target.closest(".drag-handle");},{passive:true});
document.addEventListener("dragstart",e=>{
  if(!_dragFromHandle){e.preventDefault();return;}
  const row=e.target.closest(".row.task[data-task-idx]");if(!row)return;
  _dragTaskIdx=+row.dataset.taskIdx;
  row.classList.add("dragging");
  e.dataTransfer.effectAllowed="move";
  e.dataTransfer.setData("text/plain",String(_dragTaskIdx));
});
document.addEventListener("dragend",()=>{
  document.querySelectorAll(".row.task").forEach(r=>r.classList.remove("dragging","drag-over"));
  _dragTaskIdx=null;_dragOverIdx=null;
});
document.addEventListener("dragover",e=>{
  const row=e.target.closest(".row.task[data-task-idx]");
  if(!row||_dragTaskIdx===null)return;
  e.preventDefault();e.dataTransfer.dropEffect="move";
  const idx=+row.dataset.taskIdx;
  if(idx!==_dragOverIdx){
    document.querySelectorAll(".row.task").forEach(r=>r.classList.remove("drag-over"));
    _dragOverIdx=idx;row.classList.add("drag-over");
  }
});
document.addEventListener("drop",e=>{
  const row=e.target.closest(".row.task[data-task-idx]");
  if(!row||_dragTaskIdx===null)return;
  e.preventDefault();
  const toIdx=+row.dataset.taskIdx;
  if(toIdx!==_dragTaskIdx){
    const tasks=[...state.tasks];
    const[moved]=tasks.splice(_dragTaskIdx,1);
    tasks.splice(toIdx,0,moved);
    state.tasks=tasks;
    renderTasks(state);save();
  }
  document.querySelectorAll(".row.task").forEach(r=>r.classList.remove("dragging","drag-over"));
  _dragTaskIdx=null;_dragOverIdx=null;
});

/* ---------- swipe to switch tabs ---------- */
let _swipeX=0,_swipeY=0,_swipeOk=false;
document.addEventListener("touchstart",e=>{
  _swipeX=e.touches[0].clientX;_swipeY=e.touches[0].clientY;
  _swipeOk=!e.target.closest("input,textarea,select,.c-sel,.c-time,.c-date,.rows,.month-grid,.weekgrid,.time-wheels");
},{passive:true});
document.addEventListener("touchend",e=>{
  if(!_swipeOk)return;
  const dx=e.changedTouches[0].clientX-_swipeX;
  const dy=Math.abs(e.changedTouches[0].clientY-_swipeY);
  if(Math.abs(dx)<60||dy>Math.abs(dx)*0.8)return;
  const cur=TABS.indexOf(document.querySelector(".tab[aria-selected='true']")?.dataset.tab);
  if(cur===-1)return;
  const next=dx<0?Math.min(cur+1,TABS.length-1):Math.max(cur-1,0);
  if(next!==cur)setTab(TABS[next]);
},{passive:true});

/* ai json upload */
function onAiJsonUpload(e){
  const file = e.target.files && e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      const arr = Array.isArray(data) ? data : [data];
      let added = 0;
      arr.forEach((r, idx) => {
        const clean = coerceRecipe(r, "upload_"+idx);
        if(clean) {
          kitchen.customRecipes=(kitchen.customRecipes||[]).concat([clean]);
          added++;
        }
      });
      if(added > 0) {
        alert(`Successfully imported ${added} recipe(s)!`);
        renderKitchen(state);
        saveKitchen();
      } else {
        alert("No valid recipes found in the JSON file.");
      }
    } catch(err) {
      console.error(err);
      alert("Invalid JSON file.");
    }
    e.target.value = ""; // clear input
  };
  reader.readAsText(file);
}

/* ---------- receipt AI helpers ---------- */
function fileToBase64(file){
  return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result.split(",")[1]);r.onerror=rej;r.readAsDataURL(file);});
}

async function scanReceiptWithGemini(key,base64,mimeType){
  const prompt=`You are a receipt parser. Extract all purchased line items from this receipt image.
Return ONLY a valid JSON array with no markdown or explanation.
Schema: [{"name":"item name","qty":1,"price":198,"cat":"food"}]
Rules:
- price = unit price as a plain number (no currency symbol, no commas)
- qty = integer (default 1)
- cat = "food" for food/drink, "other" for alcohol or non-food items
- Exclude totals, taxes, subtotals, discounts, store name, and payment info`;
  const resp=await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(key)}`,
    {method:"POST",headers:{"Content-Type":"application/json"},
     body:JSON.stringify({contents:[{parts:[{text:prompt},{inline_data:{mime_type:mimeType||"image/jpeg",data:base64}}]}]})}
  );
  if(!resp.ok){
    const errBody=await resp.json().catch(()=>({}));
    const msg=errBody.error?.message||resp.statusText;
    throw new Error(resp.status===429?`Rate limited — wait a moment and try again.`:`Gemini error ${resp.status}: ${msg}`);
  }
  const data=await resp.json();
  const raw=data.candidates?.[0]?.content?.parts?.[0]?.text||"[]";
  return JSON.parse(raw.replace(/```json?\n?/g,"").replace(/```/g,"").trim());
}

/* Parse raw TextDetector blocks: lines ending in a number are treated as price lines. */
function parseReceiptText(blocks){
  const priceRe=/(?:[¥$€£]\s?)?(\d[\d,\.]+)\s*[円¥]?\s*$/;
  const items=[];
  for(const b of blocks){
    const line=(b.rawValue||"").trim();
    const m=line.match(priceRe);
    if(!m)continue;
    const price=parseFloat(m[1].replace(/,/g,""));
    if(!price||price>99999)continue;
    const name=line.slice(0,m.index).trim();
    if(!name)continue;
    items.push({name,qty:1,price:Math.round(price),cat:"food"});
  }
  return items;
}

async function scanReceiptNative(blob){
  if(!("TextDetector" in window))return null;
  const td=new window.TextDetector();
  const bmp=await createImageBitmap(blob);
  const blocks=await td.detect(bmp);
  bmp.close();
  return parseReceiptText(blocks);
}

async function onPhoto(e){
  const file=e.target.files&&e.target.files[0];if(!file||!draft)return;
  if(draft.photoURL)URL.revokeObjectURL(draft.photoURL);
  draft.photoURL=URL.createObjectURL(file);
  const shot=$("rmShot");shot.src=draft.photoURL;shot.classList.add("has");
  e.target.value="";

  const key=window.GEMINI_API_KEY;
  const hasNative="TextDetector" in window;
  if(!key&&!hasNative){
    const hint=$("rmHint");
    if(hint)hint.textContent="Photo shown for reference — type items below. (Add a Gemini key to config.local.js for auto-scan.)";
    return;
  }

  $("rmRows").innerHTML=`<div class="scan-loading">🔍 Reading receipt…</div>`;
  $("rmTotal").textContent=yen(0);

  let items=null;
  let scanErr=null;
  try{
    items=key
      ? await scanReceiptWithGemini(key,(await fileToBase64(file)),file.type)
      : await scanReceiptNative(file);
  }catch(err){
    console.error("Receipt scan failed:",err);
    scanErr=err.message||"Scan failed";
  }

  if(items&&items.length){
    draft.items=items.map(it=>({
      name:String(it.name||""),
      qty:Math.max(1,Math.round(Number(it.qty)||1)),
      price:Number(it.price)||0,
      cat:it.cat==="other"?"other":"food"
    }));
    const hint=$("rmHint");
    if(hint)hint.textContent="Check each line against the photo, fix anything off, then add.";
  }else{
    draft.items=[{name:"",qty:1,price:0,cat:"food"}];
    const hint=$("rmHint");
    if(hint)hint.textContent=scanErr||"Couldn't auto-read this receipt — fill in items below.";
  }
  renderDraft();
}
$("addFixed").onclick=()=>{state.fixed.push({label:"",start:"13:00",end:"14:00"});renderFixed(state);save();};
$("addMeal").onclick=()=>{state.meals.push({label:"Snack",time:"15:30",dur:15});renderMeals(state);save();};
$("addTask").onclick=()=>{state.tasks.push({label:"",dur:30,category:"study",priority:"med",deadlineDays:3});renderTasks(state);save();};
$("plan").onclick=renderPlan;
if($("planDate")) $("planDate").addEventListener("input", renderPlan);
function _exportDay() {
  const dateStr = $("planDate")?.value || getLocalYMD(new Date());
  const filteredState = getFilteredState(state, dateStr);
  const r = buildSchedule(filteredState);
  const events = timelineToEvents(r.timeline, new Date(dateStr));
  if (!events.length) { alert("Nothing to export yet — press Plan my day first."); return; }
  downloadICS("dayplan.ics", buildICS(events));
}
function _exportWeek() {
  let allEvents = [];
  const baseDate = getViewDate();
  for (let i = 0; i < 7; i++) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + i);
    const dateStr = getLocalYMD(d);
    const filteredState = getFilteredState(state, dateStr);
    filteredState.tasks = [];
    const r = buildSchedule(filteredState);
    allEvents = allEvents.concat(timelineToEvents(r.timeline, d));
  }
  if (!allEvents.length) { alert("Nothing to export."); return; }
  downloadICS("weekplan.ics", buildICS(allEvents));
}
function _exportMonth() {
  let allEvents = [];
  const md = getMonthDate();
  const year = md.getFullYear(), month = md.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayForPlan = new Date(); todayForPlan.setHours(0, 0, 0, 0);
  const weekPlan = buildWeek(state, todayForPlan.getDay());
  const weekDates = Array.from({length: 7}, (_, i) => {
    const d = new Date(todayForPlan); d.setDate(d.getDate() + i); return getLocalYMD(d);
  });
  for (let d = 1; d <= daysInMonth; d++) {
    const curDate = new Date(year, month, d);
    const dateStr = getLocalYMD(curDate);
    const filteredState = getFilteredState(state, dateStr);
    filteredState.tasks = [];
    const r = buildSchedule(filteredState);
    const weekIdx = weekDates.indexOf(dateStr);
    if (weekIdx !== -1) weekPlan.days[weekIdx].placed.forEach(t => r.timeline.push(t));
    allEvents = allEvents.concat(timelineToEvents(r.timeline, curDate));
  }
  if (!allEvents.length) { alert("Nothing to export for this month."); return; }
  downloadICS("monthplan.ics", buildICS(allEvents));
}
function _copyDayText() {
  const txt = $("exportTxt")?.value;
  if (!txt) { alert("Plan your day first to generate text."); return; }
  navigator.clipboard?.writeText(txt).then(() => alert("Copied!"))
    .catch(() => { $("exportTxt")?.select(); document.execCommand("copy"); });
}
if ($("exportCalBtn")) $("exportCalBtn").onclick = _exportDay;
$("reset").onclick=async()=>{state=structuredClone(DEFAULT);renderInputs(state);await save();renderPlan(state);};
$("addItem").onclick=()=>{shop.items.push({name:"",qty:1,price:0,cat:"food",got:false});renderShopRows();updateShop();saveShop();};
$("resetShop").onclick=async()=>{resetShop();renderShopRows();renderTaxToggle();updateShop();await saveShop();};

$("addIncome").onclick=()=>{finance.income.push({label:"",amount:0});renderIncome();updateFinance();saveFin();};
$("addCard").onclick=()=>{finance.cards.push({name:"",limit:100000});renderCards();renderExpenses();updateFinance();saveFin();};
$("addExpense").onclick=()=>{finance.expenses.push({label:"",amount:0,cat:"variable",paidBy:"cash"});renderExpenses();updateFinance();saveFin();};
$("snapReceipt").onclick=()=>openReceipt(true);
$("manualReceipt").onclick=()=>openReceipt(false);
$("rmAddRow").onclick=()=>{draft.items.push({name:"",qty:1,price:0,cat:"food"});renderDraft();};
$("rmConfirm").onclick=confirmReceipt;
$("rmCancel").onclick=closeReceipt;

/* ---------- theme toggle ---------- */
const MOON_SVG=`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
const SUN_SVG=`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
function applyTheme(dark){
  if(dark) document.documentElement.setAttribute("data-theme","dark");
  else document.documentElement.removeAttribute("data-theme");
  localStorage.setItem("theme",dark?"dark":"light");
  const btn=$("themeToggle"); if(btn) btn.innerHTML=dark?SUN_SVG:MOON_SVG;
}
$("themeToggle").onclick=(e)=>{
  const isDark=document.documentElement.getAttribute("data-theme")==="dark";
  if(!document.startViewTransition||matchMedia("(prefers-reduced-motion: reduce)").matches){
    applyTheme(!isDark); return;
  }
  const{left,top,width,height}=e.currentTarget.getBoundingClientRect();
  const x=left+width/2, y=top+height/2;
  const radius=Math.hypot(Math.max(x,innerWidth-x),Math.max(y,innerHeight-y));
  const vt=document.startViewTransition(()=>applyTheme(!isDark));
  vt.ready.then(()=>{
    document.documentElement.animate(
      {clipPath:[`circle(0px at ${x}px ${y}px)`,`circle(${radius}px at ${x}px ${y}px)`]},
      {duration:380,easing:"ease-in-out",pseudoElement:"::view-transition-new(root)"}
    );
  });
};
// init theme
{
  const stored=localStorage.getItem("theme");
  applyTheme(stored==="dark"||(stored===null&&matchMedia("(prefers-color-scheme: dark)").matches));
}

/* ---------- avatar dropdown ---------- */
$("userAvatar").onclick=()=>{
  $("dropdownContent").classList.toggle("show");
};
document.addEventListener("click",e=>{
  if(!e.target.closest("#userMenu")) $("dropdownContent").classList.remove("show");
});

/* ---------- import / export ---------- */
$("exportBtn").onclick=()=>{
  const data = {
    state,
    shop,
    finance,
    kitchen
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {type: "application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `dailyplanner-export-${getLocalYMD(new Date())}.json`;
  a.click();
  URL.revokeObjectURL(url);
  $("dropdownContent").classList.remove("show");
};

$("importBtn").onclick=()=>{
  $("importFile").click();
  $("dropdownContent").classList.remove("show");
};
$("importFile").onchange=async (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    // merge imported sections onto known defaults so a malformed/hostile file
    // can't drop required fields or inject unexpected top-level shapes
    const obj = v => v && typeof v === "object" && !Array.isArray(v);
    if(obj(data.state))   state = { ...structuredClone(DEFAULT), ...data.state };
    if(obj(data.shop))    setShopData(data.shop);
    if(obj(data.finance)) setFinData(data.finance);
    if(obj(data.kitchen)) setKitchenData(data.kitchen);
    
    // save to storage
    await save(); await saveShop(); await saveFin(); await saveKitchen();
    
    // refresh UI
    setCurrency(getCurrency());
    if (typeof renderCurrencyMenu === "function") renderCurrencyMenu();
    renderInputs(state); renderGoals(state); renderPlan(state);
    renderShopRows(); renderTaxToggle(); updateShop();
    renderFinInputs(); updateFinance();
    renderKitchen(state);
    if(document.querySelector(".tab[data-tab='week']").getAttribute("aria-selected")==="true") renderWeek(state);
    
    alert("Data imported successfully!");
  } catch(err) {
    alert("Failed to import data: " + err.message);
  }
  e.target.value = "";
};

$("planWeek").onclick=renderWeek;
$("addGoal").onclick=()=>{(state.goals||(state.goals=[])).push({name:"",hoursPerWeek:2});renderGoals(state);save();renderWeek(state);};
$("timetableBtn").onclick=()=>$("timetableCam").click();

function addPantryItem(){
  const v=$("pantryInput").value.trim();if(!v)return;
  const q=Number($("pantryQty").value)||1;
  const u=$("pantryUnit").value.trim();
  const existing = kitchen.pantry.find(p=>p.name.toLowerCase()===v.toLowerCase());
  if (existing) {
    existing.qty += q;
    if (u) existing.unit = u;
  } else {
    kitchen.pantry.push({name: v, qty: q, unit: u});
  }
  $("pantryInput").value="";
  if($("pantryQty")) $("pantryQty").value="";
  if($("pantryUnit")) $("pantryUnit").value="";
  renderPantry();renderNeeds(state);saveKitchen();
  updateAiPrompt();
}
$("addPantry").onclick=addPantryItem;
$("pantryInput").addEventListener("keydown",e=>{if(e.key==="Enter")addPantryItem();});
$("suggestWeek").onclick=()=>{ planSuggestedWeek(state); renderKitchen(state); saveKitchen(); };
$("clearMeals").onclick=()=>{ clearMealPlan(); renderKitchen(state); saveKitchen(); };
$("genShop").onclick=()=>{ if(generateShoppingList()) setTab("shopping"); };

$("addCustomMealBtn").onclick=()=>addCustomMeal(state);
$("customMealIngredients").addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();addCustomMeal(state);}});
$("customMealUrl").addEventListener("keydown",e=>{if(e.key==="Enter")addCustomMeal(state);});
/* ---------- auth UI ---------- */
function updateUserUI(user) {
  const avatar = $("userAvatar");
  const btn = $("signOutBtn");
  if (user) {
    if (user.photoURL) {
      // build via DOM (not innerHTML) and run the URL through safeUrl() so a hostile
      // photoURL can't break out of the src attribute or use a javascript:/data: scheme
      const img = document.createElement("img");
      img.src = safeUrl(user.photoURL);
      img.alt = "User";
      avatar.replaceChildren(img);
    } else {
      avatar.textContent = (user.displayName || user.email || "U").charAt(0).toUpperCase();
    }
    avatar.title = user.displayName || user.email || "User";
    btn.textContent = t("menu.signOut");
    btn.setAttribute("data-i18n", "menu.signOut");
    btn.classList.add("signout-btn");
  } else {
    avatar.textContent = "G";
    avatar.title = "Guest";
    btn.textContent = t("menu.signIn");
    btn.setAttribute("data-i18n", "menu.signIn");
    btn.classList.remove("signout-btn");
  }
}

$("signOutBtn").onclick = async () => {
  if (useCloud) {
    // User is logged in, so sign out
    stopAllListeners();
    await fbSignOut();
    currentUser = null;
    useCloud = false;
    updateUserUI(null);
    await bootApp(); // Reload app state from local storage
  } else {
    // User is guest, so sign in
    try {
      await signInWithGoogle();
    } catch (err) {
      if (err.code !== "auth/popup-closed-by-user") {
        alert(err.message || "Google sign-in failed.");
      }
    }
  }
  $("dropdownContent").classList.remove("show");
};

/* ---------- custom ui ---------- */
let activeCustomEl = null;
let activeTimeCol = "h";   // which time column the keyboard is driving ("h" | "m")

/* close both popups, reset the control's aria state, optionally return focus to it */
function closeCustomMenus(refocus){
  $("customSelectMenu").hidden = true;
  $("customTimePicker").hidden = true;
  $("customDatePicker").hidden = true;
  if(activeCustomEl){
    activeCustomEl.setAttribute("aria-expanded","false");
    if(refocus) activeCustomEl.focus();
  }
}

/* commit a chosen select option to the active control (shared by mouse + keyboard) */
function chooseSelectOption(opt){
  if(!activeCustomEl || !opt) return;
  const val = opt.dataset.v, lbl = opt.textContent;
  activeCustomEl.querySelector(".cs-head").textContent = lbl;
  const f = activeCustomEl.dataset.f || "option";
  activeCustomEl.setAttribute("aria-label", f.replace(/([A-Z])/g," $1").toLowerCase()+": "+lbl);
  const hidden = activeCustomEl.querySelector("input[type=hidden]");
  hidden.value = val;
  closeCustomMenus(true);
  hidden.dispatchEvent(new Event("input", {bubbles: true}));
}

window.openSelect = function(el) {
  activeCustomEl = el;
  const menu = $("customSelectMenu");
  const list = menu.querySelector(".c-sel-list");
  list.innerHTML = el.querySelector(".cs-opts").innerHTML;
  // mark the current value so keyboard nav starts there
  const cur = el.querySelector("input[type=hidden]").value;
  list.querySelectorAll(".cs-opt").forEach(o => o.classList.toggle("kbd", o.dataset.v === cur));

  const rect = el.getBoundingClientRect();
  menu.style.top = (rect.bottom + window.scrollY + 4) + "px";
  menu.style.left = (rect.left + window.scrollX) + "px";
  menu.style.width = rect.width + "px";
  menu.hidden = false;
  el.setAttribute("aria-expanded","true");
};

window.openTime = function(el) {
  activeCustomEl = el;
  activeTimeCol = "h";
  const hidden = el.querySelector("input[type=hidden]");
  const val = hidden.value || "00:00";
  const [hh, mm] = val.split(":");

  const hCol = $("timeHourCol");
  const mCol = $("timeMinCol");
  const sp = '<div class="t-spacer"></div>';   // lets 00 and 23/59 reach the centre band
  hCol.innerHTML = sp + Array.from({length:24}, (_,i) => {
    const v=String(i).padStart(2,'0'); return `<div class="t-opt${v===hh?' on':''}" data-v="${v}">${v}</div>`;
  }).join("") + sp;
  mCol.innerHTML = sp + Array.from({length:60}, (_,i) => {
    const v=String(i).padStart(2,'0'); return `<div class="t-opt${v===mm?' on':''}" data-v="${v}">${v}</div>`;
  }).join("") + sp;

  // anchor the popup to the field (below it, or above if it would overflow the viewport)
  const pop = $("customTimePicker");
  pop.hidden = false;                       // unhide first so offsetHeight is measurable
  const rect = el.getBoundingClientRect();
  const popH = pop.offsetHeight;
  let top = rect.bottom + 4;
  if (top + popH > window.innerHeight && rect.top - popH - 4 > 0) top = rect.top - popH - 4;
  pop.style.top = (top + window.scrollY) + "px";
  pop.style.left = (rect.left + window.scrollX) + "px";
  pop.style.width = Math.max(rect.width, 200) + "px";
  el.setAttribute("aria-expanded","true");

  setTimeout(() => {
    const actH = hCol.querySelector(".on");
    const actM = mCol.querySelector(".on");
    if(actH) hCol.scrollTop = actH.offsetTop - hCol.clientHeight/2 + actH.clientHeight/2;
    if(actM) mCol.scrollTop = actM.offsetTop - mCol.clientHeight/2 + actM.clientHeight/2;
  }, 10);
};

$("timeCancelBtn").onclick = () => closeCustomMenus(true);

$("timeSaveBtn").onclick = () => {
  if(!activeCustomEl) { closeCustomMenus(); return; }
  const hCol = $("timeHourCol");
  const mCol = $("timeMinCol");
  const actH = hCol.querySelector(".on") || hCol.querySelector(".t-opt");
  const actM = mCol.querySelector(".on") || mCol.querySelector(".t-opt");

  if(!actH || !actM) { closeCustomMenus(true); return; }
  const val = actH.dataset.v + ":" + actM.dataset.v;
  activeCustomEl.querySelector(".ct-head").textContent = val;
  activeCustomEl.setAttribute("aria-label", "time " + val);
  const hidden = activeCustomEl.querySelector("input[type=hidden]");
  hidden.value = val;
  closeCustomMenus(true);

  hidden.dispatchEvent(new Event("input", {bubbles: true}));
};

document.addEventListener("click", e => {
  // open a custom control on click (replaces the old inline onclick handlers, for CSP)
  const selTrigger = e.target.closest(".c-sel");
  if(selTrigger && $("customSelectMenu").hidden){ openSelect(selTrigger); return; }
  const timeTrigger = e.target.closest(".c-time");
  if(timeTrigger && $("customTimePicker").hidden){ openTime(timeTrigger); return; }
  const dateTrigger = e.target.closest(".c-date");
  if(dateTrigger && $("customDatePicker").hidden){ openDate(dateTrigger); return; }

  // Custom Select Global Click
  if(e.target.classList.contains("cs-opt")) {
    if(!activeCustomEl) return;
    chooseSelectOption(e.target);
    return;
  }
  if(!e.target.closest("#customSelectMenu") && !e.target.closest(".c-sel")) {
    if(!$("customSelectMenu").hidden){ $("customSelectMenu").hidden = true; activeCustomEl && activeCustomEl.setAttribute("aria-expanded","false"); }
  }
  // close the time popup when clicking outside it (and not on a time field)
  if(!e.target.closest("#customTimePicker") && !e.target.closest(".c-time")) {
    if(!$("customTimePicker").hidden){ $("customTimePicker").hidden = true; activeCustomEl && activeCustomEl.setAttribute("aria-expanded","false"); }
  }
  // close the date popup when clicking outside it (and not on a date field)
  if(!e.target.closest("#customDatePicker") && !e.target.closest(".c-date")) {
    if(!$("customDatePicker").hidden){ $("customDatePicker").hidden = true; activeCustomEl && activeCustomEl.setAttribute("aria-expanded","false"); }
  }

  // Custom Time global click
  if(e.target.classList.contains("t-opt")) {
    const col = e.target.parentElement;
    Array.from(col.children).forEach(c => c.classList.remove("on"));
    e.target.classList.add("on");
    col.scrollTo({ top: e.target.offsetTop - col.clientHeight/2 + e.target.clientHeight/2, behavior: 'smooth' });
  }
});

/* ---------- keyboard support for the custom controls ---------- */
document.addEventListener("keydown", e => {
  const selOpen = !$("customSelectMenu").hidden;
  const timeOpen = !$("customTimePicker").hidden;
  const dateOpen = !$("customDatePicker").hidden;

  // nothing open: Enter/Space on a focused control opens it
  if(!selOpen && !timeOpen && !dateOpen){
    const el = e.target;
    if(el.classList && (el.classList.contains("c-sel") || el.classList.contains("c-time") || el.classList.contains("c-date")) && (e.key==="Enter" || e.key===" ")){
      e.preventDefault();
      if(el.classList.contains("c-sel")) openSelect(el);
      else if(el.classList.contains("c-time")) openTime(el);
      else openDate(el);
    }
    return;
  }

  // date picker open: Escape closes
  if(dateOpen){
    if(e.key==="Escape"){ e.preventDefault(); closeCustomMenus(true); }
    return;
  }

  // select menu open: arrows move, Enter chooses, Esc closes
  if(selOpen){
    const opts = [...$("customSelectMenu").querySelectorAll(".cs-opt")];
    if(!opts.length) return;
    let idx = opts.findIndex(o => o.classList.contains("kbd"));
    if(e.key==="ArrowDown" || e.key==="ArrowUp"){
      e.preventDefault();
      idx = idx<0 ? (e.key==="ArrowDown"?0:opts.length-1)
                  : (e.key==="ArrowDown" ? Math.min(opts.length-1, idx+1) : Math.max(0, idx-1));
      opts.forEach(o => o.classList.remove("kbd"));
      opts[idx].classList.add("kbd");
      opts[idx].scrollIntoView({block:"nearest"});
    } else if(e.key==="Enter"){
      e.preventDefault();
      chooseSelectOption(opts[idx>=0?idx:0]);
    } else if(e.key==="Escape"){
      e.preventDefault();
      closeCustomMenus(true);
    }
    return;
  }

  // time popup open: arrows adjust (L/R switch column), Enter sets, Esc cancels
  if(timeOpen){
    if(e.key==="Escape"){ e.preventDefault(); closeCustomMenus(true); return; }
    if(e.key==="Enter"){ e.preventDefault(); $("timeSaveBtn").click(); return; }
    if(e.key==="ArrowLeft" || e.key==="ArrowRight"){ e.preventDefault(); activeTimeCol = e.key==="ArrowLeft"?"h":"m"; return; }
    if(e.key==="ArrowUp" || e.key==="ArrowDown"){
      e.preventDefault();
      const col = $(activeTimeCol==="h" ? "timeHourCol" : "timeMinCol");
      const opts = [...col.querySelectorAll(".t-opt")];
      let idx = opts.findIndex(o => o.classList.contains("on"));
      if(idx<0) idx = 0;
      idx = e.key==="ArrowDown" ? Math.min(opts.length-1, idx+1) : Math.max(0, idx-1);
      opts.forEach(o => o.classList.remove("on"));
      opts[idx].classList.add("on");
      col.scrollTop = opts[idx].offsetTop - col.clientHeight/2 + opts[idx].clientHeight/2;
    }
    return;
  }
});

/* ---------- i18n language switcher ---------- */
function reRenderAll(){
  renderInputs(state); renderGoals(state); renderPlan(state);
  renderShopRows(); renderTaxToggle(); updateShop();
  renderFinInputs(); updateFinance();
  renderKitchen(state);
  if(document.querySelector(".tab[data-tab='week']")?.getAttribute("aria-selected")==="true") renderWeek(state);
  applyLanguage();
}

function renderLangMenu(){
  const cur = getLang();
  $("langDropdown").innerHTML = availableLanguages().map(l=>
    `<button class="dropdown-btn lang-opt${l.code===cur?" active":""}" type="button" data-lang="${l.code}" role="menuitemradio" aria-checked="${l.code===cur}">${esc(l.label)}</button>`
  ).join("");
}
const CURRENCIES = [
  { code: "¥", label: "¥" },
  { code: "$", label: "$" },
  { code: "€", label: "€" },
  { code: "£", label: "£" },
  { code: "₹", label: "₹" },
  { code: "Rp", label: "Rp" },
  { code: "₫", label: "₫" }
];

function renderCurrencyMenu() {
  const cur = state.currency || "¥";
  $("currencyToggle").textContent = cur;
  $("currencyDropdown").innerHTML = CURRENCIES.map(c =>
    `<button class="dropdown-btn lang-opt${c.code===cur?" active":""}" type="button" data-currency="${c.code}" role="menuitemradio" aria-checked="${c.code===cur}">${esc(c.label)}</button>`
  ).join("");
}

function initCurrencySelect() {
  const toggle = $("currencyToggle");
  if (!toggle) return;
  renderCurrencyMenu();
  toggle.onclick = e => {
    e.stopPropagation();
    const open = $("currencyDropdown").classList.toggle("show");
    toggle.setAttribute("aria-expanded", String(open));
  };
  // pick a currency
  $("currencyDropdown").addEventListener("click", e => {
    const btn = e.target.closest("[data-currency]");
    if (!btn) return;
    state.currency = btn.dataset.currency;
    storeSetState({ currency: state.currency });
    setCurrency(state.currency);
    save();
    renderCurrencyMenu();
    $("currencyDropdown").classList.remove("show");
    toggle.setAttribute("aria-expanded", "false");
    applyLanguage();
    reRenderAll();
  });
  // click-outside closes
  document.addEventListener("click", e => {
    if (!e.target.closest("#currencyMenu")) {
      $("currencyDropdown").classList.remove("show");
      toggle.setAttribute("aria-expanded", "false");
    }
  });
}

function initLangSelect(){
  const toggle = $("langToggle");
  if(!toggle) return;
  renderLangMenu();
  toggle.onclick = e => {
    e.stopPropagation();
    const open = $("langDropdown").classList.toggle("show");
    toggle.setAttribute("aria-expanded", String(open));
  };
  // pick a language
  $("langDropdown").addEventListener("click", e => {
    const btn = e.target.closest("[data-lang]");
    if(!btn) return;
    setLang(btn.dataset.lang);
    renderLangMenu();
    $("langDropdown").classList.remove("show");
    toggle.setAttribute("aria-expanded","false");
    applyLanguage();
    reRenderAll();
    updateUserUI(currentUser);
  });
  // click-outside closes
  document.addEventListener("click", e => {
    if(!e.target.closest("#langMenu")){
      $("langDropdown").classList.remove("show");
      toggle.setAttribute("aria-expanded","false");
    }
  });
}

/* ---------- custom date picker ---------- */
let dpCurrentMonth = new Date();
dpCurrentMonth.setDate(1);

window.openDate = function(el) {
  activeCustomEl = el;
  const hidden = el.querySelector("input[type=hidden]");
  const val = hidden.value;
  if (val) {
    const [y, m] = val.split('-');
    dpCurrentMonth = new Date(parseInt(y,10), parseInt(m,10)-1, 1);
  } else {
    const now = new Date();
    dpCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  }
  renderDpGrid();
  const pop = $("customDatePicker");
  pop.hidden = false;
  const rect = el.getBoundingClientRect();
  const popH = pop.offsetHeight;
  let top = rect.bottom + 4;
  if (top + popH > window.innerHeight - 8 && rect.top - popH - 4 > 0) top = rect.top - popH - 4;
  let left = rect.left + window.scrollX;
  if (left + pop.offsetWidth > window.innerWidth - 8) left = window.innerWidth - pop.offsetWidth - 8;
  if (left < 8) left = 8;
  pop.style.top = (top + window.scrollY) + "px";
  pop.style.left = left + "px";
  el.setAttribute("aria-expanded", "true");
};

function renderDpGrid() {
  const hidden = activeCustomEl ? activeCustomEl.querySelector("input[type=hidden]") : null;
  const selectedVal = hidden ? hidden.value : "";
  const year = dpCurrentMonth.getFullYear();
  const month = dpCurrentMonth.getMonth();
  const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  $("dpTitle").textContent = `${monthNames[month]} ${year}`;
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevDays = new Date(year, month, 0).getDate();
  const todayStr = getLocalYMD(new Date());
  const grid = $("dpGrid");
  grid.innerHTML = "";
  for (let i = 0; i < 42; i++) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "dp-day";
    let day, dateStr;
    if (i < firstDow) {
      day = prevDays - firstDow + i + 1;
      dateStr = getLocalYMD(new Date(year, month-1, day));
      btn.classList.add("other-month");
    } else if (i >= firstDow + daysInMonth) {
      day = i - firstDow - daysInMonth + 1;
      dateStr = getLocalYMD(new Date(year, month+1, day));
      btn.classList.add("other-month");
    } else {
      day = i - firstDow + 1;
      dateStr = getLocalYMD(new Date(year, month, day));
    }
    btn.textContent = day;
    btn.dataset.date = dateStr;
    if (dateStr === todayStr) btn.classList.add("today");
    if (dateStr === selectedVal) btn.classList.add("selected");
    btn.onclick = (ev) => { ev.stopPropagation(); chooseDateOption(dateStr); };
    grid.appendChild(btn);
  }
}

function chooseDateOption(dateStr) {
  if (!activeCustomEl) { closeCustomMenus(); return; }
  const hidden = activeCustomEl.querySelector("input[type=hidden]");
  hidden.value = dateStr;
  activeCustomEl.querySelector(".cd-head").textContent = formatDateDisplay(dateStr);
  activeCustomEl.classList.remove("empty");
  activeCustomEl.setAttribute("aria-label", "date " + dateStr);
  closeCustomMenus(true);
  hidden.dispatchEvent(new Event("input", { bubbles: true }));
}

$("dpPrevMonth").onclick = (e) => { e.stopPropagation(); dpCurrentMonth.setMonth(dpCurrentMonth.getMonth()-1); renderDpGrid(); };
$("dpNextMonth").onclick = (e) => { e.stopPropagation(); dpCurrentMonth.setMonth(dpCurrentMonth.getMonth()+1); renderDpGrid(); };
$("dpTodayBtn").onclick = (e) => { e.stopPropagation(); chooseDateOption(getLocalYMD(new Date())); };
$("dpClearBtn").onclick = (e) => {
  e.stopPropagation();
  if (!activeCustomEl) { closeCustomMenus(); return; }
  const hidden = activeCustomEl.querySelector("input[type=hidden]");
  hidden.value = "";
  activeCustomEl.querySelector(".cd-head").textContent = "No date";
  activeCustomEl.classList.add("empty");
  activeCustomEl.setAttribute("aria-label", "date none");
  closeCustomMenus(true);
  hidden.dispatchEvent(new Event("input", { bubbles: true }));
};

/* ---------- month calendar — see ui-month.js and month.js ---------- */

function _doRenderMonth() {
  renderMonth(state, dateStr => {
    setPlanDate(dateStr);
    setTab("schedule");
    renderPlan(state);
  });
  updateNavLabel("month");
}

/* ---------- boot ---------- */
async function bootApp() {

  // Load data and render
  await load(); await loadShop(); await loadFin(); await loadKitchen();
  if (!Array.isArray(state.goals)) state.goals = [];    // migrate state saved before goals existed
  if (!Array.isArray(kitchen.aiRecipes)) kitchen.aiRecipes = [];   // migrate pre-AI meal plans
  if (!state.notes) state.notes = {};
  if (!state.pinnedNotes) state.pinnedNotes = [];
  if (!Array.isArray(state.habits)) state.habits = [];
  setCurrency(getCurrency());
  if (typeof renderCurrencyMenu === "function") renderCurrencyMenu();
  setPlanDate(getLocalYMD(new Date()));
  renderInputs(state); renderGoals(state); renderPlan(state); _doRenderMonth();
  renderShopRows(); renderTaxToggle(); updateShop(); saveShop();
  renderFinInputs(); updateFinance(); saveFin();
  renderKitchen(state); saveKitchen();
  initMonth({
    onDayClick: dateStr => { setPlanDate(dateStr); setTab("schedule"); renderPlan(state); },
    onConfirm:  evt     => { state.fixed.push(evt); renderFixed(state); save(); _doRenderMonth(); },
    renderMonth: _doRenderMonth,
  });
  initNotes(state, save, setTab);
  initHabits(state, save);
  initPomo();
  updatePomoDisplay();

  /* ---- unified date nav bar ---- */
  if ($("navPrev")) {
    $("navPrev").onclick = () => {
      if (_activeTab === "schedule") {
        const d = getViewDate(); d.setDate(d.getDate() - 1);
        setPlanDate(getLocalYMD(d)); renderPlan(state);
      } else if (_activeTab === "week") {
        const d = getViewDate(); d.setDate(d.getDate() - 7);
        setViewDate(d); renderWeek(state);
      } else if (_activeTab === "month") {
        navigateMonth(-1); _doRenderMonth();
      }
      updateNavLabel(_activeTab);
    };
  }
  if ($("navNext")) {
    $("navNext").onclick = () => {
      if (_activeTab === "schedule") {
        const d = getViewDate(); d.setDate(d.getDate() + 1);
        setPlanDate(getLocalYMD(d)); renderPlan(state);
      } else if (_activeTab === "week") {
        const d = getViewDate(); d.setDate(d.getDate() + 7);
        setViewDate(d); renderWeek(state);
      } else if (_activeTab === "month") {
        navigateMonth(1); _doRenderMonth();
      }
      updateNavLabel(_activeTab);
    };
  }
  const _navExportDrop = $("navExportDropdown");
  if ($("navExportBtn") && _navExportDrop) {
    $("navExportBtn").onclick = e => {
      e.stopPropagation();
      const open = _navExportDrop.classList.toggle("show");
      $("navExportBtn").setAttribute("aria-expanded", String(open));
    };
    document.addEventListener("click", e => {
      if (!e.target.closest("#navExportMenu")) {
        _navExportDrop.classList.remove("show");
        $("navExportBtn").setAttribute("aria-expanded", "false");
      }
    });
  }
  if ($("navExportDay"))   $("navExportDay").onclick   = _exportDay;
  if ($("navExportWeek"))  $("navExportWeek").onclick  = _exportWeek;
  if ($("navExportMonth")) $("navExportMonth").onclick = _exportMonth;
  if ($("navExportText"))  $("navExportText").onclick  = _copyDayText;
  updateNavLabel("schedule");
  const _nb = $("dateNavBar"); if (_nb) _nb.hidden = false;
  updateNotifBtn();
  staggerCards(document.getElementById("panel-schedule"));
  wireLabels();
  installLabelObserver();
  applyLanguage();
}

/* Re-render functions replace container innerHTML, dropping the for/id wiring on
   new rows. One observer on the app root re-wires any subtree that gets added, so
   no render site needs to know about a11y. Installed once; observes childList only
   (setting id/for triggers attribute mutations, not childList — no feedback loop). */
let _labelObserverInstalled = false;
function installLabelObserver() {
  if (_labelObserverInstalled) return;
  const root = document.getElementById("appWrap") || document.body;
  if (!root) return;
  _labelObserverInstalled = true;
  new MutationObserver(records => {
    if (records.some(r => r.addedNodes.length)) wireLabels(root);
  }).observe(root, { childList: true, subtree: true });
}

(async () => {
  // Snap the tab indicator into position once the label animation has settled (420ms)
  setTimeout(() => animateTabIndicator(document.querySelector(".tab[aria-selected='true']")), 420);

  // Always unhide the app immediately
  const wrap = document.getElementById("appWrap");
  if (wrap) {
    wrap.hidden = false;
    wrap.classList.add("fade-in");
  }

  // Apply language to static chrome before any data renders
  initCurrencySelect();
  initLangSelect();
  applyLanguage();

  if (isFirebaseConfigured()) {
    try {
      await initAuth();
      const app = getApp();
      await initSync(app);

      onAuthStateChanged(async (user) => {
        try {
          if (user) {
            currentUser = user;
            useCloud = true;
            setConnection(user, true);
            updateUserUI(user);

            // One-time migration from localStorage
            await migrateLocalStorage(user.uid);

            // Boot the app with cloud data
            await bootApp();
          } else {
            currentUser = null;
            useCloud = false;
            setConnection(null, false);
            updateUserUI(null);
            await bootApp();
          }
        } catch(e) {
          console.error("Auth state handling failed:", e);
          alert("Error loading user data: " + e.message);
        }
      });
    } catch (err) {
      console.error("Firebase init failed:", err);
      alert("Firebase initialization failed. Check your config.");
      await bootApp();
    }
  } else {
    // No Firebase: use localStorage only
    await bootApp();
  }
})();
