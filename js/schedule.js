"use strict";
/* ---------- scheduling engine (verified) ----------
   Pure module: no DOM access. Takes a plain config object and returns
   plain data, so the whole engine is unit-testable in isolation. */

const PRIORITY_W={high:3,med:2,low:1}, MIN_CHUNK=25, SPLITTABLE=new Set(["study","project"]);

export const toMin=s=>{const[h,m]=s.split(":").map(Number);return h*60+m;};
export const toHHMM=min=>{min=((min%1440)+1440)%1440;const h=Math.floor(min/60),m=min%60;return String(h).padStart(2,"0")+":"+String(m).padStart(2,"0");};
export const fmtDur=min=>{if(min<=0)return"0m";const h=Math.floor(min/60),m=min%60;let s=(h?h+"h":"")+(m?(h?" ":"")+m+"m":"");return s||"0m";};

function union(iv){const s=iv.slice().sort((a,b)=>a.start-b.start),o=[];for(const i of s){if(o.length&&i.start<=o[o.length-1].end)o[o.length-1].end=Math.max(o[o.length-1].end,i.end);else o.push({start:i.start,end:i.end});}return o;}

export function buildSchedule(cfg){
  const wake=toMin(cfg.wake),sleep=toMin(cfg.sleep),warnings=[];
  const immovable=[];
  for(const f of cfg.fixed||[]){if(!f.label||!f.start||!f.end)continue;const s=toMin(f.start),e=toMin(f.end);if(e<=s){warnings.push(`"${f.label}" ends before it starts — skipped.`);continue;}immovable.push({kind:"fixed",label:f.label,start:s,end:e});}
  for(const m of cfg.meals||[]){if(!m.label||!m.time||!m.dur)continue;const s=toMin(m.time);immovable.push({kind:"meal",label:m.label,start:s,end:s+Number(m.dur)});}
  const srt=immovable.slice().sort((a,b)=>a.start-b.start);
  for(let i=1;i<srt.length;i++)if(srt[i].start<srt[i-1].end)warnings.push(`"${srt[i-1].label}" and "${srt[i].label}" overlap.`);
  const busy=union(immovable.map(b=>({start:Math.max(b.start,wake),end:Math.min(b.end,sleep)})).filter(i=>i.end>i.start));
  const gaps=[];let cur=wake;
  for(const b of busy){if(b.start>cur)gaps.push({start:cur,end:b.start,cur});cur=Math.max(cur,b.end);}
  if(cur<sleep)gaps.push({start:cur,end:sleep,cur});
  const totalFree=gaps.reduce((a,g)=>a+(g.end-g.start),0);
  const tasks=(cfg.tasks||[]).filter(t=>t.label&&t.dur>0).map(t=>{const dd=t.deadlineDays==null||t.deadlineDays===""?14:Number(t.deadlineDays);const pw=PRIORITY_W[t.priority]||2;return{...t,dur:Number(t.dur),deadlineDays:dd,score:pw*100+Math.max(0,30-dd)};}).sort((a,b)=>b.score-a.score);
  const placed=[],deferred=[],freeIn=g=>g.end-g.cur;
  for(const t of tasks){
    let rem=t.dur;const sp=SPLITTABLE.has(t.category);const chunks=[];
    if(!sp){const g=gaps.find(g=>freeIn(g)>=rem);if(g){chunks.push({g,len:rem});rem=0;}}
    else{for(const g of gaps){if(rem<=0)break;const av=freeIn(g);if(av<MIN_CHUNK&&av<rem)continue;const len=Math.min(av,rem);if(len<MIN_CHUNK&&rem>MIN_CHUNK)continue;chunks.push({g,len});rem-=len;}}
    if(rem>0){deferred.push({label:t.label,minutes:rem,reason:sp?"not enough open time":"no single block fits it"});if(!sp)continue;}
    chunks.forEach((c,i)=>{const start=c.g.cur,end=c.g.cur+c.len;c.g.cur=end;placed.push({label:t.label,category:t.category,priority:t.priority,start,end,part:i+1,parts:chunks.length,deadlineDays:t.deadlineDays});});
  }
  const timeline=[];
  for(const b of immovable)timeline.push({...b,type:b.kind});
  for(const p of placed)timeline.push({...p,type:"task"});
  for(const g of gaps)if(g.cur<g.end)timeline.push({type:"free",label:"Free",start:g.cur,end:g.end});
  timeline.sort((a,b)=>a.start-b.start||a.end-b.end);
  const requested=tasks.reduce((a,t)=>a+t.dur,0),scheduled=placed.reduce((a,p)=>a+(p.end-p.start),0);
  const mu=tasks.length?tasks.slice().sort((a,b)=>a.deadlineDays-b.deadlineDays||b.score-a.score)[0]:null;
  return{wake,sleep,timeline,placed,deferred,gaps,warnings,summary:{totalFree,requested,scheduled,deficit:Math.max(0,requested-scheduled),fits:deferred.length===0,mostUrgent:mu?{label:mu.label,days:mu.deadlineDays}:null}};
}

/* Plain-text plan (same shape the skill produces). Pure formatter. */
export function asText(r){
  const lines=[`DAY PLAN  (${toHHMM(r.wake)}–${toHHMM(r.sleep)})`,""];
  for(const b of r.timeline){
    const tag=b.type==="task"?b.category.toUpperCase():b.type.toUpperCase();
    const part=b.parts>1?` (${b.part}/${b.parts})`:"";
    lines.push(`${toHHMM(b.start)}–${toHHMM(b.end)}  ${b.label}${part}  [${tag}]`);
  }
  lines.push("",`Free time: ${fmtDur(r.summary.totalFree)} | Requested: ${fmtDur(r.summary.requested)} | Scheduled: ${fmtDur(r.summary.scheduled)}`);
  if(r.summary.fits)lines.push("Everything fits.");
  else{lines.push(`OVER by ${fmtDur(r.summary.deficit)}. Didn't fit:`);r.deferred.forEach(d=>lines.push(`  - ${d.label}: ${fmtDur(d.minutes)} (${d.reason})`));}
  return lines.join("\n");
}
