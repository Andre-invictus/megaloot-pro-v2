(function(){
  "use strict";
  const $=id=>document.getElementById(id);
  const room=new URLSearchParams(location.search).get("room");
  const winnerSpan=$("winner")?.querySelector("span");if(winnerSpan&&!winnerSpan.id)winnerSpan.id="winner-label";
  const DEFAULT_AVATAR="https://static-cdn.jtvnw.net/user-default-pictures-uv/13e5fa74def228c1-profile_image-300x300.png";
  if(!room){$("empty").textContent="URL do overlay inválida";return;}
  const client=window.supabase.createClient(window.MEGALOOT_SUPABASE_URL,window.MEGALOOT_SUPABASE_ANON_KEY);
  let lastUpdated="",lastPrizes="",lastParticipants="",lastMultipliers="",lastStatus="";
  let currentState=null,scrambleTimer=null,revealTimer=null,lastEventId="";
  const chars="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*?/";
  function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  function hash(v){try{return JSON.stringify(v);}catch{return String(Date.now());}}
  function stopDrawing(){if(scrambleTimer){clearInterval(scrambleTimer);scrambleTimer=null;}if(revealTimer){clearTimeout(revealTimer);revealTimer=null;}}
  function randomText(length){let out="";for(let i=0;i<Math.max(6,length||8);i++)out+=chars[Math.floor(Math.random()*chars.length)];return out;}
  function showDrawing(state){
    if(lastEventId===state.event_id&&$("winner").classList.contains("drawing"))return;
    lastEventId=state.event_id||("drawing:"+Date.now());stopDrawing();
    $("winner").className="drawing";$("winner").classList.remove("hidden","revealed");
    $("winner-avatar").style.display="none";$("winner-prize").style.display="none";
    $("winner-label").textContent="DESCRIPTOGRAFANDO VENCEDOR...";
    $("winner-name").textContent=randomText(9);$("status").textContent="SORTEANDO...";
    scrambleTimer=setInterval(()=>{$("winner-name").textContent=randomText(7+Math.floor(Math.random()*5));},70);
  }
  function revealWinner(state){
    if(!state.winner)return;
    stopDrawing();lastEventId=state.event_id||("winner:"+state.winner.login);
    const ps=state.participants||[],p=ps.find(x=>x.login===state.winner.login);
    $("winner").className="revealed";$("winner").classList.remove("hidden","drawing");
    $("winner-label").textContent=state.status==="confirmed"?"VENCEDOR CONFIRMADO":"VENCEDOR SELECIONADO";
    $("winner-name").textContent=state.winner.name;
    $("winner-avatar").src=p?.avatar||DEFAULT_AVATAR;$("winner-avatar").style.display="block";
    $("winner-prize").textContent=state.active_prize||"Sorteio";$("winner-prize").style.display="block";
    $("status").textContent=state.status==="confirmed"?"CONFIRMADO":state.status==="timeout"?"TEMPO ESGOTADO":"VENCEDOR SELECIONADO";
  }
  function hideWinner(){stopDrawing();$("winner").className="hidden";lastEventId="";}
  function renderPrizes(s){const key=hash(s.prizes||[]);if(key===lastPrizes)return;lastPrizes=key;$("prizes").innerHTML=(s.prizes||[]).map(x=>`<div class="prize">🎁 ${esc(x)}</div>`).join("")||'<div class="prize">Aguardando prêmio</div>';}
  function renderMultipliers(s){const m=s.multipliers||{},key=hash(m);if(key===lastMultipliers)return;lastMultipliers=key;$("multipliers").innerHTML=`<span>👤 VIEW: ${m.viewer||1}x</span><span>⭐ SUB: ${m.sub||1}x</span><span>👑 VIP: ${m.vip||1}x</span><span>🛡 MOD: ${m.mod||1}x</span>`;}
  function renderParticipants(s){const ps=s.participants||[],key=hash(ps);if(key===lastParticipants)return;lastParticipants=key;$("empty").style.display=ps.length?"none":"grid";$("participants").innerHTML=ps.map(p=>`<div class="card ${p.isMod?'mod':p.isVip?'vip':p.isSub?'sub':''}"><div class="luck">${p.weight||1}x LUCK</div><div class="badges">${p.isMod?'🛡 MOD ':''}${p.isVip?'👑 VIP ':''}${p.isSub?'⭐ SUB':''}</div><img loading="eager" src="${esc(p.avatar||DEFAULT_AVATAR)}"><span class="name">${esc(p.name)}</span></div>`).join("");$("count").textContent=`${ps.length} participantes (${ps.filter(p=>p.eligible).length} elegíveis)`;}
  function renderStatus(s){if(s.status===lastStatus&&s.status!=="drawing")return;lastStatus=s.status;if(s.status==="drawing")showDrawing(s);else if(["winner","confirmed","timeout"].includes(s.status)&&s.winner)revealWinner(s);else{hideWinner();$("status").textContent=s.status==="entries_open"?"ENTRADAS ABERTAS":"AGUARDANDO";}}
  function render(s){if(!s)return;currentState=s;renderPrizes(s);renderMultipliers(s);renderParticipants(s);renderStatus(s);}
  async function load(){try{const {data,error}=await client.from("overlay_rooms").select("state,updated_at").eq("room_code",room).maybeSingle();if(error)throw error;if(data&&data.updated_at!==lastUpdated){lastUpdated=data.updated_at;render(data.state);}}catch(e){$("empty").textContent="Overlay aguardando configuração";}}
  load();setInterval(load,350);
})();
