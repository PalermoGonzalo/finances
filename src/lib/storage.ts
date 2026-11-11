import rawExcelSeed from '../data/excel_seed.json';
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

const STORAGE_KEY = 'finanzas_gonpa_app_db_v1';

interface RawSeedShape {
  cuentas: Cuenta[];
  categorias: Categoria[];
  transacciones: Transaccion[];
  prestamo_hipotecario: PrestamoHipotecario;
  grupos_splitwise: GrupoSplitwise[];
}

export function buildDefaultDatabaseFromExcelSeed(): AppDatabase {
  const seed = rawExcelSeed as unknown as RawSeedShape;

  const cuentas: Cuenta[] = seed.cuentas.map((c) => ({
    ...c,
    saldo_actual: c.saldo_inicial,
  }));

  const categorias: Categoria[] = seed.categorias;
  const prestamoHipotecario: PrestamoHipotecario = seed.prestamo_hipotecario;
  const gruposSplitwise: GrupoSplitwise[] = seed.grupos_splitwise.map((g) => ({
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

  // Presupuestos mensuales sugeridos en base a los datos reales 2026
  const catServicios = categorias.find((c) => c.nombre.includes('Servicios'))?.id ?? categorias[1]?.id;
  const catVivienda = categorias.find((c) => c.nombre.includes('Vivienda'))?.id ?? categorias[2]?.id;
  const catHip = categorias.find((c) => c.nombre.includes('Hipotecario'))?.id ?? categorias[3]?.id;
  const catSuper = categorias.find((c) => c.nombre.includes('Alimentación'))?.id ?? categorias[4]?.id;

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
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppDatabase;
      if (
        parsed &&
        Array.isArray(parsed.transacciones) &&
        parsed.transacciones.length > 100 &&
        parsed.prestamoHipotecario
      ) {
        return recalculateAndNormalizeDatabase(parsed);
      }
    }
  } catch {
    // Fallback to Excel seed
  }
  const fresh = buildDefaultDatabaseFromExcelSeed();
  saveDatabaseToLocal(fresh);
  return fresh;
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

export function resetDatabaseToExcelSeed(): AppDatabase {
  localStorage.removeItem(STORAGE_KEY);
  const fresh = buildDefaultDatabaseFromExcelSeed();
  saveDatabaseToLocal(fresh);
  return fresh;
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
