import { useState, useEffect } from "react";
import { BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { db } from "./firebase.js";
import { collection, addDoc, deleteDoc, doc, onSnapshot, setDoc, getDoc } from "firebase/firestore";

const C = {
  bg:"#060D1F",card:"#0E1830",card2:"#162040",card3:"#1D2A50",
  border:"#253560",text:"#E8F0FF",muted:"#6480B0",
  blue:"#4F8EF7",blue2:"#2563EB",gold:"#F0B429",
  green:"#34D399",green2:"#059669",red:"#F87171",red2:"#DC2626",
  teal:"#22D3EE",purple:"#A78BFA",orange:"#FB923C",amber:"#FBBF24",
};

const CATS = {
  "Receitas":["Salário","Outros (Renda)"],
  "Necessidades básicas":["Água","Financiamento","Aluguel #2","Seguro de vida","Supermercado","Cartão de Crédito","Celular","Condomínio","Escolas (filhos)","Internet","Energia","Saúde","Plano de saúde","Transporte","Empréstimo","Extras (Casa)","Outros (Necessidades básicas)","Dízimo e Oferta","Seguro de Automóvel","Autocuidado","Gastos com Pet","Estacionamento"],
  "Lazer":["Alimentação (Gastos extras)","Assinaturas Mensais","Entretenimento mensal","Outros (lazer)","Jogos","Presentes","Roupas e Acessórios"],
  "Educação":["Educação"],
  "Longo Prazo":["Longo Prazo"],
  "Investimentos":["Liberdade Financeira","Reserva de Emergência"],
};
const TIPO_COR={"Receitas":C.green,"Necessidades básicas":C.orange,"Lazer":C.amber,"Educação":C.teal,"Longo Prazo":C.purple,"Investimentos":C.blue};
const ORC_INIT={rendaPrevista:9000,dividas:2835,necessidades:75,investimentos:10,longoP:0,educacao:0,lazer:15};
const GOAL_ICONS=["🏠","🚗","✈️","📱","💍","🎓","🌴","💰","🏋️","🎯","🏖️","💻"];

const fmtR=v=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(v||0);
const fmtK=v=>Math.abs(v||0)>=1000?`R$${((v||0)/1000).toFixed(1)}k`:`R$${(v||0).toFixed(0)}`;
const getMA=d=>{const dt=new Date(d+"T12:00:00");return`${String(dt.getMonth()+1).padStart(2,"0")}/${dt.getFullYear()}`;};
const hoje=()=>new Date().toISOString().split("T")[0];

function KPI({icon,label,value,sub,cor,small}){
  return(
    <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:small?"10px 12px":"13px 14px",flex:1,minWidth:0}}>
      <div style={{color:C.muted,fontSize:9,textTransform:"uppercase",letterSpacing:1.2,marginBottom:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{icon} {label}</div>
      <div style={{color:cor||C.blue,fontSize:small?15:18,fontWeight:800,fontFamily:"Georgia,serif",lineHeight:1.1}}>{value}</div>
      {sub&&<div style={{color:C.muted,fontSize:9,marginTop:2}}>{sub}</div>}
    </div>
  );
}
function Tag({label,cor}){return<span style={{fontSize:9,padding:"2px 7px",borderRadius:10,background:(cor||C.orange)+"25",color:cor||C.orange,border:`1px solid ${(cor||C.orange)}44`,whiteSpace:"nowrap"}}>{label}</span>;}
function ChartTip({active,payload,label}){
  if(!active||!payload?.length)return null;
  return(<div style={{background:C.card2,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 12px",fontSize:11}}><div style={{color:C.gold,fontWeight:700,marginBottom:4}}>{label}</div>{payload.map((p,i)=><div key={i} style={{color:p.color||C.text}}>{p.name}: <b>{fmtR(p.value)}</b></div>)}</div>);
}

// ── FORM MODAL ────────────────────────────────────────────────────────────────
function FormModal({onClose,onSave,contas,cartoes}){
  const[form,setForm]=useState({data:hoje(),valor:"",fluxo:"Saída",tipoFluxo:"Necessidades básicas",classificacao:"Supermercado",observacao:"",contaId:"",cartaoId:"",parcelado:false,parcelas:2});
  const[busy,setBusy]=useState(false);
  const[erro,setErro]=useState("");
  const setFluxo=f=>setForm(p=>({...p,fluxo:f,tipoFluxo:f==="Entrada"?"Receitas":"Necessidades básicas",classificacao:f==="Entrada"?"Salário":"Supermercado",cartaoId:"",contaId:""}));
  const setTipo=t=>setForm(p=>({...p,tipoFluxo:t,classificacao:CATS[t][0]}));
  const salvar=async()=>{
    if(!form.valor||parseFloat(form.valor)<=0){setErro("Informe um valor maior que zero");return;}
    setBusy(true);
    const val=parseFloat(form.valor.replace(",","."));
    await onSave({data:form.data,valor:val,fluxo:form.fluxo,tipoFluxo:form.tipoFluxo,classificacao:form.classificacao,observacao:form.observacao,mesAno:getMA(form.data),contaId:form.contaId||null,cartaoId:form.fluxo==="Saída"?(form.cartaoId||null):null,parcelado:form.parcelado&&!!form.cartaoId,parcelas:form.parcelado?parseInt(form.parcelas):1,valorParcela:form.parcelado?val/parseInt(form.parcelas):val});
    setBusy(false);onClose();
  };
  const inp={background:C.card2,border:`1px solid ${C.border}`,color:C.text,padding:"10px 12px",borderRadius:8,fontSize:13,width:"100%",boxSizing:"border-box",outline:"none"};
  return(
    <div style={{position:"fixed",inset:0,background:"#000c",zIndex:200,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
      <div style={{background:C.card,width:"100%",maxWidth:480,borderRadius:"20px 20px 0 0",padding:"16px 18px 36px",maxHeight:"94vh",overflowY:"auto",boxShadow:"0 -8px 40px #0008"}}>
        <div style={{width:40,height:4,background:C.border,borderRadius:2,margin:"0 auto 16px"}}/>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <span style={{color:C.gold,fontWeight:900,fontSize:15}}>✏️ Novo Lançamento</span>
          <button onClick={onClose} style={{background:"none",border:"none",color:C.muted,fontSize:22,cursor:"pointer"}}>×</button>
        </div>
        <div style={{display:"flex",gap:8,marginBottom:14}}>
          {["Saída","Entrada"].map(f=>(
            <button key={f} onClick={()=>setFluxo(f)} style={{flex:1,padding:"11px",borderRadius:10,cursor:"pointer",fontWeight:700,fontSize:13,background:form.fluxo===f?(f==="Saída"?C.red+"33":C.green+"33"):"transparent",border:`2px solid ${form.fluxo===f?(f==="Saída"?C.red:C.green):C.border}`,color:form.fluxo===f?(f==="Saída"?C.red:C.green):C.muted}}>
              {f==="Saída"?"💸 Despesa":"💰 Receita"}
            </button>
          ))}
        </div>
        <div style={{marginBottom:11}}>
          <label style={{color:C.muted,fontSize:10,display:"block",marginBottom:4}}>📅 DATA</label>
          <input type="date" value={form.data} onChange={e=>setForm(p=>({...p,data:e.target.value}))} style={inp}/>
        </div>
        <div style={{marginBottom:11}}>
          <label style={{color:C.muted,fontSize:10,display:"block",marginBottom:4}}>💵 VALOR (R$)</label>
          <input type="number" step="0.01" placeholder="0,00" value={form.valor} onChange={e=>{setErro("");setForm(p=>({...p,valor:e.target.value}));}} style={{...inp,fontSize:22,fontWeight:800,color:form.fluxo==="Saída"?C.red:C.green}} inputMode="decimal" autoFocus/>
          {erro&&<div style={{color:C.red,fontSize:11,marginTop:4}}>⚠ {erro}</div>}
        </div>
        {form.fluxo==="Saída"&&(
          <div style={{marginBottom:11}}>
            <label style={{color:C.muted,fontSize:10,display:"block",marginBottom:6}}>📂 CATEGORIA</label>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {Object.keys(CATS).filter(t=>t!=="Receitas").map(t=>(
                <button key={t} onClick={()=>setTipo(t)} style={{padding:"6px 11px",borderRadius:20,fontSize:11,cursor:"pointer",background:form.tipoFluxo===t?(TIPO_COR[t]+"33"):"transparent",border:`1px solid ${form.tipoFluxo===t?TIPO_COR[t]:C.border}`,color:form.tipoFluxo===t?TIPO_COR[t]:C.muted}}>{t}</button>
              ))}
            </div>
          </div>
        )}
        <div style={{marginBottom:11}}>
          <label style={{color:C.muted,fontSize:10,display:"block",marginBottom:4}}>🏷️ CLASSIFICAÇÃO</label>
          <select value={form.classificacao} onChange={e=>setForm(p=>({...p,classificacao:e.target.value}))} style={inp}>
            {(CATS[form.tipoFluxo]||[]).map(c=><option key={c}>{c}</option>)}
          </select>
        </div>
        {form.fluxo==="Saída"&&(
          <div style={{marginBottom:11}}>
            <label style={{color:C.muted,fontSize:10,display:"block",marginBottom:6}}>💳 PAGAR COM</label>
            <div style={{display:"flex",gap:6,marginBottom:6}}>
              <button onClick={()=>setForm(p=>({...p,cartaoId:"",parcelado:false}))} style={{flex:1,padding:"8px",borderRadius:8,cursor:"pointer",fontSize:11,background:!form.cartaoId?C.blue+"22":"transparent",border:`1px solid ${!form.cartaoId?C.blue:C.border}`,color:!form.cartaoId?C.blue:C.muted}}>🏦 Conta/Dinheiro</button>
              <button onClick={()=>cartoes.length>0&&setForm(p=>({...p,cartaoId:cartoes[0].id,contaId:""}))} style={{flex:1,padding:"8px",borderRadius:8,cursor:"pointer",fontSize:11,background:form.cartaoId?C.purple+"22":"transparent",border:`1px solid ${form.cartaoId?C.purple:C.border}`,color:form.cartaoId?C.purple:C.muted}}>
                💳 Cartão {cartoes.length===0?"(nenhum)":""}
              </button>
            </div>
            {form.cartaoId&&cartoes.length>0&&<select value={form.cartaoId} onChange={e=>setForm(p=>({...p,cartaoId:e.target.value}))} style={inp}>{cartoes.map(c=><option key={c.id} value={c.id}>{c.nome} – {c.titular}</option>)}</select>}
            {!form.cartaoId&&contas.length>0&&<select value={form.contaId} onChange={e=>setForm(p=>({...p,contaId:e.target.value}))} style={inp}><option value="">— Sem conta específica —</option>{contas.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}</select>}
          </div>
        )}
        {form.fluxo==="Entrada"&&contas.length>0&&(
          <div style={{marginBottom:11}}>
            <label style={{color:C.muted,fontSize:10,display:"block",marginBottom:4}}>🏦 RECEBER EM</label>
            <select value={form.contaId} onChange={e=>setForm(p=>({...p,contaId:e.target.value}))} style={inp}><option value="">— Sem conta específica —</option>{contas.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}</select>
          </div>
        )}
        {form.cartaoId&&(
          <div style={{marginBottom:11}}>
            <label style={{color:C.muted,fontSize:10,display:"block",marginBottom:6}}>📅 PARCELAMENTO</label>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <button onClick={()=>setForm(p=>({...p,parcelado:!p.parcelado}))} style={{padding:"8px 14px",borderRadius:8,cursor:"pointer",fontSize:11,background:form.parcelado?C.purple+"22":"transparent",border:`1px solid ${form.parcelado?C.purple:C.border}`,color:form.parcelado?C.purple:C.muted}}>{form.parcelado?"✅ Parcelado":"Parcelar?"}</button>
              {form.parcelado&&<div style={{flex:1,display:"flex",alignItems:"center",gap:6}}><input type="number" min="2" max="99" value={form.parcelas} onChange={e=>setForm(p=>({...p,parcelas:e.target.value}))} style={{...inp,width:60,textAlign:"center",fontSize:15,fontWeight:700}}/><span style={{color:C.muted,fontSize:11}}>{form.parcelas}x de {fmtR(parseFloat(form.valor||0)/parseInt(form.parcelas||1))}</span></div>}
            </div>
          </div>
        )}
        <div style={{marginBottom:18}}>
          <label style={{color:C.muted,fontSize:10,display:"block",marginBottom:4}}>📝 OBSERVAÇÃO (opcional)</label>
          <input type="text" placeholder="Ex: Conta de luz de maio..." value={form.observacao} onChange={e=>setForm(p=>({...p,observacao:e.target.value}))} style={inp}/>
        </div>
        <button onClick={salvar} disabled={busy} style={{width:"100%",background:busy?"#333":`linear-gradient(135deg,${C.blue},${C.blue2})`,border:"none",borderRadius:12,padding:"15px",color:"#fff",fontWeight:800,fontSize:15,cursor:busy?"not-allowed":"pointer",boxShadow:`0 4px 20px ${C.blue}44`}}>
          {busy?"Salvando ☁️...":"✅  Salvar Lançamento"}
        </button>
      </div>
    </div>
  );
}

// ── HOME TAB ──────────────────────────────────────────────────────────────────
function HomeTab({txMes,receitas,despesas,saldo,orcamento,evolucao,contas,cartoes,objetivos,transactions}){
  const totalContas=contas.reduce((s,c)=>s+(c.saldo||0),0);
  const totalFatura=cartoes.reduce((s,c)=>{
    const fatura=txMes.filter(t=>t.cartaoId===c.id).reduce((a,t)=>a+t.valor,0);
    return s+fatura;
  },0);
  const pieData=Object.keys(CATS).filter(k=>k!=="Receitas").map(tipo=>({tipo,valor:txMes.filter(t=>t.tipoFluxo===tipo).reduce((s,t)=>s+t.valor,0),cor:TIPO_COR[tipo]})).filter(d=>d.valor>0);
  const vazio=evolucao.every(e=>e.receita===0&&e.despesa===0);
  return(
    <div>
      {/* Saldo total */}
      <div style={{background:`linear-gradient(135deg,${C.card2},${C.card3})`,border:`1px solid ${C.border}`,borderRadius:16,padding:"18px 18px",marginBottom:10,textAlign:"center",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:-20,right:-20,width:80,height:80,background:C.blue+"15",borderRadius:"50%"}}/>
        <div style={{position:"absolute",bottom:-30,left:-20,width:100,height:100,background:C.gold+"08",borderRadius:"50%"}}/>
        <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:2,marginBottom:4}}>Saldo Total em Contas</div>
        <div style={{color:C.gold,fontSize:30,fontWeight:900,fontFamily:"Georgia,serif"}}>{fmtR(totalContas)}</div>
        <div style={{color:C.muted,fontSize:10,marginTop:4}}>💳 Fatura aberta: <span style={{color:totalFatura>0?C.red:C.muted}}>{fmtR(totalFatura)}</span></div>
      </div>

      <div style={{display:"flex",gap:7,marginBottom:7}}>
        <KPI icon="💰" label="Receitas" value={fmtK(receitas)} cor={C.green}/>
        <KPI icon="💸" label="Despesas" value={fmtK(despesas)} cor={C.orange}/>
        <KPI icon="📊" label="Saldo Mês" value={fmtK(saldo)} cor={saldo>=0?C.green:C.red}/>
      </div>

      {/* Contas resumo */}
      {contas.length>0&&(
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"12px 14px",marginBottom:10}}>
          <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1.2,marginBottom:10}}>🏦 Minhas Contas</div>
          {contas.slice(0,4).map(c=>{
            const delta=transactions.filter(t=>t.contaId===c.id).reduce((s,t)=>t.tipoFluxo==="Receitas"?s+t.valor:s-t.valor,0);
            return(
              <div key={c.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingBottom:8,marginBottom:8,borderBottom:`1px solid ${C.border}`}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{width:8,height:8,borderRadius:"50%",background:c.cor||C.blue,flexShrink:0}}/>
                  <div>
                    <div style={{fontSize:12,fontWeight:700}}>{c.nome}</div>
                    <div style={{fontSize:9,color:C.muted}}>{c.tipo}</div>
                  </div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:13,fontWeight:800,color:C.gold}}>{fmtR(c.saldo||0)}</div>
                  {delta!==0&&<div style={{fontSize:9,color:delta>0?C.green:C.red}}>{delta>0?"+":""}{fmtK(delta)} este mês</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Objetivos resumo */}
      {objetivos.filter(g=>g.status!=="concluido").length>0&&(
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"12px 14px",marginBottom:10}}>
          <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1.2,marginBottom:10}}>🎯 Objetivos</div>
          {objetivos.filter(g=>g.status!=="concluido").slice(0,3).map(g=>{
            const pct=Math.min((g.valorAtual||0)/(g.valorAlvo||1)*100,100);
            return(
              <div key={g.id} style={{marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                  <span style={{fontSize:12,fontWeight:700}}>{g.icone} {g.nome}</span>
                  <span style={{fontSize:11,color:C.gold}}>{pct.toFixed(0)}%</span>
                </div>
                <div style={{background:C.bg,borderRadius:6,height:6,overflow:"hidden"}}>
                  <div style={{width:`${pct}%`,height:"100%",background:`linear-gradient(90deg,${C.blue},${C.teal})`,borderRadius:6,transition:"width 0.6s"}}/>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",marginTop:2}}>
                  <span style={{fontSize:9,color:C.muted}}>{fmtR(g.valorAtual||0)}</span>
                  <span style={{fontSize:9,color:C.muted}}>Meta: {fmtR(g.valorAlvo)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {vazio?(
        <div style={{background:C.card,border:`1px dashed ${C.border}`,borderRadius:12,padding:24,textAlign:"center",marginBottom:12}}>
          <div style={{fontSize:32,marginBottom:8}}>🚀</div>
          <div style={{color:C.blue,fontWeight:700,fontSize:14,marginBottom:4}}>Tudo pronto!</div>
          <div style={{color:C.muted,fontSize:12}}>Toque no <b style={{color:C.gold}}>+</b> para adicionar seu primeiro lançamento</div>
        </div>
      ):(
        <>
          <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1.5,marginBottom:6}}>Evolução Mensal</div>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"10px 2px",marginBottom:12}}>
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={evolucao} barCategoryGap="25%">
                <CartesianGrid strokeDasharray="2 4" stroke={C.border}/>
                <XAxis dataKey="mes" tick={{fill:C.muted,fontSize:9}}/>
                <YAxis tickFormatter={fmtK} tick={{fill:C.muted,fontSize:8}} width={40}/>
                <Tooltip content={<ChartTip/>}/>
                <Bar dataKey="receita" name="Receita" fill={C.green} radius={[3,3,0,0]}/>
                <Bar dataKey="despesa" name="Despesa" fill={C.orange} radius={[3,3,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {pieData.length>0&&(
        <>
          <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1.5,marginBottom:6}}>Gastos por Categoria</div>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"10px 2px",marginBottom:12}}>
            <ResponsiveContainer width="100%" height={170}>
              <PieChart>
                <Pie data={pieData} dataKey="valor" nameKey="tipo" cx="42%" cy="50%" innerRadius={40} outerRadius={72}>
                  {pieData.map((d,i)=><Cell key={i} fill={d.cor} stroke={C.bg} strokeWidth={2}/>)}
                </Pie>
                <Legend iconSize={8} wrapperStyle={{fontSize:10}} formatter={v=><span style={{color:C.text}}>{v}</span>}/>
                <Tooltip formatter={(v,n)=>[fmtR(v),n]} contentStyle={{background:C.card2,border:`1px solid ${C.border}`,color:C.text,fontSize:11}}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {txMes.length>0&&(
        <>
          <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1.5,marginBottom:6}}>Últimos Lançamentos</div>
          {[...txMes].sort((a,b)=>new Date(b.data)-new Date(a.data)).slice(0,5).map(tx=>(
            <div key={tx.id} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 12px",marginBottom:6,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{minWidth:0,flex:1}}>
                <div style={{fontSize:12,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{tx.classificacao}</div>
                <div style={{fontSize:10,color:C.muted,marginTop:1,display:"flex",gap:4,flexWrap:"wrap"}}>{tx.data} <Tag label={tx.tipoFluxo} cor={TIPO_COR[tx.tipoFluxo]}/>{tx.cartaoId&&<Tag label="💳 Cartão" cor={C.purple}/>}{tx.parcelado&&<Tag label={`${tx.parcelas}x`} cor={C.teal}/>}</div>
              </div>
              <div style={{color:tx.tipoFluxo==="Receitas"?C.green:C.red,fontWeight:800,fontSize:14,marginLeft:10,whiteSpace:"nowrap"}}>{tx.tipoFluxo==="Receitas"?"+":"-"}{fmtK(tx.valor)}</div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ── TRANSAÇÕES TAB ────────────────────────────────────────────────────────────
function TransacoesTab({txMes,onDelete,selectedMes,cartoes,contas}){
  const[busca,setBusca]=useState("");
  const[filtroTipo,setFiltroTipo]=useState("Todos");
  const[confirmId,setConfirmId]=useState(null);
  const getCartaoNome=id=>cartoes.find(c=>c.id===id)?.nome||"";
  const getContaNome=id=>contas.find(c=>c.id===id)?.nome||"";
  const filtrados=[...txMes].filter(t=>{
    const matchBusca=!busca||t.classificacao.toLowerCase().includes(busca.toLowerCase())||(t.observacao||"").toLowerCase().includes(busca.toLowerCase());
    const matchTipo=filtroTipo==="Todos"||(filtroTipo==="Receitas"?t.tipoFluxo==="Receitas":t.tipoFluxo!=="Receitas");
    return matchBusca&&matchTipo;
  }).sort((a,b)=>new Date(b.data)-new Date(a.data));
  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1.5}}>{selectedMes} · {txMes.length}</div>
        <div style={{display:"flex",gap:8}}>
          <span style={{color:C.green,fontSize:11,fontWeight:700}}>↑{fmtK(txMes.filter(t=>t.tipoFluxo==="Receitas").reduce((s,t)=>s+t.valor,0))}</span>
          <span style={{color:C.red,fontSize:11,fontWeight:700}}>↓{fmtK(txMes.filter(t=>t.tipoFluxo!=="Receitas").reduce((s,t)=>s+t.valor,0))}</span>
        </div>
      </div>
      <input placeholder="🔍 Buscar..." value={busca} onChange={e=>setBusca(e.target.value)} style={{width:"100%",background:C.card,border:`1px solid ${C.border}`,color:C.text,padding:"9px 12px",borderRadius:8,fontSize:12,marginBottom:8,boxSizing:"border-box",outline:"none"}}/>
      <div style={{display:"flex",gap:6,marginBottom:12}}>
        {["Todos","Receitas","Despesas"].map(f=><button key={f} onClick={()=>setFiltroTipo(f)} style={{padding:"5px 12px",borderRadius:16,fontSize:11,cursor:"pointer",background:filtroTipo===f?C.blue+"33":"transparent",border:`1px solid ${filtroTipo===f?C.blue:C.border}`,color:filtroTipo===f?C.blue:C.muted}}>{f}</button>)}
      </div>
      {filtrados.length===0?(
        <div style={{background:C.card,border:`1px dashed ${C.border}`,borderRadius:10,padding:24,textAlign:"center"}}>
          <div style={{fontSize:28,marginBottom:8}}>📋</div>
          <div style={{color:C.muted,fontSize:12}}>{busca?"Nenhum resultado":"Nenhum lançamento neste mês"}</div>
        </div>
      ):filtrados.map(tx=>(
        <div key={tx.id} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 12px",marginBottom:7}}>
          {confirmId===tx.id?(
            <div style={{textAlign:"center"}}>
              <div style={{color:C.red,fontSize:12,marginBottom:8}}>Remover este lançamento?</div>
              <div style={{display:"flex",gap:8}}><button onClick={()=>{onDelete(tx.id);setConfirmId(null);}} style={{flex:1,background:C.red,border:"none",borderRadius:6,padding:"7px",color:"#fff",fontWeight:700,cursor:"pointer",fontSize:12}}>Sim</button><button onClick={()=>setConfirmId(null)} style={{flex:1,background:"none",border:`1px solid ${C.border}`,borderRadius:6,padding:"7px",color:C.muted,cursor:"pointer",fontSize:12}}>Cancelar</button></div>
            </div>
          ):(
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:12,fontWeight:700,marginBottom:3}}>{tx.classificacao}</div>
                <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:2}}><Tag label={tx.tipoFluxo} cor={TIPO_COR[tx.tipoFluxo]}/>{tx.cartaoId&&<Tag label={`💳 ${getCartaoNome(tx.cartaoId)}`} cor={C.purple}/>}{tx.contaId&&<Tag label={`🏦 ${getContaNome(tx.contaId)}`} cor={C.blue}/>}{tx.parcelado&&<Tag label={`${tx.parcelas}x de ${fmtR(tx.valorParcela)}`} cor={C.teal}/>}</div>
                <div style={{fontSize:10,color:C.muted}}>{tx.data}{tx.observacao&&` · "${tx.observacao}"`}</div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                <span style={{color:tx.tipoFluxo==="Receitas"?C.green:C.red,fontWeight:800,fontSize:13}}>{tx.tipoFluxo==="Receitas"?"+":"-"}{fmtR(tx.valor)}</span>
                <button onClick={()=>setConfirmId(tx.id)} style={{background:"none",border:"none",color:C.border,cursor:"pointer",fontSize:17,padding:2}}>×</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── CONTAS TAB ────────────────────────────────────────────────────────────────
function ContasTab({contas,onSaveContas,transactions}){
  const[showAdd,setShowAdd]=useState(false);
  const[editId,setEditId]=useState(null);
  const[form,setForm]=useState({nome:"",tipo:"Corrente",saldo:0,saldoInicial:0,cor:C.blue});
  const[saving,setSaving]=useState(false);
  const cores=[C.blue,C.green,C.purple,C.teal,C.gold,C.orange,C.red,C.amber];
  const totalSaldo=contas.reduce((s,c)=>s+(c.saldo||0),0);

  const salvar=async()=>{
    if(!form.nome){return;}
    setSaving(true);
    let novas;
    if(editId){novas=contas.map(c=>c.id===editId?{...c,...form}:c);}
    else{novas=[...contas,{...form,id:Date.now().toString()}];}
    await onSaveContas(novas);
    setSaving(false);setShowAdd(false);setEditId(null);setForm({nome:"",tipo:"Corrente",saldo:0,saldoInicial:0,cor:C.blue});
  };

  const inp={background:C.card2,border:`1px solid ${C.border}`,color:C.text,padding:"10px 12px",borderRadius:8,fontSize:13,width:"100%",boxSizing:"border-box",outline:"none"};

  return(
    <div>
      <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1.5,marginBottom:10}}>🏦 Minhas Contas</div>

      {/* Total */}
      <div style={{background:`linear-gradient(135deg,${C.card2},${C.card3})`,border:`1px solid ${C.border}`,borderRadius:14,padding:"16px",marginBottom:12,textAlign:"center"}}>
        <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1.5,marginBottom:4}}>Saldo Total</div>
        <div style={{color:C.gold,fontSize:26,fontWeight:900,fontFamily:"Georgia,serif"}}>{fmtR(totalSaldo)}</div>
      </div>

      {contas.length===0?(
        <div style={{background:C.card,border:`1px dashed ${C.border}`,borderRadius:10,padding:24,textAlign:"center",marginBottom:12}}>
          <div style={{fontSize:28,marginBottom:8}}>🏦</div>
          <div style={{color:C.muted,fontSize:12}}>Nenhuma conta cadastrada</div>
        </div>
      ):contas.map(c=>{
        const delta=transactions.filter(t=>t.contaId===c.id).reduce((s,t)=>t.tipoFluxo==="Receitas"?s+t.valor:s-t.valor,0);
        return(
          <div key={c.id} style={{background:C.card,border:`1px solid ${C.border}`,borderLeft:`4px solid ${c.cor||C.blue}`,borderRadius:10,padding:"12px 14px",marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div>
                <div style={{fontSize:13,fontWeight:800,marginBottom:2}}>{c.nome}</div>
                <div style={{fontSize:10,color:C.muted}}>{c.tipo}</div>
                {c.saldoInicial>0&&<div style={{fontSize:9,color:C.muted,marginTop:2}}>Inicial: {fmtR(c.saldoInicial)}</div>}
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:16,fontWeight:800,color:C.gold}}>{fmtR(c.saldo||0)}</div>
                {delta!==0&&<div style={{fontSize:10,color:delta>0?C.green:C.red,marginTop:2}}>{delta>0?"▲":"▼"} {fmtR(Math.abs(delta))} este mês</div>}
                <button onClick={()=>{setEditId(c.id);setForm({...c});setShowAdd(true);}} style={{background:"none",border:`1px solid ${C.border}`,color:C.muted,borderRadius:6,padding:"2px 8px",cursor:"pointer",fontSize:10,marginTop:6}}>✏️ Editar</button>
              </div>
            </div>
          </div>
        );
      })}

      <button onClick={()=>{setEditId(null);setForm({nome:"",tipo:"Corrente",saldo:0,saldoInicial:0,cor:C.blue});setShowAdd(true);}} style={{width:"100%",background:"none",border:`1px dashed ${C.border}`,color:C.blue,padding:"12px",borderRadius:10,cursor:"pointer",fontSize:13,fontWeight:700,marginTop:4}}>+ Adicionar Conta</button>

      {showAdd&&(
        <div style={{position:"fixed",inset:0,background:"#000c",zIndex:200,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
          <div style={{background:C.card,width:"100%",maxWidth:480,borderRadius:"20px 20px 0 0",padding:"20px 18px 36px",maxHeight:"90vh",overflowY:"auto"}}>
            <div style={{width:40,height:4,background:C.border,borderRadius:2,margin:"0 auto 16px"}}/>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:16}}>
              <span style={{color:C.gold,fontWeight:900,fontSize:15}}>🏦 {editId?"Editar":"Nova"} Conta</span>
              <button onClick={()=>setShowAdd(false)} style={{background:"none",border:"none",color:C.muted,fontSize:22,cursor:"pointer"}}>×</button>
            </div>
            <div style={{marginBottom:11}}><label style={{color:C.muted,fontSize:10,display:"block",marginBottom:4}}>NOME DA CONTA</label><input value={form.nome} onChange={e=>setForm(p=>({...p,nome:e.target.value}))} placeholder="Ex: Nubank, Itaú, XP..." style={inp}/></div>
            <div style={{marginBottom:11}}><label style={{color:C.muted,fontSize:10,display:"block",marginBottom:4}}>TIPO</label><select value={form.tipo} onChange={e=>setForm(p=>({...p,tipo:e.target.value}))} style={inp}>{["Corrente","Poupança","Investimento","Corretora","Carteira","Outro"].map(t=><option key={t}>{t}</option>)}</select></div>
            <div style={{marginBottom:11}}><label style={{color:C.muted,fontSize:10,display:"block",marginBottom:4}}>SALDO INICIAL (R$)</label><input type="number" value={form.saldoInicial||0} onChange={e=>setForm(p=>({...p,saldoInicial:parseFloat(e.target.value)||0}))} style={inp}/></div>
            <div style={{marginBottom:11}}><label style={{color:C.muted,fontSize:10,display:"block",marginBottom:4}}>SALDO ATUAL (R$)</label><input type="number" value={form.saldo||0} onChange={e=>setForm(p=>({...p,saldo:parseFloat(e.target.value)||0}))} style={{...inp,fontSize:18,fontWeight:800,color:C.gold}}/></div>
            <div style={{marginBottom:16}}>
              <label style={{color:C.muted,fontSize:10,display:"block",marginBottom:6}}>COR</label>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{cores.map(cor=><button key={cor} onClick={()=>setForm(p=>({...p,cor}))} style={{width:28,height:28,borderRadius:"50%",background:cor,border:`3px solid ${form.cor===cor?"#fff":"transparent"}`,cursor:"pointer"}}/>)}</div>
            </div>
            <button onClick={salvar} disabled={saving} style={{width:"100%",background:saving?"#333":`linear-gradient(135deg,${C.blue},${C.blue2})`,border:"none",borderRadius:12,padding:"14px",color:"#fff",fontWeight:800,fontSize:14,cursor:saving?"not-allowed":"pointer"}}>
              {saving?"Salvando...":"Salvar Conta"}
            </button>
            {editId&&<button onClick={async()=>{await onSaveContas(contas.filter(c=>c.id!==editId));setShowAdd(false);setEditId(null);}} style={{width:"100%",background:"none",border:`1px solid ${C.red}`,color:C.red,borderRadius:12,padding:"11px",cursor:"pointer",marginTop:8,fontSize:13}}>🗑 Excluir Conta</button>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── CARTÕES TAB ───────────────────────────────────────────────────────────────
function CartoesTab({cartoes,onSaveCartoes,transactions,selectedMes}){
  const[showAdd,setShowAdd]=useState(false);
  const[editId,setEditId]=useState(null);
  const[form,setForm]=useState({nome:"",titular:"",limite:0,diaFechamento:1,cor:C.purple});
  const[saving,setSaving]=useState(false);
  const cores=[C.purple,C.blue,C.teal,C.green,C.gold,C.orange,C.red];
  const inp={background:C.card2,border:`1px solid ${C.border}`,color:C.text,padding:"10px 12px",borderRadius:8,fontSize:13,width:"100%",boxSizing:"border-box",outline:"none"};

  const salvar=async()=>{
    if(!form.nome)return;
    setSaving(true);
    let novos;
    if(editId){novos=cartoes.map(c=>c.id===editId?{...c,...form}:c);}
    else{novos=[...cartoes,{...form,id:Date.now().toString()}];}
    await onSaveCartoes(novos);
    setSaving(false);setShowAdd(false);setEditId(null);setForm({nome:"",titular:"",limite:0,diaFechamento:1,cor:C.purple});
  };

  return(
    <div>
      <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1.5,marginBottom:10}}>💳 Cartões de Crédito</div>

      {cartoes.length===0?(
        <div style={{background:C.card,border:`1px dashed ${C.border}`,borderRadius:10,padding:24,textAlign:"center",marginBottom:12}}>
          <div style={{fontSize:28,marginBottom:8}}>💳</div>
          <div style={{color:C.muted,fontSize:12}}>Nenhum cartão cadastrado</div>
        </div>
      ):cartoes.map(c=>{
        const txCartao=transactions.filter(t=>t.cartaoId===c.id&&t.mesAno===selectedMes);
        const faturaAtual=txCartao.reduce((s,t)=>s+t.valor,0);
        const parcelados=transactions.filter(t=>t.cartaoId===c.id&&t.parcelado);
        const limiteUsado=(faturaAtual/(c.limite||1))*100;
        return(
          <div key={c.id} style={{background:`linear-gradient(135deg,${C.card2},${C.card3})`,border:`1px solid ${c.cor||C.purple}44`,borderRadius:14,padding:"16px",marginBottom:10,position:"relative",overflow:"hidden"}}>
            <div style={{position:"absolute",top:-20,right:-20,width:80,height:80,background:(c.cor||C.purple)+"15",borderRadius:"50%"}}/>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
              <div>
                <div style={{fontSize:14,fontWeight:900,color:C.text}}>{c.nome}</div>
                <div style={{fontSize:10,color:C.muted}}>Titular: {c.titular}</div>
              </div>
              <button onClick={()=>{setEditId(c.id);setForm({...c});setShowAdd(true);}} style={{background:"none",border:`1px solid ${C.border}`,color:C.muted,borderRadius:6,padding:"2px 8px",cursor:"pointer",fontSize:10}}>✏️</button>
            </div>
            <div style={{display:"flex",gap:12,marginBottom:10}}>
              <div style={{flex:1}}><div style={{color:C.muted,fontSize:9}}>FATURA ATUAL</div><div style={{color:C.red,fontSize:16,fontWeight:800}}>{fmtR(faturaAtual)}</div></div>
              <div style={{flex:1}}><div style={{color:C.muted,fontSize:9}}>LIMITE DISPONÍVEL</div><div style={{color:C.green,fontSize:16,fontWeight:800}}>{fmtR((c.limite||0)-faturaAtual)}</div></div>
            </div>
            <div style={{background:C.bg,borderRadius:6,height:8,overflow:"hidden",marginBottom:6}}>
              <div style={{width:`${Math.min(limiteUsado,100)}%`,height:"100%",background:limiteUsado>80?C.red:limiteUsado>60?C.orange:(c.cor||C.purple),borderRadius:6,transition:"width 0.6s"}}/>
            </div>
            <div style={{fontSize:9,color:C.muted,marginBottom:10}}>Limite total: {fmtR(c.limite||0)} · Fecha dia {c.diaFechamento}</div>

            {txCartao.length>0&&(
              <>
                <div style={{color:C.muted,fontSize:9,textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>Lançamentos do mês</div>
                {txCartao.slice(0,3).map(t=>(
                  <div key={t.id} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:`1px solid ${C.border}`,fontSize:11}}>
                    <span style={{color:C.text}}>{t.classificacao}{t.parcelado?` (${t.parcelas}x)`:""}</span>
                    <span style={{color:C.red,fontWeight:700}}>-{fmtR(t.valor)}</span>
                  </div>
                ))}
                {txCartao.length>3&&<div style={{fontSize:10,color:C.muted,marginTop:4,textAlign:"center"}}>+{txCartao.length-3} lançamentos</div>}
              </>
            )}

            {parcelados.length>0&&(
              <div style={{marginTop:8}}>
                <div style={{color:C.teal,fontSize:9,textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>Parcelamentos em andamento</div>
                {parcelados.slice(0,2).map(t=>(
                  <div key={t.id} style={{fontSize:10,color:C.muted,display:"flex",justifyContent:"space-between",padding:"3px 0"}}>
                    <span>{t.classificacao}</span>
                    <span style={{color:C.teal}}>{t.parcelas}x de {fmtR(t.valorParcela||t.valor)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      <button onClick={()=>{setEditId(null);setForm({nome:"",titular:"",limite:0,diaFechamento:1,cor:C.purple});setShowAdd(true);}} style={{width:"100%",background:"none",border:`1px dashed ${C.border}`,color:C.purple,padding:"12px",borderRadius:10,cursor:"pointer",fontSize:13,fontWeight:700}}>+ Adicionar Cartão</button>

      {showAdd&&(
        <div style={{position:"fixed",inset:0,background:"#000c",zIndex:200,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
          <div style={{background:C.card,width:"100%",maxWidth:480,borderRadius:"20px 20px 0 0",padding:"20px 18px 36px",maxHeight:"90vh",overflowY:"auto"}}>
            <div style={{width:40,height:4,background:C.border,borderRadius:2,margin:"0 auto 16px"}}/>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:16}}>
              <span style={{color:C.gold,fontWeight:900,fontSize:15}}>💳 {editId?"Editar":"Novo"} Cartão</span>
              <button onClick={()=>setShowAdd(false)} style={{background:"none",border:"none",color:C.muted,fontSize:22,cursor:"pointer"}}>×</button>
            </div>
            <div style={{marginBottom:11}}><label style={{color:C.muted,fontSize:10,display:"block",marginBottom:4}}>NOME DO CARTÃO</label><input value={form.nome} onChange={e=>setForm(p=>({...p,nome:e.target.value}))} placeholder="Ex: Nubank, Itaú Visa..." style={inp}/></div>
            <div style={{marginBottom:11}}><label style={{color:C.muted,fontSize:10,display:"block",marginBottom:4}}>TITULAR</label><input value={form.titular} onChange={e=>setForm(p=>({...p,titular:e.target.value}))} placeholder="Ex: Gabriel, Ana..." style={inp}/></div>
            <div style={{marginBottom:11}}><label style={{color:C.muted,fontSize:10,display:"block",marginBottom:4}}>LIMITE (R$)</label><input type="number" value={form.limite||0} onChange={e=>setForm(p=>({...p,limite:parseFloat(e.target.value)||0}))} style={{...inp,fontSize:18,fontWeight:800,color:C.gold}}/></div>
            <div style={{marginBottom:11}}><label style={{color:C.muted,fontSize:10,display:"block",marginBottom:4}}>DIA DE FECHAMENTO</label><input type="number" min="1" max="31" value={form.diaFechamento||1} onChange={e=>setForm(p=>({...p,diaFechamento:parseInt(e.target.value)||1}))} style={inp}/></div>
            <div style={{marginBottom:16}}>
              <label style={{color:C.muted,fontSize:10,display:"block",marginBottom:6}}>COR</label>
              <div style={{display:"flex",gap:8}}>{cores.map(cor=><button key={cor} onClick={()=>setForm(p=>({...p,cor}))} style={{width:28,height:28,borderRadius:"50%",background:cor,border:`3px solid ${form.cor===cor?"#fff":"transparent"}`,cursor:"pointer"}}/>)}</div>
            </div>
            <button onClick={salvar} disabled={saving} style={{width:"100%",background:saving?"#333":`linear-gradient(135deg,${C.purple},${C.blue})`,border:"none",borderRadius:12,padding:"14px",color:"#fff",fontWeight:800,fontSize:14,cursor:saving?"not-allowed":"pointer"}}>
              {saving?"Salvando...":"Salvar Cartão"}
            </button>
            {editId&&<button onClick={async()=>{await onSaveCartoes(cartoes.filter(c=>c.id!==editId));setShowAdd(false);setEditId(null);}} style={{width:"100%",background:"none",border:`1px solid ${C.red}`,color:C.red,borderRadius:12,padding:"11px",cursor:"pointer",marginTop:8,fontSize:13}}>🗑 Excluir Cartão</button>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── OBJETIVOS TAB ─────────────────────────────────────────────────────────────
function ObjetivosTab({objetivos,onSaveObjetivos}){
  const[showAdd,setShowAdd]=useState(false);
  const[editId,setEditId]=useState(null);
  const[showContrib,setShowContrib]=useState(null);
  const[contrib,setContrib]=useState("");
  const[form,setForm]=useState({nome:"",valorAlvo:0,valorAtual:0,prazo:"",icone:"🎯",status:"ativo"});
  const[saving,setSaving]=useState(false);
  const inp={background:C.card2,border:`1px solid ${C.border}`,color:C.text,padding:"10px 12px",borderRadius:8,fontSize:13,width:"100%",boxSizing:"border-box",outline:"none"};

  const salvar=async()=>{
    if(!form.nome||!form.valorAlvo)return;
    setSaving(true);
    let novos;
    if(editId){novos=objetivos.map(g=>g.id===editId?{...g,...form}:g);}
    else{novos=[...objetivos,{...form,id:Date.now().toString()}];}
    await onSaveObjetivos(novos);
    setSaving(false);setShowAdd(false);setEditId(null);setForm({nome:"",valorAlvo:0,valorAtual:0,prazo:"",icone:"🎯",status:"ativo"});
  };

  const addContrib=async(goalId)=>{
    const val=parseFloat(contrib)||0;
    if(val<=0)return;
    setSaving(true);
    const novos=objetivos.map(g=>{
      if(g.id!==goalId)return g;
      const novoValor=(g.valorAtual||0)+val;
      return{...g,valorAtual:novoValor,status:novoValor>=g.valorAlvo?"concluido":"ativo"};
    });
    await onSaveObjetivos(novos);
    setSaving(false);setShowContrib(null);setContrib("");
  };

  const ativos=objetivos.filter(g=>g.status!=="concluido");
  const concluidos=objetivos.filter(g=>g.status==="concluido");

  return(
    <div>
      <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1.5,marginBottom:10}}>🎯 Meus Objetivos</div>

      {ativos.length===0&&concluidos.length===0?(
        <div style={{background:C.card,border:`1px dashed ${C.border}`,borderRadius:10,padding:28,textAlign:"center",marginBottom:12}}>
          <div style={{fontSize:36,marginBottom:8}}>🎯</div>
          <div style={{color:C.blue,fontWeight:700,fontSize:14,marginBottom:4}}>Defina seus objetivos!</div>
          <div style={{color:C.muted,fontSize:12}}>Casa própria, viagem, aposentadoria... tudo começa com um objetivo.</div>
        </div>
      ):null}

      {ativos.map(g=>{
        const pct=Math.min((g.valorAtual||0)/(g.valorAlvo||1)*100,100);
        const restante=(g.valorAlvo||0)-(g.valorAtual||0);
        return(
          <div key={g.id} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"14px",marginBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
              <div>
                <div style={{fontSize:14,fontWeight:800}}>{g.icone} {g.nome}</div>
                {g.prazo&&<div style={{fontSize:10,color:C.muted,marginTop:2}}>📅 Prazo: {g.prazo}</div>}
              </div>
              <button onClick={()=>{setEditId(g.id);setForm({...g});setShowAdd(true);}} style={{background:"none",border:`1px solid ${C.border}`,color:C.muted,borderRadius:6,padding:"2px 8px",cursor:"pointer",fontSize:10}}>✏️</button>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
              <span style={{color:C.blue,fontSize:13,fontWeight:800}}>{fmtR(g.valorAtual||0)}</span>
              <span style={{color:C.gold,fontSize:13,fontWeight:800}}>Meta: {fmtR(g.valorAlvo)}</span>
            </div>
            <div style={{background:C.bg,borderRadius:8,height:12,overflow:"hidden",marginBottom:4}}>
              <div style={{width:`${pct}%`,height:"100%",background:`linear-gradient(90deg,${C.blue},${C.teal})`,borderRadius:8,transition:"width 0.8s",position:"relative"}}>
                {pct>15&&<div style={{position:"absolute",right:6,top:"50%",transform:"translateY(-50%)",fontSize:8,color:"#fff",fontWeight:700}}>{pct.toFixed(0)}%</div>}
              </div>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
              <span style={{fontSize:9,color:C.muted}}>{pct.toFixed(1)}% atingido</span>
              <span style={{fontSize:9,color:C.muted}}>Falta: {fmtR(Math.max(restante,0))}</span>
            </div>
            {showContrib===g.id?(
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <input type="number" placeholder="Valor a adicionar..." value={contrib} onChange={e=>setContrib(e.target.value)} style={{...inp,flex:1,fontSize:14,color:C.blue}} inputMode="decimal" autoFocus/>
                <button onClick={()=>addContrib(g.id)} style={{padding:"10px 14px",background:`linear-gradient(135deg,${C.blue},${C.blue2})`,border:"none",borderRadius:8,color:"#fff",fontWeight:700,cursor:"pointer",fontSize:12}}>+ Add</button>
                <button onClick={()=>{setShowContrib(null);setContrib("");}} style={{padding:"10px",background:"none",border:`1px solid ${C.border}`,borderRadius:8,color:C.muted,cursor:"pointer"}}>×</button>
              </div>
            ):(
              <button onClick={()=>setShowContrib(g.id)} style={{width:"100%",background:`${C.blue}22`,border:`1px solid ${C.blue}44`,color:C.blue,padding:"9px",borderRadius:8,cursor:"pointer",fontSize:12,fontWeight:700}}>
                + Adicionar valor ao objetivo
              </button>
            )}
          </div>
        );
      })}

      {concluidos.length>0&&(
        <>
          <div style={{color:C.green,fontSize:10,textTransform:"uppercase",letterSpacing:1.5,marginBottom:8,marginTop:4}}>✅ Concluídos ({concluidos.length})</div>
          {concluidos.map(g=>(
            <div key={g.id} style={{background:C.card,border:`1px solid ${C.green}44`,borderRadius:10,padding:"12px 14px",marginBottom:8,opacity:0.7}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:12,fontWeight:700}}>{g.icone} {g.nome}</span>
                <span style={{color:C.green,fontSize:11,fontWeight:700}}>✅ {fmtR(g.valorAlvo)}</span>
              </div>
            </div>
          ))}
        </>
      )}

      <button onClick={()=>{setEditId(null);setForm({nome:"",valorAlvo:0,valorAtual:0,prazo:"",icone:"🎯",status:"ativo"});setShowAdd(true);}} style={{width:"100%",background:"none",border:`1px dashed ${C.border}`,color:C.teal,padding:"12px",borderRadius:10,cursor:"pointer",fontSize:13,fontWeight:700,marginTop:4}}>+ Criar Novo Objetivo</button>

      {showAdd&&(
        <div style={{position:"fixed",inset:0,background:"#000c",zIndex:200,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
          <div style={{background:C.card,width:"100%",maxWidth:480,borderRadius:"20px 20px 0 0",padding:"20px 18px 36px",maxHeight:"90vh",overflowY:"auto"}}>
            <div style={{width:40,height:4,background:C.border,borderRadius:2,margin:"0 auto 16px"}}/>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:16}}>
              <span style={{color:C.gold,fontWeight:900,fontSize:15}}>🎯 {editId?"Editar":"Novo"} Objetivo</span>
              <button onClick={()=>setShowAdd(false)} style={{background:"none",border:"none",color:C.muted,fontSize:22,cursor:"pointer"}}>×</button>
            </div>
            <div style={{marginBottom:10}}>
              <label style={{color:C.muted,fontSize:10,display:"block",marginBottom:6}}>ÍCONE</label>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>{GOAL_ICONS.map(ic=><button key={ic} onClick={()=>setForm(p=>({...p,icone:ic}))} style={{fontSize:20,padding:6,borderRadius:8,border:`2px solid ${form.icone===ic?C.gold:C.border}`,background:form.icone===ic?C.gold+"22":"transparent",cursor:"pointer"}}>{ic}</button>)}</div>
            </div>
            <div style={{marginBottom:11}}><label style={{color:C.muted,fontSize:10,display:"block",marginBottom:4}}>NOME DO OBJETIVO</label><input value={form.nome} onChange={e=>setForm(p=>({...p,nome:e.target.value}))} placeholder="Ex: Casa própria, Viagem, Carro..." style={inp}/></div>
            <div style={{marginBottom:11}}><label style={{color:C.muted,fontSize:10,display:"block",marginBottom:4}}>VALOR DA META (R$)</label><input type="number" value={form.valorAlvo||0} onChange={e=>setForm(p=>({...p,valorAlvo:parseFloat(e.target.value)||0}))} style={{...inp,fontSize:18,fontWeight:800,color:C.gold}}/></div>
            <div style={{marginBottom:11}}><label style={{color:C.muted,fontSize:10,display:"block",marginBottom:4}}>VALOR ATUAL (R$)</label><input type="number" value={form.valorAtual||0} onChange={e=>setForm(p=>({...p,valorAtual:parseFloat(e.target.value)||0}))} style={inp}/></div>
            <div style={{marginBottom:16}}><label style={{color:C.muted,fontSize:10,display:"block",marginBottom:4}}>PRAZO (opcional)</label><input type="date" value={form.prazo||""} onChange={e=>setForm(p=>({...p,prazo:e.target.value}))} style={inp}/></div>
            <button onClick={salvar} disabled={saving} style={{width:"100%",background:saving?"#333":`linear-gradient(135deg,${C.teal},${C.blue})`,border:"none",borderRadius:12,padding:"14px",color:"#fff",fontWeight:800,fontSize:14,cursor:saving?"not-allowed":"pointer"}}>
              {saving?"Salvando...":"Salvar Objetivo"}
            </button>
            {editId&&<button onClick={async()=>{await onSaveObjetivos(objetivos.filter(g=>g.id!==editId));setShowAdd(false);setEditId(null);}} style={{width:"100%",background:"none",border:`1px solid ${C.red}`,color:C.red,borderRadius:12,padding:"11px",cursor:"pointer",marginTop:8,fontSize:13}}>🗑 Excluir Objetivo</button>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── ORÇAMENTO TAB ─────────────────────────────────────────────────────────────
function OrcamentoTab({txMes,orcamento,onSaveOrcamento}){
  const[editando,setEditando]=useState(false);
  const[tmp,setTmp]=useState(orcamento);
  const[saving,setSaving]=useState(false);
  const rendaReal=orcamento.rendaPrevista-orcamento.dividas;
  const keyMap={"Necessidades básicas":"necessidades","Lazer":"lazer","Educação":"educacao","Longo Prazo":"longoP","Investimentos":"investimentos"};
  const planejados=Object.keys(keyMap).map(t=>({tipo:t,planejado:(orcamento[keyMap[t]]||0)/100*rendaReal,gasto:txMes.filter(tx=>tx.tipoFluxo===t).reduce((s,tx)=>s+tx.valor,0),cor:TIPO_COR[t]}));
  const salvarOrc=async()=>{setSaving(true);await onSaveOrcamento(tmp);setSaving(false);setEditando(false);};
  const inp={background:C.card2,border:`1px solid ${C.border}`,color:C.text,padding:"9px 11px",borderRadius:8,fontSize:13,width:"100%",boxSizing:"border-box",outline:"none"};
  return(
    <div>
      <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1.5,marginBottom:10}}>🎯 Orçamento Mensal</div>
      <div style={{display:"flex",gap:7,marginBottom:12}}>
        <KPI icon="💼" label="Renda Prevista" value={fmtK(orcamento.rendaPrevista)} cor={C.green} small/>
        <KPI icon="🔴" label="Dívidas" value={fmtK(orcamento.dividas)} cor={C.red} small/>
        <KPI icon="✅" label="Renda Real" value={fmtK(rendaReal)} cor={C.gold} small/>
      </div>
      {planejados.map((g,i)=>{
        const pct=g.planejado>0?Math.min((g.gasto/g.planejado)*100,120):0;
        const over=pct>100;
        return(
          <div key={i} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"11px 13px",marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6,flexWrap:"wrap",gap:4}}>
              <span style={{fontSize:12,fontWeight:700,color:g.cor}}>{g.tipo}</span>
              <span style={{fontSize:11}}><span style={{color:over?C.red:C.text,fontWeight:700}}>{fmtR(g.gasto)}</span><span style={{color:C.muted}}> / {fmtR(g.planejado)}</span></span>
            </div>
            <div style={{background:C.bg,borderRadius:6,height:9,overflow:"hidden",border:`1px solid ${C.border}`}}>
              <div style={{width:`${Math.min(pct,100)}%`,height:"100%",background:over?C.red:g.cor,borderRadius:6,transition:"width 0.7s"}}/>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
              <span style={{fontSize:9,color:over?C.red:C.muted,fontWeight:over?700:400}}>{over?"⚠ ":""}{pct.toFixed(0)}%</span>
              <span style={{fontSize:9,color:g.gasto<=g.planejado?C.green:C.red}}>{g.gasto<=g.planejado?`Restando: ${fmtR(g.planejado-g.gasto)}`:`Excedido: ${fmtR(g.gasto-g.planejado)}`}</span>
            </div>
          </div>
        );
      })}
      <button onClick={()=>{setTmp(orcamento);setEditando(true);}} style={{width:"100%",background:"none",border:`1px solid ${C.border}`,color:C.muted,padding:"10px",borderRadius:8,cursor:"pointer",fontSize:12,marginTop:4}}>⚙️ Configurar Orçamento</button>
      {editando&&(
        <div style={{position:"fixed",inset:0,background:"#000c",zIndex:200,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
          <div style={{background:C.card,width:"100%",maxWidth:480,borderRadius:"20px 20px 0 0",padding:"20px 18px 36px",maxHeight:"90vh",overflowY:"auto"}}>
            <div style={{width:40,height:4,background:C.border,borderRadius:2,margin:"0 auto 16px"}}/>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:16}}>
              <span style={{color:C.gold,fontWeight:900,fontSize:15}}>⚙️ Configurar Orçamento</span>
              <button onClick={()=>setEditando(false)} style={{background:"none",border:"none",color:C.muted,fontSize:22,cursor:"pointer"}}>×</button>
            </div>
            {[{k:"rendaPrevista",l:"Renda Prevista (R$)"},{k:"dividas",l:"Dívidas (R$)"}].map(f=>(
              <div key={f.k} style={{marginBottom:11}}><label style={{color:C.muted,fontSize:10,display:"block",marginBottom:4}}>{f.l}</label><input type="number" value={tmp[f.k]} onChange={e=>setTmp(p=>({...p,[f.k]:parseFloat(e.target.value)||0}))} style={inp}/></div>
            ))}
            <div style={{color:C.muted,fontSize:10,marginBottom:8,marginTop:4}}>PERCENTUAIS (total = 100%)</div>
            {[{k:"necessidades",l:"Necessidades Básicas"},{k:"investimentos",l:"Investimentos"},{k:"longoP",l:"Longo Prazo"},{k:"educacao",l:"Educação"},{k:"lazer",l:"Lazer"}].map(f=>(
              <div key={f.k} style={{marginBottom:10,display:"flex",alignItems:"center",gap:10}}>
                <label style={{color:TIPO_COR[f.l.replace(" Básicas","s básicas").replace("imentos","imentos")]||C.muted,fontSize:11,width:"55%"}}>{f.l}</label>
                <div style={{display:"flex",alignItems:"center",gap:4,flex:1}}><input type="number" min="0" max="100" value={tmp[f.k]} onChange={e=>setTmp(p=>({...p,[f.k]:parseFloat(e.target.value)||0}))} style={{...inp,fontSize:15,fontWeight:700}}/><span style={{color:C.muted,fontSize:12}}>%</span></div>
              </div>
            ))}
            <div style={{color:C.muted,fontSize:11,textAlign:"right",marginBottom:14}}>Total: <span style={{color:[tmp.necessidades,tmp.investimentos,tmp.longoP,tmp.educacao,tmp.lazer].reduce((a,b)=>a+b,0)===100?C.green:C.red,fontWeight:700}}>{[tmp.necessidades,tmp.investimentos,tmp.longoP,tmp.educacao,tmp.lazer].reduce((a,b)=>a+b,0)}%</span></div>
            <button onClick={salvarOrc} disabled={saving} style={{width:"100%",background:saving?"#333":`linear-gradient(135deg,${C.blue},${C.blue2})`,border:"none",borderRadius:10,padding:"13px",color:"#fff",fontWeight:800,fontSize:14,cursor:saving?"not-allowed":"pointer"}}>{saving?"Salvando...":"Salvar Configurações"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── MAIS MENU ─────────────────────────────────────────────────────────────────
function MaisMenu({onSelect,onClose}){
  const items=[{id:"contas",icon:"🏦",label:"Minhas Contas"},{id:"objetivos",icon:"🎯",label:"Objetivos"},{id:"orcamento_tab",icon:"📊",label:"Orçamento"},{id:"patrimonio",icon:"📈",label:"Patrimônio"}];
  return(
    <div style={{position:"fixed",inset:0,background:"#000a",zIndex:150,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={onClose}>
      <div style={{background:C.card,width:"100%",maxWidth:480,borderRadius:"20px 20px 0 0",padding:"16px 18px 36px"}} onClick={e=>e.stopPropagation()}>
        <div style={{width:40,height:4,background:C.border,borderRadius:2,margin:"0 auto 16px"}}/>
        <div style={{color:C.gold,fontWeight:900,fontSize:14,marginBottom:14}}>☰ Mais opções</div>
        {items.map(item=>(
          <button key={item.id} onClick={()=>{onSelect(item.id);onClose();}} style={{width:"100%",background:C.card2,border:`1px solid ${C.border}`,color:C.text,padding:"14px 16px",borderRadius:10,cursor:"pointer",fontSize:13,fontWeight:600,display:"flex",alignItems:"center",gap:12,marginBottom:8,textAlign:"left"}}>
            <span style={{fontSize:20}}>{item.icon}</span>{item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── APP PRINCIPAL ─────────────────────────────────────────────────────────────
export default function App(){
  const[tab,setTab]=useState("home");
  const[transactions,setTransactions]=useState([]);
  const[orcamento,setOrcamento]=useState(ORC_INIT);
  const[contas,setContas]=useState([]);
  const[cartoes,setCartoes]=useState([]);
  const[objetivos,setObjetivos]=useState([]);
  const[loaded,setLoaded]=useState(false);
  const[showForm,setShowForm]=useState(false);
  const[showMais,setShowMais]=useState(false);
  const[toast,setToast]=useState(null);
  const[selectedMes,setSelectedMes]=useState(getMA(hoje()));
  const[sync,setSync]=useState("☁️");

  useEffect(()=>{
    const unsub=onSnapshot(collection(db,"lancamentos"),snap=>{
      setTransactions(snap.docs.map(d=>({...d.data(),id:d.id})));
      setSync("☁️ Sync");setTimeout(()=>setSync("☁️"),2000);
    },()=>setSync("⚠️ Offline"));
    Promise.all([
      getDoc(doc(db,"config","orcamento")),
      getDoc(doc(db,"config","contas")),
      getDoc(doc(db,"config","cartoes")),
      getDoc(doc(db,"config","objetivos")),
    ]).then(([oDoc,cDoc,ktDoc,gDoc])=>{
      if(oDoc.exists())setOrcamento(oDoc.data());
      if(cDoc.exists())setContas(cDoc.data().lista||[]);
      if(ktDoc.exists())setCartoes(ktDoc.data().lista||[]);
      if(gDoc.exists())setObjetivos(gDoc.data().lista||[]);
      setLoaded(true);
    }).catch(()=>setLoaded(true));
    return()=>unsub();
  },[]);

  const showToast=(msg,cor=C.green)=>{setToast({msg,cor});setTimeout(()=>setToast(null),2600);};
  const addTransaction=async tx=>{try{await addDoc(collection(db,"lancamentos"),tx);showToast("✅ Salvo!");}catch{showToast("❌ Erro",C.red);}};
  const deleteTransaction=async id=>{try{await deleteDoc(doc(db,"lancamentos",id));showToast("🗑 Removido",C.amber);}catch{showToast("❌ Erro",C.red);}};
  const saveOrcamento=async data=>{await setDoc(doc(db,"config","orcamento"),data);setOrcamento(data);showToast("✅ Orçamento salvo!");};
  const saveContas=async lista=>{await setDoc(doc(db,"config","contas"),{lista});setContas(lista);showToast("✅ Contas salvas!");};
  const saveCartoes=async lista=>{await setDoc(doc(db,"config","cartoes"),{lista});setCartoes(lista);showToast("✅ Cartão salvo!");};
  const saveObjetivos=async lista=>{await setDoc(doc(db,"config","objetivos"),{lista});setObjetivos(lista);showToast("✅ Objetivo salvo!");};

  const mesesDisponiveis=[...new Set([...transactions.map(t=>t.mesAno),getMA(hoje())])].sort();
  const txMes=transactions.filter(t=>t.mesAno===selectedMes);
  const receitas=txMes.filter(t=>t.tipoFluxo==="Receitas").reduce((s,t)=>s+t.valor,0);
  const despesas=txMes.filter(t=>t.tipoFluxo!=="Receitas").reduce((s,t)=>s+t.valor,0);
  const saldo=receitas-despesas;
  const evolucao=mesesDisponiveis.slice(-6).map(m=>{const txs=transactions.filter(t=>t.mesAno===m);return{mes:m,receita:txs.filter(t=>t.tipoFluxo==="Receitas").reduce((s,t)=>s+t.valor,0),despesa:txs.filter(t=>t.tipoFluxo!=="Receitas").reduce((s,t)=>s+t.valor,0)};});

  const navItems=[{id:"home",icon:"🏠",label:"Início"},{id:"transacoes",icon:"💸",label:"Transações"},{id:"cartoes",icon:"💳",label:"Cartões"}];

  if(!loaded)return(
    <div style={{background:C.bg,minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12}}>
      <div style={{fontSize:48}}>💎</div>
      <div style={{color:C.gold,fontSize:16,fontWeight:900,fontFamily:"Georgia,serif"}}>Oliveira Finance</div>
      <div style={{color:C.muted,fontSize:12}}>☁️ Conectando...</div>
    </div>
  );

  return(
    <div style={{background:C.bg,minHeight:"100vh",fontFamily:"'Trebuchet MS',sans-serif",color:C.text,paddingBottom:68,maxWidth:480,margin:"0 auto",position:"relative"}}>

      {/* Header */}
      <div style={{background:C.card,borderBottom:`1px solid ${C.border}`,padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:100,boxShadow:"0 2px 20px #0006"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:34,height:34,background:`linear-gradient(135deg,${C.blue},${C.blue2})`,borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,boxShadow:`0 2px 10px ${C.blue}44`}}>💎</div>
          <div>
            <div style={{color:C.gold,fontWeight:900,fontSize:13,letterSpacing:0.5,fontFamily:"Georgia,serif"}}>Oliveira Finance</div>
            <div style={{color:C.muted,fontSize:8,letterSpacing:1.5}}>CONTROLE FINANCEIRO · <span style={{color:C.green}}>{sync}</span></div>
          </div>
        </div>
        <select value={selectedMes} onChange={e=>setSelectedMes(e.target.value)} style={{background:C.card2,border:`1px solid ${C.border}`,color:C.gold,padding:"5px 9px",borderRadius:6,fontSize:12,cursor:"pointer",outline:"none"}}>
          {mesesDisponiveis.map(m=><option key={m}>{m}</option>)}
        </select>
      </div>

      {/* Content */}
      <div style={{padding:"13px 13px 6px"}}>
        {tab==="home"&&<HomeTab {...{txMes,receitas,despesas,saldo,orcamento,evolucao,contas,cartoes,objetivos,transactions}}/>}
        {tab==="transacoes"&&<TransacoesTab txMes={txMes} onDelete={deleteTransaction} selectedMes={selectedMes} cartoes={cartoes} contas={contas}/>}
        {tab==="cartoes"&&<CartoesTab cartoes={cartoes} onSaveCartoes={saveCartoes} transactions={transactions} selectedMes={selectedMes}/>}
        {tab==="contas"&&<ContasTab contas={contas} onSaveContas={saveContas} transactions={transactions}/>}
        {tab==="objetivos"&&<ObjetivosTab objetivos={objetivos} onSaveObjetivos={saveObjetivos}/>}
        {tab==="orcamento_tab"&&<OrcamentoTab txMes={txMes} orcamento={orcamento} onSaveOrcamento={saveOrcamento}/>}
      </div>

      {/* FAB */}
      <button onClick={()=>setShowForm(true)} style={{position:"fixed",bottom:76,right:16,background:`linear-gradient(135deg,${C.blue},${C.blue2})`,border:"none",borderRadius:"50%",width:52,height:52,fontSize:24,cursor:"pointer",boxShadow:`0 4px 20px ${C.blue}66`,display:"flex",alignItems:"center",justifyContent:"center",zIndex:50,color:"#fff",fontWeight:700}}>+</button>

      {/* Bottom Nav */}
      <nav style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:480,background:C.card,borderTop:`1px solid ${C.border}`,display:"flex",zIndex:100,boxShadow:"0 -2px 20px #0006"}}>
        {navItems.map(n=>(
          <button key={n.id} onClick={()=>setTab(n.id)} style={{flex:1,padding:"8px 4px 9px",border:"none",background:tab===n.id?C.card2:"transparent",borderTop:tab===n.id?`2px solid ${C.blue}`:`2px solid transparent`,color:tab===n.id?C.blue:C.muted,cursor:"pointer",fontSize:10,display:"flex",flexDirection:"column",alignItems:"center",gap:2,transition:"all 0.15s"}}>
            <span style={{fontSize:19}}>{n.icon}</span>{n.label}
          </button>
        ))}
        <button onClick={()=>setShowMais(true)} style={{flex:1,padding:"8px 4px 9px",border:"none",background:showMais?C.card2:"transparent",borderTop:`2px solid transparent`,color:C.muted,cursor:"pointer",fontSize:10,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
          <span style={{fontSize:19}}>☰</span>Mais
        </button>
      </nav>

      {showMais&&<MaisMenu onSelect={t=>{setTab(t);}} onClose={()=>setShowMais(false)}/>}
      {showForm&&<FormModal onClose={()=>setShowForm(false)} onSave={addTransaction} contas={contas} cartoes={cartoes}/>}
      {toast&&<div style={{position:"fixed",top:60,left:"50%",transform:"translateX(-50%)",background:toast.cor,color:"#fff",padding:"10px 22px",borderRadius:20,fontSize:13,fontWeight:700,zIndex:300,boxShadow:"0 4px 20px #0009",whiteSpace:"nowrap"}}>{toast.msg}</div>}
    </div>
  );
}
