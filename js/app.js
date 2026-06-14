"use strict";
/* ---------- app controller ----------
   Owns state, persistence, DOM rendering, and event wiring.
   Pure logic lives in ./schedule.js and ./shopping.js.
   Auth via ./auth.js, cloud sync via ./sync.js. */

import { getLang, setLang, t, applyLanguage, availableLanguages, setCurrency } from "./i18n.js?v=1.6";
import { fmtDur, toHHMM, buildSchedule, asText, toMin } from "./schedule.js?v=1.6";
import { yen, calcShopping, shopText, displayAmount, fromDisplay } from "./shopping.js?v=1.6";
import { computeFinance, financeVerdict, financeText } from "./finance.js?v=1.6";
import { buildWeek, DOW } from "./week.js?v=1.6";
import { RECIPES, neededIngredients, toShopItem, suggestWeek, coerceRecipe } from "./meals.js?v=1.6";
import { recipeNutrition, planNutrition, fmtKcal, fmtMacros } from "./nutrition.js?v=1.6";
import { buildICS, timelineToEvents, downloadICS } from "./calendar.js?v=1.6";
import { staggerCards } from "./fx.js?v=1.6";
import { initAuth, isConfigured as isFirebaseConfigured, signInWithGoogle, signInWithEmail,
         signUpWithEmail, resetPassword, signOut as fbSignOut, onAuthStateChanged, getApp } from "./auth.js?v=1.6";
import { initSync, saveToCloud, loadFromCloud, listenToCloud, stopAllListeners, migrateLocalStorage } from "./sync.js?v=1.6";

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
  const data={wake:state.wake,sleep:state.sleep,fixed:state.fixed,meals:state.meals,tasks:state.tasks,goals:state.goals};
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
        <label style="display:flex; align-items:center; gap:6px; font-size:12px; color:var(--text-secondary); cursor:pointer; font-weight:500;">
          <input type="checkbox" style="width:16px;height:16px;accent-color:var(--mint);cursor:pointer;margin:0;" data-k="fixed" data-i="${i}" data-f="skipMeals" ${f.skipMeals?"checked":""}>
          Free meal / No time to cook
        </label>
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
    <div class="row task">
      <div class="full"><label class="f">Task</label><input data-k="tasks" data-i="${i}" data-f="label" value="${esc(tk.label)}" placeholder="e.g. OS assignment"></div>
      <div><label class="f">Minutes</label><input type="number" min="5" step="5" data-k="tasks" data-i="${i}" data-f="dur" value="${tk.dur}"></div>
      <div><label class="f">Type</label>
        ${cSel("tasks", i, "category", [{v:"study",l:t("opt.study")},{v:"project",l:t("opt.project")},{v:"chore",l:t("opt.chore")}], tk.category)}</div>
      <div><label class="f">Priority</label>
        ${cSel("tasks", i, "priority", [{v:"high",l:t("opt.high")},{v:"med",l:t("opt.medium")},{v:"low",l:t("opt.low")}], tk.priority)}</div>
      <div><label class="f">Due in (days)</label><input type="number" min="0" step="1" data-k="tasks" data-i="${i}" data-f="deadlineDays" value="${tk.deadlineDays}"></div>
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

