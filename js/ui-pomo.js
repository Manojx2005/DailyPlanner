"use strict";
/* ---------- Pomodoro timer controller ---------- */

import { $ } from "./ui-utils.js?v=1.0";

const POMO_FOCUS = 25*60, POMO_BREAK = 5*60;
let _pomo = { phase:"focus", remaining:POMO_FOCUS, sessions:0, timer:null, total:POMO_FOCUS };

export function updatePomoDisplay() {
  const disp = $("pomoDisplay"); if (!disp) return;
  const m = Math.floor(_pomo.remaining/60), s = _pomo.remaining%60;
  disp.textContent = `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  disp.className = "pomo-display"+(_pomo.timer ? (_pomo.phase==="break"?" break":" running") : "");
  const lbl = $("pomoLabel"); if (lbl) lbl.textContent = _pomo.phase==="break" ? "Break ☕" : "Focus";
  const cnt = $("pomoCount"); if (cnt) cnt.textContent = `${_pomo.sessions} session${_pomo.sessions!==1?"s":""}`;
  const bar = $("pomoBar");
  if (bar) {
    const pct = (_pomo.total-_pomo.remaining)/_pomo.total*100;
    bar.style.width = pct+"%";
    bar.className = "pomo-progress-bar"+(_pomo.phase==="break"?" break":"");
  }
  const startBtn = $("pomoStart");
  if (startBtn) startBtn.textContent = _pomo.timer ? "⏸ Pause" : "▶ Start";
  document.title = _pomo.timer ? `${disp.textContent} — Day Planner` : "Day Planner";
}

function pomoTick() {
  _pomo.remaining--;
  if (_pomo.remaining <= 0) {
    clearInterval(_pomo.timer); _pomo.timer = null;
    if (_pomo.phase === "focus") {
      _pomo.sessions++;
      _pomo.phase = "break"; _pomo.remaining = POMO_BREAK; _pomo.total = POMO_BREAK;
      if (Notification.permission === "granted")
        new Notification("Break time! ☕", { body:"Focus session complete. Take 5 minutes.", icon:"./icon.svg" });
    } else {
      _pomo.phase = "focus"; _pomo.remaining = POMO_FOCUS; _pomo.total = POMO_FOCUS;
      if (Notification.permission === "granted")
        new Notification("Back to focus! 🎯", { body:"Break is over. Let's go!", icon:"./icon.svg" });
    }
  }
  updatePomoDisplay();
}

let _pomoInited = false;
export function initPomo() {
  if (_pomoInited) return; _pomoInited = true;
  if ($("pomoStart")) {
    $("pomoStart").onclick = () => {
      if (_pomo.timer) { clearInterval(_pomo.timer); _pomo.timer = null; }
      else { _pomo.timer = setInterval(pomoTick, 1000); }
      updatePomoDisplay();
    };
  }
  if ($("pomoReset")) {
    $("pomoReset").onclick = () => {
      if (_pomo.timer) { clearInterval(_pomo.timer); _pomo.timer = null; }
      _pomo = { phase:"focus", remaining:POMO_FOCUS, sessions:_pomo.sessions, timer:null, total:POMO_FOCUS };
      updatePomoDisplay();
      document.title = "Day Planner";
    };
  }
}
