// MONEY. Supabase stores the ledger; this browser only displays it.
(function(){
'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const CATEGORIES=['Food & drink','Groceries','Transport','Shopping','Subscriptions','Bills & utilities','Housing','Health','Entertainment','Travel','Other'];
const COLORS=['#3987e5','#d95926','#199e70','#c98500','#d55181','#008300','#9085e9','#e66767'];
const PAGE=1000;
const currency=new Intl.NumberFormat([], {style:'currency',currency:guessCurrency(),maximumFractionDigits:2});
function guessCurrency(){ try{ const r=Intl.DateTimeFormat().resolvedOptions().locale||''; if(/-(GB)$/i.test(r))return 'GBP'; if(/-(DE|FR|ES|IT|NL|AT|BE|FI|IE|PT)$/i.test(r))return 'EUR'; if(/-(CH)$/i.test(r))return 'CHF'; if(/-(CA)$/i.test(r))return 'CAD'; if(/-(AU)$/i.test(r))return 'AUD'; }catch{} return 'USD'; }
const money=n=>currency.format(Number(n)||0);
const wholeCurrency=new Intl.NumberFormat([], {style:'currency',currency:currency.resolvedOptions().currency,maximumFractionDigits:0});
const whole=n=>wholeCurrency.format(Math.round(Number(n)||0));
const axisLabel=n=>currency.format(Math.round(n)).replace(/[.,]00$/,'');
const money0=n=>{ const v=Number(n)||0; return Math.abs(v)>=1000? currency.format(Math.round(v)).replace(/\.00$/,'') : currency.format(v); };
const isoDay=d=>{ const x=new Date(d); return new Date(x.getTime()-x.getTimezoneOffset()*60000).toISOString().slice(0,10); };
const today=()=>isoDay(new Date());
const parseDay=s=>{ const [y,m,d]=s.split('-').map(Number); return new Date(y,m-1,d); };
const addDays=(s,n)=>isoDay(new Date(parseDay(s).getTime()+n*86400000+3600000*6));
const shortDate=s=>parseDay(s).toLocaleDateString([], {month:'short',day:'numeric'});
const longDate=s=>parseDay(s).toLocaleDateString([], {weekday:'short',month:'short',day:'numeric',year:'numeric'});
const monthly=s=>s.cadence==='yearly'?s.amount/12:s.cadence==='weekly'?s.amount*52/12:Number(s.amount);

let client=null,user=null,busy=false,authSub=null,connecting=null,storageCleanup=null;
let tx=[],subs=[],range='30',colorOf=new Map(),loadId=0;
let profile=null,profileReady=true,budgetBusy=false,debts=[],debtsReady=true;

function message(id,text,kind=''){ $(id).textContent=text; $(id).className='message'+(kind?' '+kind:''); }
function fillCategories(){ for(const id of ['tx-category','sub-category']) $(id).innerHTML=CATEGORIES.map(c=>`<option>${esc(c)}</option>`).join(''); $('sub-category').value='Subscriptions'; }
fillCategories();

// ---- connection: the two public Supabase settings come from /api/config ----
function projectConfig(v){ const url=typeof v?.url==='string'?v.url.trim().replace(/\/$/,''):'', key=typeof v?.key==='string'?v.key.trim():''; if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)||!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) throw new Error('This page needs its Supabase connection set up in Vercel.'); if(typeof v?.home==='string'&&/^https?:\/\//.test(v.home)) document.getElementById('home-link').href=v.home; return {url,key}; }
// The house button goes to the YOU hub. Its address comes from URL_HOME in Vercel.
(function(){ const a=document.getElementById('home-link'); if(!a)return; a.addEventListener('click',e=>{ if(a.getAttribute('href')==='#'){ e.preventDefault(); alert('Set URL_HOME in this project\'s Vercel environment variables to your YOU hub address, then redeploy.'); } }); })();
async function connect(){
  if(client)return client; if(connecting)return connecting;
  connecting=(async()=>{ let r; try{ r=await fetch('/api/config',{cache:'no-store'}); }catch{ throw new Error('Could not connect. Check your internet connection and try again.'); }
    if(!r.ok) throw new Error('This page needs its Supabase connection set up in Vercel.'); return makeClient(projectConfig(await r.json())); })();
  try{ return await connecting; } finally{ connecting=null; }
}
function makeClient(config){
  if(!window.supabase) throw new Error('The connection library could not load. Reload the page.');
  const storageKey='money.auth.'+new URL(config.url).hostname;
  const storage=window.localStorage;
  authSub?.unsubscribe(); client?.auth.stopAutoRefresh(); storageCleanup?.();
  client=supabase.createClient(config.url,config.key,{auth:{storage,storageKey,persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
  const mine=client;
  authSub=client.auth.onAuthStateChange((_e,session)=>{ setTimeout(()=>{ if(client!==mine)return; setUser(session&&storage.getItem(storageKey)?session.user:null); },0); }).data.subscription;
  const changed=e=>{ if(client===mine&&e.storageArea===storage&&(e.key===storageKey||e.key===null)&&e.newValue===null)setUser(null); };
  window.addEventListener('storage',changed); storageCleanup=()=>window.removeEventListener('storage',changed);
  return client;
}
function setUser(next){
  if(next?.id===user?.id)return;
  user=next; loadId++;
  for(const id of ['connect-open']) $(id).hidden=!!user;
  for(const id of ['sign-out','add-open','add-open-2','sub-open','csv-tx','csv-subs']) $(id).hidden=!user;
  $('tx-fields').disabled=!user; $('sub-fields').disabled=!user; $('fin-fields').disabled=!user; $('debt-fields').disabled=!user; $('pay-fields').disabled=!user;
  $('connection-status').textContent=user?'Connected':'Your record'; $('connection-status').classList.toggle('connected',!!user);
  if(!user){ tx=[]; subs=[]; profile=null; debts=[]; for(const d of ['fin-dialog','debt-dialog','pay-dialog']) $(d).close(); render(); $('tx').innerHTML='<p class="row-empty">Sign in to see your spending.</p>'; $('subs').innerHTML='<p class="row-empty">Sign in to see your subscriptions.</p>'; $('tx-dialog').close(); $('sub-dialog').close(); }
  else load();
  window.coachUser?.(user?.id);
}
$('connect-open').onclick=()=>{ $('connection-dialog').showModal(); $('email').focus(); };
$('connect-close').onclick=()=>{ if(!busy)$('connection-dialog').close(); };
$('connect-form').addEventListener('submit',async e=>{
  e.preventDefault(); if(busy)return; busy=true; $('connect-submit').disabled=true; message('connect-message','Signing in…');
  try{ const db=await connect(); const {data,error}=await db.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value}); if(error)throw error; $('password').value=''; setUser(data.user); $('connection-dialog').close(); message('connect-message',''); }
  catch(err){ message('connect-message',err.message||'Could not sign in.','error'); }
  finally{ busy=false; $('connect-submit').disabled=false; }
});
$('sign-out').onclick=async()=>{ if(!client||busy)return; busy=true; try{ const {error}=await client.auth.signOut({scope:'local'}); if(error)throw error; setUser(null); }catch(err){ message('history-message',err.message,'error'); } finally{ busy=false; } };

// ---- reading all of it, and never some of it ----
async function readAll(make){ const all=[]; let from=0; for(;;){ const {data,error,count}=await make().range(from,from+PAGE-1); if(error)throw error; all.push(...data); from+=data.length; if(from>=count||!data.length)return all; } }
async function load(){
  const id=++loadId; message('history-message','');
  try{
    const db=await connect();
    const [t,s]=await Promise.all([
      readAll(()=>db.from('transactions').select('*',{count:'exact'}).order('occurred_on',{ascending:false}).order('created_at',{ascending:false})),
      readAll(()=>db.from('subscriptions').select('*',{count:'exact'}).order('active',{ascending:false}).order('next_charge',{ascending:true,nullsFirst:false}))
    ]);
    if(id!==loadId)return;
    tx=t.map(r=>({...r,amount:Number(r.amount)})); subs=s.map(r=>({...r,amount:Number(r.amount)}));
    // Your numbers and budget are optional (budget.sql): without that table the rest of MONEY works as before.
    try{ const {data,error}=await db.from('money_profile').select('*').maybeSingle(); if(error)throw error; if(id!==loadId)return; profile=data?normProfile(data):null; profileReady=true; }
    catch(err){ if(id!==loadId)return; profile=null; profileReady=!/relation .* does not exist|schema cache/i.test(err.message||''); if(profileReady) message('budget-message',err.message||'Could not load your numbers.','error'); }
    // Your debts list is optional too (debts.sql).
    try{ const d=await readAll(()=>db.from('debts').select('*',{count:'exact'}).order('created_at')); if(id!==loadId)return; debts=d.map(r=>({...r,balance:Number(r.balance),apr:numOrNull(r.apr),min_payment:numOrNull(r.min_payment)})); debtsReady=true; }
    catch(err){ if(id!==loadId)return; debts=[]; debtsReady=!/relation .* does not exist|schema cache/i.test(err.message||''); if(debtsReady) message('debt-message',err.message||'Could not load your debts.','error'); }
    render();
  }catch(err){ if(id!==loadId)return; const missing=/relation .* does not exist|schema cache/i.test(err.message||''); message('history-message',missing?'Run setup.sql in your Supabase SQL editor once, then reload.':(err.message||'Could not load your spending.'),'error'); }
}

// ---- derived numbers ----
function windowDays(){ const end=today(); if(range==='month'){ const start=end.slice(0,8)+'01'; return {start,end}; } return {start:addDays(end,-(Number(range)-1)),end}; }
function inWindow(r,w){ return r.occurred_on>=w.start&&r.occurred_on<=w.end; }
function byDay(rows,w){ const m=new Map(); for(let d=w.start; d<=w.end; d=addDays(d,1)) m.set(d,0); for(const r of rows) if(m.has(r.occurred_on)) m.set(r.occurred_on,m.get(r.occurred_on)+r.amount); return [...m].map(([day,total])=>({day,total})); }
function byCategory(rows){ const m=new Map(); for(const r of rows) m.set(r.category,(m.get(r.category)||0)+r.amount); const list=[...m].map(([name,total])=>({name,total})).sort((a,b)=>b.total-a.total); if(list.length>8){ const rest=list.splice(7); list.push({name:'Other',total:rest.reduce((a,b)=>a+b.total,0)}); } return list; }
// Color follows the category, never its rank: assigned once in first-seen order and kept.
function colorFor(name){ if(!colorOf.has(name)) colorOf.set(name,COLORS[colorOf.size%COLORS.length]); return colorOf.get(name); }

function render(){
  const w=windowDays(), rows=tx.filter(r=>inWindow(r,w));
  const monthStart=today().slice(0,8)+'01', monthRows=tx.filter(r=>r.occurred_on>=monthStart&&r.occurred_on<=today());
  const monthTotal=monthRows.reduce((a,r)=>a+r.amount,0);
  const todayTotal=tx.filter(r=>r.occurred_on===today()).reduce((a,r)=>a+r.amount,0);
  const last30=byDay(tx.filter(r=>inWindow(r,{start:addDays(today(),-29),end:today()})),{start:addDays(today(),-29),end:today()});
  const avg=last30.reduce((a,d)=>a+d.total,0)/30;
  const subMonthly=subs.filter(s=>s.active).reduce((a,s)=>a+monthly(s),0);
  const cats=byCategory(rows);
  $('month-total').textContent=tx.length?money0(monthTotal):'—';
  $('month-note').textContent=tx.length?`${monthRows.length} expense${monthRows.length===1?'':'s'} since ${shortDate(monthStart)}`:'Your first expense starts here.';
  $('side-month').textContent=tx.length?money0(monthTotal):'—'; $('side-sub').textContent=subs.length?money0(subMonthly):'—';
  $('tile-today').textContent=tx.length?money0(todayTotal):'—'; $('tile-today-note').textContent=longDate(today());
  $('tile-avg').textContent=tx.length?money0(avg):'—';
  $('tile-subs').textContent=subs.length?money0(subMonthly):'—'; $('tile-subs-note').textContent=`${subs.filter(s=>s.active).length} active · per month`;
  $('tile-cat').textContent=cats[0]?cats[0].name:'—'; $('tile-cat-note').textContent=cats[0]?`${money0(cats[0].total)} in this range`:'';
  const label={7:'Last 7 days',30:'Last 30 days',90:'Last 90 days',month:'This month'}[range];
  $('line-sub').textContent=`${label} · ${money(rows.reduce((a,r)=>a+r.amount,0))} total`; $('pie-sub').textContent=`${label} · ${cats.length} categor${cats.length===1?'y':'ies'}`;
  drawLine(byDay(rows,w)); drawDonut(cats); renderSubs(subMonthly); renderTx(); renderDue(); renderBudget(); renderDebts();
}

// ---- line: spend per day ----
let linePts=[];
function drawLine(days){
  const svg=$('line-plot'); const has=days.some(d=>d.total>0); $('line-empty').hidden=has; svg.hidden=!has; if(!has){ svg.innerHTML=''; return; }
  const W=700,H=260,L=56,R=16,T=16,B=34; const max=Math.max(...days.map(d=>d.total))*1.12||1;
  const x=i=>L+(days.length===1?(W-L-R)/2:i*(W-L-R)/(days.length-1)); const y=v=>T+(H-T-B)*(1-v/max);
  linePts=days.map((d,i)=>({...d,px:x(i),py:y(d.total)}));
  const path=linePts.map((p,i)=>`${i?'L':'M'}${p.px.toFixed(1)} ${p.py.toFixed(1)}`).join('');
  const area=`${path}L${linePts.at(-1).px.toFixed(1)} ${H-B}L${linePts[0].px.toFixed(1)} ${H-B}Z`;
  const ticks=[0,.5,1].map(f=>`<line class="grid" x1="${L}" x2="${W-R}" y1="${y(max*f)}" y2="${y(max*f)}"/><text x="${L-8}" y="${y(max*f)+4}" text-anchor="end">${esc(axisLabel(max*f))}</text>`).join('');
  const step=Math.ceil(days.length/6); const xl=linePts.filter((_,i)=>i%step===0||i===linePts.length-1).map(p=>`<text x="${p.px}" y="${H-10}" text-anchor="middle">${esc(shortDate(p.day))}</text>`).join('');
  const dots=linePts.length<=31?linePts.map(p=>`<circle cx="${p.px}" cy="${p.py}" r="${p.total>0?3.5:0}" fill="#8fe3b0" stroke="#080d0b" stroke-width="2"/>`).join(''):'';
  svg.innerHTML=`<defs><linearGradient id="wash" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fe3b0" stop-opacity=".18"/><stop offset="1" stop-color="#8fe3b0" stop-opacity="0"/></linearGradient></defs>${ticks}<line class="axis" x1="${L}" x2="${W-R}" y1="${H-B}" y2="${H-B}"/><path d="${area}" fill="url(#wash)"/><path d="${path}" fill="none" stroke="#8fe3b0" stroke-width="2" stroke-linejoin="round"/>${dots}${xl}<g id="line-focus"></g><rect class="hit" x="${L}" y="0" width="${W-L-R}" height="${H}"/>`;
}
function lineHover(e){
  if(!linePts.length)return; const svg=$('line-plot'), r=svg.getBoundingClientRect(); const mx=(e.clientX-r.left)/r.width*700;
  let best=linePts[0]; for(const p of linePts) if(Math.abs(p.px-mx)<Math.abs(best.px-mx)) best=p;
  $('line-focus').innerHTML=`<line x1="${best.px}" x2="${best.px}" y1="16" y2="226" stroke="#8fe3b0" stroke-opacity=".3"/><circle cx="${best.px}" cy="${best.py}" r="5" fill="#d2f8e2" stroke="#080d0b" stroke-width="2"/>`;
  const tip=$('line-tip'), card=$('line-card').getBoundingClientRect(); tip.innerHTML=`${esc(longDate(best.day))}<strong>${esc(money(best.total))}</strong>`; tip.classList.remove('hidden');
  tip.style.left=(r.left-card.left+best.px/700*r.width)+'px'; tip.style.top=(r.top-card.top+best.py/260*r.height)+'px';
}
function lineLeave(){ $('line-tip').classList.add('hidden'); const f=$('line-focus'); if(f)f.innerHTML=''; }
$('line-plot').addEventListener('pointermove',lineHover); tapToRead($('line-plot'),lineHover,lineLeave);

// ---- donut: by category ----
function drawDonut(cats){
  const svg=$('donut'), has=cats.length>0; $('pie-empty').hidden=has; $('donut-wrap').hidden=!has; if(!has){ svg.innerHTML=''; $('legend').innerHTML=''; return; }
  const total=cats.reduce((a,c)=>a+c.total,0); const C=75,Rr=66,ri=46; let a0=-Math.PI/2; const segs=[];
  for(const c of cats){ const a1=a0+(c.total/total)*Math.PI*2; segs.push({...c,a0,a1,color:colorFor(c.name),pct:c.total/total}); a0=a1; }
  const pt=(a,r)=>[C+r*Math.cos(a),C+r*Math.sin(a)];
  const arc=s=>{ if(s.pct>=.9999){ return `<circle cx="${C}" cy="${C}" r="${(Rr+ri)/2}" fill="none" stroke="${s.color}" stroke-width="${Rr-ri}"/>`; } const [x0,y0]=pt(s.a0,Rr),[x1,y1]=pt(s.a1,Rr),[x2,y2]=pt(s.a1,ri),[x3,y3]=pt(s.a0,ri); const big=s.a1-s.a0>Math.PI?1:0; return `<path d="M${x0} ${y0}A${Rr} ${Rr} 0 ${big} 1 ${x1} ${y1}L${x2} ${y2}A${ri} ${ri} 0 ${big} 0 ${x3} ${y3}Z" fill="${s.color}" stroke="#0b140f" stroke-width="2"/>`; };
  svg.innerHTML=segs.map((s,i)=>`<g data-seg="${i}">${arc(s)}</g>`).join('')+`<text class="donut-center" x="${C}" y="${C+7}" text-anchor="middle">${esc(money0(total))}</text>`;
  $('legend').innerHTML=segs.map((s,i)=>`<li data-seg="${i}"><i style="background:${s.color}"></i><span>${esc(s.name)}</span><b>${Math.round(s.pct*100)}%</b></li>`).join('');
  const tip=$('pie-tip'), card=$('pie-card');
  svg.querySelectorAll('[data-seg]').forEach(g=>{ const s=segs[g.dataset.seg];
    const show=e=>{ const cr=card.getBoundingClientRect(); tip.innerHTML=`${esc(s.name)}<strong>${esc(money(s.total))} · ${Math.round(s.pct*100)}%</strong>`; tip.classList.remove('hidden'); tip.style.left=(e.clientX-cr.left)+'px'; tip.style.top=(e.clientY-cr.top)+'px'; $('legend').querySelectorAll('li').forEach(li=>li.classList.toggle('dim',li.dataset.seg!==g.dataset.seg)); };
    const hide=()=>{ tip.classList.add('hidden'); $('legend').querySelectorAll('li').forEach(li=>li.classList.remove('dim')); };
    g.addEventListener('pointermove',show); tapToRead(g,show,hide,'donut');
  });
}

// ---- lists ----
function renderSubs(total){
  $('subs-total').innerHTML=subs.length?`<b>${esc(money(total))}</b> / month · ${esc(money(total*12))} / year`:'';
  if(!subs.length){ $('subs').innerHTML='<p class="row-empty">No subscriptions yet. Add Netflix, your gym, rent, anything on a schedule.</p>'; return; }
  const t=today();
  $('subs').innerHTML=subs.map(s=>{ const nd=nextDue(s); const due=!s.next_charge?'no date':!nd?`next ${shortDate(s.next_charge)}`:nd===t?`<span class="due">due today</span>`:`next ${shortDate(nd)}`;
    return `<div class="row" style="${s.active?'':'opacity:.5'}"><span class="dot" style="background:${colorFor(s.category)}"></span><div class="who"><b>${esc(s.name)}</b><small>${esc(s.category)} · ${esc(s.cadence)} · ${due}</small></div><span class="amt">${esc(money(s.amount))}</span><div class="ops"><button class="text-button" data-sub-edit="${s.id}" type="button">Edit</button><button class="text-button" data-sub-del="${s.id}" type="button">Remove</button></div></div>`; }).join('');
}
function renderTx(){
  $('tx-count').textContent=tx.length?`${tx.length} total`:'';
  if(!tx.length){ $('tx').innerHTML='<p class="row-empty">No expenses yet. Add your first one to start the graph.</p>'; return; }
  const shown=tx.slice(0,60);
  $('tx').innerHTML=shown.map(r=>`<div class="row"><span class="dot" style="background:${colorFor(r.category)}"></span><div class="who"><b>${esc(r.merchant||r.category)}</b><small>${esc(longDate(r.occurred_on))} · ${esc(r.category)}${r.note?' · '+esc(r.note):''}</small></div><span class="amt">${esc(money(r.amount))}</span><div class="ops"><button class="text-button" data-tx-edit="${r.id}" type="button">Edit</button><button class="text-button" data-tx-del="${r.id}" type="button">Delete</button></div></div>`).join('')+(tx.length>60?`<p class="row-empty">Showing the latest 60 of ${tx.length}.</p>`:'');
}


// Charts answer a tap as well as a hover: a touch pins the tooltip until you tap elsewhere.
// Marks in the same group share one tooltip, so moving between them swaps it instead of hiding it.
let lastPinned=null,lastGroup='';
function tapToRead(el,show,hide,group=''){
  let pinned=false;
  el.addEventListener('pointerdown',e=>{ show(e); pinned=e.pointerType!=='mouse'; if(pinned){ lastPinned=el; lastGroup=group; } });
  el.addEventListener('pointerleave',()=>{ if(!pinned) hide(); });
  document.addEventListener('pointerdown',e=>{ if(pinned&&!el.contains(e.target)){ pinned=false; if(!(group&&lastGroup===group&&lastPinned!==el&&lastPinned?.contains(e.target))) hide(); } });
}

// Download, or on a phone share, a CSV of your own rows.
async function exportCsv(name,header,rows){
  const q=v=>{ const s=String(v??''); return /[",\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s; };
  const csv=[header,...rows].map(r=>r.map(q).join(',')).join('\r\n');
  const blob=new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8'});
  try{ const file=new File([blob],name,{type:'text/csv'}); if(navigator.canShare&&navigator.canShare({files:[file]})){ await navigator.share({files:[file],title:name}); return; } }catch(err){ if(err?.name==='AbortError') return; }
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },1000);
}
$('csv-tx').onclick=()=>exportCsv('money-transactions.csv',['date','merchant','category','amount','note'],tx.map(r=>[r.occurred_on,r.merchant,r.category,r.amount,r.note]));
$('csv-subs').onclick=()=>exportCsv('money-subscriptions.csv',['name','amount','billed','category','next_charge','active','per_month'],subs.map(s=>[s.name,s.amount,s.cadence,s.category,s.next_charge||'',s.active?'yes':'no',Math.round(monthly(s)*100)/100]));
// ---- forms ----
function parseAmount(s){ const v=Number(String(s).replace(/[^0-9.,-]/g,'').replace(',','.')); if(!Number.isFinite(v)||v<0) throw new Error('Enter an amount like 12.50.'); return Math.round(v*100)/100; }
function openTx(row){ if(!user){ $('connection-dialog').showModal(); return; } $('tx-id').value=row?.id||''; $('tx-title').textContent=row?'Edit expense.':'Add expense.'; $('tx-amount').value=row?row.amount:''; $('tx-merchant').value=row?.merchant||''; $('tx-category').value=row?.category||'Food & drink'; $('tx-date').value=row?.occurred_on||today(); $('tx-note').value=row?.note||''; message('tx-message',''); $('tx-dialog').showModal(); $('tx-amount').focus(); }
function openSub(row){ if(!user){ $('connection-dialog').showModal(); return; } $('sub-id').value=row?.id||''; $('sub-title').textContent=row?'Edit subscription.':'Add subscription.'; $('sub-name').value=row?.name||''; $('sub-amount').value=row?row.amount:''; $('sub-cadence').value=row?.cadence||'monthly'; $('sub-category').value=row?.category||'Subscriptions'; $('sub-next').value=row?.next_charge||''; message('sub-message',''); $('sub-dialog').showModal(); $('sub-name').focus(); }
$('add-open').onclick=()=>openTx(); $('add-open-2').onclick=()=>openTx(); $('sub-open').onclick=()=>openSub();
$('tx-close').onclick=()=>{ if(!busy)$('tx-dialog').close(); }; $('sub-close').onclick=()=>{ if(!busy)$('sub-dialog').close(); };
for(const id of ['tx-dialog','sub-dialog','fin-dialog','connection-dialog']) $(id).addEventListener('cancel',e=>{ if(busy)e.preventDefault(); });
$('tx-form').addEventListener('submit',async e=>{
  e.preventDefault(); if(busy||!user)return; busy=true; $('tx-save').disabled=true;
  try{ const row={occurred_on:$('tx-date').value,amount:parseAmount($('tx-amount').value),merchant:$('tx-merchant').value.trim(),category:$('tx-category').value,note:$('tx-note').value.trim()}; if(!row.occurred_on)throw new Error('Pick a date.');
    const db=await connect(); const id=$('tx-id').value; const q=id?db.from('transactions').update(row).eq('id',id):db.from('transactions').insert(row); const {error}=await q; if(error)throw error;
    $('tx-dialog').close(); await load(); }
  catch(err){ message('tx-message',err.message||'Could not save.','error'); }
  finally{ busy=false; $('tx-save').disabled=false; }
});
$('sub-form').addEventListener('submit',async e=>{
  e.preventDefault(); if(busy||!user)return; busy=true; $('sub-save').disabled=true;
  try{ const row={name:$('sub-name').value.trim(),amount:parseAmount($('sub-amount').value),cadence:$('sub-cadence').value,category:$('sub-category').value,next_charge:$('sub-next').value||null}; if(!row.name)throw new Error('Give it a name.');
    const db=await connect(); const id=$('sub-id').value; const q=id?db.from('subscriptions').update(row).eq('id',id):db.from('subscriptions').insert(row); const {error}=await q; if(error)throw error;
    $('sub-dialog').close(); await load(); }
  catch(err){ message('sub-message',err.message||'Could not save.','error'); }
  finally{ busy=false; $('sub-save').disabled=false; }
});
document.addEventListener('click',async e=>{
  const b=e.target.closest('button[data-tx-edit],button[data-tx-del],button[data-sub-edit],button[data-sub-del]'); if(!b||busy)return;
  if(b.dataset.txEdit) return openTx(tx.find(r=>r.id===b.dataset.txEdit));
  if(b.dataset.subEdit) return openSub(subs.find(r=>r.id===b.dataset.subEdit));
  const table=b.dataset.txDel?'transactions':'subscriptions', id=b.dataset.txDel||b.dataset.subDel;
  if(!confirm(table==='transactions'?'Delete this expense?':'Remove this subscription?'))return;
  busy=true; try{ const db=await connect(); const {error}=await db.from(table).delete().eq('id',id); if(error)throw error; await load(); } catch(err){ message('history-message',err.message||'Could not delete.','error'); } finally{ busy=false; }
});
document.querySelectorAll('[data-range]').forEach(b=>b.onclick=()=>{ range=b.dataset.range; document.querySelectorAll('[data-range]').forEach(x=>x.setAttribute('aria-pressed',String(x===b))); render(); });


// ---- your numbers and your budget ----
const numOrNull=v=>v==null?null:Number(v);
function normProfile(r){ return {...r,debt_monthly:numOrNull(r.debt_monthly),monthly_income:numOrNull(r.monthly_income),total_debt:numOrNull(r.total_debt),debt_apr:numOrNull(r.debt_apr),debt_min_payment:numOrNull(r.debt_min_payment),savings:numOrNull(r.savings)}; }
// Income and debt are big numbers, so "4,500" means four thousand five hundred, not 4.5.
function parseBig(v,label){ let x=String(v).replace(/[^0-9.,]/g,''); if(x.includes(',')&&x.includes('.')) x=x.replace(/,/g,''); else if(/,\d{3}(?!\d)/.test(x)) x=x.replace(/,/g,''); else x=x.replace(',','.'); const n=Number(x); if(!x||!Number.isFinite(n)||n<0) throw new Error(`Enter ${label} as a number, like 4500.`); return Math.round(n*100)/100; }
const optBig=(v,label)=>String(v).trim()===''?null:parseBig(v,label);
const activeMonthly=()=>subs.filter(s=>s.active).reduce((a,s)=>a+monthly(s),0);
function stamp(iso){ const d=new Date(iso), diff=(Date.now()-d)/60000; if(diff<2) return 'just now'; if(diff<60) return `${Math.round(diff)} min ago`; if(diff<60*36) return `${Math.round(diff/60)} h ago`; return d.toLocaleDateString([], {month:'short',day:'numeric'}); }
const pct=n=>String(Math.round(n*100)/100);

// How long a payment clears the debt. Worked out here from your own numbers, not by the model.
function payoff(balance,apr,payment){
  if(!balance) return {text:'no debt to pay off'};
  if(!payment) return {text:'nothing planned toward debt this month'};
  const i=(apr||0)/1200; let n;
  if(!i) n=Math.ceil(balance/payment);
  else { if(payment<=balance*i) return {text:'this payment doesn’t cover the monthly interest',warn:true}; n=Math.ceil(-Math.log(1-i*balance/payment)/Math.log(1+i)); }
  const d=new Date(); d.setMonth(d.getMonth()+n); const when=d.toLocaleDateString([], {month:'short',year:'numeric'});
  const extra=apr==null?' · add your interest rate for an exact date':i?` · about ${whole(Math.max(0,n*payment-balance))} in interest`:'';
  return {text:`debt-free in ${n} month${n===1?'':'s'}, by ${when}${extra}`};
}

function renderBudget(){
  const p=profile, signed=!!user, has=!!p?.monthly_income;
  $('fin-open').hidden=!signed||!profileReady; $('fin-open').textContent=has?'Edit your numbers':'Add your numbers +';
  $('budget-make').hidden=!signed||!profileReady||!has; $('budget-make').disabled=budgetBusy; $('budget-make').textContent=p?.budget?'Create me a new budget ↗':'Create me a budget ↗';
  if(!signed){ $('fin-row').innerHTML=''; $('budget-body').innerHTML='<p class="coach-empty">Sign in to build a budget from your income, debt, bills and spending.</p>'; return; }
  if(!profileReady){ $('fin-row').innerHTML=''; $('budget-body').innerHTML='<p class="coach-empty">To build a budget, run <b>budget.sql</b> in your Supabase SQL editor once, then reload.</p>'; return; }
  const dt=debtTotals();
  $('fin-row').innerHTML=has?[`Income <b>${esc(whole(p.monthly_income))}</b> / month`,`Debt <b>${esc(whole(dt.balance))}</b>${dt.apr!=null?` at ${pct(dt.apr)}%`:''}${dt.from==='list'?' across '+debtLeft().length+' debts':''}`,`Savings <b>${esc(whole(p.savings||0))}</b>`,`Bills &amp; subscriptions <b>${esc(whole(activeMonthly()))}</b> / month`].map(x=>`<span>${x}</span>`).join(''):'';
  if(!has){ $('budget-body').innerHTML='<p class="coach-empty">Add your <b>monthly income</b>, <b>debt</b> and <b>savings</b>, then press <b>Create me a budget</b>. It reads them with the bills, subscriptions and spending already in MONEY, and plans how much goes to paying off debt, to savings and to everything else.</p>'; return; }
  const b=p.budget;
  if(!b){ $('budget-body').innerHTML='<p class="coach-empty">Press <b>Create me a budget</b> for a monthly plan: what to put toward your debt, what to save, what to spend in each category, and what to cut. Nothing is sent until you press it.</p>'; return; }
  const sum=k=>b.allocations.filter(a=>!k||a.kind===k).reduce((x,a)=>x+a.amount,0);
  const debtPay=sum('debt'), save=sum('savings'), needs=sum('need'), wants=sum('want'), planned=sum();
  const pay=dt.from==='list'?listPayoff(debtPay):payoff(dt.balance,dt.apr,debtPay), savings=p.savings||0, goal=b.emergency_fund_target||0;
  const goalNote=!goal?'':savings>=goal?` · ${whole(goal)} emergency fund reached`:save?` · ${whole(goal)} emergency fund in ${Math.ceil((goal-savings)/save)} months`:` · ${whole(goal)} emergency fund goal`;
  const monthStart=today().slice(0,8)+'01', spentIn=c=>tx.filter(r=>r.occurred_on>=monthStart&&r.occurred_on<=today()&&r.category===c).reduce((x,r)=>x+r.amount,0);
  const lines=b.allocations.map(a=>{
    if(a.kind==='debt'||a.kind==='savings') return `<li><div class="alloc-top"><b>${esc(a.category)}<span class="kind">${a.kind}</span></b><span>${esc(whole(a.amount))}</span></div><small>Set aside each month${a.note?' · '+esc(a.note):''}</small></li>`;
    // Rent and other scheduled bills live in your subscriptions, not your expenses: show the bill instead of an empty bar.
    const sched=subs.filter(x=>x.active&&x.category===a.category);
    if(sched.length&&!spentIn(a.category)) return `<li><div class="alloc-top"><b>${esc(a.category)}<span class="kind">${a.kind}</span></b><span>${esc(whole(a.amount))}</span></div><small>Scheduled: ${esc(sched.map(x=>`${x.name} ${whole(monthly(x))}`).join(', '))}${a.note?' · '+esc(a.note):''}</small></li>`;
    const spent=spentIn(a.category), over=spent>a.amount, fill=a.amount?Math.min(100,spent/a.amount*100):spent?100:0;
    return `<li><div class="alloc-top"><b>${esc(a.category)}<span class="kind">${a.kind}</span></b><span>${esc(whole(a.amount))}</span></div><div class="meter${over?' over':''}" role="progressbar" aria-label="${esc(a.category)}: ${esc(whole(spent))} of ${esc(whole(a.amount))} spent" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(fill)}"><i style="width:${fill}%"></i></div><small>${esc(whole(spent))} spent this month · ${over?`<span class="over">${esc(whole(spent-a.amount))} over</span>`:`${esc(whole(a.amount-spent))} left`}${a.note?' · '+esc(a.note):''}</small></li>`; }).join('');
  const diff=p.monthly_income-planned;
  const total=Math.abs(diff)<1?'Every dollar of your income has a job.':diff>0?`${esc(whole(diff))} of your income isn’t assigned.`:`<span class="over">${esc(whole(-diff))} more than your income.</span>`;
  const stale=p.updated_at&&p.budget_at&&new Date(p.updated_at)>new Date(p.budget_at)?'<p class="stale">Your numbers changed after this budget was made. Press <b>Create me a new budget</b> to update it.</p>':'';
  $('budget-body').innerHTML=`${stale}<p class="budget-headline">${esc(b.headline)}</p>
  <div class="budget-stats"><div><p>Toward debt</p><strong>${esc(whole(debtPay))}<small style="display:inline;margin-left:4px">/ month</small></strong><small${pay.warn?' style="color:var(--error)"':''}>${esc(pay.text)}</small></div>
  <div><p>To savings</p><strong>${esc(whole(save))}<small style="display:inline;margin-left:4px">/ month</small></strong><small>${esc(whole(savings))} saved now${esc(goalNote)}</small></div>
  <div><p>To spend</p><strong>${esc(whole(needs+wants))}<small style="display:inline;margin-left:4px">/ month</small></strong><small>needs ${esc(whole(needs))} · wants ${esc(whole(wants))}</small></div></div>
  <div class="coach-cols"><div><h3>Your monthly plan</h3><ul class="alloc">${lines}</ul><p class="alloc-total"><span>Planned <b>${esc(whole(planned))}</b> of ${esc(whole(p.monthly_income))}</span><span>${total}</span></p></div>
  <div><h3>Cut these</h3><ul>${b.cuts.map(c=>`<li><b>${esc(c.what)}</b><span><span class="cut-save">Saves ${esc(whole(c.save_per_month))} / month</span> · ${esc(c.why)}</span></li>`).join('')||'<li>Nothing to cut. Your spending already fits.</li>'}</ul>${b.rules.length?`<h3>Rules for this month</h3><ul>${b.rules.map(r=>`<li>${esc(r)}</li>`).join('')}</ul>`:''}</div></div>
  <p class="coach-next"><span>Next step</span>${esc(b.next_step)}</p>
  <p class="coach-meta">Made ${esc(stamp(b.at))} from your own numbers · a plan to follow, not financial advice.</p>`;
}

// What the budget reads: your numbers, every bill and subscription, and what you actually spend.
function budgetSummary(){
  const p=profile, t=today(), start=addDays(t,-89), cur=currency.resolvedOptions().currency;
  const recent=tx.filter(r=>r.occurred_on>=start&&r.occurred_on<=t), tot=rows=>rows.reduce((x,r)=>x+r.amount,0);
  const first=recent.reduce((m,r)=>r.occurred_on<m?r.occurred_on:m,t), span=Math.max(1,Math.round((parseDay(t)-parseDay(first))/86400000)+1), scale=30.4/span;
  const L=[`Currency: ${cur}.`,`Monthly take-home income: ${money(p.monthly_income)}.`];
  const dt=debtTotals();
  if(dt.from==='list') L.push(debtLeft().length?`Debts (${money(dt.balance)} in total, minimum payments ${money(dt.min||0)} a month): `+debtLeft().map(d=>`${d.name} ${money(d.balance)} at ${d.apr!=null?pct(d.apr)+'% APR':'unknown APR'}, minimum ${d.min_payment!=null?money(d.min_payment):'not given'}`).join('; ')+`. They plan to pay ${money(debtMonthly())} a month toward debt, ${(profile?.debt_strategy||'avalanche')==='snowball'?'smallest balance':'highest interest'} first.`:'No debt.');
  else L.push(p.total_debt?`Total debt: ${money(p.total_debt)}; interest rate ${p.debt_apr!=null?pct(p.debt_apr)+'% APR':'not given'}; minimum payment ${p.debt_min_payment!=null?money(p.debt_min_payment)+' a month':'not given'}.`:'No debt.');
  L.push(`Savings right now: ${money(p.savings||0)}.`);
  const act=subs.filter(s=>s.active);
  L.push(act.length?`Scheduled bills and subscriptions (${money(activeMonthly())} a month): `+act.map(s=>`${s.name} ${money(monthly(s))}/month (${s.category}${s.cadence!=='monthly'?`, billed ${money(s.amount)} ${s.cadence}`:''})`).join('; ')+'.':'No scheduled bills or subscriptions recorded.');
  const paused=subs.filter(s=>!s.active); if(paused.length) L.push('Paused subscriptions: '+paused.map(s=>s.name).join(', ')+'.');
  if(recent.length){
    L.push(`Spending logged over the last ${span} days: ${money(tot(recent))}, about ${money(tot(recent)*scale)} a month.`);
    L.push('Average per month by category: '+byCategory(recent).map(c=>`${c.name} ${money(c.total*scale)}`).join('; ')+'.');
    const ms=t.slice(0,8)+'01', month=tx.filter(r=>r.occurred_on>=ms&&r.occurred_on<=t);
    L.push(`This month so far (${byDay(month,{start:ms,end:t}).length} days): `+(byCategory(month).map(c=>`${c.name} ${money(c.total)}`).join('; ')||'nothing')+'.');
    const m=new Map(); for(const r of recent) if(r.merchant){ const v=m.get(r.merchant)||{n:0,t:0,c:r.category}; v.n++; v.t+=r.amount; m.set(r.merchant,v); }
    L.push('Top merchants over that time: '+([...m].sort((x,y)=>y[1].t-x[1].t).slice(0,10).map(([k,v])=>`${k} (${v.c}) ${v.n}× ${money(v.t)}`).join('; ')||'none named')+'.');
  } else L.push('No spending logged in the last 90 days, so plan everyday categories conservatively and say they should log spending to tune the budget.');
  return L.join('\n');
}

async function makeBudget(){
  if(budgetBusy||!user||!profile?.monthly_income)return;
  budgetBusy=true; renderBudget(); $('budget-message').innerHTML='<span class="spinner"></span>Building your budget. This takes about a minute…'; $('budget-message').className='message';
  try{
    const db=await connect(); const {data:{session}}=await db.auth.getSession(); if(!session?.access_token) throw new Error('Sign in again to create a budget.');
    const r=await fetch('/api/budget',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token},body:JSON.stringify({summary:budgetSummary()})});
    const j=await r.json().catch(()=>({})); if(!r.ok) throw new Error(j.error||'A budget could not be made.');
    // Stamped with this device's clock, like your numbers, so "changed since" compares like with like.
    const at=new Date().toISOString(); j.at=at;
    const {error}=await db.from('money_profile').update({budget:j,budget_at:at}).eq('user_id',user.id); if(error) throw error;
    profile={...profile,budget:j,budget_at:at}; message('budget-message','');
  }catch(err){ message('budget-message',err.message||'A budget could not be made.','error'); }
  finally{ budgetBusy=false; renderBudget(); }
}
function openFin(){
  if(!user){ $('connection-dialog').showModal(); return; } const p=profile||{};
  const fromList=debtsReady&&debts.length>0; $('fin-debt-note').hidden=!fromList; $('fin-debt').closest('label').hidden=fromList; $('fin-debt-extra').hidden=fromList;
  $('fin-income').value=p.monthly_income??''; $('fin-debt').value=p.total_debt??''; $('fin-savings').value=p.savings??''; $('fin-apr').value=p.debt_apr??''; $('fin-min').value=p.debt_min_payment??'';
  message('fin-message',''); $('fin-dialog').showModal(); $('fin-income').focus();
}
$('fin-open').onclick=openFin; $('budget-make').onclick=makeBudget; $('fin-close').onclick=()=>{ if(!busy)$('fin-dialog').close(); };
$('fin-form').addEventListener('submit',async e=>{
  e.preventDefault(); if(busy||!user)return; busy=true; $('fin-save').disabled=true;
  try{
    const fromList=debtsReady&&debts.length>0, p=profile||{};
    const row={user_id:user.id,monthly_income:parseBig($('fin-income').value,'your monthly income'),savings:optBig($('fin-savings').value,'your savings')??0,updated_at:new Date().toISOString(),
      ...(fromList?{total_debt:p.total_debt??0,debt_apr:p.debt_apr??null,debt_min_payment:p.debt_min_payment??null}:{total_debt:optBig($('fin-debt').value,'your debt')??0,debt_apr:optBig($('fin-apr').value,'the interest rate'),debt_min_payment:optBig($('fin-min').value,'the minimum payment')})};
    if(!row.monthly_income) throw new Error('Enter your monthly take-home income.');
    if(row.debt_apr!=null&&row.debt_apr>100) throw new Error('Enter the interest rate as a yearly percentage, like 24.9.');
    const db=await connect(); const {data,error}=await db.from('money_profile').upsert(row,{onConflict:'user_id'}).select().single(); if(error)throw error;
    profile=normProfile(data); $('fin-dialog').close(); renderBudget();
  }catch(err){ const missing=/relation .* does not exist|schema cache/i.test(err.message||''); message('fin-message',missing?'Run budget.sql in your Supabase SQL editor once, then reload.':(err.message||'Could not save.'),'error'); }
  finally{ busy=false; $('fin-save').disabled=false; }
});

// ---- bills due soon ----
// A month or more ahead from a "yyyy-mm-dd" day, keeping the day of the month where it exists (Jan 31 → Feb 28).
function addMonths(s,n){ const [y,m,d]=s.split('-').map(Number); const last=new Date(y,m-1+n+1,0).getDate(); return isoDay(new Date(y,m-1+n,Math.min(d,last))); }
// A bill's next charge, rolled forward on its schedule past dates already gone, so the dates never need updating by hand.
function nextDue(s){
  if(!s.active||!s.next_charge) return null; const t=today(); let d=s.next_charge, k=0;
  while(d<t&&k<600){ k++; d=s.cadence==='weekly'?addDays(s.next_charge,7*k):addMonths(s.next_charge,s.cadence==='yearly'?12*k:k); }
  return d;
}
const dueLabel=d=>{ const t=today(); return d===t?'today':d===addDays(t,1)?'tomorrow':parseDay(d).toLocaleDateString([], {weekday:'short',month:'short',day:'numeric'}); };
function renderDue(){
  const el=$('due-strip'); if(!user){ el.innerHTML=''; return; }
  const t=today(), end=addDays(t,6), up=subs.map(s=>({s,d:nextDue(s)})).filter(x=>x.d).sort((a,b)=>a.d<b.d?-1:a.d>b.d?1:b.s.amount-a.s.amount);
  const soon=up.filter(x=>x.d<=end);
  if(soon.length) el.innerHTML=`<span class="label">Due this week</span><b>${esc(money(soon.reduce((a,x)=>a+x.s.amount,0)))}</b>`+soon.map(x=>`<span class="chip${x.d<=addDays(t,1)?' soon':''}">${esc(x.s.name)} <b>${esc(money(x.s.amount))}</b> ${esc(dueLabel(x.d))}</span>`).join('');
  else el.innerHTML=up[0]?`<span class="label">Due this week</span><span>Nothing in the next 7 days. Next: ${esc(up[0].s.name)} <b>${esc(money(up[0].s.amount))}</b> on ${esc(dueLabel(up[0].d))}.</span>`:'';
}

// ---- your debts ----
const debtLeft=()=>debts.filter(d=>d.balance>0);
// Your debt in total: from your debts list when you have one, otherwise from your numbers.
function debtTotals(){
  if(!debtsReady||!debts.length) return {from:'profile',balance:profile?.total_debt||0,apr:profile?.debt_apr??null,min:profile?.debt_min_payment??null};
  const list=debtLeft(), bal=list.reduce((a,d)=>a+d.balance,0), rated=list.filter(d=>d.apr!=null), ratedBal=rated.reduce((a,d)=>a+d.balance,0);
  return {from:'list',balance:bal,apr:ratedBal?rated.reduce((a,d)=>a+d.apr*d.balance,0)/ratedBal:null,min:list.some(d=>d.min_payment!=null)?list.reduce((a,d)=>a+(d.min_payment||0),0):null};
}
// What you pay toward debt each month: what you set here, else your budget's debt line, else your minimums.
function debtMonthly(){
  if(profile?.debt_monthly!=null) return profile.debt_monthly;
  const fromBudget=(profile?.budget?.allocations||[]).filter(a=>a.kind==='debt').reduce((x,a)=>x+a.amount,0);
  return fromBudget||debtTotals().min||0;
}
// Month by month: interest on every debt, the minimum on every debt, then everything left over to the focus debt.
// When one is paid off, its payment rolls on to the next. Avalanche = highest interest first; snowball = smallest balance first.
function simulate(list,monthly,strategy){
  const ds=list.map(d=>({id:d.id,bal:d.balance,apr:d.apr||0,min:d.min_payment||0,month:0}));
  const order=[...ds].sort(strategy==='snowball'?(a,b)=>a.bal-b.bal||b.apr-a.apr:(a,b)=>b.apr-a.apr||a.bal-b.bal);
  const minSum=ds.reduce((a,d)=>a+d.min,0);
  if(monthly+0.005<minSum) return {order,short:minSum-monthly};
  let month=0, interest=0;
  while(ds.some(d=>d.bal>0.005)&&month<600){
    month++; let left=monthly;
    for(const d of ds) if(d.bal>0.005){ const i=d.bal*d.apr/1200; d.bal+=i; interest+=i; }
    for(const d of ds) if(d.bal>0.005){ const p=Math.min(d.bal,d.min,left); d.bal-=p; left-=p; }
    for(const d of order){ if(left<=0.005) break; if(d.bal>0.005){ const p=Math.min(d.bal,left); d.bal-=p; left-=p; } }
    for(const d of ds) if(d.bal<=0.005&&!d.month) d.month=month;
  }
  return month>=600?{order,never:true}:{order,months:month,interest};
}
const monthsFrom=n=>{ const d=new Date(); d.setMonth(d.getMonth()+n); return d.toLocaleDateString([], {month:'short',year:'numeric'}); };
// The budget card's debt line, worked out from your debts list.
function listPayoff(payment){
  const list=debtLeft(); if(!list.length) return {text:'no debt to pay off'};
  const sim=simulate(list,payment,profile?.debt_strategy||'avalanche');
  if(sim.short) return {text:`${whole(sim.short)} short of your minimum payments`,warn:true};
  if(sim.never) return {text:'this payment doesn’t cover the interest',warn:true};
  return {text:`debt-free in ${sim.months} month${sim.months===1?'':'s'}, by ${monthsFrom(sim.months)} · about ${whole(sim.interest)} in interest`};
}

function renderDebts(){
  $('debt-open').hidden=!user||!debtsReady; $('debt-total').innerHTML='';
  if(!user){ $('debt-body').innerHTML='<p class="coach-empty">Sign in to plan paying off your debts.</p>'; return; }
  if(!debtsReady){ $('debt-body').innerHTML='<p class="coach-empty">To list your debts and get a payoff plan, run <b>debts.sql</b> in your Supabase SQL editor once, then reload.</p>'; return; }
  if(!debts.length){ $('debt-body').innerHTML='<p class="coach-empty">Add each card, loan or balance you’re paying off, with its interest rate and minimum payment. You’ll get the order to pay them in, when each one is paid off, and your debt-free date.</p>'; return; }
  const list=debtLeft(), strategy=profile?.debt_strategy||'avalanche', monthlyPay=debtMonthly(), sim=simulate(list,monthlyPay,strategy), dt=debtTotals();
  $('debt-total').innerHTML=`<b>${esc(whole(dt.balance))}</b> left${dt.min!=null?` · ${esc(whole(dt.min))} / month in minimums`:''}`;
  let summary;
  if(!list.length) summary='Every debt is paid off.';
  else if(sim.short) summary=`<span class="warn">That’s ${esc(whole(sim.short))} less than your minimum payments.</span> Pay at least ${esc(whole(dt.min))} a month to avoid late fees and credit damage.`;
  else if(sim.never) summary='<span class="warn">At this amount the interest grows faster than you pay it off.</span> Raise your monthly payment.';
  else {
    summary=`Debt-free in <b>${sim.months} month${sim.months===1?'':'s'}</b>, by ${esc(monthsFrom(sim.months))}, paying about ${esc(whole(sim.interest))} in interest.`;
    const base=dt.min&&monthlyPay>dt.min+0.5?simulate(list,dt.min,strategy):null;
    if(base&&!base.short){ summary+=base.never?' Paying only the minimums would never clear it.':` That’s ${base.months-sim.months} month${base.months-sim.months===1?'':'s'} sooner and ${esc(whole(base.interest-sim.interest))} less interest than paying only the minimums.`; }
  }
  const byId=new Map(sim.order.map((d,i)=>[d.id,{n:i+1,month:d.month}]));
  const ordered=[...list].sort((a,b)=>byId.get(a.id).n-byId.get(b.id).n), paid=debts.filter(d=>d.balance<=0);
  const row=(d,i)=>{ const plan=byId.get(d.id), when=!sim.short&&!sim.never&&plan?.month?`Paid off ${monthsFrom(plan.month)}, in ${plan.month} month${plan.month===1?'':'s'}`:'';
    return `<div class="debt-row"><span class="n">${i+1}</span><div><b>${esc(d.name)}</b>${i===0?'<span class="focus">Focus</span>':''}<small>${d.apr!=null?esc(pct(d.apr))+'% APR':'no rate set'} · ${d.min_payment!=null?esc(whole(d.min_payment))+' minimum':'no minimum set'}${i===0&&!sim.short&&!sim.never?' · extra money goes here first':''}</small>${when?`<small>${esc(when)}</small>`:''}</div><div><div class="amt">${esc(money(d.balance))}</div><div class="ops"><button class="text-button" data-debt-pay="${d.id}" type="button">Payment</button><button class="text-button" data-debt-edit="${d.id}" type="button">Edit</button><button class="text-button" data-debt-del="${d.id}" type="button">Delete</button></div></div></div>`; };
  $('debt-body').innerHTML=`<div class="debt-plan"><label class="field"><span>I’ll pay toward debt each month</span><input id="debt-monthly" type="text" inputmode="decimal" value="${esc(monthlyPay?String(Math.round(monthlyPay*100)/100):'')}" autocomplete="off"></label><div class="seg" role="group" aria-label="Payoff order"><button type="button" data-strategy="avalanche" aria-pressed="${strategy==='avalanche'}">Highest interest first</button><button type="button" data-strategy="snowball" aria-pressed="${strategy==='snowball'}">Smallest balance first</button></div></div>
  <p class="debt-summary">${summary}</p>${ordered.map(row).join('')}${paid.map(d=>`<div class="debt-row"><span class="n">✓</span><div><b>${esc(d.name)}</b><small>Paid off</small></div><div class="ops"><button class="text-button" data-debt-del="${d.id}" type="button">Delete</button></div></div>`).join('')}`;
}
async function saveDebtPlan(fields){
  if(!user)return;
  try{ const db=await connect(); const {data,error}=await db.from('money_profile').upsert({user_id:user.id,...fields},{onConflict:'user_id'}).select().single(); if(error)throw error; profile=normProfile(data); message('debt-message',''); renderDebts(); renderBudget(); }
  catch(err){ const missing=/relation .* does not exist|schema cache|debt_monthly|debt_strategy/i.test(err.message||''); message('debt-message',missing?'Run budget.sql and then debts.sql in your Supabase SQL editor, then reload.':(err.message||'Could not save.'),'error'); }
}
$('debts').addEventListener('change',e=>{ if(e.target.id!=='debt-monthly')return; try{ saveDebtPlan({debt_monthly:optBig(e.target.value,'your monthly debt payment')}); }catch(err){ message('debt-message',err.message,'error'); } });
$('debts').addEventListener('click',async e=>{
  const b=e.target.closest('button'); if(!b||busy)return; const d=b.dataset;
  if(d.strategy) return saveDebtPlan({debt_strategy:d.strategy});
  if(d.debtEdit) return openDebt(debts.find(x=>x.id===d.debtEdit));
  if(d.debtPay) return openPay(debts.find(x=>x.id===d.debtPay));
  if(d.debtDel){ const debt=debts.find(x=>x.id===d.debtDel); if(!debt||!confirm(`Delete ${debt.name}?`))return;
    busy=true; try{ const db=await connect(); const {error}=await db.from('debts').delete().eq('id',debt.id); if(error)throw error; await load(); }catch(err){ message('debt-message',err.message||'Could not delete.','error'); } finally{ busy=false; } }
});
function openDebt(d){
  if(!user){ $('connection-dialog').showModal(); return; }
  $('debt-id').value=d?.id||''; $('debt-title').textContent=d?'Edit debt.':'Add debt.'; $('debt-name').value=d?.name||''; $('debt-balance').value=d?d.balance:''; $('debt-apr').value=d?.apr??''; $('debt-min').value=d?.min_payment??'';
  message('debt-form-message',''); $('debt-dialog').showModal(); $('debt-name').focus();
}
function openPay(d){
  if(!d)return; $('pay-id').value=d.id; $('pay-copy').textContent=`${d.name}: ${money(d.balance)} left. The balance drops by what you paid.`; $('pay-amount').value=d.min_payment??'';
  message('pay-message',''); $('pay-dialog').showModal(); $('pay-amount').focus();
}
$('debt-open').onclick=()=>openDebt(); $('debt-close').onclick=()=>{ if(!busy)$('debt-dialog').close(); }; $('pay-close').onclick=()=>{ if(!busy)$('pay-dialog').close(); };
for(const id of ['debt-dialog','pay-dialog']) $(id).addEventListener('cancel',e=>{ if(busy)e.preventDefault(); });
$('debt-form').addEventListener('submit',async e=>{
  e.preventDefault(); if(busy||!user)return; busy=true; $('debt-save').disabled=true;
  try{
    const row={name:$('debt-name').value.trim(),balance:parseBig($('debt-balance').value,'the balance'),apr:optBig($('debt-apr').value,'the interest rate'),min_payment:optBig($('debt-min').value,'the minimum payment'),updated_at:new Date().toISOString()};
    if(!row.name) throw new Error('Give it a name, like "Chase card".'); if(row.apr!=null&&row.apr>100) throw new Error('Enter the interest rate as a yearly percentage, like 24.9.');
    const db=await connect(); const id=$('debt-id').value; const {error}=await (id?db.from('debts').update(row).eq('id',id):db.from('debts').insert(row)); if(error)throw error;
    $('debt-dialog').close(); await load();
  }catch(err){ message('debt-form-message',err.message||'Could not save.','error'); }
  finally{ busy=false; $('debt-save').disabled=false; }
});
$('pay-form').addEventListener('submit',async e=>{
  e.preventDefault(); if(busy||!user)return; busy=true; $('pay-save').disabled=true;
  try{
    const debt=debts.find(x=>x.id===$('pay-id').value); if(!debt) throw new Error('That debt is gone. Reload the page.');
    const paid=parseBig($('pay-amount').value,'what you paid'); if(!paid) throw new Error('Enter what you paid.');
    const db=await connect(); const {error}=await db.from('debts').update({balance:Math.max(0,Math.round((debt.balance-paid)*100)/100),updated_at:new Date().toISOString()}).eq('id',debt.id); if(error)throw error;
    $('pay-dialog').close(); await load();
  }catch(err){ message('pay-message',err.message||'Could not save.','error'); }
  finally{ busy=false; $('pay-save').disabled=false; }
});

// What the coach reads: the last 30 days against the 30 before, by category, merchant and week, plus every subscription.
function coachSummary(){
  const t=today(), a={start:addDays(t,-29),end:t}, b={start:addDays(t,-59),end:addDays(t,-30)};
  const now=tx.filter(r=>inWindow(r,a)), prev=tx.filter(r=>inWindow(r,b)); const tot=rows=>rows.reduce((x,r)=>x+r.amount,0);
  const L=[]; L.push(`Currency: ${currency.resolvedOptions().currency}.`);
  L.push(`Last 30 days: ${money(tot(now))} across ${now.length} expenses (${money(tot(now)/30)} per day). Previous 30 days: ${money(tot(prev))} across ${prev.length}.`);
  L.push(`Days with no spending in last 30: ${byDay(now,a).filter(d=>d.total===0).length}.`);
  L.push('By category, last 30 days: '+byCategory(now).map(c=>`${c.name} ${money(c.total)}`).join('; ')+'.');
  const m=new Map(); for(const r of now) if(r.merchant){ const k=r.merchant; m.set(k,{n:(m.get(k)?.n||0)+1,t:(m.get(k)?.t||0)+r.amount}); }
  L.push('Top merchants: '+[...m].sort((x,y)=>y[1].t-x[1].t).slice(0,8).map(([k,v])=>`${k} ${v.n}× ${money(v.t)}`).join('; ')+'.');
  L.push('Largest single expenses: '+[...now].sort((x,y)=>y.amount-x.amount).slice(0,5).map(r=>`${r.occurred_on} ${r.merchant||r.category} ${money(r.amount)}`).join('; ')+'.');
  const weeks=[]; for(let i=7;i>=0;i--){ const e=addDays(t,-i*7), s=addDays(e,-6); weeks.push(`${s}: ${money(tot(tx.filter(r=>inWindow(r,{start:s,end:e}))))}`); } L.push('Weekly totals, oldest first: '+weeks.join('; ')+'.');
  if(debtsReady&&debtLeft().length) L.push('Debts: '+debtLeft().map(d=>`${d.name} ${money(d.balance)}${d.apr!=null?` at ${pct(d.apr)}%`:''}`).join('; ')+'.');
  if(profile?.monthly_income) L.push(`Monthly take-home income ${money(profile.monthly_income)}; debt ${money(profile.total_debt||0)}; savings ${money(profile.savings||0)}.`);
  L.push(subs.length?`Subscriptions (${money(subs.filter(s=>s.active).reduce((x,s)=>x+monthly(s),0))} per month): `+subs.map(s=>`${s.name} ${money(s.amount)} ${s.cadence} (${s.category}${s.next_charge?', next '+s.next_charge:''}${s.active?'':', paused'})`).join('; ')+'.':'No subscriptions recorded.');
  return L.join('\n');
}
window.coach={app:'money',userId:async()=>user?.id||null,session:async()=>{ try{ const db=await connect(); const {data:{session}}=await db.auth.getSession(); return session?.access_token||null; }catch{ return null; } },summary:coachSummary};
// Reconnect a saved session, if any.
render();
connect().catch(()=>{});
})();
