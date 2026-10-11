// Your coach: a card that reads your own data and says how you're doing.
// Each app sets window.coach = {app, summary(), session()} before this runs.
// Nothing is sent until you press the button; the last answer is kept on this device.
(function(){
'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const card=$('coach'); if(!card) return;
const cfg=()=>window.coach||{};
const key=uid=>`coach.${cfg().app}.${uid}`;
let busy=false;

function stamp(iso){ const d=new Date(iso), diff=(Date.now()-d)/60000; if(diff<2) return 'just now'; if(diff<60) return `${Math.round(diff)} min ago`; if(diff<60*36) return `${Math.round(diff/60)} h ago`; return d.toLocaleDateString([], {month:'short',day:'numeric'}); }
function render(note,uid){
  $('coach-refresh').hidden=!uid;
  if(!uid){ $('coach-body').innerHTML='<p class="coach-empty">Sign in and the coach can read your data.</p>'; return; }
  if(!note){ $('coach-body').innerHTML=`<p class="coach-empty">Press <b>Ask the coach</b> and it reads your recent data and tells you how you are doing and what to change. Nothing is sent until you press it.${cfg().note?' '+esc(cfg().note):''}</p>`; return; }
  $('coach-body').innerHTML=`<div class="coach-head"><span class="coach-score" aria-label="Score ${note.score} out of 10">${note.score}<small>/10</small></span><p class="coach-headline">${esc(note.headline)}</p></div>
  <div class="coach-cols"><div><h3>Going well</h3><ul>${(note.doing_well||[]).map(s=>`<li>${esc(s)}</li>`).join('')}</ul></div>
  <div><h3>Improve</h3><ul>${(note.improve||[]).map(i=>`<li><b>${esc(i.what)}</b><span>${esc(i.why)}</span></li>`).join('')}</ul></div></div>
  <p class="coach-next"><span>Next step</span>${esc(note.next_step)}</p>
  <p class="coach-meta">Updated ${stamp(note.at)} · an estimate from your own log, not medical or financial advice.</p>`;
}
async function ask(){
  if(busy)return; const c=cfg(); const uid=await c.userId?.(); if(!uid)return;
  busy=true; $('coach-refresh').disabled=true; $('coach-message').innerHTML='<span class="spinner"></span>Reading your data…'; $('coach-message').className='message';
  try{
    const summary=c.summary(); if(!summary||!summary.trim()) throw new Error('Nothing to coach on yet. Log a few days first.');
    const token=await c.session(); if(!token) throw new Error('Sign in again to ask the coach.');
    const r=await fetch('/api/coach',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({summary})});
    const j=await r.json().catch(()=>({})); if(!r.ok) throw new Error(j.error||'The coach could not answer.');
    try{ localStorage.setItem(key(uid),JSON.stringify(j)); }catch{}
    render(j,uid); $('coach-message').textContent='';
  }catch(err){ $('coach-message').textContent=err.message||'The coach could not answer.'; $('coach-message').className='message error'; }
  finally{ busy=false; $('coach-refresh').disabled=false; }
}
$('coach-refresh').onclick=ask;
// The app calls this whenever the signed-in user changes.
window.coachUser=function(uid){ let saved=null; try{ saved=uid?JSON.parse(localStorage.getItem(key(uid))||'null'):null; }catch{} render(saved,uid); };
window.coachUser(null);
})();
