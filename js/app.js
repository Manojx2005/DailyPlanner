"use strict";
/* ---------- app controller ----------
   Owns state, persistence, DOM rendering, and event wiring.
   Pure logic lives in ./schedule.js and ./shopping.js.
   Auth via ./auth.js, cloud sync via ./sync.js. */

import { getLang, setLang, t, applyLanguage, availableLanguages, setCurrency } from "./i18n.js?v=1.7";
import { fmtDur, toHHMM, buildSchedule, asText, toMin } from "./schedule.js?v=1.6";
import { yen, calcShopping, shopText, displayAmount, fromDisplay } from "./shopping.js?v=1.6";
import { computeFinance, financeVerdict, financeText } from "./finance.js?v=1.6";
import { buildWeek, DOW } from "./week.js?v=1.7";
import { RECIPES, neededIngredients, toShopItem, suggestWeek, coerceRecipe } from "./meals.js?v=1.6";
import { recipeNutrition, planNutrition, fmtKcal, fmtMacros } from "./nutrition.js?v=1.6";
import { buildICS, timelineToEvents, downloadICS } from "./calendar.js?v=1.6";
import { staggerCards } from "./fx.js?v=1.6";
import { initAuth, isConfigured as isFirebaseConfigured, signInWithGoogle, signInWithEmail,
         signUpWithEmail, resetPassword, signOut as fbSignOut, onAuthStateChanged, getApp } from "./auth.js?v=1.6";
import { initSync, saveToCloud, loadFromCloud, listenToCloud, stopAllListeners, migrateLocalStorage } from "./sync.js?v=1.6";

/* ---------- formatting utils ---------- */
function getLocalYMD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getLocalDow(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return new Date(y, m - 1, d).getDay();
}

/* ---------- state + persistence ---------- */
const DEFAULT={
  currency:"¥",
  wake:"07:00",sleep:"23:30",
  fixed:[{label:"Class",start:"09:00",end:"10:30",days:[1,3,5]},{label:"Part-time job",start:"17:00",end:"21:00",days:[2,4,6]}],
  meals:[{label:"Breakfast",time:"07:30",dur:25},{label:"Lunch",time:"12:30",dur:40},{label:"Dinner",time:"21:15",dur:40}],
  tasks:[
    {label:"JLPT study",dur:60,category:"study",priority:"high",deadlineDays:3},
    {label:"Coding project",dur:90,category:"project",priority:"med",deadlineDays:7},
    {label:"Chore",dur:30,category:"chore",priority:"low",deadlineDays:1},
  ],
  goals:[
    {name:"JLPT N2",hoursPerWeek:5},
    {name:"Internship prep (DSA)",hoursPerWeek:3},
  ],
  notes:{},
  pinnedNotes:[],
  habits:[],
};
let state=structuredClone(DEFAULT);
export function getCurrency() { return state.currency || "¥"; }
const KEY="dayplanner:v1";

let currentUser = null; // Firebase user object
let useCloud = false;   // true when Firebase is configured and user is logged in

/* Persistence: cloud-first (Firestore), localStorage fallback.
   When Firebase is configured and user is signed in, all data syncs to Firestore.
   Otherwise, falls back to localStorage. */
const localStore={
  set(k,v){ try{localStorage.setItem(k,v);return true;}catch(e){return false;} },
  get(k){ try{return localStorage.getItem(k);}catch(e){return null;} },
};
const statusText=ok=>ok?t("status.synced"):t("status.savedLocally");

async function save(){
  const data={wake:state.wake,sleep:state.sleep,fixed:state.fixed,meals:state.meals,tasks:state.tasks,goals:state.goals,notes:state.notes||{},pinnedNotes:state.pinnedNotes||[],habits:state.habits||[]};
  if(useCloud&&currentUser){
    const ok=await saveToCloud(currentUser.uid,"planner",data);
    $("savedNote").textContent=statusText(ok);
  }else{
    const ok=localStore.set(KEY,JSON.stringify(state));
    $("savedNote").textContent=ok?t("status.saved"):t("status.notSaved");
  }
}
async function load(){
  if(useCloud&&currentUser){
    const cloud=await loadFromCloud(currentUser.uid,"planner");
    if(cloud){
      state={...structuredClone(DEFAULT),...cloud};
    }
  }else{
    const v=localStore.get(KEY);
    if(v){try{state={...structuredClone(DEFAULT), ...JSON.parse(v)};}catch(e){}}
  }
}

/* ---------- rendering inputs ---------- */
const $=id=>document.getElementById(id);

function cSel(k, i, f, options, val, scope, arr) {
  const lbl = options.find(o => o.v === val)?.l || val || "";
  const name = String(f||"option").replace(/([A-Z])/g," $1").toLowerCase();
  const optsHtml = options.map(o => `<div class="cs-opt" role="option" data-v="${esc(o.v)}">${esc(o.l)}</div>`).join("");
  return `<div class="c-sel" role="button" tabindex="0" aria-haspopup="listbox" aria-expanded="false" aria-label="${esc(name)}: ${esc(lbl)}" data-k="${k||''}" data-scope="${scope||''}" data-arr="${arr||''}" data-i="${i}" data-f="${f}" data-val="${esc(val)}">
    <div class="cs-head">${esc(lbl)}</div>
    <div class="cs-opts" hidden>${optsHtml}</div>
    <input type="hidden" data-k="${k||''}" data-scope="${scope||''}" data-arr="${arr||''}" data-i="${i}" data-f="${f}" value="${esc(val)}">
  </div>`;
}

function cTime(k, i, f, val, scope) {
  return `<div class="c-time" role="button" tabindex="0" aria-haspopup="dialog" aria-expanded="false" aria-label="time ${val || "00:00"}" data-k="${k||''}" data-scope="${scope||''}" data-i="${i||''}" data-f="${f||''}">
    <div class="ct-head">${val || "00:00"}</div>
    <input type="hidden" data-k="${k||''}" data-scope="${scope||''}" data-i="${i||''}" data-f="${f||''}" id="${!i && !k ? f : ''}" value="${val || "00:00"}">
  </div>`;
}

