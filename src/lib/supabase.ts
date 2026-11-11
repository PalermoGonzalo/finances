import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  AppDatabase,
  Categoria,
  Cuenta,
  CuotaHipotecario,
  GastoCompartido,
  GrupoSplitwise,
  LiquidacionSplitwise,
  PrestamoHipotecario,
  Transaccion,
} from '../types';

export interface SupabaseRuntimeConfig {
  url: string;
  anonKey: string;
  schema: string;
}

const LOCAL_CONFIG_KEY = 'finanzas_gonpa_supabase_config_v1';

/**
 * Sanitiza la URL de Supabase eliminando accidentalmente `/rest/v1`, `/auth/v1` o barras finales
 * copiadas del Dashboard (Data API).
 */
export function normalizeSupabaseUrl(rawUrl: string): string {
  const trimmed = rawUrl
    .trim()
    .replace(/\/(rest|auth)\/v1\/?$/i, '')
    .replace(/\/+$/, '');
  if (!trimmed) return '';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const parsed = new URL(trimmed);
      return parsed.origin;
    } catch {
      return trimmed;
    }
  }
  return `https://${trimmed.replace(/\/.*$/, '')}.supabase.co`;
}

export function getSupabaseConfig(): SupabaseRuntimeConfig | null {
  const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  const envSchema =
    (import.meta.env.VITE_SUPABASE_SCHEMA as string | undefined)?.trim() || 'finanzas';

  if (
    envUrl &&
    envKey &&
    !envUrl.includes('tu-proyecto.supabase.co') &&
    envUrl.trim().length > 8
  ) {
    return {
      url: normalizeSupabaseUrl(envUrl),
      anonKey: envKey.trim(),
      schema: envSchema,
    };
  }

  try {
    const saved = localStorage.getItem(LOCAL_CONFIG_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<SupabaseRuntimeConfig>;
      if (parsed.url && parsed.anonKey) {
        return {
          url: normalizeSupabaseUrl(parsed.url),
          anonKey: parsed.anonKey.trim(),
          schema: (parsed.schema || 'finanzas').trim(),
        };
      }
    }
  } catch {
    // Ignore localStorage parse error
  }

  return null;
}

export function saveSupabaseConfigLocal(config: SupabaseRuntimeConfig): void {
  localStorage.setItem(
    LOCAL_CONFIG_KEY,
    JSON.stringify({
      url: normalizeSupabaseUrl(config.url),
      anonKey: config.anonKey.trim(),
      schema: (config.schema || 'finanzas').trim(),
    })
  );
  cachedClient = null;
}

