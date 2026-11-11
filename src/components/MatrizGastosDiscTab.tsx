import React, { useMemo, useState } from 'react';
import {
  Calendar,
  ChevronDown,
  ChevronRight,
  Edit3,
  Plus,
  Search,
  Table,
} from 'lucide-react';
import { AppDatabase, Transaccion } from '../types';
import { formatMoney, MESES_NOMBRES } from '../lib/storage';

interface MatrizGastosDiscTabProps {
  db: AppDatabase;
  selectedYear: number;
  setSelectedYear: (y: number) => void;
  onUpsertCellTransaction: (params: {
    anio: number;
    mes: number;
    seccion: string;
    rubro: string;
    monto: number;
    tipo: 'ingreso' | 'gasto';
  }) => void;
}

const ORDEN_SECCIONES = [
  'Ingresos',
  'Servicios Básicos',
  'Crédito Hipotecario',
  'Casa',
  'Efectivo - Débito',
  'Tarjeta Visa | BBVA',
  'Tarjeta Visa | Galicia',
  'Tarjeta Mastercard | Galicia',
  'Tarjeta Cabal',
  'Auto',
];

export const MatrizGastosDiscTab: React.FC<MatrizGastosDiscTabProps> = ({
  db,
  selectedYear,
  setSelectedYear,
  onUpsertCellTransaction,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [editingCell, setEditingCell] = useState<{
    seccion: string;
    rubro: string;
    mes: number;
    tipo: 'ingreso' | 'gasto';
    valorActual: number;
  } | null>(null);
  const [editAmountStr, setEditAmountStr] = useState('');

  // Modal para agregar un nuevo rubro a una sección
  const [showNewRowModal, setShowNewRowModal] = useState(false);
  const [newRowSeccion, setNewRowSeccion] = useState('Efectivo - Débito');
  const [newRowRubro, setNewRowRubro] = useState('');
  const [newRowMes, setNewRowMes] = useState<number>(new Date().getMonth() + 1);
  const [newRowMonto, setNewRowMonto] = useState('');

  const yearsAvailable = useMemo(() => {
    const s = new Set<number>([2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015, 2014]);
    db.transacciones.forEach((t) => {
      const y = t.metadatos?.anio ?? Number(t.fecha.slice(0, 4));
      if (y >= 2014 && y <= 2030) s.add(y);
    });
    return Array.from(s).sort((a, b) => b - a);
  }, [db.transacciones]);

  // Construir la estructura matricial para el año seleccionado
  const matrizPorSeccion = useMemo(() => {
    const mapSeccion = new Map<
      string,
      {
        seccion: string;
        tipo: 'ingreso' | 'gasto';
        rubros: Map<string, number[]>; // 12 meses (index 0..11)
        totalesMes: number[];
        totalAnual: number;
      }
    >();

    // Sembrar rubros conocidos de Gastos Disc. e Ingresos para que la grilla conserve la estructura aún en meses en 0
    db.transacciones.forEach((t: Transaccion) => {
      const y = t.metadatos?.anio ?? Number(t.fecha.slice(0, 4));
      if (y !== selectedYear) return;
      if (t.tipo !== 'ingreso' && t.tipo !== 'gasto') return;

      const m = (t.metadatos?.mes ?? Number(t.fecha.slice(5, 7))) - 1;
      if (m < 0 || m > 11) return;

      const seccion = t.metadatos?.seccion || (t.tipo === 'ingreso' ? 'Ingresos' : 'Otros Gastos');
      const rubro = t.metadatos?.rubro_original || t.concepto;

      if (
        searchTerm.trim() &&
        !rubro.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !seccion.toLowerCase().includes(searchTerm.toLowerCase())
      ) {
        return;
      }

      if (!mapSeccion.has(seccion)) {
        mapSeccion.set(seccion, {
          seccion,
          tipo: t.tipo === 'ingreso' ? 'ingreso' : 'gasto',
          rubros: new Map(),
          totalesMes: Array(12).fill(0),
          totalAnual: 0,
        });
      }

      const secObj = mapSeccion.get(seccion)!;
      if (!secObj.rubros.has(rubro)) {
        secObj.rubros.set(rubro, Array(12).fill(0));
      }

      const montoEf = t.moneda === 'USD' ? t.monto * db.cotizaciones.dolarMep : t.monto;
      const arr = secObj.rubros.get(rubro)!;
      arr[m] = Number((arr[m] + montoEf).toFixed(2));
      secObj.totalesMes[m] = Number((secObj.totalesMes[m] + montoEf).toFixed(2));
      secObj.totalAnual = Number((secObj.totalAnual + montoEf).toFixed(2));
    });

    const lista = Array.from(mapSeccion.values());
    lista.sort((a, b) => {
      const idxA = ORDEN_SECCIONES.indexOf(a.seccion);
      const idxB = ORDEN_SECCIONES.indexOf(b.seccion);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.seccion.localeCompare(b.seccion);
    });

    return lista;
  }, [db.transacciones, selectedYear, searchTerm, db.cotizaciones.dolarMep]);

  // Totales globales de Ingresos vs Gastos por mes
  const resumenGlobalMes = useMemo(() => {
    const ingresosMes = Array(12).fill(0);
    const gastosMes = Array(12).fill(0);

    matrizPorSeccion.forEach((sec) => {
      for (let i = 0; i < 12; i++) {
        if (sec.tipo === 'ingreso') {
          ingresosMes[i] += sec.totalesMes[i];
        } else {
          gastosMes[i] += sec.totalesMes[i];
        }
      }
    });

    const totalIngresosAnual = ingresosMes.reduce((a, b) => a + b, 0);
    const totalGastosAnual = gastosMes.reduce((a, b) => a + b, 0);

    return {
      ingresosMes,
      gastosMes,
      totalIngresosAnual,
      totalGastosAnual,
    };
  }, [matrizPorSeccion]);

  const toggleSection = (sec: string) => {
    setCollapsedSections((prev) => ({ ...prev, [sec]: !prev[sec] }));
  };

  const handleOpenEditCell = (
    seccion: string,
    rubro: string,
    mes: number,
    tipo: 'ingreso' | 'gasto',
    valorActual: number
  ) => {
    setEditingCell({ seccion, rubro, mes, tipo, valorActual });
    setEditAmountStr(valorActual > 0 ? String(valorActual) : '');
  };

  const handleSaveCell = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCell) return;
    const num = Number(editAmountStr.replace(',', '.')) || 0;
    onUpsertCellTransaction({
      anio: selectedYear,
      mes: editingCell.mes,
      seccion: editingCell.seccion,
      rubro: editingCell.rubro,
      monto: Math.max(0, num),
      tipo: editingCell.tipo,
    });
    setEditingCell(null);
  };

  const handleCreateNewRow = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRowRubro.trim()) return;
    const num = Number(newRowMonto.replace(',', '.')) || 0;
    onUpsertCellTransaction({
      anio: selectedYear,
      mes: newRowMes,
      seccion: newRowSeccion,
      rubro: newRowRubro.trim(),
      monto: Math.max(0, num),
      tipo: newRowSeccion === 'Ingresos' ? 'ingreso' : 'gasto',
    });
    setNewRowRubro('');
    setNewRowMonto('');
    setShowNewRowModal(false);
  };

  return (
    <div className="space-y-5">
      {/* Cabecera de Controles */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Table className="h-5 w-5 text-emerald-400" />
            <h2 className="text-base font-bold text-slate-100">
              Matriz Anual Interactiva: Ingresos & Gastos Disc. ({selectedYear})
            </h2>
          </div>

          <div className="flex items-center gap-1.5 rounded-xl bg-slate-800 px-3 py-1.5 text-xs">
            <Calendar className="h-3.5 w-3.5 text-emerald-400" />
            <span className="text-slate-400">Año:</span>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="bg-transparent font-bold text-emerald-400 focus:outline-none"
            >
              {yearsAvailable.map((y) => (
                <option key={y} value={y} className="bg-slate-900 text-slate-100">
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filtrar rubro o tarjeta..."
              className="rounded-xl border border-slate-700 bg-slate-950 pl-9 pr-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <button
            onClick={() => setShowNewRowModal(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3.5 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400 transition"
          >
            <Plus className="h-4 w-4" />
            Cargar Rubro / Mes
          </button>
        </div>
      </div>

      {/* Tabla Matricial Enero - Diciembre */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/90 text-slate-400">
                <th className="sticky left-0 z-20 bg-slate-950 px-4 py-3 font-semibold min-w-[220px] border-r border-slate-800">
                  Sección / Concepto ({selectedYear})
                </th>
                {MESES_NOMBRES.map((m) => (
                  <th key={m} className="px-2.5 py-3 text-right font-semibold min-w-[92px]">
                    {m.slice(0, 3)}
                  </th>
                ))}
                <th className="px-3 py-3 text-right font-bold text-emerald-400 bg-slate-950/90 min-w-[110px] border-l border-slate-800">
                  Anual
                </th>
                <th className="px-3 py-3 text-right font-semibold text-slate-300 bg-slate-950/90 min-w-[100px]">
                  Promedio
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {matrizPorSeccion.map((sec) => {
                const isCollapsed = Boolean(collapsedSections[sec.seccion]);
                const isIngreso = sec.tipo === 'ingreso';

                return (
                  <React.Fragment key={sec.seccion}>
                    {/* Fila Cabecera de Sección */}
                    <tr
                      onClick={() => toggleSection(sec.seccion)}
                      className={`cursor-pointer select-none font-semibold transition ${
                        isIngreso
                          ? 'bg-emerald-950/40 text-emerald-300 hover:bg-emerald-950/60'
                          : 'bg-slate-800/75 text-slate-200 hover:bg-slate-800'
                      }`}
                    >
                      <td className="sticky left-0 z-10 bg-inherit px-3 py-2.5 flex items-center gap-2 border-r border-slate-800">
                        {isCollapsed ? (
                          <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
                        )}
                        <span className="truncate">{sec.seccion}</span>
                        <span className="ml-auto rounded bg-slate-900/80 px-1.5 py-0.5 text-[10px] text-slate-400">
                          {sec.rubros.size}
                        </span>
                      </td>
                      {sec.totalesMes.map((tot, mIdx) => (
                        <td key={mIdx} className="px-2.5 py-2.5 text-right font-bold">
                          {tot > 0 ? tot.toLocaleString('es-AR', { maximumFractionDigits: 0 }) : '-'}
                        </td>
                      ))}
                      <td className="px-3 py-2.5 text-right font-bold border-l border-slate-800">
                        {formatMoney(sec.totalAnual, 'ARS')}
                      </td>
                      <td className="px-3 py-2.5 text-right text-slate-300">
                        {formatMoney(sec.totalAnual / 12, 'ARS')}
                      </td>
                    </tr>

                    {/* Filas de cada Rubro dentro de la Sección */}
                    {!isCollapsed &&
                      Array.from(sec.rubros.entries()).map(([rubro, valoresMes]) => {
                        const sumaRubro = valoresMes.reduce((a, b) => a + b, 0);
                        const mesesConDato = valoresMes.filter((v) => v > 0).length || 1;

                        return (
                          <tr
                            key={`${sec.seccion}-${rubro}`}
                            className="hover:bg-slate-800/30 transition group"
                          >
                            <td className="sticky left-0 z-10 bg-slate-900 group-hover:bg-slate-800 px-4 py-2 text-slate-300 border-r border-slate-800/80 truncate max-w-[230px]">
                              {rubro}
                            </td>
                            {valoresMes.map((val, mIdx) => (
                              <td
                                key={mIdx}
                                onClick={() =>
                                  handleOpenEditCell(
                                    sec.seccion,
                                    rubro,
                                    mIdx + 1,
                                    sec.tipo,
                                    val
                                  )
                                }
                                title={`Clic para editar ${rubro} en ${MESES_NOMBRES[mIdx]} ${selectedYear}`}
                                className={`px-2.5 py-2 text-right cursor-pointer transition hover:bg-emerald-500/15 hover:text-emerald-300 ${
                                  val > 0 ? 'text-slate-200 font-medium' : 'text-slate-600'
                                }`}
                              >
                                {val > 0
                                  ? val.toLocaleString('es-AR', { maximumFractionDigits: 0 })
                                  : '-'}
                              </td>
                            ))}
                            <td className="px-3 py-2 text-right font-semibold text-slate-100 border-l border-slate-800/80 bg-slate-950/30">
                              {sumaRubro.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                            </td>
                            <td className="px-3 py-2 text-right text-slate-400 bg-slate-950/30">
                              {(sumaRubro / mesesConDato).toLocaleString('es-AR', {
                                maximumFractionDigits: 0,
                              })}
                            </td>
                          </tr>
                        );
                      })}
                  </React.Fragment>
                );
              })}

              {/* Pie de Tabla: Totales Generales de Gastos e Ingresos */}
              <tr className="bg-rose-950/40 font-bold text-rose-300 border-t-2 border-slate-700">
                <td className="sticky left-0 z-10 bg-rose-950 px-4 py-3 border-r border-slate-800">
                  TOTAL GASTOS ({selectedYear})
                </td>
                {resumenGlobalMes.gastosMes.map((g, idx) => (
                  <td key={idx} className="px-2.5 py-3 text-right">
                    {g > 0 ? g.toLocaleString('es-AR', { maximumFractionDigits: 0 }) : '-'}
                  </td>
                ))}
                <td className="px-3 py-3 text-right border-l border-slate-800">
                  {formatMoney(resumenGlobalMes.totalGastosAnual, 'ARS')}
                </td>
                <td className="px-3 py-3 text-right">
                  {formatMoney(resumenGlobalMes.totalGastosAnual / 12, 'ARS')}
                </td>
              </tr>

              <tr className="bg-emerald-950/50 font-bold text-emerald-300">
                <td className="sticky left-0 z-10 bg-emerald-950 px-4 py-3 border-r border-slate-800">
                  BALANCE NETO MENSUAL
                </td>
                {resumenGlobalMes.ingresosMes.map((ing, idx) => {
                  const dif = ing - resumenGlobalMes.gastosMes[idx];
                  return (
                    <td
                      key={idx}
                      className={`px-2.5 py-3 text-right ${
                        dif >= 0 ? 'text-emerald-300' : 'text-rose-400'
                      }`}
                    >
                      {ing === 0 && resumenGlobalMes.gastosMes[idx] === 0
                        ? '-'
                        : dif.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                    </td>
                  );
                })}
                <td className="px-3 py-3 text-right border-l border-slate-800">
                  {formatMoney(
                    resumenGlobalMes.totalIngresosAnual - resumenGlobalMes.totalGastosAnual,
                    'ARS'
                  )}
                </td>
                <td className="px-3 py-3 text-right">
                  {formatMoney(
                    (resumenGlobalMes.totalIngresosAnual - resumenGlobalMes.totalGastosAnual) / 12,
                    'ARS'
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Edición Rápida de Celda */}
      {editingCell && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleSaveCell}
            className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Edit3 className="h-4 w-4 text-emerald-400" />
                Editar Celda Mensual
              </h3>
              <span className="rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-semibold text-emerald-400">
                {MESES_NOMBRES[editingCell.mes - 1]} {selectedYear}
              </span>
            </div>

            <div className="space-y-1 text-xs text-slate-400">
              <div>
                Sección: <strong className="text-slate-200">{editingCell.seccion}</strong>
              </div>
              <div>
                Concepto / Rubro: <strong className="text-slate-200">{editingCell.rubro}</strong>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Monto en ARS ($)
              </label>
              <input
                type="number"
                step="0.01"
                autoFocus
                value={editAmountStr}
                onChange={(e) => setEditAmountStr(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm font-semibold text-slate-100 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingCell(null)}
                className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
              >
                Guardar Monto
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal para Agregar Nuevo Rubro / Fila a la Matriz */}
      {showNewRowModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleCreateNewRow}
            className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl space-y-4"
          >
            <h3 className="text-base font-bold text-slate-100">
              Agregar Rubro / Movimiento en Matriz ({selectedYear})
            </h3>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Sección / Medio de Pago
              </label>
              <select
                value={newRowSeccion}
                onChange={(e) => setNewRowSeccion(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
              >
                {ORDEN_SECCIONES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Nombre del Rubro / Concepto
              </label>
              <input
                type="text"
                required
                value={newRowRubro}
                onChange={(e) => setNewRowRubro(e.target.value)}
                placeholder="Ej: Seguro Hogar, Carnicería, Sueldo..."
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Mes</label>
                <select
                  value={newRowMes}
                  onChange={(e) => setNewRowMes(Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                >
                  {MESES_NOMBRES.map((m, idx) => (
                    <option key={m} value={idx + 1}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Monto ARS</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={newRowMonto}
                  onChange={(e) => setNewRowMonto(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewRowModal(false)}
                className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-medium text-slate-300"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950"
              >
                Guardar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
