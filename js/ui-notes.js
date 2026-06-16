"use strict";
/* ---------- Notes domain view controller ---------- */

import { $, esc, getLocalYMD, formatDateDisplay } from "./ui-utils.js?v=1.0";

let noteDate = getLocalYMD(new Date());

export function renderPinnedNotes(state) {
  const el = $("pinnedNotesList"); if (!el) return;
  const pinned = (state.pinnedNotes||[]).map(d => ({ date: d, text: state.notes[d]||"" })).filter(n => n.text);
  if (!pinned.length) { el.innerHTML = `<div class="empty">No pinned notes yet.</div>`; return; }
  el.innerHTML = pinned.map(n => `
    <div class="note-pin-item" data-pinneddate="${esc(n.date)}">
      <div class="note-pin-body">${esc(n.text)}</div>
      <span class="note-pin-date">${formatDateDisplay(n.date)}</span>
      <button class="note-pin-del" data-delpinned="${esc(n.date)}" aria-label="Unpin">×</button>
    </div>`).join("");
}

export function renderNotes(state) {
  if (!state.notes) state.notes = {};
  if (!state.pinnedNotes) state.pinnedNotes = [];
  const ed = $("noteEditor"); if (ed) ed.value = state.notes[noteDate] || "";
  const disp = $("noteDateDisplay");
  if (disp) disp.textContent = noteDate === getLocalYMD(new Date()) ? "Today" : formatDateDisplay(noteDate);
  renderPinnedNotes(state);
}

/* Wire all note event listeners once. `save` and `setTab` are injected to avoid
   importing from app.js (circular dep). */
let _notesInited = false;
export function initNotes(state, save, setTab) {
  if (_notesInited) return; _notesInited = true;
  if ($("noteEditor")) {
    $("noteEditor").addEventListener("input", e => {
      if (!state.notes) state.notes = {};
      state.notes[noteDate] = e.target.value;
      const sn = $("savedNotepad"); if (sn) sn.textContent = "Saved";
      clearTimeout(noteDate._saveTimer);
      noteDate._saveTimer = setTimeout(() => save(), 800);
    });
  }
  if ($("pinNoteBtn")) {
    $("pinNoteBtn").onclick = () => {
      if (!state.pinnedNotes) state.pinnedNotes = [];
      if (!state.notes[noteDate]) return;
      if (!state.pinnedNotes.includes(noteDate)) state.pinnedNotes.unshift(noteDate);
      renderPinnedNotes(state); save();
    };
  }
  if ($("notePrevDay")) {
    $("notePrevDay").onclick = () => {
      const d = new Date(noteDate+"T00:00:00"); d.setDate(d.getDate()-1);
      noteDate = getLocalYMD(d); renderNotes(state);
    };
  }
  if ($("noteNextDay")) {
    $("noteNextDay").onclick = () => {
      const d = new Date(noteDate+"T00:00:00"); d.setDate(d.getDate()+1);
      noteDate = getLocalYMD(d); renderNotes(state);
    };
  }
  document.addEventListener("click", e => {
    if (e.target.dataset.delpinned !== undefined) {
      state.pinnedNotes = (state.pinnedNotes||[]).filter(d => d !== e.target.dataset.delpinned);
      renderPinnedNotes(state); save(); return;
    }
    const pin = e.target.closest(".note-pin-item[data-pinneddate]");
    if (pin && !e.target.dataset.delpinned) {
      noteDate = pin.dataset.pinneddate; renderNotes(state); setTab("notes");
    }
  });
}
