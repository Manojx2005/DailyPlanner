"use strict";
/* ---------- Schedule / day / goals / week view controllers ----------
   Owns rendering for the Day, Goals, and Week tabs.
   Accepts state as an explicit parameter to avoid circular imports. */

import { $, esc, cSel, cTime, cDate, getLocalYMD } from "./ui-utils.js?v=1.0";
import { t } from "./i18n.js?v=1.7";
import { fmtDur, toHHMM, buildSchedule, asText, toMin } from "./schedule.js?v=1.6";
import { buildWeek, DOW } from "./week.js?v=1.7";
import { getViewDate } from "./store.js?v=1.0";

/* ---- helpers ---- */

function getLocalDow(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return new Date(y, m - 1, d).getDay();
}

const DOW_SHORT = ["S","M","T","W","T","F","S"];
export function dowPicker(scope, i, days) {
  return `<div class="dowpick">${DOW_SHORT.map((d, idx) =>
    `<button type="button" class="dow${(days||[]).includes(idx)?" on":""}" data-dowscope="${scope}" data-dowtoggle="${i}" data-dow="${idx}" aria-pressed="${(days||[]).includes(idx)}" aria-label="${DOW[idx]}">${d}</button>`
  ).join("")}</div>`;
}

/* ---- inputs tab ---- */

