const corsHeaders={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"};
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
 try{
  const body=await req.json();
  const allowed=new Set(["getbalance","sendmcoins","sendmpoints","sendmegavip"]);
  if(!allowed.has(body.action))throw new Error("Ação não permitida");
  if(!body.dv||!body.key)throw new Error("Credenciais DVAPI ausentes");
  if(body.action!=="getbalance"){
   if(!Number.isInteger(Number(body.value))||Number(body.value)<=0)throw new Error("Valor inválido");
   if(!/^[A-Za-z0-9_]{2,20}$/.test(String(body.player||"")))throw new Error("Personagem inválido");
  }
  const form=new URLSearchParams({dv:body.dv,key:body.key,action:body.action});
  if(body.value!=null)form.set("value",String(body.value));
  if(body.player)form.set("player",body.player);
  if(body.description)form.set("description",String(body.description).slice(0,15));
  const upstream=await fetch("https://megamu.net/dvapi.php",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:form});
  const text=await upstream.text();let data;try{data=JSON.parse(text)}catch{data={result:-999,error:"Resposta DVAPI inválida"}}
  return new Response(JSON.stringify(data),{status:upstream.ok?200:502,headers:{...corsHeaders,"Content-Type":"application/json"}});
 }catch(error){return new Response(JSON.stringify({result:-100,error:error.message}),{status:400,headers:{...corsHeaders,"Content-Type":"application/json"}})}
});
