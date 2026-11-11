import React, { useMemo, useState } from 'react';
import {
  Building2,
  Calculator,
  CheckCircle2,
  Clock,
  Edit3,
  Filter,
} from 'lucide-react';
import { AppDatabase, CuotaHipotecario } from '../types';
import { formatMoney } from '../lib/storage';

interface HipotecarioTabProps {
  db: AppDatabase;
  onUpdateCuotaHipotecario: (
    numeroCuota: number,
    changes: {
      pagada: boolean;
      valor_uva: number | null;
      cotizacion_mep: number | null;
      seguro_ars?: number | null;
    }
  ) => void;
  onUpdateCotizaciones: (dolarMep: number, valorUva: number) => void;
}

export const HipotecarioTab: React.FC<HipotecarioTabProps> = ({
  db,
  onUpdateCuotaHipotecario,
  onUpdateCotizaciones,
}) => {
  const [filterMode, setFilterMode] = useState<'all' | 'paid' | 'pending' | 'near'>('near');
  const [selectedYearFilter, setSelectedYearFilter] = useState<number>(0); // 0 = Todos
  const [editingCuota, setEditingCuota] = useState<CuotaHipotecario | null>(null);
  const [formValorUva, setFormValorUva] = useState('');
  const [formMep, setFormMep] = useState('');
  const [formPagada, setFormPagada] = useState(true);

  const cuotas = db.prestamoHipotecario.cuotas;
  const valorUvaRef = db.cotizaciones.valorUva || 1800.05;
  const dolarMepRef = db.cotizaciones.dolarMep || 1423.6;

  const stats = useMemo(() => {
    const pagadas = cuotas.filter((c) => c.pagada);
    const pendientes = cuotas.filter((c) => !c.pagada);
    const ultimaPagada = pagadas[pagadas.length - 1];
    const proxima = pendientes[0] ?? cuotas[cuotas.length - 1];

    const capitalInicialUva = db.prestamoHipotecario.monto_capital_total || 64338.43;
    const saldoActualUva = ultimaPagada ? ultimaPagada.saldo_deuda_uva : capitalInicialUva;
    const amortizadoUva = capitalInicialUva - saldoActualUva;

    const totalUsdPagado = pagadas.reduce((acc, c) => {
      if (c.cuota_usd && c.cuota_usd > 0) return acc + c.cuota_usd;
      const ars = c.cuota_total_ars ?? c.cuota_total_uva * (c.valor_uva ?? valorUvaRef);
      const mep = c.cotizacion_mep ?? dolarMepRef;
      return acc + (mep > 0 ? ars / mep : 0);
    }, 0);

    const deudaArsActual = saldoActualUva * valorUvaRef;
    const deudaUsdActual = deudaArsActual / dolarMepRef;
    const proxCuotaArs = (proxima?.cuota_total_uva ?? 485.5) * valorUvaRef;
    const proxCuotaUsd = proxCuotaArs / dolarMepRef;

    return {
      pagadasCount: pagadas.length,
      pendientesCount: pendientes.length,
      progresoPct: (pagadas.length / cuotas.length) * 100,
      capitalInicialUva,
      saldoActualUva,
      amortizadoUva,
      totalUsdPagado,
      deudaArsActual,
      deudaUsdActual,
      proxima,
      proxCuotaArs,
      proxCuotaUsd,
    };
  }, [cuotas, db.prestamoHipotecario.monto_capital_total, valorUvaRef, dolarMepRef]);

  const yearsInSchedule = useMemo(() => {
    const s = new Set<number>();
    cuotas.forEach((c) => {
      const y = Number(c.fecha_vencimiento.slice(0, 4));
      if (y) s.add(y);
    });
    return Array.from(s).sort((a, b) => a - b);
  }, [cuotas]);

  const cuotasFiltradas = useMemo(() => {
    return cuotas.filter((c) => {
      if (selectedYearFilter > 0) {
        const y = Number(c.fecha_vencimiento.slice(0, 4));
        if (y !== selectedYearFilter) return false;
      }
      if (filterMode === 'paid') return c.pagada;
      if (filterMode === 'pending') return !c.pagada;
      if (filterMode === 'near') return c.numero_cuota <= 36; // Primeros 3 años (2025-2028)
      return true;
    });
  }, [cuotas, filterMode, selectedYearFilter]);

  const handleOpenEdit = (c: CuotaHipotecario) => {
    setEditingCuota(c);
    setFormValorUva(String(c.valor_uva ?? valorUvaRef));
    setFormMep(String(c.cotizacion_mep ?? dolarMepRef));
    setFormPagada(c.pagada);
  };

  const handleSaveCuota = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCuota) return;
    const uva = Number(formValorUva.replace(',', '.')) || null;
    const mep = Number(formMep.replace(',', '.')) || null;

    onUpdateCuotaHipotecario(editingCuota.numero_cuota, {
      pagada: formPagada,
      valor_uva: uva,
      cotizacion_mep: mep,
    });
    setEditingCuota(null);
  };

  return (
    <div className="space-y-6">
      {/* KPIs del Crédito Hipotecario UVA */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-violet-500/30 bg-slate-900/70 p-5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="uppercase font-semibold text-violet-300">Avance de Cuotas</span>
            <Building2 className="h-4 w-4 text-violet-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-100">
            {stats.pagadasCount} <span className="text-base font-normal text-slate-400">/ 240</span>
          </div>
          <div className="mt-3 h-2 w-full rounded-full bg-slate-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-violet-500"
              style={{ width: `${Math.max(2, stats.progresoPct)}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-xs text-slate-400">
            <span>{stats.progresoPct.toFixed(1)}% completado</span>
            <span>Restan {stats.pendientesCount} cuotas</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="text-xs font-semibold uppercase text-slate-400">
            Saldo de Capital (UVAs)
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-100">
            {stats.saldoActualUva.toLocaleString('es-AR', { maximumFractionDigits: 2 })} UVAs
          </div>
          <div className="mt-2 space-y-1 text-xs text-slate-400">
            <div className="flex justify-between">
              <span>Capital Inicial:</span>
              <span className="text-slate-200">{stats.capitalInicialUva.toLocaleString('es-AR')} UVAs</span>
            </div>
            <div className="flex justify-between">
              <span>Amortizado:</span>
              <span className="text-emerald-400 font-medium">
                -{stats.amortizadoUva.toLocaleString('es-AR', { maximumFractionDigits: 2 })} UVAs
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="text-xs font-semibold uppercase text-slate-400">
            Deuda Estimada Hoy (ARS / USD)
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-300">
            {formatMoney(stats.deudaUsdActual, 'USD')}
          </div>
          <div className="mt-2 space-y-1 text-xs text-slate-400">
            <div className="flex justify-between">
              <span>En Pesos (a UVA actual):</span>
              <span className="text-slate-200 font-medium">{formatMoney(stats.deudaArsActual, 'ARS')}</span>
            </div>
            <div className="flex justify-between">
              <span>Total ya pagado en USD:</span>
              <span className="text-emerald-400 font-medium">{formatMoney(stats.totalUsdPagado, 'USD')}</span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-emerald-500/30 bg-slate-900/70 p-5">
          <div className="text-xs font-semibold uppercase text-emerald-300">
            Próximo Vencimiento ({stats.proxima?.etiqueta_cuota})
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-100">
            {formatMoney(stats.proxCuotaArs, 'ARS')}
          </div>
          <div className="mt-2 space-y-1 text-xs text-slate-400">
            <div className="flex justify-between">
              <span>Cuota Pura + Seguro:</span>
              <span className="text-slate-200">{stats.proxima?.cuota_total_uva} UVAs</span>
            </div>
            <div className="flex justify-between">
              <span>Equivalente MEP:</span>
              <span className="text-emerald-300 font-semibold">{formatMoney(stats.proxCuotaUsd, 'USD', 2)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Simulador / Parámetros de Indexación en Vivo */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
            <Calculator className="h-4 w-4 text-violet-400" />
            <span>Simulador UVA & MEP en vivo:</span>
          </div>

          <div className="flex items-center gap-2 rounded-xl bg-slate-950 border border-slate-800 px-3 py-1.5 text-xs">
            <span className="text-slate-400">Valor UVA ($):</span>
            <input
              type="number"
              step="0.01"
              value={valorUvaRef}
              onChange={(e) =>
                onUpdateCotizaciones(dolarMepRef, Number(e.target.value) || valorUvaRef)
              }
              className="w-24 bg-transparent font-bold text-violet-300 focus:outline-none text-right"
            />
          </div>

          <div className="flex items-center gap-2 rounded-xl bg-slate-950 border border-slate-800 px-3 py-1.5 text-xs">
            <span className="text-slate-400">Dólar MEP ($):</span>
            <input
              type="number"
              step="0.1"
              value={dolarMepRef}
              onChange={(e) =>
                onUpdateCotizaciones(Number(e.target.value) || dolarMepRef, valorUvaRef)
              }
              className="w-24 bg-transparent font-bold text-emerald-300 focus:outline-none text-right"
            />
          </div>
        </div>

        {/* Filtros de tabla */}
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-slate-400" />
          {[
            { id: 'near', label: '2025–2028 (36 cuotas)' },
            { id: 'paid', label: 'Pagadas' },
            { id: 'pending', label: 'Pendientes' },
            { id: 'all', label: 'Todas (240)' },
          ].map((btn) => (
            <button
              key={btn.id}
              onClick={() => setFilterMode(btn.id as typeof filterMode)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                filterMode === btn.id
                  ? 'bg-violet-500 text-slate-950 font-semibold'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {btn.label}
            </button>
          ))}

          <select
            value={selectedYearFilter}
            onChange={(e) => setSelectedYearFilter(Number(e.target.value))}
            className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-slate-200"
          >
            <option value={0}>Todos los años (2025–2045)</option>
            {yearsInSchedule.map((y) => (
              <option key={y} value={y}>
                Año {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabla de Amortización de las 240 Cuotas */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-xl">
        <div className="overflow-x-auto max-h-[600px]">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="sticky top-0 z-20 bg-slate-950 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="px-3 py-3 font-semibold">Cuota</th>
                <th className="px-3 py-3 font-semibold">Vencimiento</th>
                <th className="px-3 py-3 text-right font-semibold">Valor UVA</th>
                <th className="px-3 py-3 text-right font-semibold">Amort. (UVA)</th>
                <th className="px-3 py-3 text-right font-semibold">Interés (UVA)</th>
                <th className="px-3 py-3 text-right font-semibold">Seguro ($)</th>
                <th className="px-3 py-3 text-right font-semibold text-violet-300">Cuota (UVA)</th>
                <th className="px-3 py-3 text-right font-semibold text-slate-200">Cuota ($)</th>
                <th className="px-3 py-3 text-right font-semibold">Saldo (UVA)</th>
                <th className="px-3 py-3 text-right font-semibold">MEP</th>
                <th className="px-3 py-3 text-right font-semibold text-emerald-300">Cuota (u$s)</th>
                <th className="px-3 py-3 text-right font-semibold">Deuda ($)</th>
                <th className="px-3 py-3 text-right font-semibold text-amber-300">Deuda (u$s)</th>
                <th className="px-3 py-3 text-center font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {cuotasFiltradas.map((c) => {
                const uvaEfectiva = c.valor_uva ?? valorUvaRef;
                const mepEfectivo = c.cotizacion_mep ?? dolarMepRef;
                const cuotaArsCalc = c.cuota_total_ars ?? c.cuota_total_uva * uvaEfectiva;
                const cuotaUsdCalc =
                  c.cuota_usd && c.cuota_usd > 0
                    ? c.cuota_usd
                    : mepEfectivo > 0
                      ? cuotaArsCalc / mepEfectivo
                      : 0;
                const deudaArsCalc = c.deuda_ars ?? c.saldo_deuda_uva * uvaEfectiva;
                const deudaUsdCalc =
                  c.deuda_usd && c.deuda_usd > 0
                    ? c.deuda_usd
                    : mepEfectivo > 0
                      ? deudaArsCalc / mepEfectivo
                      : 0;

                return (
                  <tr
                    key={c.id}
                    className={`transition hover:bg-slate-800/40 ${
                      c.pagada ? 'bg-emerald-950/10' : ''
                    }`}
                  >
                    <td className="px-3 py-2.5 font-bold text-slate-200">{c.etiqueta_cuota}</td>
                    <td className="px-3 py-2.5 text-slate-300">{c.fecha_vencimiento}</td>
                    <td className="px-3 py-2.5 text-right font-medium text-slate-200">
                      {c.valor_uva ? (
                        `$ ${c.valor_uva.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
                      ) : (
                        <span className="text-slate-500" title="Proyectado con UVA actual">
                          *${uvaEfectiva.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-300">
                      {c.amortizacion_uva.toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-300">
                      {c.interes_uva.toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-400">
                      {c.seguro_ars
                        ? formatMoney(c.seguro_ars, 'ARS')
                        : `${c.seguro_uva.toFixed(2)} UVA`}
                    </td>
                    <td className="px-3 py-2.5 text-right font-bold text-violet-300">
                      {c.cuota_total_uva.toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-bold text-slate-100">
                      {formatMoney(cuotaArsCalc, 'ARS')}
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-300">
                      {c.saldo_deuda_uva.toLocaleString('es-AR', { maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-400">
                      {c.cotizacion_mep
                        ? `$ ${c.cotizacion_mep.toLocaleString('es-AR')}`
                        : `*$ ${mepEfectivo.toLocaleString('es-AR')}`}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold text-emerald-300">
                      US$ {cuotaUsdCalc.toLocaleString('es-AR', { maximumFractionDigits: 1 })}
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-400">
                      {formatMoney(deudaArsCalc, 'ARS')}
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium text-amber-300">
                      {formatMoney(deudaUsdCalc, 'USD')}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <button
                        onClick={() => handleOpenEdit(c)}
                        className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                          c.pagada
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30'
                            : 'bg-slate-800 text-slate-300 hover:bg-violet-500 hover:text-slate-950'
                        }`}
                      >
                        {c.pagada ? (
                          <>
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Pagada
                          </>
                        ) : (
                          <>
                            <Clock className="h-3.5 w-3.5" />
                            Liquidar
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal para Liquidar / Editar Cuota Hipotecario */}
      {editingCuota && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleSaveCuota}
            className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Edit3 className="h-4 w-4 text-violet-400" />
                Cuota Hipotecario {editingCuota.etiqueta_cuota}
              </h3>
              <span className="text-xs text-slate-400">
                Vto: {editingCuota.fecha_vencimiento}
              </span>
            </div>

            <div className="rounded-xl bg-slate-950 p-3 text-xs space-y-1 border border-slate-800">
              <div className="flex justify-between">
                <span className="text-slate-400">Cuota Total en UVAs:</span>
                <strong className="text-violet-300">{editingCuota.cuota_total_uva} UVAs</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Amortización + Interés:</span>
                <span className="text-slate-200">
                  {editingCuota.amortizacion_uva} + {editingCuota.interes_uva} UVAs
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Saldo remanente luego del pago:</span>
                <span className="text-slate-200">
                  {editingCuota.saldo_deuda_uva.toLocaleString('es-AR')} UVAs
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Valor UVA del Mes ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={formValorUva}
                  onChange={(e) => setFormValorUva(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Cotización Dólar MEP ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={formMep}
                  onChange={(e) => setFormMep(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-100"
                />
              </div>
            </div>

            <label className="flex items-center gap-2.5 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={formPagada}
                onChange={(e) => setFormPagada(e.target.checked)}
                className="h-4 w-4 rounded border-slate-700 text-emerald-500 focus:ring-emerald-500"
              />
              <span className="text-xs font-medium text-slate-200">
                Marcar cuota como Pagada y reflejar gasto en Finanzas / Gastos Disc.
              </span>
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingCuota(null)}
                className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-medium text-slate-300"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-xl bg-violet-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-violet-400"
              >
                Guardar Cuota
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
