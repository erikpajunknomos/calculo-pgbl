"use client";
import React, { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  CartesianGrid,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Line,
} from "recharts";

/**
 * IR + Previdência (PGBL) — App com layout 2 colunas
 * Corrigido: missing quotes no "use client" e pareamento de chaves.
 */

/* ===================== Utilitários ===================== */
const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtPct = (v: number) => `${(v * 100).toFixed(2)}%`;
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const fmtNumber = (n: number, min = 0, max = 6) => n.toLocaleString("pt-BR", { minimumFractionDigits: min, maximumFractionDigits: max });

/* ===================== INSS / IR 2025 ===================== */
const INSS_BANDS_2025: Array<{ upper: number; rate: number }> = [
  { upper: 1518.0, rate: 0.075 },
  { upper: 2793.88, rate: 0.09 },
  { upper: 4190.83, rate: 0.12 },
  { upper: 8157.41, rate: 0.14 },
];
function inssMensalProgressivo(base: number) {
  let lower = 0;
  let contrib = 0;
  for (const b of INSS_BANDS_2025) {
    const portion = Math.max(0, Math.min(b.upper, base) - lower);
    if (portion > 0) contrib += portion * b.rate;
    lower = b.upper;
  }
  return Math.max(0, contrib);
}
function impostoAnualIRPF2025(base: number) {
  if (base <= 28467.2) return 0;
  if (base <= 33919.8) return 0.075 * base - 2135.04;
  if (base <= 45012.6) return 0.15 * base - 4679.03;
  if (base <= 55976.16) return 0.225 * base - 8054.97;
  return 0.275 * base - 10853.78;
}
function aliquotaMarginalIR(base: number) {
  if (base <= 28467.2) return 0;
  if (base <= 33919.8) return 0.075;
  if (base <= 45012.6) return 0.15;
  if (base <= 55976.16) return 0.225;
  return 0.275;
}
function aliquotaRegressivaPorPrazo(anos: number) {
  if (anos <= 2) return 0.35;
  if (anos <= 4) return 0.3;
  if (anos <= 6) return 0.25;
  if (anos <= 8) return 0.2;
  if (anos <= 10) return 0.15;
  return 0.1;
}

