import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  Landmark,
  Plus,
  Target,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { AppDatabase, Cuenta, Moneda, Presupuesto, TipoCuenta } from '../types';
import { formatMoney, MESES_NOMBRES } from '../lib/storage';

interface CuentasPresupuestosTabProps {
  db: AppDatabase;
  selectedYear: number;
  onAddCuenta: (c: Cuenta) => void;
  onUpdateSaldoInicialCuenta: (cuentaId: string, nuevoSaldoInicial: number) => void;
  onAddPresupuesto: (p: Presupuesto) => void;
}

export const CuentasPresupuestosTab: React.FC<CuentasPresupuestosTabProps> = ({
  db,
  selectedYear,
  onAddCuenta,
  onUpdateSaldoInicialCuenta,
  onAddPresupuesto,
}) => {
  const [selectedMonth, setSelectedMonth] = useState<number>(8); // Agosto por defecto

  // Modal Nueva Billetera
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [wNombre, setWNombre] = useState('');
  const [wTipo, setWTipo] = useState<TipoCuenta>('banco');
  const [wInstitucion, setWInstitucion] = useState('');
  const [wMoneda, setWMoneda] = useState<Moneda>('ARS');
  const [wSaldoInicial, setWSaldoInicial] = useState('0');

  // Modal Nuevo Presupuesto
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [bCatId, setBCatId] = useState(db.categorias[1]?.id ?? '');
  const [bLimite, setBLimite] = useState('');
  const [bMoneda, setBMoneda] = useState<Moneda>('ARS');

  // Cálculo de ejecución presupuestaria para el mes y año seleccionados
  const ejecucionPresupuestos = useMemo(() => {
    return db.presupuestos.map((p) => {
      const cat = db.categorias.find((c) => c.id === p.categoria_id);
      const gastado = db.transacciones
        .filter((t) => {
          const y = t.metadatos?.anio ?? Number(t.fecha.slice(0, 4));
          const m = t.metadatos?.mes ?? Number(t.fecha.slice(5, 7));
          return (
            t.tipo === 'gasto' &&
            t.categoria_id === p.categoria_id &&
            y === selectedYear &&
            m === selectedMonth
          );
        })
        .reduce((acc, t) => {
          const monto =
            t.moneda === p.moneda
              ? t.monto
              : p.moneda === 'ARS'
                ? t.monto * db.cotizaciones.dolarMep
                : t.monto / db.cotizaciones.dolarMep;
          return acc + monto;
        }, 0);

      const pct = p.monto_limite > 0 ? (gastado / p.monto_limite) * 100 : 0;
      return {
        ...p,
        categoriaNombre: cat?.nombre ?? 'Categoría',
        categoriaColor: cat?.color ?? '#10b981',
        gastado,
        pct,
      };
    });
  }, [db.presupuestos, db.categorias, db.transacciones, selectedYear, selectedMonth, db.cotizaciones.dolarMep]);

  const handleSaveWallet = (e: React.FormEvent) => {
    e.preventDefault();
    if (!wNombre.trim()) return;
    const saldoIni = Number(wSaldoInicial.replace(',', '.')) || 0;
    onAddCuenta({
      id: crypto.randomUUID(),
      nombre: wNombre.trim(),
      tipo: wTipo,
      institucion: wInstitucion.trim() || wNombre.trim(),
      moneda: wMoneda,
      saldo_inicial: saldoIni,
      saldo_actual: saldoIni,
      color: wMoneda === 'USD' ? '#14b8a6' : '#10b981',
      icono: 'Wallet',
    });
    setWNombre('');
    setWInstitucion('');
    setWSaldoInicial('0');
    setShowWalletModal(false);
  };

  const handleSaveBudget = (e: React.FormEvent) => {
    e.preventDefault();
    const lim = Number(bLimite.replace(',', '.')) || 0;
    if (lim <= 0) return;
    onAddPresupuesto({
      id: crypto.randomUUID(),
      categoria_id: bCatId,
      mes: selectedMonth,
      anio: selectedYear,
      monto_limite: lim,
      moneda: bMoneda,
      umbral_alerta_pct: 80,
    });
    setBLimite('');
    setShowBudgetModal(false);
  };

  return (
    <div className="space-y-8">
      {/* Sección 1: Billeteras, Bancos, Tarjetas e Inversiones */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Wallet className="h-5 w-5 text-emerald-400" />
              Billeteras, Cuentas Bancarias, Tarjetas e Inversiones
            </h2>
            <p className="text-xs text-slate-400">
              Cada cuenta refleja los movimientos de Gastos Disc., Ingresos y los pagos/liquidaciones de Splitwise.
            </p>
          </div>

          <button
            onClick={() => setShowWalletModal(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3.5 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400 transition"
          >
            <Plus className="h-4 w-4" />
            Nueva Cuenta / Billetera
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {db.cuentas.map((c) => {
            const movsCuenta = db.transacciones.filter(
              (t) => t.cuenta_id === c.id || t.cuenta_destino_id === c.id
            ).length;

            return (
              <div
                key={c.id}
                className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 flex flex-col justify-between shadow-lg"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="rounded-lg bg-slate-800 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-300">
                      {c.tipo.replace('_', ' ')} · {c.moneda}
                    </span>
                    {c.tipo === 'tarjeta_credito' ? (
                      <CreditCard className="h-4 w-4 text-indigo-400" />
                    ) : c.tipo === 'inversion' ? (
                      <TrendingUp className="h-4 w-4 text-amber-400" />
                    ) : (
                      <Landmark className="h-4 w-4 text-emerald-400" />
                    )}
                  </div>

                  <h3 className="mt-3 text-sm font-bold text-slate-100">{c.nombre}</h3>
                  <p className="text-xs text-slate-400">{c.institucion}</p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-1.5">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[11px] text-slate-400">Saldo Base Inicial:</span>
                    <input
                      type="number"
                      step="100"
                      value={c.saldo_inicial}
                      onChange={(e) =>
                        onUpdateSaldoInicialCuenta(c.id, Number(e.target.value) || 0)
                      }
                      className="w-28 rounded bg-slate-950 border border-slate-800 px-2 py-0.5 text-right text-xs font-semibold text-slate-200"
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-slate-500">
                    <span>Movimientos vinculados:</span>
                    <span className="text-slate-300 font-medium">{movsCuenta} registros</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Sección 2: Presupuestos Mensuales y Alertas de Desvío */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Target className="h-5 w-5 text-amber-400" />
              Presupuestos y Metas Mensuales por Categoría ({MESES_NOMBRES[selectedMonth - 1]} {selectedYear})
            </h2>
            <p className="text-xs text-slate-400">
              Compara tus límites mensuales contra el gasto devengado real del mes seleccionado.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200"
            >
              {MESES_NOMBRES.map((m, idx) => (
                <option key={m} value={idx + 1}>
                  {m} {selectedYear}
                </option>
              ))}
            </select>

            <button
              onClick={() => setShowBudgetModal(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-3.5 py-1.5 text-xs font-bold text-slate-950 hover:bg-amber-400 transition"
            >
              <Plus className="h-4 w-4" />
              Definir Presupuesto
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {ejecucionPresupuestos.map((b) => {
            const excedido = b.pct > 100;
            const alerta = b.pct >= b.umbral_alerta_pct && !excedido;

            return (
              <div
                key={b.id}
                className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-100">{b.categoriaNombre}</span>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                      excedido
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                        : alerta
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    }`}
                  >
                    {excedido ? (
                      <>
                        <AlertTriangle className="h-3 w-3" />
                        Excedido ({b.pct.toFixed(0)}%)
                      </>
                    ) : alerta ? (
                      <>
                        <AlertTriangle className="h-3 w-3" />
                        Precaución ({b.pct.toFixed(0)}%)
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-3 w-3" />
                        En meta ({b.pct.toFixed(0)}%)
                      </>
                    )}
                  </span>
                </div>

                <div className="h-2.5 w-full rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      excedido ? 'bg-rose-500' : alerta ? 'bg-amber-500' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(2, b.pct))}%` }}
                  />
                </div>

                <div className="flex justify-between text-xs text-slate-400">
                  <span>
                    Consumido: <strong className="text-slate-200">{formatMoney(b.gastado, b.moneda)}</strong>
                  </span>
                  <span>
                    Tope mensual: <strong className="text-slate-200">{formatMoney(b.monto_limite, b.moneda)}</strong>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal Nueva Cuenta */}
      {showWalletModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleSaveWallet}
            className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl space-y-4"
          >
            <h3 className="text-base font-bold text-slate-100">Agregar Nueva Billetera / Cuenta</h3>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Nombre</label>
              <input
                type="text"
                required
                value={wNombre}
                onChange={(e) => setWNombre(e.target.value)}
                placeholder="Ej: Mercado Pago, Brubank USD, Efectivo..."
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Tipo</label>
                <select
                  value={wTipo}
                  onChange={(e) => setWTipo(e.target.value as TipoCuenta)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                >
                  <option value="banco">Banco</option>
                  <option value="billetera_virtual">Billetera Virtual</option>
                  <option value="efectivo">Efectivo</option>
                  <option value="tarjeta_credito">Tarjeta de Crédito</option>
                  <option value="inversion">Inversión / Broker</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Moneda</label>
                <select
                  value={wMoneda}
                  onChange={(e) => setWMoneda(e.target.value as Moneda)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                >
                  <option value="ARS">ARS ($)</option>
                  <option value="USD">USD (US$)</option>
                  <option value="EUR">EUR (€)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Saldo Inicial
              </label>
              <input
                type="number"
                step="0.01"
                value={wSaldoInicial}
                onChange={(e) => setWSaldoInicial(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowWalletModal(false)}
                className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-medium text-slate-300"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950"
              >
                Crear Cuenta
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Nuevo Presupuesto */}
      {showBudgetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleSaveBudget}
            className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl space-y-4"
          >
            <h3 className="text-base font-bold text-slate-100">Definir Tope Presupuestario</h3>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Categoría</label>
              <select
                value={bCatId}
                onChange={(e) => setBCatId(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
              >
                {db.categorias
                  .filter((c) => c.tipo !== 'ingreso')
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Límite Mensual
                </label>
                <input
                  type="number"
                  step="100"
                  required
                  value={bLimite}
                  onChange={(e) => setBLimite(e.target.value)}
                  placeholder="500000"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Moneda</label>
                <select
                  value={bMoneda}
                  onChange={(e) => setBMoneda(e.target.value as Moneda)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                >
                  <option value="ARS">ARS ($)</option>
                  <option value="USD">USD (US$)</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowBudgetModal(false)}
                className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-medium text-slate-300"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950"
              >
                Guardar Presupuesto
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
