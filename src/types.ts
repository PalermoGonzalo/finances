export type Moneda = 'ARS' | 'USD' | 'EUR';

export type TipoCuenta =
  | 'efectivo'
  | 'banco'
  | 'billetera_virtual'
  | 'tarjeta_credito'
  | 'inversion'
  | 'custodia_familiar'
  | 'otro';

export interface Cuenta {
  id: string;
  key?: string;
  nombre: string;
  tipo: TipoCuenta;
  institucion: string;
  moneda: Moneda;
  saldo_inicial: number;
  saldo_actual?: number;
  color: string;
  icono: string;
}

export type TipoCategoria = 'gasto' | 'ingreso' | 'ambos';

export interface Categoria {
  id: string;
  nombre: string;
  tipo: TipoCategoria;
  icono: string;
  color: string;
  orden: number;
}

export type TipoTransaccion = 'ingreso' | 'gasto' | 'transferencia' | 'liquidacion_split';
export type CondicionFiscal = 'blanco' | 'negro' | 'mixto';
export type EstadoPago = 'pagado' | 'pendiente_split' | 'programado';

export interface TransaccionMetadatos {
  anio?: number;
  mes?: number;
  fila_excel?: number;
  rubro_original?: string;
  seccion?: string;
  cuota_ars?: number;
  seguro_ars?: number;
  cuota_uva?: number;
  usd_comprados?: number;
  tipo_cambio?: number;
  grupo_id?: string | null;
  grupo_nombre?: string;
  monto_total_grupo?: number;
  monto_pagado_usuario?: number;
  monto_parte_usuario?: number;
  saldo_neto_operacion?: number;
  rol?: string;
  deudor?: string;
  acreedor?: string;
}

export interface Transaccion {
  id: string;
  cuenta_id: string | null;
  cuenta_destino_id: string | null;
  tipo: TipoTransaccion;
  concepto: string;
  /** Monto real devengado que impacta en presupuestos y estadísticas */
  monto: number;
  /** Dinero efectivo que salió o entró de la billetera */
  monto_caja: number;
  moneda: Moneda;
  cotizacion_ars?: number | null;
  fecha: string; // YYYY-MM-DD
  categoria_id: string | null;
  condicion_fiscal: CondicionFiscal;
  estado_pago: EstadoPago;
  es_recurrente: boolean;
  observaciones: string;
  origen_hoja_excel?: string;
  gasto_compartido_id?: string | null;
  liquidacion_id?: string | null;
  es_origen_splitwise?: boolean;
  metadatos: TransaccionMetadatos;
}

export interface CuotaHipotecario {
  id: string;
  prestamo_id: string;
  numero_cuota: number;
  etiqueta_cuota: string; // '1/240' .. '240/240'
  fecha_vencimiento: string;
  valor_uva: number | null;
  amortizacion_uva: number;
  interes_uva: number;
  intereses_ars: number | null;
  impuestos_ars: number;
  seguro_uva: number;
  seguro_ars: number | null;
  cuota_total_uva: number;
  cuota_total_ars: number | null;
  saldo_deuda_uva: number;
  cotizacion_mep: number | null;
  cuota_usd: number | null;
  deuda_ars: number | null;
  deuda_usd: number | null;
  pagada: boolean;
  transaccion_id?: string | null;
}

export interface PrestamoHipotecario {
  id: string;
  nombre: string;
  tipo: 'hipotecario_uva' | 'prestamo_personal' | 'deuda_familiar' | 'otro';
  moneda_original: 'UVA' | Moneda;
  total_cuotas: number;
  cuotas_pagadas: number;
  monto_capital_total: number;
  notas: string;
  activo: boolean;
  cuotas: CuotaHipotecario[];
}

export type MetodoDivision = 'equitativo' | 'monto_exacto' | 'porcentual' | 'partes' | 'ajuste';

export interface MiembroGrupo {
  id: string;
  grupo_id: string;
  user_id?: string | null;
  nombre_display: string;
  email?: string;
  rol: 'admin' | 'miembro';
  porcentaje_defecto: number;
  es_usuario_actual?: boolean;
}

export interface PagadorGasto {
  id: string;
  miembro_id: string;
  nombre_pagador: string;
  monto_pagado: number;
  cuenta_origen_id?: string | null;
}

export interface DivisionGasto {
  id: string;
  miembro_id: string;
  nombre_participante: string;
  monto_debido: number;
  porcentaje?: number;
  partes?: number;
  ajuste_extra?: number;
}

export interface GastoCompartido {
  id: string;
  grupo_id: string;
  descripcion: string;
  monto_total: number;
  moneda: Moneda;
  cotizacion_ars?: number | null;
  fecha: string;
  categoria_id: string | null;
  metodo_division: MetodoDivision;
  notas: string;
  origen_migracion?: string;
  pagadores: PagadorGasto[];
  divisiones: DivisionGasto[];
}

export interface LiquidacionSplitwise {
  id: string;
  grupo_id: string;
  deudor_miembro_id: string;
  deudor_nombre: string;
  acreedor_miembro_id: string;
  acreedor_nombre: string;
  monto: number;
  moneda: Moneda;
  moneda_pago_real?: Moneda;
  monto_pago_real?: number;
  tasa_conversion?: number;
  cuenta_origen_id?: string | null;
  cuenta_destino_id?: string | null;
  fecha: string;
  notas: string;
}

export interface GrupoSplitwise {
  id: string;
  nombre: string;
  descripcion: string;
  tipo_grupo: 'viaje' | 'casa' | 'pareja' | 'proyecto' | 'evento' | 'otro';
  moneda_principal: Moneda;
  simplificar_deudas: boolean;
  icono: string;
  color: string;
  miembros: MiembroGrupo[];
  gastos: GastoCompartido[];
  liquidaciones?: LiquidacionSplitwise[];
}

export interface Presupuesto {
  id: string;
  categoria_id: string;
  mes: number;
  anio: number;
  monto_limite: number;
  moneda: Moneda;
  umbral_alerta_pct: number;
}

export interface CotizacionesActivas {
  dolarMep: number;
  valorUva: number;
  euroArs: number;
}

export interface AppDatabase {
  cuentas: Cuenta[];
  categorias: Categoria[];
  transacciones: Transaccion[];
  prestamoHipotecario: PrestamoHipotecario;
  gruposSplitwise: GrupoSplitwise[];
  presupuestos: Presupuesto[];
  cotizaciones: CotizacionesActivas;
  usuarioActualAlias: string;
}
