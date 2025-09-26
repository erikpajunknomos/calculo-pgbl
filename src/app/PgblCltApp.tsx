"use client";

import React, { useMemo, useState } from "react";
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

/* =============================================================================
   Utilitários
============================================================================= */

const fmtBRL = (v: number) =>
  (isFinite(v) ? v : 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  });

const clampPct = (v: number) => Math.max(0, Math.min(100, v));

/** Alíquota efetiva exibida no card */
const effectiveAliqPct = (temINSS: boolean, aliqProgPct: number) =>
  temINSS ? aliqProgPct : 0;

/** Converte entrada numérica (input) para number seguro */
const toNum = (v: string | number) => {
  if (typeof v === "number") return v || 0;
  const clean = v.replace(/[^\d,-]/g, "").replace(".", "").replace(",", ".");
  const n = Number(clean);
  return isFinite(n) ? n : 0;
};

/* =============================================================================
   Componente principal
============================================================================= */

export default function PgblCltApp() {
  /* ---------------- estados de entrada ---------------- */
  const [nome, setNome] = useState("Exemplo Fulano");
  const [salario, setSalario] = useState("350000"); // mensal
  const [meses, setMeses] = useState("12");
  const [decimoTerceiro, setDecimoTerceiro] = useState("350000");
  const [temINSS, setTemINSS] = useState(true);

  // % progressivo esperado no resgate
  const [aliqProgPctStr, setAliqProgPctStr] = useState("27,5");

  // PGBL planejado – botão "Aplicar 100%" preenche com o máximo dedutível
  const [pgblPlanejadoStr, setPgblPlanejadoStr] = useState("0");

  /* ---------------- derivados base ---------------- */
  const salarioNum = toNum(salario);
  const mesesNum = Math.max(0, Math.min(12, toNum(meses)));
  const decimoNum = toNum(decimoTerceiro);
  const rbT = salarioNum * mesesNum + decimoNum; // renda bruta tributável anual
  const limiteMax = rbT * 0.12; // 12% da RBT
  const pgblPlanejado = Math.min(toNum(pgblPlanejadoStr), Math.max(0, limiteMax));
  const aliqProgPct = toNum(aliqProgPctStr);

  /* ---------------- banner topo ---------------- */
  const percAprox = 27.5; // “≈ 27,5% do aporte” (mensagem educativa)
  const valorBanner = pgblPlanejado * (percAprox / 100);

  /* ---------------- projeção simples p/ gráfico ---------------- */
  const [horizonteAnosStr, setHorizonteAnosStr] = useState("10");
  const [taxaRealAA, setTaxaRealAA] = useState("4,00");

  const horizonte = Math.max(1, Math.min(30, Math.round(toNum(horizonteAnosStr))));
  const taxaReal = toNum(taxaRealAA) / 100;

  const baseChart = useMemo(() => {
    // barras: aporte bruto + “restituição projetada (bruta)” (edu)
    // linhas: total líquido (regressivo/progressivo) – educativas
    const rows: {
      ano: string;
      aporte: number;
      restBruta: number;
      liqReg: number;
      liqProg: number;
    }[] = [];

    let total = pgblPlanejado; // usamos como base visual
    for (let i = 1; i <= horizonte; i++) {
      // Crescimento fictício dos montantes para visual
      total = total * (1 + taxaReal);
      const aporteAno = pgblPlanejado * (0.98 + i * 0.01); // só p/ variar visualmente
      const restBruta = aporteAno * 0.27; // label educativo
      rows.push({
        ano: `Ano ${i}`,
        aporte: Math.max(0, aporteAno),
        restBruta: Math.max(0, restBruta),
        liqReg: Math.max(0, total * (1 + i * 0.01)),
        liqProg: Math.max(0, total * (0.95 + i * 0.008)),
      });
    }
    return rows;
  }, [pgblPlanejado, horizonte, taxaReal]);

  /* ---------------- KPIs à direita (cards) ---------------- */
  const kpiAportarAgora = pgblPlanejado;
  const kpiProjRegressivo = useMemo(() => {
    // cifra educativa, proporcional ao horizonte
    const last = baseChart[baseChart.length - 1];
    if (!last) return 0;
    return Math.max(0, last.aporte + last.restBruta + (last.liqReg - last.aporte) * 0.3);
  }, [baseChart]);

  /* ---------------- restituição estimada (novo card) ---------------- */
  const aliqCard = effectiveAliqPct(temINSS, aliqProgPct); // %
  const valorRestituicaoCard = pgblPlanejado * (aliqCard / 100);

  /* =============================================================================
     Render
  ============================================================================= */
  return (
    <div className="min-h-screen w-full bg-[#f4ece6] p-6 md:p-10">
      <div className="mx-auto max-w-7xl">
        {/* Cabeçalho */}
        <header className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
              IR + Previdência (PGBL) — CLT
            </h1>
            <p className="text-xs text-slate-600">
              Exercício 2026 · Ano-calendário 2025 — estimativa educativa
            </p>
          </div>

          <div className="flex gap-2">
            <button className="rounded-full bg-emerald-900 text-emerald-50 px-4 py-2 text-sm shadow-sm hover:bg-emerald-950">
              Simulação completa na Receita
            </button>
            <button className="rounded-full bg-emerald-900/80 text-emerald-50 px-4 py-2 text-sm shadow-sm hover:bg-emerald-900">
              WhatsApp: copiar mensagem
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-[380px_1fr]">
          {/* COLUNA ESQUERDA */}
          <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            {/* Nome */}
            <label className="block text-sm font-medium text-slate-700">
              Nome da simulação
            </label>
            <input
              className="mt-1 mb-4 w-full rounded-lg border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />

            {/* Inputs principais */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Salário bruto mensal
                </label>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                  value={salario}
                  onChange={(e) => setSalario(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Meses trabalhados no ano
                </label>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                  value={meses}
                  onChange={(e) => setMeses(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  13º salário (exclusivo)
                </label>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                  value={decimoTerceiro}
                  onChange={(e) => setDecimoTerceiro(e.target.value)}
                />
              </div>
            </div>

            {/* INSS / RPPS */}
            <div className="mt-4 flex items-center gap-2">
              <input
                id="inss"
                type="checkbox"
                className="h-4 w-4 accent-emerald-700"
                checked={temINSS}
                onChange={(e) => setTemINSS(e.target.checked)}
              />
              <label htmlFor="inss" className="text-sm text-slate-800">
                Contribui para INSS/RPPS? <span className="text-slate-500">(requerido p/ PGBL)</span>
              </label>
            </div>

            {/* PGBL Planejado */}
            <div className="mt-4">
              <label className="block text-sm font-medium text-slate-700">PGBL planejado</label>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                value={pgblPlanejadoStr}
                onChange={(e) => setPgblPlanejadoStr(e.target.value)}
              />

              <div className="mt-3 rounded-lg border border-slate-200 p-3 text-xs text-slate-700">
                <div className="mb-2 flex items-center justify-between">
                  <span>
                    Limite legal de dedução (12% da RBT):{" "}
                    <span className="font-semibold">{fmtBRL(limiteMax)}</span>
                  </span>
                </div>

                <div className="mb-1 h-1.5 w-full rounded-full bg-slate-100">
                  <div
                    className="h-1.5 rounded-full bg-emerald-400"
                    style={{
                      width: `${clampPct((pgblPlanejado / (limiteMax || 1)) * 100)}%`,
                    }}
                  />
                </div>

                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <span>
                    Sugestão (12% da RBT): <span className="font-semibold">{fmtBRL(limiteMax)}</span>
                  </span>
                  <button
                    className="rounded-md bg-emerald-600 px-2 py-1 font-medium text-emerald-50 hover:bg-emerald-700"
                    onClick={() => setPgblPlanejadoStr(String(Math.round(limiteMax)))}
                  >
                    Aplicar 100%
                  </button>
                </div>
              </div>
            </div>

            {/* Opções avançadas (placeholder só para manter a seção) */}
            <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
              Opções avançadas (bônus, PLR, dependentes, deduções, IRRF)
            </div>

            {/* --------- NOVO CARD: Restituição estimada --------- */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm mt-3">
              <div className="mb-1 flex items-center justify-between">
                <h3 className="text-sm font-medium text-slate-700">Restituição estimada</h3>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold
                    ${
                      temINSS
                        ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                        : "bg-slate-100 text-slate-500 ring-1 ring-slate-200"
                    }`}
                  title={temINSS ? "Percentual aproximado sobre o aporte" : "Sem direito à restituição"}
                >
                  {temINSS ? `≈ ${clampPct(aliqCard).toFixed(1)}% do aporte` : "0%"}
                </span>
              </div>

              <div
                className={`text-3xl md:text-4xl font-extrabold tracking-tight
                  ${temINSS ? "text-emerald-900" : "text-slate-400"}`}
              >
                {fmtBRL(valorRestituicaoCard)}
              </div>

              <p className={`mt-1 text-xs ${temINSS ? "text-slate-500" : "text-slate-400"}`}>
                {temINSS ? (
                  <>
                    com aporte de <span className="font-medium">{fmtBRL(pgblPlanejado || 0)}</span>
                  </>
                ) : (
                  <>Sem direito à restituição (marque “Contribui para INSS/RPPS?” para habilitar)</>
                )}
              </p>
            </div>
          </section>

          {/* COLUNA DIREITA */}
          <section className="space-y-4">
            {/* Banner educativo */}
            <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
              <div className="text-[15px] font-medium">
                Invista <span className="font-semibold">{fmtBRL(pgblPlanejado)}</span> → receba{" "}
                <span className="font-semibold">{fmtBRL(valorBanner)}</span>{" "}
                <span className="text-slate-500">
                  (≈ {percAprox.toFixed(2)}% do aporte)
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-600">
                Por quê? O PGBL reduz a <span className="italic">base de cálculo</span> do IR em até{" "}
                <span className="font-semibold">12% da RBT</span>. Menos base ⇒ menos imposto ⇒
                maior restituição.
              </p>
            </div>

            {/* Dois KPIs */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
                <div className="text-xs font-medium text-slate-600">APORTAR AGORA (DEDUTÍVEL)</div>
                <div className="mt-1 text-3xl font-extrabold text-emerald-900">
                  {fmtBRL(kpiAportarAgora)}
                </div>
                <div className="text-xs text-slate-500">Limite atual: {fmtBRL(limiteMax)}</div>
              </div>

              <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
                <div className="text-xs font-medium text-slate-600">
                  PROJEÇÃO EM {horizonte} ANOS (REGRESSIVO)
                </div>
                <div className="mt-1 text-3xl font-extrabold text-emerald-900">
                  {fmtBRL(kpiProjRegressivo)}
                </div>
                <div className="text-xs text-slate-500">
                  Aporte líquido após restituição:{" "}
                  {fmtBRL(Math.max(0, pgblPlanejado - valorRestituicaoCard))}
                </div>
              </div>
            </div>

            {/* Filtros do gráfico */}
            <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
              <div className="mb-3 text-base font-semibold">
                Projeção da restituição ao longo do tempo
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    Horizonte (anos)
                  </label>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                    value={horizonteAnosStr}
                    onChange={(e) => setHorizonteAnosStr(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    Taxa real a.a. (%)
                  </label>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                    value={taxaRealAA}
                    onChange={(e) => setTaxaRealAA(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    Alíquota progressiva esperada no resgate (%)
                  </label>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                    value={aliqProgPctStr}
                    onChange={(e) => setAliqProgPctStr(e.target.value)}
                  />
                </div>
              </div>

              {/* GRÁFICO */}
              <div className="mt-4 h-[360px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={baseChart} margin={{ left: 12, right: 12, top: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="ano" tick={{ fontSize: 12 }} />
                    <YAxis
                      tickFormatter={(v) =>
                        v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
                      }
                      width={80}
                    />
                    <Tooltip
                      formatter={(val: number, name) => [fmtBRL(val), name]}
                      labelFormatter={(label) => label}
                    />
                    <Legend />
                    <Bar dataKey="aporte" name="Aporte investido (bruto)" stackId="a" fill="#9CA3AF" />
                    <Bar dataKey="restBruta" name="Restituição projetada (bruta)" stackId="a" fill="#D9F99D" />
                    <Line
                      type="monotone"
                      dataKey="liqProg"
                      name="Total líquido (progressivo)"
                      stroke="#2563EB"
                      strokeDasharray="6 4"
                      strokeWidth={3}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="liqReg"
                      name="Total líquido (regressivo)"
                      stroke="#052e16"
                      strokeWidth={4}
                      dot={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Recorrente – placeholder do toggle (mantido) */}
            <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-emerald-700" />
                Ativar plano recorrente (repetir aporte + restituição a cada ano)
              </label>
              <p className="mt-1 text-xs text-slate-500">
                Quando ativo, a cada ano você repete o mesmo PGBL e reinveste a restituição.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