function formatDateDisplay(dateStr) {
  if (!dateStr) return "No date";
  const [y, m, d] = dateStr.split('-');
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[parseInt(m,10)-1]} ${parseInt(d,10)}, ${y}`;
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
}

function cDate(k, i, f, val) {
  const display = val ? formatDateDisplay(val) : "No date";
  const empty = val ? "" : " empty";
  return `<div class="c-date${empty}" role="button" tabindex="0" aria-haspopup="dialog" aria-expanded="false" aria-label="date ${val || "none"}" data-k="${k||''}" data-i="${i||''}" data-f="${f||''}">
    <div class="cd-head">${display}</div>
    <input type="hidden" data-k="${k||''}" data-i="${i||''}" data-f="${f||''}" value="${val || ""}">
  </div>`;
}

const DOW_SHORT=["S","M","T","W","T","F","S"];
function dowPicker(scope,i,days){
  return `<div class="dowpick">${DOW_SHORT.map((d,idx)=>
    `<button type="button" class="dow${(days||[]).includes(idx)?" on":""}" data-dowscope="${scope}" data-dowtoggle="${i}" data-dow="${idx}" aria-pressed="${(days||[]).includes(idx)}" aria-label="${DOW[idx]}">${d}</button>`).join("")}</div>`;
}
function renderFixed(){
  $("fixedRows").innerHTML=state.fixed.map((f,i)=>`
    <div class="row fixed" style="display:flex; flex-direction:column; gap:8px;">
      <div style="display:grid; grid-template-columns:1fr auto auto auto; gap:8px; width:100%; align-items:end;">
        <div><label class="f">What</label><input data-k="fixed" data-i="${i}" data-f="label" value="${esc(f.label)}" placeholder="e.g. Algorithms class"></div>
        <div><label class="f">Start</label>${cTime("fixed", i, "start", f.start)}</div>
        <div><label class="f">End</label>${cTime("fixed", i, "end", f.end)}</div>
        <div class="x"><button class="iconbtn" data-del="fixed" data-i="${i}" title="Remove" aria-label="Remove">×</button></div>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; width:100%; flex-wrap:wrap; gap:10px;">
        ${dowPicker("fixed",i,f.days)}
        <div style="display:flex; align-items:center; gap:8px;">
          <div style="display:flex; flex-direction:column;">
            <label class="f" style="margin-bottom:2px">Specific Date</label>
            ${cDate("fixed", i, "date", f.date||"")}
          </div>
          <div style="display:flex; flex-direction:column;">
            <label class="f" style="margin-bottom:2px">Replaces Meal</label>
            ${cSel("fixed", i, "skipMeal", [{v:"", l:"(None)"}].concat((state.meals||[]).map(m=>({v:m.label, l:m.label}))), f.skipMeal||"")}
          </div>
        </div>
      </div>
    </div>`).join("");
}
function renderMeals(){
  $("mealRows").innerHTML=state.meals.map((m,i)=>`
    <div class="row meal" style="display:flex; flex-direction:column; gap:8px;">
      <div style="display:grid; grid-template-columns:1fr auto auto auto; gap:8px; width:100%; align-items:end;">
        <div><label class="f">Meal</label><input data-k="meals" data-i="${i}" data-f="label" value="${esc(m.label)}"></div>
        <div><label class="f">Time</label>${cTime("meals", i, "time", m.time)}</div>
        <div><label class="f">Min</label><input type="number" min="5" step="5" data-k="meals" data-i="${i}" data-f="dur" value="${m.dur}" style="width:74px"></div>
        <div class="x"><button class="iconbtn" data-del="meals" data-i="${i}" title="Remove" aria-label="Remove">×</button></div>
      </div>
      <div style="width:100%; display:flex; gap:10px; align-items:center;">
        <label style="font-size:12px; color:var(--text-secondary); font-weight:500;">Cook days:</label>
        ${dowPicker("meals",i,m.days)}
      </div>
    </div>`).join("");
}
function renderTasks(){
  $("taskRows").innerHTML=state.tasks.map((tk,i)=>`
    <div class="row task" draggable="true" data-task-idx="${i}">
      <div class="drag-handle" data-task-drag="${i}" aria-label="Drag to reorder" title="Drag to reorder">⠿</div>
      <div class="full"><label class="f">Task</label><input draggable="false" data-k="tasks" data-i="${i}" data-f="label" value="${esc(tk.label)}" placeholder="e.g. OS assignment"></div>
      <div><label class="f">Minutes</label><input type="number" min="5" step="5" draggable="false" data-k="tasks" data-i="${i}" data-f="dur" value="${tk.dur}"></div>
      <div><label class="f">Type</label>
        ${cSel("tasks", i, "category", [{v:"study",l:t("opt.study")},{v:"project",l:t("opt.project")},{v:"chore",l:t("opt.chore")}], tk.category)}</div>
      <div><label class="f">Priority</label>
        ${cSel("tasks", i, "priority", [{v:"high",l:t("opt.high")},{v:"med",l:t("opt.medium")},{v:"low",l:t("opt.low")}], tk.priority)}</div>
      <div><label class="f">Due in (days)</label><input type="number" min="0" step="1" draggable="false" data-k="tasks" data-i="${i}" data-f="deadlineDays" value="${tk.deadlineDays}"></div>
      <div class="full"><button class="iconbtn" data-del="tasks" data-i="${i}" title="Remove task" aria-label="Remove task" style="width:100%">× Remove task</button></div>
    </div>`).join("");
}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
/* only allow http(s) links — blocks javascript:/data: schemes from imported recipe URLs */
function safeUrl(u){const s=String(u||"").trim();return /^https?:\/\//i.test(s)?s:"";}

/* a11y: caption labels (<label class="f">Foo</label><input ...>) are rendered as
   siblings with no for/id link, so the input has no accessible name. Walk every
   .f label whose immediate next sibling is a native, non-hidden control and wire
   them up with a generated id. Custom controls (.c-sel/.c-time) and column-header
   labels are skipped because their next sibling isn't a native input. */
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
function renderInputs(){
  $("wake").value=state.wake;
  $("wake").previousElementSibling.textContent=state.wake;
  $("sleep").value=state.sleep;
  $("sleep").previousElementSibling.textContent=state.sleep;
  renderFixed();renderMeals();renderTasks();
}

function getFilteredState(dateStr) {
  const dow = getLocalDow(dateStr);
  const skips = new Set();
  const filteredFixed = (state.fixed||[]).filter(f => {
    if(f.date) {
      if(f.date !== dateStr) return false;
    } else {
      if(f.days && f.days.length && !f.days.includes(dow)) return false;
    }
    if(f.skipMeal) skips.add(f.skipMeal);
    return true;
  });
  const filteredMeals = (state.meals||[]).filter(m => !skips.has(m.label));
  return { ...state, fixed: filteredFixed, meals: filteredMeals };
}

/* ---------- output ---------- */
function renderPlan(){
  const dateStr = $("planDate")?.value || getLocalYMD(new Date());
  const filteredState = getFilteredState(dateStr);
  const r=buildSchedule(filteredState);
  // day-window sanity: wind-down must be after wake (overnight windows aren't supported)
  if(toMin(state.sleep)<=toMin(state.wake))
    r.warnings.unshift(`Wind-down (${state.sleep}) isn't after wake (${state.wake}) — set a later wind-down to get a real day.`);
  $("roFree").textContent=fmtDur(r.summary.totalFree);
  $("roSub").textContent=r.summary.fits?"everything fits":fmtDur(r.summary.deficit)+" won't fit";
  $("sFree").textContent=fmtDur(r.summary.totalFree);
  $("sReq").textContent=fmtDur(r.summary.requested);
  $("sSched").textContent=fmtDur(r.summary.scheduled);

  const v=$("verdict");
  if(r.summary.fits){
    const mu=r.summary.mostUrgent;
    v.className="verdict ok";v.innerHTML=`<span class="tag">✓</span><span>${t("verdict.fits")}${mu?`. ${t("verdict.soonest")} <b>${esc(mu.label)}</b> (${mu.days===0?t("verdict.today"):mu.days+"d"})`:""}.  </span>`;
  }else{
    v.className="verdict over";v.innerHTML=`<span class="tag">!</span><span>${t("verdict.overBy")} <b>${fmtDur(r.summary.deficit)}</b> ${t("verdict.trimHint")}</span>`;
  }

  // timeline
  const tl=$("timeline");
  if(!r.timeline.length){tl.innerHTML=`<div class="empty">${t("day.noDay")}</div>`;}
  else{
    const PX=1.05,top=r.wake,bottom=r.sleep,H=(bottom-top)*PX;
    let html=`<div class="tl" style="height:${H}px">`;
    for(let h=Math.ceil(top/60)*60;h<=bottom;h+=60){const y=(h-top)*PX;html+=`<div class="hour" style="top:${y}px">${toHHMM(h)}</div><div class="gridline" style="top:${y}px"></div>`;}
    for(const b of r.timeline){
      const y=(b.start-top)*PX,hgt=Math.max(22,(b.end-b.start)*PX-3);
      // two stacked text lines need ~38px; below that, switch to a one-line layout
      // (title left, time right) so short blocks don't clip/overlap their text
      const compact=hgt<38;
      const cls=(b.type==="task"?b.category:b.type)+(compact?" compact":"");
      const part=b.parts>1?` <span style="opacity:.8">(${b.part}/${b.parts})</span>`:"";
      html+=`<div class="blk ${cls}" style="top:${y}px;height:${hgt}px">
        <div class="nm">${esc(b.label)}${part}</div>
        <div class="t">${toHHMM(b.start)}–${toHHMM(b.end)} · ${fmtDur(b.end-b.start)}</div></div>`;
    }
    html+=`</div>`;tl.innerHTML=html;
  }

  // deferred tray
  const tray=$("tray");
  if(r.deferred.length){
    tray.innerHTML=`<div class="tray"><h3>${t("tray.didntFit")}</h3><ul>${r.deferred.map(d=>`<li>${esc(d.label)} — <b>${fmtDur(d.minutes)}</b> <span style="opacity:.8">(${d.reason})</span></li>`).join("")}</ul></div>`;
  }else tray.innerHTML="";

  const w=$("warns");
  w.innerHTML=r.warnings.length?`<div class="warns">⚠ ${r.warnings.map(esc).join("<br>⚠ ")}</div>`:"";

  // plain-text export (same shape the skill produces)
  $("exportWrap").style.display="block";
  $("exportTxt").value=asText(r);
}

/* ---------- shopping state + persistence ---------- */
const DEFAULT_SHOP={taxMode:"excl",items:[
  {name:"Basmati rice 1kg",qty:1,price:600,cat:"food",got:false},
  {name:"Chicken thigh",qty:1,price:400,cat:"food",got:false},
  {name:"Miso paste",qty:1,price:350,cat:"food",got:false},
  {name:"Tofu",qty:2,price:80,cat:"food",got:false},
  {name:"Olive oil",qty:1,price:700,cat:"food",got:false},
  {name:"Dish soap",qty:1,price:250,cat:"other",got:false},
]};
let shop=structuredClone(DEFAULT_SHOP);
const SKEY="shoppinglist:v1";
async function saveShop(){
  if(useCloud&&currentUser){
    const ok=await saveToCloud(currentUser.uid,"shopping",shop);
    $("savedShop").textContent=statusText(ok);
  }else{
    const ok=localStore.set(SKEY,JSON.stringify(shop));
    $("savedShop").textContent=ok?t("status.saved"):t("status.notSaved");
  }
}
async function loadShop(){
  if(useCloud&&currentUser){
    const cloud=await loadFromCloud(currentUser.uid,"shopping");
    if(cloud) shop={...structuredClone(DEFAULT_SHOP),...cloud};
  }else{
    const v=localStore.get(SKEY);if(v){try{shop=JSON.parse(v);}catch(e){}}
  }
}