/* ---------- output ---------- */
function renderPlan(){
  const r=buildSchedule(state);
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
      <button class="iconbtn" data-delshop="${i}" title="Remove" aria-label="Remove item">×</button>
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
  finance.receipts.push({date:new Date().toISOString().slice(0,10),store:$("rmStore").value.trim(),
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
  pantry:["Short-grain rice","Soy sauce","Mirin","Dashi","Sugar","Salt","Cooking oil","Flour",
          "Garam masala","Turmeric","Cumin","Garlic","Ginger","Doubanjiang","Miso paste"],
  plan:[],
  customRecipes:[],   // recipes manually added by the user
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
}

const allRecipes=()=>RECIPES.concat(kitchen.customRecipes||kitchen.aiRecipes||[]);
const recipeById=id=>allRecipes().find(r=>r.id===id);
function renderPantry(){
  $("pantryChips").innerHTML=kitchen.pantry.map((p,i)=>
    `<span class="chip">${esc(p)}<button data-delpantry="${i}" title="Remove" aria-label="Remove ${esc(p)}">×</button></span>`).join("")
    ||`<span class="hint" style="margin:0">${t("meals.pantryEmpty")}</span>`;
}
function renderRecipeList(){
  $("recipeList").innerHTML=allRecipes().map(r=>{
    const picked=kitchen.plan.includes(r.id);
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
  const rows=kitchen.plan.map((id,i)=>{const r=recipeById(id);if(!r)return"";
    return `<div class="recipe picked"><div class="rinfo"><div class="rn">${esc(r.name)} <span class="kcal-badge">${fmtKcal(recipeNutrition(r,1).kcal)}</span></div>
      <div class="rm">${esc(r.cuisine)} · ${t("meals.serves")} ${r.serves}</div>
      <button class="rm" style="background:none; border:none; padding:0; color:var(--blue); cursor:pointer; font-weight:600; font-family:var(--sans); margin-top:4px;" data-viewrecipe="${esc(r.id)}">${t("meals.viewSteps")}</button>
      </div>
      <button class="iconbtn" data-delmeal="${i}" title="Remove" aria-label="Remove ${esc(r.name)}">×</button></div>`;
  }).join("");
  // one-serving-per-meal nutrition total for the picked plan
  const tot=planNutrition(kitchen.plan.map(recipeById).filter(Boolean));
  el.innerHTML=rows+`<div class="nutri-total"><span><b>${fmtKcal(tot.kcal)}</b> total</span><span>${fmtMacros(tot)}</span></div>`;
}
function currentNeeds(){return neededIngredients(kitchen.plan.map(recipeById).filter(Boolean),kitchen.pantry);}
function renderNeeds(){
  const needs=currentNeeds(),el=$("needList");
  $("roMeals").textContent=needs.length;

  let targetPortions = 0;
  const todayDow = new Date().getDay();
  for(let i=0;i<7;i++){
    const dow=(todayDow+i)%7;
    const skips = (state.fixed||[]).filter(f=>!f.days||!f.days.length||f.days.includes(dow)).some(f=>f.skipMeals);
    if (!skips) targetPortions += (state.meals || []).length;
  }
  let plannedPortions = kitchen.plan.reduce((sum, id) => {
    const r = recipeById(id);
    return sum + (r ? (r.serves || 1) : 0);
  }, 0);

  $("roMealsSub").textContent=kitchen.plan.length ? `${kitchen.plan.length} meals (${plannedPortions}/${targetPortions} portions)` : `target: ${targetPortions} portions`;
  
  if(!kitchen.plan.length){el.innerHTML=`<div class="empty" style="padding:16px">${t("meals.noMealsPicked")}</div>`;return;}
  if(!needs.length){el.innerHTML=`<div class="empty" style="padding:16px">${t("meals.pantryCovers")}</div>`;return;}
  el.innerHTML=needs.map(n=>{const amt=n.qty&&n.unit?`${esc(String(n.qty))}${esc(n.unit)}`:n.qty>1?`×${esc(String(n.qty))}`:"";
    return `<div class="needrow"><span>${esc(n.name)} <span style="color:var(--text-muted)">${amt}</span></span><b>${yen(n.price)}</b></div>`;
  }).join("");
}
function renderKitchen(){renderPantry();renderRecipeList();renderMealPlan();renderNeeds();}
function generateShoppingList(){
  const needs=currentNeeds();if(!needs.length)return;
  const have=new Set(shop.items.map(it=>String(it.name).toLowerCase()));
  let added=0;
  for(const n of needs){const item=toShopItem(n);if(have.has(item.name.toLowerCase()))continue;shop.items.push(item);added++;}
  renderShopRows();updateShop();saveShop();
  $("savedKitchen").textContent=added?`added ${added} item${added===1?"":"s"} to Shopping`:"all already on your list";
  setTab("shopping");
}

/* ---------- tabs ---------- */
const TABS=["schedule","week","shopping","meals","finance"];
function setTab(t){
  document.querySelectorAll(".tab").forEach(b=>b.setAttribute("aria-selected",String(b.dataset.tab===t)));
  for(const name of TABS){
    const p=$("panel-"+name);if(p)p.hidden=name!==t;
    const ro=$("ro-"+name);if(ro)ro.hidden=name!==t;
  }
  if(t==="week")renderWeek();   // recompute against latest classes/tasks on open
  staggerCards($("panel-"+t)); // fluid entrance for the cards of the opened tab
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
    const id=tgt.dataset.recipe,k=kitchen.plan.indexOf(id);
    if(k>=0)kitchen.plan.splice(k,1);else kitchen.plan.push(id);
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
  if(tgt.dataset.delmeal!==undefined){kitchen.plan.splice(+tgt.dataset.delmeal,1);renderKitchen();saveKitchen();return;}
  if(tgt.dataset.delpantry!==undefined){kitchen.pantry.splice(+tgt.dataset.delpantry,1);renderPantry();renderNeeds();saveKitchen();return;}
  if(tgt.dataset.delgoal!==undefined){state.goals.splice(+tgt.dataset.delgoal,1);renderGoals();save();renderWeek();return;}
  if(tgt.classList.contains("tab")){setTab(tgt.dataset.tab);return;}
  if(tgt.dataset.mode){shop.taxMode=tgt.dataset.mode;renderTaxToggle();updateShop();saveShop();return;}
});

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

/* receipt photo: shown only as a visual reference while typing — never uploaded or stored */
function onPhoto(e){
  const file=e.target.files&&e.target.files[0];if(!file||!draft)return;
  if(draft.photoURL)URL.revokeObjectURL(draft.photoURL);
  draft.photoURL=URL.createObjectURL(file);
  const shot=$("rmShot");shot.src=draft.photoURL;shot.classList.add("has");
  e.target.value="";   // allow re-snapping the same file
}
$("addFixed").onclick=()=>{state.fixed.push({label:"",start:"13:00",end:"14:00"});renderFixed();save();};
$("addMeal").onclick=()=>{state.meals.push({label:"Snack",time:"15:30",dur:15});renderMeals();save();};
$("addTask").onclick=()=>{state.tasks.push({label:"",dur:30,category:"study",priority:"med",deadlineDays:3});renderTasks();save();};
$("plan").onclick=renderPlan;
$("exportCalBtn").onclick=()=>{
  const r=buildSchedule(state);
  const events=timelineToEvents(r.timeline,new Date());
  if(!events.length){alert("Nothing to export yet — press Plan my day first.");return;}
  downloadICS("dayplan.ics",buildICS(events));
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
function applyTheme(dark){
  if(dark) document.documentElement.setAttribute("data-theme","dark");
  else document.documentElement.removeAttribute("data-theme");
  localStorage.setItem("theme",dark?"dark":"light");
}
$("themeToggle").onclick=()=>{
  const isDark=document.documentElement.getAttribute("data-theme")==="dark";
  applyTheme(!isDark);
};
// init theme
if(localStorage.getItem("theme")==="dark") applyTheme(true);
else if(!localStorage.getItem("theme")&&matchMedia("(prefers-color-scheme: dark)").matches) applyTheme(true);

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
  a.download = `dailyplanner-export-${new Date().toISOString().slice(0,10)}.json`;
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
  if(!kitchen.pantry.some(p=>p.toLowerCase()===v.toLowerCase()))kitchen.pantry.push(v);
  $("pantryInput").value="";renderPantry();renderNeeds();saveKitchen();
}
$("addPantry").onclick=addPantryItem;
$("pantryInput").addEventListener("keydown",e=>{if(e.key==="Enter")addPantryItem();});
$("suggestWeek").onclick=()=>{
  let targetPortions = 0;
  const todayDow = new Date().getDay();
  for(let i=0;i<7;i++){
    const dow=(todayDow+i)%7;
    const skips = (state.fixed||[]).filter(f=>!f.days||!f.days.length||f.days.includes(dow)).some(f=>f.skipMeals);
    if (!skips) targetPortions += (state.meals || []).length;
  }
  kitchen.plan=suggestWeek(allRecipes(), targetPortions);  // include custom/imported recipes, not just built-ins
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

  // nothing open: Enter/Space on a focused control opens it
  if(!selOpen && !timeOpen){
    const el = e.target;
    if(el.classList && (el.classList.contains("c-sel") || el.classList.contains("c-time")) && (e.key==="Enter" || e.key===" ")){
      e.preventDefault();
      el.classList.contains("c-sel") ? openSelect(el) : openTime(el);
    }
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

/* ---------- boot ---------- */
async function bootApp() {

  // Load data and render
  await load(); await loadShop(); await loadFin(); await loadKitchen();
  if (!Array.isArray(state.goals)) state.goals = [];    // migrate state saved before goals existed
  if (!Array.isArray(kitchen.aiRecipes)) kitchen.aiRecipes = [];   // migrate pre-AI meal plans
  setCurrency(getCurrency());
  if (typeof renderCurrencyMenu === "function") renderCurrencyMenu();
  renderInputs(); renderGoals(); renderPlan(); save();
  renderShopRows(); renderTaxToggle(); updateShop(); saveShop();
  renderFinInputs(); updateFinance(); saveFin();
  renderKitchen(); saveKitchen();
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
