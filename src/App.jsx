import { useState, useEffect, useMemo } from "react";
import { BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { db } from "./firebase.js";
import { collection, addDoc, deleteDoc, doc, onSnapshot, setDoc, getDoc, updateDoc } from "firebase/firestore";

const C = {
  bg:"#060D1F", card:"#0E1830", card2:"#162040", card3:"#1D2A50",
  border:"#253560", text:"#E8F0FF", muted:"#6480B0",
  blue:"#4F8EF7", blue2:"#2563EB", gold:"#F0B429",
  green:"#34D399", green2:"#059669", red:"#F87171", red2:"#DC2626",
  teal:"#22D3EE", purple:"#A78BFA", orange:"#FB923C", amber:"#FBBF24",
};

const CATS = {
  "Receitas":["Salário","Outros (Renda)"],
  "Necessidades básicas":["Água","Financiamento","Aluguel","Seguro de vida","Supermercado","Cartão de Crédito","Celular","Condomínio","Escola","Internet","Energia","Saúde","Plano de saúde","Transporte","Empréstimo","Extras (Casa)","Dízimo","Seguro Auto","Autocuidado","Pet","Estacionamento","Outros"],
  "Lazer":["Restaurante","Assinaturas","Entretenimento","Jogos","Presentes","Roupas","Outros (lazer)"],
  "Educação":["Curso","Livro","Faculdade","Outros (educação)"],
  "Longo Prazo":["Reserva Emergência","Aposentadoria","Outros (longo prazo)"],
  "Investimentos":["Ações","FIIs","Tesouro Direto","CDB","Cripto","Outros (invest.)"],
};
const TIPO_COR = {"Receitas":C.green,"Necessidades básicas":C.orange,"Lazer":C.amber,"Educação":C.teal,"Longo Prazo":C.purple,"Investimentos":C.blue,"Transferência":C.teal};
const ORC_INIT = {rendaPrevista:9000,dividas:2835,necessidades:75,investimentos:10,longoP:0,educacao:0,lazer:15};
const GOAL_ICONS = ["🏠","🚗","✈️","📱","💍","🎓","🌴","💰","🏋️","🎯","🏖️","💻","🛒","🎸","👶"];

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtR = v => new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(v||0);
const fmtK = v => Math.abs(v||0)>=1000?`R$${((v||0)/1000).toFixed(1)}k`:`R$${(v||0).toFixed(0)}`;
// Aceita "1.500,75" ou "1500.75" ou "1500,75"
const parseVal = v => {
  const s = String(v).trim().replace(/\s/g,"");
  // formato BR: 1.500,75
  if(/^\d{1,3}(\.\d{3})*(,\d{0,2})?$/.test(s)) return parseFloat(s.replace(/\./g,"").replace(",","."))||0;
  // formato com vírgula simples: 1500,75
  if(/^\d+(,\d{0,2})?$/.test(s)) return parseFloat(s.replace(",","."))||0;
  return parseFloat(s)||0;
};
const hoje = () => new Date().toISOString().split("T")[0];
const getMA = d => { const dt=new Date(d+"T12:00:00"); return `${String(dt.getMonth()+1).padStart(2,"0")}/${dt.getFullYear()}`; };
const addMonths = (dateStr, n) => {
  const d = new Date(dateStr+"T12:00:00");
  d.setMonth(d.getMonth()+n);
  return d.toISOString().split("T")[0];
};

// Gera todas as parcelas de uma transação parcelada
const expandParcelas = (tx) => {
  if(!tx.parcelado||tx.parcelas<=1) return [];
  const result = [];
  for(let i=1;i<tx.parcelas;i++){
    const dataP = addMonths(tx.data, i);
    result.push({
      ...tx,
      id: tx.id+"_p"+i,
      originalId: tx.id,
      data: dataP,
      mesAno: getMA(dataP),
      parcelaNum: i+1,
      isParcela: true,
      valor: tx.valorParcela||tx.valor,
    });
  }
  return result;
};

// Calcula saldo real da conta: inicial + receitas + transferências entrada - débitos débito - transferências saída
const getSaldoReal = (conta, allTx) => {
  const entradas = allTx.filter(t => t.contaId === conta.id && (t.tipoFluxo === "Receitas" || (t.tipoFluxo === "Transferência" && t.fluxo === "Entrada"))).reduce((s,t) => s + t.valor, 0);
  const saidas   = allTx.filter(t => t.contaId === conta.id && t.tipoFluxo !== "Receitas" && !t.cartaoId && !(t.tipoFluxo === "Transferência" && t.fluxo === "Entrada")).reduce((s,t) => s + t.valor, 0);
  return (conta.saldoInicial || 0) + entradas - saidas;
};

// ── UI Components ─────────────────────────────────────────────────────────────
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

// ── Input de valor com suporte a vírgula ──────────────────────────────────────
function ValorInput({value,onChange,cor}){
  const[raw,setRaw]=useState(value||"");
  useEffect(()=>{if(!value)setRaw("");},[value]);
  const handle = e => {
    const v = e.target.value.replace(/[^0-9.,]/g,"");
    setRaw(v);
    const parsed = parseVal(v);
    onChange(parsed, v);
  };
  return(
    <input
      type="text"
      inputMode="decimal"
      placeholder="0,00"
      value={raw}
      onChange={handle}
      style={{background:C.card2,border:`1px solid ${C.border}`,color:cor||C.text,padding:"12px",borderRadius:8,fontSize:24,fontWeight:800,width:"100%",boxSizing:"border-box",outline:"none",textAlign:"left"}}
    />
  );
}

// ── FORM MODAL ────────────────────────────────────────────────────────────────
function FormModal({onClose,onSave,contas,cartoes}){
  const[form,setForm]=useState({data:hoje(),valorNum:0,valorRaw:"",fluxo:"Saída",tipoFluxo:"Necessidades básicas",classificacao:"Supermercado",observacao:"",contaId:"",cartaoId:"",parcelado:false,parcelas:"2",contaDestinoId:""});
  const[busy,setBusy]=useState(false);
  const[erro,setErro]=useState("");

  const setFluxo=f=>{
    if(f==="Transferência") setForm(p=>({...p,fluxo:f,tipoFluxo:"Transferência",classificacao:"Transferência entre contas",cartaoId:"",contaId:contas[0]?.id||"",contaDestinoId:contas[1]?.id||""}));
    else if(f==="Entrada") setForm(p=>({...p,fluxo:f,tipoFluxo:"Receitas",classificacao:"Salário",cartaoId:"",contaDestinoId:""}));
    else setForm(p=>({...p,fluxo:f,tipoFluxo:"Necessidades básicas",classificacao:"Supermercado",cartaoId:"",contaDestinoId:""}));
  };
  const setTipo=t=>setForm(p=>({...p,tipoFluxo:t,classificacao:CATS[t][0]}));

  const salvar=async()=>{
    if(!form.valorNum||form.valorNum<=0){setErro("Informe um valor válido (ex: 150,00)");return;}
    if(form.fluxo==="Transferência"){
      if(!form.contaId||!form.contaDestinoId){setErro("Selecione conta de origem e destino");return;}
      if(form.contaId===form.contaDestinoId){setErro("Origem e destino não podem ser iguais");return;}
    }
    setBusy(true);
    if(form.fluxo==="Transferência"){
      // Grava duas transações: saída da origem, entrada no destino
      const base={data:form.data,valor:form.valorNum,tipoFluxo:"Transferência",classificacao:"Transferência",observacao:form.observacao,mesAno:getMA(form.data),cartaoId:null,parcelado:false,parcelas:1,valorParcela:form.valorNum,parcelasPagas:[true]};
      await onSave({...base,fluxo:"Saída", contaId:form.contaId, contaDestinoId:form.contaDestinoId});
      await onSave({...base,fluxo:"Entrada",contaId:form.contaDestinoId,contaOrigemId:form.contaId});
    } else {
      const np=parseInt(form.parcelas)||1;
      const vp=form.parcelado&&form.cartaoId?form.valorNum/np:form.valorNum;
      await onSave({data:form.data,valor:form.valorNum,fluxo:form.fluxo,tipoFluxo:form.tipoFluxo,classificacao:form.classificacao,observacao:form.observacao,mesAno:getMA(form.data),contaId:form.contaId||null,cartaoId:form.fluxo==="Saída"?(form.cartaoId||null):null,parcelado:form.parcelado&&!!form.cartaoId,parcelas:form.parcelado&&form.cartaoId?np:1,valorParcela:vp,parcelasPagas:[true,...Array(np-1).fill(false)]});
    }
    setBusy(false);onClose();
  };

  const inp={background:C.card2,border:`1px solid ${C.border}`,color:C.text,padding:"10px 12px",borderRadius:8,fontSize:13,width:"100%",boxSizing:"border-box",outline:"none"};
  const np=parseInt(form.parcelas)||1;
  const isTransf=form.fluxo==="Transferência";

  return(
    <div style={{position:"fixed",inset:0,background:"#000c",zIndex:200,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
      <div style={{background:C.card,width:"100%",maxWidth:480,borderRadius:"20px 20px 0 0",padding:"16px 18px 36px",maxHeight:"94vh",overflowY:"auto"}}>
        <div style={{width:40,height:4,background:C.border,borderRadius:2,margin:"0 auto 14px"}}/>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <span style={{color:C.gold,fontWeight:900,fontSize:15}}>✏️ Novo Lançamento</span>
          <button onClick={onClose} style={{background:"none",border:"none",color:C.muted,fontSize:22,cursor:"pointer"}}>×</button>
        </div>

        {/* Tipo: Despesa / Receita / Transferência */}
        <div style={{display:"flex",gap:6,marginBottom:14}}>
          {[
            {k:"Saída",    label:"💸 Despesa",      cor:C.red},
            {k:"Entrada",  label:"💰 Receita",       cor:C.green},
            {k:"Transferência", label:"🔄 Transferência", cor:C.teal},
          ].map(f=>(
            <button key={f.k} onClick={()=>setFluxo(f.k)} style={{flex:1,padding:"10px 4px",borderRadius:10,cursor:"pointer",fontWeight:700,fontSize:12,background:form.fluxo===f.k?(f.cor+"33"):"transparent",border:`2px solid ${form.fluxo===f.k?f.cor:C.border}`,color:form.fluxo===f.k?f.cor:C.muted}}>
              {f.label}
            </button>
          ))}
        </div>

        <div style={{marginBottom:11}}>
          <label style={{color:C.muted,fontSize:10,display:"block",marginBottom:4}}>📅 DATA</label>
          <input type="date" value={form.data} onChange={e=>setForm(p=>({...p,data:e.target.value}))} style={inp}/>
        </div>

        <div style={{marginBottom:4}}>
          <label style={{color:C.muted,fontSize:10,display:"block",marginBottom:4}}>💵 VALOR (R$)</label>
          <ValorInput value={form.valorRaw} cor={isTransf?C.teal:form.fluxo==="Saída"?C.red:C.green} onChange={(num,raw)=>{setErro("");setForm(p=>({...p,valorNum:num,valorRaw:raw}));}}/>
          <div style={{color:C.muted,fontSize:9,marginTop:3}}>Use vírgula: 1.500,75 ou 150,00</div>
          {erro&&<div style={{color:C.red,fontSize:11,marginTop:4}}>⚠ {erro}</div>}
        </div>

        {/* TRANSFERÊNCIA: origem → destino */}
        {isTransf&&(
          <div style={{marginBottom:14,marginTop:11}}>
            <label style={{color:C.muted,fontSize:10,display:"block",marginBottom:8}}>🔄 MOVER ENTRE CONTAS</label>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{flex:1}}>
                <div style={{color:C.muted,fontSize:9,marginBottom:3}}>SAIR DE</div>
                <select value={form.contaId} onChange={e=>setForm(p=>({...p,contaId:e.target.value}))} style={{...inp,borderColor:C.red+"66",color:C.red}}>
                  <option value="">— Origem —</option>
                  {contas.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
              <div style={{color:C.teal,fontSize:20,marginTop:14}}>→</div>
              <div style={{flex:1}}>
                <div style={{color:C.muted,fontSize:9,marginBottom:3}}>ENTRAR EM</div>
                <select value={form.contaDestinoId} onChange={e=>setForm(p=>({...p,contaDestinoId:e.target.value}))} style={{...inp,borderColor:C.green+"66",color:C.green}}>
                  <option value="">— Destino —</option>
                  {contas.filter(c=>c.id!==form.contaId).map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
            </div>
            {form.valorNum>0&&form.contaId&&form.contaDestinoId&&(
              <div style={{background:C.teal+"11",border:`1px solid ${C.teal}33`,borderRadius:8,padding:"8px 12px",marginTop:8,fontSize:11,color:C.teal,textAlign:"center"}}>
                {fmtR(form.valorNum)} sairá de <b>{contas.find(c=>c.id===form.contaId)?.nome}</b> e entrará em <b>{contas.find(c=>c.id===form.contaDestinoId)?.nome}</b>
              </div>
            )}
          </div>
        )}

        {/* DESPESA: categoria + pagar com */}
        {!isTransf&&form.fluxo==="Saída"&&(
          <>
            <div style={{marginBottom:11,marginTop:8}}>
              <label style={{color:C.muted,fontSize:10,display:"block",marginBottom:6}}>📂 CATEGORIA</label>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {Object.keys(CATS).filter(t=>t!=="Receitas").map(t=>(
                  <button key={t} onClick={()=>setTipo(t)} style={{padding:"6px 11px",borderRadius:20,fontSize:11,cursor:"pointer",background:form.tipoFluxo===t?(TIPO_COR[t]+"33"):"transparent",border:`1px solid ${form.tipoFluxo===t?TIPO_COR[t]:C.border}`,color:form.tipoFluxo===t?TIPO_COR[t]:C.muted}}>{t}</button>
                ))}
              </div>
            </div>
            <div style={{marginBottom:11}}>
              <label style={{color:C.muted,fontSize:10,display:"block",marginBottom:4}}>🏷️ CLASSIFICAÇÃO</label>
              <select value={form.classificacao} onChange={e=>setForm(p=>({...p,classificacao:e.target.value}))} style={inp}>
                {(CATS[form.tipoFluxo]||[]).map(c=><option key={c}>{c}</option>)}
              </select>
            </div>
            <div style={{marginBottom:11}}>
              <label style={{color:C.muted,fontSize:10,display:"block",marginBottom:6}}>💳 PAGAR COM</label>
              <div style={{display:"flex",gap:6,marginBottom:8}}>
                <button onClick={()=>setForm(p=>({...p,cartaoId:"",parcelado:false}))} style={{flex:1,padding:"8px",borderRadius:8,cursor:"pointer",fontSize:11,background:!form.cartaoId?C.blue+"22":"transparent",border:`1px solid ${!form.cartaoId?C.blue:C.border}`,color:!form.cartaoId?C.blue:C.muted}}>🏦 Conta</button>
                <button onClick={()=>cartoes.length>0&&setForm(p=>({...p,cartaoId:cartoes[0].id,contaId:""}))} style={{flex:1,padding:"8px",borderRadius:8,cursor:"pointer",fontSize:11,background:form.cartaoId?C.purple+"22":"transparent",border:`1px solid ${form.cartaoId?C.purple:C.border}`,color:form.cartaoId?C.purple:cartoes.length===0?C.border:C.muted}}>💳 Cartão{cartoes.length===0?" (nenhum)":""}</button>
              </div>
              {form.cartaoId&&<select value={form.cartaoId} onChange={e=>setForm(p=>({...p,cartaoId:e.target.value}))} style={{...inp,marginBottom:8}}>{cartoes.map(c=><option key={c.id} value={c.id}>{c.nome} – {c.titular}</option>)}</select>}
              {!form.cartaoId&&contas.length>0&&<select value={form.contaId} onChange={e=>setForm(p=>({...p,contaId:e.target.value}))} style={inp}><option value="">— Sem conta específica —</option>{contas.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}</select>}
            </div>
            {form.cartaoId&&(
              <div style={{marginBottom:11}}>
                <label style={{color:C.muted,fontSize:10,display:"block",marginBottom:6}}>📅 PARCELAMENTO</label>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <button onClick={()=>setForm(p=>({...p,parcelado:!p.parcelado}))} style={{padding:"8px 14px",borderRadius:8,cursor:"pointer",fontSize:11,background:form.parcelado?C.purple+"22":"transparent",border:`1px solid ${form.parcelado?C.purple:C.border}`,color:form.parcelado?C.purple:C.muted}}>
                    {form.parcelado?"✅ Parcelado":"Parcelar?"}
                  </button>
                  {form.parcelado&&(
                    <div style={{flex:1,display:"flex",alignItems:"center",gap:8}}>
                      <input type="text" inputMode="numeric" value={form.parcelas} onChange={e=>setForm(p=>({...p,parcelas:e.target.value.replace(/[^0-9]/g,"")}))} style={{...inp,width:55,textAlign:"center",fontSize:18,fontWeight:800}}/>
                      <span style={{color:C.muted,fontSize:11}}>parcelas</span>
                    </div>
                  )}
                </div>
                {form.parcelado&&form.valorNum>0&&<div style={{background:C.teal+"11",border:`1px solid ${C.teal}33`,borderRadius:8,padding:"8px 12px",marginTop:6,fontSize:11,color:C.teal}}>{np}x de {fmtR(form.valorNum/np)} · Total: {fmtR(form.valorNum)}</div>}
              </div>
            )}
          </>
        )}

        {/* RECEITA: conta destino */}
        {!isTransf&&form.fluxo==="Entrada"&&(
          <>
            <div style={{marginBottom:11,marginTop:8}}>
              <label style={{color:C.muted,fontSize:10,display:"block",marginBottom:4}}>🏷️ CLASSIFICAÇÃO</label>
              <select value={form.classificacao} onChange={e=>setForm(p=>({...p,classificacao:e.target.value}))} style={inp}>
                {(CATS["Receitas"]||[]).map(c=><option key={c}>{c}</option>)}
              </select>
            </div>
            {contas.length>0&&(
              <div style={{marginBottom:11}}>
                <label style={{color:C.muted,fontSize:10,display:"block",marginBottom:4}}>🏦 RECEBER EM</label>
                <select value={form.contaId} onChange={e=>setForm(p=>({...p,contaId:e.target.value}))} style={inp}><option value="">— Sem conta específica —</option>{contas.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}</select>
              </div>
            )}
          </>
        )}

        <div style={{marginBottom:18,marginTop:isTransf?0:0}}>
          <label style={{color:C.muted,fontSize:10,display:"block",marginBottom:4}}>📝 OBSERVAÇÃO (opcional)</label>
          <input type="text" placeholder="Ex: Aplicação mensal, Conta de luz..." value={form.observacao} onChange={e=>setForm(p=>({...p,observacao:e.target.value}))} style={inp}/>
        </div>

        <button onClick={salvar} disabled={busy} style={{width:"100%",background:busy?"#333":isTransf?`linear-gradient(135deg,${C.teal},${C.blue})`:form.fluxo==="Entrada"?`linear-gradient(135deg,${C.green},${C.green2})`:`linear-gradient(135deg,${C.blue},${C.blue2})`,border:"none",borderRadius:12,padding:"16px",color:"#fff",fontWeight:800,fontSize:15,cursor:busy?"not-allowed":"pointer",boxShadow:`0 4px 20px ${C.blue}44`}}>
          {busy?"Salvando ☁️...":isTransf?"🔄 Confirmar Transferência":"✅  Salvar Lançamento"}
        </button>
      </div>
    </div>
  );
}

// Tipos que são patrimônio (excluem Corrente)
const TIPOS_PATRIMONIO = ["Poupança","Investimento","Corretora","Outro"];
const TIPOS_CORRENTE   = ["Corrente","Carteira"];

// ── HOME TAB ──────────────────────────────────────────────────────────────────
function HomeTab({txMes,receitas,despesas,saldo,orcamento,evolucao,contas,cartoes,objetivos,transactions}){
  // Só conta corrente/carteira no header
  const contasCorrente = contas.filter(c => TIPOS_CORRENTE.includes(c.tipo));
  const saldoCorrente  = contasCorrente.reduce((s,c) => s + getSaldoReal(c,transactions), 0);
  // Reserva + investimento para info
  const contasPatrim   = contas.filter(c => TIPOS_PATRIMONIO.includes(c.tipo));
  const saldoPatrim    = contasPatrim.reduce((s,c) => s + getSaldoReal(c,transactions), 0);
  const faturaTotal    = cartoes.reduce((s,c)=>s+transactions.filter(t=>t.cartaoId===c.id&&t.mesAno===(txMes[0]?.mesAno)).reduce((a,t)=>a+t.valor,0),0);
  const pieData=Object.keys(CATS).filter(k=>k!=="Receitas").map(tipo=>({tipo,valor:txMes.filter(t=>t.tipoFluxo===tipo).reduce((s,t)=>s+t.valor,0),cor:TIPO_COR[tipo]})).filter(d=>d.valor>0);
  const vazio=evolucao.every(e=>e.receita===0&&e.despesa===0);
  // Transferências não entram nas despesas do mês
  const despesasReais = txMes.filter(t=>t.tipoFluxo!=="Receitas"&&t.tipoFluxo!=="Transferência").reduce((s,t)=>s+t.valor,0);
  return(
    <div>
      {/* Header: só conta corrente */}
      <div style={{background:`linear-gradient(135deg,${C.card2},${C.card3})`,border:`1px solid ${C.border}`,borderRadius:16,padding:"18px",marginBottom:10,textAlign:"center",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:-20,right:-20,width:100,height:100,background:C.blue+"10",borderRadius:"50%"}}/>
        <div style={{color:C.muted,fontSize:9,textTransform:"uppercase",letterSpacing:2,marginBottom:4}}>💳 Saldo em Conta Corrente</div>
        <div style={{color:C.gold,fontSize:32,fontWeight:900,fontFamily:"Georgia,serif"}}>{fmtR(saldoCorrente)}</div>
        {faturaTotal>0&&<div style={{color:C.red,fontSize:10,marginTop:2}}>Fatura aberta: -{fmtR(faturaTotal)}</div>}
        {/* Info: reserva + investimentos */}
        {saldoPatrim>0&&(
          <div style={{display:"flex",gap:8,justifyContent:"center",marginTop:10,flexWrap:"wrap"}}>
            {contasPatrim.map(c=>{
              const sr=getSaldoReal(c,transactions);
              return sr>0?<div key={c.id} style={{background:C.border+"55",borderRadius:8,padding:"4px 10px",fontSize:10}}>
                <span style={{color:C.muted}}>{c.nome}: </span>
                <span style={{color:c.tipo==="Corretora"||c.tipo==="Investimento"?C.blue:C.teal,fontWeight:700}}>{fmtR(sr)}</span>
              </div>:null;
            })}
          </div>
        )}
      </div>
      <div style={{display:"flex",gap:7,marginBottom:10}}>
        <KPI icon="💰" label="Receitas" value={fmtK(receitas)} cor={C.green}/>
        <KPI icon="💸" label="Despesas" value={fmtK(despesas)} cor={C.orange}/>
        <KPI icon="📊" label="Saldo Mês" value={fmtK(saldo)} cor={saldo>=0?C.green:C.red}/>
      </div>
      {contas.length>0&&(
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"12px 14px",marginBottom:10}}>
          <div style={{color:C.muted,fontSize:9,textTransform:"uppercase",letterSpacing:1.5,marginBottom:10}}>🏦 Contas</div>
          {contas.map(c=>{
            const sr=getSaldoReal(c,transactions);
            const delta=sr-(c.saldoInicial||0);
            return(
              <div key={c.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingBottom:8,marginBottom:8,borderBottom:`1px solid ${C.border}22`}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{width:8,height:8,borderRadius:"50%",background:c.cor||C.blue}}/>
                  <div><div style={{fontSize:12,fontWeight:700}}>{c.nome}</div><div style={{fontSize:9,color:C.muted}}>{c.tipo}</div></div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{color:C.gold,fontSize:13,fontWeight:800}}>{fmtR(sr)}</div>
                  {delta!==0&&<div style={{fontSize:9,color:delta>0?C.green:C.red}}>{delta>0?"▲":"▼"} {fmtR(Math.abs(delta))}</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {objetivos.filter(g=>g.status!=="concluido").length>0&&(
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"12px 14px",marginBottom:10}}>
          <div style={{color:C.muted,fontSize:9,textTransform:"uppercase",letterSpacing:1.5,marginBottom:10}}>🎯 Objetivos</div>
          {objetivos.filter(g=>g.status!=="concluido").slice(0,3).map(g=>{
            const pct=Math.min((g.valorAtual||0)/(g.valorAlvo||1)*100,100);
            return(
              <div key={g.id} style={{marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                  <span style={{fontSize:12,fontWeight:700}}>{g.icone} {g.nome}</span>
                  <span style={{fontSize:10,color:C.gold,fontWeight:700}}>{pct.toFixed(0)}%</span>
                </div>
                <div style={{background:C.bg,borderRadius:6,height:6,overflow:"hidden"}}>
                  <div style={{width:`${pct}%`,height:"100%",background:`linear-gradient(90deg,${C.blue},${C.teal})`,borderRadius:6}}/>
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
        <div style={{background:C.card,border:`1px dashed ${C.border}`,borderRadius:12,padding:24,textAlign:"center"}}>
          <div style={{fontSize:36,marginBottom:8}}>🚀</div>
          <div style={{color:C.blue,fontWeight:700,fontSize:14,marginBottom:4}}>Tudo pronto!</div>
          <div style={{color:C.muted,fontSize:12}}>Toque em <b style={{color:C.gold}}>+</b> para adicionar um lançamento</div>
          <div style={{color:C.green,fontSize:10,marginTop:6}}>☁️ Sincronizado em tempo real</div>
        </div>
      ):(
        <>
          <div style={{color:C.muted,fontSize:9,textTransform:"uppercase",letterSpacing:1.5,marginBottom:6}}>Evolução Mensal</div>
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
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"10px 2px",marginBottom:12}}>
          <div style={{color:C.muted,fontSize:9,textTransform:"uppercase",letterSpacing:1.5,margin:"4px 12px 8px"}}>Gastos por Categoria</div>
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
      )}
      {txMes.length>0&&(
        <>
          <div style={{color:C.muted,fontSize:9,textTransform:"uppercase",letterSpacing:1.5,marginBottom:6}}>Últimos Lançamentos</div>
          {[...txMes].sort((a,b)=>new Date(b.data)-new Date(a.data)).slice(0,5).map(tx=>(
            <div key={tx.id} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 12px",marginBottom:6,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{minWidth:0,flex:1}}>
                <div style={{fontSize:12,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{tx.classificacao}</div>
                <div style={{fontSize:10,color:C.muted,marginTop:1,display:"flex",gap:4,flexWrap:"wrap"}}>{tx.data} <Tag label={tx.tipoFluxo} cor={TIPO_COR[tx.tipoFluxo]}/>{tx.parcelado&&<Tag label={`${tx.parcelas}x`} cor={C.teal}/>}</div>
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
function TransacoesTab({allTx,selectedMes,onDelete,onToggleParcela,cartoes,contas}){
  const[busca,setBusca]=useState("");
  const[filtro,setFiltro]=useState("Todos");
  const[confirmId,setConfirmId]=useState(null);

  // Expande parcelamentos para mostrar parcelas em meses futuros
  const txExpandidas = useMemo(()=>{
    const base = allTx.filter(t=>t.mesAno===selectedMes);
    const parcelas = allTx.filter(t=>t.parcelado&&t.parcelas>1).flatMap(t=>expandParcelas(t)).filter(t=>t.mesAno===selectedMes);
    return [...base,...parcelas];
  },[allTx,selectedMes]);

  const filtradas = txExpandidas.filter(t=>{
    const mb = !busca||t.classificacao.toLowerCase().includes(busca.toLowerCase())||(t.observacao||"").toLowerCase().includes(busca.toLowerCase());
    const mt = filtro==="Todos"||(filtro==="Receitas"?t.tipoFluxo==="Receitas":t.tipoFluxo!=="Receitas");
    return mb&&mt;
  }).sort((a,b)=>new Date(b.data)-new Date(a.data));

  const getCartao=id=>cartoes.find(c=>c.id===id);
  const getConta=id=>contas.find(c=>c.id===id);

  const receitasMes=txExpandidas.filter(t=>t.tipoFluxo==="Receitas").reduce((s,t)=>s+t.valor,0);
  const despesasMes=txExpandidas.filter(t=>t.tipoFluxo!=="Receitas").reduce((s,t)=>s+t.valor,0);

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <div style={{color:C.muted,fontSize:9,textTransform:"uppercase",letterSpacing:1}}>{selectedMes} · {txExpandidas.length} itens</div>
        <div style={{display:"flex",gap:8}}>
          <span style={{color:C.green,fontSize:11,fontWeight:700}}>↑{fmtK(receitasMes)}</span>
          <span style={{color:C.red,fontSize:11,fontWeight:700}}>↓{fmtK(despesasMes)}</span>
        </div>
      </div>
      <input placeholder="🔍 Buscar..." value={busca} onChange={e=>setBusca(e.target.value)} style={{width:"100%",background:C.card,border:`1px solid ${C.border}`,color:C.text,padding:"9px 12px",borderRadius:8,fontSize:12,marginBottom:8,boxSizing:"border-box",outline:"none"}}/>
      <div style={{display:"flex",gap:6,marginBottom:12}}>
        {["Todos","Receitas","Despesas"].map(f=><button key={f} onClick={()=>setFiltro(f)} style={{padding:"5px 12px",borderRadius:16,fontSize:11,cursor:"pointer",background:filtro===f?C.blue+"33":"transparent",border:`1px solid ${filtro===f?C.blue:C.border}`,color:filtro===f?C.blue:C.muted}}>{f}</button>)}
      </div>
      {filtradas.length===0?(
        <div style={{background:C.card,border:`1px dashed ${C.border}`,borderRadius:10,padding:24,textAlign:"center"}}>
          <div style={{fontSize:28,marginBottom:8}}>📋</div>
          <div style={{color:C.muted,fontSize:12}}>{busca?"Nenhum resultado":"Nenhum lançamento neste mês"}</div>
        </div>
      ):filtradas.map(tx=>{
        const cartao=tx.cartaoId?getCartao(tx.cartaoId):null;
        const conta=tx.contaId?getConta(tx.contaId):null;
        const isParcelaVirtual=tx.isParcela;
        const parcelaIdx=tx.parcelaNum?tx.parcelaNum-1:0;
        const paga=tx.parcelasPagas?tx.parcelasPagas[parcelaIdx]:true;
        return(
          <div key={tx.id} style={{background:C.card,border:`1px solid ${isParcelaVirtual?(paga?C.green+"44":C.orange+"44"):C.border}`,borderRadius:10,padding:"10px 12px",marginBottom:7,opacity:isParcelaVirtual&&paga?0.7:1}}>
            {confirmId===tx.id?(
              <div style={{textAlign:"center"}}>
                <div style={{color:C.red,fontSize:12,marginBottom:8}}>Remover este lançamento?</div>
                <div style={{display:"flex",gap:8}}><button onClick={()=>{onDelete(tx.originalId||tx.id);setConfirmId(null);}} style={{flex:1,background:C.red,border:"none",borderRadius:6,padding:"7px",color:"#fff",fontWeight:700,cursor:"pointer",fontSize:12}}>Sim</button><button onClick={()=>setConfirmId(null)} style={{flex:1,background:"none",border:`1px solid ${C.border}`,borderRadius:6,padding:"7px",color:C.muted,cursor:"pointer",fontSize:12}}>Cancelar</button></div>
              </div>
            ):(
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12,fontWeight:700,marginBottom:3,display:"flex",gap:6,alignItems:"center"}}>
                    {tx.classificacao}
                    {isParcelaVirtual&&<span style={{fontSize:9,color:C.teal,fontWeight:700}}>Parcela {tx.parcelaNum}/{tx.parcelas}</span>}
                  </div>
                  <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:2}}>
                    <Tag label={tx.tipoFluxo} cor={TIPO_COR[tx.tipoFluxo]}/>
                    {cartao&&<Tag label={`💳 ${cartao.nome}`} cor={C.purple}/>}
                    {conta&&<Tag label={`🏦 ${conta.nome}`} cor={C.blue}/>}
                    {tx.parcelado&&!isParcelaVirtual&&<Tag label={`${tx.parcelas}x de ${fmtR(tx.valorParcela)}`} cor={C.teal}/>}
                  </div>
                  <div style={{fontSize:10,color:C.muted}}>{tx.data}{tx.observacao&&` · ${tx.observacao}`}</div>
                  {isParcelaVirtual&&(
                    <button onClick={()=>onToggleParcela(tx.originalId,parcelaIdx)} style={{marginTop:4,padding:"3px 10px",borderRadius:10,fontSize:10,cursor:"pointer",background:paga?C.green+"22":C.orange+"22",border:`1px solid ${paga?C.green:C.orange}`,color:paga?C.green:C.orange}}>
                      {paga?"✅ Pago":"⏳ Pendente — marcar como pago"}
                    </button>
                  )}
                </div>
                <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,flexShrink:0}}>
                  <span style={{color:tx.tipoFluxo==="Receitas"?C.green:C.red,fontWeight:800,fontSize:13}}>{tx.tipoFluxo==="Receitas"?"+":"-"}{fmtR(isParcelaVirtual?tx.valorParcela:tx.valor)}</span>
                  {!isParcelaVirtual&&<button onClick={()=>setConfirmId(tx.id)} style={{background:"none",border:"none",color:C.border,cursor:"pointer",fontSize:15,padding:0}}>×</button>}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── CARTÕES TAB ───────────────────────────────────────────────────────────────
function CartoesTab({cartoes,onSaveCartoes,allTx,selectedMes}){
  const[showAdd,setShowAdd]=useState(false);
  const[editId,setEditId]=useState(null);
  const[form,setForm]=useState({nome:"",titular:"",limite:0,diaFechamento:1,cor:C.purple});
  const[saving,setSaving]=useState(false);
  const cores=[C.purple,C.blue,C.teal,C.green,C.gold,C.orange,C.red];
  const inp={background:C.card2,border:`1px solid ${C.border}`,color:C.text,padding:"10px 12px",borderRadius:8,fontSize:13,width:"100%",boxSizing:"border-box",outline:"none"};

  const abrirEdicao = c => { setEditId(c.id); setForm({nome:c.nome,titular:c.titular,limite:c.limite||0,diaFechamento:c.diaFechamento||1,cor:c.cor||C.purple}); setShowAdd(true); };

  const salvar=async()=>{
    if(!form.nome)return;
    setSaving(true);
    const limiteNum=parseVal(String(form.limite));
    const novo={...form,limite:limiteNum};
    const lista=editId?cartoes.map(c=>c.id===editId?{...c,...novo}:c):[...cartoes,{...novo,id:Date.now().toString()}];
    await onSaveCartoes(lista);
    setSaving(false);setShowAdd(false);setEditId(null);setForm({nome:"",titular:"",limite:0,diaFechamento:1,cor:C.purple});
  };

  return(
    <div>
      <div style={{color:C.muted,fontSize:9,textTransform:"uppercase",letterSpacing:1.5,marginBottom:10}}>💳 Cartões de Crédito</div>
      {cartoes.length===0&&<div style={{background:C.card,border:`1px dashed ${C.border}`,borderRadius:10,padding:24,textAlign:"center",marginBottom:12}}><div style={{fontSize:28,marginBottom:8}}>💳</div><div style={{color:C.muted,fontSize:12}}>Nenhum cartão cadastrado</div></div>}
      {cartoes.map(c=>{
        const txCartao=allTx.filter(t=>t.cartaoId===c.id&&t.mesAno===selectedMes);
        const parcelados=allTx.filter(t=>t.cartaoId===c.id&&t.parcelado&&t.parcelas>1);
        const faturaAtual=txCartao.reduce((s,t)=>s+t.valor,0);
        const limiteUsado=c.limite>0?(faturaAtual/c.limite)*100:0;
        return(
          <div key={c.id} style={{background:`linear-gradient(135deg,${C.card2},${C.card3})`,border:`1px solid ${c.cor||C.purple}44`,borderRadius:14,padding:"16px",marginBottom:10,position:"relative",overflow:"hidden"}}>
            <div style={{position:"absolute",top:-20,right:-20,width:80,height:80,background:(c.cor||C.purple)+"15",borderRadius:"50%"}}/>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
              <div><div style={{fontSize:14,fontWeight:900}}>{c.nome}</div><div style={{fontSize:10,color:C.muted}}>Titular: {c.titular}</div></div>
              <button onClick={()=>abrirEdicao(c)} style={{background:C.card,border:`1px solid ${C.border}`,color:C.muted,borderRadius:8,padding:"5px 10px",cursor:"pointer",fontSize:11,fontWeight:700}}>✏️ Editar</button>
            </div>
            <div style={{display:"flex",gap:12,marginBottom:10}}>
              <div style={{flex:1}}><div style={{color:C.muted,fontSize:9}}>FATURA ATUAL</div><div style={{color:C.red,fontSize:18,fontWeight:800}}>{fmtR(faturaAtual)}</div></div>
              <div style={{flex:1}}><div style={{color:C.muted,fontSize:9}}>DISPONÍVEL</div><div style={{color:C.green,fontSize:18,fontWeight:800}}>{fmtR((c.limite||0)-faturaAtual)}</div></div>
            </div>
            <div style={{background:C.bg,borderRadius:6,height:8,overflow:"hidden",marginBottom:4}}>
              <div style={{width:`${Math.min(limiteUsado,100)}%`,height:"100%",background:limiteUsado>80?C.red:limiteUsado>60?C.orange:(c.cor||C.purple),borderRadius:6,transition:"width 0.6s"}}/>
            </div>
            <div style={{fontSize:9,color:C.muted,marginBottom:txCartao.length>0?10:0}}>Limite: {fmtR(c.limite||0)} · Fecha dia {c.diaFechamento}</div>
            {txCartao.length>0&&(
              <div>
                <div style={{color:C.muted,fontSize:9,textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>Lançamentos</div>
                {txCartao.slice(0,3).map(t=>(
                  <div key={t.id} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:`1px solid ${C.border}33`,fontSize:11}}>
                    <span>{t.classificacao}{t.parcelado?` (${t.parcelas}x)`:""}</span>
                    <span style={{color:C.red,fontWeight:700}}>-{fmtR(t.valor)}</span>
                  </div>
                ))}
              </div>
            )}
            {parcelados.length>0&&(
              <div style={{marginTop:10}}>
                <div style={{color:C.teal,fontSize:9,textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>Parcelamentos</div>
                {parcelados.map(t=>(
                  <div key={t.id} style={{fontSize:10,color:C.muted,display:"flex",justifyContent:"space-between",padding:"3px 0"}}>
                    <span>{t.classificacao} ({t.data})</span>
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
            {[{k:"nome",l:"NOME",ph:"Nubank, Itaú Visa..."},{k:"titular",l:"TITULAR",ph:"Gabriel, Ana..."}].map(f=>(
              <div key={f.k} style={{marginBottom:11}}><label style={{color:C.muted,fontSize:10,display:"block",marginBottom:4}}>{f.l}</label><input value={form[f.k]} onChange={e=>setForm(p=>({...p,[f.k]:e.target.value}))} placeholder={f.ph} style={inp}/></div>
            ))}
            <div style={{marginBottom:11}}>
              <label style={{color:C.muted,fontSize:10,display:"block",marginBottom:4}}>LIMITE (R$)</label>
              <ValorInput value={""} cor={C.gold} onChange={(num)=>setForm(p=>({...p,limite:num}))}/>
              <div style={{color:C.muted,fontSize:9,marginTop:2}}>Atual: {fmtR(form.limite)}</div>
            </div>
            <div style={{marginBottom:11}}><label style={{color:C.muted,fontSize:10,display:"block",marginBottom:4}}>DIA FECHAMENTO</label><input type="text" inputMode="numeric" value={form.diaFechamento||""} onChange={e=>setForm(p=>({...p,diaFechamento:parseInt(e.target.value)||1}))} style={inp}/></div>
            <div style={{marginBottom:16}}>
              <label style={{color:C.muted,fontSize:10,display:"block",marginBottom:6}}>COR</label>
              <div style={{display:"flex",gap:8}}>{cores.map(cor=><button key={cor} onClick={()=>setForm(p=>({...p,cor}))} style={{width:30,height:30,borderRadius:"50%",background:cor,border:`3px solid ${form.cor===cor?"#fff":"transparent"}`,cursor:"pointer"}}/>)}</div>
            </div>
            <button onClick={salvar} disabled={saving} style={{width:"100%",background:saving?"#333":`linear-gradient(135deg,${C.purple},${C.blue})`,border:"none",borderRadius:12,padding:"14px",color:"#fff",fontWeight:800,fontSize:14,cursor:"pointer"}}>
              {saving?"Salvando...":"Salvar Cartão"}
            </button>
            {editId&&<button onClick={async()=>{await onSaveCartoes(cartoes.filter(c=>c.id!==editId));setShowAdd(false);setEditId(null);}} style={{width:"100%",background:"none",border:`1px solid ${C.red}`,color:C.red,borderRadius:12,padding:"11px",cursor:"pointer",marginTop:8,fontSize:13}}>🗑 Excluir</button>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── CONTAS TAB ────────────────────────────────────────────────────────────────
function ContasTab({contas,onSaveContas,allTx}){
  const[showAdd,setShowAdd]=useState(false);
  const[editId,setEditId]=useState(null);
  const[form,setForm]=useState({nome:"",tipo:"Corrente",saldo:0,saldoInicial:0,cor:C.blue});
  const[saving,setSaving]=useState(false);
  const cores=[C.blue,C.green,C.purple,C.teal,C.gold,C.orange,C.red];
  const totalSaldo=contas.reduce((s,c)=>s+getSaldoReal(c,allTx),0);
  const inp={background:C.card2,border:`1px solid ${C.border}`,color:C.text,padding:"10px 12px",borderRadius:8,fontSize:13,width:"100%",boxSizing:"border-box",outline:"none"};

  const salvar=async()=>{
    if(!form.nome)return;
    setSaving(true);
    const lista=editId?contas.map(c=>c.id===editId?{...c,...form}:c):[...contas,{...form,id:Date.now().toString()}];
    await onSaveContas(lista);
    setSaving(false);setShowAdd(false);setEditId(null);setForm({nome:"",tipo:"Corrente",saldo:0,saldoInicial:0,cor:C.blue});
  };

  return(
    <div>
      <div style={{color:C.muted,fontSize:9,textTransform:"uppercase",letterSpacing:1.5,marginBottom:10}}>🏦 Minhas Contas</div>
      <div style={{background:`linear-gradient(135deg,${C.card2},${C.card3})`,border:`1px solid ${C.border}`,borderRadius:14,padding:"16px",marginBottom:12,textAlign:"center"}}>
        <div style={{color:C.muted,fontSize:9,textTransform:"uppercase",letterSpacing:1.5,marginBottom:4}}>Saldo Total</div>
        <div style={{color:C.gold,fontSize:28,fontWeight:900,fontFamily:"Georgia,serif"}}>{fmtR(totalSaldo)}</div>
      </div>
      {contas.length===0&&<div style={{background:C.card,border:`1px dashed ${C.border}`,borderRadius:10,padding:24,textAlign:"center",marginBottom:12}}><div style={{fontSize:28,marginBottom:8}}>🏦</div><div style={{color:C.muted,fontSize:12}}>Nenhuma conta cadastrada</div></div>}
      {contas.map(c=>{
        const sr=getSaldoReal(c,allTx);
        const entradas=allTx.filter(t=>t.contaId===c.id&&t.tipoFluxo==="Receitas").reduce((s,t)=>s+t.valor,0);
        const saidas=allTx.filter(t=>t.contaId===c.id&&t.tipoFluxo!=="Receitas"&&!t.cartaoId).reduce((s,t)=>s+t.valor,0);
        return(
          <div key={c.id} style={{background:C.card,border:`1px solid ${C.border}`,borderLeft:`4px solid ${c.cor||C.blue}`,borderRadius:10,padding:"12px 14px",marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontSize:13,fontWeight:800}}>{c.nome}</div>
                <div style={{fontSize:10,color:C.muted}}>{c.tipo} · Inicial: {fmtR(c.saldoInicial||0)}</div>
                {entradas>0&&<div style={{fontSize:10,color:C.green,marginTop:2}}>▲ Receitas: {fmtR(entradas)}</div>}
                {saidas>0&&<div style={{fontSize:10,color:C.red,marginTop:1}}>▼ Débitos: {fmtR(saidas)}</div>}
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:18,fontWeight:800,color:C.gold}}>{fmtR(sr)}</div>
                <button onClick={()=>{setEditId(c.id);setForm({...c});setShowAdd(true);}} style={{background:"none",border:`1px solid ${C.border}`,color:C.muted,borderRadius:6,padding:"3px 10px",cursor:"pointer",fontSize:10,marginTop:4}}>✏️ Editar</button>
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
            <div style={{marginBottom:11}}><label style={{color:C.muted,fontSize:10,display:"block",marginBottom:4}}>NOME</label><input value={form.nome} onChange={e=>setForm(p=>({...p,nome:e.target.value}))} placeholder="Nubank, Itaú, XP..." style={inp}/></div>
            <div style={{marginBottom:11}}><label style={{color:C.muted,fontSize:10,display:"block",marginBottom:4}}>TIPO</label><select value={form.tipo} onChange={e=>setForm(p=>({...p,tipo:e.target.value}))} style={inp}>{["Corrente","Poupança","Investimento","Corretora","Carteira","Outro"].map(t=><option key={t}>{t}</option>)}</select></div>
            <div style={{marginBottom:11}}><label style={{color:C.muted,fontSize:10,display:"block",marginBottom:4}}>SALDO INICIAL (R$)</label><ValorInput value="" cor={C.muted} onChange={num=>setForm(p=>({...p,saldoInicial:num}))}/><div style={{color:C.muted,fontSize:9,marginTop:2}}>Atual digitado: {fmtR(form.saldoInicial)}</div></div>
            <div style={{marginBottom:11}}><label style={{color:C.muted,fontSize:10,display:"block",marginBottom:4}}>SALDO ATUAL (R$)</label><ValorInput value="" cor={C.gold} onChange={num=>setForm(p=>({...p,saldo:num}))}/><div style={{color:C.muted,fontSize:9,marginTop:2}}>Atual: {fmtR(form.saldo)}</div></div>
            <div style={{marginBottom:16}}><label style={{color:C.muted,fontSize:10,display:"block",marginBottom:6}}>COR</label><div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{cores.map(cor=><button key={cor} onClick={()=>setForm(p=>({...p,cor}))} style={{width:30,height:30,borderRadius:"50%",background:cor,border:`3px solid ${form.cor===cor?"#fff":"transparent"}`,cursor:"pointer"}}/>)}</div></div>
            <button onClick={salvar} disabled={saving} style={{width:"100%",background:saving?"#333":`linear-gradient(135deg,${C.blue},${C.blue2})`,border:"none",borderRadius:12,padding:"14px",color:"#fff",fontWeight:800,fontSize:14,cursor:"pointer"}}>{saving?"Salvando...":"Salvar Conta"}</button>
            {editId&&<button onClick={async()=>{await onSaveContas(contas.filter(c=>c.id!==editId));setShowAdd(false);setEditId(null);}} style={{width:"100%",background:"none",border:`1px solid ${C.red}`,color:C.red,borderRadius:12,padding:"11px",cursor:"pointer",marginTop:8,fontSize:13}}>🗑 Excluir Conta</button>}
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
    const lista=editId?objetivos.map(g=>g.id===editId?{...g,...form}:g):[...objetivos,{...form,id:Date.now().toString()}];
    await onSaveObjetivos(lista);
    setSaving(false);setShowAdd(false);setEditId(null);setForm({nome:"",valorAlvo:0,valorAtual:0,prazo:"",icone:"🎯",status:"ativo"});
  };

  const addContrib=async id=>{
    const val=parseVal(contrib);
    if(val<=0)return;
    setSaving(true);
    const lista=objetivos.map(g=>{
      if(g.id!==id)return g;
      const novo=(g.valorAtual||0)+val;
      return{...g,valorAtual:novo,status:novo>=g.valorAlvo?"concluido":"ativo"};
    });
    await onSaveObjetivos(lista);
    setSaving(false);setShowContrib(null);setContrib("");
  };

  const ativos=objetivos.filter(g=>g.status!=="concluido");
  const concluidos=objetivos.filter(g=>g.status==="concluido");

  return(
    <div>
      <div style={{color:C.muted,fontSize:9,textTransform:"uppercase",letterSpacing:1.5,marginBottom:10}}>🎯 Meus Objetivos</div>
      {ativos.length===0&&concluidos.length===0&&(
        <div style={{background:C.card,border:`1px dashed ${C.border}`,borderRadius:12,padding:28,textAlign:"center",marginBottom:12}}>
          <div style={{fontSize:36,marginBottom:8}}>🎯</div>
          <div style={{color:C.blue,fontWeight:700,fontSize:14,marginBottom:4}}>Defina seus objetivos!</div>
          <div style={{color:C.muted,fontSize:12}}>Casa, carro, viagem... tudo começa com um objetivo.</div>
        </div>
      )}
      {ativos.map(g=>{
        const pct=Math.min((g.valorAtual||0)/(g.valorAlvo||1)*100,100);
        return(
          <div key={g.id} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"14px",marginBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
              <div><div style={{fontSize:14,fontWeight:800}}>{g.icone} {g.nome}</div>{g.prazo&&<div style={{fontSize:10,color:C.muted,marginTop:2}}>📅 {g.prazo}</div>}</div>
              <button onClick={()=>{setEditId(g.id);setForm({...g});setShowAdd(true);}} style={{background:"none",border:`1px solid ${C.border}`,color:C.muted,borderRadius:6,padding:"3px 8px",cursor:"pointer",fontSize:10}}>✏️</button>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
              <span style={{color:C.blue,fontSize:14,fontWeight:800}}>{fmtR(g.valorAtual||0)}</span>
              <span style={{color:C.gold,fontSize:13}}>Meta: {fmtR(g.valorAlvo)}</span>
            </div>
            <div style={{background:C.bg,borderRadius:8,height:12,overflow:"hidden",marginBottom:4}}>
              <div style={{width:`${pct}%`,height:"100%",background:`linear-gradient(90deg,${C.blue},${C.teal})`,borderRadius:8,position:"relative"}}>
                {pct>15&&<div style={{position:"absolute",right:6,top:"50%",transform:"translateY(-50%)",fontSize:8,color:"#fff",fontWeight:700}}>{pct.toFixed(0)}%</div>}
              </div>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
              <span style={{fontSize:9,color:C.muted}}>Falta: {fmtR(Math.max((g.valorAlvo||0)-(g.valorAtual||0),0))}</span>
              <span style={{fontSize:9,color:C.muted}}>{pct.toFixed(1)}%</span>
            </div>
            {showContrib===g.id?(
              <div style={{display:"flex",gap:8}}>
                <input type="text" inputMode="decimal" placeholder="Valor (ex: 500,00)" value={contrib} onChange={e=>setContrib(e.target.value)} style={{...inp,flex:1}} autoFocus/>
                <button onClick={()=>addContrib(g.id)} style={{padding:"10px 14px",background:`linear-gradient(135deg,${C.blue},${C.blue2})`,border:"none",borderRadius:8,color:"#fff",fontWeight:700,cursor:"pointer",fontSize:12}}>+ Add</button>
                <button onClick={()=>{setShowContrib(null);setContrib("");}} style={{padding:"10px",background:"none",border:`1px solid ${C.border}`,borderRadius:8,color:C.muted,cursor:"pointer"}}>×</button>
              </div>
            ):(
              <button onClick={()=>setShowContrib(g.id)} style={{width:"100%",background:`${C.blue}22`,border:`1px solid ${C.blue}44`,color:C.blue,padding:"9px",borderRadius:8,cursor:"pointer",fontSize:12,fontWeight:700}}>
                + Adicionar ao objetivo
              </button>
            )}
          </div>
        );
      })}
      {concluidos.length>0&&(
        <>
          <div style={{color:C.green,fontSize:9,textTransform:"uppercase",letterSpacing:1.5,marginBottom:8}}>✅ Concluídos</div>
          {concluidos.map(g=>(
            <div key={g.id} style={{background:C.card,border:`1px solid ${C.green}44`,borderRadius:10,padding:"12px 14px",marginBottom:8,opacity:0.7}}>
              <div style={{display:"flex",justifyContent:"space-between"}}>
                <span style={{fontSize:12,fontWeight:700}}>{g.icone} {g.nome}</span>
                <span style={{color:C.green,fontWeight:700,fontSize:11}}>✅ {fmtR(g.valorAlvo)}</span>
              </div>
            </div>
          ))}
        </>
      )}
      <button onClick={()=>{setEditId(null);setForm({nome:"",valorAlvo:0,valorAtual:0,prazo:"",icone:"🎯",status:"ativo"});setShowAdd(true);}} style={{width:"100%",background:"none",border:`1px dashed ${C.border}`,color:C.teal,padding:"12px",borderRadius:10,cursor:"pointer",fontSize:13,fontWeight:700,marginTop:4}}>+ Criar Objetivo</button>

      {showAdd&&(
        <div style={{position:"fixed",inset:0,background:"#000c",zIndex:200,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
          <div style={{background:C.card,width:"100%",maxWidth:480,borderRadius:"20px 20px 0 0",padding:"20px 18px 36px",maxHeight:"90vh",overflowY:"auto"}}>
            <div style={{width:40,height:4,background:C.border,borderRadius:2,margin:"0 auto 16px"}}/>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:16}}>
              <span style={{color:C.gold,fontWeight:900,fontSize:15}}>🎯 {editId?"Editar":"Novo"} Objetivo</span>
              <button onClick={()=>setShowAdd(false)} style={{background:"none",border:"none",color:C.muted,fontSize:22,cursor:"pointer"}}>×</button>
            </div>
            <div style={{marginBottom:10}}><label style={{color:C.muted,fontSize:10,display:"block",marginBottom:6}}>ÍCONE</label><div style={{display:"flex",flexWrap:"wrap",gap:6}}>{GOAL_ICONS.map(ic=><button key={ic} onClick={()=>setForm(p=>({...p,icone:ic}))} style={{fontSize:20,padding:6,borderRadius:8,border:`2px solid ${form.icone===ic?C.gold:C.border}`,background:form.icone===ic?C.gold+"22":"transparent",cursor:"pointer"}}>{ic}</button>)}</div></div>
            <div style={{marginBottom:11}}><label style={{color:C.muted,fontSize:10,display:"block",marginBottom:4}}>NOME</label><input value={form.nome} onChange={e=>setForm(p=>({...p,nome:e.target.value}))} placeholder="Ex: Casa própria, Viagem..." style={inp}/></div>
            <div style={{marginBottom:11}}><label style={{color:C.muted,fontSize:10,display:"block",marginBottom:4}}>VALOR DA META (R$)</label><ValorInput value="" cor={C.gold} onChange={num=>setForm(p=>({...p,valorAlvo:num}))}/><div style={{color:C.muted,fontSize:9,marginTop:2}}>Meta: {fmtR(form.valorAlvo)}</div></div>
            <div style={{marginBottom:11}}><label style={{color:C.muted,fontSize:10,display:"block",marginBottom:4}}>JÁ TENHO (R$)</label><ValorInput value="" cor={C.blue} onChange={num=>setForm(p=>({...p,valorAtual:num}))}/><div style={{color:C.muted,fontSize:9,marginTop:2}}>Atual: {fmtR(form.valorAtual)}</div></div>
            <div style={{marginBottom:16}}><label style={{color:C.muted,fontSize:10,display:"block",marginBottom:4}}>PRAZO</label><input type="date" value={form.prazo||""} onChange={e=>setForm(p=>({...p,prazo:e.target.value}))} style={inp}/></div>
            <button onClick={salvar} disabled={saving} style={{width:"100%",background:saving?"#333":`linear-gradient(135deg,${C.teal},${C.blue})`,border:"none",borderRadius:12,padding:"14px",color:"#fff",fontWeight:800,fontSize:14,cursor:"pointer"}}>{saving?"Salvando...":"Salvar Objetivo"}</button>
            {editId&&<button onClick={async()=>{await onSaveObjetivos(objetivos.filter(g=>g.id!==editId));setShowAdd(false);setEditId(null);}} style={{width:"100%",background:"none",border:`1px solid ${C.red}`,color:C.red,borderRadius:12,padding:"11px",cursor:"pointer",marginTop:8,fontSize:13}}>🗑 Excluir</button>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── PATRIMÔNIO TAB ────────────────────────────────────────────────────────────
function PatrimonioTab({patrimonio,onSavePatrimonio,contas,allTx}){
  const[showAdd,setShowAdd]=useState(false);
  const[editIdx,setEditIdx]=useState(null);
  const[editForm,setEditForm]=useState({});
  const[newForm,setNewForm]=useState({mes:"",reserva:0,banco2:0,corretoraX:0,inter:0,exterior:0,outros:0});
  const[saving,setSaving]=useState(false);
  const cols=["reserva","banco2","corretoraX","inter","exterior","outros"];
  const colL={reserva:"Reserva/Poupança",banco2:"Banco",corretoraX:"Corretora X",inter:"Inter",exterior:"Exterior",outros:"Outros"};
  const colC={reserva:C.green,banco2:C.gold,corretoraX:C.blue,inter:C.teal,exterior:C.purple,outros:C.orange};
  const sorted=[...patrimonio].sort((a,b)=>a.mes.localeCompare(b.mes));
  const chartData=sorted.map(p=>({mes:p.mes,total:cols.reduce((s,c)=>s+(parseFloat(p[c])||0),0)})).filter(d=>d.total>0);
  const salvar=async l=>{setSaving(true);await onSavePatrimonio(l);setSaving(false);};
  const inp={background:C.card2,border:`1px solid ${C.border}`,color:C.text,padding:"10px 12px",borderRadius:8,fontSize:13,width:"100%",boxSizing:"border-box",outline:"none"};
  // Só conta investimento, corretora, poupança, reserva — não conta corrente
  const contasPatrim = contas.filter(c => TIPOS_PATRIMONIO.includes(c.tipo));
  const totalContas  = contasPatrim.reduce((s,c)=>s+getSaldoReal(c,allTx||[]),0);

  return(
    <div>
      <div style={{color:C.muted,fontSize:9,textTransform:"uppercase",letterSpacing:1.5,marginBottom:10}}>📈 Evolução Patrimonial</div>

      {totalContas>0&&(
        <div style={{background:`linear-gradient(135deg,${C.card2},${C.card3})`,border:`1px solid ${C.border}`,borderRadius:14,padding:"16px",marginBottom:10,textAlign:"center"}}>
          <div style={{color:C.muted,fontSize:9,textTransform:"uppercase",letterSpacing:1.5,marginBottom:4}}>Patrimônio (Investimentos + Reservas)</div>
          <div style={{color:C.gold,fontSize:26,fontWeight:900,fontFamily:"Georgia,serif"}}>{fmtR(totalContas)}</div>
          <div style={{display:"flex",gap:6,justifyContent:"center",marginTop:8,flexWrap:"wrap"}}>
            {contasPatrim.filter(c=>getSaldoReal(c,allTx||[])>0).map(c=>(
              <Tag key={c.id} label={`${c.nome}: ${fmtR(getSaldoReal(c,allTx||[]))}`} cor={c.cor||C.blue}/>
            ))}
          </div>
        </div>
      )}

      {chartData.length>0&&(
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"10px 2px",marginBottom:12}}>
          <ResponsiveContainer width="100%" height={150}>
            <AreaChart data={chartData}>
              <defs><linearGradient id="patG" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.blue} stopOpacity={0.5}/><stop offset="95%" stopColor={C.blue} stopOpacity={0}/></linearGradient></defs>
              <CartesianGrid strokeDasharray="2 4" stroke={C.border}/>
              <XAxis dataKey="mes" tick={{fill:C.muted,fontSize:9}}/>
              <YAxis tickFormatter={fmtK} tick={{fill:C.muted,fontSize:8}} width={40}/>
              <Tooltip content={<ChartTip/>}/>
              <Area type="monotone" dataKey="total" name="Patrimônio" stroke={C.blue} fill="url(#patG)" strokeWidth={2}/>
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {sorted.length===0&&<div style={{background:C.card,border:`1px dashed ${C.border}`,borderRadius:10,padding:24,textAlign:"center",marginBottom:12}}><div style={{fontSize:28,marginBottom:6}}>📈</div><div style={{color:C.muted,fontSize:12}}>Registre snapshots mensais para ver a evolução</div></div>}

      {sorted.map((p,i)=>{
        const total=cols.reduce((s,c)=>s+(parseFloat(p[c])||0),0);
        const isEdit=editIdx===i;
        return(
          <div key={p.mes} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 14px",marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:isEdit?12:0}}>
              <span style={{fontWeight:800,color:C.gold,fontSize:13}}>{p.mes}</span>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <span style={{color:C.blue,fontWeight:700,fontSize:13}}>{fmtR(total)}</span>
                <button onClick={()=>{if(isEdit){setEditIdx(null);}else{setEditIdx(i);setEditForm({...p});}}} style={{background:"none",border:`1px solid ${C.border}`,color:C.muted,borderRadius:6,padding:"2px 8px",cursor:"pointer",fontSize:10}}>{isEdit?"✕":"✏️"}</button>
              </div>
            </div>
            {isEdit&&(
              <div>
                {cols.map(c=>(
                  <div key={c} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                    <label style={{color:colC[c],fontSize:11,width:"45%",flexShrink:0}}>{colL[c]}</label>
                    <input type="text" inputMode="decimal" value={editForm[c]||0} onChange={e=>setEditForm(f=>({...f,[c]:parseFloat(e.target.value)||0}))} style={inp}/>
                  </div>
                ))}
                <button onClick={async()=>{await salvar(patrimonio.map((item,idx)=>idx===i?{...editForm}:item));setEditIdx(null);}} disabled={saving} style={{width:"100%",background:saving?"#333":`linear-gradient(135deg,${C.blue},${C.blue2})`,border:"none",borderRadius:8,padding:"10px",color:"#fff",fontWeight:700,cursor:"pointer",marginTop:4,fontSize:12}}>
                  {saving?"Salvando...":"Salvar"}
                </button>
              </div>
            )}
            {!isEdit&&total>0&&<div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:6}}>{cols.filter(c=>p[c]>0).map(c=><Tag key={c} label={`${colL[c]}: ${fmtK(p[c])}`} cor={colC[c]}/>)}</div>}
          </div>
        );
      })}

      <button onClick={()=>setShowAdd(true)} style={{width:"100%",background:"none",border:`1px dashed ${C.border}`,color:C.blue,padding:"12px",borderRadius:10,cursor:"pointer",fontSize:13,fontWeight:700,marginTop:4}}>+ Registrar mês</button>

      {showAdd&&(
        <div style={{position:"fixed",inset:0,background:"#000c",zIndex:200,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
          <div style={{background:C.card,width:"100%",maxWidth:480,borderRadius:"20px 20px 0 0",padding:"20px 18px 36px",maxHeight:"90vh",overflowY:"auto"}}>
            <div style={{width:40,height:4,background:C.border,borderRadius:2,margin:"0 auto 16px"}}/>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:16}}>
              <span style={{color:C.gold,fontWeight:900,fontSize:15}}>📈 Registrar Mês</span>
              <button onClick={()=>setShowAdd(false)} style={{background:"none",border:"none",color:C.muted,fontSize:22,cursor:"pointer"}}>×</button>
            </div>
            <div style={{marginBottom:12}}><label style={{color:C.muted,fontSize:10,display:"block",marginBottom:4}}>MÊS (MM/AAAA)</label><input value={newForm.mes} onChange={e=>setNewForm(f=>({...f,mes:e.target.value}))} placeholder="06/2026" style={inp}/></div>
            {cols.map(c=><div key={c} style={{marginBottom:8}}><label style={{color:colC[c],fontSize:10,display:"block",marginBottom:3}}>{colL[c]} (R$)</label><input type="text" inputMode="decimal" value={newForm[c]||""} placeholder="0" onChange={e=>setNewForm(f=>({...f,[c]:parseFloat(e.target.value)||0}))} style={inp}/></div>)}
            <button onClick={async()=>{if(!newForm.mes)return;await salvar([...patrimonio,{...newForm}]);setShowAdd(false);setNewForm({mes:"",reserva:0,banco2:0,corretoraX:0,inter:0,exterior:0,outros:0});}} disabled={saving}
              style={{width:"100%",background:saving?"#333":`linear-gradient(135deg,${C.blue},${C.blue2})`,border:"none",borderRadius:12,padding:"14px",color:"#fff",fontWeight:800,fontSize:14,cursor:"pointer",marginTop:8}}>
              {saving?"Salvando...":"Registrar"}
            </button>
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
      <div style={{color:C.muted,fontSize:9,textTransform:"uppercase",letterSpacing:1.5,marginBottom:10}}>📊 Orçamento Mensal</div>
      <div style={{display:"flex",gap:7,marginBottom:12}}>
        <KPI icon="💼" label="Renda" value={fmtK(orcamento.rendaPrevista)} cor={C.green} small/>
        <KPI icon="🔴" label="Dívidas" value={fmtK(orcamento.dividas)} cor={C.red} small/>
        <KPI icon="✅" label="Renda Real" value={fmtK(rendaReal)} cor={C.gold} small/>
      </div>
      {planejados.map((g,i)=>{
        const pct=g.planejado>0?Math.min((g.gasto/g.planejado)*100,120):0;const over=pct>100;
        return(
          <div key={i} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"11px 13px",marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6,flexWrap:"wrap",gap:4}}>
              <span style={{fontSize:12,fontWeight:700,color:g.cor}}>{g.tipo}</span>
              <span style={{fontSize:11}}><span style={{color:over?C.red:C.text,fontWeight:700}}>{fmtR(g.gasto)}</span><span style={{color:C.muted}}> / {fmtR(g.planejado)}</span></span>
            </div>
            <div style={{background:C.bg,borderRadius:6,height:9,overflow:"hidden"}}>
              <div style={{width:`${Math.min(pct,100)}%`,height:"100%",background:over?C.red:g.cor,borderRadius:6,transition:"width 0.7s"}}/>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
              <span style={{fontSize:9,color:over?C.red:C.muted}}>{over?"⚠ ":""}{pct.toFixed(0)}%</span>
              <span style={{fontSize:9,color:g.gasto<=g.planejado?C.green:C.red}}>{g.gasto<=g.planejado?`Restando: ${fmtR(g.planejado-g.gasto)}`:`Excedido: ${fmtR(g.gasto-g.planejado)}`}</span>
            </div>
          </div>
        );
      })}
      <button onClick={()=>{setTmp(orcamento);setEditando(true);}} style={{width:"100%",background:"none",border:`1px solid ${C.border}`,color:C.muted,padding:"10px",borderRadius:8,cursor:"pointer",fontSize:12,marginTop:4}}>⚙️ Configurar</button>
      {editando&&(
        <div style={{position:"fixed",inset:0,background:"#000c",zIndex:200,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
          <div style={{background:C.card,width:"100%",maxWidth:480,borderRadius:"20px 20px 0 0",padding:"20px 18px 36px",maxHeight:"90vh",overflowY:"auto"}}>
            <div style={{width:40,height:4,background:C.border,borderRadius:2,margin:"0 auto 16px"}}/>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:16}}>
              <span style={{color:C.gold,fontWeight:900,fontSize:15}}>⚙️ Orçamento</span>
              <button onClick={()=>setEditando(false)} style={{background:"none",border:"none",color:C.muted,fontSize:22,cursor:"pointer"}}>×</button>
            </div>
            {[{k:"rendaPrevista",l:"Renda Prevista (R$)"},{k:"dividas",l:"Dívidas (R$)"}].map(f=>(
              <div key={f.k} style={{marginBottom:11}}><label style={{color:C.muted,fontSize:10,display:"block",marginBottom:4}}>{f.l}</label><input type="number" value={tmp[f.k]} onChange={e=>setTmp(p=>({...p,[f.k]:parseFloat(e.target.value)||0}))} style={inp}/></div>
            ))}
            {[{k:"necessidades",l:"Necessidades Básicas %"},{k:"investimentos",l:"Investimentos %"},{k:"longoP",l:"Longo Prazo %"},{k:"educacao",l:"Educação %"},{k:"lazer",l:"Lazer %"}].map(f=>(
              <div key={f.k} style={{marginBottom:10,display:"flex",alignItems:"center",gap:10}}>
                <label style={{color:C.muted,fontSize:11,flex:1}}>{f.l}</label>
                <div style={{display:"flex",alignItems:"center",gap:4}}><input type="number" min="0" max="100" value={tmp[f.k]} onChange={e=>setTmp(p=>({...p,[f.k]:parseFloat(e.target.value)||0}))} style={{...inp,width:60,textAlign:"center"}}/><span style={{color:C.muted,fontSize:12}}>%</span></div>
              </div>
            ))}
            <div style={{color:C.muted,fontSize:11,textAlign:"right",marginBottom:14}}>Total: <span style={{color:[tmp.necessidades,tmp.investimentos,tmp.longoP,tmp.educacao,tmp.lazer].reduce((a,b)=>a+b,0)===100?C.green:C.red,fontWeight:700}}>{[tmp.necessidades,tmp.investimentos,tmp.longoP,tmp.educacao,tmp.lazer].reduce((a,b)=>a+b,0)}%</span></div>
            <button onClick={salvarOrc} disabled={saving} style={{width:"100%",background:saving?"#333":`linear-gradient(135deg,${C.blue},${C.blue2})`,border:"none",borderRadius:10,padding:"13px",color:"#fff",fontWeight:800,fontSize:14,cursor:"pointer"}}>{saving?"Salvando...":"Salvar"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── MAIS MENU ─────────────────────────────────────────────────────────────────
function MaisMenu({onSelect,onClose}){
  const items=[{id:"contas",icon:"🏦",label:"Minhas Contas",sub:"Saldo e histórico"},{id:"objetivos",icon:"🎯",label:"Objetivos",sub:"Metas e reservas"},{id:"orcamento_tab",icon:"📊",label:"Orçamento",sub:"Distribuição de gastos"},{id:"patrimonio",icon:"📈",label:"Patrimônio",sub:"Evolução mensal"}];
  return(
    <div style={{position:"fixed",inset:0,background:"#000a",zIndex:150,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={onClose}>
      <div style={{background:C.card,width:"100%",maxWidth:480,borderRadius:"20px 20px 0 0",padding:"16px 18px 40px"}} onClick={e=>e.stopPropagation()}>
        <div style={{width:40,height:4,background:C.border,borderRadius:2,margin:"0 auto 16px"}}/>
        <div style={{color:C.gold,fontWeight:900,fontSize:14,marginBottom:14}}>Mais opções</div>
        {items.map(item=>(
          <button key={item.id} onClick={()=>{onSelect(item.id);onClose();}} style={{width:"100%",background:C.card2,border:`1px solid ${C.border}`,color:C.text,padding:"14px 16px",borderRadius:12,cursor:"pointer",display:"flex",alignItems:"center",gap:12,marginBottom:8,textAlign:"left"}}>
            <span style={{fontSize:22}}>{item.icon}</span>
            <div><div style={{fontSize:13,fontWeight:700}}>{item.label}</div><div style={{fontSize:10,color:C.muted}}>{item.sub}</div></div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── APP PRINCIPAL ─────────────────────────────────────────────────────────────
export default function App(){
  const[tab,setTab]=useState("home");
  const[allTx,setAllTx]=useState([]);
  const[orcamento,setOrcamento]=useState(ORC_INIT);
  const[contas,setContas]=useState([]);
  const[cartoes,setCartoes]=useState([]);
  const[objetivos,setObjetivos]=useState([]);
  const[patrimonio,setPatrimonio]=useState([]);
  const[loaded,setLoaded]=useState(false);
  const[showForm,setShowForm]=useState(false);
  const[showMais,setShowMais]=useState(false);
  const[toast,setToast]=useState(null);
  const[selectedMes,setSelectedMes]=useState(getMA(hoje()));
  const[sync,setSync]=useState("☁️");

  useEffect(()=>{
    const unsub=onSnapshot(collection(db,"lancamentos"),snap=>{
      setAllTx(snap.docs.map(d=>({...d.data(),id:d.id})));
      setSync("☁️ Sync");setTimeout(()=>setSync("☁️"),2000);
    },()=>setSync("⚠️ Offline"));
    Promise.all([
      getDoc(doc(db,"config","orcamento")),
      getDoc(doc(db,"config","contas")),
      getDoc(doc(db,"config","cartoes")),
      getDoc(doc(db,"config","objetivos")),
      getDoc(doc(db,"config","patrimonio")),
    ]).then(([o,c,k,g,p])=>{
      if(o.exists())setOrcamento(o.data());
      if(c.exists())setContas(c.data().lista||[]);
      if(k.exists())setCartoes(k.data().lista||[]);
      if(g.exists())setObjetivos(g.data().lista||[]);
      if(p.exists())setPatrimonio(p.data().lista||[]);
      setLoaded(true);
    }).catch(()=>setLoaded(true));
    return()=>unsub();
  },[]);

  const toast2=(msg,cor=C.green)=>{setToast({msg,cor});setTimeout(()=>setToast(null),2600);};
  const addTx=async tx=>{try{await addDoc(collection(db,"lancamentos"),tx);toast2("✅ Salvo!");}catch{toast2("❌ Erro",C.red);}};
  const delTx=async id=>{try{await deleteDoc(doc(db,"lancamentos",id));toast2("🗑 Removido",C.amber);}catch{toast2("❌ Erro",C.red);}};

  const toggleParcela=async(txId,parcelaIdx)=>{
    const tx=allTx.find(t=>t.id===txId);
    if(!tx)return;
    const pagas=[...(tx.parcelasPagas||Array(tx.parcelas).fill(true))];
    pagas[parcelaIdx]=!pagas[parcelaIdx];
    try{await updateDoc(doc(db,"lancamentos",txId),{parcelasPagas:pagas});toast2(pagas[parcelaIdx]?"✅ Marcado como pago":"↩️ Desmarcado",C.teal);}catch{toast2("❌ Erro",C.red);}
  };

  const saveConf=async(key,val,setter)=>{await setDoc(doc(db,"config",key),val);setter(val.lista||val);toast2("✅ Salvo!");};

  const meses=[...new Set([...allTx.map(t=>t.mesAno),getMA(hoje())])].sort();
  const txMes=allTx.filter(t=>t.mesAno===selectedMes);
  const rec=txMes.filter(t=>t.tipoFluxo==="Receitas").reduce((s,t)=>s+t.valor,0);
  const desp=txMes.filter(t=>t.tipoFluxo!=="Receitas"&&t.tipoFluxo!=="Transferência").reduce((s,t)=>s+t.valor,0);
  const saldo=rec-desp;
  const evolucao=meses.slice(-6).map(m=>{const txs=allTx.filter(t=>t.mesAno===m);return{mes:m,receita:txs.filter(t=>t.tipoFluxo==="Receitas").reduce((s,t)=>s+t.valor,0),despesa:txs.filter(t=>t.tipoFluxo!=="Receitas"&&t.tipoFluxo!=="Transferência").reduce((s,t)=>s+t.valor,0)};});

  const navItems=[{id:"home",icon:"🏠",label:"Início"},{id:"transacoes",icon:"💸",label:"Transações"},{id:"cartoes",icon:"💳",label:"Cartões"}];

  if(!loaded)return(
    <div style={{background:C.bg,minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:14}}>
      <div style={{width:64,height:64,background:`linear-gradient(135deg,${C.blue},${C.blue2})`,borderRadius:16,display:"flex",alignItems:"center",justifyContent:"center",fontSize:32,boxShadow:`0 4px 30px ${C.blue}66`}}>💎</div>
      <div style={{color:C.gold,fontSize:18,fontWeight:900,fontFamily:"Georgia,serif"}}>Oliveira Finance</div>
      <div style={{color:C.muted,fontSize:12}}>☁️ Carregando...</div>
    </div>
  );

  return(
    <div style={{background:C.bg,minHeight:"100vh",fontFamily:"'Trebuchet MS',sans-serif",color:C.text,paddingBottom:68,maxWidth:480,margin:"0 auto",position:"relative"}}>
      <div style={{background:C.card,borderBottom:`1px solid ${C.border}`,padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:100,boxShadow:"0 2px 20px #0006"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:36,height:36,background:`linear-gradient(135deg,${C.blue},${C.blue2})`,borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,boxShadow:`0 2px 12px ${C.blue}44`}}>💎</div>
          <div>
            <div style={{color:C.gold,fontWeight:900,fontSize:14,letterSpacing:0.3,fontFamily:"Georgia,serif"}}>Oliveira Finance</div>
            <div style={{color:C.muted,fontSize:8,letterSpacing:1.5}}>CONTROLE FINANCEIRO · <span style={{color:C.green}}>{sync}</span></div>
          </div>
        </div>
        <select value={selectedMes} onChange={e=>setSelectedMes(e.target.value)} style={{background:C.card2,border:`1px solid ${C.border}`,color:C.gold,padding:"5px 9px",borderRadius:8,fontSize:12,cursor:"pointer",outline:"none"}}>
          {meses.map(m=><option key={m}>{m}</option>)}
        </select>
      </div>

      <div style={{padding:"13px 13px 6px"}}>
        {tab==="home"&&<HomeTab {...{txMes,receitas:rec,despesas:desp,saldo,orcamento,evolucao,contas,cartoes,objetivos,transactions:allTx}}/>}
        {tab==="transacoes"&&<TransacoesTab allTx={allTx} selectedMes={selectedMes} onDelete={delTx} onToggleParcela={toggleParcela} cartoes={cartoes} contas={contas}/>}
        {tab==="cartoes"&&<CartoesTab cartoes={cartoes} onSaveCartoes={l=>saveConf("cartoes",{lista:l},setCartoes)} allTx={allTx} selectedMes={selectedMes}/>}
        {tab==="contas"&&<ContasTab contas={contas} onSaveContas={l=>saveConf("contas",{lista:l},setContas)} allTx={allTx}/>}
        {tab==="objetivos"&&<ObjetivosTab objetivos={objetivos} onSaveObjetivos={l=>saveConf("objetivos",{lista:l},setObjetivos)}/>}
        {tab==="orcamento_tab"&&<OrcamentoTab txMes={txMes} orcamento={orcamento} onSaveOrcamento={d=>saveConf("orcamento",d,setOrcamento)}/>}
        {tab==="patrimonio"&&<PatrimonioTab patrimonio={patrimonio} onSavePatrimonio={l=>saveConf("patrimonio",{lista:l},setPatrimonio)} contas={contas} allTx={allTx}/>}
      </div>

      <button onClick={()=>setShowForm(true)} style={{position:"fixed",bottom:78,right:16,background:`linear-gradient(135deg,${C.blue},${C.blue2})`,border:"none",borderRadius:"50%",width:54,height:54,fontSize:24,cursor:"pointer",boxShadow:`0 4px 24px ${C.blue}66`,display:"flex",alignItems:"center",justifyContent:"center",zIndex:50,color:"#fff",fontWeight:700}}>+</button>

      <nav style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:480,background:C.card,borderTop:`1px solid ${C.border}`,display:"flex",zIndex:100,boxShadow:"0 -2px 20px #0006"}}>
        {navItems.map(n=>(
          <button key={n.id} onClick={()=>setTab(n.id)} style={{flex:1,padding:"8px 4px 10px",border:"none",background:tab===n.id?C.card2:"transparent",borderTop:tab===n.id?`2px solid ${C.blue}`:"2px solid transparent",color:tab===n.id?C.blue:C.muted,cursor:"pointer",fontSize:10,display:"flex",flexDirection:"column",alignItems:"center",gap:2,transition:"all 0.15s"}}>
            <span style={{fontSize:20}}>{n.icon}</span>{n.label}
          </button>
        ))}
        <button onClick={()=>setShowMais(true)} style={{flex:1,padding:"8px 4px 10px",border:"none",background:"transparent",borderTop:"2px solid transparent",color:C.muted,cursor:"pointer",fontSize:10,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
          <span style={{fontSize:20}}>☰</span>Mais
        </button>
      </nav>

      {showMais&&<MaisMenu onSelect={t=>{setTab(t);setShowMais(false);}} onClose={()=>setShowMais(false)}/>}
      {showForm&&<FormModal onClose={()=>setShowForm(false)} onSave={addTx} contas={contas} cartoes={cartoes}/>}
      {toast&&<div style={{position:"fixed",top:62,left:"50%",transform:"translateX(-50%)",background:toast.cor,color:"#fff",padding:"10px 22px",borderRadius:20,fontSize:13,fontWeight:700,zIndex:300,boxShadow:"0 4px 20px #0009",whiteSpace:"nowrap"}}>{toast.msg}</div>}
    </div>
  );
}