function renderShopRows(){
  $("shopRows").innerHTML=shop.items.map((it,i)=>`
    <div class="row shop${it.got?" got":""}">
      <input type="checkbox" class="chk" data-scope="shop" data-i="${i}" data-f="got"${it.got?" checked":""} aria-label="Mark as in basket">
      <input class="nm-in" data-scope="shop" data-i="${i}" data-f="name" value="${esc(it.name)}" placeholder="e.g. Basmati rice" aria-label="Item name">
      <div style="display:flex; gap:4px; align-items:center;">
        ${it.got ? `<button class="iconbtn" style="color:var(--green); font-size:14px;" data-stockshop="${i}" title="Stock Pantry" aria-label="Stock Pantry">📥</button>` : ''}
        <button class="iconbtn" data-delshop="${i}" title="Remove" aria-label="Remove item">×</button>
      </div>
      <div class="sub3">
        <div><label class="f">Qty</label><input type="number" min="1" step="1" data-scope="shop" data-i="${i}" data-f="qty" value="${it.qty}"></div>
      <div><label class="f">Unit ${getCurrency()}</label><input type="number" min="0" step="any" data-scope="shop" data-i="${i}" data-f="price" value="${displayAmount(it.price)}"></div>
        <div><label class="f">Type</label>${cSel(null, i, "cat", [{v:"food",l:t("shop.cat.food")},{v:"other",l:t("shop.cat.other")}], it.cat, "shop")}</div>
      </div>
    </div>`).join("");
}
function renderTaxToggle(){document.querySelectorAll("#taxToggle button").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.mode===shop.taxMode)));}
function updateShop(){
  const c=calcShopping(shop);
  $("mSub").textContent=yen(c.subtotal);
  $("mCount").textContent=c.count;
  $("mTax8").textContent=yen(c.tax8);
  $("mTax10").textContent=yen(c.tax10);
  $("mTotal").textContent=yen(c.total);
  $("mLeft").textContent=yen(c.left);
  $("roTotal").textContent=yen(c.total);
  $("roLeft").textContent=`${c.count} item${c.count===1?"":"s"} · ${yen(c.left)} left`;
  $("shopTxt").value=shopText(shop,c);
}
function onShopField(e){
  const t=e.target,i=+t.dataset.i,f=t.dataset.f;
  if(f==="got"){shop.items[i].got=t.checked;const row=t.closest(".row");if(row)row.classList.toggle("got",t.checked);}
  else shop.items[i][f]=f==="price"?fromDisplay(t.value):t.value;
  updateShop();saveShop();
}

/* ---------- finance state + persistence ---------- */
const DEFAULT_FIN={
  initialBalance:120000,
  income:[{label:"Part-time job",amount:90000},{label:"Allowance",amount:30000}],
  cards:[{name:"Rakuten Card",limit:200000}],
  expenses:[
    {label:"Rent",amount:55000,cat:"fixed",paidBy:"cash"},
    {label:"Phone",amount:3000,cat:"fixed",paidBy:"Rakuten Card"},
    {label:"Transport",amount:8000,cat:"variable",paidBy:"cash"},
  ],
  receipts:[],
};
let finance=structuredClone(DEFAULT_FIN);
const FKEY="finance:v1";
async function saveFin(){
  if(useCloud&&currentUser){
    const ok=await saveToCloud(currentUser.uid,"finance",finance);
    $("savedFin").textContent=statusText(ok);
  }else{
    const ok=localStore.set(FKEY,JSON.stringify(finance));
    $("savedFin").textContent=ok?t("status.saved"):t("status.notSaved");
  }
}
async function loadFin(){
  if(useCloud&&currentUser){
    const cloud=await loadFromCloud(currentUser.uid,"finance");
    if(cloud) finance={...structuredClone(DEFAULT_FIN),...cloud};
  }else{
    const v=localStore.get(FKEY);if(v){try{finance=JSON.parse(v);}catch(e){}}
  }
}

/* payer options for the custom select: cash + every named card */
function payerOptionsArr(){
  const arr = [{v:"cash", l:t("fin.payer.cash")}];
  finance.cards.forEach(c=>{ if(c.name) arr.push({v:c.name, l:c.name}); });
  return arr;
}

function renderIncome(){
  $("incomeRows").innerHTML=finance.income.map((it,i)=>`
    <div class="row fin">
      <div><label class="f">Source</label><input data-scope="fin" data-arr="income" data-i="${i}" data-f="label" value="${esc(it.label)}" placeholder="e.g. Scholarship"></div>
      <div><label class="f">${getCurrency()} / month</label><input class="amt-in" type="number" min="0" step="any" data-scope="fin" data-arr="income" data-i="${i}" data-f="amount" value="${displayAmount(it.amount)}"></div>
      <div class="x"><button class="iconbtn" data-delfin="income" data-i="${i}" title="Remove" aria-label="Remove">×</button></div>
    </div>`).join("");
}
function renderCards(){
  $("cardRows").innerHTML=finance.cards.map((c,i)=>`
    <div class="row fin">
      <div><label class="f">Card name</label><input data-scope="fin" data-arr="cards" data-i="${i}" data-f="name" value="${esc(c.name)}" placeholder="e.g. SMBC"></div>
      <div><label class="f">Limit ${getCurrency()}</label><input class="amt-in" type="number" min="0" step="any" data-scope="fin" data-arr="cards" data-i="${i}" data-f="limit" value="${displayAmount(c.limit)}"></div>
      <div class="x"><button class="iconbtn" data-delfin="cards" data-i="${i}" title="Remove" aria-label="Remove">×</button></div>
    </div>`).join("");
}
function renderExpenses(){
  $("expRows").innerHTML=finance.expenses.map((e,i)=>`
    <div class="row fin exp">
      <div><label class="f">What</label><input data-scope="fin" data-arr="expenses" data-i="${i}" data-f="label" value="${esc(e.label)}" placeholder="e.g. Gym"></div>
      <div><label class="f">${getCurrency()}</label><input class="amt-in" type="number" min="0" step="any" data-scope="fin" data-arr="expenses" data-i="${i}" data-f="amount" value="${displayAmount(e.amount)}"></div>
      <div><label class="f">Type</label>${cSel(null, i, "cat", [{v:"fixed",l:t("fin.cat.fixed")},{v:"variable",l:t("fin.cat.variable")}], e.cat, "fin", "expenses")}</div>
      <div><label class="f">Paid with</label>${cSel(null, i, "paidBy", payerOptionsArr(), e.paidBy, "fin", "expenses")}</div>
      <div class="x"><button class="iconbtn" data-delfin="expenses" data-i="${i}" title="Remove" aria-label="Remove">×</button></div>
    </div>`).join("");
}
function renderReceipts(){
  const el=$("receiptRows");
  if(!finance.receipts.length){el.innerHTML=`<div class="empty" style="padding:14px">${t("fin.noReceipts")}</div>`;return;}
  el.innerHTML=finance.receipts.map((r,i)=>`
    <div class="receipt-item">
      <div><div>${esc(r.store||"(store)")}</div><div class="meta">${r.date} · via ${esc(r.paidBy)} · ${(r.items||[]).length} items</div></div>
      <div style="display:flex;align-items:center;gap:10px"><b>${yen(r.total)}</b>
        <button class="iconbtn" data-delfin="receipts" data-i="${i}" title="Remove" aria-label="Remove">×</button></div>
    </div>`).join("");
}
function renderFinInputs(){$("finInitial").value=displayAmount(finance.initialBalance);renderIncome();renderCards();renderExpenses();renderReceipts();}

function updateFinance(){
  const s=computeFinance(finance), vd=financeVerdict(s);
  // hide cards the user hasn't named yet so they don't show as ghost "(card)" rows
  s.cards=(s.cards||[]).filter(c=>c.name&&c.name.trim());
  $("hNet").textContent=yen(s.net);
  $("hMsg").textContent=vd.msg;
  $("finHero").className="hero "+vd.cls;
  $("fIncome").textContent=yen(s.income);
  $("fSpend").textContent=yen(s.totalSpend);
  $("fCash").textContent=yen(s.cashOnHand);
  $("roNet").textContent=yen(s.net);
  $("roRate").textContent=s.income>0?Math.round(s.savingsRate*100)+"% saved":"add income";
  // card bars
  const cb=$("cardBars");
  if(!s.cards.length){cb.innerHTML=`<div class="empty">${t("fin.noCards")}</div>`;}
  else cb.innerHTML=s.cards.map(c=>{
    const pct=Math.min(100,Math.round(c.util*100));
    const lvl=c.util>=0.9?"bad":c.util>=0.5?"warn":"";
    return `<div class="cardbar"><div class="top"><span>${esc(c.name||"(card)")}</span><b>${yen(c.spend)} / ${yen(c.limit)}</b></div>
      <div class="track" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(c.name||"card")} ${pct}% used"><div class="fill ${lvl}" style="width:${pct}%"></div></div></div>`;
  }).join("");
  $("finTxt").value=financeText(finance,s,yen);
}
function onFinField(e){
  const t=e.target,arr=t.dataset.arr,i=+t.dataset.i,f=t.dataset.f;
  finance[arr][i][f]=(f==="amount"||f==="limit")?fromDisplay(t.value):t.value;
  if(arr==="cards"&&f==="name")renderExpenses();   // payer dropdowns reference card names
  updateFinance();saveFin();
}

