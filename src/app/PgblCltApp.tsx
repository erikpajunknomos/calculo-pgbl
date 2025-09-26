"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ResponsiveContainer, ComposedChart, CartesianGrid, Bar, XAxis, YAxis, Tooltip, Legend, Line } from "recharts";

/**
 * IR + Previdência (PGBL) — App simplificado com modo avançado
 * Layout: Entradas na esquerda (col-span-4), Resultados na direita (col-span-8)
 */

// ===== Utilitários =====
const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtPct = (v: number) => `${(v * 100).toFixed(2)}%`;
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

function fmtNumberPt(n: number, min = 0, max = 6) {
  return n.toLocaleString("pt-BR", { useGrouping: true, minimumFractionDigits: min, maximumFractionDigits: max });
}
function fmtBRLCompact(v: number) {
  const abs = Math.abs(v);
  if (abs >= 1e9) return `R$ ${(v / 1e9).toFixed(1).replace('.', ',')} bi`;
  if (abs >= 1e6) return `R$ ${(v / 1e6).toFixed(1).replace('.', ',')} mi`;
  if (abs >= 1e3) return `R$ ${Math.round(v / 1e3).toLocaleString('pt-BR')} mil`;
  return fmtBRL(v);
}

// INSS 2025 — faixas progressivas
const INSS_BANDS_2025: Array<{ upper: number; rate: number }> = [
  { upper: 1518.0, rate: 0.075 },
  { upper: 2793.88, rate: 0.09 },
  { upper: 4190.83, rate: 0.12 },
  { upper: 8157.41, rate: 0.14 },
];
function inssMensalProgressivo(base: number) {
  let lower = 0; let contrib = 0;
  for (const b of INSS_BANDS_2025) {
    const portion = Math.max(0, Math.min(b.upper, base) - lower);
    if (portion > 0) contrib += portion * b.rate;
    lower = b.upper;
  }
  return Math.max(0, contrib);
}

// IRPF 2025
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

// Previdência regressiva (anos)
function aliquotaRegressivaPorPrazo(anos: number) {
  if (anos <= 2) return 0.35;
  if (anos <= 4) return 0.30;
  if (anos <= 6) return 0.25;
  if (anos <= 8) return 0.20;
  if (anos <= 10) return 0.15;
  return 0.10;
}

// Tooltip antigo (não usado no gráfico novo, deixado por compatibilidade)
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const pick = (key: string) => Number(payload.find((p: any) => p.dataKey === key)?.value ?? NaN);
  const ap = Number.isFinite(pick('Aporte')) ? pick('Aporte') : (Number.isFinite(pick('AporteBruto')) ? pick('AporteBruto') : 0);
  const re = Number.isFinite(pick('RestituicaoLiquida')) ? pick('RestituicaoLiquida') : (Number.isFinite(pick('RestBruta')) ? pick('RestBruta') : 0);
  const total = ap + re;
  const aliq = Number(payload?.[0]?.payload?._aliqResgate ?? NaN);
  const custoEf = Number(payload?.[0]?.payload?._custoEfetivo ?? NaN);
  const mult = Number(payload?.[0]?.payload?._multiplicador ?? NaN);
  return (
    <div className="rounded-xl border border-[#a6a797] bg-white p-3 shadow max-w-xs">
      <div className="font-semibold mb-1">{label}</div>
      {!Number.isNaN(aliq) && <div className="text-xs text-slate-500 mb-1">IR no resgate: <strong>{(aliq*100).toFixed(0)}%</strong></div>}
      <div className="text-sm space-y-1">
        <div>Aporte investido: <strong>{fmtBRL(ap)}</strong> {total>0?`(${fmtPct(ap/total)})`:''}</div>
        <div>Restituição projetada: <strong>{fmtBRL(re)}</strong> {total>0?`(${fmtPct(re/total)})`:''}</div>
        <div>Total: <strong>{fmtBRL(total)}</strong></div>
        {!Number.isNaN(custoEf) && <div className="text-xs text-slate-600">Aporte líquido após restituição: <strong>{fmtBRL(custoEf)}</strong></div>}
        {!Number.isNaN(mult) && mult>0 && <div className="text-xs text-slate-600">Multiplicador: <strong>{`×${mult.toLocaleString('pt-BR',{maximumFractionDigits:2})}`}</strong></div>}
      </div>
    </div>
  );
}

