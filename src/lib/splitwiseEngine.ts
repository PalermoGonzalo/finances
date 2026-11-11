import {
  Cuenta,
  DivisionGasto,
  GastoCompartido,
  GrupoSplitwise,
  LiquidacionSplitwise,
  MetodoDivision,
  MiembroGrupo,
  Moneda,
  Transaccion,
} from '../types';

export interface SaldoMiembroMoneda {
  miembroId: string;
  nombre: string;
  moneda: Moneda;
  totalPagado: number;
  totalConsumido: number;
  liquidacionesPagadas: number;
  liquidacionesCobradas: number;
  /** Positivo = le deben plata; Negativo = debe plata */
  saldoNeto: number;
}

export interface TransferenciaSugerida {
  deudorId: string;
  deudorNombre: string;
  acreedorId: string;
  acreedorNombre: string;
  monto: number;
  moneda: Moneda;
}

/**
 * Calcula cuánto debe cada participante según los 5 métodos de Splitwise.
 */
export function calcularDivisionesGasto(params: {
  montoTotal: number;
  metodo: MetodoDivision;
  participantes: {
    miembroId: string;
    nombre: string;
    incluido: boolean;
    montoExacto?: number;
    porcentaje?: number;
    partes?: number;
    ajusteExtra?: number;
  }[];
}): DivisionGasto[] {
  const { montoTotal, metodo, participantes } = params;
  const activos = participantes.filter((p) => p.incluido);
  if (activos.length === 0 || montoTotal <= 0) return [];

  const resultado: DivisionGasto[] = [];

  if (metodo === 'equitativo') {
    const base = Math.floor((montoTotal / activos.length) * 100) / 100;
    let resto = Math.round((montoTotal - base * activos.length) * 100) / 100;

    activos.forEach((p, idx) => {
      const extraCent = idx === 0 ? resto : 0;
      resultado.push({
        id: `div-${p.miembroId}-${Date.now()}-${idx}`,
        miembro_id: p.miembroId,
        nombre_participante: p.nombre,
        monto_debido: Number((base + extraCent).toFixed(2)),
        porcentaje: Number((100 / activos.length).toFixed(2)),
      });
    });
    return resultado;
  }

  if (metodo === 'monto_exacto') {
    activos.forEach((p, idx) => {
      resultado.push({
        id: `div-${p.miembroId}-${Date.now()}-${idx}`,
        miembro_id: p.miembroId,
        nombre_participante: p.nombre,
        monto_debido: Number((p.montoExacto ?? 0).toFixed(2)),
      });
    });
    return resultado;
  }

  if (metodo === 'porcentual') {
    let acumulado = 0;
    activos.forEach((p, idx) => {
      const pct = p.porcentaje ?? 0;
      const monto =
        idx === activos.length - 1
          ? Number((montoTotal - acumulado).toFixed(2))
          : Number(((montoTotal * pct) / 100).toFixed(2));
      acumulado += monto;
      resultado.push({
        id: `div-${p.miembroId}-${Date.now()}-${idx}`,
        miembro_id: p.miembroId,
        nombre_participante: p.nombre,
        monto_debido: Math.max(0, monto),
        porcentaje: pct,
      });
    });
    return resultado;
  }

  if (metodo === 'partes') {
    const totalPartes = activos.reduce((acc, p) => acc + (p.partes ?? 1), 0) || 1;
    let acumulado = 0;
    activos.forEach((p, idx) => {
      const partes = p.partes ?? 1;
      const monto =
        idx === activos.length - 1
          ? Number((montoTotal - acumulado).toFixed(2))
          : Number(((montoTotal * partes) / totalPartes).toFixed(2));
      acumulado += monto;
      resultado.push({
        id: `div-${p.miembroId}-${Date.now()}-${idx}`,
        miembro_id: p.miembroId,
        nombre_participante: p.nombre,
        monto_debido: Math.max(0, monto),
        partes,
      });
    });
    return resultado;
  }

  // metodo === 'ajuste' (+/- monto extra individual y el resto equitativo)
  const sumaAjustes = activos.reduce((acc, p) => acc + (p.ajusteExtra ?? 0), 0);
  const remanenteEquitativo = Math.max(0, montoTotal - sumaAjustes);
  const base = Math.floor((remanenteEquitativo / activos.length) * 100) / 100;
  const resto = Math.round((remanenteEquitativo - base * activos.length) * 100) / 100;

  activos.forEach((p, idx) => {
    const ajuste = p.ajusteExtra ?? 0;
    const extraCent = idx === 0 ? resto : 0;
    resultado.push({
      id: `div-${p.miembroId}-${Date.now()}-${idx}`,
      miembro_id: p.miembroId,
      nombre_participante: p.nombre,
      monto_debido: Number((base + extraCent + ajuste).toFixed(2)),
      ajuste_extra: ajuste,
    });
  });

  return resultado;
}