/* ---------- receipt scanner (camera + manual confirm, zero-dependency) ---------- */
let draft=null;   // {store, paidBy, photoURL, items:[{name,qty,price,cat}]}
function openReceipt(withPhoto){
  draft={store:"",paidBy:"cash",photoURL:null,items:[{name:"",qty:1,price:0,cat:"food"}]};
  $("rmStore").value="";
  $("rmPaidWrap").innerHTML=cSel(null,null,"paidBy",payerOptionsArr(),"cash","draftpaid");
  const shot=$("rmShot");shot.classList.remove("has");shot.removeAttribute("src");
  renderDraft();
  $("receiptModal").hidden=false;
  if(withPhoto)$("receiptCam").click();
}
function closeReceipt(){
  if(draft&&draft.photoURL)URL.revokeObjectURL(draft.photoURL);  // free the blob
  draft=null;$("receiptModal").hidden=true;
}
function renderDraft(){
  $("rmRows").innerHTML=draft.items.map((it,i)=>`
    <div class="draftrow">
      <input data-scope="draft" data-i="${i}" data-f="name" value="${esc(it.name)}" placeholder="鶏もも肉 / item">
      <input class="amt-in" type="number" min="1" step="1" data-scope="draft" data-i="${i}" data-f="qty" value="${it.qty}">
      <input class="amt-in" type="number" min="0" step="any" data-scope="draft" data-i="${i}" data-f="price" value="${displayAmount(it.price)}">
      ${cSel(null, i, "cat", [{v:"food",l:t("shop.cat.food")},{v:"other",l:t("shop.cat.other")}], it.cat, "draft")}
      <button class="iconbtn" data-deldraft="${i}" title="Remove" aria-label="Remove">×</button>
    </div>`).join("");
  $("rmTotal").textContent=yen(draftTotal());
}
function draftTotal(){return draft.items.reduce((a,it)=>a+(Number(it.qty)||0)*(Number(it.price)||0),0);}
function onDraftField(e){
  const t=e.target,i=+t.dataset.i,f=t.dataset.f;
  draft.items[i][f]=f==="price"?fromDisplay(t.value):t.value;
  $("rmTotal").textContent=yen(draftTotal());
}
function confirmReceipt(){
  const items=draft.items.filter(it=>it.name||Number(it.price)>0)
    .map(it=>({name:it.name,qty:Number(it.qty)||1,price:Number(it.price)||0,cat:it.cat}));
  const total=items.reduce((a,it)=>a+it.qty*it.price,0);
  if(!items.length){closeReceipt();return;}
  finance.receipts.push({date:getLocalYMD(new Date()),store:$("rmStore").value.trim(),
    paidBy:draft.paidBy,total,items});
  closeReceipt();renderReceipts();updateFinance();saveFin();
}

/* ---------- goals ---------- */
function renderGoals(){
  $("goalRows").innerHTML=(state.goals||[]).map((g,i)=>`
    <div class="row fin">
      <div><label class="f">Goal</label><input data-scope="goal" data-i="${i}" data-f="name" value="${esc(g.name)}" placeholder="e.g. JLPT N2, Thesis"></div>
      <div><label class="f">Hours / week</label><input class="amt-in" type="number" min="0" step="0.5" data-scope="goal" data-i="${i}" data-f="hoursPerWeek" value="${g.hoursPerWeek}" style="width:108px"></div>
      <div class="x"><button class="iconbtn" data-delgoal="${i}" title="Remove" aria-label="Remove">×</button></div>
    </div>`).join("")||'<div class="empty" style="padding:14px">No goals yet — add what you\'re working toward.</div>';
}
function onGoalField(e){
  const t=e.target,i=+t.dataset.i,f=t.dataset.f;
  state.goals[i][f]=t.value;save();renderWeek();
}

/* ---------- week view ---------- */
const MONTHS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function renderWeek(){
  const today=new Date(),r=buildWeek(state,today.getDay());
  $("wFree").textContent=fmtDur(r.summary.totalFree);
  $("wReq").textContent=fmtDur(r.summary.requested);
  $("wSched").textContent=fmtDur(r.summary.scheduled);
  $("roWeek").textContent=fmtDur(r.summary.totalFree);
  $("roWeekSub").textContent=r.summary.fits?"everything fits":fmtDur(r.summary.deficit)+" won't fit";

  const v=$("wVerdict");
  if(r.summary.fits)v.innerHTML=`<div class="verdict ok"><span class="tag">✓</span><span>The whole week fits.</span></div>`;
  else v.innerHTML=`<div class="verdict over"><span class="tag">!</span><span><b>${fmtDur(r.summary.deficit)}</b> of tasks won't fit this week — trim, extend days, or push deadlines.</span></div>`;

  const grid=$("weekGrid");
  grid.innerHTML=r.days.map((d,i)=>{
    const date=new Date(today);date.setDate(today.getDate()+i);
    const dateStr=`${MONTHS[date.getMonth()]} ${date.getDate()}`;
    const items=d.timeline.map(b=>{
      const cls=b.type==="task"?b.category:b.type;
      return `<div class="ditem ${b.type==="free"?"free":""}">
        <span class="dt">${toHHMM(b.start)}–${toHHMM(b.end)}</span>
        <span class="swatch sw-${cls}"></span>
        <span class="dn">${esc(b.label)}</span>
        <span class="dd">${fmtDur(b.end-b.start)}</span></div>`;
    }).join("")||`<div class="empty" style="padding:10px">${t("week.nothingSched")}</div>`;
    return `<div class="daycard ${i===0?"today":""}">
      <div class="dhead"><div class="dname">${d.name}${i===0?`<span class="badge">${t("week.today")}</span>`:""} <span style="color:var(--text-muted);font-weight:600;font-size:12px">${dateStr}</span></div>
      <div class="dfree">${fmtDur(d.free)} ${t("week.free")}</div></div>
      <div class="dlist">${items}</div></div>`;
  }).join("");

  const tray=$("wTray");
  tray.innerHTML=r.deferred.length
    ? `<div class="tray"><h3>${t("week.didntFit")}</h3><ul>${r.deferred.map(d=>`<li>${esc(d.label)} — <b>${fmtDur(d.minutes)}</b> <span style="opacity:.8">(${d.reason})</span></li>`).join("")}</ul></div>`
    : "";

  // goal progress — circular rings
  const gp=$("goalProgress");
  if(!r.goalProgress.length)gp.innerHTML=`<div class="empty">${t("week.goalEmpty")}</div>`;
  else gp.innerHTML=r.goalProgress.map(g=>{
    const ratio=g.target?g.scheduled/g.target:0;
    const pct=Math.min(100,Math.round(ratio*100));
    const circumference = 2 * Math.PI * 24; // r=24
    const offset = circumference * (1 - Math.min(1, ratio));
    const lvl=ratio>=1?"":ratio>=0.5?"warn":"bad";
    return `<div class="goal-ring" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(g.name)} ${pct}% of weekly goal">
      <svg viewBox="0 0 60 60" aria-hidden="true">
        <circle class="ring-bg" cx="30" cy="30" r="24"/>
        <circle class="ring-fill ${lvl}" cx="30" cy="30" r="24"
          stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"/>
      </svg>
      <div class="ring-info">
        <div class="rg-name">${esc(g.name)}</div>
        <div class="rg-stat">${fmtDur(g.scheduled)} / ${fmtDur(g.target)} (${pct}%)</div>
      </div>
    </div>`;
  }).join("");
}
async function onTimetablePhoto(e){
  const file=e.target.files&&e.target.files[0];e.target.value="";if(!file)return;
  const shot=$("timetableShot"),status=$("timetableStatus");
  if(shot.dataset.url)URL.revokeObjectURL(shot.dataset.url);
  const url=URL.createObjectURL(file);shot.src=url;shot.dataset.url=url;shot.classList.add("has");
  status.className="finehint";
  status.textContent="Added as reference. (AI auto-fill has been removed).";
}

