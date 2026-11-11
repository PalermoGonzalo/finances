import {
  AppDatabase,
  Categoria,
  Cuenta,
  GrupoSplitwise,
  PrestamoHipotecario,
  Presupuesto,
  Transaccion,
} from '../types';
import {
  calcularSaldosCuentas,
  sincronizarSplitwiseEnTransacciones,
} from './splitwiseEngine';

const STORAGE_KEY = 'finanzas_gonpa_app_db_v2_auth';
const LEGACY_STORAGE_KEY = 'finanzas_gonpa_app_db_v1';

interface RawSeedShape {
  cuentas: Cuenta[];
  categorias: Categoria[];
  transacciones: Transaccion[];
  prestamo_hipotecario: PrestamoHipotecario;
  grupos_splitwise: GrupoSplitwise[];
}

export const CATEGORIAS_BASE: Categoria[] = [
  { id: 'c0000000-0000-4000-8000-000000000001', nombre: 'Sueldo y Honorarios', tipo: 'ingreso', icono: 'Briefcase', color: '#10b981', orden: 1 },
  { id: 'c0000000-0000-4000-8000-000000000002', nombre: 'Vivienda y Alquiler', tipo: 'gasto', icono: 'Home', color: '#3b82f6', orden: 2 },
  { id: 'c0000000-0000-4000-8000-000000000003', nombre: 'Crédito Hipotecario UVA', tipo: 'gasto', icono: 'Building2', color: '#6366f1', orden: 3 },
  { id: 'c0000000-0000-4000-8000-000000000004', nombre: 'Servicios del Hogar', tipo: 'gasto', icono: 'Zap', color: '#0ea5e9', orden: 4 },
  { id: 'c0000000-0000-4000-8000-000000000005', nombre: 'Salud y Prepaga', tipo: 'gasto', icono: 'HeartPulse', color: '#f43f5e', orden: 5 },
  { id: 'c0000000-0000-4000-8000-000000000006', nombre: 'Auto y Transporte', tipo: 'gasto', icono: 'Car', color: '#f97316', orden: 6 },
  { id: 'c0000000-0000-4000-8000-000000000007', nombre: 'Supermercado y Alimentación', tipo: 'gasto', icono: 'ShoppingCart', color: '#84cc16', orden: 7 },
  { id: 'c0000000-0000-4000-8000-000000000008', nombre: 'Salidas, Ocio y Regalos', tipo: 'gasto', icono: 'Utensils', color: '#ec4899', orden: 8 },
  { id: 'c0000000-0000-4000-8000-000000000009', nombre: 'Indumentaria y Compras', tipo: 'gasto', icono: 'ShoppingBag', color: '#a855f7', orden: 9 },
  { id: 'c0000000-0000-4000-8000-000000000010', nombre: 'Viajes y Vacaciones', tipo: 'gasto', icono: 'Plane', color: '#14b8a6', orden: 10 },
  { id: 'c0000000-0000-4000-8000-000000000011', nombre: 'Impuestos y Cargos Bancarios', tipo: 'gasto', icono: 'Landmark', color: '#64748b', orden: 11 },
  { id: 'c0000000-0000-4000-8000-000000000012', nombre: 'Obra y Refacciones', tipo: 'gasto', icono: 'Hammer', color: '#eab308', orden: 12 },
];

/**
 * Crea una estructura vacía sin datos personales ni montos sensibles.
 * Ningún dato financiero real viaja en el bundle estático JS de producción.
 */
export function buildEmptyDatabase(): AppDatabase {
  return {
    cuentas: [],
    categorias: CATEGORIAS_BASE,
    transacciones: [],
    prestamoHipotecario: {
      id: 'd0000000-0000-4000-8000-000000000001',
      nombre: 'Crédito Hipotecario UVA',
      tipo: 'hipotecario_uva',
      moneda_original: 'UVA',
      total_cuotas: 240,
      cuotas_pagadas: 0,
      monto_capital_total: 0,
      notas: '',
      activo: true,
      cuotas: [],
    },
    gruposSplitwise: [],
    presupuestos: [],
    cotizaciones: {
      dolarMep: 1423.6,
      valorUva: 1800.05,
      euroArs: 1540.0,
    },
    usuarioActualAlias: 'Gonza',
  };
}

/**
 * Parsea un archivo JSON local de semilla (`excel_seed.json`) subido explícitamente
 * por el usuario autenticado desde su equipo para sincronizarlo con Supabase.
 */
