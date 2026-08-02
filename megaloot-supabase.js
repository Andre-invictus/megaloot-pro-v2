/* MegaLoot Pro - Supabase, backup e lotes DVAPI opcionais */
(function () {
  "use strict";

  const DENIED_BACKUP_KEYS = new Set([
    "tw_token", "tw_helix_token", "tw_api_url", "tw_dvapi_dv", "tw_dvapi_key"
  ]);
  const PRIZE_PREFIX = "💰";
  let supa = null;
  let waitingDelivery = null;
  let deliveryInProgress = false;

  const $ = (id) => document.getElementById(id);
  const fmt = (n) => Number(n || 0).toLocaleString("pt-BR");
  function setMsg(id, text, cls = "") { const el = $(id); if (el) { el.textContent = text; el.className = "dv-msg " + cls; } }

  function initSupabase() {
    const url = window.MEGALOOT_SUPABASE_URL || "";
    const key = window.MEGALOOT_SUPABASE_ANON_KEY || "";
    if (!url || !key || url.includes("COLE_AQUI") || key.includes("COLE_AQUI")) return null;
    if (!window.supabase?.createClient) return null;
    supa = window.supabase.createClient(url, key);
    return supa;
  }

  async function getSession() {
    if (!supa) throw new Error("Preencha o arquivo supabase-config.js.");
    const { data, error } = await supa.auth.getSession();
    if (error || !data.session) throw new Error("Sessão expirada. Entre novamente.");
    return data.session;
  }

  // LOGIN FECHADO: não existe signUp no frontend.
  window.criarContaSupabase = function () {
    alert("Cadastro público desativado. Solicite acesso ao administrador do MegaLoot Pro.");
  };

  window.fazerLogin = async function () {
    const email = $("login-id")?.value.trim();
    const password = $("login-pwd")?.value || "";
    const btn = $("btn-login");
    if (!email || !password) return showMsg("msg-login", "Preencha e-mail e senha.", true);
    if (!supa) return showMsg("msg-login", "Supabase ainda não configurado.", true);
    btn.disabled = true; btn.textContent = "VALIDANDO...";
    try {
      const { data, error } = await supa.auth.signInWithPassword({ email, password });
      if (error) throw error;
      currentUserLogin = data.user.email;
      await openApplication();
    } catch (e) {
      showMsg("msg-login", e.message === "Invalid login credentials" ? "E-mail ou senha inválidos, ou acesso ainda não liberado." : e.message, true);
    } finally { btn.disabled = false; btn.textContent = "ACESSAR SISTEMA"; }
  };

  window.esqueciSenha = async function () {
    const email = $("esqueci-id")?.value.trim();
    const btn = $("btn-esqueci");
    if (!email) return showMsg("msg-esqueci", "Informe seu e-mail.", true);
    if (!supa) return showMsg("msg-esqueci", "Supabase ainda não configurado.", true);
    btn.disabled = true; btn.textContent = "ENVIANDO...";
    try {
      const { error } = await supa.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
      if (error) throw error;
      showMsg("msg-esqueci", "Se o acesso estiver cadastrado, o e-mail de recuperação será enviado.", false);
    } catch (e) { showMsg("msg-esqueci", e.message, true); }
    finally { btn.disabled = false; btn.textContent = "ENVIAR E-MAIL"; }
  };

  window.alterarSenhaSupabase = async function () {
    try {
      await getSession();
      const nova = prompt("Digite a nova senha (mínimo de 8 caracteres):");
      if (!nova) return;
      if (nova.length < 8) throw new Error("A senha precisa ter pelo menos 8 caracteres.");
      const confirmar = prompt("Repita a nova senha:");
      if (nova !== confirmar) throw new Error("As senhas não conferem.");
      const { error } = await supa.auth.updateUser({ password: nova });
      if (error) throw error;
      setMsg("cloud-status", "Senha alterada com sucesso.", "ok");
    } catch (e) { setMsg("cloud-status", e.message, "err"); }
  };

  async function openApplication() {
    $("login-screen").style.display = "none";
    $("app-core").style.display = "flex";
    requestWakeLock();
    loadSettings(); loadPrizes(); loadCustomVips(); loadAnnouncements(); loadCustomCommands(); loadHistory();
    resizeConfetti(); updateAllMultipliers();
    if ($("channel-name")?.value.trim()) connectTwitch();
  }

  function safeBackup() {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || DENIED_BACKUP_KEYS.has(key)) continue;
      if (key.startsWith("tw_") || key.startsWith("kk_") || /prizes|winners|vips|commands|announcements/i.test(key)) data[key] = localStorage.getItem(key);
    }
    return { version: 3, created_at: new Date().toISOString(), local_storage: data };
  }

  window.salvarBackupSupabase = async function (feedback = false) {
    try {
      const session = await getSession();
      const { error } = await supa.from("user_backups").upsert({ user_id: session.user.id, payload: safeBackup(), updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      if (error) throw error;
      if (feedback) setMsg("cloud-status", "Backup salvo com sucesso.", "ok");
    } catch (e) { setMsg("cloud-status", e.message, "err"); }
  };

  window.restaurarBackupSupabase = async function () {
    try {
      const session = await getSession();
      const { data, error } = await supa.from("user_backups").select("payload,updated_at").eq("user_id", session.user.id).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Nenhum backup encontrado para esta conta.");
      Object.entries(data.payload?.local_storage || {}).forEach(([key, value]) => {
        if (!DENIED_BACKUP_KEYS.has(key)) localStorage.setItem(key, value);
      });
      setMsg("cloud-status", "Backup restaurado. Recarregando...", "ok");
      setTimeout(() => location.reload(), 800);
    } catch (e) { setMsg("cloud-status", e.message, "err"); }
  };
  window.importarLegadoParaSupabase = () => window.salvarBackupSupabase(true);
  // Substitui a antiga sincronização do Google Apps Script pelo Supabase.
  window.salvarNuvem = function () { return window.salvarBackupSupabase(false); };

  function dvCredentials() {
    return { dv: $("dvapi-dv")?.value.trim() || "", key: $("dvapi-key")?.value.trim() || "" };
  }
  function saveDvSession() {
    const c = dvCredentials();
    sessionStorage.setItem("ml_dv", c.dv); sessionStorage.setItem("ml_dv_key", c.key);
  }
  function loadDvSession() {
    if ($("dvapi-dv")) $("dvapi-dv").value = sessionStorage.getItem("ml_dv") || "";
    if ($("dvapi-key")) $("dvapi-key").value = sessionStorage.getItem("ml_dv_key") || "";
  }
  async function callDvapi(action, extra = {}) {
    const session = await getSession();
    const c = dvCredentials();
    if (!c.dv || !c.key) throw new Error("Informe o Login DV e a API Key.");
    saveDvSession();
    const response = await fetch(`${window.MEGALOOT_SUPABASE_URL}/functions/v1/${window.MEGALOOT_DVAPI_FUNCTION || "dvapi-proxy"}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}`, "apikey": window.MEGALOOT_SUPABASE_ANON_KEY },
      body: JSON.stringify({ action, dv: c.dv, key: c.key, ...extra })
    });
    const data = await response.json().catch(() => ({ result: -999, error: "Resposta inválida" }));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }
  function dvError(code) {
    code = Number(code);
    return ({0:"Ação inválida.",[-1]:"Saldo insuficiente.",[-2]:"Personagem não encontrado.",[-100]:"Parâmetros incorretos.",[-101]:"Autenticação DVAPI incorreta."})[code] || `Falha DVAPI (${code}).`;
  }

  window.atualizarSaldoDvapi = async function () {
    setMsg("dv-updated", "Consultando...", "warn");
    try {
      const d = await callDvapi("getbalance");
      if (Number(d.result) !== 1) throw new Error(dvError(d.result));
      $("dv-bal-mp").textContent = fmt(d.mp); $("dv-bal-mc").textContent = fmt(d.mc); $("dv-bal-vip").textContent = fmt(d.megavip);
      setMsg("dv-updated", "Atualizado em " + new Date().toLocaleTimeString("pt-BR"), "ok");
    } catch (e) { setMsg("dv-updated", e.message, "err"); }
  };

  window.calcularLoteDvapi = function () {
    const total = Number($("dv-lot-total")?.value || 0), count = Number($("dv-lot-count")?.value || 0), type = $("dv-lot-type")?.value || "mp";
    const labels = { mp: "MPoints", mc: "MCoins", megavip: "dias MegaVIP" };
    const el = $("dv-lot-preview"); if (!el) return;
    el.textContent = Number.isInteger(total) && Number.isInteger(count) && total > 0 && count > 0 && total % count === 0 ? `${count} prêmios de ${fmt(total/count)} ${labels[type]}` : "O total deve ser inteiro e divisível pela quantidade.";
  };
  function makePrize(type, value, auto) {
    const labels = { mp: "MPoints", mc: "MCoins", megavip: "dias MegaVIP" };
    return `${PRIZE_PREFIX} ${value} ${labels[type]} [DVAPI:${type}:${auto ? "auto" : "manual"}]`;
  }
  function parsePrize(text) {
    const m = String(text || "").match(/^💰\s+(\d+)\s+(.+?)\s+\[DVAPI:(mp|mc|megavip):(auto|manual)\]$/i);
    return m ? { value:Number(m[1]), label:m[2], type:m[3].toLowerCase(), auto:m[4].toLowerCase()==="auto" } : null;
  }
  window.adicionarLoteDvapi = async function () {
    const type=$("dv-lot-type").value, total=Number($("dv-lot-total").value), count=Number($("dv-lot-count").value), auto=$("dv-auto").checked;
    if (!Number.isInteger(total) || !Number.isInteger(count) || total<=0 || count<=0 || total%count!==0) return setMsg("dv-lot-msg","O total precisa ser inteiro e divisível pela quantidade.","err");
    try {
      const b=await callDvapi("getbalance"); if(Number(b.result)!==1) throw new Error(dvError(b.result));
      const available=Number(type==="mp"?b.mp:type==="mc"?b.mc:b.megavip); if(available<total) throw new Error(`Saldo insuficiente. Disponível: ${fmt(available)}.`);
      const each=total/count; for(let i=0;i<count;i++) manualPrizes.push(makePrize(type,each,auto));
      savePrizes(); updatePrizeUI(); setMsg("dv-lot-msg",`${count} prêmios de ${fmt(each)} adicionados à fila.`,"ok");
    } catch(e){ setMsg("dv-lot-msg",e.message,"err"); }
  };

  async function logDelivery(row) {
    try { const s=await getSession(); await supa.from("reward_deliveries").insert({user_id:s.user.id,...row}); } catch(_) {}
  }
  async function deliver(charName) {
    if (!waitingDelivery || deliveryInProgress) return;
    deliveryInProgress=true; const w=waitingDelivery, action=w.prize.type==="mp"?"sendmpoints":w.prize.type==="mc"?"sendmcoins":"sendmegavip";
    try {
      sendChatMsg(`⏳ Validando ${charName} e processando o prêmio...`);
      const d=await callDvapi(action,{value:w.prize.value,player:charName,description:"MegaLoot"});
      if(Number(d.result)===1){sendChatMsg(`✅ ${w.prize.value} ${w.prize.label} enviados para ${charName}!`);await logDelivery({twitch_name:w.twitchName,player_name:charName,prize_type:w.prize.type,amount:w.prize.value,status:"delivered",api_result:d});waitingDelivery=null;}
      else if(Number(d.result)===-2){sendChatMsg(`❌ Personagem ${charName} não encontrado. Tente novamente: !nick NomeDoPersonagem`);await logDelivery({twitch_name:w.twitchName,player_name:charName,prize_type:w.prize.type,amount:w.prize.value,status:"player_not_found",api_result:d});}
      else{sendChatMsg("⚠️ Pagamento não concluído. O streamer deve verificar a pendência.");await logDelivery({twitch_name:w.twitchName,player_name:charName,prize_type:w.prize.type,amount:w.prize.value,status:"failed",api_result:d});}
    }catch(e){sendChatMsg("⚠️ DVAPI indisponível. Prêmio registrado para conferência manual.");await logDelivery({twitch_name:w.twitchName,player_name:charName,prize_type:w.prize.type,amount:w.prize.value,status:"error",api_result:{error:e.message}});} finally{deliveryInProgress=false;}
  }

  const originalConfirm=window.confirmWinnerPresence;
  window.confirmWinnerPresence=function(){
    const login=currentWinnerLogin, text=activePrizeText, was=winnerResponded; originalConfirm.apply(this,arguments); const p=parsePrize(text);
    if(!was&&p&&login&&participants[login]){
      if(p.auto){waitingDelivery={login,twitchName:participants[login].name,prize:p};sendChatMsg(`💰 @${participants[login].name}, para receber ${p.value} ${p.label}, digite !nick NomeDoPersonagem.`);}
      else{sendChatMsg(`📋 O prêmio de ${p.value} ${p.label} foi registrado para pagamento manual.`);logDelivery({twitch_name:participants[login].name,player_name:null,prize_type:p.type,amount:p.value,status:"pending_manual",api_result:{}});}
    }
  };
  const originalChat=window.handleChatCommands;
  window.handleChatCommands=function(msg){originalChat.apply(this,arguments);if(waitingDelivery&&msg.username===waitingDelivery.login){const m=String(msg.rawMessage||"").trim().match(/^!nick\s+([A-Za-z0-9_]{2,20})$/i);if(m)deliver(m[1]);}};

  // Mantém avatar e mostra MOD, VIP e SUB simultaneamente.
  const originalUI=window.updateUI;
  window.updateUI=function(){originalUI.apply(this,arguments);const cards=[...document.querySelectorAll("#participants-list .part-card")];Object.keys(participants).forEach((u,i)=>{const p=participants[u],c=cards[i];if(!c)return;c.querySelector(".role-badges-v2")?.remove();const b=[];if(p.isMod)b.push('<span class="role-badge-v2 mod">🛡 MOD</span>');if(p.isVip)b.push('<span class="role-badge-v2 vip">👑 VIP</span>');if(p.isSub)b.push('<span class="role-badge-v2 sub">⭐ SUB</span>');if(b.length)c.insertAdjacentHTML("afterbegin",`<div class="role-badges-v2">${b.join("")}</div>`);});};

  document.addEventListener("DOMContentLoaded",async()=>{
    initSupabase(); loadDvSession(); window.calcularLoteDvapi();
    $("dvapi-dv")?.addEventListener("change",saveDvSession); $("dvapi-key")?.addEventListener("change",saveDvSession);
    if(supa){const{data}=await supa.auth.getSession();if(data.session){currentUserLogin=data.session.user.email;await openApplication();}}
  });
})();