/* ---------- meal planner state + persistence ---------- */
const DEFAULT_KITCHEN={
  pantry:[
    {name:"Short-grain rice", qty:1000, unit:"g"}, {name:"Soy sauce", qty:500, unit:"ml"},
    {name:"Mirin", qty:500, unit:"ml"}, {name:"Dashi", qty:100, unit:"g"},
    {name:"Sugar", qty:500, unit:"g"}, {name:"Salt", qty:500, unit:"g"},
    {name:"Cooking oil", qty:1000, unit:"ml"}, {name:"Flour", qty:1000, unit:"g"},
    {name:"Yeast", qty:50, unit:"g"}, {name:"Garam masala", qty:50, unit:"g"},
    {name:"Turmeric", qty:50, unit:"g"}, {name:"Garlic", qty:100, unit:"g"},
    {name:"Ginger", qty:100, unit:"g"}, {name:"Miso paste", qty:500, unit:"g"}
  ],
  plan:[],
  customRecipes:[],
  aiRecipes:[]
};
let kitchen=structuredClone(DEFAULT_KITCHEN);
const MKEY="mealplan:v1";
async function saveKitchen(){
  if(useCloud&&currentUser){
    const ok=await saveToCloud(currentUser.uid,"kitchen",kitchen);
    $("savedKitchen").textContent=statusText(ok);
  }else{
    const ok=localStore.set(MKEY,JSON.stringify(kitchen));
    $("savedKitchen").textContent=ok?t("status.saved"):t("status.notSaved");
  }
}
async function loadKitchen(){
  if(useCloud&&currentUser){
    const cloud=await loadFromCloud(currentUser.uid,"kitchen");
    if(cloud) kitchen={...structuredClone(DEFAULT_KITCHEN),...cloud};
  }else{
    const v=localStore.get(MKEY);if(v){try{kitchen=JSON.parse(v);}catch(e){}}
  }
  
  // Migration: String arrays to objects
  if (kitchen.pantry) {
    kitchen.pantry = kitchen.pantry.map(p => typeof p === "string" ? { name: p, qty: 1, unit: "unit" } : p);
  }
  if (kitchen.plan) {
    kitchen.plan = kitchen.plan.map(p => typeof p === "string" ? { recipeId: p, made: false } : p);
  }
}

const allRecipes=()=>RECIPES.concat(kitchen.customRecipes||kitchen.aiRecipes||[]);
const recipeById=id=>allRecipes().find(r=>r.id===id);
function renderPantry(){
  $("pantryChips").innerHTML=kitchen.pantry.map((p,i)=>{
    const text = typeof p === "string" ? p : `${p.name} (${p.qty} ${p.unit})`;
    return `<span class="chip">${esc(text)}<button data-delpantry="${i}" title="Remove" aria-label="Remove ${esc(text)}">×</button></span>`;
  }).join("")
    ||`<span class="hint" style="margin:0">${t("meals.pantryEmpty")}</span>`;
}
function renderRecipeList(){
  $("recipeList").innerHTML=allRecipes().map(r=>{
    const picked=kitchen.plan.some(p => p.recipeId === r.id);
    return `<div class="recipe ${picked?"picked":""}">
      <div class="rinfo"><div class="rn">${r.ai?"✨ ":""}${esc(r.name)} <span class="kcal-badge">${fmtKcal(recipeNutrition(r,1).kcal)}</span></div>
        <div class="rm">${r.cuisine?esc(r.cuisine)+" · ":""}${t("meals.serves")} ${r.serves} · ${r.ingredients.length} ingredients · ${fmtMacros(recipeNutrition(r,1))}</div>
        <div style="display:flex; gap:12px; margin-top:4px;">
          <button class="rm" style="background:none; border:none; padding:0; color:var(--blue); cursor:pointer; font-weight:600; font-family:var(--sans);" data-viewrecipe="${esc(r.id)}">${t("meals.viewSteps")}</button>
          ${safeUrl(r.url) ? `<a href="${esc(safeUrl(r.url))}" target="_blank" rel="noopener noreferrer" class="rm" style="color:var(--text-muted); text-decoration:none; display:inline-block;">${t("meals.origLink")}</a>` : ""}
        </div>
      </div>
      <button class="radd" data-recipe="${esc(r.id)}">${picked?t("meals.addedLabel"):t("meals.addLabel")}</button></div>`;
  }).join("");
}
function addCustomMeal(){
  const name=$("customMealName").value.trim();
  const ings=$("customMealIngredients").value.trim();
  const inst=$("customMealInstructions").value.trim();
  const url=$("customMealUrl").value.trim();
  if(!name || !ings) {
    alert("Please provide a meal name and ingredients.");
    return;
  }
  const items = ings.split(/[\n,]+/).map(s=>s.trim()).filter(Boolean);
  const instructions = inst ? inst.split('\n').map(s=>s.trim()).filter(Boolean) : [];
  const newId = "custom_"+Date.now();
  const recipe = {
    id: newId,
    name,
    serves: 2,
    ingredients: items,
    instructions,
    url
  };
  kitchen.customRecipes=(kitchen.customRecipes||[]).concat([recipe]);
  $("customMealName").value="";
  $("customMealIngredients").value="";
  $("customMealInstructions").value="";
  $("customMealUrl").value="";
  renderKitchen();saveKitchen();
}
function renderMealPlan(){
  const el=$("planList");
  if(!kitchen.plan.length){el.innerHTML=`<div class="empty" style="padding:16px">${t("meals.noMeals")}</div>`;return;}
  const rows=kitchen.plan.map((p,i)=>{const r=recipeById(p.recipeId);if(!r)return"";
    return `<div class="recipe picked ${p.made?'made':''}"><div class="rinfo"><div class="rn">${esc(r.name)} <span class="kcal-badge">${fmtKcal(recipeNutrition(r,1).kcal)}</span></div>
      <div class="rm">${esc(r.cuisine)} · ${t("meals.serves")} ${r.serves}</div>
      <div style="display:flex; gap:8px; align-items:center; margin-top:4px;">
        <button class="rm" style="background:none; border:none; padding:0; color:var(--blue); cursor:pointer; font-weight:600; font-family:var(--sans);" data-viewrecipe="${esc(r.id)}">${t("meals.viewSteps")}</button>
        ${!p.made ? `<button class="btn ghost" style="padding:4px 8px; font-size:11px;" data-mademeal="${i}">Made it!</button>` : `<span style="font-size:11px; color:var(--green);">✓ Made</span>`}
      </div>
      </div>
      <button class="iconbtn" data-delmeal="${i}" title="Remove" aria-label="Remove ${esc(r.name)}">×</button></div>`;
  }).join("");
  // one-serving-per-meal nutrition total for the picked plan
  const tot=planNutrition(kitchen.plan.filter(p=>!p.made).map(p=>recipeById(p.recipeId)).filter(Boolean));
  el.innerHTML=rows+`<div class="nutri-total"><span><b>${fmtKcal(tot.kcal)}</b> total</span><span>${fmtMacros(tot)}</span></div>`;
}
function currentNeeds(){return neededIngredients(kitchen.plan.filter(p=>!p.made).map(p=>recipeById(p.recipeId)).filter(Boolean),kitchen.pantry);}
function renderNeeds(){
  const needs=currentNeeds(),el=$("needList");
  $("roMeals").textContent=needs.length;

  let targetPortions = 0;
  const today = new Date();
  for(let i=0;i<7;i++){
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const dateStr = getLocalYMD(d);
    const dow = d.getDay();
    const skips = new Set();
    (state.fixed||[]).forEach(f => {
      if(f.date) {
        if(f.date === dateStr && f.skipMeal) skips.add(f.skipMeal);
      } else {
        if((!f.days || !f.days.length || f.days.includes(dow)) && f.skipMeal) skips.add(f.skipMeal);
      }
    });
    targetPortions += (state.meals || []).filter(m => !skips.has(m.label)).length;
  }
  let plannedPortions = kitchen.plan.filter(p=>!p.made).reduce((sum, p) => {
    const r = recipeById(p.recipeId);
    return sum + (r ? (r.serves || 1) : 0);
  }, 0);

  $("roMealsSub").textContent=kitchen.plan.length ? `${kitchen.plan.length} meals (${plannedPortions}/${targetPortions} portions)` : `target: ${targetPortions} portions`;
  
  if(!kitchen.plan.length){el.innerHTML=`<div class="empty" style="padding:16px">${t("meals.noMealsPicked")}</div>`;return;}
  if(!needs.length){el.innerHTML=`<div class="empty" style="padding:16px">${t("meals.pantryCovers")}</div>`;return;}
  el.innerHTML=needs.map(n=>{const amt=n.qty&&n.unit?`${esc(String(n.qty))}${esc(n.unit)}`:n.qty>1?`×${esc(String(n.qty))}`:"";
    return `<div class="needrow"><span>${esc(n.name)} <span style="color:var(--text-muted)">${amt}</span></span><b>${yen(n.price)}</b></div>`;
  }).join("");
}
function updateAiPrompt() {
  const el = $("aiPromptText");
  if (!el) return;
  const pantryLines = kitchen.pantry.map(p => `  - ${p.qty} ${p.unit} ${p.name}`).join("\n");
  const base = `I need a JSON array of 5 recipes for my meal planner app.\nOutput ONLY valid JSON.\nEach recipe must match this schema exactly:\n{\n  "name": "Recipe Name",\n  "cuisine": "Cuisine Type",\n  "serves": 2,\n  "instructions": [ "Step 1", "Step 2" ],\n  "ingredients": [\n    { "name": "Ingredient 1", "qty": 1, "unit": "cup" }\n  ]\n}\nDo not use markdown blocks, just raw JSON.`;
  const pantryContext = kitchen.pantry.length ? `\n\nI currently have these ingredients in my pantry:\n${pantryLines}\n\nPlease prioritize recipes that heavily utilize these ingredients so nothing goes to waste!` : "";
  el.value = base + pantryContext;
}
function renderKitchen(){renderPantry();renderRecipeList();renderMealPlan();renderNeeds();updateAiPrompt();}
function generateShoppingList(){
  const needs=currentNeeds();if(!needs.length)return;
  const have=new Set(shop.items.map(it=>String(it.name).toLowerCase()));
  let added=0;
  for(const n of needs){const item=toShopItem(n);if(have.has(item.name.toLowerCase()))continue;shop.items.push(item);added++;}
  renderShopRows();updateShop();saveShop();
  $("savedKitchen").textContent=added?`added ${added} item${added===1?"":"s"} to Shopping`:"all already on your list";
  setTab("shopping");
}

