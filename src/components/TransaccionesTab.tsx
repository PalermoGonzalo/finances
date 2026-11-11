import React, { useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpRight,
  Filter,
  Plus,
  Search,
  Trash2,
  Users,
} from 'lucide-react';
import {
  AppDatabase,
  CondicionFiscal,
  Moneda,
  TipoTransaccion,
  Transaccion,
} from '../types';
import { formatMoney, MESES_NOMBRES } from '../lib/storage';

interface TransaccionesTabProps {
  db: AppDatabase;
  selectedYear: number;
  setSelectedYear: (y: number) => void;
  onAddTransaction: (tx: Omit<Transaccion, 'id'>) => void;
  onDeleteTransaction: (id: string) => void;
}

export const TransaccionesTab: React.FC<TransaccionesTabProps> = ({
  db,
  selectedYear,
  setSelectedYear,
  onAddTransaction,
  onDeleteTransaction,
}) => {
  const [filterMonth, setFilterMonth] = useState<number>(0);
  const [filterTipo, setFilterTipo] = useState<string>('todos');
  const [filterCuentaId, setFilterCuentaId] = useState<string>('todas');
  const [filterSeccion, setFilterSeccion] = useState<string>('todas');
  const [search, setSearch] = useState('');

  // Modal Nueva Transacción
  const [showNewModal, setShowNewModal] = useState(false);
  const [tipo, setTipo] = useState<TipoTransaccion>('gasto');
  const [concepto, setConcepto] = useState('');
  const [monto, setMonto] = useState('');
  const [moneda, setMoneda] = useState<Moneda>('ARS');
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [cuentaId, setCuentaId] = useState<string>(db.cuentas[0]?.id ?? '');
  const [cuentaDestinoId, setCuentaDestinoId] = useState<string>(
    db.cuentas.find((c) => c.moneda === 'USD')?.id ?? ''
  );
  const [categoriaId, setCategoriaId] = useState<string>(db.categorias[1]?.id ?? '');
  const [seccion, setSeccion] = useState<string>('Efectivo - Débito');
  const [condicionFiscal, setCondicionFiscal] = useState<CondicionFiscal>('blanco');
  const [observaciones, setObservaciones] = useState('');

  const yearsAvailable = useMemo(() => {
    const s = new Set<number>([2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015, 2014]);
    db.transacciones.forEach((t) => {
      const y = t.metadatos?.anio ?? Number(t.fecha.slice(0, 4));
      if (y >= 2014 && y <= 2030) s.add(y);
    });
    return Array.from(s).sort((a, b) => b - a);
  }, [db.transacciones]);

  const seccionesDisponibles = useMemo(() => {
    const s = new Set<string>();
    db.transacciones.forEach((t) => {
      if (t.metadatos?.seccion) s.add(t.metadatos.seccion);
    });
    return Array.from(s).sort();
  }, [db.transacciones]);

  const transaccionesFiltradas = useMemo(() => {
    return db.transacciones
      .filter((t) => {
        const y = t.metadatos?.anio ?? Number(t.fecha.slice(0, 4));
        const m = t.metadatos?.mes ?? Number(t.fecha.slice(5, 7));
        if (y !== selectedYear) return false;
        if (filterMonth > 0 && m !== filterMonth) return false;
        if (filterTipo !== 'todos' && t.tipo !== filterTipo) return false;
        if (filterCuentaId !== 'todas' && t.cuenta_id !== filterCuentaId) return false;
        if (filterSeccion !== 'todas' && t.metadatos?.seccion !== filterSeccion) return false;
        if (search.trim()) {
          const q = search.toLowerCase();
          const matchConcepto = t.concepto.toLowerCase().includes(q);
          const matchObs = t.observaciones.toLowerCase().includes(q);
          const matchSec = (t.metadatos?.seccion ?? '').toLowerCase().includes(q);
          if (!matchConcepto && !matchObs && !matchSec) return false;
        }
        return true;
      })
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [
    db.transacciones,
    selectedYear,
    filterMonth,
    filterTipo,
    filterCuentaId,
    filterSeccion,
    search,
  ]);

  const handleSubmitNew = (e: React.FormEvent) => {
    e.preventDefault();
    const numMonto = Number(monto.replace(',', '.')) || 0;
    if (numMonto <= 0 || !concepto.trim()) return;

    const fechaObj = new Date(fecha + 'T12:00:00');
    const anio = !isNaN(fechaObj.getTime()) ? fechaObj.getFullYear() : selectedYear;
    const mes = !isNaN(fechaObj.getTime()) ? fechaObj.getMonth() + 1 : 1;

    onAddTransaction({
      cuenta_id: cuentaId || null,
      cuenta_destino_id: tipo === 'transferencia' ? cuentaDestinoId || null : null,
      tipo,
      concepto: concepto.trim(),
      monto: numMonto,
      monto_caja: numMonto,
      moneda,
      fecha,
      categoria_id: categoriaId || null,
      condicion_fiscal: condicionFiscal,
      estado_pago: 'pagado',
      es_recurrente: false,
      observaciones: observaciones.trim(),
      origen_hoja_excel: 'Carga Manual Web',
      metadatos: {
        anio,
        mes,
        seccion: tipo === 'ingreso' ? 'Ingresos' : seccion,
        rubro_original: concepto.trim(),
      },
    });

    setConcepto('');
    setMonto('');
    setObservaciones('');
    setShowNewModal(false);
  };

  return (
    <div className="space-y-5">
      {/* Barra de Filtros y Alta */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <Filter className="h-4 w-4 text-emerald-400" />
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-bold text-emerald-400"
          >
            {yearsAvailable.map((y) => (
              <option key={y} value={y}>
                Año {y}
              </option>
            ))}
          </select>

          <select
            value={filterMonth}
            onChange={(e) => setFilterMonth(Number(e.target.value))}
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200"
          >
            <option value={0}>Todos los meses</option>
            {MESES_NOMBRES.map((m, idx) => (
              <option key={m} value={idx + 1}>
                {m}
              </option>
            ))}
          </select>

          <select
            value={filterTipo}
            onChange={(e) => setFilterTipo(e.target.value)}
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200"
          >
            <option value="todos">Todos los tipos</option>
            <option value="ingreso">Ingresos</option>
            <option value="gasto">Gastos</option>
            <option value="transferencia">Transferencias / Compra USD</option>
            <option value="liquidacion_split">Liquidaciones Splitwise</option>
          </select>

          <select
            value={filterSeccion}
            onChange={(e) => setFilterSeccion(e.target.value)}
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 max-w-[180px]"
          >
            <option value="todas">Todas las secciones</option>
            {seccionesDisponibles.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <select
            value={filterCuentaId}
            onChange={(e) => setFilterCuentaId(e.target.value)}
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 max-w-[180px]"
          >
            <option value="todas">Todas las cuentas</option>
            {db.cuentas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar concepto..."
              className="rounded-xl border border-slate-700 bg-slate-950 pl-9 pr-3 py-1.5 text-xs text-slate-100"
            />
          </div>

          <button
            onClick={() => setShowNewModal(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3.5 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400 transition"
          >
            <Plus className="h-4 w-4" />
            Nueva Transacción
          </button>
        </div>
      </div>

      {/* Tabla de Transacciones */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-xl">
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span>
            Mostrando <strong className="text-slate-200">{transaccionesFiltradas.length}</strong> movimientos en {selectedYear}
          </span>
          <span>
            Los gastos de <strong className="text-pink-400">Splitwise</strong> se sincronizan automáticamente diferenciando tu parte real del flujo de caja.
          </span>
        </div>

        <div className="overflow-x-auto max-h-[600px]">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10 bg-slate-950 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="px-4 py-3 font-semibold">Fecha</th>
                <th className="px-4 py-3 font-semibold">Concepto</th>
                <th className="px-4 py-3 font-semibold">Sección / Origen</th>
                <th className="px-4 py-3 font-semibold">Cuenta / Billetera</th>
                <th className="px-4 py-3 text-right font-semibold">Monto Devengado (Tu Parte)</th>
                <th className="px-4 py-3 text-right font-semibold">Impacto Caja (Billetera)</th>
                <th className="px-4 py-3 text-center font-semibold">Estado</th>
                <th className="px-3 py-3 text-center font-semibold">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {transaccionesFiltradas.map((tx) => {
                const cuenta = db.cuentas.find((c) => c.id === tx.cuenta_id);
                const isIngreso = tx.tipo === 'ingreso';
                const isSplit = Boolean(tx.es_origen_splitwise);

                return (
                  <tr key={tx.id} className="hover:bg-slate-800/40 transition">
                    <td className="px-4 py-2.5 text-slate-300 whitespace-nowrap">{tx.fecha}</td>
                    <td className="px-4 py-2.5">
                      <div className="font-semibold text-slate-100 flex items-center gap-1.5">
                        {isIngreso ? (
                          <ArrowUpRight className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                        ) : tx.tipo === 'transferencia' || tx.tipo === 'liquidacion_split' ? (
                          <ArrowLeftRight className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                        ) : (
                          <ArrowDownRight className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                        )}
                        <span>{tx.concepto}</span>
                        {isSplit && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-pink-500/20 px-2 py-0.5 text-[10px] font-semibold text-pink-300 border border-pink-500/30">
                            <Users className="h-2.5 w-2.5" />
                            Splitwise Auto
                          </span>
                        )}
                      </div>
                      {tx.observaciones && (
                        <div className="text-[11px] text-slate-500 truncate max-w-md">
                          {tx.observaciones}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-slate-300">
                      <span className="rounded-lg bg-slate-800 px-2 py-0.5 text-[11px]">
                        {tx.metadatos?.seccion ?? tx.origen_hoja_excel ?? 'General'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-300">
                      {cuenta ? cuenta.nombre : 'Pagado por tercero (Split)'}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right font-bold whitespace-nowrap ${
                        isIngreso
                          ? 'text-emerald-400'
                          : tx.tipo === 'liquidacion_split'
                            ? 'text-slate-400'
                            : 'text-rose-400'
                      }`}
                    >
                      {isIngreso ? '+' : tx.tipo === 'gasto' ? '-' : ''}
                      {formatMoney(tx.monto, tx.moneda, tx.moneda === 'USD' ? 2 : 0)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium text-slate-300 whitespace-nowrap">
                      {tx.monto_caja > 0
                        ? formatMoney(tx.monto_caja, tx.moneda, tx.moneda === 'USD' ? 2 : 0)
                        : '$ 0'}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          tx.estado_pago === 'pagado'
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : 'bg-amber-500/20 text-amber-300'
                        }`}
                      >
                        {tx.estado_pago === 'pagado' ? 'Pagado' : 'Deuda Split'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {!isSplit && (
                        <button
                          onClick={() => onDeleteTransaction(tx.id)}
                          title="Eliminar transacción"
                          className="rounded-lg p-1 text-slate-500 hover:bg-rose-500/20 hover:text-rose-400 transition"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Nueva Transacción */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleSubmitNew}
            className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl space-y-4"
          >
            <h3 className="text-base font-bold text-slate-100">
              Registrar Nuevo Movimiento Financiero
            </h3>

            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'gasto', label: 'Gasto / Egreso' },
                  { id: 'ingreso', label: 'Ingreso / Cobro' },
                  { id: 'transferencia', label: 'Transferencia' },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTipo(t.id)}
                  className={`rounded-xl py-2 text-xs font-semibold border transition ${
                    tipo === t.id
                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Concepto / Descripción
                </label>
                <input
                  type="text"
                  required
                  value={concepto}
                  onChange={(e) => setConcepto(e.target.value)}
                  placeholder="Ej: Supermercado Coto, Expensas, Sueldo..."
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Monto</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Moneda</label>
                <select
                  value={moneda}
                  onChange={(e) => setMoneda(e.target.value as Moneda)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                >
                  <option value="ARS">ARS ($ Pesos)</option>
                  <option value="USD">USD (US$ Dólares)</option>
                  <option value="EUR">EUR (€ Euros)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Fecha</label>
                <input
                  type="date"
                  required
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Cuenta / Billetera
                </label>
                <select
                  value={cuentaId}
                  onChange={(e) => setCuentaId(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                >
                  {db.cuentas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre} ({c.moneda})
                    </option>
                  ))}
                </select>
              </div>

              {tipo === 'transferencia' ? (
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Cuenta Destino
                  </label>
                  <select
                    value={cuentaDestinoId}
                    onChange={(e) => setCuentaDestinoId(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                  >
                    {db.cuentas.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre} ({c.moneda})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Sección (Hoja Gastos Disc.)
                    </label>
                    <select
                      value={seccion}
                      onChange={(e) => setSeccion(e.target.value)}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                    >
                      <option value="Servicios Básicos">Servicios Básicos</option>
                      <option value="Efectivo - Débito">Efectivo - Débito</option>
                      <option value="Tarjeta Visa | BBVA">Tarjeta Visa | BBVA</option>
                      <option value="Tarjeta Visa | Galicia">Tarjeta Visa | Galicia</option>
                      <option value="Tarjeta Mastercard | Galicia">Tarjeta Mastercard | Galicia</option>
                      <option value="Tarjeta Cabal">Tarjeta Cabal</option>
                      <option value="Casa">Casa</option>
                      <option value="Auto">Auto</option>
                      <option value="Crédito Hipotecario">Crédito Hipotecario</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Categoría
                    </label>
                    <select
                      value={categoriaId}
                      onChange={(e) => setCategoriaId(e.target.value)}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                    >
                      {db.categorias.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Condición Fiscal
                </label>
                <select
                  value={condicionFiscal}
                  onChange={(e) => setCondicionFiscal(e.target.value as CondicionFiscal)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                >
                  <option value="blanco">Formal / Blanco</option>
                  <option value="negro">Extra / Negro</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Notas / Observaciones
                </label>
                <input
                  type="text"
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  placeholder="Opcional..."
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-medium text-slate-300"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
              >
                Guardar Transacción
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
