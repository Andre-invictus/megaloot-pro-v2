(function(){"use strict";
const $=id=>document.getElementById(id),room=new URLSearchParams(location.search).get("room");if(!room)return;
const client=window.supabase.createClient(window.MEGALOOT_SUPABASE_URL,window.MEGALOOT_SUPABASE_ANON_KEY);let last="",activeRunId="",runToken=0,rotation=0;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function bg(ps){let a=0;return `conic-gradient(${ps.map(p=>{const x=a;a+=Number(p.chance||0)*3.6;return `${p.color} ${x}deg ${a}deg`}).join(",")})`}
function safe(v){return String(v||"").replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]))}
function labels(host,ps){if(!host)return;let a=0;host.innerHTML=ps.map(p=>{const span=Number(p.chance||0)*3.6,mid=a+span/2;a+=span;return `<div class="wheel-label" style="transform:translateY(-50%) rotate(${mid-90}deg)"><span>${safe(p.name)}</span></div>`}).join("")}
function animate(el,from,to,duration){return new Promise(resolve=>{if(!el)return resolve();el.getAnimations?.().forEach(a=>a.cancel());try{const a=el.animate([{transform:`rotate(${from}deg)`},{transform:`rotate(${to}deg)`}],{duration,easing:"cubic-bezier(.08,.62,.08,1)",fill:"forwards"});a.onfinish=()=>{el.style.transform=`rotate(${to}deg)`;resolve()};a.oncancel=resolve}catch(_){el.style.transition=`transform ${duration}ms cubic-bezier(.08,.62,.08,1)`;requestAnimationFrame(()=>{el.style.transform=`rotate(${to}deg)`});setTimeout(resolve,duration)}})}
function paintWheel(ps){$("wheel").style.background=bg(ps);$("idle-wheel").style.background=bg(ps);labels($("wheel-labels"),ps);labels($("idle-labels"),ps)}
function showIdle(cfg){const always=cfg.displayMode==="always";$("bits-scene").classList.toggle("hidden",!always);$("bits-idle").classList.toggle("hidden",!always);$("bits-event").classList.add("hidden");$("idle-rule").textContent=`A cada ${cfg.bitsPerTier||100} Bits: ${cfg.spinsPerTier||1} giro(s)`}
async function execute(run,cfg,token){
  const scene=$("bits-scene"),idle=$("bits-idle"),event=$("bits-event"),wheel=$("wheel"),labelLayer=$("wheel-labels");scene.classList.remove("hidden");idle.classList.add("hidden");event.classList.remove("hidden");event.className="bits-event";
  $("bits-user").textContent=`@${run.user}`;$("bits-source").textContent=run.bits?`${run.bits} BITS`:"GIRO DE BRINDE";$("bits-result").textContent=`${run.results.length} GIRO${run.results.length!==1?'S':''} LIBERADO${run.results.length!==1?'S':''}`;$("bits-progress").textContent=`PREPARANDO`;await wait(run.introMs||1500);if(token!==runToken)return;
  for(let i=0;i<run.results.length;i++){
    const item=run.results[i],from=rotation,to=rotation+Number(item.angle||1800);rotation=to;event.className="bits-event";$("bits-progress").textContent=`GIRO ${i+1}/${run.results.length}`;$("bits-result").textContent="GIRANDO...";
    await Promise.all([animate(wheel,from,to,run.spinMs||8000),animate(labelLayer,from,to,run.spinMs||8000)]);if(token!==runToken)return;
    event.classList.add("result");$("bits-result").textContent=`🎁 ${item.prize.name}`;await wait(run.resultMs||2500);if(token!==runToken)return;
  }
  const counts={};run.results.forEach(x=>counts[x.prize.name]=(counts[x.prize.name]||0)+1);const text=Object.entries(counts).map(([n,c])=>`${c>1?c+'x ':''}${n}`).join(", ");event.className="bits-event summary";$("bits-progress").textContent="RESULTADO FINAL";$("bits-result").textContent=`🏆 ${text}`;await wait(run.summaryMs||5000);if(token!==runToken)return;
  showIdle(cfg);
}
function render(state){const w=state?.bits_wheel;if(!w)return;const cfg=w.config||{},ps=cfg.prizes||[];paintWheel(ps);const run=w.run;if(run&&run.runId!==activeRunId){activeRunId=run.runId;runToken++;execute(run,cfg,runToken)}else if(!run&&!activeRunId){showIdle(cfg)}else if(!run&&activeRunId){activeRunId="";runToken++;showIdle(cfg)}}
async function load(){const{data}=await client.from("overlay_rooms").select("state,updated_at").eq("room_code",room).maybeSingle();if(data&&data.updated_at!==last){last=data.updated_at;render(data.state)}}load();setInterval(load,300);
})();
