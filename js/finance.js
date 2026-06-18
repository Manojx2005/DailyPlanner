"use strict";
/* ---------- finance engine ----------
   Pure module: no DOM, no currency formatting — returns plain numbers.

   Master rule (corrected from the naive formula):
     Net Savings = Income + InitialBalance − Σ(every expense, counted ONCE)
   A purchase is subtracted once. Its `paidBy` only decides which balance it
   drains (cash → account, card name → that card's debt). Card spend is DERIVED
   by summing the purchases that point at the card, never added a second time. */

const num=v=>Number(v)||0;
const sum=(arr,key)=>(arr||[]).reduce((a,x)=>a+num(x[key]),0);

export function computeFinance(f){
  const income      = sum(f.income,"amount");
  const initial     = num(f.initialBalance);
  const expenseTot  = sum(f.expenses,"amount");
  const totalSpend  = expenseTot;
  const net         = income + initial - totalSpend;

  // Tally spend per payer ("cash" or a card name).
  const byPayer={};
  const add=(payer,amt)=>{const p=payer||"cash";byPayer[p]=(byPayer[p]||0)+amt;};
  for(const e of f.expenses||[]) add(e.paidBy,num(e.amount));

  const cashSpend  = byPayer.cash||0;
  const cashOnHand = initial + income - cashSpend;       // what's left in the bank/wallet

  const cards=(f.cards||[]).map(c=>{
    const spend=byPayer[c.name]||0, limit=num(c.limit);
    return {name:c.name, spend, limit, util:limit>0?spend/limit:0};
  });
  const cardDebt=cards.reduce((a,c)=>a+c.spend,0);
  const savingsRate=income>0?net/income:0;               // fraction of income kept

  return {income,initial,expenseTot,totalSpend,net,cashSpend,cashOnHand,
          cards,cardDebt,savingsRate,
          counts:{expenses:(f.expenses||[]).length}};
}

/* ---------- financial health verdict ----------
   Turns the computed summary into a {cls, msg} the dashboard colour-codes,
   mirroring the schedule tab's ok/over verdict.

   YOUR CALL (learning slot): the thresholds below are a personal-finance
   judgement, not a fact. What savings rate feels "healthy" to you? When should
   a maxed-out card sound the alarm? Tune the numbers — signature is fixed.

   @param {object} s  result of computeFinance()
   @returns {{cls:"ok"|"warn"|"bad", msg:string}}  cls drives the colour. */
export function financeVerdict(s){
  const pct=Math.round(s.savingsRate*100);
  const maxUtil=s.cards.reduce((m,c)=>Math.max(m,c.util),0);

  // TODO(you): adjust these four thresholds to your own targets.
  const SAVE_GOOD=0.20;   // ≥20% of income saved → healthy
  const SAVE_OK=0;        // ≥break-even → getting by
  const CARD_WARN=0.50;   // card ≥50% utilised → caution
  const CARD_BAD=0.90;    // card ≥90% utilised → danger

  if(s.net<0)            return {cls:"bad",  msg:`Spending exceeds income — short by the gap. Trim variable expenses.`};
  if(maxUtil>=CARD_BAD)  return {cls:"bad",  msg:`A card is ${Math.round(maxUtil*100)}% maxed — pay it down before new spend.`};
  if(maxUtil>=CARD_WARN) return {cls:"warn", msg:`Card use at ${Math.round(maxUtil*100)}%. On track otherwise, saving ${pct}%.`};
  if(s.savingsRate>=SAVE_GOOD) return {cls:"ok",  msg:`Healthy — keeping ${pct}% of income.`};
  if(s.savingsRate>=SAVE_OK)   return {cls:"warn",msg:`Break-even-ish, saving ${pct}%. Room to push higher.`};
  return {cls:"bad", msg:`Saving only ${pct}% — costs are eating most of your income.`};
}

/* Plain-text export, mirroring asText()/shopText(). yen() is injected so this
   module stays currency-formatter-agnostic. */
export function financeText(f,s,yen){
  const L=[`FINANCE  ·  Net savings ${yen(s.net)}`,""];
  L.push(`Income:          ${yen(s.income)}`);
  L.push(`Initial balance: ${yen(s.initial)}`);
  L.push(`Total spend:     ${yen(s.totalSpend)}`);
  L.push(`Cash on hand:    ${yen(s.cashOnHand)}`,"");
  if(s.cards.length){L.push("Cards:");for(const c of s.cards)L.push(`  ${c.name}: ${yen(c.spend)} / ${yen(c.limit)}  (${Math.round(c.util*100)}%)`);L.push("");}
  return L.join("\n");
}