/* ===================== App ===================== */
export default function PgblCltApp() {
  // entradas
  const [nome, setNome] = useState("Exemplo Fulano");
  const [salario, setSalario] = useState(350000);
  const [meses, setMeses] = useState(12);
  const [decimo, setDecimo] = useState(350000);
  const [pgbl, setPgbl] = useState(0);
  const [contribInss, setContribInss] = useState(true);

  // projeção
  const [anosProj, setAnosProj] = useState(10);
  const [taxaReal, setTaxaReal] = useState(0.04);
  const [aliqProgResgate, setAliqProgResgate] = useState(0.275);
  const [recorrente, setRecorrente] = useState(false);

  // avançado
  const [bonus, setBonus] = useState(0);
  const [plr, setPlr] = useState(0);
  const [deps, setDeps] = useState(0);
  const [deducoes, setDeducoes] = useState(0);
  const [incluirFerias, setIncluirFerias] = useState(false);
  const [usarIrrfAuto, setUsarIrrfAuto] = useState(true);
  const [irrfManual, setIrrfManual] = useState(0);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // cálculos base
  const calc = useMemo(() => {
    const mesesC = clamp(meses, 0, 12);
    const ferias = incluirFerias ? salario / 3 : 0;
    const rbt = salario * mesesC + bonus + ferias; // 13º e PLR fora
    const inssSal = inssMensalProgressivo(salario) * mesesC;
    const inss13 = inssMensalProgressivo(decimo);
    const inssFerias = incluirFerias ? inssMensalProgressivo(salario / 3) : 0;
    const inss = contribInss ? inssSal + inss13 + inssFerias : 0;
    const dedDep = deps * 2275.08;
    const pgblLimite = 0.12 * rbt;
    const pgblDed = contribInss ? Math.min(pgbl, Math.max(0, pgblLimite)) : 0;
    const baseSem = Math.max(0, rbt - inss - dedDep - deducoes);
    const impSem = Math.max(0, impostoAnualIRPF2025(baseSem));
    const baseCom = Math.max(0, baseSem - pgblDed);
    const impCom = Math.max(0, impostoAnualIRPF2025(baseCom));
    const economia = Math.max(0, impSem - impCom);
    const aliqMarg = aliquotaMarginalIR(baseSem);
    return { rbt, inss, pgblLimite, pgblDed, baseSem, baseCom, impSem, impCom, economia, aliqMarg } as const;
  }, [salario, meses, decimo, bonus, deps, deducoes, incluirFerias, contribInss, pgbl]);

  // limitar PGBL ao máximo
  useEffect(() => {
    if (contribInss && pgbl > calc.pgblLimite) setPgbl(Math.max(0, calc.pgblLimite));
  }, [calc.pgblLimite, pgbl, contribInss]);
  // auto-preencher com máximo quando zero
  useEffect(() => {
    if (pgbl === 0 && calc.pgblLimite > 0) setPgbl(Math.max(0, calc.pgblLimite));
  }, [calc.pgblLimite, pgbl]);

  // IRRF
  const irrfAuto = useMemo(() => Math.max(0, impostoAnualIRPF2025(calc.baseSem)), [calc.baseSem]);
  const irrfEfetivo = usarIrrfAuto ? irrfAuto : irrfManual;
  const restituicaoFinal = Math.max(0, irrfEfetivo - calc.impCom);

  // projeção (único/recorrente)
  function buildProj(repetir: boolean, anos: number) {
    const aporte = calc.pgblDed;
    const rest = calc.economia;
    const custoEf = Math.max(0, aporte - rest);
    const arrReg: any[] = [];
    const arrProg: any[] = [];
    const Y = Math.max(1, anos);
    for (let y = 1; y <= Y; y++) {
      let fvA = 0, fvR = 0, regL = 0, progL = 0;
      if (!repetir) {
        fvA = aporte * Math.pow(1 + taxaReal, y);
        fvR = rest * Math.pow(1 + taxaReal, y);
        const ar = aliquotaRegressivaPorPrazo(y);
        const ap = clamp(aliqProgResgate, 0, 0.4);
        regL = (fvA + fvR) * (1 - ar);
        progL = (fvA + fvR) * (1 - ap);
      } else {
        for (let k = 1; k <= y; k++) {
          const age = y - k + 1;
          const fvAk = aporte * Math.pow(1 + taxaReal, age);
          const fvRk = rest * Math.pow(1 + taxaReal, age);
          fvA += fvAk; fvR += fvRk;
          regL += (fvAk + fvRk) * (1 - aliquotaRegressivaPorPrazo(age));
          progL += (fvAk + fvRk) * (1 - clamp(aliqProgResgate, 0, 0.4));
        }
      }
      arrReg.push({ ano: `Ano ${y}`, total: regL, aporteBruto: fvA, restBruta: fvR, aliqReg: aliquotaRegressivaPorPrazo(y), custoEf });
      arrProg.push({ ano: `Ano ${y}`, total: progL, aporteBruto: fvA, restBruta: fvR, aliqProg: clamp(aliqProgResgate, 0, 0.4), custoEf });
    }
    return { arrReg, arrProg, custoEf } as const;
  }

  const single = useMemo(() => buildProj(false, anosProj), [calc.pgblDed, calc.economia, anosProj, taxaReal, aliqProgResgate]);
  const rec = useMemo(() => buildProj(true, anosProj), [calc.pgblDed, calc.economia, anosProj, taxaReal, aliqProgResgate]);

  const rows = useMemo(
    () => single.arrReg.map((r, i) => ({
      label: r.ano,
      aporteBruto: r.aporteBruto,
      restituicaoBruta: r.restBruta,
      totalLiqReg: r.total,
      totalLiqProg: single.arrProg[i]?.total ?? 0,
      aliqReg: r.aliqReg,
      aliqProg: clamp(aliqProgResgate, 0, 0.4),
    })),
    [single, aliqProgResgate]
  );
  const rowsRec = useMemo(
    () => rec.arrReg.map((r, i) => ({
      label: r.ano,
      aporteBruto: r.aporteBruto,
      restituicaoBruta: r.restBruta,
      totalLiqReg: r.total,
      totalLiqProg: rec.arrProg[i]?.total ?? 0,
      aliqReg: r.aliqReg,
      aliqProg: clamp(aliqProgResgate, 0, 0.4),
    })),
    [rec, aliqProgResgate]
  );

  /* ===================== Render ===================== */
  return (
    <div className="min-h-screen w-full bg-[#f4ece6] p-6 md:p-10">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-[#021e19]">IR + Previdência (PGBL) — CLT</h1>
            <p className="text-slate-600">Exercício 2026 · Ano-calendário 2025 — estimativa educativa</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="https://www27.receita.fazenda.gov.br/simulador-irpf/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center rounded-2xl px-4 py-2 text-sm font-semibold shadow-sm hover:opacity-90 bg-[#021e19] text-[#c8e05b] border border-[#021e19]">Simulação completa na Receita</a>
          </div>
        </header>

        <div className="md:grid md:grid-cols-12 md:gap-6">
          {/* Esquerda */}
          <div className="md:col-span-4 space-y-4">
            <section className="rounded-2xl bg-white p-5 shadow border border-[#a6a797]">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
                <div className="md:col-span-12">
                  <TextInput label="Nome da simulação" value={nome} onChange={setNome} placeholder="Ex.: Exemplo Paulinho" />
                </div>
                <div className="md:col-span-4">
                  <NumberInput label="Salário bruto mensal" value={salario} onChange={setSalario} prefix="R$" />
                </div>
                <div className="md:col-span-4">
                  <NumberInput label="Meses trabalhados no ano" value={meses} onChange={(v) => setMeses(clamp(Math.round(v), 0, 12))} />
                </div>
                <div className="md:col-span-4">
                  <NumberInput label="13º salário (exclusivo)" value={decimo} onChange={setDecimo} prefix="R$" />
                </div>
                <div className="md:col-span-12">
                  <Toggle label="Contribui para INSS/RPPS? (requerido p/ PGBL)" checked={contribInss} onChange={setContribInss} />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-12">
                <div className="md:col-span-12">
                  <NumberInput label="PGBL planejado" value={pgbl} onChange={setPgbl} prefix="R$" />
                </div>
                <div className="md:col-span-12 rounded-xl border border-[#a6a797]/60 p-3">
                  <PgblProgress limit={calc.pgblLimite} value={pgbl} />
                  <div className="mt-2 text-sm text-slate-700">
                    Sugestão (12% da RBT): <strong>{fmtBRL(calc.pgblLimite)}</strong>
                    <span className="ml-1 text-slate-500">— faltam <strong>{fmtBRL(Math.max(0, calc.pgblLimite - pgbl))}</strong></span>
                  </div>
                </div>
              </div>

              <div className="mt-4">
                <button type="button" onClick={() => setShowAdvanced(!showAdvanced)} className="flex w-full items-center justify-between rounded-xl border bg-white px-3 py-2 text-left">
                  <span className="text-sm font-medium text-slate-700">Opções avançadas (bônus, PLR, dependentes, deduções, IRRF)</span>
                  <span className={`transition-transform ${showAdvanced ? "rotate-90" : ""}`}>›</span>
                </button>
              </div>
              {showAdvanced && (
                <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-4">
                  <NumberInput label="Bônus/Outros tributáveis (anuais)" value={bonus} onChange={setBonus} prefix="R$" />
                  <NumberInput label="PLR (exclusivo)" value={plr} onChange={setPlr} prefix="R$" />
                  <NumberInput label="Nº de dependentes" value={deps} onChange={(v) => setDeps(clamp(Math.round(v), 0, 20))} />
                  <NumberInput label="Outras deduções anuais" value={deducoes} onChange={setDeducoes} prefix="R$" />
                  <div className="md:col-span-3 space-y-2 rounded-xl border p-3">
                    <Toggle label="Calcular IRRF automaticamente" checked={usarIrrfAuto} onChange={setUsarIrrfAuto} />
                    <div className="text-xs text-slate-600">IRRF estimado: <strong>{fmtBRL(irrfAuto)}</strong></div>
                    {!usarIrrfAuto && <NumberInput label="IRRF retido no ano (manual)" value={irrfManual} onChange={setIrrfManual} prefix="R$" />}
                    <div className="pt-2 border-t">
                      <Toggle label={`Incluir 1/3 de férias na base (IR + INSS) — ${fmtBRL(salario / 3)}`} checked={incluirFerias} onChange={setIncluirFerias} />
                      <div className="text-xs text-slate-500">Simplificação: somamos {fmtBRL(salario / 3)} à RBT e calculamos INSS sobre esse valor quando ativado.</div>
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>

          {/* Direita */}
          <div className="md:col-span-8 space-y-4">
            <section className="rounded-2xl bg-white p-4 border border-[#a6a797]">
              <div className="text-lg font-semibold text-[#021e19]">Invista {fmtBRL(calc.pgblDed)} → receba ~{fmtBRL(calc.economia)} (≈ {fmtPct(calc.aliqMarg)} do aporte)</div>
              <div className="text-sm text-slate-600 mt-0.5">Por quê? O PGBL reduz a <em>base de cálculo</em> do IR em até <strong>12% da RBT</strong>. Menos base ⇒ menos imposto ⇒ maior restituição.</div>
            </section>

            <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <KPI title="Aportar agora (dedutível)" value={fmtBRL(calc.pgblDed)} subtitle={`Limite atual: ${fmtBRL(calc.pgblLimite)}`} />
              <KPI title={`Projeção em ${anosProj} ${anosProj === 1 ? "ano" : "anos"} (regressivo)`} value={fmtBRL(rows[rows.length - 1]?.totalLiqReg ?? 0)} subtitle={`Aporte líquido após restituição: ${fmtBRL(Math.max(0, calc.pgblDed - calc.economia))}`} />
            </section>

            <section className="rounded-2xl bg-white p-5 shadow border border-[#a6a797]">
              <h2 className="mb-4 text-lg font-semibold">Projeção da restituição ao longo do tempo</h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <NumberInput label="Horizonte (anos)" value={anosProj} onChange={(v) => setAnosProj(clamp(Math.round(v), 1, 40))} />
                <NumberInput label="Taxa real a.a. (%)" value={taxaReal * 100} onChange={(v) => setTaxaReal(clamp(v / 100, -0.5, 2))} minDecimals={2} maxDecimals={2} />
                <NumberInput label="Alíquota progressiva esperada no resgate (%)" value={aliqProgResgate * 100} onChange={(v) => setAliqProgResgate(clamp(v / 100, 0, 0.4))} minDecimals={2} maxDecimals={2} />
              </div>
              <div className="mt-4 h-96 w-full min-w-0 overflow-visible">
                <ProjectionChart rows={rows} />
              </div>
            </section>

            <section className="rounded-2xl bg-white p-4 border border-[#a6a797]">
              <Toggle label="Ativar plano recorrente (repetir aporte + restituição a cada ano)" checked={recorrente} onChange={setRecorrente} />
            </section>
            {recorrente && (
              <section className="rounded-2xl bg-white p-5 shadow border border-[#a6a797]">
                <h2 className="mb-4 text-lg font-semibold">Projeção recorrente ao longo do tempo</h2>
                <div className="mt-4 h-96 w-full min-w-0 overflow-visible">
                  <ProjectionChart rows={rowsRec} />
                </div>
              </section>
            )}

            <section className="rounded-2xl bg-white p-5 shadow border border-[#a6a797]">
              <h2 className="mb-4 text-lg font-semibold">Resumo</h2>
              <KeyValue k="RBT (salários + bônus)" v={fmtBRL(calc.rbt)} />
              <KeyValue k="Limite PGBL (12% da RBT)" v={fmtBRL(calc.pgblLimite)} />
              <KeyValue k="PGBL dedutível" v={fmtBRL(calc.pgblDed)} />
              <KeyValue k="Base de cálculo do IR (com PGBL)" v={fmtBRL(calc.baseCom)} />
              <KeyValue k="Imposto devido (com PGBL)" v={fmtBRL(calc.impCom)} />
              <KeyValue k="IRRF (estimado)" v={fmtBRL(irrfEfetivo)} />
              <div className="mt-2 rounded-xl bg-slate-50 p-3"><KeyValue k="Restituição (+) / Imposto a pagar (−)" v={fmtBRL(restituicaoFinal)} /></div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===================== Gráfico ===================== */
const CNP = { bg: "#f4ece6", ink: "#021e19", lime: "#c8e05b", bar: "#a6a797", prog: "#2f6df6" } as const;
function fmtBRL_v(v: number) { return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function TooltipV2({ active, payload, label }: any) {
  if (!active || !payload) return null;
  const byKey: Record<string, number> = {};
  payload.forEach((p: any) => { byKey[p.dataKey] = Number(p.value); });
  const raw = (payload[0] && payload[0].payload) || ({} as any);
  const aliqReg = typeof raw.aliqReg === "number" ? raw.aliqReg : undefined;
  const aliqProg = typeof raw.aliqProg === "number" ? raw.aliqProg : undefined;
  const pct = (x?: number) => (typeof x === "number" ? ` (${(x * 100).toFixed(0)}%)` : "");
  return (
    <div style={{ background: "#fff", border: "1px solid #e6e0da", borderRadius: 12, padding: "12px 14px", boxShadow: "0 4px 12px rgba(0,0,0,.06)", maxWidth: 280 }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>Barras (bruto)</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 6 }}>
        <span style={{ color: CNP.bar }}>Aporte investido (bruto)</span>
        <span>{fmtBRL_v(byKey.aporteBruto ?? 0)}</span>
        <span style={{ color: CNP.lime }}>Restituição projetada (bruta)</span>
        <span>{fmtBRL_v(byKey.restituicaoBruta ?? 0)}</span>
      </div>
      <div style={{ fontSize: 12, opacity: 0.8, margin: "10px 0 4px" }}>Linhas (líquido no resgate)</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 6 }}>
        <span style={{ color: CNP.ink }}>Total líquido (regressivo{pct(aliqReg)})</span>
        <span>{fmtBRL_v(byKey.totalLiqReg ?? 0)}</span>
        <span style={{ color: CNP.prog }}>Total líquido (progressivo{pct(aliqProg)})</span>
        <span>{fmtBRL_v(byKey.totalLiqProg ?? 0)}</span>
      </div>
    </div>
  );
}
function ProjectionChart({ rows }: { rows: Array<{ label: string; aporteBruto: number; restituicaoBruta: number; totalLiqReg: number; totalLiqProg: number; aliqReg?: number; aliqProg?: number; }>; }) {
  return (
    <div style={{ background: CNP.bg, borderRadius: 16, padding: 12, border: "1px solid #e6e0da", overflow: "hidden" }}>
      <ResponsiveContainer width="100%" height={360}>
        <ComposedChart data={rows} margin={{ top: 12, right: 16, bottom: 8, left: 8 }}>
          <CartesianGrid stroke="#eee" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: CNP.ink, fontSize: 12 }} />
          <YAxis tick={{ fill: CNP.ink, fontSize: 12 }} tickFormatter={(v: any) => fmtBRL_v(Number(v)).replace(",00", "")} />
          <Tooltip content={<TooltipV2 />} cursor={{ fill: "rgba(2,30,25,0.06)" }} />
          <Legend wrapperStyle={{ paddingTop: 8 }} formatter={(v: any) => ({ aporteBruto: "Aporte investido (bruto)", restituicaoBruta: "Restituição projetada (bruta)", totalLiqReg: "Total líquido (regressivo)", totalLiqProg: "Total líquido (progressivo)" } as any)[v] ?? v} />
          <Bar dataKey="aporteBruto" stackId="b" fill={CNP.bar} radius={[6, 6, 0, 0]} />
          <Bar dataKey="restituicaoBruta" stackId="b" fill={CNP.lime} radius={[6, 6, 0, 0]} />
          <Line type="monotone" dataKey="totalLiqReg" stroke={CNP.ink} strokeWidth={5} dot={false} activeDot={{ r: 7, fill: CNP.ink }} />
          <Line type="monotone" dataKey="totalLiqProg" stroke={CNP.prog} strokeWidth={4} strokeDasharray="6 5" dot={false} activeDot={{ r: 6, stroke: "#fff", strokeWidth: 2, fill: CNP.prog }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ===================== UI helpers ===================== */
function KeyValue({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 rounded-xl border border-[#a6a797] p-3">
      <span className="text-slate-600">{k}</span>
      <span className="font-semibold">{v}</span>
    </div>
  );
}
function KPI({ title, value, subtitle }: { title: string; value: string; subtitle?: string }) {
  return (
    <div className="rounded-2xl border border-[#a6a797] bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{title}</div>
      <div className="mt-1 text-2xl font-bold text-[#021e19]">{value}</div>
      {subtitle ? <div className="mt-1 text-xs text-slate-600">{subtitle}</div> : null}
    </div>
  );
}
function PgblProgress({ limit, value }: { limit: number; value: number }) {
  const pct = limit > 0 ? clamp(value / limit, 0, 1) : 0;
  const pctStr = (pct * 100).toFixed(0) + "%";
  const falta = Math.max(0, limit - value);
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-slate-600">
        <span>Limite legal de dedução (12% da RBT): <strong>{fmtBRL(limit)}</strong></span>
      </div>
      <div className="mt-1 h-2 w-full rounded-full bg-slate-200">
        <div className="h-2 rounded-full bg-[#c8e05b]" style={{ width: pctStr }} />
      </div>
      <div className="mt-1 text-xs text-slate-600">Faltam <strong>{fmtBRL(falta)}</strong> para atingir o máximo.</div>
    </div>
  );
}
function NumberInput({ label, value, onChange, prefix, min, max, minDecimals, maxDecimals, hint }: { label: string; value: number; onChange: (n: number) => void; prefix?: string; min?: number; max?: number; minDecimals?: number; maxDecimals?: number; hint?: string; }) {
  const [text, setText] = useState(() => fmtNumber(value));
  useEffect(() => { setText(fmtNumber(value, minDecimals ?? 0, maxDecimals ?? 6)); }, [value, minDecimals, maxDecimals]);
  function parseToNumber(t: string) {
    const cleaned = t.replace(/[^0-9.,-]/g, "");
    const normalized = cleaned.replace(/\.(?=.*\.)/g, "").replace(/\./g, "").replace(/,/g, ".");
    const n = Number(normalized);
    return Number.isFinite(n) ? n : value;
  }
  function shouldDeferFormat(t: string) { return t === "" || t === "-" || /[.,]$/.test(t); }
  function formatFromText(t: string, n: number) {
    const m = t.match(/[.,]([0-9]*)$/);
    const decFromTyping = m ? m[1].length : 0;
    const minD = minDecimals ?? decFromTyping;
    const maxD = maxDecimals ?? Math.max(decFromTyping, 0);
    return fmtNumber(n, minD, maxD);
  }
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm leading-tight font-medium text-slate-700 flex items-center gap-1 break-words">{label}{hint ? <span title={hint} className="cursor-help text-slate-400">ⓘ</span> : null}</span>
      <div className="flex items-center h-11 rounded-xl border bg-white px-3 py-2 focus-within:ring-2 focus-within:ring-slate-300">
        {prefix ? <span className="mr-1 text-slate-500">{prefix}</span> : null}
        <input
          inputMode="decimal"
          value={text}
          onChange={(e) => {
            const t = e.target.value;
            setText(t);
            let n = parseToNumber(t);
            if (typeof min === "number") n = Math.max(min, n);
            if (typeof max === "number") n = Math.min(max, n);
            onChange(n);
            if (!shouldDeferFormat(t)) setText(formatFromText(t, n));
          }}
          className="w-full outline-none"
          placeholder="0,00"
        />
      </div>
    </label>
  );
}
function TextInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (s: string) => void; placeholder?: string; }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="rounded-xl border bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-slate-300" />
    </label>
  );
}
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between rounded-xl border bg-white px-3 py-2 gap-2">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative ml-3 h-6 w-11 rounded-full transition ${checked ? "bg-[#c8e05b]" : "bg-slate-300"}`}
        aria-pressed={checked}
      >
        <span className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition ${checked ? "translate-x-5" : "translate-x-0"}`} />
      </button>
    </label>
  );
}