/* ---------- notes ---------- */
let noteDate=getLocalYMD(new Date());
function renderNotes(){
  if(!state.notes)state.notes={};
  if(!state.pinnedNotes)state.pinnedNotes=[];
  const ed=$("noteEditor"); if(ed) ed.value=state.notes[noteDate]||"";
  const disp=$("noteDateDisplay");
  if(disp) disp.textContent=noteDate===getLocalYMD(new Date())?"Today":formatDateDisplay(noteDate);
  renderPinnedNotes();
}
function renderPinnedNotes(){
  const el=$("pinnedNotesList");if(!el)return;
  const pinned=(state.pinnedNotes||[]).map(d=>({date:d,text:state.notes[d]||""})).filter(n=>n.text);
  if(!pinned.length){el.innerHTML=`<div class="empty">No pinned notes yet.</div>`;return;}
  el.innerHTML=pinned.map(n=>`
    <div class="note-pin-item" data-pinneddate="${esc(n.date)}">
      <div class="note-pin-body">${esc(n.text)}</div>
      <span class="note-pin-date">${formatDateDisplay(n.date)}</span>
      <button class="note-pin-del" data-delpinned="${esc(n.date)}" aria-label="Unpin">×</button>
    </div>`).join("");
}
if($("noteEditor")){
  $("noteEditor").addEventListener("input",e=>{
    if(!state.notes)state.notes={};
    state.notes[noteDate]=e.target.value;
    const sn=$("savedNotepad");if(sn)sn.textContent="Saved";
    clearTimeout(noteDate._saveTimer);
    noteDate._saveTimer=setTimeout(()=>save(),800);
  });
}
if($("pinNoteBtn")){
  $("pinNoteBtn").onclick=()=>{
    if(!state.pinnedNotes)state.pinnedNotes=[];
    if(!state.notes[noteDate]){return;}
    if(!state.pinnedNotes.includes(noteDate))state.pinnedNotes.unshift(noteDate);
    renderPinnedNotes();save();
  };
}
if($("notePrevDay")){
  $("notePrevDay").onclick=()=>{
    const d=new Date(noteDate+"T00:00:00");d.setDate(d.getDate()-1);
    noteDate=getLocalYMD(d);renderNotes();
  };
}
if($("noteNextDay")){
  $("noteNextDay").onclick=()=>{
    const d=new Date(noteDate+"T00:00:00");d.setDate(d.getDate()+1);
    noteDate=getLocalYMD(d);renderNotes();
  };
}
document.addEventListener("click",e=>{
  if(e.target.dataset.delpinned!==undefined){
    state.pinnedNotes=(state.pinnedNotes||[]).filter(d=>d!==e.target.dataset.delpinned);
    renderPinnedNotes();save();return;
  }
  const pin=e.target.closest(".note-pin-item[data-pinneddate]");
  if(pin&&!e.target.dataset.delpinned){noteDate=pin.dataset.pinneddate;renderNotes();setTab("notes");}
});

/* ---------- habits ---------- */
function calcStreak(doneOn){
  if(!doneOn||!doneOn.length)return 0;
  const sorted=[...doneOn].sort().reverse();
  let streak=0;const d=new Date();
  for(let i=0;i<100;i++){
    const s=getLocalYMD(d);
    if(sorted.includes(s)){streak++;d.setDate(d.getDate()-1);}
    else if(i===0){d.setDate(d.getDate()-1);}
    else break;
  }
  return streak;
}
function renderHabits(){
  if(!state.habits)state.habits=[];
  const el=$("habitRows");if(!el)return;
  const today=getLocalYMD(new Date());
  el.innerHTML=state.habits.length?state.habits.map((h,i)=>{
    const done=(h.doneOn||[]).includes(today);
    const streak=calcStreak(h.doneOn||[]);
    return `<div class="habit-row">
      <div class="habit-check${done?" done":""}" data-habit-toggle="${i}" role="checkbox" aria-checked="${done}" tabindex="0" aria-label="${esc(h.name)}">${done?"✓":""}</div>
      <div class="habit-name">${esc(h.name)}</div>
      <div class="habit-streak">${streak>0?"🔥 "+streak+"d":"—"}</div>
      <button class="iconbtn" data-del-habit="${i}" aria-label="Remove ${esc(h.name)}">×</button>
    </div>`;
  }).join(""):`<div class="empty">No habits yet. Add your first one below.</div>`;
  renderHabitHeatmap();
}
function renderHabitHeatmap(){
  const el=$("habitHeatmap");if(!el)return;
  if(!(state.habits||[]).length){el.innerHTML="";return;}
  const days=30;const today=new Date();
  el.innerHTML=state.habits.map(h=>{
    const dots=Array.from({length:days},(_,i)=>{
      const d=new Date(today);d.setDate(d.getDate()-(days-1-i));
      const s=getLocalYMD(d);
      return `<div class="habit-dot${(h.doneOn||[]).includes(s)?" done":""}" title="${s}"></div>`;
    }).join("");
    return `<div style="margin-bottom:14px"><div style="font-size:12px;font-weight:700;color:var(--text-muted);margin-bottom:4px;">${esc(h.name)}</div><div class="habit-heatmap">${dots}</div></div>`;
  }).join("");
}
document.addEventListener("click",e=>{
  if(e.target.dataset.habitToggle!==undefined){
    const i=+e.target.dataset.habitToggle;
    if(!state.habits[i])return;
    if(!state.habits[i].doneOn)state.habits[i].doneOn=[];
    const today=getLocalYMD(new Date());
    const idx=state.habits[i].doneOn.indexOf(today);
    if(idx===-1)state.habits[i].doneOn.push(today);
    else state.habits[i].doneOn.splice(idx,1);
    if(navigator.vibrate)navigator.vibrate(8);
    renderHabits();save();return;
  }
  if(e.target.dataset.delHabit!==undefined){
    state.habits.splice(+e.target.dataset.delHabit,1);
    renderHabits();save();return;
  }
});
if($("addHabitBtn")){
  $("addHabitBtn").onclick=()=>{
    const inp=$("habitInput");if(!inp||!inp.value.trim())return;
    if(!state.habits)state.habits=[];
    state.habits.push({name:inp.value.trim(),doneOn:[]});
    inp.value="";renderHabits();save();
  };
}

