import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  HandCoins,
  Plus,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  AppDatabase,
  GastoCompartido,
  GrupoSplitwise,
  LiquidacionSplitwise,
  MetodoDivision,
  Moneda,
} from '../types';
import {
  calcularDivisionesGasto,
  calcularSaldosGrupo,
  simplificarDeudasGrupo,
} from '../lib/splitwiseEngine';
import { formatMoney } from '../lib/storage';

interface SplitwiseTabProps {
  db: AppDatabase;
  onAddGrupo: (grupo: GrupoSplitwise) => void;
  onAddMiembroGrupo: (grupoId: string, nombre: string) => void;
  onAddGastoCompartido: (grupoId: string, gasto: GastoCompartido) => void;
  onDeleteGastoCompartido: (grupoId: string, gastoId: string) => void;
  onAddLiquidacion: (grupoId: string, liq: LiquidacionSplitwise) => void;
}

export const SplitwiseTab: React.FC<SplitwiseTabProps> = ({
  db,
  onAddGrupo,
  onAddMiembroGrupo,
  onAddGastoCompartido,
  onDeleteGastoCompartido,
  onAddLiquidacion,
}) => {
  const [selectedGrupoId, setSelectedGrupoId] = useState<string>(
    db.gruposSplitwise[0]?.id ?? ''
  );

  // Modal Nuevo Grupo
  const [showNewGroupModal, setShowNewGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [newGroupCurrency, setNewGroupCurrency] = useState<Moneda>('ARS');
  const [newGroupMembersStr, setNewGroupMembersStr] = useState('Gonza, Flor');

  // Modal Agregar Miembro
  const [newMemberName, setNewMemberName] = useState('');

  // Modal Nuevo Gasto Splitwise
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expDesc, setExpDesc] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expCurrency, setExpCurrency] = useState<Moneda>('USD');
  const [expDate, setExpDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expPayerId, setExpPayerId] = useState<string>('');
  const [expWalletId, setExpWalletId] = useState<string>('');
  const [expSplitMethod, setExpSplitMethod] = useState<MetodoDivision>('equitativo');
  const [memberInputs, setMemberInputs] = useState<
    Record<
      string,
      {
        incluido: boolean;
        montoExacto: string;
        porcentaje: string;
        partes: string;
        ajusteExtra: string;
      }
    >
  >({});

  // Modal Saldar Cuentas (Liquidación)
  const [showSettleModal, setShowSettleModal] = useState(false);
  const [settleDeudorId, setSettleDeudorId] = useState('');
  const [settleAcreedorId, setSettleAcreedorId] = useState('');
  const [settleMonto, setSettleMonto] = useState('');
  const [settleMoneda, setSettleMoneda] = useState<Moneda>('USD');
  const [settleCuentaId, setSettleCuentaId] = useState<string>('');

  const grupoActual = useMemo(() => {
    return (
      db.gruposSplitwise.find((g) => g.id === selectedGrupoId) ?? db.gruposSplitwise[0]
    );
  }, [db.gruposSplitwise, selectedGrupoId]);

  const saldosGrupo = useMemo(() => {
    if (!grupoActual) return [];
    return calcularSaldosGrupo(grupoActual);
  }, [grupoActual]);

  const transferenciasSugeridas = useMemo(() => {
    return simplificarDeudasGrupo(saldosGrupo);
  }, [saldosGrupo]);

  // Saldo unificado convertido a USD o ARS usando Dólar MEP
  const saldoConsolidadoUsd = useMemo(() => {
    if (!grupoActual) return [];
    const mep = db.cotizaciones.dolarMep || 1423.6;
    return grupoActual.miembros.map((m) => {
      const misSaldos = saldosGrupo.filter((s) => s.miembroId === m.id);
      let netoUsd = 0;
      misSaldos.forEach((s) => {
        if (s.moneda === 'USD') netoUsd += s.saldoNeto;
        else if (s.moneda === 'ARS') netoUsd += s.saldoNeto / mep;
        else netoUsd += s.saldoNeto;
      });
      return {
        miembroId: m.id,
        nombre: m.nombre_display,
        netoUsd: Number(netoUsd.toFixed(2)),
        netoArs: Number((netoUsd * mep).toFixed(0)),
      };
    });
  }, [grupoActual, saldosGrupo, db.cotizaciones.dolarMep]);

  const openNewExpenseModal = () => {
    if (!grupoActual) return;
    setExpCurrency(grupoActual.moneda_principal);
    setExpPayerId(grupoActual.miembros[0]?.id ?? '');
    const defaultWallet =
      db.cuentas.find((c) => c.moneda === grupoActual.moneda_principal)?.id ??
      db.cuentas[0]?.id ??
      '';
    setExpWalletId(defaultWallet);

    const initInputs: typeof memberInputs = {};
    const eqPct = (100 / Math.max(1, grupoActual.miembros.length)).toFixed(2);
    grupoActual.miembros.forEach((m) => {
      initInputs[m.id] = {
        incluido: true,
        montoExacto: '',
        porcentaje: String(m.porcentaje_defecto ?? eqPct),
        partes: '1',
        ajusteExtra: '0',
      };
    });
    setMemberInputs(initInputs);
    setShowExpenseModal(true);
  };

  const previewDivisiones = useMemo(() => {
    if (!grupoActual) return [];
    const numTotal = Number(expAmount.replace(',', '.')) || 0;
    return calcularDivisionesGasto({
      montoTotal: numTotal,
      metodo: expSplitMethod,
      participantes: grupoActual.miembros.map((m) => {
        const inp = memberInputs[m.id] ?? {
          incluido: true,
          montoExacto: '0',
          porcentaje: '50',
          partes: '1',
          ajusteExtra: '0',
        };
        return {
          miembroId: m.id,
          nombre: m.nombre_display,
          incluido: inp.incluido,
          montoExacto: Number(inp.montoExacto) || 0,
          porcentaje: Number(inp.porcentaje) || 0,
          partes: Number(inp.partes) || 1,
          ajusteExtra: Number(inp.ajusteExtra) || 0,
        };
      }),
    });
  }, [grupoActual, expAmount, expSplitMethod, memberInputs]);

  const handleSaveExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!grupoActual) return;
    const total = Number(expAmount.replace(',', '.')) || 0;
    if (total <= 0 || !expDesc.trim()) return;

    const pagador =
      grupoActual.miembros.find((m) => m.id === expPayerId) ?? grupoActual.miembros[0];
    if (!pagador) return;

    const catViajes =
      db.categorias.find((c) => c.nombre.toLowerCase().includes('viaje'))?.id ??
      db.categorias[1]?.id ??
      null;

    const nuevoGasto: GastoCompartido = {
      id: `gasto-split-${Date.now()}`,
      grupo_id: grupoActual.id,
      descripcion: expDesc.trim(),
      monto_total: total,
      moneda: expCurrency,
      fecha: expDate,
      categoria_id: catViajes,
      metodo_division: expSplitMethod,
      notas: `División: ${expSplitMethod}`,
      origen_migracion: 'Splitwise Web',
      pagadores: [
        {
          id: `pag-${Date.now()}`,
          miembro_id: pagador.id,
          nombre_pagador: pagador.nombre_display,
          monto_pagado: total,
          cuenta_origen_id: expWalletId || null,
        },
      ],
      divisiones: previewDivisiones,
    };

    onAddGastoCompartido(grupoActual.id, nuevoGasto);
    setExpDesc('');
    setExpAmount('');
    setShowExpenseModal(false);
  };

  const handleOpenSettleFromSuggestion = (
    deudorId: string,
    acreedorId: string,
    monto: number,
    moneda: Moneda
  ) => {
    setSettleDeudorId(deudorId);
    setSettleAcreedorId(acreedorId);
    setSettleMonto(String(monto));
    setSettleMoneda(moneda);
    const defaultCuenta =
      db.cuentas.find((c) => c.moneda === moneda)?.id ?? db.cuentas[0]?.id ?? '';
    setSettleCuentaId(defaultCuenta);
    setShowSettleModal(true);
  };

  const handleSaveSettle = (e: React.FormEvent) => {
    e.preventDefault();
    if (!grupoActual) return;
    const numMonto = Number(settleMonto.replace(',', '.')) || 0;
    if (numMonto <= 0) return;

    const deudor = grupoActual.miembros.find((m) => m.id === settleDeudorId);
    const acreedor = grupoActual.miembros.find((m) => m.id === settleAcreedorId);
    if (!deudor || !acreedor || deudor.id === acreedor.id) return;

    const liq: LiquidacionSplitwise = {
      id: `liq-${Date.now()}`,
      grupo_id: grupoActual.id,
      deudor_miembro_id: deudor.id,
      deudor_nombre: deudor.nombre_display,
      acreedor_miembro_id: acreedor.id,
      acreedor_nombre: acreedor.nombre_display,
      monto: numMonto,
      moneda: settleMoneda,
      cuenta_origen_id: settleCuentaId || null,
      cuenta_destino_id: settleCuentaId || null,
      fecha: new Date().toISOString().slice(0, 10),
      notas: `Liquidación de saldo en ${grupoActual.nombre}`,
    };

    onAddLiquidacion(grupoActual.id, liq);
    setShowSettleModal(false);
  };

  const handleCreateGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    const gid = `grupo-${Date.now()}`;
    const nombres = newGroupMembersStr
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (nombres.length === 0) nombres.push('Gonza');

    const pct = Number((100 / nombres.length).toFixed(2));
    const miembros = nombres.map((n, idx) => ({
      id: `miembro-${gid}-${idx}`,
      grupo_id: gid,
      nombre_display: n,
      rol: (idx === 0 ? 'admin' : 'miembro') as 'admin' | 'miembro',
      porcentaje_defecto: pct,
    }));

    const nuevo: GrupoSplitwise = {
      id: gid,
      nombre: newGroupName.trim(),
      descripcion: newGroupDesc.trim() || 'Espacio de gastos compartidos',
      tipo_grupo: 'viaje',
      moneda_principal: newGroupCurrency,
      simplificar_deudas: true,
      icono: 'Users',
      color: '#ec4899',
      miembros,
      gastos: [],
      liquidaciones: [],
    };

    onAddGrupo(nuevo);
    setSelectedGrupoId(gid);
    setNewGroupName('');
    setNewGroupDesc('');
    setShowNewGroupModal(false);
  };

  return (
    <div className="space-y-6">
      {/* Selector de Grupos Splitwise + Acciones Principales */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-pink-500/30 bg-slate-900/70 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {db.gruposSplitwise.map((g) => (
            <button
              key={g.id}
              onClick={() => setSelectedGrupoId(g.id)}
              className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                grupoActual?.id === g.id
                  ? 'bg-pink-500 text-slate-950 shadow-lg shadow-pink-500/20'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Users className="h-4 w-4" />
              <span>{g.nombre}</span>
              <span className="rounded-full bg-slate-950/30 px-1.5 py-0.5 text-[10px]">
                {g.gastos.length}
              </span>
            </button>
          ))}

          <button
            onClick={() => setShowNewGroupModal(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-slate-700 px-3 py-2 text-xs font-medium text-slate-400 hover:border-pink-500 hover:text-pink-300 transition"
          >
            <Plus className="h-3.5 w-3.5" />
            Nuevo Grupo / Amigo 1-a-1
          </button>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => {
              if (!grupoActual) return;
              setSettleDeudorId(grupoActual.miembros[0]?.id ?? '');
              setSettleAcreedorId(grupoActual.miembros[1]?.id ?? '');
              setSettleMoneda(grupoActual.moneda_principal);
              setSettleMonto('');
              setShowSettleModal(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-800 border border-slate-700 px-3.5 py-2 text-xs font-semibold text-emerald-300 hover:bg-slate-700 transition"
          >
            <HandCoins className="h-4 w-4" />
            Saldar Cuentas
          </button>

          <button
            onClick={openNewExpenseModal}
            className="inline-flex items-center gap-1.5 rounded-xl bg-pink-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-pink-400 transition shadow-lg shadow-pink-500/20"
          >
            <Plus className="h-4 w-4" />
            Añadir Gasto Compartido
          </button>
        </div>
      </div>

      {grupoActual && (
        <>
          {/* Panel de Saldos ("Quién le debe a quién") y Simplificación */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Tarjeta 1: Quién le debe a quién (Deudas Simplificadas) */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-pink-400" />
                  Quién le debe a quién (Por Moneda)
                </h3>
                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                  Deudas Simplificadas
                </span>
              </div>

              {transferenciasSugeridas.length === 0 ? (
                <div className="rounded-xl bg-emerald-950/30 border border-emerald-500/30 p-4 text-center text-xs text-emerald-300 flex items-center justify-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  ¡Todas las cuentas están al día!
                </div>
              ) : (
                <div className="space-y-2.5">
                  {transferenciasSugeridas.map((t, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/80 p-3"
                    >
                      <div className="text-xs">
                        <div className="flex items-center gap-1.5 font-semibold text-slate-200">
                          <span className="text-rose-400">{t.deudorNombre}</span>
                          <ArrowRight className="h-3.5 w-3.5 text-slate-500" />
                          <span className="text-emerald-400">{t.acreedorNombre}</span>
                        </div>
                        <div className="mt-0.5 text-sm font-bold text-slate-100">
                          {formatMoney(t.monto, t.moneda, t.moneda === 'USD' ? 2 : 0)}
                        </div>
                      </div>

                      <button
                        onClick={() =>
                          handleOpenSettleFromSuggestion(
                            t.deudorId,
                            t.acreedorId,
                            t.monto,
                            t.moneda
                          )
                        }
                        className="rounded-lg bg-emerald-500/20 border border-emerald-500/40 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500 hover:text-slate-950 transition"
                      >
                        Saldar
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Tarjeta 2: Desglose de Pagos y Consumos por Miembro y Moneda */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
              <h3 className="text-sm font-bold text-slate-100">
                Resumen por Participante y Moneda
              </h3>
              <div className="space-y-2.5">
                {saldosGrupo.map((s, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-3 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between font-semibold">
                      <span className="text-slate-200">
                        {s.nombre}{' '}
                        <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
                          {s.moneda}
                        </span>
                      </span>
                      <span
                        className={
                          s.saldoNeto >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'
                        }
                      >
                        {s.saldoNeto >= 0 ? 'Le deben ' : 'Debe '}
                        {formatMoney(Math.abs(s.saldoNeto), s.moneda, s.moneda === 'USD' ? 2 : 0)}
                      </span>
                    </div>
                    <div className="flex justify-between text-[11px] text-slate-400">
                      <span>Pagó: {formatMoney(s.totalPagado, s.moneda, s.moneda === 'USD' ? 2 : 0)}</span>
                      <span>Su parte: {formatMoney(s.totalConsumido, s.moneda, s.moneda === 'USD' ? 2 : 0)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Tarjeta 3: Balance Consolidado Unificado (USD + ARS convertidos a MEP) + Miembros */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-100">
                  Balance Consolidado Unificado (TC MEP ${db.cotizaciones.dolarMep})
                </h3>
                <p className="text-[11px] text-slate-400">
                  Unifica los saldos en USD y ARS en una sola cifra neta
                </p>
              </div>

              <div className="space-y-2">
                {saldoConsolidadoUsd.map((c) => (
                  <div
                    key={c.miembroId}
                    className="flex items-center justify-between rounded-xl bg-slate-950/70 border border-slate-800 px-3 py-2 text-xs"
                  >
                    <span className="font-semibold text-slate-200">{c.nombre}</span>
                    <div className="text-right">
                      <div
                        className={`font-bold ${
                          c.netoUsd >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {c.netoUsd >= 0 ? '+' : ''}
                        {formatMoney(c.netoUsd, 'USD', 2)}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        Eq. {formatMoney(c.netoArs, 'ARS', 0)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Agregar participante rápido */}
              <div className="pt-2 border-t border-slate-800 flex items-center gap-2">
                <input
                  type="text"
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  placeholder="Agregar amigo al grupo..."
                  className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-100"
                />
                <button
                  onClick={() => {
                    if (!newMemberName.trim()) return;
                    onAddMiembroGrupo(grupoActual.id, newMemberName.trim());
                    setNewMemberName('');
                  }}
                  className="inline-flex items-center gap-1 rounded-xl bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Sumar
                </button>
              </div>
            </div>
          </div>

          {/* Lista de Gastos Compartidos del Grupo */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-xl">
            <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-100">
                  Historial de Gastos en {grupoActual.nombre} ({grupoActual.gastos.length})
                </h3>
                <p className="text-xs text-slate-400">
                  Cada gasto listado aquí impacta automáticamente tu parte proporcional en el módulo de Finanzas.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto max-h-[520px]">
              <table className="w-full border-collapse text-left text-xs">
                <thead className="sticky top-0 z-10 bg-slate-950 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Fecha</th>
                    <th className="px-4 py-3 font-semibold">Descripción</th>
                    <th className="px-4 py-3 font-semibold">Pagó</th>
                    <th className="px-4 py-3 font-semibold">Método División</th>
                    <th className="px-4 py-3 text-right font-semibold">Total Gasto</th>
                    <th className="px-4 py-3 text-right font-semibold">Desglose Participantes</th>
                    <th className="px-3 py-3 text-center font-semibold">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {grupoActual.gastos.map((g) => {
                    const pagadorStr = g.pagadores
                      .map((p) => `${p.nombre_pagador} (${formatMoney(p.monto_pagado, g.moneda, g.moneda === 'USD' ? 2 : 0)})`)
                      .join(', ');

                    const divStr = g.divisiones
                      .map(
                        (d) =>
                          `${d.nombre_participante}: ${formatMoney(
                            d.monto_debido,
                            g.moneda,
                            g.moneda === 'USD' ? 2 : 0
                          )}`
                      )
                      .join(' · ');

                    return (
                      <tr key={g.id} className="hover:bg-slate-800/40 transition">
                        <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap">{g.fecha}</td>
                        <td className="px-4 py-2.5 font-semibold text-slate-100">{g.descripcion}</td>
                        <td className="px-4 py-2.5">
                          <span className="rounded-lg bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
                            {pagadorStr}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-slate-400 capitalize">{g.metodo_division}</td>
                        <td className="px-4 py-2.5 text-right font-bold text-slate-100 whitespace-nowrap">
                          {formatMoney(g.monto_total, g.moneda, g.moneda === 'USD' ? 2 : 0)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-slate-300">{divStr}</td>
                        <td className="px-3 py-2.5 text-center">
                          <button
                            onClick={() => onDeleteGastoCompartido(grupoActual.id, g.id)}
                            className="rounded-lg p-1 text-slate-500 hover:bg-rose-500/20 hover:text-rose-400 transition"
                            title="Eliminar gasto compartido"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Modal Añadir Gasto Compartido (con los 5 métodos de Splitwise) */}
      {showExpenseModal && grupoActual && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleSaveExpense}
            className="w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-100">
                Nuevo Gasto Compartido en {grupoActual.nombre}
              </h3>
              <span className="rounded-full bg-pink-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-pink-300">
                Sincronización Automática con Finanzas
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Descripción del gasto
                </label>
                <input
                  type="text"
                  required
                  value={expDesc}
                  onChange={(e) => setExpDesc(e.target.value)}
                  placeholder="Ej: Cena en restaurante, Hotel, Supermercado..."
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Fecha</label>
                <input
                  type="date"
                  required
                  value={expDate}
                  onChange={(e) => setExpDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Monto Total
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={expAmount}
                  onChange={(e) => setExpAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Moneda</label>
                <select
                  value={expCurrency}
                  onChange={(e) => setExpCurrency(e.target.value as Moneda)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                >
                  <option value="USD">USD (Dólares)</option>
                  <option value="ARS">ARS (Pesos)</option>
                  <option value="EUR">EUR (Euros)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  ¿Quién pagó la cuenta?
                </label>
                <select
                  value={expPayerId}
                  onChange={(e) => setExpPayerId(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-emerald-300"
                >
                  {grupoActual.miembros.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nombre_display}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Billetera Personal de origen (si pagaste vos, descuenta el saldo de esta cuenta)
              </label>
              <select
                value={expWalletId}
                onChange={(e) => setExpWalletId(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200"
              >
                {db.cuentas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} ({c.moneda})
                  </option>
                ))}
              </select>
            </div>

            {/* Selector de los 5 Métodos de División de Splitwise */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Método de División (Splitwise)
              </label>
              <div className="grid grid-cols-5 gap-1.5">
                {(
                  [
                    { id: 'equitativo', label: '= Equitativo' },
                    { id: 'monto_exacto', label: '$ Exacto' },
                    { id: 'porcentual', label: '% Porcentaje' },
                    { id: 'partes', label: 'Shares/Partes' },
                    { id: 'ajuste', label: '+/- Ajuste' },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setExpSplitMethod(m.id)}
                    className={`rounded-xl py-2 px-1 text-[11px] font-semibold border transition ${
                      expSplitMethod === m.id
                        ? 'bg-pink-500/20 border-pink-500 text-pink-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Configuración por participante y previsualización en tiempo real */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 space-y-2">
              <div className="text-xs font-semibold text-slate-300 mb-2">
                Participantes y cálculo en tiempo real:
              </div>
              {grupoActual.miembros.map((m) => {
                const inp = memberInputs[m.id] ?? {
                  incluido: true,
                  montoExacto: '',
                  porcentaje: '50',
                  partes: '1',
                  ajusteExtra: '0',
                };
                const calc = previewDivisiones.find((d) => d.miembro_id === m.id);

                return (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-900 last:border-0"
                  >
                    <label className="flex items-center gap-2 text-xs font-medium text-slate-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={inp.incluido}
                        onChange={(e) =>
                          setMemberInputs((prev) => ({
                            ...prev,
                            [m.id]: { ...inp, incluido: e.target.checked },
                          }))
                        }
                        className="rounded border-slate-700 text-pink-500"
                      />
                      <span>{m.nombre_display}</span>
                    </label>

                    {inp.incluido && expSplitMethod !== 'equitativo' && (
                      <div className="flex items-center gap-1.5">
                        {expSplitMethod === 'monto_exacto' && (
                          <input
                            type="number"
                            step="0.01"
                            value={inp.montoExacto}
                            onChange={(e) =>
                              setMemberInputs((prev) => ({
                                ...prev,
                                [m.id]: { ...inp, montoExacto: e.target.value },
                              }))
                            }
                            placeholder="Monto $"
                            className="w-24 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-right text-xs text-slate-100"
                          />
                        )}
                        {expSplitMethod === 'porcentual' && (
                          <input
                            type="number"
                            step="0.1"
                            value={inp.porcentaje}
                            onChange={(e) =>
                              setMemberInputs((prev) => ({
                                ...prev,
                                [m.id]: { ...inp, porcentaje: e.target.value },
                              }))
                            }
                            placeholder="%"
                            className="w-20 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-right text-xs text-slate-100"
                          />
                        )}
                        {expSplitMethod === 'partes' && (
                          <input
                            type="number"
                            step="0.5"
                            value={inp.partes}
                            onChange={(e) =>
                              setMemberInputs((prev) => ({
                                ...prev,
                                [m.id]: { ...inp, partes: e.target.value },
                              }))
                            }
                            placeholder="Partes"
                            className="w-20 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-right text-xs text-slate-100"
                          />
                        )}
                        {expSplitMethod === 'ajuste' && (
                          <input
                            type="number"
                            step="0.01"
                            value={inp.ajusteExtra}
                            onChange={(e) =>
                              setMemberInputs((prev) => ({
                                ...prev,
                                [m.id]: { ...inp, ajusteExtra: e.target.value },
                              }))
                            }
                            placeholder="+/- Extra"
                            className="w-24 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-right text-xs text-slate-100"
                          />
                        )}
                      </div>
                    )}

                    <div className="text-xs font-bold text-pink-300 min-w-[90px] text-right">
                      {inp.incluido
                        ? formatMoney(calc?.monto_debido ?? 0, expCurrency, 2)
                        : 'No participa'}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowExpenseModal(false)}
                className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-medium text-slate-300"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-xl bg-pink-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-pink-400"
              >
                Guardar y Sincronizar con Finanzas
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Saldar Cuentas (Liquidación) */}
      {showSettleModal && grupoActual && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleSaveSettle}
            className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl space-y-4"
          >
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <HandCoins className="h-5 w-5 text-emerald-400" />
              Saldar Deuda en {grupoActual.nombre}
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Quién paga (Deudor)
                </label>
                <select
                  value={settleDeudorId}
                  onChange={(e) => setSettleDeudorId(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                >
                  {grupoActual.miembros.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nombre_display}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Quién recibe (Acreedor)
                </label>
                <select
                  value={settleAcreedorId}
                  onChange={(e) => setSettleAcreedorId(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                >
                  {grupoActual.miembros.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nombre_display}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Monto</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={settleMonto}
                  onChange={(e) => setSettleMonto(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Moneda</label>
                <select
                  value={settleMoneda}
                  onChange={(e) => setSettleMoneda(e.target.value as Moneda)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                >
                  <option value="USD">USD</option>
                  <option value="ARS">ARS</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Billetera Personal donde impacta la transferencia
              </label>
              <select
                value={settleCuentaId}
                onChange={(e) => setSettleCuentaId(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200"
              >
                {db.cuentas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} ({c.moneda})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowSettleModal(false)}
                className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-medium text-slate-300"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-400"
              >
                Confirmar Liquidación
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Nuevo Grupo */}
      {showNewGroupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleCreateGroup}
            className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl space-y-4"
          >
            <h3 className="text-base font-bold text-slate-100">
              Crear Nuevo Grupo o Espacio Splitwise
            </h3>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Nombre del Grupo
              </label>
              <input
                type="text"
                required
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Ej: Convivencia Casa, Vacaciones Sur, Asado..."
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Participantes (separados por coma)
              </label>
              <input
                type="text"
                required
                value={newGroupMembersStr}
                onChange={(e) => setNewGroupMembersStr(e.target.value)}
                placeholder="Gonza, Flor, Facu"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Moneda Principal
              </label>
              <select
                value={newGroupCurrency}
                onChange={(e) => setNewGroupCurrency(e.target.value as Moneda)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
              >
                <option value="ARS">ARS ($ Pesos)</option>
                <option value="USD">USD (US$ Dólares)</option>
                <option value="EUR">EUR (€ Euros)</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewGroupModal(false)}
                className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-medium text-slate-300"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-xl bg-pink-500 px-4 py-2 text-xs font-bold text-slate-950"
              >
                Crear Grupo
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