/**
 * Calcula los saldos netos de cada miembro del grupo por moneda.
 */
export function calcularSaldosGrupo(grupo: GrupoSplitwise): SaldoMiembroMoneda[] {
  const monedasSet = new Set<Moneda>();
  grupo.gastos.forEach((g) => monedasSet.add(g.moneda));
  (grupo.liquidaciones ?? []).forEach((l) => monedasSet.add(l.moneda));
  if (monedasSet.size === 0) {
    monedasSet.add(grupo.moneda_principal);
  }

  const resultados: SaldoMiembroMoneda[] = [];

  Array.from(monedasSet).forEach((moneda) => {
    const mapa = new Map<string, SaldoMiembroMoneda>();

    grupo.miembros.forEach((m) => {
      mapa.set(m.id, {
        miembroId: m.id,
        nombre: m.nombre_display,
        moneda,
        totalPagado: 0,
        totalConsumido: 0,
        liquidacionesPagadas: 0,
        liquidacionesCobradas: 0,
        saldoNeto: 0,
      });
    });

    grupo.gastos
      .filter((g) => g.moneda === moneda)
      .forEach((g) => {
        g.pagadores.forEach((p) => {
          const item =
            mapa.get(p.miembro_id) ??
            Array.from(mapa.values()).find(
              (x) => x.nombre.toLowerCase() === p.nombre_pagador.toLowerCase()
            );
          if (item) {
            item.totalPagado = Number((item.totalPagado + p.monto_pagado).toFixed(2));
          }
        });

        g.divisiones.forEach((d) => {
          const item =
            mapa.get(d.miembro_id) ??
            Array.from(mapa.values()).find(
              (x) => x.nombre.toLowerCase() === d.nombre_participante.toLowerCase()
            );
          if (item) {
            item.totalConsumido = Number((item.totalConsumido + d.monto_debido).toFixed(2));
          }
        });
      });

    (grupo.liquidaciones ?? [])
      .filter((l) => l.moneda === moneda)
      .forEach((l) => {
        const deudor =
          mapa.get(l.deudor_miembro_id) ??
          Array.from(mapa.values()).find(
            (x) => x.nombre.toLowerCase() === l.deudor_nombre.toLowerCase()
          );
        const acreedor =
          mapa.get(l.acreedor_miembro_id) ??
          Array.from(mapa.values()).find(
            (x) => x.nombre.toLowerCase() === l.acreedor_nombre.toLowerCase()
          );

        if (deudor) {
          deudor.liquidacionesPagadas = Number((deudor.liquidacionesPagadas + l.monto).toFixed(2));
        }
        if (acreedor) {
          acreedor.liquidacionesCobradas = Number(
            (acreedor.liquidacionesCobradas + l.monto).toFixed(2)
          );
        }
      });

    mapa.forEach((item) => {
      item.saldoNeto = Number(
        (
          item.totalPagado -
          item.totalConsumido +
          item.liquidacionesPagadas -
          item.liquidacionesCobradas
        ).toFixed(2)
      );
      if (
        Math.abs(item.totalPagado) > 0 ||
        Math.abs(item.totalConsumido) > 0 ||
        Math.abs(item.saldoNeto) > 0
      ) {
        resultados.push(item);
      }
    });
  });

  return resultados;
}

/**
 * Algoritmo de grafos de Splitwise para simplificar deudas ("Quién le debe a quién")
 * minimizando la cantidad de transferencias entre miembros.
 */
export function simplificarDeudasGrupo(saldos: SaldoMiembroMoneda[]): TransferenciaSugerida[] {
  const sugerencias: TransferenciaSugerida[] = [];
  const monedas = Array.from(new Set(saldos.map((s) => s.moneda)));

  monedas.forEach((moneda) => {
    const deudores = saldos
      .filter((s) => s.moneda === moneda && s.saldoNeto < -0.01)
      .map((s) => ({ ...s, montoPendiente: Math.abs(s.saldoNeto) }))
      .sort((a, b) => b.montoPendiente - a.montoPendiente);

    const acreedores = saldos
      .filter((s) => s.moneda === moneda && s.saldoNeto > 0.01)
      .map((s) => ({ ...s, montoPendiente: s.saldoNeto }))
      .sort((a, b) => b.montoPendiente - a.montoPendiente);

    let i = 0;
    let j = 0;

    while (i < deudores.length && j < acreedores.length) {
      const deudor = deudores[i];
      const acreedor = acreedores[j];
      const pago = Math.min(deudor.montoPendiente, acreedor.montoPendiente);

      if (pago > 0.01) {
        sugerencias.push({
          deudorId: deudor.miembroId,
          deudorNombre: deudor.nombre,
          acreedorId: acreedor.miembroId,
          acreedorNombre: acreedor.nombre,
          monto: Number(pago.toFixed(2)),
          moneda,
        });
      }

      deudor.montoPendiente = Number((deudor.montoPendiente - pago).toFixed(2));
      acreedor.montoPendiente = Number((acreedor.montoPendiente - pago).toFixed(2));

      if (deudor.montoPendiente <= 0.01) i++;
      if (acreedor.montoPendiente <= 0.01) j++;
    }
  });

  return sugerencias;
}

