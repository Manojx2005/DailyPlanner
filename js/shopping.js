"use strict";
/* ---------- shopping (yen + Japan consumption tax) ----------
   Pure module: no DOM access. Japan's reduced rate is 8% on food/drink,
   10% on everything else (alcohol, household goods, etc.). */

const TAX={food:0.08,other:0.10};

export const yen=n=>"¥"+Math.round(n).toLocaleString("ja-JP");

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
    lines.push(`${it.got?"[x]":"[ ]"} ${it.name||"(item)"}  ${qty}×¥${price.toLocaleString("ja-JP")} = ¥${Math.round(line).toLocaleString("ja-JP")}  ${it.cat==="food"?"food 8%":"other 10%"}`);
  }
  lines.push("",`Subtotal 税抜: ${yen(c.subtotal)}`,`Tax 8% (food): ${yen(c.tax8)}`,`Tax 10% (other): ${yen(c.tax10)}`,`TOTAL 税込: ${yen(c.total)}`);
  if(c.left>0&&Math.round(c.left)!==Math.round(c.total))lines.push(`Still to buy: ${yen(c.left)}`);
  return lines.join("\n");
}
