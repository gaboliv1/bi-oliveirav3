import { useState, useEffect } from "react";
import { BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { db } from "./firebase.js";
import { collection, addDoc, deleteDoc, doc, onSnapshot, setDoc, getDoc } from "firebase/firestore";

const C = {
  bg: "#0A1706", card: "#122009", card2: "#1A2F0D", border: "#2C5212",
  text: "#E4EDD4", muted: "#6E9450", lime: "#72C22E", green: "#3D8A10",
  gold: "#E4BD3A", amber: "#C98A18", red: "#C0392B", blue: "#3AB8C8", purple: "#8B5CF6",
};

const CATS = {
  "Receitas": ["Salário", "Outros (Renda)"],
  "Necessidades básicas": ["Água", "Financiamento", "Aluguel #2", "Seguro de vida", "Supermercado", "Cartão de Crédito", "Celular", "Condomínio", "Escolas (filhos)", "Internet", "Energia", "Saúde", "Plano de saúde", "Transporte", "Empréstimo", "Extras (Casa)", "Outros (Necessidades básicas)", "Dízimo e Oferta", "Seguro de Automóvel", "Autocuidado", "Gastos com Pet", "Estacionamento"],
  "Lazer": ["Alimentação (Gastos extras)", "Assinaturas Mensais", "Entretenimento mensal", "Outros (lazer)", "Jogos", "Presentes", "Roupas e Acessórios"],
  "Educação": ["Educação"],
  "Longo Prazo": ["Longo Prazo"],
  "Investimentos": ["Liberdade Financeira", "Reserva de Emergência"],
};

const TIPO_COR = {
  "Receitas": C.lime, "Necessidades básicas": C.amber, "Lazer": C.gold,
  "Educação": C.blue, "Longo Prazo": C.purple, "Investimentos": C.green,
};

const ORC_INIT = { rendaPrevista: 9000, dividas: 2835, necessidades: 75, investimentos: 10, longoP: 0, educacao: 0, lazer: 15 };

const fmtR = v => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
const fmtK = v => Math.abs(v || 0) >= 1000 ? `R$${((v || 0) / 1000).toFixed(1)}k` : `R$${(v || 0).toFixed(0)}`;
const getMA = d => { const dt = new Date(d + "T12:00:00"); return `${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear()}`; };
const hoje = () => new Date().toISOString().split("T")[0];

// ── KPI Card ─────────────────────────────────────────────────────────────────
function KPI({ icon, label, value, sub, cor, small }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: small ? "10px 11px" : "12px 13px", flex: 1, minWidth: 0 }}>
      <div style={{ color: C.muted, fontSize: 9, textTransform: "uppercase", letterSpacing: 1, marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{icon} {label}</div>
      <div style={{ color: cor || C.lime, fontSize: small ? 16 : 19, fontWeight: 800, fontFamily: "Georgia,serif", lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ color: C.muted, fontSize: 9, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── Tooltip dos gráficos ──────────────────────────────────────────────────────
function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: C.card2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 11 }}>
      <div style={{ color: C.gold, fontWeight: 700, marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => <div key={i} style={{ color: p.color || C.text }}>{p.name}: <b>{fmtR(p.value)}</b></div>)}
    </div>
  );
}

// ── Tag colorida ──────────────────────────────────────────────────────────────
function Tag({ label, cor }) {
  return <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 10, background: (cor || C.amber) + "25", color: cor || C.amber, border: `1px solid ${(cor || C.amber)}44`, whiteSpace: "nowrap" }}>{label}</span>;
}

