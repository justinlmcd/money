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
  $('tx-fields').disabled=!user; $('sub-fields').disabled=!user;
  $('connection-status').textContent=user?'Connected':'Your record'; $('connection-status').classList.toggle('connected',!!user);
  if(!user){ tx=[]; subs=[]; render(); $('tx').innerHTML='<p class="row-empty">Sign in to see your spending.</p>'; $('subs').innerHTML='<p class="row-empty">Sign in to see your subscriptions.</p>'; $('tx-dialog').close(); $('sub-dialog').close(); }
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
    tx=t.map(r=>({...r,amount:Number(r.amount)})); subs=s.map(r=>({...r,amount:Number(r.amount)})); render();
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
  drawLine(byDay(rows,w)); drawDonut(cats); renderSubs(subMonthly); renderTx();
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
  $('subs').innerHTML=subs.map(s=>{ const due=s.next_charge?(s.next_charge<t?`<span class="overdue">was due ${shortDate(s.next_charge)}</span>`:s.next_charge===t?`<span class="due">due today</span>`:`next ${shortDate(s.next_charge)}`):'no date';
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
for(const id of ['tx-dialog','sub-dialog','connection-dialog']) $(id).addEventListener('cancel',e=>{ if(busy)e.preventDefault(); });
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
  L.push(subs.length?`Subscriptions (${money(subs.filter(s=>s.active).reduce((x,s)=>x+monthly(s),0))} per month): `+subs.map(s=>`${s.name} ${money(s.amount)} ${s.cadence} (${s.category}${s.next_charge?', next '+s.next_charge:''}${s.active?'':', paused'})`).join('; ')+'.':'No subscriptions recorded.');
  return L.join('\n');
}
window.coach={app:'money',userId:async()=>user?.id||null,session:async()=>{ try{ const db=await connect(); const {data:{session}}=await db.auth.getSession(); return session?.access_token||null; }catch{ return null; } },summary:coachSummary};
// Reconnect a saved session, if any.
render();
connect().catch(()=>{});
})();