function esMiembroUsuarioActual(nombre: string, aliasActual: string): boolean {
  const n = nombre.trim().toLowerCase();
  const a = aliasActual.trim().toLowerCase();
  return n === a || n.startsWith('gonz') || a.startsWith('gonz');
}

/**
 * Sincroniza determinísticamente todos los gastos compartidos y liquidaciones de Splitwise
 * hacia la lista principal de transacciones financieras personales del usuario:
 * - monto: Tu parte real del gasto (para no inflar presupuestos cuando pagás por otros).
 * - monto_caja: Lo que efectivamente salió o entró de tu billetera personal.
 */
export function sincronizarSplitwiseEnTransacciones(params: {
  transaccionesBase: Transaccion[];
  grupos: GrupoSplitwise[];
  usuarioActualAlias: string;
  cuentaDefaultArsId: string | null;
  cuentaDefaultUsdId: string | null;
}): Transaccion[] {
  const {
    transaccionesBase,
    grupos,
    usuarioActualAlias,
    cuentaDefaultArsId,
    cuentaDefaultUsdId,
  } = params;

  // Conservamos todas las transacciones que NO provienen de Splitwise
  const sinSplit = transaccionesBase.filter((t) => !t.es_origen_splitwise && !t.gasto_compartido_id && !t.liquidacion_id);
  const reflejosSplit: Transaccion[] = [];

  grupos.forEach((grupo) => {
    const miembroUsuario: MiembroGrupo | undefined = grupo.miembros.find((m) =>
      esMiembroUsuarioActual(m.nombre_display, usuarioActualAlias)
    );

    grupo.gastos.forEach((gasto: GastoCompartido) => {
      const pagadoresUsuario = gasto.pagadores.filter(
        (p) =>
          (miembroUsuario && p.miembro_id === miembroUsuario.id) ||
          esMiembroUsuarioActual(p.nombre_pagador, usuarioActualAlias)
      );
      const divisionesUsuario = gasto.divisiones.filter(
        (d) =>
          (miembroUsuario && d.miembro_id === miembroUsuario.id) ||
          esMiembroUsuarioActual(d.nombre_participante, usuarioActualAlias)
      );

      const totalPagadoPorMi = Number(
        pagadoresUsuario.reduce((acc, p) => acc + p.monto_pagado, 0).toFixed(2)
      );
      const totalMiParte = Number(
        divisionesUsuario.reduce((acc, d) => acc + d.monto_debido, 0).toFixed(2)
      );

      if (totalPagadoPorMi === 0 && totalMiParte === 0) {
        return;
      }

      const cuentaElegida =
        pagadoresUsuario.find((p) => p.cuenta_origen_id)?.cuenta_origen_id ??
        (totalPagadoPorMi > 0
          ? gasto.moneda === 'USD'
            ? cuentaDefaultUsdId
            : cuentaDefaultArsId
          : null);

      const fechaObj = new Date(gasto.fecha + 'T12:00:00');
      const anio = !isNaN(fechaObj.getTime()) ? fechaObj.getFullYear() : 2026;
      const mes = !isNaN(fechaObj.getTime()) ? fechaObj.getMonth() + 1 : 9;

      reflejosSplit.push({
        id: `split-tx-${gasto.id}`,
        cuenta_id: cuentaElegida,
        cuenta_destino_id: null,
        tipo: 'gasto',
        concepto: `[${grupo.nombre}] ${gasto.descripcion}`,
        monto: totalMiParte, // Tu gasto devengado real
        monto_caja: totalPagadoPorMi, // Lo que salió de tu billetera hoy
        moneda: gasto.moneda,
        cotizacion_ars: gasto.cotizacion_ars ?? null,
        fecha: gasto.fecha,
        categoria_id: gasto.categoria_id,
        condicion_fiscal: 'blanco',
        estado_pago: totalPagadoPorMi > 0 ? 'pagado' : 'pendiente_split',
        es_recurrente: false,
        observaciones:
          totalPagadoPorMi > 0
            ? `Pagaste ${gasto.moneda} ${totalPagadoPorMi.toLocaleString('es-AR')} (Total grupo: ${gasto.monto_total.toLocaleString('es-AR')} · Tu parte: ${totalMiParte.toLocaleString('es-AR')})`
            : `Pagado por otro miembro (Total: ${gasto.moneda} ${gasto.monto_total.toLocaleString('es-AR')} · Tu parte: ${totalMiParte.toLocaleString('es-AR')})`,
        origen_hoja_excel: gasto.origen_migracion ?? 'Splitwise',
        gasto_compartido_id: gasto.id,
        es_origen_splitwise: true,
        metadatos: {
          anio,
          mes,
          seccion: `Splitwise · ${grupo.nombre}`,
          rubro_original: gasto.descripcion,
          grupo_id: grupo.id,
          grupo_nombre: grupo.nombre,
          monto_total_grupo: gasto.monto_total,
          monto_pagado_usuario: totalPagadoPorMi,
          monto_parte_usuario: totalMiParte,
          saldo_neto_operacion: Number((totalPagadoPorMi - totalMiParte).toFixed(2)),
        },
      });
    });

    (grupo.liquidaciones ?? []).forEach((liq: LiquidacionSplitwise) => {
      const soyDeudor =
        (miembroUsuario && liq.deudor_miembro_id === miembroUsuario.id) ||
        esMiembroUsuarioActual(liq.deudor_nombre, usuarioActualAlias);
      const soyAcreedor =
        (miembroUsuario && liq.acreedor_miembro_id === miembroUsuario.id) ||
        esMiembroUsuarioActual(liq.acreedor_nombre, usuarioActualAlias);

      if (!soyDeudor && !soyAcreedor) return;

      const monedaCaja = liq.moneda_pago_real ?? liq.moneda;
      const montoCaja = liq.monto_pago_real ?? liq.monto;

      reflejosSplit.push({
        id: `split-liq-${liq.id}`,
        cuenta_id: soyDeudor
          ? liq.cuenta_origen_id ?? (monedaCaja === 'USD' ? cuentaDefaultUsdId : cuentaDefaultArsId)
          : null,
        cuenta_destino_id: soyAcreedor
          ? liq.cuenta_destino_id ?? (monedaCaja === 'USD' ? cuentaDefaultUsdId : cuentaDefaultArsId)
          : null,
        tipo: 'liquidacion_split',
        concepto: soyDeudor
          ? `[Saldar Splitwise] Pago a ${liq.acreedor_nombre} (${grupo.nombre})`
          : `[Saldar Splitwise] Cobro de ${liq.deudor_nombre} (${grupo.nombre})`,
        monto: 0, // No duplica gasto ni ingreso salarial
        monto_caja: montoCaja,
        moneda: monedaCaja,
        fecha: liq.fecha,
        categoria_id: null,
        condicion_fiscal: 'blanco',
        estado_pago: 'pagado',
        es_recurrente: false,
        observaciones:
          liq.notas ||
          `Liquidación en ${grupo.nombre}: ${liq.moneda} ${liq.monto.toLocaleString('es-AR')}`,
        origen_hoja_excel: 'Splitwise',
        liquidacion_id: liq.id,
        es_origen_splitwise: true,
        metadatos: {
          seccion: `Liquidación · ${grupo.nombre}`,
          grupo_id: grupo.id,
          grupo_nombre: grupo.nombre,
          rol: soyDeudor ? 'deudor' : 'acreedor',
          deudor: liq.deudor_nombre,
          acreedor: liq.acreedor_nombre,
        },
      });
    });
  });

  return [...sinSplit, ...reflejosSplit];
}