// ── Modal de novo lançamento ──────────────────────────────────────────────────
function FormModal({ onClose, onSave }) {
  const [form, setForm] = useState({ data: hoje(), valor: "", fluxo: "Saída", tipoFluxo: "Necessidades básicas", classificacao: "Supermercado", observacao: "" });
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");

  const setFluxo = f => setForm(p => ({ ...p, fluxo: f, tipoFluxo: f === "Entrada" ? "Receitas" : "Necessidades básicas", classificacao: f === "Entrada" ? "Salário" : "Supermercado" }));
  const setTipo = t => setForm(p => ({ ...p, tipoFluxo: t, classificacao: CATS[t][0] }));

  const salvar = async () => {
    if (!form.valor || parseFloat(form.valor) <= 0) { setErro("Informe um valor maior que zero"); return; }
    setBusy(true);
    await onSave({ data: form.data, valor: parseFloat(form.valor.replace(",", ".")), fluxo: form.fluxo, tipoFluxo: form.tipoFluxo, classificacao: form.classificacao, observacao: form.observacao, mesAno: getMA(form.data) });
    setBusy(false);
    onClose();
  };

  const inp = { background: C.card2, border: `1px solid ${C.border}`, color: C.text, padding: "10px 12px", borderRadius: 8, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000a", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ background: C.card, width: "100%", maxWidth: 480, borderRadius: "18px 18px 0 0", padding: "20px 18px 32px", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ color: C.gold, fontWeight: 900, fontSize: 16 }}>✏️ Novo Lançamento</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.muted, fontSize: 24, cursor: "pointer" }}>×</button>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {["Saída", "Entrada"].map(f => (
            <button key={f} onClick={() => setFluxo(f)} style={{ flex: 1, padding: "11px", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13, background: form.fluxo === f ? (f === "Saída" ? C.red + "33" : C.lime + "33") : "transparent", border: `2px solid ${form.fluxo === f ? (f === "Saída" ? C.red : C.lime) : C.border}`, color: form.fluxo === f ? (f === "Saída" ? C.red : C.lime) : C.muted }}>
              {f === "Saída" ? "💸 Despesa" : "💰 Receita"}
            </button>
          ))}
        </div>

        <div style={{ marginBottom: 11 }}>
          <label style={{ color: C.muted, fontSize: 10, display: "block", marginBottom: 4 }}>📅 DATA</label>
          <input type="date" value={form.data} onChange={e => setForm(p => ({ ...p, data: e.target.value }))} style={inp} />
        </div>

        <div style={{ marginBottom: 11 }}>
          <label style={{ color: C.muted, fontSize: 10, display: "block", marginBottom: 4 }}>💵 VALOR (R$)</label>
          <input type="number" step="0.01" placeholder="0,00" value={form.valor} onChange={e => { setErro(""); setForm(p => ({ ...p, valor: e.target.value })); }} style={{ ...inp, fontSize: 22, fontWeight: 800, color: form.fluxo === "Saída" ? C.red : C.lime }} inputMode="decimal" autoFocus />
          {erro && <div style={{ color: C.red, fontSize: 11, marginTop: 4 }}>⚠ {erro}</div>}
        </div>

        {form.fluxo === "Saída" && (
          <div style={{ marginBottom: 11 }}>
            <label style={{ color: C.muted, fontSize: 10, display: "block", marginBottom: 6 }}>📂 TIPO DE FLUXO</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {Object.keys(CATS).filter(t => t !== "Receitas").map(t => (
                <button key={t} onClick={() => setTipo(t)} style={{ padding: "6px 11px", borderRadius: 20, fontSize: 11, cursor: "pointer", background: form.tipoFluxo === t ? (TIPO_COR[t] + "33") : "transparent", border: `1px solid ${form.tipoFluxo === t ? TIPO_COR[t] : C.border}`, color: form.tipoFluxo === t ? TIPO_COR[t] : C.muted }}>{t}</button>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginBottom: 11 }}>
          <label style={{ color: C.muted, fontSize: 10, display: "block", marginBottom: 4 }}>🏷️ CLASSIFICAÇÃO</label>
          <select value={form.classificacao} onChange={e => setForm(p => ({ ...p, classificacao: e.target.value }))} style={inp}>
            {(CATS[form.tipoFluxo] || []).map(c => <option key={c}>{c}</option>)}
          </select>
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={{ color: C.muted, fontSize: 10, display: "block", marginBottom: 4 }}>📝 OBSERVAÇÃO (opcional)</label>
          <input type="text" placeholder="Ex: Conta de luz de maio..." value={form.observacao} onChange={e => setForm(p => ({ ...p, observacao: e.target.value }))} style={inp} />
        </div>

        <button onClick={salvar} disabled={busy} style={{ width: "100%", background: busy ? "#444" : `linear-gradient(135deg,${C.lime},${C.green})`, border: "none", borderRadius: 12, padding: "14px", color: "#fff", fontWeight: 800, fontSize: 15, cursor: busy ? "not-allowed" : "pointer" }}>
          {busy ? "Salvando na nuvem ☁️..." : "✅  Salvar Lançamento"}
        </button>
      </div>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function HomeTab({ txMes, receitas, despesas, saldo, rendaReal, orcamento, evolucao }) {
  const pieData = Object.keys(CATS).filter(k => k !== "Receitas").map(tipo => ({ tipo, valor: txMes.filter(t => t.tipoFluxo === tipo).reduce((s, t) => s + t.valor, 0), cor: TIPO_COR[tipo] })).filter(d => d.valor > 0);
  const vazio = evolucao.every(e => e.receita === 0 && e.despesa === 0);
  return (
    <div>
      <div style={{ display: "flex", gap: 7, marginBottom: 7 }}>
        <KPI icon="💰" label="Receitas" value={fmtK(receitas)} cor={C.lime} />
        <KPI icon="💸" label="Despesas" value={fmtK(despesas)} cor={C.amber} />
        <KPI icon="📊" label="Saldo" value={fmtK(saldo)} cor={saldo >= 0 ? C.lime : C.red} />
      </div>
      <div style={{ display: "flex", gap: 7, marginBottom: 14 }}>
        <KPI icon="🏦" label="Renda Real" value={fmtK(rendaReal)} sub="após dívidas" cor={C.gold} />
        <KPI icon="🔴" label="Dívidas" value={fmtK(orcamento.dividas)} cor={C.red} />
        <KPI icon="📈" label="Poupança" value={fmtK(txMes.filter(t => t.tipoFluxo === "Investimentos").reduce((s, t) => s + t.valor, 0))} cor={C.green} />
      </div>
      {vazio ? (
        <div style={{ background: C.card, border: `1px dashed ${C.border}`, borderRadius: 12, padding: 28, textAlign: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🌱</div>
          <div style={{ color: C.lime, fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Pronto para começar!</div>
          <div style={{ color: C.muted, fontSize: 12 }}>Toque no <b style={{ color: C.lime }}>+</b> para o primeiro lançamento</div>
          <div style={{ color: C.green, fontSize: 10, marginTop: 6 }}>☁️ Sincronizado entre todos os aparelhos</div>
        </div>
      ) : (
        <>
          <div style={{ color: C.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 6 }}>Evolução Mensal</div>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 2px", marginBottom: 12 }}>
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={evolucao} barCategoryGap="25%">
                <CartesianGrid strokeDasharray="2 4" stroke={C.border} />
                <XAxis dataKey="mes" tick={{ fill: C.muted, fontSize: 9 }} />
                <YAxis tickFormatter={fmtK} tick={{ fill: C.muted, fontSize: 8 }} width={40} />
                <Tooltip content={<ChartTip />} />
                <Bar dataKey="receita" name="Receita" fill={C.lime} radius={[3, 3, 0, 0]} />
                <Bar dataKey="despesa" name="Despesa" fill={C.amber} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
      {pieData.length > 0 && (
        <>
          <div style={{ color: C.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 6 }}>Distribuição de Gastos</div>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 2px", marginBottom: 12 }}>
            <ResponsiveContainer width="100%" height={170}>
              <PieChart>
                <Pie data={pieData} dataKey="valor" nameKey="tipo" cx="42%" cy="50%" innerRadius={40} outerRadius={72}>
                  {pieData.map((d, i) => <Cell key={i} fill={d.cor} stroke={C.bg} strokeWidth={2} />)}
                </Pie>
                <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} formatter={v => <span style={{ color: C.text }}>{v}</span>} />
                <Tooltip formatter={(v, n) => [fmtR(v), n]} contentStyle={{ background: C.card2, border: `1px solid ${C.border}`, color: C.text, fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
      {txMes.length > 0 && (
        <>
          <div style={{ color: C.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 6 }}>Últimos Lançamentos</div>
          {[...txMes].sort((a, b) => new Date(b.data) - new Date(a.data)).slice(0, 5).map(tx => (
            <div key={tx.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx.classificacao}</div>
                <div style={{ fontSize: 10, color: C.muted, marginTop: 1 }}>{tx.data} · <Tag label={tx.tipoFluxo} cor={TIPO_COR[tx.tipoFluxo]} /></div>
              </div>
              <div style={{ color: tx.tipoFluxo === "Receitas" ? C.lime : C.red, fontWeight: 800, fontSize: 14, marginLeft: 10, whiteSpace: "nowrap" }}>
                {tx.tipoFluxo === "Receitas" ? "+" : "-"}{fmtK(tx.valor)}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ── Lançamentos ───────────────────────────────────────────────────────────────
function LancamentosTab({ txMes, onDelete, selectedMes }) {
  const [busca, setBusca] = useState("");
  const [confirmId, setConfirmId] = useState(null);
  const filtrados = [...txMes].filter(t => !busca || t.classificacao.toLowerCase().includes(busca.toLowerCase()) || (t.observacao || "").toLowerCase().includes(busca.toLowerCase())).sort((a, b) => new Date(b.data) - new Date(a.data));
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ color: C.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: 1.5 }}>{selectedMes} · {txMes.length} lançamento{txMes.length !== 1 ? "s" : ""}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <span style={{ color: C.lime, fontSize: 11, fontWeight: 700 }}>↑ {fmtK(txMes.filter(t => t.tipoFluxo === "Receitas").reduce((s, t) => s + t.valor, 0))}</span>
          <span style={{ color: C.red, fontSize: 11, fontWeight: 700 }}>↓ {fmtK(txMes.filter(t => t.tipoFluxo !== "Receitas").reduce((s, t) => s + t.valor, 0))}</span>
        </div>
      </div>
      <input placeholder="🔍 Buscar..." value={busca} onChange={e => setBusca(e.target.value)} style={{ width: "100%", background: C.card, border: `1px solid ${C.border}`, color: C.text, padding: "9px 12px", borderRadius: 8, fontSize: 12, marginBottom: 12, boxSizing: "border-box", outline: "none" }} />
      {filtrados.length === 0 ? (
        <div style={{ background: C.card, border: `1px dashed ${C.border}`, borderRadius: 10, padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
          <div style={{ color: C.muted, fontSize: 12 }}>{busca ? "Nenhum resultado" : "Nenhum lançamento neste mês"}</div>
        </div>
      ) : filtrados.map(tx => (
        <div key={tx.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", marginBottom: 7 }}>
          {confirmId === tx.id ? (
            <div style={{ textAlign: "center" }}>
              <div style={{ color: C.red, fontSize: 12, marginBottom: 8 }}>Remover este lançamento?</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => { onDelete(tx.id); setConfirmId(null); }} style={{ flex: 1, background: C.red, border: "none", borderRadius: 6, padding: "7px", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>Sim</button>
                <button onClick={() => setConfirmId(null)} style={{ flex: 1, background: "none", border: `1px solid ${C.border}`, borderRadius: 6, padding: "7px", color: C.muted, cursor: "pointer", fontSize: 12 }}>Cancelar</button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 2 }}>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>{tx.classificacao}</span>
                  <Tag label={tx.tipoFluxo} cor={TIPO_COR[tx.tipoFluxo]} />
                </div>
                <div style={{ fontSize: 10, color: C.muted }}>{tx.data}</div>
                {tx.observacao && <div style={{ fontSize: 10, color: C.muted, marginTop: 2, fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>"{tx.observacao}"</div>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                <span style={{ color: tx.tipoFluxo === "Receitas" ? C.lime : C.red, fontWeight: 800, fontSize: 13 }}>{tx.tipoFluxo === "Receitas" ? "+" : "-"}{fmtR(tx.valor)}</span>
                <button onClick={() => setConfirmId(tx.id)} style={{ background: "none", border: "none", color: C.border, cursor: "pointer", fontSize: 17, padding: 2 }}>×</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Orçamento ─────────────────────────────────────────────────────────────────
function OrcamentoTab({ txMes, orcamento, onSaveOrcamento }) {
  const [editando, setEditando] = useState(false);
  const [tmp, setTmp] = useState(orcamento);
  const [saving, setSaving] = useState(false);
  const rendaReal = orcamento.rendaPrevista - orcamento.dividas;
  const keyMap = { "Necessidades básicas": "necessidades", "Lazer": "lazer", "Educação": "educacao", "Longo Prazo": "longoP", "Investimentos": "investimentos" };
  const planejados = Object.keys(keyMap).map(t => ({ tipo: t, planejado: (orcamento[keyMap[t]] || 0) / 100 * rendaReal, gasto: txMes.filter(tx => tx.tipoFluxo === t).reduce((s, tx) => s + tx.valor, 0), cor: TIPO_COR[t] }));
  const salvarOrc = async () => { setSaving(true); await onSaveOrcamento(tmp); setSaving(false); setEditando(false); };
  const inp = { background: C.card2, border: `1px solid ${C.border}`, color: C.text, padding: "9px 11px", borderRadius: 8, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none" };
  return (
    <div>
      <div style={{ color: C.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>Programação do Orçamento</div>
      <div style={{ display: "flex", gap: 7, marginBottom: 12 }}>
        <KPI icon="💼" label="Renda Prevista" value={fmtK(orcamento.rendaPrevista)} cor={C.lime} small />
        <KPI icon="🔴" label="Dívidas" value={fmtK(orcamento.dividas)} cor={C.red} small />
        <KPI icon="✅" label="Renda Real" value={fmtK(rendaReal)} cor={C.gold} small />
      </div>
      {planejados.map((g, i) => {
        const pct = g.planejado > 0 ? Math.min((g.gasto / g.planejado) * 100, 120) : 0;
        const over = pct > 100;
        return (
          <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 9, padding: "11px 13px", marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, flexWrap: "wrap", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: g.cor }}>{g.tipo}</span>
              <span style={{ fontSize: 11 }}><span style={{ color: over ? C.red : C.text, fontWeight: 700 }}>{fmtR(g.gasto)}</span><span style={{ color: C.muted }}> / {fmtR(g.planejado)}</span></span>
            </div>
            <div style={{ background: C.bg, borderRadius: 6, height: 9, overflow: "hidden", border: `1px solid ${C.border}` }}>
              <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: over ? C.red : g.cor, borderRadius: 6, transition: "width 0.7s" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
              <span style={{ fontSize: 9, color: over ? C.red : C.muted, fontWeight: over ? 700 : 400 }}>{over ? "⚠ " : ""}{pct.toFixed(0)}%</span>
              <span style={{ fontSize: 9, color: g.gasto <= g.planejado ? C.lime : C.red }}>{g.gasto <= g.planejado ? `Restando: ${fmtR(g.planejado - g.gasto)}` : `Excedido: ${fmtR(g.gasto - g.planejado)}`}</span>
            </div>
          </div>
        );
      })}
      <button onClick={() => { setTmp(orcamento); setEditando(true); }} style={{ width: "100%", background: "none", border: `1px solid ${C.border}`, color: C.muted, padding: "10px", borderRadius: 8, cursor: "pointer", fontSize: 12, marginTop: 4 }}>⚙️ Configurar Orçamento</button>
      {editando && (
        <div style={{ position: "fixed", inset: 0, background: "#000a", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div style={{ background: C.card, width: "100%", maxWidth: 480, borderRadius: "18px 18px 0 0", padding: "20px 18px 32px", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
              <span style={{ color: C.gold, fontWeight: 900, fontSize: 15 }}>⚙️ Configurar Orçamento</span>
              <button onClick={() => setEditando(false)} style={{ background: "none", border: "none", color: C.muted, fontSize: 22, cursor: "pointer" }}>×</button>
            </div>
            {[{ k: "rendaPrevista", l: "Renda Prevista (R$)" }, { k: "dividas", l: "Dívidas (R$)" }].map(f => (
              <div key={f.k} style={{ marginBottom: 11 }}>
                <label style={{ color: C.muted, fontSize: 10, display: "block", marginBottom: 4 }}>{f.l}</label>
                <input type="number" value={tmp[f.k]} onChange={e => setTmp(p => ({ ...p, [f.k]: parseFloat(e.target.value) || 0 }))} style={inp} />
              </div>
            ))}
            <div style={{ color: C.muted, fontSize: 10, marginBottom: 8, marginTop: 4 }}>PERCENTUAIS (total = 100%)</div>
            {[{ k: "necessidades", l: "Necessidades Básicas" }, { k: "investimentos", l: "Investimentos" }, { k: "longoP", l: "Longo Prazo" }, { k: "educacao", l: "Educação" }, { k: "lazer", l: "Lazer" }].map(f => (
              <div key={f.k} style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 10 }}>
                <label style={{ color: C.muted, fontSize: 11, width: "55%" }}>{f.l}</label>
                <div style={{ display: "flex", alignItems: "center", gap: 4, flex: 1 }}>
                  <input type="number" min="0" max="100" value={tmp[f.k]} onChange={e => setTmp(p => ({ ...p, [f.k]: parseFloat(e.target.value) || 0 }))} style={{ ...inp, fontSize: 15, fontWeight: 700 }} />
                  <span style={{ color: C.muted, fontSize: 12 }}>%</span>
                </div>
              </div>
            ))}
            <div style={{ color: C.muted, fontSize: 11, textAlign: "right", marginBottom: 14 }}>
              Total: <span style={{ color: [tmp.necessidades, tmp.investimentos, tmp.longoP, tmp.educacao, tmp.lazer].reduce((a, b) => a + b, 0) === 100 ? C.lime : C.red, fontWeight: 700 }}>{[tmp.necessidades, tmp.investimentos, tmp.longoP, tmp.educacao, tmp.lazer].reduce((a, b) => a + b, 0)}%</span>
            </div>
            <button onClick={salvarOrc} disabled={saving} style={{ width: "100%", background: saving ? "#444" : `linear-gradient(135deg,${C.lime},${C.green})`, border: "none", borderRadius: 10, padding: "13px", color: "#fff", fontWeight: 800, fontSize: 14, cursor: saving ? "not-allowed" : "pointer" }}>
              {saving ? "Salvando ☁️..." : "Salvar Configurações"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Patrimônio ────────────────────────────────────────────────────────────────
function PatrimonioTab({ patrimonio, onSavePatrimonio }) {
  const [addModal, setAddModal] = useState(false);
  const [editIdx, setEditIdx] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [newForm, setNewForm] = useState({ mes: "", reserva: 0, banco2: 0, papelMoeda: 0, corretoraX: 0, inter: 0, exterior: 0 });
  const [saving, setSaving] = useState(false);
  const cols = ["reserva", "banco2", "papelMoeda", "corretoraX", "inter", "exterior"];
  const colLabels = { reserva: "Reserva", banco2: "Banco 2", papelMoeda: "Papel Moeda", corretoraX: "Corretora X", inter: "Inter", exterior: "Exterior" };
  const colCores = { reserva: C.lime, banco2: C.gold, papelMoeda: C.amber, corretoraX: C.green, inter: C.blue, exterior: C.purple };
  const sorted = [...patrimonio].sort((a, b) => a.mes.localeCompare(b.mes));
  const chartData = sorted.map(p => ({ mes: p.mes, total: cols.reduce((s, c) => s + (parseFloat(p[c]) || 0), 0) })).filter(d => d.total > 0);
  const salvar = async lista => { setSaving(true); await onSavePatrimonio(lista); setSaving(false); };
  const inp = { background: C.card2, border: `1px solid ${C.border}`, color: C.text, padding: "8px 11px", borderRadius: 8, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none" };
  return (
    <div>
      <div style={{ color: C.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>Evolução Patrimonial</div>
      {chartData.length > 0 ? (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 2px", marginBottom: 12 }}>
          <ResponsiveContainer width="100%" height={150}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="patG" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={C.lime} stopOpacity={0.5} />
                  <stop offset="95%" stopColor={C.lime} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 4" stroke={C.border} />
              <XAxis dataKey="mes" tick={{ fill: C.muted, fontSize: 9 }} />
              <YAxis tickFormatter={fmtK} tick={{ fill: C.muted, fontSize: 8 }} width={40} />
              <Tooltip content={<ChartTip />} />
              <Area type="monotone" dataKey="total" name="Patrimônio" stroke={C.lime} fill="url(#patG)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div style={{ background: C.card, border: `1px dashed ${C.border}`, borderRadius: 10, padding: 24, textAlign: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>📈</div>
          <div style={{ color: C.muted, fontSize: 12 }}>Adicione dados para ver a evolução</div>
        </div>
      )}
      {sorted.map((p, i) => {
        const total = cols.reduce((s, c) => s + (parseFloat(p[c]) || 0), 0);
        const isEdit = editIdx === i;
        return (
          <div key={p.mes} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 9, padding: "11px 13px", marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: isEdit ? 10 : 0 }}>
              <span style={{ fontWeight: 800, color: C.gold, fontSize: 13 }}>{p.mes}</span>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ color: C.lime, fontWeight: 700, fontSize: 13 }}>{fmtR(total)}</span>
                <button onClick={() => { if (isEdit) { setEditIdx(null); } else { setEditIdx(i); setEditForm({ ...p }); } }} style={{ background: "none", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 6, padding: "2px 8px", cursor: "pointer", fontSize: 11 }}>{isEdit ? "✕" : "✏️"}</button>
              </div>
            </div>
            {isEdit && (
              <div>
                {cols.map(c => (
                  <div key={c} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                    <label style={{ color: colCores[c], fontSize: 11, width: "40%", flexShrink: 0 }}>{colLabels[c]}</label>
                    <input type="number" value={editForm[c] || 0} onChange={e => setEditForm(f => ({ ...f, [c]: parseFloat(e.target.value) || 0 }))} style={inp} />
                  </div>
                ))}
                <button onClick={async () => { await salvar(patrimonio.map((item, idx) => idx === i ? { ...editForm } : item)); setEditIdx(null); }} disabled={saving} style={{ width: "100%", background: saving ? "#444" : `linear-gradient(135deg,${C.lime},${C.green})`, border: "none", borderRadius: 8, padding: "8px", color: "#fff", fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", marginTop: 4, fontSize: 12 }}>
                  {saving ? "Salvando ☁️..." : "Salvar"}
                </button>
              </div>
            )}
            {!isEdit && total > 0 && <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>{cols.filter(c => p[c] > 0).map(c => <Tag key={c} label={`${colLabels[c]}: ${fmtK(p[c])}`} cor={colCores[c]} />)}</div>}
          </div>
        );
      })}
      <button onClick={() => setAddModal(true)} style={{ width: "100%", background: "none", border: `1px dashed ${C.border}`, color: C.muted, padding: "11px", borderRadius: 8, cursor: "pointer", fontSize: 12, marginTop: 4 }}>+ Adicionar mês ao patrimônio</button>
      {addModal && (
        <div style={{ position: "fixed", inset: 0, background: "#000a", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div style={{ background: C.card, width: "100%", maxWidth: 480, borderRadius: "18px 18px 0 0", padding: "20px 18px 32px", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
              <span style={{ color: C.gold, fontWeight: 900, fontSize: 15 }}>📈 Novo Mês</span>
              <button onClick={() => setAddModal(false)} style={{ background: "none", border: "none", color: C.muted, fontSize: 22, cursor: "pointer" }}>×</button>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ color: C.muted, fontSize: 10, display: "block", marginBottom: 4 }}>MÊS (MM/AAAA)</label>
              <input value={newForm.mes} onChange={e => setNewForm(f => ({ ...f, mes: e.target.value }))} placeholder="ex: 06/2026" style={inp} />
            </div>
            {cols.map(c => (
              <div key={c} style={{ marginBottom: 8 }}>
                <label style={{ color: colCores[c], fontSize: 10, display: "block", marginBottom: 3 }}>{colLabels[c]} (R$)</label>
                <input type="number" value={newForm[c] || ""} placeholder="0" onChange={e => setNewForm(f => ({ ...f, [c]: parseFloat(e.target.value) || 0 }))} style={inp} />
              </div>
            ))}
            <button onClick={async () => { if (!newForm.mes) return; await salvar([...patrimonio, { ...newForm }]); setAddModal(false); setNewForm({ mes: "", reserva: 0, banco2: 0, papelMoeda: 0, corretoraX: 0, inter: 0, exterior: 0 }); }} disabled={saving}
              style={{ width: "100%", background: saving ? "#444" : `linear-gradient(135deg,${C.lime},${C.green})`, border: "none", borderRadius: 12, padding: "13px", color: "#fff", fontWeight: 800, fontSize: 14, cursor: saving ? "not-allowed" : "pointer", marginTop: 8 }}>
              {saving ? "Salvando ☁️..." : "Adicionar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── App Principal ─────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("home");
  const [transactions, setTransactions] = useState([]);
  const [orcamento, setOrcamento] = useState(ORC_INIT);
  const [patrimonio, setPatrimonio] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [toast, setToast] = useState(null);
  const [selectedMes, setSelectedMes] = useState(getMA(hoje()));
  const [sync, setSync] = useState("☁️");

  useEffect(() => {
    // Listener em tempo real para lançamentos
    const unsub = onSnapshot(
      collection(db, "lancamentos"),
      snap => {
        setTransactions(snap.docs.map(d => ({ ...d.data(), id: d.id })));
        setSync("☁️ Sync");
        setTimeout(() => setSync("☁️"), 2000);
      },
      () => setSync("⚠️ Offline")
    );

    // Carregar configurações
    Promise.all([
      getDoc(doc(db, "config", "orcamento")),
      getDoc(doc(db, "config", "patrimonio"))
    ]).then(([oDoc, pDoc]) => {
      if (oDoc.exists()) setOrcamento(oDoc.data());
      if (pDoc.exists()) setPatrimonio(pDoc.data().lista || []);
      setLoaded(true);
    }).catch(() => setLoaded(true));

    return () => unsub();
  }, []);

  const showToast = (msg, cor = C.green) => { setToast({ msg, cor }); setTimeout(() => setToast(null), 2600); };

  const addTransaction = async tx => {
    try { await addDoc(collection(db, "lancamentos"), tx); showToast("✅ Salvo na nuvem!"); }
    catch { showToast("❌ Erro ao salvar", C.red); }
  };

  const deleteTransaction = async id => {
    try { await deleteDoc(doc(db, "lancamentos", id)); showToast("🗑 Removido", C.amber); }
    catch { showToast("❌ Erro ao remover", C.red); }
  };

  const saveOrcamento = async data => {
    await setDoc(doc(db, "config", "orcamento"), data);
    setOrcamento(data);
    showToast("✅ Orçamento salvo!");
  };

  const savePatrimonio = async lista => {
    await setDoc(doc(db, "config", "patrimonio"), { lista });
    setPatrimonio(lista);
    showToast("✅ Patrimônio salvo!");
  };

  const mesesDisponiveis = [...new Set([...transactions.map(t => t.mesAno), getMA(hoje())])].sort();
  const txMes = transactions.filter(t => t.mesAno === selectedMes);
  const receitas = txMes.filter(t => t.tipoFluxo === "Receitas").reduce((s, t) => s + t.valor, 0);
  const despesas = txMes.filter(t => t.tipoFluxo !== "Receitas").reduce((s, t) => s + t.valor, 0);
  const saldo = receitas - despesas;
  const rendaReal = orcamento.rendaPrevista - orcamento.dividas;
  const evolucao = mesesDisponiveis.slice(-6).map(m => {
    const txs = transactions.filter(t => t.mesAno === m);
    return { mes: m, receita: txs.filter(t => t.tipoFluxo === "Receitas").reduce((s, t) => s + t.valor, 0), despesa: txs.filter(t => t.tipoFluxo !== "Receitas").reduce((s, t) => s + t.valor, 0) };
  });

  const navItems = [{ id: "home", icon: "📊", label: "Dashboard" }, { id: "lancamentos", icon: "📋", label: "Lançamentos" }, { id: "orcamento_tab", icon: "🎯", label: "Orçamento" }, { id: "patrimonio_tab", icon: "📈", label: "Patrimônio" }];

  if (!loaded) return (
    <div style={{ background: C.bg, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
      <div style={{ fontSize: 48 }}>🌿</div>
      <div style={{ color: C.lime, fontSize: 15, fontWeight: 700 }}>Conectando ao Firebase...</div>
      <div style={{ color: C.muted, fontSize: 12 }}>☁️ Carregando seus dados</div>
    </div>
  );

  return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "'Trebuchet MS',sans-serif", color: C.text, paddingBottom: 68, maxWidth: 480, margin: "0 auto", position: "relative" }}>

      {/* Header */}
      <div style={{ background: C.card, borderBottom: `2px solid ${C.gold}`, padding: "11px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{ background: C.green, borderRadius: "50%", width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", border: `2px solid ${C.gold}`, fontSize: 16 }}>🌿</div>
          <div>
            <div style={{ color: C.gold, fontWeight: 900, fontSize: 12, letterSpacing: 1 }}>VIVER DE RENDA</div>
            <div style={{ color: C.muted, fontSize: 8, letterSpacing: 1 }}>OLIVEIRA'S · <span style={{ color: C.green }}>{sync}</span></div>
          </div>
        </div>
        <select value={selectedMes} onChange={e => setSelectedMes(e.target.value)} style={{ background: C.card2, border: `1px solid ${C.border}`, color: C.gold, padding: "5px 9px", borderRadius: 6, fontSize: 12, cursor: "pointer", outline: "none" }}>
          {mesesDisponiveis.map(m => <option key={m}>{m}</option>)}
        </select>
      </div>

      {/* Conteúdo */}
      <div style={{ padding: "13px 13px 6px" }}>
        {tab === "home" && <HomeTab {...{ txMes, receitas, despesas, saldo, rendaReal, orcamento, evolucao }} />}
        {tab === "lancamentos" && <LancamentosTab txMes={txMes} onDelete={deleteTransaction} selectedMes={selectedMes} />}
        {tab === "orcamento_tab" && <OrcamentoTab txMes={txMes} orcamento={orcamento} onSaveOrcamento={saveOrcamento} />}
        {tab === "patrimonio_tab" && <PatrimonioTab patrimonio={patrimonio} onSavePatrimonio={savePatrimonio} />}
      </div>

      {/* Botão + */}
      <button onClick={() => setShowForm(true)} style={{ position: "fixed", bottom: 76, right: 15, background: `linear-gradient(135deg,${C.lime},${C.green})`, border: "none", borderRadius: "50%", width: 54, height: 54, fontSize: 28, cursor: "pointer", boxShadow: `0 4px 20px ${C.lime}55`, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, color: "#fff", fontWeight: 700 }}>+</button>

      {/* Nav inferior */}
      <nav style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: C.card, borderTop: `1px solid ${C.border}`, display: "flex", zIndex: 100 }}>
        {navItems.map(n => (
          <button key={n.id} onClick={() => setTab(n.id)} style={{ flex: 1, padding: "8px 4px 9px", border: "none", background: tab === n.id ? C.card2 : "transparent", borderTop: tab === n.id ? `2px solid ${C.gold}` : "2px solid transparent", color: tab === n.id ? C.gold : C.muted, cursor: "pointer", fontSize: 10, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, transition: "all 0.15s" }}>
            <span style={{ fontSize: 19 }}>{n.icon}</span>
            {n.label}
          </button>
        ))}
      </nav>

      {/* Modal form */}
      {showForm && <FormModal onClose={() => setShowForm(false)} onSave={addTransaction} />}

      {/* Toast */}
      {toast && <div style={{ position: "fixed", top: 60, left: "50%", transform: "translateX(-50%)", background: toast.cor, color: "#fff", padding: "10px 22px", borderRadius: 20, fontSize: 13, fontWeight: 700, zIndex: 300, boxShadow: "0 4px 20px #0009", whiteSpace: "nowrap" }}>{toast.msg}</div>}
    </div>
  );
}
