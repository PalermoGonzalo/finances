import React, { useEffect, useState } from 'react';
import {
  Building2,
  Cloud,
  KeyRound,
  LayoutDashboard,
  ListOrdered,
  Lock,
  LogIn,
  LogOut,
  ShieldCheck,
  Table,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import {
  AppDatabase,
  Cuenta,
  GastoCompartido,
  GrupoSplitwise,
  LiquidacionSplitwise,
  Presupuesto,
  Transaccion,
} from './types';
import {
  buildEmptyDatabase,
  clearLocalDatabaseCache,
  loadDatabaseFromLocal,
  recalculateAndNormalizeDatabase,
  saveDatabaseToLocal,
} from './lib/storage';
import {
  fetchDatabaseFromSupabase,
  getSupabaseClient,
  getSupabaseConfig,
  saveSupabaseConfigLocal,
} from './lib/supabase';
import { DashboardTab } from './components/DashboardTab';
import { MatrizGastosDiscTab } from './components/MatrizGastosDiscTab';
import { TransaccionesTab } from './components/TransaccionesTab';
import { HipotecarioTab } from './components/HipotecarioTab';
import { SplitwiseTab } from './components/SplitwiseTab';
import { CuentasPresupuestosTab } from './components/CuentasPresupuestosTab';
import { SupabaseModal } from './components/SupabaseModal';

type ActiveTab =
  | 'dashboard'
  | 'matriz'
  | 'transacciones'
  | 'hipotecario'
  | 'splitwise'
  | 'cuentas';

interface SessionUserInfo {
  id: string;
  email: string;
}

export function App() {
  const [db, setDb] = useState<AppDatabase>(() => buildEmptyDatabase());
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [selectedYear, setSelectedYear] = useState<number>(2025);
  const [showSupabaseModal, setShowSupabaseModal] = useState<boolean>(false);
  const [cloudConnected, setCloudConnected] = useState<boolean>(() => Boolean(getSupabaseConfig()));

  // Estado de autenticación obligatoria (Auth Gate)
  const [authChecking, setAuthChecking] = useState<boolean>(true);
  const [sessionUser, setSessionUser] = useState<SessionUserInfo | null>(null);
  const [loginEmail, setLoginEmail] = useState<string>('');
  const [loginPassword, setLoginPassword] = useState<string>('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginBusy, setLoginBusy] = useState<boolean>(false);

  // Configuración manual si aún no se inyectaron variables de entorno en local
  const [showManualConfig, setShowManualConfig] = useState<boolean>(() => !getSupabaseConfig());
  const [cfgUrl, setCfgUrl] = useState<string>(() => getSupabaseConfig()?.url ?? '');
  const [cfgAnonKey, setCfgAnonKey] = useState<string>(() => getSupabaseConfig()?.anonKey ?? '');
  const [cfgSchema, setCfgSchema] = useState<string>(() => getSupabaseConfig()?.schema ?? 'finanzas');

  // Hidratar datos desde Supabase únicamente cuando existe una sesión autenticada válida
  const hydrateAuthenticatedData = async (uid: string) => {
    const client = getSupabaseClient();
    if (!client || !uid) return;
    const localCached = loadDatabaseFromLocal();
    setDb(localCached);

    try {
      const remote = await fetchDatabaseFromSupabase(client);
      if (remote && ((remote.transacciones?.length ?? 0) > 0 || (remote.cuentas?.length ?? 0) > 0)) {
        setDb((prev) => {
          const merged = recalculateAndNormalizeDatabase({
            ...prev,
            ...remote,
            prestamoHipotecario: remote.prestamoHipotecario ?? prev.prestamoHipotecario,
            gruposSplitwise:
              remote.gruposSplitwise && remote.gruposSplitwise.length > 0
                ? remote.gruposSplitwise
                : prev.gruposSplitwise,
          });
          saveDatabaseToLocal(merged);
          return merged;
        });
      }
    } catch {
      // Mantiene datos cacheados de la sesión autenticada si hay corte de red temporal
    }
  };

  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) {
      setAuthChecking(false);
      return;
    }
    setCloudConnected(true);

    client.auth
      .getSession()
      .then(({ data }) => {
        const user = data.session?.user;
        if (user) {
          setSessionUser({ id: user.id, email: user.email ?? 'usuario' });
          hydrateAuthenticatedData(user.id);
        } else {
          setSessionUser(null);
          clearLocalDatabaseCache();
          setDb(buildEmptyDatabase());
        }
      })
      .finally(() => {
        setAuthChecking(false);
      });

    const { data: sub } = client.auth.onAuthStateChange((_event, session) => {
      const user = session?.user;
      if (user) {
        setSessionUser({ id: user.id, email: user.email ?? 'usuario' });
        hydrateAuthenticatedData(user.id);
      } else {
        setSessionUser(null);
        setDb(clearLocalDatabaseCache());
      }
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, [cloudConnected]);

  const handleGateLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    const client = getSupabaseClient();
    if (!client) {
      setLoginError('Configurá primero la URL y Anon Key del proyecto Supabase.');
      setShowManualConfig(true);
      return;
    }
    setLoginBusy(true);
    try {
      const { data, error } = await client.auth.signInWithPassword({
        email: loginEmail.trim(),
        password: loginPassword,
      });
      if (error) throw error;
      if (data.user) {
        setSessionUser({ id: data.user.id, email: data.user.email ?? loginEmail.trim() });
        setLoginPassword('');
        await hydrateAuthenticatedData(data.user.id);
      }
    } catch (err: unknown) {
      setLoginError(
        err instanceof Error ? err.message : 'Credenciales inválidas o usuario no autorizado.'
      );
    } finally {
      setLoginBusy(false);
    }
  };

  const handleSaveGateConfig = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cfgUrl.trim() || !cfgAnonKey.trim()) {
      setLoginError('Completá VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.');
      return;
    }
    saveSupabaseConfigLocal({
      url: cfgUrl.trim(),
      anonKey: cfgAnonKey.trim(),
      schema: cfgSchema.trim() || 'finanzas',
    });
    setCloudConnected(true);
    setShowManualConfig(false);
    setLoginError(null);
  };

  const handleSignOut = async () => {
    const client = getSupabaseClient();
    if (client) {
      await client.auth.signOut();
    }
    setSessionUser(null);
    setDb(clearLocalDatabaseCache());
  };

  const updateDb = (updater: (prev: AppDatabase) => AppDatabase) => {
    setDb((prev) => {
      const updated = recalculateAndNormalizeDatabase(updater(prev));
      if (sessionUser) {
        saveDatabaseToLocal(updated);
      }
      return updated;
    });
  };

  // Handler 1: Editar o insertar celda desde la Matriz Gastos Disc. / Ingresos
  const handleUpsertCellTransaction = (params: {
    anio: number;
    mes: number;
    seccion: string;
    rubro: string;
    monto: number;
    tipo: 'ingreso' | 'gasto';
  }) => {
    const { anio, mes, seccion, rubro, monto, tipo } = params;

    updateDb((prev) => {
      const filtradas = prev.transacciones.filter((t) => {
        const y = t.metadatos?.anio ?? Number(t.fecha.slice(0, 4));
        const m = t.metadatos?.mes ?? Number(t.fecha.slice(5, 7));
        const sec = t.metadatos?.seccion || (t.tipo === 'ingreso' ? 'Ingresos' : 'Otros Gastos');
        const rub = t.metadatos?.rubro_original || t.concepto;
        return !(y === anio && m === mes && sec === seccion && rub === rubro);
      });

      if (monto <= 0) {
        return { ...prev, transacciones: filtradas };
      }

      const cuentaDefault =
        prev.cuentas.find((c) =>
          seccion.toLowerCase().includes('visa | bbva')
            ? c.nombre.includes('BBVA')
            : seccion.toLowerCase().includes('visa | galicia')
              ? c.nombre.includes('Visa | Galicia')
              : seccion.toLowerCase().includes('mastercard')
                ? c.nombre.includes('Mastercard')
                : seccion.toLowerCase().includes('cabal')
                  ? c.nombre.includes('Cabal')
                  : seccion.toLowerCase().includes('efectivo')
                    ? c.tipo === 'efectivo'
                    : c.moneda === 'ARS'
        ) ?? prev.cuentas[0];

      const catDefault =
        prev.categorias.find((c) =>
          tipo === 'ingreso'
            ? c.tipo === 'ingreso'
            : seccion.includes('Hipotecario')
              ? c.nombre.includes('Hipotecario')
              : seccion.includes('Servicios')
                ? c.nombre.includes('Servicios')
                : c.tipo === 'gasto'
        ) ?? prev.categorias[0];

      const nuevaTx: Transaccion = {
        id: crypto.randomUUID(),
        cuenta_id: cuentaDefault?.id ?? null,
        cuenta_destino_id: null,
        tipo,
        concepto: `${rubro} (${seccion})`,
        monto,
        monto_caja: monto,
        moneda: 'ARS',
        fecha: `${anio}-${String(mes).padStart(2, '0')}-10`,
        categoria_id: catDefault?.id ?? null,
        condicion_fiscal: rubro.toLowerCase().includes('negro') ? 'negro' : 'blanco',
        estado_pago: 'pagado',
        es_recurrente: true,
        observaciones: `Actualizado en Matriz ${anio} · ${seccion}`,
        origen_hoja_excel: tipo === 'ingreso' ? 'Ingresos' : 'Gastos Disc.',
        metadatos: {
          anio,
          mes,
          seccion,
          rubro_original: rubro,
        },
      };

      const client = getSupabaseClient();
      if (client && sessionUser) {
        client
          .from('transacciones')
          .upsert({
            id: nuevaTx.id,
            user_id: sessionUser.id,
            cuenta_id: nuevaTx.cuenta_id,
            cuenta_destino_id: nuevaTx.cuenta_destino_id,
            tipo: nuevaTx.tipo,
            concepto: nuevaTx.concepto,
            monto: nuevaTx.monto,
            monto_caja: nuevaTx.monto_caja,
            moneda: nuevaTx.moneda,
            fecha: nuevaTx.fecha,
            categoria_id: nuevaTx.categoria_id,
            condicion_fiscal: nuevaTx.condicion_fiscal,
            estado_pago: nuevaTx.estado_pago,
            es_recurrente: nuevaTx.es_recurrente,
            observaciones: nuevaTx.observaciones,
            origen_hoja_excel: nuevaTx.origen_hoja_excel,
            metadatos: nuevaTx.metadatos,
          })
          .then(() => undefined, () => undefined);
      }

      return {
        ...prev,
        transacciones: [nuevaTx, ...filtradas],
      };
    });
  };

  // Handler 2: Alta y Baja de Transacciones manuales
  const handleAddTransaction = (txData: Omit<Transaccion, 'id'>) => {
    const newTx: Transaccion = {
      ...txData,
      id: crypto.randomUUID(),
    };
    updateDb((prev) => ({
      ...prev,
      transacciones: [newTx, ...prev.transacciones],
    }));

    const client = getSupabaseClient();
    if (client && sessionUser) {
      client
        .from('transacciones')
        .upsert({
          id: newTx.id,
          user_id: sessionUser.id,
          cuenta_id: newTx.cuenta_id,
          cuenta_destino_id: newTx.cuenta_destino_id,
          tipo: newTx.tipo,
          concepto: newTx.concepto,
          monto: newTx.monto,
          monto_caja: newTx.monto_caja,
          moneda: newTx.moneda,
          fecha: newTx.fecha,
          categoria_id: newTx.categoria_id,
          condicion_fiscal: newTx.condicion_fiscal,
          estado_pago: newTx.estado_pago,
          es_recurrente: newTx.es_recurrente,
          observaciones: newTx.observaciones,
          origen_hoja_excel: newTx.origen_hoja_excel ?? 'Web',
          metadatos: newTx.metadatos,
        })
        .then(() => undefined, () => undefined);
    }
  };

  const handleDeleteTransaction = (id: string) => {
    updateDb((prev) => ({
      ...prev,
      transacciones: prev.transacciones.filter((t) => t.id !== id),
    }));
    const client = getSupabaseClient();
    if (client && sessionUser) {
      client
        .from('transacciones')
        .delete()
        .eq('id', id)
        .eq('user_id', sessionUser.id)
        .then(() => undefined, () => undefined);
    }
  };

  // Handler 3: Actualizar Cuota de Crédito Hipotecario UVA + Reflejo en Transacciones
  const handleUpdateCuotaHipotecario = (
    numeroCuota: number,
    changes: {
      pagada: boolean;
      valor_uva: number | null;
      cotizacion_mep: number | null;
    }
  ) => {
    updateDb((prev) => {
      const nuevasCuotas = prev.prestamoHipotecario.cuotas.map((c) => {
        if (c.numero_cuota !== numeroCuota) return c;
        const uva = changes.valor_uva ?? c.valor_uva ?? prev.cotizaciones.valorUva;
        const mep = changes.cotizacion_mep ?? c.cotizacion_mep ?? prev.cotizaciones.dolarMep;
        const cuotaArs = Number((c.cuota_total_uva * uva).toFixed(2));
        const cuotaUsd = mep > 0 ? Number((cuotaArs / mep).toFixed(2)) : null;
        const deudaArs = Number((c.saldo_deuda_uva * uva).toFixed(2));
        const deudaUsd = mep > 0 ? Number((deudaArs / mep).toFixed(2)) : null;

        return {
          ...c,
          pagada: changes.pagada,
          valor_uva: uva,
          cotizacion_mep: mep,
          cuota_total_ars: cuotaArs,
          cuota_usd: cuotaUsd,
          deuda_ars: deudaArs,
          deuda_usd: deudaUsd,
        };
      });

      const cuotaModificada = nuevasCuotas.find((c) => c.numero_cuota === numeroCuota);
      let nuevasTx = [...prev.transacciones];

      if (cuotaModificada && cuotaModificada.pagada && cuotaModificada.cuota_total_ars) {
        const anio = Number(cuotaModificada.fecha_vencimiento.slice(0, 4));
        const mes = Number(cuotaModificada.fecha_vencimiento.slice(5, 7));
        const catHip =
          prev.categorias.find((cat) => cat.nombre.includes('Hipotecario'))?.id ?? null;
        const cuentaBanco = prev.cuentas.find((cta) => cta.moneda === 'ARS')?.id ?? null;

        nuevasTx = nuevasTx.filter((t) => {
          const y = t.metadatos?.anio ?? Number(t.fecha.slice(0, 4));
          const m = t.metadatos?.mes ?? Number(t.fecha.slice(5, 7));
          return !(y === anio && m === mes && t.metadatos?.seccion === 'Credito Hipotecario');
        });

        nuevasTx.unshift({
          id: crypto.randomUUID(),
          cuenta_id: cuentaBanco,
          cuenta_destino_id: null,
          tipo: 'gasto',
          concepto: `Cuota Crédito Hipotecario UVA ${cuotaModificada.etiqueta_cuota} (${String(mes).padStart(2, '0')}/${anio})`,
          monto: cuotaModificada.cuota_total_ars,
          monto_caja: cuotaModificada.cuota_total_ars,
          moneda: 'ARS',
          fecha: cuotaModificada.fecha_vencimiento,
          categoria_id: catHip,
          condicion_fiscal: 'blanco',
          estado_pago: 'pagado',
          es_recurrente: true,
          observaciones: `Cuota ${cuotaModificada.etiqueta_cuota} · ${cuotaModificada.cuota_total_uva} UVAs a $${cuotaModificada.valor_uva}`,
          origen_hoja_excel: 'Hipotecario',
          metadatos: {
            anio,
            mes,
            seccion: 'Credito Hipotecario',
            rubro_original: 'Crédito Hipotecario + Seguro',
            cuota_ars: cuotaModificada.cuota_total_ars,
            cuota_uva: cuotaModificada.cuota_total_uva,
          },
        });
      }

      return {
        ...prev,
        transacciones: nuevasTx,
        prestamoHipotecario: {
          ...prev.prestamoHipotecario,
          cuotas_pagadas: nuevasCuotas.filter((c) => c.pagada).length,
          cuotas: nuevasCuotas,
        },
      };
    });
  };

  // Handler 4: Splitwise (Grupos, Miembros, Gastos Compartidos y Liquidaciones)
  const handleAddGrupo = (grupo: GrupoSplitwise) => {
    updateDb((prev) => ({
      ...prev,
      gruposSplitwise: [...prev.gruposSplitwise, grupo],
    }));
  };

  const handleAddMiembroGrupo = (grupoId: string, nombre: string) => {
    updateDb((prev) => ({
      ...prev,
      gruposSplitwise: prev.gruposSplitwise.map((g) => {
        if (g.id !== grupoId) return g;
        return {
          ...g,
          miembros: [
            ...g.miembros,
            {
              id: crypto.randomUUID(),
              grupo_id: grupoId,
              nombre_display: nombre,
              rol: 'miembro',
              porcentaje_defecto: 50,
            },
          ],
        };
      }),
    }));
  };

  const handleAddGastoCompartido = (grupoId: string, gasto: GastoCompartido) => {
    updateDb((prev) => ({
      ...prev,
      gruposSplitwise: prev.gruposSplitwise.map((g) => {
        if (g.id !== grupoId) return g;
        return {
          ...g,
          gastos: [gasto, ...g.gastos],
        };
      }),
    }));
  };

  const handleDeleteGastoCompartido = (grupoId: string, gastoId: string) => {
    updateDb((prev) => ({
      ...prev,
      gruposSplitwise: prev.gruposSplitwise.map((g) => {
        if (g.id !== grupoId) return g;
        return {
          ...g,
          gastos: g.gastos.filter((x) => x.id !== gastoId),
        };
      }),
    }));
  };

  const handleAddLiquidacion = (grupoId: string, liq: LiquidacionSplitwise) => {
    updateDb((prev) => ({
      ...prev,
      gruposSplitwise: prev.gruposSplitwise.map((g) => {
        if (g.id !== grupoId) return g;
        return {
          ...g,
          liquidaciones: [liq, ...(g.liquidaciones ?? [])],
        };
      }),
    }));
  };

  // Handler 5: Cuentas y Presupuestos
  const handleAddCuenta = (c: Cuenta) => {
    updateDb((prev) => ({
      ...prev,
      cuentas: [...prev.cuentas, c],
    }));
  };

  const handleUpdateSaldoInicialCuenta = (cuentaId: string, nuevoSaldoInicial: number) => {
    updateDb((prev) => ({
      ...prev,
      cuentas: prev.cuentas.map((c) =>
        c.id === cuentaId ? { ...c, saldo_inicial: nuevoSaldoInicial } : c
      ),
    }));
  };

  const handleAddPresupuesto = (p: Presupuesto) => {
    updateDb((prev) => ({
      ...prev,
      presupuestos: [
        ...prev.presupuestos.filter(
          (x) =>
            !(
              x.categoria_id === p.categoria_id &&
              x.mes === p.mes &&
              x.anio === p.anio &&
              x.moneda === p.moneda
            )
        ),
        p,
      ],
    }));
  };

  const handleUpdateCotizaciones = (dolarMep: number, valorUva: number) => {
    updateDb((prev) => ({
      ...prev,
      cotizaciones: {
        ...prev.cotizaciones,
        dolarMep,
        valorUva,
      },
    }));
  };

  // =========================================================================
  // AUTH GATE OBLIGATORIO: Cero exposición de UI ni datos sin sesión activa
  // =========================================================================
  if (authChecking) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="h-10 w-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 animate-pulse">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <p className="text-xs font-semibold text-slate-400">
            Verificando sesión encriptada en Supabase (esquema <code>finanzas</code>)...
          </p>
        </div>
      </div>
    );
  }

  if (!sessionUser) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/90 p-6 shadow-2xl space-y-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-slate-950 shadow-lg shadow-emerald-500/20">
              <Lock className="h-5 w-5 stroke-[2.5]" />
            </div>
            <div>
              <h1 className="text-base font-extrabold tracking-tight text-slate-100">
                Finanzas & Splitwise Privado
              </h1>
              <p className="text-xs text-slate-400">
                Acceso restringido · <code>finanzas.gonpa.com.ar</code>
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-3 text-[11px] text-emerald-300/90 flex items-start gap-2">
            <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
            <span>
              Protegido con Row Level Security (<code>auth.uid()</code>) sobre el esquema aislado{' '}
              <code>finanzas</code>. Ningún dato financiero se incluye en el código estático público.
            </span>
          </div>

          {loginError && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-950/40 p-3 text-xs text-rose-300">
              {loginError}
            </div>
          )}

          <form onSubmit={handleGateLogin} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Email de tu cuenta Supabase
              </label>
              <input
                type="email"
                required
                autoComplete="username"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="tu@email.com"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-xs text-slate-100 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Contraseña
              </label>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-xs text-slate-100 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={loginBusy}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-bold text-slate-950 hover:bg-emerald-400 transition disabled:opacity-50"
            >
              <LogIn className="h-4 w-4" />
              <span>{loginBusy ? 'Autenticando...' : 'Iniciar Sesión Segura'}</span>
            </button>
          </form>

          {/* Configuración de entorno solo si aún no está inyectada en build */}
          <div className="border-t border-slate-800 pt-3">
            <button
              type="button"
              onClick={() => setShowManualConfig((v) => !v)}
              className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-slate-200"
            >
              <KeyRound className="h-3.5 w-3.5" />
              <span>
                {showManualConfig
                  ? 'Ocultar configuración de conexión Supabase'
                  : 'Configurar URL / Anon Key de Supabase manualmente'}
              </span>
            </button>

            {showManualConfig && (
              <form onSubmit={handleSaveGateConfig} className="mt-3 space-y-2.5 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    VITE_SUPABASE_URL
                  </label>
                  <input
                    type="text"
                    value={cfgUrl}
                    onChange={(e) => setCfgUrl(e.target.value)}
                    placeholder="https://xxxx.supabase.co"
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    VITE_SUPABASE_ANON_KEY
                  </label>
                  <input
                    type="password"
                    value={cfgAnonKey}
                    onChange={(e) => setCfgAnonKey(e.target.value)}
                    placeholder="eyJhbGci..."
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    VITE_SUPABASE_SCHEMA
                  </label>
                  <input
                    type="text"
                    value={cfgSchema}
                    onChange={(e) => setCfgSchema(e.target.value)}
                    placeholder="finanzas"
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-bold text-emerald-400"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700"
                >
                  Guardar Conexión
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  const navItems: { id: ActiveTab; label: string; badge?: string; icon: React.ReactNode }[] = [
    {
      id: 'dashboard',
      label: 'Dashboard & KPIs',
      icon: <LayoutDashboard className="h-4 w-4" />,
    },
    {
      id: 'matriz',
      label: 'Matriz Gastos Disc. & Ingresos',
      badge: 'Excel',
      icon: <Table className="h-4 w-4" />,
    },
    {
      id: 'hipotecario',
      label: 'Hipotecario UVA',
      badge: String(db.prestamoHipotecario.cuotas.length || 240),
      icon: <Building2 className="h-4 w-4" />,
    },
    {
      id: 'splitwise',
      label: 'Splitwise Compartidos',
      badge: String(
        db.gruposSplitwise.reduce((acc, g) => acc + g.gastos.length, 0)
      ),
      icon: <Users className="h-4 w-4" />,
    },
    {
      id: 'transacciones',
      label: 'Movimientos',
      badge: String(db.transacciones.length),
      icon: <ListOrdered className="h-4 w-4" />,
    },
    {
      id: 'cuentas',
      label: 'Billeteras & Metas',
      icon: <Wallet className="h-4 w-4" />,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Header */}
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 py-3 flex flex-wrap items-center justify-between gap-4">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-slate-950 shadow-lg shadow-emerald-500/20">
              <TrendingUp className="h-5 w-5 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-extrabold tracking-tight text-slate-100">
                  Finanzas & Splitwise
                </h1>
                <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                  {sessionUser.email}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Sesión autenticada RLS · Esquema aislado <code>finanzas</code>
              </p>
            </div>
          </div>

          {/* Cotizaciones Rápidas & Estado Supabase */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="hidden sm:flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/90 px-3 py-1.5 text-xs">
              <span className="text-slate-400">Dólar MEP:</span>
              <span className="font-bold text-emerald-400">
                $ {db.cotizaciones.dolarMep.toLocaleString('es-AR')}
              </span>
              <span className="text-slate-700">|</span>
              <span className="text-slate-400">UVA:</span>
              <span className="font-bold text-violet-300">
                $ {db.cotizaciones.valorUva.toLocaleString('es-AR')}
              </span>
            </div>

            <button
              onClick={() => setShowSupabaseModal(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 transition"
            >
              <Cloud className="h-4 w-4" />
              <span>Sincronizar / Seed</span>
            </button>

            <button
              onClick={handleSignOut}
              title="Cerrar sesión y limpiar caché local"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-slate-800 transition"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden md:inline">Salir</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="mx-auto max-w-7xl px-4 flex items-center gap-1.5 overflow-x-auto pb-2.5 pt-1">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold whitespace-nowrap transition ${
                  isActive
                    ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                    : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
                {item.badge && (
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                      isActive
                        ? 'bg-slate-950/25 text-slate-950'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        {activeTab === 'dashboard' && (
          <DashboardTab
            db={db}
            selectedYear={selectedYear}
            setSelectedYear={setSelectedYear}
            onNavigateTab={setActiveTab}
          />
        )}

        {activeTab === 'matriz' && (
          <MatrizGastosDiscTab
            db={db}
            selectedYear={selectedYear}
            setSelectedYear={setSelectedYear}
            onUpsertCellTransaction={handleUpsertCellTransaction}
          />
        )}

        {activeTab === 'hipotecario' && (
          <HipotecarioTab
            db={db}
            onUpdateCuotaHipotecario={handleUpdateCuotaHipotecario}
            onUpdateCotizaciones={handleUpdateCotizaciones}
          />
        )}

        {activeTab === 'splitwise' && (
          <SplitwiseTab
            db={db}
            onAddGrupo={handleAddGrupo}
            onAddMiembroGrupo={handleAddMiembroGrupo}
            onAddGastoCompartido={handleAddGastoCompartido}
            onDeleteGastoCompartido={handleDeleteGastoCompartido}
            onAddLiquidacion={handleAddLiquidacion}
          />
        )}

        {activeTab === 'transacciones' && (
          <TransaccionesTab
            db={db}
            selectedYear={selectedYear}
            setSelectedYear={setSelectedYear}
            onAddTransaction={handleAddTransaction}
            onDeleteTransaction={handleDeleteTransaction}
          />
        )}

        {activeTab === 'cuentas' && (
          <CuentasPresupuestosTab
            db={db}
            selectedYear={selectedYear}
            onAddCuenta={handleAddCuenta}
            onUpdateSaldoInicialCuenta={handleUpdateSaldoInicialCuenta}
            onAddPresupuesto={handleAddPresupuesto}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-4 text-center text-[11px] text-slate-500">
        <div className="mx-auto max-w-7xl px-4 flex flex-wrap items-center justify-between gap-2">
          <span>
            Finanzas Personales & Splitwise · Dominio: <strong>finanzas.gonpa.com.ar</strong>
          </span>
          <span>
            Esquema Supabase aislado: <code>finanzas.*</code> (RLS Estricto · Cero acceso anónimo)
          </span>
        </div>
      </footer>

      {/* Modal Supabase */}
      <SupabaseModal
        isOpen={showSupabaseModal}
        onClose={() => {
          setShowSupabaseModal(false);
          setCloudConnected(Boolean(getSupabaseConfig()));
        }}
        db={db}
        onReplaceDatabase={(remote) => {
          updateDb((prev) => ({
            ...prev,
            ...remote,
            prestamoHipotecario: remote.prestamoHipotecario ?? prev.prestamoHipotecario,
            gruposSplitwise:
              remote.gruposSplitwise && remote.gruposSplitwise.length > 0
                ? remote.gruposSplitwise
                : prev.gruposSplitwise,
          }));
        }}
        onSignOutPurge={() => {
          setSessionUser(null);
          setDb(clearLocalDatabaseCache());
          setShowSupabaseModal(false);
        }}
      />
    </div>
  );
}

export default App;