export function clearSupabaseConfigLocal(): void {
  localStorage.removeItem(LOCAL_CONFIG_KEY);
  cachedClient = null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FinanzasSupabaseClient = SupabaseClient<any, string, any>;

let cachedClient: FinanzasSupabaseClient | null = null;

export function getSupabaseClient(): FinanzasSupabaseClient | null {
  if (cachedClient) return cachedClient;
  const cfg = getSupabaseConfig();
  if (!cfg) return null;

  cachedClient = createClient(cfg.url, cfg.anonKey, {
    db: {
      schema: cfg.schema,
    },
  });
  return cachedClient;
}

export const isSupabaseConfigured = Boolean(getSupabaseConfig());

/**
 * Descarga todos los registros del esquema `finanzas` en Supabase.
 * Utiliza paginación automática para superar el límite por defecto de 1.000 filas de PostgREST
 * en las 3.916+ transacciones históricas.
 */
export async function fetchDatabaseFromSupabase(
  client: FinanzasSupabaseClient
): Promise<Partial<AppDatabase> | null> {
  // Intentar reclamar datos históricos si el usuario está autenticado
  const { data: sessionData } = await client.auth.getSession();
  if (sessionData.session?.user) {
    await client.rpc('fn_reclamar_datos_historicos').then(
      () => undefined,
      () => undefined
    );
  }

  const [cuentasRes, categoriasRes, prestamosRes, cuotasRes, gruposRes, miembrosRes, gastosCompRes, pagadoresRes, divisionesRes, liqRes] =
    await Promise.all([
      client.from('cuentas').select('*').order('created_at', { ascending: true }),
      client.from('categorias').select('*').order('orden', { ascending: true }),
      client.from('prestamos_creditos').select('*').limit(5),
      client.from('prestamos_cuotas').select('*').order('numero_cuota', { ascending: true }).limit(300),
      client.from('grupos').select('*').order('created_at', { ascending: true }),
      client.from('grupos_miembros').select('*'),
      client.from('gastos_compartidos').select('*').eq('eliminado', false),
      client.from('gastos_pagadores').select('*'),
      client.from('divisiones_gasto').select('*'),
      client.from('liquidaciones').select('*'),
    ]);

  if (cuentasRes.error) throw cuentasRes.error;
  if (categoriasRes.error) throw categoriasRes.error;

  // Paginar transacciones de a 1000 filas
  const allTxRows: Record<string, unknown>[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await client
      .from('transacciones')
      .select('*')
      .order('fecha', { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allTxRows.push(...(data as Record<string, unknown>[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }

  if (
    (cuentasRes.data?.length ?? 0) === 0 &&
    allTxRows.length === 0 &&
    (cuotasRes.data?.length ?? 0) === 0
  ) {
    return null;
  }

  const cuentas: Cuenta[] = (cuentasRes.data ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id),
    nombre: String(r.nombre),
    tipo: (r.tipo as Cuenta['tipo']) || 'banco',
    institucion: String(r.institucion ?? ''),
    moneda: (r.moneda as Cuenta['moneda']) || 'ARS',
    saldo_inicial: Number(r.saldo_inicial ?? 0),
    saldo_actual: Number(r.saldo_actual ?? 0),
    color: String(r.color ?? '#10b981'),
    icono: String(r.icono ?? 'Wallet'),
  }));

  const categorias: Categoria[] = (categoriasRes.data ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id),
    nombre: String(r.nombre),
    tipo: (r.tipo as Categoria['tipo']) || 'gasto',
    icono: String(r.icono ?? 'Tag'),
    color: String(r.color ?? '#6366f1'),
    orden: Number(r.orden ?? 100),
  }));

  const transacciones: Transaccion[] = allTxRows.map((r: Record<string, unknown>) => ({
    id: String(r.id),
    cuenta_id: r.cuenta_id ? String(r.cuenta_id) : null,
    cuenta_destino_id: r.cuenta_destino_id ? String(r.cuenta_destino_id) : null,
    tipo: (r.tipo as Transaccion['tipo']) || 'gasto',
    concepto: String(r.concepto ?? ''),
    monto: Number(r.monto ?? 0),
    monto_caja: Number(r.monto_caja ?? r.monto ?? 0),
    moneda: (r.moneda as Transaccion['moneda']) || 'ARS',
    cotizacion_ars: r.cotizacion_ars !== null && r.cotizacion_ars !== undefined ? Number(r.cotizacion_ars) : null,
    fecha: String(r.fecha ?? ''),
    categoria_id: r.categoria_id ? String(r.categoria_id) : null,
    condicion_fiscal: (r.condicion_fiscal as Transaccion['condicion_fiscal']) || 'blanco',
    estado_pago: (r.estado_pago as Transaccion['estado_pago']) || 'pagado',
    es_recurrente: Boolean(r.es_recurrente),
    observaciones: String(r.observaciones ?? ''),
    origen_hoja_excel: r.origen_hoja_excel ? String(r.origen_hoja_excel) : undefined,
    gasto_compartido_id: r.gasto_compartido_id ? String(r.gasto_compartido_id) : null,
    liquidacion_id: r.liquidacion_id ? String(r.liquidacion_id) : null,
    es_origen_splitwise: Boolean(r.es_origen_splitwise),
    metadatos: (r.metadatos as Transaccion['metadatos']) ?? {},
  }));

  let prestamoHipotecario: PrestamoHipotecario | undefined;
  if (prestamosRes.data && prestamosRes.data.length > 0) {
    const p = prestamosRes.data[0] as Record<string, unknown>;
    const cuotas: CuotaHipotecario[] = (cuotasRes.data ?? []).map((c: Record<string, unknown>) => ({
      id: String(c.id),
      prestamo_id: String(c.prestamo_id),
      numero_cuota: Number(c.numero_cuota),
      etiqueta_cuota: String(c.etiqueta_cuota),
      fecha_vencimiento: String(c.fecha_vencimiento),
      valor_uva: c.valor_uva !== null ? Number(c.valor_uva) : null,
      amortizacion_uva: Number(c.amortizacion_uva ?? 0),
      interes_uva: Number(c.interes_uva ?? 0),
      intereses_ars: c.intereses_ars !== null ? Number(c.intereses_ars) : null,
      impuestos_ars: Number(c.impuestos_ars ?? 0),
      seguro_uva: Number(c.seguro_uva ?? 0),
      seguro_ars: c.seguro_ars !== null ? Number(c.seguro_ars) : null,
      cuota_total_uva: Number(c.cuota_total_uva ?? 0),
      cuota_total_ars: c.cuota_total_ars !== null ? Number(c.cuota_total_ars) : null,
      saldo_deuda_uva: Number(c.saldo_deuda_uva ?? 0),
      cotizacion_mep: c.cotizacion_mep !== null ? Number(c.cotizacion_mep) : null,
      cuota_usd: c.cuota_usd !== null ? Number(c.cuota_usd) : null,
      deuda_ars: c.deuda_ars !== null ? Number(c.deuda_ars) : null,
      deuda_usd: c.deuda_usd !== null ? Number(c.deuda_usd) : null,
      pagada: Boolean(c.pagada),
    }));

    prestamoHipotecario = {
      id: String(p.id),
      nombre: String(p.nombre),
      tipo: 'hipotecario_uva',
      moneda_original: 'UVA',
      total_cuotas: Number(p.total_cuotas ?? 240),
      cuotas_pagadas: cuotas.filter((q) => q.pagada).length,
      monto_capital_total: Number(p.monto_capital_total ?? 64338.43),
      notas: String(p.notas ?? ''),
      activo: Boolean(p.activo ?? true),
      cuotas,
    };
  }

  const gruposSplitwise: GrupoSplitwise[] = (gruposRes.data ?? []).map((g: Record<string, unknown>) => {
    const gid = String(g.id);
    const miembros = (miembrosRes.data ?? [])
      .filter((m: Record<string, unknown>) => String(m.grupo_id) === gid)
      .map((m: Record<string, unknown>) => ({
        id: String(m.id),
        grupo_id: gid,
        user_id: m.user_id ? String(m.user_id) : null,
        nombre_display: String(m.nombre_display),
        rol: (m.rol as 'admin' | 'miembro') || 'miembro',
        porcentaje_defecto: Number(m.porcentaje_defecto ?? 50),
      }));

    const gastos: GastoCompartido[] = (gastosCompRes.data ?? [])
      .filter((gc: Record<string, unknown>) => String(gc.grupo_id) === gid)
      .map((gc: Record<string, unknown>) => {
        const gcid = String(gc.id);
        const pagadores = (pagadoresRes.data ?? [])
          .filter((p: Record<string, unknown>) => String(p.gasto_compartido_id) === gcid)
          .map((p: Record<string, unknown>) => ({
            id: String(p.id),
            miembro_id: String(p.miembro_id ?? ''),
            nombre_pagador: String(p.nombre_pagador),
            monto_pagado: Number(p.monto_pagado ?? 0),
            cuenta_origen_id: p.cuenta_origen_id ? String(p.cuenta_origen_id) : null,
          }));

        const divisiones = (divisionesRes.data ?? [])
          .filter((d: Record<string, unknown>) => String(d.gasto_compartido_id) === gcid)
          .map((d: Record<string, unknown>) => ({
            id: String(d.id),
            miembro_id: String(d.miembro_id ?? ''),
            nombre_participante: String(d.nombre_participante),
            monto_debido: Number(d.monto_debido ?? 0),
            porcentaje: d.porcentaje !== null ? Number(d.porcentaje) : undefined,
            partes: d.partes !== null ? Number(d.partes) : undefined,
            ajuste_extra: d.ajuste_extra !== null ? Number(d.ajuste_extra) : undefined,
          }));

        return {
          id: gcid,
          grupo_id: gid,
          descripcion: String(gc.descripcion),
          monto_total: Number(gc.monto_total),
          moneda: (gc.moneda as GastoCompartido['moneda']) || 'USD',
          fecha: String(gc.fecha),
          categoria_id: gc.categoria_id ? String(gc.categoria_id) : null,
          metodo_division: (gc.metodo_division as GastoCompartido['metodo_division']) || 'equitativo',
          notas: String(gc.notas ?? ''),
          origen_migracion: gc.origen_migracion ? String(gc.origen_migracion) : undefined,
          pagadores,
          divisiones,
        };
      });

    const liquidaciones: LiquidacionSplitwise[] = (liqRes.data ?? [])
      .filter((l: Record<string, unknown>) => String(l.grupo_id) === gid)
      .map((l: Record<string, unknown>) => ({
        id: String(l.id),
        grupo_id: gid,
        deudor_miembro_id: String(l.deudor_miembro_id ?? ''),
        deudor_nombre: String(l.deudor_nombre),
        acreedor_miembro_id: String(l.acreedor_miembro_id ?? ''),
        acreedor_nombre: String(l.acreedor_nombre),
        monto: Number(l.monto),
        moneda: (l.moneda as LiquidacionSplitwise['moneda']) || 'USD',
        fecha: String(l.fecha),
        notas: String(l.notas ?? ''),
      }));

    return {
      id: gid,
      nombre: String(g.nombre),
      descripcion: String(g.descripcion ?? ''),
      tipo_grupo: (g.tipo_grupo as GrupoSplitwise['tipo_grupo']) || 'viaje',
      moneda_principal: (g.moneda_principal as GrupoSplitwise['moneda_principal']) || 'USD',
      simplificar_deudas: Boolean(g.simplificar_deudas ?? true),
      icono: String(g.icono ?? 'Plane'),
      color: String(g.color ?? '#ec4899'),
      miembros,
      gastos,
      liquidaciones,
    };
  });

  return {
    cuentas,
    categorias,
    transacciones,
    prestamoHipotecario,
    gruposSplitwise,
  };
}