/* ---------- pomodoro ---------- */
const POMO_FOCUS=25*60, POMO_BREAK=5*60;
let _pomo={phase:"focus",remaining:POMO_FOCUS,sessions:0,timer:null,total:POMO_FOCUS};
function updatePomoDisplay(){
  const disp=$("pomoDisplay");if(!disp)return;
  const m=Math.floor(_pomo.remaining/60),s=_pomo.remaining%60;
  disp.textContent=`${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  disp.className="pomo-display"+(_pomo.timer?(_pomo.phase==="break"?" break":" running"):"");
  const lbl=$("pomoLabel");if(lbl)lbl.textContent=_pomo.phase==="break"?"Break ☕":"Focus";
  const cnt=$("pomoCount");if(cnt)cnt.textContent=`${_pomo.sessions} session${_pomo.sessions!==1?"s":""}`;
  const bar=$("pomoBar");
  if(bar){
    const pct=(_pomo.total-_pomo.remaining)/_pomo.total*100;
    bar.style.width=pct+"%";
    bar.className="pomo-progress-bar"+(_pomo.phase==="break"?" break":"");
  }
  const startBtn=$("pomoStart");
  if(startBtn)startBtn.textContent=_pomo.timer?"⏸ Pause":"▶ Start";
  document.title=_pomo.timer?`${disp.textContent} — Day Planner`:"Day Planner";
}
function pomoTick(){
  _pomo.remaining--;
  if(_pomo.remaining<=0){
    clearInterval(_pomo.timer);_pomo.timer=null;
    if(_pomo.phase==="focus"){
      _pomo.sessions++;
      _pomo.phase="break";_pomo.remaining=POMO_BREAK;_pomo.total=POMO_BREAK;
      if(Notification.permission==="granted")new Notification("Break time! ☕",{body:"Focus session complete. Take 5 minutes.",icon:"./icon.svg"});
    }else{
      _pomo.phase="focus";_pomo.remaining=POMO_FOCUS;_pomo.total=POMO_FOCUS;
      if(Notification.permission==="granted")new Notification("Back to focus! 🎯",{body:"Break is over. Let's go!",icon:"./icon.svg"});
    }
  }
  updatePomoDisplay();
}
if($("pomoStart")){
  $("pomoStart").onclick=()=>{
    if(_pomo.timer){clearInterval(_pomo.timer);_pomo.timer=null;}
    else{_pomo.timer=setInterval(pomoTick,1000);}
    updatePomoDisplay();
  };
}
if($("pomoReset")){
  $("pomoReset").onclick=()=>{
    if(_pomo.timer){clearInterval(_pomo.timer);_pomo.timer=null;}
    _pomo={phase:"focus",remaining:POMO_FOCUS,sessions:_pomo.sessions,timer:null,total:POMO_FOCUS};
    updatePomoDisplay();
    document.title="Day Planner";
  };
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
  const filtered=getFilteredState(dateStr);
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
function positionTabIndicator(tabEl){
  const ind=$("tabIndicator");
  if(!ind||!tabEl)return;
  const barRect=$("tabBar").getBoundingClientRect();
  const tabRect=tabEl.getBoundingClientRect();
  ind.style.left=(tabRect.left-barRect.left)+"px";
  ind.style.width=tabRect.width+"px";
  ind.style.opacity="1";
}

function setTab(t){
  if(navigator.vibrate)navigator.vibrate(6);
  document.querySelectorAll(".tab").forEach(b=>b.setAttribute("aria-selected",String(b.dataset.tab===t)));
  for(const name of TABS){
    const p=$("panel-"+name);if(p)p.hidden=name!==t;
    const ro=$("ro-"+name);if(ro)ro.hidden=name!==t;
  }
  if(t==="week")renderWeek();
  if(t==="month")renderMonth();
  if(t==="notes")renderNotes();
  if(t==="habits"){renderHabits();updatePomoDisplay();}
  const panel=$("panel-"+t);
  if(panel){panel.classList.remove("panel-enter");void panel.offsetWidth;panel.classList.add("panel-enter");}
  staggerCards(panel);
  const tabEl=document.querySelector(`.tab[data-tab="${t}"]`);
  positionTabIndicator(tabEl);
  // re-measure after label slide animation (350ms)
  setTimeout(()=>positionTabIndicator(document.querySelector(`.tab[data-tab="${t}"]`)),380);
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
    renderKitchen();saveKitchen();
    if (typeof updateAiPrompt === "function") updateAiPrompt();
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
    if(scope==="fixed") renderFixed(); else renderMeals();
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
    renderKitchen();saveKitchen();return;
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
      renderKitchen();saveKitchen();
      if (typeof updateAiPrompt === "function") updateAiPrompt();
    }
    return;
  }
  if(tgt.dataset.delmeal!==undefined){kitchen.plan.splice(+tgt.dataset.delmeal,1);renderKitchen();saveKitchen();return;}
  if(tgt.dataset.delpantry!==undefined){kitchen.pantry.splice(+tgt.dataset.delpantry,1);renderPantry();renderNeeds();saveKitchen();return;}
  if(tgt.dataset.delgoal!==undefined){state.goals.splice(+tgt.dataset.delgoal,1);renderGoals();save();renderWeek();return;}
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
    renderTasks();save();
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
        renderKitchen();
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
$("addFixed").onclick=()=>{state.fixed.push({label:"",start:"13:00",end:"14:00"});renderFixed();save();};
$("addMeal").onclick=()=>{state.meals.push({label:"Snack",time:"15:30",dur:15});renderMeals();save();};
$("addTask").onclick=()=>{state.tasks.push({label:"",dur:30,category:"study",priority:"med",deadlineDays:3});renderTasks();save();};
$("plan").onclick=renderPlan;
if($("planDate")) $("planDate").addEventListener("input", renderPlan);
$("exportCalBtn").onclick=()=>{
  const dateStr = $("planDate")?.value || getLocalYMD(new Date());
  const filteredState = getFilteredState(dateStr);
  const r=buildSchedule(filteredState);
  const events=timelineToEvents(r.timeline,new Date(dateStr));
  if(!events.length){alert("Nothing to export yet - press Plan my day first.");return;}
  downloadICS("dayplan.ics",buildICS(events));
};
if($("exportWeekBtn")) $("exportWeekBtn").onclick=()=>{
  let allEvents = [];
  const baseDate = new Date();
  for(let i=0; i<7; i++) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + i);
    const dateStr = getLocalYMD(d);
    const filteredState = getFilteredState(dateStr);
    filteredState.tasks = []; // We do not export week tasks since they aren't assigned specific dates
    const r = buildSchedule(filteredState);
    const events = timelineToEvents(r.timeline, d);
    allEvents = allEvents.concat(events);
  }
  if(!allEvents.length){alert("Nothing to export.");return;}
  downloadICS("weekplan.ics",buildICS(allEvents));
};
if($("exportMonthBtn")) $("exportMonthBtn").onclick=()=>{
  let allEvents = [];
  const year = currentMonthDate.getFullYear();
  const month = currentMonthDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  
  const todayForPlan = new Date();
  todayForPlan.setHours(0,0,0,0);
  const weekPlan = buildWeek(state, todayForPlan.getDay());
  const weekDates = [];
  for(let i=0; i<7; i++){
    const d = new Date(todayForPlan);
    d.setDate(d.getDate() + i);
    weekDates.push(getLocalYMD(d));
  }
  
  for(let d=1; d<=daysInMonth; d++) {
    const curDate = new Date(year, month, d);
    const dateStr = getLocalYMD(curDate);
    const filteredState = getFilteredState(dateStr);
    filteredState.tasks = []; // Omit flexible tasks from normal schedule build
    const r = buildSchedule(filteredState);
    
    // If this day is within our 7-day planned week, overlay the planned tasks!
    const weekIdx = weekDates.indexOf(dateStr);
    if (weekIdx !== -1) {
      const dayPlan = weekPlan.days[weekIdx];
      dayPlan.placed.forEach(t => r.timeline.push(t));
    }
    
    const events = timelineToEvents(r.timeline, curDate);
    allEvents = allEvents.concat(events);
  }
  if(!allEvents.length){alert("Nothing to export for this month.");return;}
  downloadICS("monthplan.ics",buildICS(allEvents));
};
$("reset").onclick=async()=>{state=structuredClone(DEFAULT);renderInputs();await save();renderPlan();};
$("addItem").onclick=()=>{shop.items.push({name:"",qty:1,price:0,cat:"food",got:false});renderShopRows();updateShop();saveShop();};
$("resetShop").onclick=async()=>{shop=structuredClone(DEFAULT_SHOP);renderShopRows();renderTaxToggle();updateShop();await saveShop();};

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
    if(obj(data.state))   state   = {...structuredClone(DEFAULT),       ...data.state};
    if(obj(data.shop))    shop    = {...structuredClone(DEFAULT_SHOP),  ...data.shop};
    if(obj(data.finance)) finance = {...structuredClone(DEFAULT_FIN),   ...data.finance};
    if(obj(data.kitchen)) kitchen = {...structuredClone(DEFAULT_KITCHEN),...data.kitchen};
    
    // save to storage
    await save(); await saveShop(); await saveFin(); await saveKitchen();
    
    // refresh UI
    setCurrency(getCurrency());
    if (typeof renderCurrencyMenu === "function") renderCurrencyMenu();
    renderInputs(); renderGoals(); renderPlan();
    renderShopRows(); renderTaxToggle(); updateShop();
    renderFinInputs(); updateFinance();
    renderKitchen();
    if(document.querySelector(".tab[data-tab='week']").getAttribute("aria-selected")==="true") renderWeek();
    
    alert("Data imported successfully!");
  } catch(err) {
    alert("Failed to import data: " + err.message);
  }
  e.target.value = "";
};

$("planWeek").onclick=renderWeek;
$("addGoal").onclick=()=>{(state.goals||(state.goals=[])).push({name:"",hoursPerWeek:2});renderGoals();save();renderWeek();};
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
  renderPantry();renderNeeds();saveKitchen();
  if (typeof updateAiPrompt === "function") updateAiPrompt();
}
$("addPantry").onclick=addPantryItem;
$("pantryInput").addEventListener("keydown",e=>{if(e.key==="Enter")addPantryItem();});
$("suggestWeek").onclick=()=>{
  let targetPortions = 0;
  const today = new Date();
  for(let i=0;i<7;i++){
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const dateStr = getLocalYMD(d);
    const dow = d.getDay();
    const skips = new Set();
    (state.fixed||[]).forEach(f => {
      if(f.date) {
        if(f.date === dateStr && f.skipMeal) skips.add(f.skipMeal);
      } else {
        if((!f.days || !f.days.length || f.days.includes(dow)) && f.skipMeal) skips.add(f.skipMeal);
      }
    });
    targetPortions += (state.meals || []).filter(m => !skips.has(m.label)).length;
  }
  kitchen.plan=suggestWeek(allRecipes(), targetPortions).map(id=>({recipeId:id, made:false}));  // include custom/imported recipes, not just built-ins
  renderKitchen();
  saveKitchen();
};
$("clearMeals").onclick=()=>{kitchen.plan=[];renderKitchen();saveKitchen();};
$("genShop").onclick=generateShoppingList;

$("addCustomMealBtn").onclick=addCustomMeal;
$("customMealIngredients").addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();addCustomMeal();}});
$("customMealUrl").addEventListener("keydown",e=>{if(e.key==="Enter")addCustomMeal();});
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
  renderInputs(); renderGoals(); renderPlan();
  renderShopRows(); renderTaxToggle(); updateShop();
  renderFinInputs(); updateFinance();
  renderKitchen();
  if(document.querySelector(".tab[data-tab='week']")?.getAttribute("aria-selected")==="true") renderWeek();
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

/* ---------- month calendar ---------- */
let currentMonthDate = new Date();
currentMonthDate.setDate(1);

function renderMonth() {
  const grid = $("monthGrid");
  const title = $("monthTitle");
  if(!grid || !title) return;
  
  const year = currentMonthDate.getFullYear();
  const month = currentMonthDate.getMonth();
  
  // formatting
  const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  title.textContent = `${monthNames[month]} ${year}`;
  
  // calculate days
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startDow = firstDay.getDay(); // 0 is Sunday
  
  // calculate 7-day week plan for visualization
  const todayForPlan = new Date();
  todayForPlan.setHours(0,0,0,0);
  const weekPlan = buildWeek(state, todayForPlan.getDay());
  const weekDates = [];
  for(let i=0; i<7; i++){
    const d = new Date(todayForPlan);
    d.setDate(d.getDate() + i);
    weekDates.push(getLocalYMD(d));
  }
  
  grid.innerHTML = "";
  
  // headers
  const dowNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  dowNames.forEach(d => {
    const th = document.createElement("div");
    th.className = "month-header";
    th.textContent = d;
    grid.appendChild(th);
  });
  
  const todayStr = getLocalYMD(new Date());
  const prevMonthLastDay = new Date(year, month, 0).getDate();
  
  // Render exactly 42 cells (6 weeks)
  for(let i=0; i<42; i++) {
    const cell = document.createElement("div");
    cell.className = "month-day";
    let cellDate;
    let isOtherMonth = false;
    let d;
    
    if (i < startDow) {
      // Previous month
      d = prevMonthLastDay - startDow + i + 1;
      cellDate = new Date(year, month - 1, d);
      isOtherMonth = true;
    } else if (i >= startDow + daysInMonth) {
      // Next month
      d = i - (startDow + daysInMonth) + 1;
      cellDate = new Date(year, month + 1, d);
      isOtherMonth = true;
    } else {
      // Current month
      d = i - startDow + 1;
      cellDate = new Date(year, month, d);
    }
    
    if (isOtherMonth) cell.classList.add("other-month");
    
    const dateStr = getLocalYMD(cellDate);
    if (dateStr === todayStr) cell.classList.add("today");
    
    const dayHeader = document.createElement("div");
    dayHeader.className = "month-day-header";

    const num = document.createElement("div");
    num.className = "date-num";
    num.textContent = cellDate.getDate();
    if (cellDate.getDate() === 1) {
      num.textContent = `${monthNames[cellDate.getMonth()].substring(0,3)} ${num.textContent}`;
    }

    const addBtn = document.createElement("button");
    addBtn.className = "cal-add-btn";
    addBtn.type = "button";
    addBtn.title = "Add event on this day";
    addBtn.setAttribute("aria-label", `Add event on ${dateStr}`);
    addBtn.textContent = "+";
    addBtn.onclick = (ev) => { ev.stopPropagation(); openQuickAddEvent(dateStr); };

    dayHeader.appendChild(num);
    dayHeader.appendChild(addBtn);
    cell.appendChild(dayHeader);

    const pillsContainer = document.createElement("div");
    pillsContainer.className = "event-pills";
    
    // collect events to show
    const eventsToShow = [];
    
    // Always add specific events
    const specificEvents = (state.fixed || []).filter(f => f.date === dateStr);
    specificEvents.forEach(evt => eventsToShow.push({ label: evt.label, type: "specific" }));
    
    const weekIdx = weekDates.indexOf(dateStr);
    if (weekIdx !== -1) {
      // It's within the next 7 days! Show tasks & immovable blocks (skip meals to save space)
      const dayPlan = weekPlan.days[weekIdx];
      dayPlan.immovable.forEach(b => {
        if(b.type !== "meal") eventsToShow.push({ label: b.label, type: b.type || "routine" });
      });
      dayPlan.placed.forEach(t => eventsToShow.push({ label: t.label, type: "task" }));
    } else {
      // Outside 7 days: show routine fixed events
      const cellDow = cellDate.getDay();
      const routineEvents = (state.fixed || []).filter(f => !f.date && f.days && f.days.includes(cellDow));
      routineEvents.forEach(evt => eventsToShow.push({ label: evt.label, type: "fixed" }));
    }
    
    eventsToShow.forEach(evtData => {
      const pill = document.createElement("div");
      pill.className = `event-pill event-type-${evtData.type}`;
      pill.textContent = evtData.label;
      pill.title = evtData.label;
      pillsContainer.appendChild(pill);
    });
    
    cell.appendChild(pillsContainer);
    
    cell.onclick = () => {
      setPlanDate(dateStr);
      setTab("schedule");
      renderPlan();
    };
    
    grid.appendChild(cell);
  }
}

if($("prevMonth")) $("prevMonth").onclick = () => {
  currentMonthDate.setMonth(currentMonthDate.getMonth() - 1);
  renderMonth();
};
if($("nextMonth")) $("nextMonth").onclick = () => {
  currentMonthDate.setMonth(currentMonthDate.getMonth() + 1);
  renderMonth();
};

/* ---------- quick-add calendar event ---------- */
let calEventDate = null;
function openQuickAddEvent(dateStr) {
  calEventDate = dateStr;
  const lbl = $("calEvtDateLbl");
  if (lbl) lbl.textContent = formatDateDisplay(dateStr);
  $("calEvtLabel").value = "";
  $("calEvtStart").value = "09:00";
  $("calEvtEnd").value = "10:00";
  $("calEventModal").hidden = false;
  setTimeout(() => $("calEvtLabel").focus(), 50);
}
function closeCalEvent() {
  calEventDate = null;
  $("calEventModal").hidden = true;
}
function confirmCalEvent() {
  const label = $("calEvtLabel").value.trim();
  if (!label) { $("calEvtLabel").focus(); return; }
  const start = $("calEvtStart").value || "09:00";
  const end   = $("calEvtEnd").value   || "10:00";
  state.fixed.push({ label, start, end, date: calEventDate, days: [] });
  closeCalEvent();
  renderFixed();
  save();
  renderMonth();
}
if($("calEvtConfirm")) $("calEvtConfirm").onclick = confirmCalEvent;
if($("calEvtCancel"))  $("calEvtCancel").onclick  = closeCalEvent;
$("calEvtLabel") && $("calEvtLabel").addEventListener("keydown", e => { if(e.key==="Enter") confirmCalEvent(); });

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
  renderInputs(); renderGoals(); renderPlan(); renderMonth();
  renderShopRows(); renderTaxToggle(); updateShop(); saveShop();
  renderFinInputs(); updateFinance(); saveFin();
  renderKitchen(); saveKitchen();
  updatePomoDisplay();
  updateNotifBtn();
  staggerCards(document.getElementById("panel-schedule"));
  wireLabels();
  installLabelObserver();
  applyLanguage();
  requestAnimationFrame(()=>positionTabIndicator(document.querySelector(".tab[aria-selected='true']")));
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
            updateUserUI(user);

            // One-time migration from localStorage
            await migrateLocalStorage(user.uid);

            // Boot the app with cloud data
            await bootApp();
          } else {
            currentUser = null;
            useCloud = false;
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