export function renderFixed(state) {
  $("fixedRows").innerHTML = state.fixed.map((f, i) => `
    <div class="row fixed" style="display:flex; flex-direction:column; gap:8px;">
      <div style="display:grid; grid-template-columns:1fr auto auto auto; gap:8px; width:100%; align-items:end;">
        <div><label class="f">What</label><input data-k="fixed" data-i="${i}" data-f="label" value="${esc(f.label)}" placeholder="e.g. Algorithms class"></div>
        <div><label class="f">Start</label>${cTime("fixed", i, "start", f.start)}</div>
        <div><label class="f">End</label>${cTime("fixed", i, "end", f.end)}</div>
        <div class="x"><button class="iconbtn" data-del="fixed" data-i="${i}" title="Remove" aria-label="Remove">×</button></div>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; width:100%; flex-wrap:wrap; gap:10px;">
        ${dowPicker("fixed", i, f.days)}
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

export function renderMeals(state) {
  $("mealRows").innerHTML = state.meals.map((m, i) => `
    <div class="row meal" style="display:flex; flex-direction:column; gap:8px;">
      <div style="display:grid; grid-template-columns:1fr auto auto auto; gap:8px; width:100%; align-items:end;">
        <div><label class="f">Meal</label><input data-k="meals" data-i="${i}" data-f="label" value="${esc(m.label)}"></div>
        <div><label class="f">Time</label>${cTime("meals", i, "time", m.time)}</div>
        <div><label class="f">Min</label><input type="number" min="5" step="5" data-k="meals" data-i="${i}" data-f="dur" value="${m.dur}" style="width:74px"></div>
        <div class="x"><button class="iconbtn" data-del="meals" data-i="${i}" title="Remove" aria-label="Remove">×</button></div>
      </div>
      <div style="width:100%; display:flex; gap:10px; align-items:center;">
        <label style="font-size:12px; color:var(--text-secondary); font-weight:500;">Cook days:</label>
        ${dowPicker("meals", i, m.days)}
      </div>
    </div>`).join("");
}

export function renderTasks(state) {
  $("taskRows").innerHTML = state.tasks.map((tk, i) => `
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

export function renderInputs(state) {
  $("wake").value = state.wake;
  $("wake").previousElementSibling.textContent = state.wake;
  $("sleep").value = state.sleep;
  $("sleep").previousElementSibling.textContent = state.sleep;
  renderFixed(state);
  renderMeals(state);
  renderTasks(state);
}

/* ---- filtered state for a specific date ---- */

export function getFilteredState(state, dateStr) {
  const dow = getLocalDow(dateStr);
  const skips = new Set();
  const filteredFixed = (state.fixed||[]).filter(f => {
    if (f.date) {
      if (f.date !== dateStr) return false;
    } else {
      if (f.days && f.days.length && !f.days.includes(dow)) return false;
    }
    if (f.skipMeal) skips.add(f.skipMeal);
    return true;
  });
  const filteredMeals = (state.meals||[]).filter(m => !skips.has(m.label));
  return { ...state, fixed: filteredFixed, meals: filteredMeals };
}

/* ---- day plan output ---- */

export function renderPlan(state) {
  const dateStr = $("planDate")?.value || getLocalYMD(new Date());
  const filteredState = getFilteredState(state, dateStr);
  const r = buildSchedule(filteredState);
  if (toMin(state.sleep) <= toMin(state.wake))
    r.warnings.unshift(`Wind-down (${state.sleep}) isn't after wake (${state.wake}) — set a later wind-down to get a real day.`);
  $("roFree").textContent = fmtDur(r.summary.totalFree);
  $("roSub").textContent = r.summary.fits ? "everything fits" : fmtDur(r.summary.deficit)+" won't fit";
  $("sFree").textContent = fmtDur(r.summary.totalFree);
  $("sReq").textContent = fmtDur(r.summary.requested);
  $("sSched").textContent = fmtDur(r.summary.scheduled);

  const v = $("verdict");
  if (r.summary.fits) {
    const mu = r.summary.mostUrgent;
    v.className = "verdict ok";
    v.innerHTML = `<span class="tag">✓</span><span>${t("verdict.fits")}${mu?`. ${t("verdict.soonest")} <b>${esc(mu.label)}</b> (${mu.days===0?t("verdict.today"):mu.days+"d"})`:""}.  </span>`;
  } else {
    v.className = "verdict over";
    v.innerHTML = `<span class="tag">!</span><span>${t("verdict.overBy")} <b>${fmtDur(r.summary.deficit)}</b> ${t("verdict.trimHint")}</span>`;
  }

  const tl = $("timeline");
  if (!r.timeline.length) {
    tl.innerHTML = `<div class="empty">${t("day.noDay")}</div>`;
  } else {
    const PX = 1.05, top = r.wake, bottom = r.sleep, H = (bottom-top)*PX;
    let html = `<div class="tl" style="height:${H}px">`;
    for (let h = Math.ceil(top/60)*60; h <= bottom; h += 60) {
      const y = (h-top)*PX;
      html += `<div class="hour" style="top:${y}px">${toHHMM(h)}</div><div class="gridline" style="top:${y}px"></div>`;
    }
    for (const b of r.timeline) {
      const y = (b.start-top)*PX, hgt = Math.max(22,(b.end-b.start)*PX-3);
      const compact = hgt < 38;
      const cls = (b.type==="task"?b.category:b.type)+(compact?" compact":"");
      const part = b.parts>1?` <span style="opacity:.8">(${b.part}/${b.parts})</span>`:"";
      html += `<div class="blk ${cls}" style="top:${y}px;height:${hgt}px">
        <div class="nm">${esc(b.label)}${part}</div>
        <div class="t">${toHHMM(b.start)}–${toHHMM(b.end)} · ${fmtDur(b.end-b.start)}</div></div>`;
    }
    html += `</div>`;
    tl.innerHTML = html;
  }

  const tray = $("tray");
  tray.innerHTML = r.deferred.length
    ? `<div class="tray"><h3>${t("tray.didntFit")}</h3><ul>${r.deferred.map(d=>`<li>${esc(d.label)} — <b>${fmtDur(d.minutes)}</b> <span style="opacity:.8">(${d.reason})</span></li>`).join("")}</ul></div>`
    : "";

  const w = $("warns");
  w.innerHTML = r.warnings.length ? `<div class="warns">⚠ ${r.warnings.map(esc).join("<br>⚠ ")}</div>` : "";

  $("exportWrap").style.display = "block";
  $("exportTxt").value = asText(r);
}

/* ---- goals ---- */

export function renderGoals(state) {
  $("goalRows").innerHTML = (state.goals||[]).map((g, i) => `
    <div class="row fin">
      <div><label class="f">Goal</label><input data-scope="goal" data-i="${i}" data-f="name" value="${esc(g.name)}" placeholder="e.g. JLPT N2, Thesis"></div>
      <div><label class="f">Hours / week</label><input class="amt-in" type="number" min="0" step="0.5" data-scope="goal" data-i="${i}" data-f="hoursPerWeek" value="${g.hoursPerWeek}" style="width:108px"></div>
      <div class="x"><button class="iconbtn" data-delgoal="${i}" title="Remove" aria-label="Remove">×</button></div>
    </div>`).join("") || '<div class="empty" style="padding:14px">No goals yet — add what you\'re working toward.</div>';
}

/* ---- week view ---- */

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export function renderWeek(state) {
  const today = getViewDate(), r = buildWeek(state, today.getDay());
  $("wFree").textContent = fmtDur(r.summary.totalFree);
  $("wReq").textContent = fmtDur(r.summary.requested);
  $("wSched").textContent = fmtDur(r.summary.scheduled);
  $("roWeek").textContent = fmtDur(r.summary.totalFree);
  $("roWeekSub").textContent = r.summary.fits ? "everything fits" : fmtDur(r.summary.deficit)+" won't fit";

  const v = $("wVerdict");
  if (r.summary.fits)
    v.innerHTML = `<div class="verdict ok"><span class="tag">✓</span><span>The whole week fits.</span></div>`;
  else
    v.innerHTML = `<div class="verdict over"><span class="tag">!</span><span><b>${fmtDur(r.summary.deficit)}</b> of tasks won't fit this week — trim, extend days, or push deadlines.</span></div>`;

  const realTodayStr = getLocalYMD(new Date());
  const grid = $("weekGrid");
  grid.innerHTML = r.days.map((d, i) => {
    const date = new Date(today); date.setDate(today.getDate()+i);
    const dateStr  = `${MONTHS[date.getMonth()]} ${date.getDate()}`;
    const isToday  = getLocalYMD(date) === realTodayStr;
    const items = d.timeline.map(b => {
      const cls = b.type==="task" ? b.category : b.type;
      return `<div class="ditem ${b.type==="free"?"free":""}">
        <span class="dt">${toHHMM(b.start)}–${toHHMM(b.end)}</span>
        <span class="swatch sw-${cls}"></span>
        <span class="dn">${esc(b.label)}</span>
        <span class="dd">${fmtDur(b.end-b.start)}</span></div>`;
    }).join("") || `<div class="empty" style="padding:10px">${t("week.nothingSched")}</div>`;
    return `<div class="daycard ${isToday?"today":""}">
      <div class="dhead"><div class="dname">${d.name}${isToday?`<span class="badge">${t("week.today")}</span>`:""} <span style="color:var(--text-muted);font-weight:600;font-size:12px">${dateStr}</span></div>
      <div class="dfree">${fmtDur(d.free)} ${t("week.free")}</div></div>
      <div class="dlist">${items}</div></div>`;
  }).join("");

  const tray = $("wTray");
  tray.innerHTML = r.deferred.length
    ? `<div class="tray"><h3>${t("week.didntFit")}</h3><ul>${r.deferred.map(d=>`<li>${esc(d.label)} — <b>${fmtDur(d.minutes)}</b> <span style="opacity:.8">(${d.reason})</span></li>`).join("")}</ul></div>`
    : "";

  const gp = $("goalProgress");
  if (!r.goalProgress.length) {
    gp.innerHTML = `<div class="empty">${t("week.goalEmpty")}</div>`;
  } else {
    gp.innerHTML = r.goalProgress.map(g => {
      const ratio = g.target ? g.scheduled/g.target : 0;
      const pct = Math.min(100, Math.round(ratio*100));
      const circumference = 2 * Math.PI * 24;
      const offset = circumference * (1 - Math.min(1, ratio));
      const lvl = ratio>=1 ? "" : ratio>=0.5 ? "warn" : "bad";
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
}