/**
 * Sincroniza (Upsert por lotes) toda la base de datos local (incluyendo el histórico del Excel:
 * Ingresos, Gastos Disc., Hipotecario 240 cuotas y Splitwise) hacia el esquema `finanzas` en Supabase.
 */
export async function syncDatabaseToSupabase(
  client: FinanzasSupabaseClient,
  db: AppDatabase,
  onProgress?: (msg: string) => void
): Promise<void> {
  const { data: sessionData } = await client.auth.getSession();
  const uid = sessionData.session?.user?.id ?? null;

  onProgress?.('Sincronizando categorías y billeteras...');
  if (db.categorias.length > 0) {
    const { error } = await client.from('categorias').upsert(
      db.categorias.map((c) => ({
        id: c.id,
        user_id: null,
        nombre: c.nombre,
        tipo: c.tipo,
        icono: c.icono,
        color: c.color,
        orden: c.orden,
      }))
    );
    if (error) throw error;
  }

  if (db.cuentas.length > 0) {
    const { error } = await client.from('cuentas').upsert(
      db.cuentas.map((c) => ({
        id: c.id,
        user_id: uid,
        nombre: c.nombre,
        tipo: c.tipo,
        institucion: c.institucion,
        moneda: c.moneda,
        saldo_inicial: c.saldo_inicial,
        saldo_actual: c.saldo_actual ?? c.saldo_inicial,
        color: c.color,
        icono: c.icono,
      }))
    );
    if (error) throw error;
  }

  onProgress?.('Sincronizando Crédito Hipotecario UVA (240 cuotas)...');
  const hip = db.prestamoHipotecario;
  if (hip) {
    const { error: pErr } = await client.from('prestamos_creditos').upsert({
      id: hip.id,
      user_id: uid,
      nombre: hip.nombre,
      tipo: hip.tipo,
      moneda_original: hip.moneda_original,
      total_cuotas: hip.total_cuotas,
      cuotas_pagadas: hip.cuotas.filter((c) => c.pagada).length,
      monto_capital_total: hip.monto_capital_total,
      notas: hip.notas,
      activo: hip.activo,
    });
    if (pErr) throw pErr;

    if (hip.cuotas.length > 0) {
      const { error: qErr } = await client.from('prestamos_cuotas').upsert(
        hip.cuotas.map((q) => ({
          id: q.id,
          prestamo_id: hip.id,
          user_id: uid,
          numero_cuota: q.numero_cuota,
          etiqueta_cuota: q.etiqueta_cuota,
          fecha_vencimiento: q.fecha_vencimiento,
          valor_uva: q.valor_uva,
          amortizacion_uva: q.amortizacion_uva,
          interes_uva: q.interes_uva,
          intereses_ars: q.intereses_ars,
          impuestos_ars: q.impuestos_ars,
          seguro_uva: q.seguro_uva,
          seguro_ars: q.seguro_ars,
          cuota_total_uva: q.cuota_total_uva,
          cuota_total_ars: q.cuota_total_ars,
          saldo_deuda_uva: q.saldo_deuda_uva,
          cotizacion_mep: q.cotizacion_mep,
          cuota_usd: q.cuota_usd,
          deuda_ars: q.deuda_ars,
          deuda_usd: q.deuda_usd,
          pagada: q.pagada,
        }))
      );
      if (qErr) throw qErr;
    }
  }

  // Filtrar transacciones que sean puras (no autogeneradas en memoria con prefijo 'split-tx-')
  const txsParaSubir = db.transacciones.filter((t) => !t.id.startsWith('split-'));
  const batchSize = 400;
  for (let i = 0; i < txsParaSubir.length; i += batchSize) {
    const slice = txsParaSubir.slice(i, i + batchSize);
    onProgress?.(
      `Sincronizando transacciones (${Math.min(i + batchSize, txsParaSubir.length)} / ${txsParaSubir.length})...`
    );
    const { error } = await client.from('transacciones').upsert(
      slice.map((t) => ({
        id: t.id,
        user_id: uid,
        cuenta_id: t.cuenta_id,
        cuenta_destino_id: t.cuenta_destino_id,
        tipo: t.tipo,
        concepto: t.concepto,
        monto: t.monto,
        monto_caja: t.monto_caja,
        moneda: t.moneda,
        cotizacion_ars: t.cotizacion_ars ?? null,
        fecha: t.fecha,
        categoria_id: t.categoria_id,
        condicion_fiscal: t.condicion_fiscal,
        estado_pago: t.estado_pago,
        es_recurrente: t.es_recurrente,
        observaciones: t.observaciones,
        origen_hoja_excel: t.origen_hoja_excel ?? null,
        metadatos: t.metadatos ?? {},
      }))
    );
    if (error) throw error;
  }

  onProgress?.('Sincronizando grupos y gastos de Splitwise...');
  for (const g of db.gruposSplitwise) {
    const { error: gErr } = await client.from('grupos').upsert({
      id: g.id,
      creado_por: uid,
      nombre: g.nombre,
      descripcion: g.descripcion,
      tipo_grupo: g.tipo_grupo,
      moneda_principal: g.moneda_principal,
      simplificar_deudas: g.simplificar_deudas,
      icono: g.icono,
      color: g.color,
    });
    if (gErr) throw gErr;

    if (g.miembros.length > 0) {
      const { error: mErr } = await client.from('grupos_miembros').upsert(
        g.miembros.map((m) => ({
          id: m.id,
          grupo_id: g.id,
          user_id: m.nombre_display.toLowerCase().startsWith('gonz') ? uid : null,
          nombre_display: m.nombre_display,
          rol: m.rol,
          porcentaje_defecto: m.porcentaje_defecto,
        }))
      );
      if (mErr) throw mErr;
    }

    if (g.gastos.length > 0) {
      const { error: gcErr } = await client.from('gastos_compartidos').upsert(
        g.gastos.map((gc) => ({
          id: gc.id,
          creado_por: uid,
          grupo_id: g.id,
          descripcion: gc.descripcion,
          monto_total: gc.monto_total,
          moneda: gc.moneda,
          fecha: gc.fecha,
          categoria_id: gc.categoria_id,
          metodo_division: gc.metodo_division,
          notas: gc.notas,
          origen_migracion: gc.origen_migracion ?? 'Splitwise',
        }))
      );
      if (gcErr) throw gcErr;

      const allPagadores = g.gastos.flatMap((gc) =>
        gc.pagadores.map((p) => ({
          id: p.id,
          gasto_compartido_id: gc.id,
          miembro_id: p.miembro_id,
          user_id: p.nombre_pagador.toLowerCase().startsWith('gonz') ? uid : null,
          nombre_pagador: p.nombre_pagador,
          monto_pagado: p.monto_pagado,
          cuenta_origen_id: p.cuenta_origen_id ?? null,
        }))
      );
      if (allPagadores.length > 0) {
        const { error: pagErr } = await client.from('gastos_pagadores').upsert(allPagadores);
        if (pagErr) throw pagErr;
      }

      const allDivisiones = g.gastos.flatMap((gc) =>
        gc.divisiones.map((d) => ({
          id: d.id,
          gasto_compartido_id: gc.id,
          miembro_id: d.miembro_id,
          user_id: d.nombre_participante.toLowerCase().startsWith('gonz') ? uid : null,
          nombre_participante: d.nombre_participante,
          monto_debido: d.monto_debido,
          porcentaje: d.porcentaje ?? null,
          partes: d.partes ?? null,
          ajuste_extra: d.ajuste_extra ?? 0,
        }))
      );
      if (allDivisiones.length > 0) {
        const { error: divErr } = await client.from('divisiones_gasto').upsert(allDivisiones);
        if (divErr) throw divErr;
      }
    }
  }
}