// ===== App =====
export default function IRPrevidenciaPgblApp() {
  // Entradas simples
  const [nomeSimulacao, setNomeSimulacao] = useState("Exemplo Fulano");
  const [salarioMensal, setSalarioMensal] = useState(350000);
  const [meses, setMeses] = useState(12);
  const [decimo, setDecimo] = useState(350000);
  const [pgblPlanejado, setPgblPlanejado] = useState(0);
  // Projeção
  const [anosProj, setAnosProj] = useState(10);
  const [taxaReal, setTaxaReal] = useState(0.04);
  const [aliqProgResgate, setAliqProgResgate] = useState(0.275);
  // Série recorrente (opcional)
  const [repetirAnualmente, setRepetirAnualmente] = useState(false);
  // Avançado
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [bonus, setBonus] = useState(0);
  const [plr, setPlr] = useState(0);
  const [dependentes, setDependentes] = useState(0);
  const [outrasDeduc, setOutrasDeduc] = useState(0);
  const [contribInss, setContribInss] = useState(true);
  const [usarIrrfAuto, setUsarIrrfAuto] = useState(true);
  const [incluirFerias, setIncluirFerias] = useState(false);
  const [irrf, setIrrf] = useState(0);

  // Cálculos principais
  const calc = useMemo(() => {
    const mesesClamped = Math.min(12, Math.max(0, meses));
    const extraFerias = incluirFerias ? salarioMensal / 3 : 0;

    const rbt = salarioMensal * mesesClamped + bonus + extraFerias; // exclui 13º/PLR
    const inssSobreSal = inssMensalProgressivo(salarioMensal);
    const inssSobre13 = inssMensalProgressivo(decimo);
    const inssSobreFerias = incluirFerias ? inssMensalProgressivo(salarioMensal / 3) : 0;
    const inssTotal = contribInss ? inssSobreSal * mesesClamped + inssSobre13 + inssSobreFerias : 0;
    const dedDep = dependentes * 2275.08;
    const pgblLimite = 0.12 * rbt;
    const pgblDedutivel = contribInss ? Math.min(pgblPlanejado, Math.max(0, pgblLimite)) : 0;
    const baseSemPgbl = Math.max(0, rbt - inssTotal - dedDep - outrasDeduc);
    const imporSem = Math.max(0, impostoAnualIRPF2025(baseSemPgbl));
    const baseComPgbl = Math.max(0, baseSemPgbl - pgblDedutivel);
    const imporCom = Math.max(0, impostoAnualIRPF2025(baseComPgbl));
    const economiaPgbl = Math.max(0, imporSem - imporCom);
    const aliqEfetivaSem = rbt>0 ? imporSem/rbt : 0;
    const aliqEfetivaCom = rbt>0 ? imporCom/rbt : 0;
    const aliqMarginal = aliquotaMarginalIR(baseSemPgbl);
    const salariosEq = salarioMensal>0? (salarioMensal*mesesClamped + decimo + plr)/salarioMensal : 0;
    const salarioAnualExpositivo = salarioMensal*salariosEq;
    return { rbt, inssTotal, dedDep, pgblLimite, pgblDedutivel, baseSemPgbl, baseComPgbl, imporSem, imporCom, economiaPgbl, aliqEfetivaSem, aliqEfetivaCom, aliqMarginal, salariosEq, salarioAnualExpositivo, extraFerias } as const;
  }, [salarioMensal, meses, decimo, bonus, contribInss, dependentes, outrasDeduc, pgblPlanejado, plr, incluirFerias]);

  const irrfAuto = useMemo(() => Math.max(0, impostoAnualIRPF2025(calc.baseSemPgbl)), [calc.baseSemPgbl]);
  const irrfEfetivo = usarIrrfAuto ? irrfAuto : irrf;
  const restituicaoFinal = Math.max(0, irrfEfetivo - calc.imporCom);

  useEffect(() => { if (contribInss && pgblPlanejado > calc.pgblLimite) setPgblPlanejado(Math.max(0, calc.pgblLimite)); }, [calc.pgblLimite, pgblPlanejado, contribInss]);

  // Defaultar PGBL planejado para o máximo dedutível quando vazio
  useEffect(() => { if (pgblPlanejado === 0 && calc.pgblLimite > 0) setPgblPlanejado(Math.max(0, calc.pgblLimite)); }, [calc.pgblLimite]);

  function buildProj(repetir: boolean, horizon: number) {
    const aporte = calc.pgblDedutivel; const rest = calc.economiaPgbl; const custoEfetivo = Math.max(0, aporte - rest);
    const arrReg:any[] = []; const arrProg:any[] = [];
    const Y = Math.max(1, horizon);
    for (let y=1; y<=Y; y++) {
      let fvA = 0, fvR = 0; let regApL = 0, regReL = 0, progApL = 0, progReL = 0;
      if (!repetir) {
        fvA = aporte*Math.pow(1+taxaReal,y);
        fvR = rest*Math.pow(1+taxaReal,y);
        const regAliq = aliquotaRegressivaPorPrazo(y);
        const progAliq = Math.min(0.4, Math.max(0, aliqProgResgate));
        regApL = fvA*(1-regAliq); regReL = fvR*(1-regAliq);
        progApL = fvA*(1-progAliq); progReL = fvR*(1-progAliq);
      } else {
        for (let k=1; k<=y; k++) {
          const age = y - k + 1;
          const fvAk = aporte*Math.pow(1+taxaReal, age);
          const fvRk = rest*Math.pow(1+taxaReal, age);
          const regAliqK = aliquotaRegressivaPorPrazo(age);
          const progAliqK = Math.min(0.4, Math.max(0, aliqProgResgate));
          regApL += fvAk*(1-regAliqK); regReL += fvRk*(1-regAliqK);
          progApL += fvAk*(1-progAliqK); progReL += fvRk*(1-progAliqK);
          fvA += fvAk; fvR += fvRk;
        }
      }
      const regTot = regApL + regReL;
      const progTot = progApL + progReL;
      const custoEfAcum = repetir ? (custoEfetivo * y) : custoEfetivo;
      const multReg = custoEfAcum>0? regTot/custoEfAcum : NaN; const multProg = custoEfAcum>0? progTot/custoEfAcum : NaN;
      const rotuloAliq = aliquotaRegressivaPorPrazo(y);
      arrReg.push({ ano:`Ano ${y}`, Aporte:regApL, RestituicaoLiquida:regReL, TotalLiquido:regTot, _aliqResgate:rotuloAliq, _custoEfetivo:custoEfAcum, _multiplicador:multReg, _fvA:fvA, _fvR:fvR });
      arrProg.push({ ano:`Ano ${y}`, Aporte:progApL, RestituicaoLiquida:progReL, TotalLiquido:progTot, _aliqResgate:Math.min(0.4, Math.max(0, aliqProgResgate)), _custoEfetivo:custoEfAcum, _multiplicador:multProg, _fvA:fvA, _fvR:fvR });
    }
    return { arrReg, arrProg, custoEfetivo } as const;
  }

  const baseProjSingle = useMemo(() => buildProj(false, Math.max(1, anosProj)), [calc.pgblDedutivel, calc.economiaPgbl, anosProj, taxaReal, aliqProgResgate]);
  const anosProgKPI = useMemo(() => Math.min(Math.max(1, anosProj), 4), [anosProj]);
  const baseProjRecReg = useMemo(() => buildProj(true, Math.max(1, anosProj)), [calc.pgblDedutivel, calc.economiaPgbl, anosProj, taxaReal, aliqProgResgate]);
  const baseProjRecProg = useMemo(() => buildProj(true, Math.max(1, anosProj)), [calc.pgblDedutivel, calc.economiaPgbl, anosProj, taxaReal, aliqProgResgate]);

  // Dados combinados para gráfico único (barras = valores brutos; linhas = totais líquidos por regime)
  const combinedData = useMemo(() => {
    return baseProjSingle.arrReg.map((r, i) => ({
      ano: r.ano,
      AporteBruto: r._fvA ?? 0,
      RestBruta: r._fvR ?? 0,
      TotalReg: r.TotalLiquido ?? 0,
      TotalProg: baseProjSingle.arrProg[i]?.TotalLiquido ?? 0,
    }));
  }, [baseProjSingle]);

  // Dados no formato do novo gráfico (V2)
  const rowsV2 = useMemo(() => combinedData.map((d, i) => ({
    label: d.ano,
    aporteBruto: d.AporteBruto,
    restituicaoBruta: d.RestBruta,
    totalLiqReg: d.TotalReg,
    totalLiqProg: d.TotalProg,
    aliqReg: aliquotaRegressivaPorPrazo(i+1),
    aliqProg: Math.min(0.4, Math.max(0, aliqProgResgate)),
  })), [combinedData, aliqProgResgate]);

  // Recorrente no formato V2
  const rowsRecV2 = useMemo(() => baseProjRecReg.arrReg.map((r, i) => ({
    label: r.ano,
    aporteBruto: r._fvA ?? 0,
    restituicaoBruta: r._fvR ?? 0,
    totalLiqReg: r.TotalLiquido ?? 0,
    totalLiqProg: baseProjRecProg.arrProg[i]?.TotalLiquido ?? 0,
    aliqReg: aliquotaRegressivaPorPrazo(i+1),
    aliqProg: Math.min(0.4, Math.max(0, aliqProgResgate)),
  })), [baseProjRecReg, baseProjRecProg, aliqProgResgate]);

  const resumoHorizonte = useMemo(() => {
    const aporte = calc.pgblDedutivel, rest = calc.economiaPgbl, y = Math.max(1, anosProj);
    const fvA = aporte*Math.pow(1+taxaReal,y); const fvR = rest*Math.pow(1+taxaReal,y);
    const regAliq = aliquotaRegressivaPorPrazo(y), progAliq = Math.min(0.4, Math.max(0, aliqProgResgate));
    return { reg: { total:(fvA+fvR)*(1-regAliq) }, prog: { total:(fvA+fvR)*(1-progAliq) } } as const;
  }, [calc.pgblDedutivel, calc.economiaPgbl, anosProj, taxaReal, aliqProgResgate]);

  const aliqRegNoHorizonte = useMemo(()=> aliquotaRegressivaPorPrazo(Math.max(1, anosProj)), [anosProj]);

  const whatsMsg = useMemo(() => {
    const linhas = [
      `⚽ ${nomeSimulacao} (${calc.salariosEq.toFixed(1)} salários)`,
      `Salário anual: ${fmtBRL(calc.salarioAnualExpositivo)} (${fmtBRL(salarioMensal)}/mês × ${calc.salariosEq.toFixed(1)})`,
      `Aporte PGBL (12% da RBT): ${fmtBRL(calc.pgblLimite)}`,
      "",
      `Sem PGBL → IR calculado sobre ${fmtBRL(calc.baseSemPgbl)}`,
      `Com PGBL → IR calculado sobre ${fmtBRL(calc.baseComPgbl)}`,
      `Diferença de base: ${fmtBRL(calc.baseSemPgbl - calc.baseComPgbl)}`,
      "",
      `Devolução estimada: ${(calc.aliqMarginal*100).toFixed(1)}% × ${fmtBRL(calc.pgblDedutivel)} ≈ *${fmtBRL(calc.economiaPgbl)}*`,
    ];
    return linhas.join("\n");
  }, [calc, nomeSimulacao, salarioMensal]);

  const [showModal, setShowModal] = useState(false);
  const [copied, setCopied] = useState(false);

  // === Pré-cálculos para o bloco recorrente (evita IIFE em JSX) ===
  const regRecLast = baseProjRecReg.arrReg.length > 0 ? baseProjRecReg.arrReg[baseProjRecReg.arrReg.length - 1] : undefined;
  const progRecLast = baseProjRecProg.arrProg.length > 0 ? baseProjRecProg.arrProg[baseProjRecProg.arrProg.length - 1] : undefined;
  const multRegRec = regRecLast && regRecLast._multiplicador ? regRecLast._multiplicador : 0;
  const multProgRec = progRecLast && progRecLast._multiplicador ? progRecLast._multiplicador : 0;

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
            <button onClick={() => { setShowModal(true); setCopied(false); }} className="inline-flex items-center justify-center rounded-2xl px-4 py-2 text-sm font-semibold shadow-sm hover:opacity-90 bg-[#021e19] text-[#c8e05b] border border-[#021e19]">WhatsApp: copiar mensagem</button>
          </div>
        </header>

        <div className="md:grid md:grid-cols-12 md:gap-6">
          {/* Coluna ESQUERDA: Entradas */}
          <div className="md:col-span-4 space-y-4">
            <section className="rounded-2xl bg-white p-5 shadow border border-[#a6a797]">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
                <div className="md:col-span-12">
                  <TextInput label="Nome da simulação" value={nomeSimulacao} onChange={setNomeSimulacao} placeholder="Ex.: Exemplo Paulinho" />
                </div>
                <div className="md:col-span-4">
                  <NumberInput label="Salário bruto mensal" value={salarioMensal} onChange={setSalarioMensal} prefix="R$" />
                </div>
                <div className="md:col-span-4">
                  <NumberInput label="Meses trabalhados no ano" value={meses} onChange={(v) => setMeses(Math.min(12, Math.max(0, Math.round(v))))} min={0} max={12} />
                </div>
                <div className="md:col-span-4">
                  <NumberInput label="13º salário (exclusivo)" value={decimo} onChange={setDecimo} prefix="R$" />
                </div>
                <div className="md:col-span-12">
                  <Toggle label="Contribui para INSS/RPPS? (requerido p/ PGBL)" checked={contribInss} onChange={setContribInss} />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-12">
                <div className="md:col-span-12"><NumberInput label="PGBL planejado" value={pgblPlanejado} onChange={setPgblPlanejado} prefix="R$" hint="Limitado automaticamente ao máximo dedutível (12% da RBT)." />
                </div>
                <div className="md:col-span-12 rounded-xl border border-[#a6a797]/60 p-3">
                  <PgblProgress limit={calc.pgblLimite} value={pgblPlanejado} />
                  <div className="mt-2 text-sm text-slate-700">
                    Sugestão (12% da RBT): <strong>{fmtBRL(calc.pgblLimite)}</strong>
                    <span className="ml-1 text-slate-500">— faltam <strong>{fmtBRL(Math.max(0, calc.pgblLimite - pgblPlanejado))}</strong></span>
                  </div>
                </div>
              </div>

              <div className="mt-4">
                <button type="button" onClick={() => setShowAdvanced(!showAdvanced)} className="flex w-full items-center justify-between rounded-xl border bg-white px-3 py-2 text-left">
                  <span className="text-sm font-medium text-slate-700">Opções avançadas (bônus, PLR, dependentes, deduções, IRRF)</span>
                  <span className={`transition-transform ${showAdvanced ? 'rotate-90' : ''}`}>›</span>
                </button>
              </div>
              {showAdvanced and (
                <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-4">
                  <NumberInput label="Bônus/Outros tributáveis (anuais)" value={bonus} onChange={setBonus} prefix="R$" />
                  <NumberInput label="PLR (exclusivo)" value={plr} onChange={setPlr} prefix="R$" />
                  <NumberInput label="Nº de dependentes" value={dependentes} onChange={(v) => setDependentes(Math.min(20, Math.max(0, Math.round(v))))} min={0} max={20} />
                  <NumberInput label="Outras deduções anuais" value={outrasDeduc} onChange={setOutrasDeduc} prefix="R$" />
                  <div className="md:col-span-3 space-y-2 rounded-xl border p-3">
                    <Toggle label="Calcular IRRF automaticamente" checked={usarIrrfAuto} onChange={setUsarIrrfAuto} />
                    <div className="text-xs text-slate-600">IRRF estimado: <strong>{fmtBRL(irrfAuto)}</strong></div>
                    {!usarIrrfAuto and <NumberInput label="IRRF retido no ano (manual)" value={irrf} onChange={setIrrf} prefix="R$" />}
                    <div className="pt-2 border-t">
                      <Toggle label={`Incluir 1/3 de férias na base (IR + INSS) — ${incluirFerias ? fmtBRL(salarioMensal/3) : fmtBRL(0)}`} checked={incluirFerias} onChange={setIncluirFerias} />
                      <div className="text-xs text-slate-500">Simplificação: somamos {fmtBRL(salarioMensal/3)} à RBT e calculamos INSS sobre esse valor quando ativado.</div>
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>

          {/* Coluna DIREITA: Resultados */}
          <div className="md:col-span-8 space-y-4">
            <section className="rounded-2xl bg-white p-4 border border-[#a6a797]">
              <div className="text-lg font-semibold text-[#021e19]">Invista {fmtBRL(calc.pgblDedutivel)} → receba ~{fmtBRL(calc.economiaPgbl)} (≈ {fmtPct(calc.aliqMarginal)} do aporte)</div>
              <div className="text-sm text-slate-600 mt-0.5">Por quê? O PGBL reduz a <em>base de cálculo</em> do IR em até <strong>12% da RBT</strong>. Menos base ⇒ menos imposto ⇒ maior restituição. <span className="ml-1 font-medium">{fmtBRL(calc.economiaPgbl)}</span> é dinheiro que hoje ficaria com o governo.</div>
            </section>

            <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <KPI title="Aportar agora (dedutível)" value={fmtBRL(calc.pgblDedutivel)} subtitle={`Limite atual: ${fmtBRL(calc.pgblLimite)}`} />
              <KPI title={`Projeção em ${anosProj} ${anosProj===1?'ano':'anos'} (regressivo)`} value={fmtBRL(resumoHorizonte.reg.total)} subtitle={`Aporte líquido após restituição: ${fmtBRL(Math.max(0, calc.pgblDedutivel - calc.economiaPgbl))}`} />
            </section>

            <section className="rounded-2xl bg-white p-5 shadow border border-[#a6a797]">
              <h2 className="mb-4 text-lg font-semibold">Projeção da restituição ao longo do tempo</h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <NumberInput label="Horizonte (anos)" value={anosProj} onChange={(v) => setAnosProj(Math.min(40, Math.max(1, Math.round(v))))} />
                <NumberInput label="Taxa real a.a. (%)" value={taxaReal*100} onChange={(v) => setTaxaReal(Math.min(2, Math.max(-0.5, v/100)))} minDecimals={2} maxDecimals={2} />
                <NumberInput label="Alíquota progressiva esperada no resgate (%)" value={aliqProgResgate*100} onChange={(v)=> setAliqProgResgate(Math.min(0.4, Math.max(0, v/100)))} minDecimals={2} maxDecimals={2} />
              </div>
              <div className="mt-4 h-96 w-full min-w-0 overflow-visible">
                <NiceProjectionChartV2 rows={rowsV2} height={384} />
              </div>
            </section>

            {/* Recorrente */}
            <section className="rounded-2xl bg-white p-4 border border-[#a6a797]">
              <Toggle label="Ativar plano recorrente (repetir aporte + restituição a cada ano)" checked={repetirAnualmente} onChange={setRepetirAnualmente} />
              <div className="text-xs text-slate-600 mt-1">Quando ativo, a cada ano você repete o mesmo PGBL e reinveste a restituição. Usamos custo efetivo acumulado para o multiplicador.</div>
            </section>
            {repetirAnualmente and (
              <>
                <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <KPI
                    title={`Projeção em ${anosProj} ${anosProj===1?'ano':'anos'} (regressivo • recorrente)`}
                    value={fmtBRL(regRecLast?.TotalLiquido ?? 0)}
                    subtitle={`Multiplicador vs. custo efetivo: ×${(multRegRec||0).toLocaleString('pt-BR',{maximumFractionDigits:2})}`}
                  />
                  <KPI
                    title={`Projeção em ${anosProgKPI} ${anosProgKPI===1?'ano':'anos'} (progressivo • recorrente • 27,5%)`}
                    value={fmtBRL(progRecLast?.TotalLiquido ?? 0)}
                    subtitle={`Multiplicador vs. custo efetivo: ×${(multProgRec||0).toLocaleString('pt-BR',{maximumFractionDigits:2})}`}
                  />
                </section>
                <section className="rounded-2xl bg-white p-5 shadow border border-[#a6a797]">
                  <h2 className="mb-4 text-lg font-semibold">Projeção recorrente ao longo do tempo</h2>
                  <div className="mt-4 h-96 w-full min-w-0 overflow-visible">
                    <NiceProjectionChartV2 rows={rowsRecV2} height={384} />
                  </div>
                </section>
              </>
            )}

            <section className="rounded-2xl bg-white p-5 shadow border border-[#a6a797]">
              <h2 className="mb-4 text-lg font-semibold">Resumo</h2>
              <KeyValue k="RBT (salários + bônus)" v={fmtBRL(calc.rbt)} />
              <KeyValue k="Limite PGBL (12% da RBT)" v={fmtBRL(calc.pgblLimite)} />
              <KeyValue k="PGBL dedutível" v={fmtBRL(calc.pgblDedutivel)} />
              <KeyValue k="Base de cálculo do IR (com PGBL)" v={fmtBRL(calc.baseComPgbl)} />
              <KeyValue k="Imposto devido (com PGBL)" v={fmtBRL(calc.imporCom)} />
              <KeyValue k="IRRF (estimado)" v={fmtBRL(irrfEfetivo)} />
              <div className="mt-2 rounded-xl bg-slate-50 p-3"><KeyValue k="Restituição (+) / Imposto a pagar (−)" v={fmtBRL(restituicaoFinal)} /></div>
              <div className="mt-4 grid grid-cols-1 gap-2">
                <KeyValue k="Alíquota efetiva (sem PGBL)" v={fmtPct(calc.aliqEfetivaSem)} />
                <KeyValue k="Alíquota efetiva (com PGBL)" v={fmtPct(calc.aliqEfetivaCom)} />
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* Modal WhatsApp */}
      {showModal and (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Mensagem pronta para WhatsApp</h3>
              <button onClick={() => setShowModal(false)} className="rounded-lg border border-[#021e19] px-3 py-1 text-sm bg-[#021e19] text-[#c8e05b] hover:opacity-90">Fechar</button>
            </div>
            <textarea className="h-56 w-full resize-none rounded-xl border p-3 font-mono text-sm" value={whatsMsg} onChange={() => {}} readOnly />
            <div className="mt-3 flex items-center gap-2">
              <button onClick={async () => { try { await navigator.clipboard.writeText(whatsMsg); setCopied(true);} catch { setCopied(false);} }} className="rounded-2xl border border-[#021e19] px-4 py-2 text-sm font-semibold shadow-sm hover:opacity-90 bg-[#021e19] text-[#c8e05b]">Copiar mensagem</button>
              {copied and <span className="text-emerald-700 text-sm">Copiado! Agora cole no WhatsApp.</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== NiceProjectionChartV2 (barras brutas + linhas líquidas com tooltip claro) =====
const CNP = { bg: "#f4ece6", ink: "#021e19", lime: "#c8e05b", bar: "#a6a797", prog: "#2f6df6" } as const;
function fmtBRL_V2(v:number){return v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});} 
function TooltipV2({ active, payload, label }: any){
  if(!active||!payload) return null;
  const byKey:Record<string,number>={};
  payload.forEach((p:any)=>{byKey[p.dataKey]=Number(p.value)});
  const raw = (payload[0]&&payload[0].payload) || {} as any;
  const aliqReg = typeof raw.aliqReg==='number' ? raw.aliqReg : undefined;
  const aliqProg = typeof raw.aliqProg==='number' ? raw.aliqProg : undefined;
  const pct = (x?:number)=> typeof x==='number'?` (${(x*100).toFixed(0)}%)`:'';
  return (
    <div style={{background:'#fff',border:'1px solid #e6e0da',borderRadius:12,padding:'12px 14px',boxShadow:'0 4px 12px rgba(0,0,0,.06)',maxWidth:280,overflow:'hidden'}}>
      <div style={{fontWeight:700,marginBottom:8}}>{label}</div>
      <div style={{fontSize:12,opacity:.8,marginBottom:4}}>Barras (bruto)</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:6}}>
        <span style={{color:CNP.bar}}>Aporte investido (bruto)</span>
        <span>{fmtBRL_V2(byKey.aporteBruto??0)}</span>
        <span style={{color:CNP.lime}}>Restituição projetada (bruta)</span>
        <span>{fmtBRL_V2(byKey.restituicaoBruta??0)}</span>
      </div>
      <div style={{fontSize:12,opacity:.8,margin:'10px 0 4px'}}>Linhas (líquido no resgate)</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:6}}>
        <span style={{color:CNP.ink}}>Total líquido (regressivo{pct(aliqReg)})</span>
        <span>{fmtBRL_V2(byKey.totalLiqReg??0)}</span>
        <span style={{color:CNP.prog}}>Total líquido (progressivo{pct(aliqProg)})</span>
        <span>{fmtBRL_V2(byKey.totalLiqProg??0)}</span>
      </div>
    </div>
  );
}
function NiceProjectionChartV2({rows,height=360}:{rows:Array<{label:string;aporteBruto:number;restituicaoBruta:number;totalLiqReg:number;totalLiqProg:number;aliqReg?:number;aliqProg?:number}>;height?:number;}){
  const [hoverX,setHoverX]=React.useState<number|null>(null);
  return (
    <div style={{background:CNP.bg,borderRadius:16,padding:12,border:'1px solid #e6e0da',overflow:'hidden'}}>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={rows} onMouseMove={(e:any)=>setHoverX(e?.activeTooltipIndex??null)} onMouseLeave={()=>setHoverX(null)} margin={{top:12,right:16,bottom:8,left:8}}>
          <CartesianGrid stroke="#eee" vertical={false}/>
          <XAxis dataKey="label" tick={{fill:CNP.ink,fontSize:12}}/>
          <YAxis tick={{fill:CNP.ink,fontSize:12}} tickFormatter={(v:any)=>fmtBRL_V2(Number(v)).replace(',00','')}/>
          <Tooltip content={<TooltipV2/>} cursor={{fill:'rgba(2,30,25,0.06)'}}/>
          <Legend wrapperStyle={{paddingTop:8}} formatter={(v:any)=>({
            aporteBruto:'Aporte investido (bruto)',restituicaoBruta:'Restituição projetada (bruta)',totalLiqReg:'Total líquido (regressivo)',totalLiqProg:'Total líquido (progressivo)'} as any)[v]??v}/>
          <Bar dataKey="aporteBruto" stackId="b" fill={CNP.bar} opacity={hoverX===null?0.95:0.7} radius={[6,6,0,0]}/>
          <Bar dataKey="restituicaoBruta" stackId="b" fill={CNP.lime} opacity={hoverX===null?0.95:0.7} radius={[6,6,0,0]}/>
          <Line type="monotone" dataKey="totalLiqReg" stroke={CNP.ink} strokeWidth={hoverX===null?5:6} dot={false} activeDot={{r:7,fill:CNP.ink}}/>
          <Line type="monotone" dataKey="totalLiqProg" stroke={CNP.prog} strokeWidth={hoverX===null?4:5} strokeDasharray="6 5" dot={false} activeDot={{r:6,stroke:'#fff',strokeWidth:2,fill:CNP.prog}}/>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ===== Componentes auxiliares =====
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
  const pct = limit>0? Math.min(1, Math.max(0, value/limit)):0; const pctStr = (pct*100).toFixed(0)+'%';
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
  const [text, setText] = useState(() => value.toLocaleString('pt-BR', { useGrouping: true }));
  useEffect(() => { 
    const minD = (minDecimals ?? 0); const maxD = (maxDecimals ?? 6);
    setText(value.toLocaleString('pt-BR', { useGrouping: true, minimumFractionDigits:minD, maximumFractionDigits:maxD })); 
  }, [value, minDecimals, maxDecimals]);
  function parseToNumber(t: string) {
    const cleaned = t.replace(/[^0-9.,-]/g, "");
    const normalized = cleaned.replace(/\.(?=.*\.)/g, "").replace(/\./g, "").replace(/,/g, ".");
    const n = Number(normalized); return Number.isFinite(n) ? n : value;
  }
  function shouldDeferFormat(t: string) { return t === "" || t === "-" || /[.,]$/.test(t); }
  function formatFromText(t: string, n: number) {
    const m = t.match(/[.,]([0-9]*)$/); const decFromTyping = m ? m[1].length : 0;
    const minD = minDecimals ?? decFromTyping; const maxD = maxDecimals ?? Math.max(decFromTyping, 0);
    return n.toLocaleString('pt-BR', { useGrouping: true, minimumFractionDigits:minD, maximumFractionDigits:maxD });
  }
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm leading-tight font-medium text-slate-700 flex items-center gap-1 break-words">{label}{hint ? <span title={hint} className="cursor-help text-slate-400">ⓘ</span> : null}</span>
      <div className="flex items-center h-11 rounded-xl border bg-white px-3 py-2 focus-within:ring-2 focus-within:ring-slate-300">
        {prefix ? <span className="mr-1 text-slate-500">{prefix}</span> : null}
        <input inputMode="decimal" value={text} onChange={(e) => { const t = e.target.value; setText(t); let n = parseToNumber(t); if (typeof min === 'number') n = Math.max(min, n); if (typeof max === 'number') n = Math.min(max, n); onChange(n); if (!shouldDeferFormat(t)) setText(formatFromText(t, n)); }} className="w-full outline-none" placeholder="0,00" />
      </div>
    </label>
  );
}
function TextInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (s: string) => void; placeholder?: string; }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input value={value} onChange={(e)=> onChange(e.target.value)} placeholder={placeholder} className="rounded-xl border bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-slate-300" />
    </label>
  );
}
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between rounded-xl border bg-white px-3 py-2 gap-2">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <button type="button" onClick={() => onChange(!checked)} className={`relative ml-3 h-6 w-11 rounded-full transition ${checked ? 'bg-[#c8e05b]' : 'bg-slate-300'}`} aria-pressed={checked}>
        <span className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
    </label>
  );
}