/**
 * Recalcula dinámicamente el saldo actual de cada billetera/cuenta.
 */
export function calcularSaldosCuentas(
  cuentas: Cuenta[],
  transacciones: Transaccion[]
): Cuenta[] {
  return cuentas.map((c) => {
    let saldo = c.saldo_inicial;

    transacciones.forEach((tx) => {
      if (tx.estado_pago !== 'pagado') return;
      const impacto = tx.es_origen_splitwise
        ? tx.monto_caja
        : tx.monto_caja > 0
          ? tx.monto_caja
          : tx.monto;

      if (tx.tipo === 'ingreso' && tx.cuenta_id === c.id) {
        if (tx.moneda === c.moneda) {
          saldo += impacto;
        }
      } else if (tx.tipo === 'gasto' && tx.cuenta_id === c.id) {
        if (tx.moneda === c.moneda) {
          saldo -= impacto;
        }
      } else if (tx.tipo === 'transferencia' || tx.tipo === 'liquidacion_split') {
        if (tx.cuenta_id === c.id && tx.moneda === c.moneda) {
          saldo -= impacto;
        }
        if (tx.cuenta_destino_id === c.id) {
          if (tx.moneda === c.moneda) {
            saldo += impacto;
          } else if (c.moneda === 'USD' && tx.metadatos?.usd_comprados) {
            saldo += tx.metadatos.usd_comprados;
          }
        }
      }
    });

    return {
      ...c,
      saldo_actual: Number(saldo.toFixed(2)),
    };
  });
}
