"use strict";
/* ---------- Shared DOM utilities ----------
   Pure helpers with no side effects. Imported by app.js and all ui-*.js
   domain controllers. No imports from app.js to avoid circular deps. */

export const $ = id => document.getElementById(id);

export function esc(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

/* Custom select widget — renders a keyboard-accessible dropdown. */
export function cSel(k, i, f, options, val, scope, arr) {
  const lbl = options.find(o => o.v === val)?.l || val || "";
  const name = String(f || "option").replace(/([A-Z])/g, " $1").toLowerCase();
  const optsHtml = options.map(o =>
    `<div class="cs-opt" role="option" data-v="${esc(o.v)}">${esc(o.l)}</div>`
  ).join("");
  return `<div class="c-sel" role="button" tabindex="0" aria-haspopup="listbox" aria-expanded="false" aria-label="${esc(name)}: ${esc(lbl)}" data-k="${k||''}" data-scope="${scope||''}" data-arr="${arr||''}" data-i="${i}" data-f="${f}" data-val="${esc(val)}">
    <div class="cs-head">${esc(lbl)}</div>
    <div class="cs-opts" hidden>${optsHtml}</div>
    <input type="hidden" data-k="${k||''}" data-scope="${scope||''}" data-arr="${arr||''}" data-i="${i}" data-f="${f}" value="${esc(val)}">
  </div>`;
}

/* Only allow http(s) links — blocks javascript:/data: XSS vectors. */
export function safeUrl(u) {
  const s = String(u || "").trim();
  return /^https?:\/\//i.test(s) ? s : "";
}

export function getLocalYMD(d) {
  const y   = d.getFullYear();
  const m   = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatDateDisplay(dateStr) {
  if (!dateStr) return "No date";
  const [y, m, d] = dateStr.split('-');
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[parseInt(m,10)-1]} ${parseInt(d,10)}, ${y}`;
}

export function cTime(k, i, f, val, scope) {
  return `<div class="c-time" role="button" tabindex="0" aria-haspopup="dialog" aria-expanded="false" aria-label="time ${val || "00:00"}" data-k="${k||''}" data-scope="${scope||''}" data-i="${i||''}" data-f="${f||''}">
    <div class="ct-head">${val || "00:00"}</div>
    <input type="hidden" data-k="${k||''}" data-scope="${scope||''}" data-i="${i||''}" data-f="${f||''}" id="${!i && !k ? f : ''}" value="${val || "00:00"}">
  </div>`;
}

export function cDate(k, i, f, val) {
  const display = val ? formatDateDisplay(val) : "No date";
  const empty = val ? "" : " empty";
  return `<div class="c-date${empty}" role="button" tabindex="0" aria-haspopup="dialog" aria-expanded="false" aria-label="date ${val || "none"}" data-k="${k||''}" data-i="${i||''}" data-f="${f||''}">
    <div class="cd-head">${display}</div>
    <input type="hidden" data-k="${k||''}" data-i="${i||''}" data-f="${f||''}" value="${val || ""}">
  </div>`;
}