export function parseDatabaseFromSeedJson(rawJson: unknown): AppDatabase {
  const seed = rawJson as RawSeedShape;
  if (!seed || !Array.isArray(seed.transacciones) || !Array.isArray(seed.cuentas)) {
    throw new Error('El archivo JSON no tiene el formato esperado de semilla (cuentas, transacciones, prestamo_hipotecario).');
  }

  const cuentas: Cuenta[] = seed.cuentas.map((c) => ({
    ...c,
    saldo_actual: c.saldo_inicial,
  }));

  const categorias: Categoria[] = Array.isArray(seed.categorias) && seed.categorias.length > 0
    ? seed.categorias
    : CATEGORIAS_BASE;

  const prestamoHipotecario: PrestamoHipotecario = seed.prestamo_hipotecario ?? buildEmptyDatabase().prestamoHipotecario;
  const gruposSplitwise: GrupoSplitwise[] = (seed.grupos_splitwise ?? []).map((g) => ({
    ...g,
    liquidaciones: g.liquidaciones ?? [],
  }));

  const cuentaArs = cuentas.find((c) => c.moneda === 'ARS')?.id ?? null;
  const cuentaUsd = cuentas.find((c) => c.moneda === 'USD')?.id ?? null;

  const transaccionesConSplit = sincronizarSplitwiseEnTransacciones({
    transaccionesBase: seed.transacciones,
    grupos: gruposSplitwise,
    usuarioActualAlias: 'Gonza',
    cuentaDefaultArsId: cuentaArs,
    cuentaDefaultUsdId: cuentaUsd,
  });

  const cuentasConSaldo = calcularSaldosCuentas(cuentas, transaccionesConSplit);

  const catServicios = categorias.find((c) => c.nombre.includes('Servicios'))?.id ?? categorias[1]?.id;
  const catVivienda = categorias.find((c) => c.nombre.includes('Vivienda'))?.id ?? categorias[2]?.id;
  const catHip = categorias.find((c) => c.nombre.includes('Hipotecario'))?.id ?? categorias[3]?.id;
  const catSuper = categorias.find((c) => c.nombre.includes('Alimentación') || c.nombre.includes('Supermercado'))?.id ?? categorias[4]?.id;

  const presupuestos: Presupuesto[] = [
    {
      id: 'pres-vivienda-2026',
      categoria_id: catVivienda,
      mes: 8,
      anio: 2026,
      monto_limite: 750000,
      moneda: 'ARS',
      umbral_alerta_pct: 80,
    },
    {
      id: 'pres-hipotecario-2026',
      categoria_id: catHip,
      mes: 8,
      anio: 2026,
      monto_limite: 1050000,
      moneda: 'ARS',
      umbral_alerta_pct: 90,
    },
    {
      id: 'pres-servicios-2026',
      categoria_id: catServicios,
      mes: 8,
      anio: 2026,
      monto_limite: 350000,
      moneda: 'ARS',
      umbral_alerta_pct: 80,
    },
    {
      id: 'pres-super-2026',
      categoria_id: catSuper,
      mes: 8,
      anio: 2026,
      monto_limite: 600000,
      moneda: 'ARS',
      umbral_alerta_pct: 80,
    },
  ];

  return {
    cuentas: cuentasConSaldo,
    categorias,
    transacciones: transaccionesConSplit,
    prestamoHipotecario,
    gruposSplitwise,
    presupuestos,
    cotizaciones: {
      dolarMep: 1423.6,
      valorUva: 1800.05,
      euroArs: 1540.0,
    },
    usuarioActualAlias: 'Gonza',
  };
}

export function loadDatabaseFromLocal(): AppDatabase {
  try {
    // Limpiar cualquier caché antiguo sin autenticación que haya quedado en el navegador
    localStorage.removeItem(LEGACY_STORAGE_KEY);

    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppDatabase;
      if (parsed && Array.isArray(parsed.transacciones) && parsed.prestamoHipotecario) {
        return recalculateAndNormalizeDatabase(parsed);
      }
    }
  } catch {
    // Fallback to empty structure
  }
  return buildEmptyDatabase();
}

export function recalculateAndNormalizeDatabase(db: AppDatabase): AppDatabase {
  const cuentaArs = db.cuentas.find((c) => c.moneda === 'ARS')?.id ?? null;
  const cuentaUsd = db.cuentas.find((c) => c.moneda === 'USD')?.id ?? null;

  const transaccionesSincronizadas = sincronizarSplitwiseEnTransacciones({
    transaccionesBase: db.transacciones,
    grupos: db.gruposSplitwise,
    usuarioActualAlias: db.usuarioActualAlias || 'Gonza',
    cuentaDefaultArsId: cuentaArs,
    cuentaDefaultUsdId: cuentaUsd,
  });

  const cuentasRecalculadas = calcularSaldosCuentas(db.cuentas, transaccionesSincronizadas);

  return {
    ...db,
    cuentas: cuentasRecalculadas,
    transacciones: transaccionesSincronizadas,
  };
}

export function saveDatabaseToLocal(db: AppDatabase): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // Ignore quota errors
  }
}

export function clearLocalDatabaseCache(): AppDatabase {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
  return buildEmptyDatabase();
}

export function formatMoney(amount: number, moneda: string = 'ARS', decimals: number = 0): string {
  const symbol = moneda === 'USD' ? 'US$' : moneda === 'EUR' ? '€' : '$';
  const formatted = Math.abs(amount).toLocaleString('es-AR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${amount < 0 ? '-' : ''}${symbol} ${formatted}`;
}

export const MESES_NOMBRES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];
