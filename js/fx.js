"use strict";
/* ---------- motion fx (pure, no deps) ----------
   Staggered card entrance when a tab opens.
   All guarded by reduced-motion. */

const reduce=()=>window.matchMedia&&matchMedia("(prefers-reduced-motion:reduce)").matches;

/* Re-play a staggered fade-up on the cards of a freshly shown panel. */
export function staggerCards(panel){
  if(!panel||reduce())return;
  panel.querySelectorAll(".card").forEach((c,i)=>{
    c.style.animation="none";
    void c.offsetWidth;                      // force reflow so the animation re-fires
    c.style.animation=`cardIn .5s cubic-bezier(.22,1,.36,1) ${(i*0.06).toFixed(2)}s both`;
  });
}
