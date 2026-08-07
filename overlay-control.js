/* MegaLoot Pro - Importacao Twitch e sincronizacao do overlay OBS */
(function(){
  "use strict";
  const $=id=>document.getElementById(id);
  let overlayClient=null, overlayUser=null, overlayRoom=null, publishTimer=null;
  const baseUrl=()=>location.origin + location.pathname.replace(/[^/]*$/,"");
  function status(id,text,cls=""){const e=$(id);if(e){e.textContent=text;e.className="dv-msg "+cls;}}
  function uuid(){return crypto.randomUUID ? crypto.randomUUID() : ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,c=>(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16));}
  async function getAuth(){
    if(!window.supabase?.createClient) throw new Error("Biblioteca Supabase indisponivel.");
    if(!overlayClient) overlayClient=window.supabase.createClient(window.MEGALOOT_SUPABASE_URL,window.MEGALOOT_SUPABASE_ANON_KEY);
    const {data,error}=await overlayClient.auth.getSession();
    if(error||!data.session) throw new Error("Entre novamente no MegaLoot.");
    overlayUser=data.session.user; return data.session;
  }
  function publicParticipant([login,p]){return {login,name:p.name,weight:Number(p.weight||1),isMod:!!p.isMod,isVip:!!p.isVip,isSub:!!p.isSub,eligible:p.eligible!==false,avatar:(window.avatarCache&&window.avatarCache[login])||""};}
  function cleanPrize(x){return typeof window.cleanPrizeDisplay==="function"?window.cleanPrizeDisplay(x):String(x||"").replace(/^💰\s*/,"").replace(/\s*\[DVAPI:[^\]]+\]\s*$/i,"").trim();}
  function collectState(){
    const list=typeof window.getCombinedPrizes==="function"?window.getCombinedPrizes():[];
    return {updated_at:new Date().toISOString(),title:"MEGALOOT PRO",status:(window.overlayDrawPhase&&window.overlayDrawPhase!=="idle")?window.overlayDrawPhase:(window.currentWinnerLogin?"winner":(window.isRunning?"entries_open":"waiting")),entries_open:!!window.isRunning,prizes:list.slice(0,5).map(cleanPrize),active_prize:cleanPrize(window.activePrizeText),participants:Object.entries(window.participants||{}).map(publicParticipant),winner:window.currentWinnerLogin&&window.participants?.[window.currentWinnerLogin]?{login:window.currentWinnerLogin,name:window.participants[window.currentWinnerLogin].name}:null,draw_id:Number(window.overlayDrawId||0),countdown:Number(window.countdownTime||0),multipliers:{viewer:Number($("mult-viewer")?.value||1),sub:Number($("mult-sub")?.value||1),vip:Number($("mult-vip")?.value||1),mod:Number($("mult-mod")?.value||1)}};
  }
  async function ensureRoom(){
    try{
      await getAuth();
      const {data,error}=await overlayClient.from("overlay_rooms").select("room_code").eq("owner_id",overlayUser.id).maybeSingle();
      if(error) throw error;
      overlayRoom=data?.room_code||uuid();
      if(!data){const r=await overlayClient.from("overlay_rooms").insert({owner_id:overlayUser.id,room_code:overlayRoom,state:collectState()});if(r.error)throw r.error;}
      const url=baseUrl()+"overlay.html?room="+encodeURIComponent(overlayRoom); if($("overlay-url"))$("overlay-url").value=url;
      status("overlay-status","Sala pronta. O overlay sera atualizado automaticamente.","ok");
      await publishOverlayState(true);
    }catch(e){status("overlay-status","Erro ao criar sala: "+e.message,"err");}
  }
  async function publishOverlayState(immediate=false){
    if(!overlayRoom||!overlayUser)return;
    if(publishTimer&&!immediate)clearTimeout(publishTimer);
    const run=async()=>{try{const {error}=await overlayClient.from("overlay_rooms").update({state:collectState(),updated_at:new Date().toISOString()}).eq("owner_id",overlayUser.id);if(error)throw error;}catch(e){console.error("Overlay sync:",e);}};
    if(immediate)await run(); else publishTimer=setTimeout(run,180);
  }
  window.copyOverlayUrl=async()=>{const v=$("overlay-url")?.value;if(!v)return status("overlay-status","A sala ainda nao foi criada.","err");await navigator.clipboard.writeText(v);status("overlay-status","URL copiada. Cole em uma Fonte de Navegador do OBS.","ok");};
  window.openOverlayUrl=()=>{const v=$("overlay-url")?.value;if(v)window.open(v,"_blank","noopener");};
  window.regenerateOverlayRoom=async()=>{if(!confirm("A URL atual deixara de funcionar. Gerar uma nova sala?"))return;try{await getAuth();overlayRoom=uuid();const {error}=await overlayClient.from("overlay_rooms").update({room_code:overlayRoom,state:collectState(),updated_at:new Date().toISOString()}).eq("owner_id",overlayUser.id);if(error)throw error;const url=baseUrl()+"overlay.html?room="+encodeURIComponent(overlayRoom);$("overlay-url").value=url;status("overlay-status","Nova URL criada. Atualize a Fonte de Navegador no OBS.","ok");}catch(e){status("overlay-status",e.message,"err");}};
  async function twitchFetch(url,clientId,token){const r=await fetch(url,{headers:{"Client-Id":clientId,"Authorization":"Bearer "+token}});const d=await r.json();if(!r.ok)throw new Error(d.message||("Twitch HTTP "+r.status));return d;}
  async function broadcaster(clientId,token){const d=await twitchFetch("https://api.twitch.tv/helix/users",clientId,token);if(!d.data?.[0])throw new Error("Token Twitch invalido ou nao pertence ao canal.");return d.data[0];}
  async function paged(endpoint,clientId,token){let out=[],cursor="";do{const sep=endpoint.includes("?")?"&":"?";const d=await twitchFetch(endpoint+sep+"first=100"+(cursor?"&after="+encodeURIComponent(cursor):""),clientId,token);out.push(...(d.data||[]));cursor=d.pagination?.cursor||"";}while(cursor);return out;}
  function mergeImported(item,kind){const login=String(item.user_login||"").toLowerCase(),name=item.user_name||item.user_login;if(!login)return;const old=window.participants[login]||{name,weight:1,isMod:false,isVip:false,isSub:false,vipBorder:false,eligible:true,hasPassBuff:false,passCount:0,passedCurrentPrize:false};old.name=name;old.eligible=true;if(kind==="sub")old.isSub=true;if(kind==="vip")old.isVip=true;const mv=Number($("mult-viewer")?.value||1),ms=Number($("mult-sub")?.value||1),mvi=Number($("mult-vip")?.value||1),mm=Number($("mult-mod")?.value||1);old.weight=old.isMod?mm:old.isVip?mvi:old.isSub?ms:mv;old.vipBorder=old.isMod||old.isVip||old.isSub;window.participants[login]=old;if(window.avatarQueue)window.avatarQueue.add(login);}
  window.importTwitchGroup=async(kind)=>{const clientId=$("helix-client-id")?.value.trim(),token=$("helix-token")?.value.trim().replace(/^oauth:/,"");if(!clientId||!token)return status("tw-import-status","Configure Client ID e Access Token no painel Twitch API.","err");status("tw-import-status","Consultando a Twitch...","warn");try{const me=await broadcaster(clientId,token);if($("tw-import-clear")?.checked)window.participants={};let subs=[],vips=[];if(kind==="subs"||kind==="both")subs=await paged(`https://api.twitch.tv/helix/subscriptions?broadcaster_id=${me.id}`,clientId,token);if(kind==="vips"||kind==="both")vips=await paged(`https://api.twitch.tv/helix/channels/vips?broadcaster_id=${me.id}`,clientId,token);subs.forEach(x=>mergeImported(x,"sub"));vips.forEach(x=>mergeImported(x,"vip"));window.updateUI();if(typeof window.saveSettingsLocal==="function")window.saveSettingsLocal();publishOverlayState();status("tw-import-status",`Concluido: ${subs.length} Subs, ${vips.length} VIPs, ${Object.keys(window.participants).length} participantes na urna.`,"ok");}catch(e){status("tw-import-status","Erro Twitch: "+e.message+" Verifique os escopos channel:read:subscriptions e channel:read:vips.","err");}};
  function wrap(name){const old=window[name];if(typeof old!=="function"||old.__overlayWrapped)return;const fn=function(){const r=old.apply(this,arguments);Promise.resolve(r).finally(()=>publishOverlayState());return r;};fn.__overlayWrapped=true;window[name]=fn;}
  document.addEventListener("DOMContentLoaded",()=>{setTimeout(async()=>{await ensureRoom();["updateUI","updatePrizeUI","drawWinner","confirmWinnerPresence","timeOutWinner","hideWinner","toggleGiveaway","clearGiveaway","startNextGiveaway","passTheLoot","updateAllMultipliers"].forEach(wrap);setInterval(()=>{if(!overlayRoom)ensureRoom();else publishOverlayState();},500);},800);});
})();
