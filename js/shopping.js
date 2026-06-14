"use strict";
/* ---------- shopping (yen + Japan consumption tax) ----------
   Pure module: no DOM access. Japan's reduced rate is 8% on food/drink,
   10% on everything else (alcohol, household goods, etc.). */

import { getLang, t, getCurrency } from "./i18n.js?v=1.6";

const TAX={food:0.08,other:0.10};

/* ---- currency conversion ----
   All money is stored in JPY (the app's base currency). These convert to the
   currently-selected display currency. Rates are approximate units-per-1-JPY;
   for "¥" the rate is 1 so toDisplay/fromDisplay are identity (no behaviour
   change for yen users). Static rates keep us CSP-safe (no live FX fetch). */
const RATES={ "¥":1, "$":0.0064, "€":0.0059, "£":0.0051, "₹":0.55, "Rp":104, "₫":166 };
const DEC  ={ "¥":0, "$":2,      "€":2,      "£":2,      "₹":0,    "Rp":0,  "₫":0   };
const rate = ()=>RATES[getCurrency()] ?? 1;
const dec  = ()=>DEC[getCurrency()] ?? 0;

/* JPY → selected-currency numeric value */
export const toDisplay = jpy => (Number(jpy)||0) * rate();
/* selected-currency value → JPY (integer, the stored base) */
export const fromDisplay = val => Math.round((Number(val)||0) / rate());
/* JPY → a clean number for an input field (rounded to the currency's decimals) */
export const displayAmount = jpy => { const v=toDisplay(jpy); const d=dec(); return d? Number(v.toFixed(d)) : Math.round(v); };

export const yen = n => {
  const d=dec();
  const loc=getLang()==="ja"?"ja-JP":"en-US";
  return getCurrency() + toDisplay(n).toLocaleString(loc,{minimumFractionDigits:d,maximumFractionDigits:d});
};

export function calcShopping(s){
  let preFood=0,preOther=0,inclFood=0,inclOther=0,left=0,count=0;
  for(const it of s.items){
    const qty=Number(it.qty)||0,price=Number(it.price)||0,line=qty*price;
    if(!it.name&&!line)continue;
    count++;
    const r=TAX[it.cat]||0.10;
    let pre,incl;
    if(s.taxMode==="incl"){incl=line;pre=line/(1+r);}else{pre=line;incl=line*(1+r);}
    if(it.cat==="food"){preFood+=pre;inclFood+=incl;}else{preOther+=pre;inclOther+=incl;}
    if(!it.got)left+=incl;
  }
  return{subtotal:preFood+preOther,tax8:inclFood-preFood,tax10:inclOther-preOther,total:inclFood+inclOther,left,count};
}

/* Plain-text list. `shop` is passed in explicitly (taxMode + items),
   `c` is the result of calcShopping(shop). */
export function shopText(shop,c){
  const lines=["SHOPPING LIST  (entered "+(shop.taxMode==="incl"?"tax-included 税込":"tax-excluded 税抜")+")",""];
  for(const it of shop.items){
    const qty=Number(it.qty)||0,price=Number(it.price)||0,line=qty*price;
    if(!it.name&&!line)continue;
    lines.push(`${it.got?"[x]":"[ ]"} ${it.name||"(item)"}  ${qty}×${getCurrency()}${price.toLocaleString("ja-JP")} = ${getCurrency()}${Math.round(line).toLocaleString("ja-JP")}  ${it.cat==="food"?"food 8%":"other 10%"}`);
  }
  lines.push("",`Subtotal 税抜: ${yen(c.subtotal)}`,`Tax 8% (food): ${yen(c.tax8)}`,`Tax 10% (other): ${yen(c.tax10)}`,`TOTAL 税込: ${yen(c.total)}`);
  if(c.left>0&&Math.round(c.left)!==Math.round(c.total))lines.push(`Still to buy: ${yen(c.left)}`);
  return lines.join("\n");
}
