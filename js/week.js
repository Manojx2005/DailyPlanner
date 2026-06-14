"use strict";
/* ---------- weekly scheduler ----------
   Pure module. Reuses buildSchedule() (single-day gap engine) once per day,
   then distributes tasks across the next 7 days honouring each task's deadline.
   Classes/shifts recur via a `days` array of weekday indices (0=Sun … 6=Sat). */

import { buildSchedule } from "./schedule.js?v=1.6";

export const DOW=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MIN_CHUNK=25, SPLITTABLE=new Set(["study","project"]), PRIORITY_W={high:3,med:2,low:1};

function mk(t,start,end){return {label:t.label,category:t.category,priority:t.priority,start,end,goal:t.goal};}

export function buildWeek(state,todayDow){
  // 1. Build each day's immovable blocks + free gaps (no tasks yet).
  const days=[];
  for(let i=0;i<7;i++){
    const dow=(todayDow+i)%7;
    const fixedToday=(state.fixed||[]).filter(f=>!f.days||!f.days.length||f.days.includes(dow));
    const skipsMeals=fixedToday.some(f=>f.skipMeals);
    const mealsToday=skipsMeals ? [] : (state.meals||[]).map(m => {
      const isCook = !m.days ? true : m.days.includes(dow);
      return isCook ? m : { ...m, dur: Math.min(Number(m.dur), 15), label: m.label + " (Reheat)" };
    });
    const r=buildSchedule({wake:state.wake,sleep:state.sleep,fixed:fixedToday,meals:mealsToday,tasks:[]});
    days.push({i,dow,name:DOW[dow],wake:r.wake,sleep:r.sleep,
      immovable:r.timeline.filter(b=>b.type==="fixed"||b.type==="meal"),
      gaps:r.gaps.map(g=>({start:g.start,end:g.end,cur:g.cur})),
      free:r.summary.totalFree,placed:[],warnings:r.warnings});
  }

  // 2a. Goals become splittable, top-priority study blocks spread over the week.
  const goalTasks=(state.goals||[]).filter(g=>g.name&&Number(g.hoursPerWeek)>0).map(g=>({
    label:g.name,dur:Math.round(Number(g.hoursPerWeek)*60),category:"study",priority:"high",
    deadlineDays:6,goal:g.name,score:1e4}));   // 1e4 = above any real task → goals get time first

  // 2b. Rank real tasks (same scoring as the day engine), goals always lead.
  const realTasks=(state.tasks||[]).filter(t=>t.label&&t.dur>0).map(t=>{
    const dd=t.deadlineDays==null||t.deadlineDays===""?14:Number(t.deadlineDays);
    const pw=PRIORITY_W[t.priority]||2;
    return {...t,dur:Number(t.dur),deadlineDays:dd,score:pw*100+Math.max(0,30-dd)};
  });
  const tasks=[...goalTasks,...realTasks].sort((a,b)=>b.score-a.score);

  const deferred=[],freeIn=g=>g.end-g.cur;
  for(const t of tasks){
    let rem=t.dur;const sp=SPLITTABLE.has(t.category);
    const lastDay=Math.min(6,t.deadlineDays);     // day 0 = today; can't schedule past the deadline
    for(let di=0;di<=lastDay&&rem>0;di++){
      const day=days[di];
      if(!sp){
        const g=day.gaps.find(g=>freeIn(g)>=rem);
        if(g){const start=g.cur,end=g.cur+rem;g.cur=end;day.placed.push(mk(t,start,end));rem=0;}
      }else{
        for(const g of day.gaps){
          if(rem<=0)break;
          const av=freeIn(g);
          if(av<MIN_CHUNK&&av<rem)continue;
          const len=Math.min(av,rem);
          if(len<MIN_CHUNK&&rem>MIN_CHUNK)continue;
          const start=g.cur,end=g.cur+len;g.cur=end;day.placed.push(mk(t,start,end));rem-=len;
        }
      }
    }
    if(rem>0)deferred.push({label:t.label,minutes:rem,
      reason:sp?"not enough open time this week":"no single block fits before its deadline"});
  }

  // 3. Assemble each day's timeline (immovable + placed tasks + leftover free).
  for(const day of days){
    const tl=[...day.immovable];
    for(const p of day.placed)tl.push({...p,type:"task"});
    for(const g of day.gaps)if(g.cur<g.end)tl.push({type:"free",label:"Free",start:g.cur,end:g.end});
    tl.sort((a,b)=>a.start-b.start||a.end-b.end);
    day.timeline=tl;
    day.scheduled=day.placed.reduce((a,p)=>a+(p.end-p.start),0);
  }

  // Per-goal: how much of its weekly target actually got scheduled.
  const goalProgress=goalTasks.map(g=>{
    let got=0;for(const day of days)for(const p of day.placed)if(p.goal===g.label)got+=p.end-p.start;
    return {name:g.label,target:g.dur,scheduled:got};
  });

  const requested=tasks.reduce((a,t)=>a+t.dur,0);
  const scheduled=days.reduce((a,d)=>a+d.scheduled,0);
  const totalFree=days.reduce((a,d)=>a+d.free,0);
  return {days,deferred,goalProgress,summary:{requested,scheduled,totalFree,
    deficit:Math.max(0,requested-scheduled),fits:deferred.length===0}};
}
