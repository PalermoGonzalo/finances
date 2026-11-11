import React, { useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  Calendar,
  CreditCard,
  DollarSign,
  Layers,
  PiggyBank,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { AppDatabase } from '../types';
import { formatMoney, MESES_NOMBRES } from '../lib/storage';

interface DashboardTabProps {
  db: AppDatabase;
  selectedYear: number;
  setSelectedYear: (y: number) => void;
  onNavigateTab: (tab: 'dashboard' | 'matriz' | 'transacciones' | 'hipotecario' | 'splitwise' | 'cuentas') => void;
}

export const DashboardTab: React.FC<DashboardTabProps> = ({
  db,
  selectedYear,
  setSelectedYear,
  onNavigateTab,
}) => {
  const [selectedMonth, setSelectedMonth] = useState<number>(0); // 0 = Todo el año
  const [showInUsd, setShowInUsd] = useState<boolean>(false);

  const yearsAvailable = useMemo(() => {
    const set = new Set<number>();
    db.transacciones.forEach((t) => {
      const y = t.metadatos?.anio ?? Number(t.fecha.slice(0, 4));
      if (y >= 2014 && y <= 2030) set.add(y);
    });
    return Array.from(set).sort((a, b) => b - a);
  }, [db.transacciones]);

  const mep = db.cotizaciones.dolarMep || 1423.6;

  const toDisplayAmount = (amountArs: number, monedaTx: string = 'ARS') => {
    if (monedaTx === 'USD') {
      return showInUsd ? amountArs : amountArs * mep;
    }
    return showInUsd ? amountArs / mep : amountArs;
  };

  const displayCurrency = showInUsd ? 'USD' : 'ARS';

  // Filtrar transacciones del año y mes seleccionados
  const txsPeriodo = useMemo(() => {
    return db.transacciones.filter((t) => {
      const y = t.metadatos?.anio ?? Number(t.fecha.slice(0, 4));
      const m = t.metadatos?.mes ?? Number(t.fecha.slice(5, 7));
      if (y !== selectedYear) return false;
      if (selectedMonth > 0 && m !== selectedMonth) return false;
      return true;
    });
  }, [db.transacciones, selectedYear, selectedMonth]);

  // KPIs del período
  const kpis = useMemo(() => {
    let ingresosBlanco = 0;
    let ingresosNegro = 0;
    let ingresosInversiones = 0;
    let gastosTotales = 0;
    let comprasUsdArs = 0;
    let usdComprados = 0;

    txsPeriodo.forEach((t) => {
      const val = toDisplayAmount(t.monto, t.moneda);
      if (t.tipo === 'ingreso') {
        if (t.concepto.toLowerCase().includes('inversi')) {
          ingresosInversiones += val;
        } else if (t.condicion_fiscal === 'negro') {
          ingresosNegro += val;
        } else {
          ingresosBlanco += val;
        }
      } else if (t.tipo === 'gasto') {
        gastosTotales += val;
      } else if (t.tipo === 'transferencia' && t.metadatos?.seccion === 'Compra Dólares') {
        comprasUsdArs += val;
        usdComprados += t.metadatos?.usd_comprados ?? 0;
      }
    });

    const ingresosTotales = ingresosBlanco + ingresosNegro + ingresosInversiones;
    const balanceNeto = ingresosTotales - gastosTotales;
    const tasaAhorro = ingresosTotales > 0 ? (balanceNeto / ingresosTotales) * 100 : 0;

    return {
      ingresosTotales,
      ingresosBlanco,
      ingresosNegro,
      ingresosInversiones,
      gastosTotales,
      balanceNeto,
      tasaAhorro,
      comprasUsdArs,
      usdComprados,
    };
  }, [txsPeriodo, showInUsd, mep]);

  // Serie mensual Enero-Diciembre para el año seleccionado
  const serieMensual = useMemo(() => {
    const meses = Array.from({ length: 12 }, (_, idx) => ({
      mes: idx + 1,
      nombre: MESES_NOMBRES[idx].slice(0, 3),
      nombreCompleto: MESES_NOMBRES[idx],
      ingresos: 0,
      gastos: 0,
      balance: 0,
    }));

    db.transacciones.forEach((t) => {
      const y = t.metadatos?.anio ?? Number(t.fecha.slice(0, 4));
      const m = t.metadatos?.mes ?? Number(t.fecha.slice(5, 7));
      if (y !== selectedYear || m < 1 || m > 12) return;
      const val = toDisplayAmount(t.monto, t.moneda);
      if (t.tipo === 'ingreso') {
        meses[m - 1].ingresos += val;
      } else if (t.tipo === 'gasto') {
        meses[m - 1].gastos += val;
      }
    });

    meses.forEach((m) => {
      m.balance = m.ingresos - m.gastos;
    });

    return meses;
  }, [db.transacciones, selectedYear, showInUsd, mep]);

  const maxMensual = useMemo(() => {
    return Math.max(
      1,
      ...serieMensual.map((m) => Math.max(m.ingresos, m.gastos))
    );
  }, [serieMensual]);

  // Desglose por Sección (Medios de pago de Gastos Disc. + Splitwise)
  const desgloseSecciones = useMemo(() => {
    const map = new Map<string, { seccion: string; monto: number; cantidad: number }>();
    txsPeriodo
      .filter((t) => t.tipo === 'gasto' && t.monto > 0)
      .forEach((t) => {
        const sec = t.metadatos?.seccion || 'Otros Gastos';
        const prev = map.get(sec) || { seccion: sec, monto: 0, cantidad: 0 };
        prev.monto += toDisplayAmount(t.monto, t.moneda);
        prev.cantidad += 1;
        map.set(sec, prev);
      });
    return Array.from(map.values()).sort((a, b) => b.monto - a.monto);
  }, [txsPeriodo, showInUsd, mep]);

  // Desglose por Categoría
  const desgloseCategorias = useMemo(() => {
    const map = new Map<string, { id: string; nombre: string; color: string; monto: number }>();
    txsPeriodo
      .filter((t) => t.tipo === 'gasto' && t.monto > 0)
      .forEach((t) => {
        const cat = db.categorias.find((c) => c.id === t.categoria_id);
        const key = cat?.id ?? 'sin-cat';
        const nombre = cat?.nombre ?? 'Sin Categoría';
        const color = cat?.color ?? '#64748b';
        const prev = map.get(key) || { id: key, nombre, color, monto: 0 };
        prev.monto += toDisplayAmount(t.monto, t.moneda);
        map.set(key, prev);
      });
    return Array.from(map.values()).sort((a, b) => b.monto - a.monto);
  }, [txsPeriodo, db.categorias, showInUsd, mep]);

  // Resumen Crédito Hipotecario
  const resumenHipotecario = useMemo(() => {
    const cuotas = db.prestamoHipotecario.cuotas;
    const pagadas = cuotas.filter((c) => c.pagada);
    const proxima = cuotas.find((c) => !c.pagada) ?? cuotas[cuotas.length - 1];
    const ultimaPagada = pagadas[pagadas.length - 1] ?? cuotas[0];
    const saldoUva = proxima?.saldo_deuda_uva ?? 62278.93;
    const valorUvaActual = db.cotizaciones.valorUva || ultimaPagada?.valor_uva || 1800.05;
    const deudaArsEstimada = saldoUva * valorUvaActual;
    const deudaUsdEstimada = deudaArsEstimada / mep;
    const proxCuotaArs = (proxima?.cuota_total_uva ?? 485.5) * valorUvaActual;

    return {
      pagadasCount: pagadas.length,
      totalCount: cuotas.length,
      proxima,
      saldoUva,
      deudaArsEstimada,
      deudaUsdEstimada,
      proxCuotaArs,
    };
  }, [db.prestamoHipotecario, db.cotizaciones.valorUva, mep]);

  return (
    <div className="space-y-6">
      {/* Barra de Filtros de Período y Moneda */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 backdrop-blur">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-xl bg-slate-800/80 px-3 py-1.5 text-sm font-medium text-slate-200">
            <Calendar className="h-4 w-4 text-emerald-400" />
            <span>Año:</span>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="bg-transparent font-semibold text-emerald-400 focus:outline-none"
            >
              {yearsAvailable.map((y) => (
                <option key={y} value={y} className="bg-slate-900 text-slate-100">
                  {y}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <button
              onClick={() => setSelectedMonth(0)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                selectedMonth === 0
                  ? 'bg-emerald-500 text-slate-950 font-semibold shadow-sm'
                  : 'bg-slate-800/70 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              Anual
            </button>
            {MESES_NOMBRES.map((m, idx) => (
              <button
                key={m}
                onClick={() => setSelectedMonth(idx + 1)}
                className={`rounded-lg px-2 py-1 text-xs font-medium transition ${
                  selectedMonth === idx + 1
                    ? 'bg-emerald-500 text-slate-950 font-semibold shadow-sm'
                    : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                {m.slice(0, 3)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowInUsd(false)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              !showInUsd
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            $ ARS (Nominal)
          </button>
          <button
            onClick={() => setShowInUsd(true)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              showInUsd
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            US$ MEP (${mep.toLocaleString('es-AR')})
          </button>
        </div>
      </div>

      {/* KPIs Principales */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Ingresos */}
        <div className="rounded-2xl border border-slate-800/90 bg-slate-900/60 p-5 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
              Ingresos ({selectedMonth === 0 ? selectedYear : `${MESES_NOMBRES[selectedMonth - 1]} ${selectedYear}`})
            </span>
            <span className="rounded-xl bg-emerald-500/15 p-2 text-emerald-400">
              <ArrowUpRight className="h-5 w-5" />
            </span>
          </div>
          <div className="mt-3 text-2xl font-bold text-slate-100">
            {formatMoney(kpis.ingresosTotales, displayCurrency, showInUsd ? 0 : 0)}
          </div>
          <div className="mt-3 space-y-1 border-t border-slate-800/80 pt-2 text-xs text-slate-400">
            <div className="flex justify-between">
              <span>Sueldo / Blanco:</span>
              <span className="font-medium text-slate-200">
                {formatMoney(kpis.ingresosBlanco, displayCurrency)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Extras / Alquiler:</span>
              <span className="font-medium text-amber-300">
                {formatMoney(kpis.ingresosNegro, displayCurrency)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Inversiones (IOL):</span>
              <span className="font-medium text-emerald-300">
                {formatMoney(kpis.ingresosInversiones, displayCurrency)}
              </span>
            </div>
          </div>
        </div>

        {/* Gastos Discriminados */}
        <div className="rounded-2xl border border-slate-800/90 bg-slate-900/60 p-5 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
              Gastos Devengados
            </span>
            <span className="rounded-xl bg-rose-500/15 p-2 text-rose-400">
              <ArrowDownRight className="h-5 w-5" />
            </span>
          </div>
          <div className="mt-3 text-2xl font-bold text-slate-100">
            {formatMoney(kpis.gastosTotales, displayCurrency)}
          </div>
          <div className="mt-3 space-y-1 border-t border-slate-800/80 pt-2 text-xs text-slate-400">
            <div className="flex justify-between">
              <span>Promedio mensual:</span>
              <span className="font-medium text-slate-200">
                {formatMoney(
                  selectedMonth === 0 ? kpis.gastosTotales / 12 : kpis.gastosTotales,
                  displayCurrency
                )}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Secciones activas:</span>
              <span className="font-medium text-slate-200">{desgloseSecciones.length} bloques</span>
            </div>
            <button
              onClick={() => onNavigateTab('matriz')}
              className="mt-1 inline-flex items-center gap-1 text-emerald-400 hover:underline"
            >
              Ver Matriz Gastos Disc. →
            </button>
          </div>
        </div>

        {/* Balance Neto & Tasa de Ahorro */}
        <div className="rounded-2xl border border-slate-800/90 bg-slate-900/60 p-5 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
              Balance Neto & Ahorro
            </span>
            <span className="rounded-xl bg-indigo-500/15 p-2 text-indigo-400">
              <PiggyBank className="h-5 w-5" />
            </span>
          </div>
          <div
            className={`mt-3 text-2xl font-bold ${
              kpis.balanceNeto >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {formatMoney(kpis.balanceNeto, displayCurrency)}
          </div>
          <div className="mt-3 space-y-1 border-t border-slate-800/80 pt-2 text-xs text-slate-400">
            <div className="flex items-center justify-between">
              <span>Tasa de Ahorro:</span>
              <span
                className={`rounded-full px-2 py-0.5 font-semibold ${
                  kpis.tasaAhorro >= 20
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : kpis.tasaAhorro >= 0
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'bg-rose-500/20 text-rose-300'
                }`}
              >
                {kpis.tasaAhorro.toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between">
              <span>Eq. en Dólar MEP:</span>
              <span className="font-medium text-slate-200">
                {formatMoney(showInUsd ? kpis.balanceNeto : kpis.balanceNeto / mep, 'USD')}
              </span>
            </div>
          </div>
        </div>

        {/* Estado Crédito Hipotecario UVA */}
        <div className="rounded-2xl border border-violet-500/30 bg-gradient-to-br from-slate-900 via-slate-900 to-violet-950/30 p-5 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-violet-300">
              Hipotecario UVA ({resumenHipotecario.pagadasCount}/{resumenHipotecario.totalCount})
            </span>
            <span className="rounded-xl bg-violet-500/20 p-2 text-violet-300">
              <Building2 className="h-5 w-5" />
            </span>
          </div>
          <div className="mt-3 text-2xl font-bold text-slate-100">
            {resumenHipotecario.saldoUva.toLocaleString('es-AR', { maximumFractionDigits: 0 })} UVAs
          </div>
          <div className="mt-3 space-y-1 border-t border-slate-800/80 pt-2 text-xs text-slate-400">
            <div className="flex justify-between">
              <span>Deuda en USD MEP:</span>
              <span className="font-semibold text-violet-300">
                {formatMoney(resumenHipotecario.deudaUsdEstimada, 'USD')}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Próx. Cuota ({resumenHipotecario.proxima?.etiqueta_cuota}):</span>
              <span className="font-medium text-slate-200">
                {formatMoney(resumenHipotecario.proxCuotaArs, 'ARS')}
              </span>
            </div>
            <button
              onClick={() => onNavigateTab('hipotecario')}
              className="mt-1 inline-flex items-center gap-1 text-violet-300 hover:underline"
            >
              Ver tabla 240 cuotas →
            </button>
          </div>
        </div>
      </div>

      {/* Gráfico de Evolución Mensual Enero - Diciembre */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="text-base font-semibold text-slate-100 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-emerald-400" />
              Flujo Mensual {selectedYear}: Ingresos vs. Gastos Discriminados ({displayCurrency})
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Hacé clic en cualquier mes para inspeccionar el desglose puntual de ese período.
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5 text-slate-300">
              <span className="h-3 w-3 rounded-sm bg-emerald-500 inline-block" />
              Ingresos
            </span>
            <span className="flex items-center gap-1.5 text-slate-300">
              <span className="h-3 w-3 rounded-sm bg-rose-500 inline-block" />
              Gastos
            </span>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-2 items-end h-56 pt-6 px-2 border-b border-slate-800">
          {serieMensual.map((m) => {
            const hIng = Math.max(4, Math.round((m.ingresos / maxMensual) * 170));
            const hGas = Math.max(4, Math.round((m.gastos / maxMensual) * 170));
            const isSelected = selectedMonth === m.mes;

            return (
              <div
                key={m.mes}
                onClick={() => setSelectedMonth(isSelected ? 0 : m.mes)}
                className={`group flex flex-col items-center cursor-pointer rounded-xl p-1.5 transition ${
                  isSelected ? 'bg-slate-800/90 ring-1 ring-emerald-500/50' : 'hover:bg-slate-800/40'
                }`}
              >
                <div className="flex items-end gap-1 h-44 w-full justify-center relative">
                  {/* Tooltip flotante */}
                  <div className="pointer-events-none absolute -top-12 left-1/2 -translate-x-1/2 z-20 hidden group-hover:flex flex-col rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-[11px] whitespace-nowrap shadow-xl">
                    <span className="font-semibold text-slate-200">{m.nombreCompleto} {selectedYear}</span>
                    <span className="text-emerald-400">Ing: {formatMoney(m.ingresos, displayCurrency)}</span>
                    <span className="text-rose-400">Gas: {formatMoney(m.gastos, displayCurrency)}</span>
                  </div>

                  <div
                    style={{ height: `${hIng}px` }}
                    className="w-3 sm:w-4 rounded-t-md bg-emerald-500/90 group-hover:bg-emerald-400 transition-all"
                  />
                  <div
                    style={{ height: `${hGas}px` }}
                    className="w-3 sm:w-4 rounded-t-md bg-rose-500/90 group-hover:bg-rose-400 transition-all"
                  />
                </div>
                <span className="mt-2 text-[11px] font-medium text-slate-400 group-hover:text-slate-200">
                  {m.nombre}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Grilla Inferior: Desglose por Medio de Pago / Sección de Gastos Disc. y Por Categoría */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Por Bloque / Medio de Pago de Gastos Disc. */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-indigo-400" />
                Gastos por Sección / Medio de Pago (Hoja Gastos Disc.)
              </h3>
              <p className="text-xs text-slate-400">
                Distribución entre Servicios Básicos, Efectivo/Débito, Tarjetas, Casa e Hipotecario
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {desgloseSecciones.length === 0 ? (
              <p className="text-sm text-slate-500 py-6 text-center">
                No hay gastos registrados para este período.
              </p>
            ) : (
              desgloseSecciones.map((item) => {
                const pct = kpis.gastosTotales > 0 ? (item.monto / kpis.gastosTotales) * 100 : 0;
                return (
                  <div key={item.seccion} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-200 flex items-center gap-2">
                        <span>{item.seccion}</span>
                        <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
                          {item.cantidad} mov.
                        </span>
                      </span>
                      <span className="font-semibold text-slate-100">
                        {formatMoney(item.monto, displayCurrency)}{' '}
                        <span className="text-slate-400 font-normal">({pct.toFixed(1)}%)</span>
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-indigo-500"
                        style={{ width: `${Math.min(100, Math.max(2, pct))}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Por Categoría Funcional */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                <Layers className="h-5 w-5 text-emerald-400" />
                Distribución por Categoría
              </h3>
              <p className="text-xs text-slate-400">
                Impacto real devengado (incluye tu parte proporcional de gastos en Splitwise)
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {desgloseCategorias.length === 0 ? (
              <p className="text-sm text-slate-500 py-6 text-center">
                No hay gastos clasificados en este período.
              </p>
            ) : (
              desgloseCategorias.map((cat) => {
                const pct = kpis.gastosTotales > 0 ? (cat.monto / kpis.gastosTotales) * 100 : 0;
                return (
                  <div key={cat.id} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-200 flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full inline-block"
                          style={{ backgroundColor: cat.color }}
                        />
                        {cat.nombre}
                      </span>
                      <span className="font-semibold text-slate-100">
                        {formatMoney(cat.monto, displayCurrency)}{' '}
                        <span className="text-slate-400 font-normal">({pct.toFixed(1)}%)</span>
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(100, Math.max(2, pct))}%`,
                          backgroundColor: cat.color,
                        }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
