-- =============================================================================
-- FINANZAS PERSONALES & SPLITWISE INTEGRADO — ESQUEMA AISLADO: finanzas
-- Proyecto Supabase: gonpa-design | Dominio: finanzas.gonpa.com.ar
-- =============================================================================
-- REGLA DE AISLAMIENTO:
-- Este script NO altera el esquema "public" ni "impresion3d".
-- Toda tabla, vista, función, trigger e índice vive estrictamente en "finanzas".
--
-- PASO OBLIGATORIO EN EL DASHBOARD DE SUPABASE:
-- Project Settings -> Data API -> Exposed schemas -> Agregar "finanzas"
-- (ejemplo: public, impresion3d, finanzas)
-- =============================================================================

-- 1. Crear el esquema aislado
CREATE SCHEMA IF NOT EXISTS finanzas;

-- 2. Permisos de esquema para PostgREST (anon, authenticated, service_role)
GRANT USAGE ON SCHEMA finanzas TO anon, authenticated, service_role;
GRANT ALL ON SCHEMA finanzas TO postgres, service_role;

-- =============================================================================
-- TABLA 1: PERFILES DE USUARIO (finanzas.usuarios_perfiles)
-- =============================================================================
CREATE TABLE IF NOT EXISTS finanzas.usuarios_perfiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  nombre text NOT NULL,
  alias text,
  moneda_principal text NOT NULL DEFAULT 'ARS' CHECK (moneda_principal IN ('ARS', 'USD', 'EUR')),
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- TABLA 2: COTIZACIONES E HISTORIAL MULTIMONEDA (finanzas.cotizaciones)
-- =============================================================================
CREATE TABLE IF NOT EXISTS finanzas.cotizaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  moneda_origen text NOT NULL CHECK (moneda_origen IN ('USD', 'EUR', 'UVA', 'ARS')),
  moneda_destino text NOT NULL DEFAULT 'ARS' CHECK (moneda_destino IN ('ARS', 'USD', 'EUR')),
  tipo_cotizacion text NOT NULL DEFAULT 'MEP' CHECK (tipo_cotizacion IN ('MEP', 'Oficial', 'Blue', 'Tarjeta', 'Cripto', 'UVA', 'Manual')),
  valor numeric(16, 4) NOT NULL CHECK (valor > 0),
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  es_activa boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finanzas_cotizaciones_moneda_fecha
  ON finanzas.cotizaciones(moneda_origen, tipo_cotizacion, fecha DESC);

-- =============================================================================
-- TABLA 3: CUENTAS / BILLETERAS (finanzas.cuentas)
-- =============================================================================
CREATE TABLE IF NOT EXISTS finanzas.cuentas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('efectivo', 'banco', 'billetera_virtual', 'tarjeta_credito', 'inversion', 'custodia_familiar', 'otro')),
  institucion text,
  moneda text NOT NULL DEFAULT 'ARS' CHECK (moneda IN ('ARS', 'USD', 'EUR')),
  saldo_inicial numeric(16, 2) NOT NULL DEFAULT 0.00,
  saldo_actual numeric(16, 2) NOT NULL DEFAULT 0.00,
  color text NOT NULL DEFAULT '#10b981',
  icono text NOT NULL DEFAULT 'Wallet',
  incluir_en_patrimonio boolean NOT NULL DEFAULT true,
  activa boolean NOT NULL DEFAULT true,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finanzas_cuentas_user ON finanzas.cuentas(user_id);

-- =============================================================================
-- TABLA 4: CATEGORÍAS Y SUBCATEGORÍAS (finanzas.categorias / subcategorias)
-- =============================================================================
CREATE TABLE IF NOT EXISTS finanzas.categorias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE, -- NULL = categoría global/sistema
  nombre text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('gasto', 'ingreso', 'ambos')),
  icono text NOT NULL DEFAULT 'Tag',
  color text NOT NULL DEFAULT '#6366f1',
  orden int NOT NULL DEFAULT 100,
  activa boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS finanzas.subcategorias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria_id uuid NOT NULL REFERENCES finanzas.categorias(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  activa boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finanzas_categorias_user ON finanzas.categorias(user_id);
CREATE INDEX IF NOT EXISTS idx_finanzas_subcategorias_cat ON finanzas.subcategorias(categoria_id);

-- =============================================================================
-- TABLA 5: CONTACTOS / AMIGOS SPLITWISE (finanzas.contactos)
-- =============================================================================
CREATE TABLE IF NOT EXISTS finanzas.contactos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  linked_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  nombre text NOT NULL,
  alias text,
  email text,
  telefono text,
  avatar_color text NOT NULL DEFAULT '#3b82f6',
  es_usuario_propio boolean NOT NULL DEFAULT false,
  invitacion_token uuid DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finanzas_contactos_owner ON finanzas.contactos(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_finanzas_contactos_linked ON finanzas.contactos(linked_user_id);

-- =============================================================================
-- TABLA 6: GRUPOS DE GASTOS COMPARTIDOS (finanzas.grupos)
-- =============================================================================
CREATE TABLE IF NOT EXISTS finanzas.grupos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creado_por uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  descripcion text,
  tipo_grupo text NOT NULL DEFAULT 'viaje' CHECK (tipo_grupo IN ('viaje', 'casa', 'pareja', 'proyecto', 'evento', 'otro')),
  moneda_principal text NOT NULL DEFAULT 'ARS' CHECK (moneda_principal IN ('ARS', 'USD', 'EUR')),
  simplificar_deudas boolean NOT NULL DEFAULT true,
  icono text NOT NULL DEFAULT 'Users',
  color text NOT NULL DEFAULT '#8b5cf6',
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- TABLA 7: MIEMBROS DE GRUPO (finanzas.grupos_miembros)
-- =============================================================================
CREATE TABLE IF NOT EXISTS finanzas.grupos_miembros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id uuid NOT NULL REFERENCES finanzas.grupos(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  contacto_id uuid REFERENCES finanzas.contactos(id) ON DELETE SET NULL,
  nombre_display text NOT NULL,
  email text,
  rol text NOT NULL DEFAULT 'miembro' CHECK (rol IN ('admin', 'miembro')),
  porcentaje_defecto numeric(5, 2),
  partes_defecto numeric(6, 2) DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finanzas_grupos_miembros_grupo ON finanzas.grupos_miembros(grupo_id);
CREATE INDEX IF NOT EXISTS idx_finanzas_grupos_miembros_user ON finanzas.grupos_miembros(user_id);

-- =============================================================================
-- TABLA 8: GASTOS COMPARTIDOS — CABECERA SPLITWISE (finanzas.gastos_compartidos)
-- =============================================================================
-- Nota: grupo_id es NULLABLE para permitir gastos 1-a-1 entre amigos fuera de un grupo
CREATE TABLE IF NOT EXISTS finanzas.gastos_compartidos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creado_por uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  grupo_id uuid REFERENCES finanzas.grupos(id) ON DELETE CASCADE,
  descripcion text NOT NULL,
  monto_total numeric(16, 2) NOT NULL CHECK (monto_total > 0),
  moneda text NOT NULL DEFAULT 'ARS' CHECK (moneda IN ('ARS', 'USD', 'EUR')),
  cotizacion_ars numeric(16, 4),
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  categoria_id uuid REFERENCES finanzas.categorias(id) ON DELETE SET NULL,
  subcategoria_id uuid REFERENCES finanzas.subcategorias(id) ON DELETE SET NULL,
  metodo_division text NOT NULL DEFAULT 'equitativo'
    CHECK (metodo_division IN ('equitativo', 'monto_exacto', 'porcentual', 'partes', 'ajuste')),
  notas text,
  comprobante_url text,
  eliminado boolean NOT NULL DEFAULT false,
  origen_migracion text, -- Ej: 'Nueva York 2026', 'Junio 16'
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finanzas_gastos_comp_grupo ON finanzas.gastos_compartidos(grupo_id);
CREATE INDEX IF NOT EXISTS idx_finanzas_gastos_comp_fecha ON finanzas.gastos_compartidos(fecha DESC);

-- =============================================================================
-- TABLA 9: PAGADORES DE UN GASTO COMPARTIDO (finanzas.gastos_pagadores)
-- =============================================================================
-- Soporta 1 o múltiples pagadores para el mismo gasto (ej. Gonza puso $60, Flor $40)
CREATE TABLE IF NOT EXISTS finanzas.gastos_pagadores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gasto_compartido_id uuid NOT NULL REFERENCES finanzas.gastos_compartidos(id) ON DELETE CASCADE,
  miembro_id uuid REFERENCES finanzas.grupos_miembros(id) ON DELETE CASCADE,
  contacto_id uuid REFERENCES finanzas.contactos(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  nombre_pagador text NOT NULL,
  monto_pagado numeric(16, 2) NOT NULL CHECK (monto_pagado >= 0),
  cuenta_origen_id uuid REFERENCES finanzas.cuentas(id) ON DELETE SET NULL, -- Billetera personal de donde salió el pago
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finanzas_gastos_pagadores_gasto ON finanzas.gastos_pagadores(gasto_compartido_id);

-- =============================================================================
-- TABLA 10: DIVISIONES DE GASTO / QUIÉN DEBE CUÁNTO (finanzas.divisiones_gasto)
-- =============================================================================
CREATE TABLE IF NOT EXISTS finanzas.divisiones_gasto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gasto_compartido_id uuid NOT NULL REFERENCES finanzas.gastos_compartidos(id) ON DELETE CASCADE,
  miembro_id uuid REFERENCES finanzas.grupos_miembros(id) ON DELETE CASCADE,
  contacto_id uuid REFERENCES finanzas.contactos(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  nombre_participante text NOT NULL,
  monto_debido numeric(16, 2) NOT NULL CHECK (monto_debido >= 0),
  porcentaje numeric(6, 2),
  partes numeric(6, 2),
  ajuste_extra numeric(16, 2) DEFAULT 0.00,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finanzas_divisiones_gasto_id ON finanzas.divisiones_gasto(gasto_compartido_id);

-- =============================================================================
-- TABLA 11: LIQUIDACIONES DE DEUDA / SALDAR CUENTAS (finanzas.liquidaciones)
-- =============================================================================
CREATE TABLE IF NOT EXISTS finanzas.liquidaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creado_por uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  grupo_id uuid REFERENCES finanzas.grupos(id) ON DELETE CASCADE,
  deudor_miembro_id uuid REFERENCES finanzas.grupos_miembros(id) ON DELETE SET NULL,
  deudor_contacto_id uuid REFERENCES finanzas.contactos(id) ON DELETE SET NULL,
  deudor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  deudor_nombre text NOT NULL,
  acreedor_miembro_id uuid REFERENCES finanzas.grupos_miembros(id) ON DELETE SET NULL,
  acreedor_contacto_id uuid REFERENCES finanzas.contactos(id) ON DELETE SET NULL,
  acreedor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  acreedor_nombre text NOT NULL,
  monto numeric(16, 2) NOT NULL CHECK (monto > 0),
  moneda text NOT NULL DEFAULT 'ARS' CHECK (moneda IN ('ARS', 'USD', 'EUR')),
  moneda_pago_real text CHECK (moneda_pago_real IN ('ARS', 'USD', 'EUR')),
  monto_pago_real numeric(16, 2),
  tasa_conversion numeric(16, 4),
  cuenta_origen_id uuid REFERENCES finanzas.cuentas(id) ON DELETE SET NULL,
  cuenta_destino_id uuid REFERENCES finanzas.cuentas(id) ON DELETE SET NULL,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  notas text,
  comprobante_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finanzas_liquidaciones_grupo ON finanzas.liquidaciones(grupo_id);

-- =============================================================================
-- TABLA 12: TRANSACCIONES FINANCIERAS CENTRALES (finanzas.transacciones)
-- =============================================================================
-- Unifica los movimientos propios y el reflejo automático de Splitwise:
-- * monto: Impacto contable en presupuesto/estadística personal (tu parte real).
-- * monto_caja: Dinero efectivo que salió o entró de la billetera (ej. si pagaste
--   la cuenta entera de un grupo o recibiste un reembolso).
CREATE TABLE IF NOT EXISTS finanzas.transacciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  cuenta_id uuid REFERENCES finanzas.cuentas(id) ON DELETE SET NULL, -- NULL si lo pagó otro en Splitwise y aún no liquidaste
  cuenta_destino_id uuid REFERENCES finanzas.cuentas(id) ON DELETE SET NULL, -- Para transferencias entre cuentas propias
  tipo text NOT NULL CHECK (tipo IN ('ingreso', 'gasto', 'transferencia', 'liquidacion_split')),
  concepto text NOT NULL,
  monto numeric(16, 2) NOT NULL CHECK (monto >= 0), -- Gasto/Ingreso devengado real del usuario
  monto_caja numeric(16, 2) NOT NULL DEFAULT 0.00, -- Impacto real en el saldo de cuenta_id
  moneda text NOT NULL DEFAULT 'ARS' CHECK (moneda IN ('ARS', 'USD', 'EUR')),
  cotizacion_ars numeric(16, 4),
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  categoria_id uuid REFERENCES finanzas.categorias(id) ON DELETE SET NULL,
  subcategoria_id uuid REFERENCES finanzas.subcategorias(id) ON DELETE SET NULL,
  condicion_fiscal text NOT NULL DEFAULT 'blanco' CHECK (condicion_fiscal IN ('blanco', 'negro', 'mixto')),
  estado_pago text NOT NULL DEFAULT 'pagado' CHECK (estado_pago IN ('pagado', 'pendiente_split', 'programado')),
  es_recurrente boolean NOT NULL DEFAULT false,
  observaciones text,
  -- Vínculos automáticos con Splitwise
  gasto_compartido_id uuid REFERENCES finanzas.gastos_compartidos(id) ON DELETE CASCADE,
  liquidacion_id uuid REFERENCES finanzas.liquidaciones(id) ON DELETE CASCADE,
  es_origen_splitwise boolean NOT NULL DEFAULT false,
  -- Metadatos extendidos del Excel (consumos kW, m3, subsidios, cuotas, obra)
  metadatos jsonb NOT NULL DEFAULT '{}'::jsonb,
  origen_hoja_excel text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finanzas_transacciones_user_fecha ON finanzas.transacciones(user_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_finanzas_transacciones_cuenta ON finanzas.transacciones(cuenta_id);
CREATE INDEX IF NOT EXISTS idx_finanzas_transacciones_categoria ON finanzas.transacciones(categoria_id);
CREATE INDEX IF NOT EXISTS idx_finanzas_transacciones_split ON finanzas.transacciones(gasto_compartido_id);

-- =============================================================================
-- TABLA 13: PRESUPUESTOS Y METAS MENSUALES (finanzas.presupuestos)
-- =============================================================================
CREATE TABLE IF NOT EXISTS finanzas.presupuestos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  categoria_id uuid NOT NULL REFERENCES finanzas.categorias(id) ON DELETE CASCADE,
  mes int NOT NULL CHECK (mes BETWEEN 1 AND 12),
  anio int NOT NULL CHECK (anio BETWEEN 2000 AND 2100),
  monto_limite numeric(16, 2) NOT NULL CHECK (monto_limite > 0),
  moneda text NOT NULL DEFAULT 'ARS' CHECK (moneda IN ('ARS', 'USD', 'EUR')),
  umbral_alerta_pct int NOT NULL DEFAULT 80 CHECK (umbral_alerta_pct BETWEEN 1 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, categoria_id, mes, anio, moneda)
);

-- =============================================================================
-- TABLA 14: PRÉSTAMOS, CRÉDITO HIPOTECARIO UVA Y DEUDAS (finanzas.prestamos_creditos)
-- =============================================================================
CREATE TABLE IF NOT EXISTS finanzas.prestamos_creditos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('hipotecario_uva', 'prestamo_personal', 'deuda_familiar', 'otro')),
  moneda_original text NOT NULL DEFAULT 'UVA' CHECK (moneda_original IN ('UVA', 'ARS', 'USD', 'EUR')),
  total_cuotas int NOT NULL DEFAULT 1,
  cuotas_pagadas int NOT NULL DEFAULT 0,
  monto_capital_total numeric(16, 2),
  notas text,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS finanzas.prestamos_cuotas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prestamo_id uuid NOT NULL REFERENCES finanzas.prestamos_creditos(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  numero_cuota int NOT NULL,
  etiqueta_cuota text NOT NULL, -- Ej: '2/240'
  fecha_vencimiento date NOT NULL,
  valor_uva numeric(14, 4),
  amortizacion_uva numeric(14, 4),
  interes_uva numeric(14, 4),
  intereses_ars numeric(16, 2),
  impuestos_ars numeric(16, 2) DEFAULT 0.00,
  seguro_uva numeric(14, 4),
  seguro_ars numeric(16, 2),
  cuota_total_uva numeric(14, 4),
  cuota_total_ars numeric(16, 2),
  saldo_deuda_uva numeric(16, 4),
  cotizacion_mep numeric(16, 4),
  cuota_usd numeric(16, 2),
  deuda_ars numeric(18, 2),
  deuda_usd numeric(16, 2),
  pagada boolean NOT NULL DEFAULT false,
  transaccion_id uuid REFERENCES finanzas.transacciones(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(prestamo_id, numero_cuota)
);

CREATE INDEX IF NOT EXISTS idx_finanzas_prestamos_cuotas_prestamo
  ON finanzas.prestamos_cuotas(prestamo_id, numero_cuota);

-- =============================================================================
-- TRIGGERS AUTOMÁTICOS: SINCRONIZACIÓN DE SALDOS DE BILLETERAS
-- =============================================================================
CREATE OR REPLACE FUNCTION finanzas.fn_recalcular_saldo_cuenta(p_cuenta_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = finanzas, public
AS $$
DECLARE
  v_saldo_inicial numeric(16, 2);
  v_ingresos numeric(16, 2);
  v_egresos numeric(16, 2);
  v_transf_entrantes numeric(16, 2);
  v_transf_salientes numeric(16, 2);
BEGIN
  IF p_cuenta_id IS NULL THEN
    RETURN;
  END IF;

  SELECT saldo_inicial INTO v_saldo_inicial
  FROM finanzas.cuentas
  WHERE id = p_cuenta_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Ingresos y reembolsos de liquidaciones Splitwise entrantes a esta cuenta
  SELECT COALESCE(SUM(
    CASE
      WHEN monto_caja > 0 THEN monto_caja
      ELSE monto
    END
  ), 0)
  INTO v_ingresos
  FROM finanzas.transacciones
  WHERE cuenta_id = p_cuenta_id
    AND tipo = 'ingreso'
    AND estado_pago = 'pagado';

  -- Gastos pagados desde esta cuenta (usa monto_caja si salió más plata por pagar un gasto compartido)
  SELECT COALESCE(SUM(
    CASE
      WHEN es_origen_splitwise THEN monto_caja
      WHEN monto_caja > 0 THEN monto_caja
      ELSE monto
    END
  ), 0)
  INTO v_egresos
  FROM finanzas.transacciones
  WHERE cuenta_id = p_cuenta_id
    AND tipo = 'gasto'
    AND estado_pago = 'pagado';

  -- Transferencias y liquidaciones salientes desde cuenta_id
  SELECT COALESCE(SUM(
    CASE WHEN monto_caja > 0 THEN monto_caja ELSE monto END
  ), 0)
  INTO v_transf_salientes
  FROM finanzas.transacciones
  WHERE cuenta_id = p_cuenta_id
    AND tipo IN ('transferencia', 'liquidacion_split')
    AND estado_pago = 'pagado';

  -- Transferencias y liquidaciones entrantes hacia cuenta_destino_id
  SELECT COALESCE(SUM(
    CASE WHEN monto_caja > 0 THEN monto_caja ELSE monto END
  ), 0)
  INTO v_transf_entrantes
  FROM finanzas.transacciones
  WHERE cuenta_destino_id = p_cuenta_id
    AND tipo IN ('transferencia', 'liquidacion_split')
    AND estado_pago = 'pagado';

  UPDATE finanzas.cuentas
  SET saldo_actual = v_saldo_inicial + v_ingresos - v_egresos - v_transf_salientes + v_transf_entrantes,
      updated_at = now()
  WHERE id = p_cuenta_id;
END;
$$;

CREATE OR REPLACE FUNCTION finanzas.trg_actualizar_saldos_transaccion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = finanzas, public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM finanzas.fn_recalcular_saldo_cuenta(OLD.cuenta_id);
    PERFORM finanzas.fn_recalcular_saldo_cuenta(OLD.cuenta_destino_id);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM finanzas.fn_recalcular_saldo_cuenta(OLD.cuenta_id);
    PERFORM finanzas.fn_recalcular_saldo_cuenta(OLD.cuenta_destino_id);
    PERFORM finanzas.fn_recalcular_saldo_cuenta(NEW.cuenta_id);
    PERFORM finanzas.fn_recalcular_saldo_cuenta(NEW.cuenta_destino_id);
    RETURN NEW;
  ELSE
    PERFORM finanzas.fn_recalcular_saldo_cuenta(NEW.cuenta_id);
    PERFORM finanzas.fn_recalcular_saldo_cuenta(NEW.cuenta_destino_id);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS after_transaccion_saldo ON finanzas.transacciones;
CREATE TRIGGER after_transaccion_saldo
AFTER INSERT OR UPDATE OR DELETE ON finanzas.transacciones
FOR EACH ROW EXECUTE FUNCTION finanzas.trg_actualizar_saldos_transaccion();

-- =============================================================================
-- FUNCIÓN RPC: GUARDAR GASTO COMPARTIDO + REFLEJO AUTOMÁTICO EN FINANZAS
-- =============================================================================
-- Garantiza que cada gasto cargado en Splitwise cree o actualice automáticamente
-- la transacción correspondiente en el módulo de Finanzas Personales de cada
-- usuario involucrado:
-- * monto = parte real que le corresponde al usuario (para presupuestos/gráficos)
-- * monto_caja = lo que pagó de su bolsillo desde su billetera (para saldo real)
CREATE OR REPLACE FUNCTION finanzas.fn_sincronizar_gasto_compartido(p_gasto_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = finanzas, public
AS $$
DECLARE
  v_gasto finanzas.gastos_compartidos%ROWTYPE;
  v_grupo_nombre text;
  r_user RECORD;
BEGIN
  SELECT * INTO v_gasto
  FROM finanzas.gastos_compartidos
  WHERE id = p_gasto_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Limpiar reflejos previos de este gasto compartido para regenerarlos limpiamente
  DELETE FROM finanzas.transacciones
  WHERE gasto_compartido_id = p_gasto_id;

  IF v_gasto.eliminado THEN
    RETURN;
  END IF;

  IF v_gasto.grupo_id IS NOT NULL THEN
    SELECT nombre INTO v_grupo_nombre FROM finanzas.grupos WHERE id = v_gasto.grupo_id;
  ELSE
    v_grupo_nombre := 'Splitwise 1-a-1';
  END IF;

  -- Identificar todos los user_id registrados involucrados (como pagadores o deudores)
  -- más el creador del gasto si su miembro/contacto es él mismo
  FOR r_user IN
    WITH participantes AS (
      SELECT
        COALESCE(gp.user_id, gm.user_id, c.linked_user_id) AS uid,
        gp.monto_pagado AS pagado,
        0::numeric(16,2) AS debido,
        gp.cuenta_origen_id AS cuenta_id
      FROM finanzas.gastos_pagadores gp
      LEFT JOIN finanzas.grupos_miembros gm ON gm.id = gp.miembro_id
      LEFT JOIN finanzas.contactos c ON c.id = COALESCE(gp.contacto_id, gm.contacto_id)
      WHERE gp.gasto_compartido_id = p_gasto_id

      UNION ALL

      SELECT
        COALESCE(dg.user_id, gm.user_id, c.linked_user_id) AS uid,
        0::numeric(16,2) AS pagado,
        dg.monto_debido AS debido,
        NULL::uuid AS cuenta_id
      FROM finanzas.divisiones_gasto dg
      LEFT JOIN finanzas.grupos_miembros gm ON gm.id = dg.miembro_id
      LEFT JOIN finanzas.contactos c ON c.id = COALESCE(dg.contacto_id, gm.contacto_id)
      WHERE dg.gasto_compartido_id = p_gasto_id
    )
    SELECT
      uid,
      SUM(pagado) AS total_pagado,
      SUM(debido) AS total_debido,
      (ARRAY_REMOVE(ARRAY_AGG(cuenta_id), NULL))[1] AS primera_cuenta_id
    FROM participantes
    WHERE uid IS NOT NULL
    GROUP BY uid
  LOOP
    -- Insertar el reflejo automático en finanzas.transacciones para el usuario
    IF r_user.total_pagado > 0 OR r_user.total_debido > 0 THEN
      INSERT INTO finanzas.transacciones (
        user_id,
        cuenta_id,
        tipo,
        concepto,
        monto,
        monto_caja,
        moneda,
        cotizacion_ars,
        fecha,
        categoria_id,
        subcategoria_id,
        condicion_fiscal,
        estado_pago,
        observaciones,
        gasto_compartido_id,
        es_origen_splitwise,
        metadatos
      ) VALUES (
        r_user.uid,
        r_user.primera_cuenta_id,
        'gasto',
        '[' || COALESCE(v_grupo_nombre, 'Compartido') || '] ' || v_gasto.descripcion,
        r_user.total_debido, -- Tu gasto real para presupuestos y KPIs
        r_user.total_pagado, -- Lo que efectivamente salió de tu billetera hoy
        v_gasto.moneda,
        v_gasto.cotizacion_ars,
        v_gasto.fecha,
        v_gasto.categoria_id,
        v_gasto.subcategoria_id,
        'blanco',
        CASE
          WHEN r_user.total_pagado > 0 THEN 'pagado'
          ELSE 'pendiente_split'
        END,
        COALESCE(v_gasto.notas, '') ||
          format(' (Total grupo: %s %s | Pagaste: %s | Tu parte: %s)',
            v_gasto.moneda, v_gasto.monto_total, r_user.total_pagado, r_user.total_debido),
        p_gasto_id,
        true,
        jsonb_build_object(
          'grupo_id', v_gasto.grupo_id,
          'grupo_nombre', v_grupo_nombre,
          'monto_total_grupo', v_gasto.monto_total,
          'monto_pagado_usuario', r_user.total_pagado,
          'monto_parte_usuario', r_user.total_debido,
          'saldo_neto_operacion', (r_user.total_pagado - r_user.total_debido)
        )
      );
    END IF;
  END LOOP;
END;
$$;

-- Trigger para liquidaciones -> Reflejo automático en billeteras personales
CREATE OR REPLACE FUNCTION finanzas.trg_sincronizar_liquidacion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = finanzas, public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM finanzas.transacciones WHERE liquidacion_id = OLD.id;
    RETURN OLD;
  END IF;

  DELETE FROM finanzas.transacciones WHERE liquidacion_id = NEW.id;

  -- Si el deudor es un usuario registrado y seleccionó cuenta de origen
  IF NEW.deudor_user_id IS NOT NULL THEN
    INSERT INTO finanzas.transacciones (
      user_id,
      cuenta_id,
      tipo,
      concepto,
      monto,
      monto_caja,
      moneda,
      fecha,
      estado_pago,
      observaciones,
      liquidacion_id,
      es_origen_splitwise,
      metadatos
    ) VALUES (
      NEW.deudor_user_id,
      NEW.cuenta_origen_id,
      'liquidacion_split',
      'Pago Splitwise a ' || NEW.acreedor_nombre,
      0.00, -- No suma como gasto nuevo porque el gasto ya fue devengado al consumir
      COALESCE(NEW.monto_pago_real, NEW.monto), -- Sí descuenta de la billetera
      COALESCE(NEW.moneda_pago_real, NEW.moneda),
      NEW.fecha,
      'pagado',
      NEW.notas,
      NEW.id,
      true,
      jsonb_build_object('rol', 'deudor', 'acreedor', NEW.acreedor_nombre, 'monto_original', NEW.monto, 'moneda_original', NEW.moneda)
    );
  END IF;

  -- Si el acreedor es un usuario registrado y seleccionó cuenta de destino
  IF NEW.acreedor_user_id IS NOT NULL THEN
    INSERT INTO finanzas.transacciones (
      user_id,
      cuenta_destino_id,
      tipo,
      concepto,
      monto,
      monto_caja,
      moneda,
      fecha,
      estado_pago,
      observaciones,
      liquidacion_id,
      es_origen_splitwise,
      metadatos
    ) VALUES (
      NEW.acreedor_user_id,
      NEW.cuenta_destino_id,
      'liquidacion_split',
      'Cobro Splitwise de ' || NEW.deudor_nombre,
      0.00, -- No es un ingreso salarial nuevo, es recupero de crédito Splitwise
      COALESCE(NEW.monto_pago_real, NEW.monto), -- Sí suma saldo a la billetera destino
      COALESCE(NEW.moneda_pago_real, NEW.moneda),
      NEW.fecha,
      'pagado',
      NEW.notas,
      NEW.id,
      true,
      jsonb_build_object('rol', 'acreedor', 'deudor', NEW.deudor_nombre, 'monto_original', NEW.monto, 'moneda_original', NEW.moneda)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS after_liquidacion_sync ON finanzas.liquidaciones;
CREATE TRIGGER after_liquidacion_sync
AFTER INSERT OR UPDATE OR DELETE ON finanzas.liquidaciones
FOR EACH ROW EXECUTE FUNCTION finanzas.trg_sincronizar_liquidacion();

-- =============================================================================
-- VISTA DE SALDOS SPLITWISE POR GRUPO, MIEMBRO Y MONEDA
-- =============================================================================
CREATE OR REPLACE VIEW finanzas.v_saldos_grupos AS
WITH pagos AS (
  SELECT
    gc.grupo_id,
    gc.moneda,
    gp.miembro_id,
    gp.nombre_pagador AS nombre,
    SUM(gp.monto_pagado) AS total_pagado
  FROM finanzas.gastos_compartidos gc
  JOIN finanzas.gastos_pagadores gp ON gp.gasto_compartido_id = gc.id
  WHERE gc.eliminado = false
  GROUP BY gc.grupo_id, gc.moneda, gp.miembro_id, gp.nombre_pagador
),
deudas AS (
  SELECT
    gc.grupo_id,
    gc.moneda,
    dg.miembro_id,
    dg.nombre_participante AS nombre,
    SUM(dg.monto_debido) AS total_debido
  FROM finanzas.gastos_compartidos gc
  JOIN finanzas.divisiones_gasto dg ON dg.gasto_compartido_id = gc.id
  WHERE gc.eliminado = false
  GROUP BY gc.grupo_id, gc.moneda, dg.miembro_id, dg.nombre_participante
),
liq_enviadas AS (
  SELECT
    grupo_id,
    moneda,
    deudor_miembro_id AS miembro_id,
    deudor_nombre AS nombre,
    SUM(monto) AS total_enviado
  FROM finanzas.liquidaciones
  GROUP BY grupo_id, moneda, deudor_miembro_id, deudor_nombre
),
liq_recibidas AS (
  SELECT
    grupo_id,
    moneda,
    acreedor_miembro_id AS miembro_id,
    acreedor_nombre AS nombre,
    SUM(monto) AS total_recibido
  FROM finanzas.liquidaciones
  GROUP BY grupo_id, moneda, acreedor_miembro_id, acreedor_nombre
),
miembros_monedas AS (
  SELECT DISTINCT grupo_id, moneda, miembro_id, nombre FROM pagos
  UNION
  SELECT DISTINCT grupo_id, moneda, miembro_id, nombre FROM deudas
  UNION
  SELECT DISTINCT grupo_id, moneda, miembro_id, nombre FROM liq_enviadas
  UNION
  SELECT DISTINCT grupo_id, moneda, miembro_id, nombre FROM liq_recibidas
)
SELECT
  mm.grupo_id,
  mm.miembro_id,
  mm.nombre,
  mm.moneda,
  COALESCE(p.total_pagado, 0)::numeric(16,2) AS total_pagado,
  COALESCE(d.total_debido, 0)::numeric(16,2) AS total_consumido,
  COALESCE(le.total_enviado, 0)::numeric(16,2) AS liquidaciones_pagadas,
  COALESCE(lr.total_recibido, 0)::numeric(16,2) AS liquidaciones_cobradas,
  (
    COALESCE(p.total_pagado, 0)
    - COALESCE(d.total_debido, 0)
    + COALESCE(le.total_enviado, 0)
    - COALESCE(lr.total_recibido, 0)
  )::numeric(16,2) AS saldo_neto -- Positivo = le deben; Negativo = debe
FROM miembros_monedas mm
LEFT JOIN pagos p
  ON p.grupo_id IS NOT DISTINCT FROM mm.grupo_id
  AND p.miembro_id IS NOT DISTINCT FROM mm.miembro_id
  AND p.nombre = mm.nombre
  AND p.moneda = mm.moneda
LEFT JOIN deudas d
  ON d.grupo_id IS NOT DISTINCT FROM mm.grupo_id
  AND d.miembro_id IS NOT DISTINCT FROM mm.miembro_id
  AND d.nombre = mm.nombre
  AND d.moneda = mm.moneda
LEFT JOIN liq_enviadas le
  ON le.grupo_id IS NOT DISTINCT FROM mm.grupo_id
  AND le.miembro_id IS NOT DISTINCT FROM mm.miembro_id
  AND le.nombre = mm.nombre
  AND le.moneda = mm.moneda
LEFT JOIN liq_recibidas lr
  ON lr.grupo_id IS NOT DISTINCT FROM mm.grupo_id
  AND lr.miembro_id IS NOT DISTINCT FROM mm.miembro_id
  AND lr.nombre = mm.nombre
  AND lr.moneda = mm.moneda;

-- =============================================================================
-- FUNCIÓN AUXILIAR RLS: VERIFICAR ACCESO A UN GRUPO COMPARTIDO
-- =============================================================================
CREATE OR REPLACE FUNCTION finanzas.fn_usuario_pertenece_a_grupo(p_grupo_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = finanzas, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM finanzas.grupos g
    WHERE g.id = p_grupo_id AND g.creado_por = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM finanzas.grupos_miembros gm
    WHERE gm.grupo_id = p_grupo_id AND gm.user_id = auth.uid()
  );
$$;

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) ESTRICTO EN TODAS LAS TABLAS DE finanzas
-- =============================================================================
ALTER TABLE finanzas.usuarios_perfiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE finanzas.cotizaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE finanzas.cuentas ENABLE ROW LEVEL SECURITY;
ALTER TABLE finanzas.categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE finanzas.subcategorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE finanzas.contactos ENABLE ROW LEVEL SECURITY;
ALTER TABLE finanzas.grupos ENABLE ROW LEVEL SECURITY;
ALTER TABLE finanzas.grupos_miembros ENABLE ROW LEVEL SECURITY;
ALTER TABLE finanzas.gastos_compartidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE finanzas.gastos_pagadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE finanzas.divisiones_gasto ENABLE ROW LEVEL SECURITY;
ALTER TABLE finanzas.liquidaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE finanzas.transacciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE finanzas.presupuestos ENABLE ROW LEVEL SECURITY;
ALTER TABLE finanzas.prestamos_creditos ENABLE ROW LEVEL SECURITY;
ALTER TABLE finanzas.prestamos_cuotas ENABLE ROW LEVEL SECURITY;

-- Políticas: usuarios_perfiles
DROP POLICY IF EXISTS "perfiles_select" ON finanzas.usuarios_perfiles;
CREATE POLICY "perfiles_select" ON finanzas.usuarios_perfiles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "perfiles_insert" ON finanzas.usuarios_perfiles;
CREATE POLICY "perfiles_insert" ON finanzas.usuarios_perfiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
DROP POLICY IF EXISTS "perfiles_update" ON finanzas.usuarios_perfiles;
CREATE POLICY "perfiles_update" ON finanzas.usuarios_perfiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- Políticas: cotizaciones
DROP POLICY IF EXISTS "cotizaciones_select" ON finanzas.cotizaciones;
CREATE POLICY "cotizaciones_select" ON finanzas.cotizaciones FOR SELECT TO authenticated USING (user_id IS NULL OR user_id = auth.uid());
DROP POLICY IF EXISTS "cotizaciones_write" ON finanzas.cotizaciones;
CREATE POLICY "cotizaciones_write" ON finanzas.cotizaciones FOR ALL TO authenticated USING (user_id IS NULL OR user_id = auth.uid()) WITH CHECK (user_id IS NULL OR user_id = auth.uid());

-- Políticas: cuentas
DROP POLICY IF EXISTS "cuentas_owner" ON finanzas.cuentas;
CREATE POLICY "cuentas_owner" ON finanzas.cuentas FOR ALL TO authenticated
  USING (user_id IS NULL OR user_id = auth.uid())
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

-- Políticas: categorias y subcategorias (globales user_id IS NULL + propias del usuario)
DROP POLICY IF EXISTS "categorias_select" ON finanzas.categorias;
CREATE POLICY "categorias_select" ON finanzas.categorias FOR SELECT TO authenticated USING (user_id IS NULL OR user_id = auth.uid());
DROP POLICY IF EXISTS "categorias_write" ON finanzas.categorias;
CREATE POLICY "categorias_write" ON finanzas.categorias FOR ALL TO authenticated USING (user_id IS NULL OR user_id = auth.uid()) WITH CHECK (user_id IS NULL OR user_id = auth.uid());

DROP POLICY IF EXISTS "subcategorias_select" ON finanzas.subcategorias;
CREATE POLICY "subcategorias_select" ON finanzas.subcategorias FOR SELECT TO authenticated USING (user_id IS NULL OR user_id = auth.uid());
DROP POLICY IF EXISTS "subcategorias_write" ON finanzas.subcategorias;
CREATE POLICY "subcategorias_write" ON finanzas.subcategorias FOR ALL TO authenticated USING (user_id IS NULL OR user_id = auth.uid()) WITH CHECK (user_id IS NULL OR user_id = auth.uid());

-- Políticas: contactos
DROP POLICY IF EXISTS "contactos_access" ON finanzas.contactos;
CREATE POLICY "contactos_access" ON finanzas.contactos FOR ALL TO authenticated
  USING (owner_user_id IS NULL OR owner_user_id = auth.uid() OR linked_user_id = auth.uid())
  WITH CHECK (owner_user_id IS NULL OR owner_user_id = auth.uid());

-- Políticas: grupos y grupos_miembros
DROP POLICY IF EXISTS "grupos_select" ON finanzas.grupos;
CREATE POLICY "grupos_select" ON finanzas.grupos FOR SELECT TO authenticated
  USING (creado_por IS NULL OR creado_por = auth.uid() OR finanzas.fn_usuario_pertenece_a_grupo(id));
DROP POLICY IF EXISTS "grupos_insert" ON finanzas.grupos;
CREATE POLICY "grupos_insert" ON finanzas.grupos FOR INSERT TO authenticated WITH CHECK (creado_por IS NULL OR creado_por = auth.uid());
DROP POLICY IF EXISTS "grupos_update" ON finanzas.grupos;
CREATE POLICY "grupos_update" ON finanzas.grupos FOR UPDATE TO authenticated
  USING (creado_por IS NULL OR creado_por = auth.uid() OR finanzas.fn_usuario_pertenece_a_grupo(id));
DROP POLICY IF EXISTS "grupos_delete" ON finanzas.grupos;
CREATE POLICY "grupos_delete" ON finanzas.grupos FOR DELETE TO authenticated USING (creado_por IS NULL OR creado_por = auth.uid());

DROP POLICY IF EXISTS "grupos_miembros_access" ON finanzas.grupos_miembros;
CREATE POLICY "grupos_miembros_access" ON finanzas.grupos_miembros FOR ALL TO authenticated
  USING (user_id IS NULL OR user_id = auth.uid() OR finanzas.fn_usuario_pertenece_a_grupo(grupo_id))
  WITH CHECK (true);

-- Políticas: gastos_compartidos, pagadores, divisiones, liquidaciones
DROP POLICY IF EXISTS "gastos_compartidos_access" ON finanzas.gastos_compartidos;
CREATE POLICY "gastos_compartidos_access" ON finanzas.gastos_compartidos FOR ALL TO authenticated
  USING (creado_por IS NULL OR creado_por = auth.uid() OR (grupo_id IS NOT NULL AND finanzas.fn_usuario_pertenece_a_grupo(grupo_id)))
  WITH CHECK (creado_por IS NULL OR creado_por = auth.uid() OR (grupo_id IS NOT NULL AND finanzas.fn_usuario_pertenece_a_grupo(grupo_id)));

DROP POLICY IF EXISTS "gastos_pagadores_access" ON finanzas.gastos_pagadores;
CREATE POLICY "gastos_pagadores_access" ON finanzas.gastos_pagadores FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "divisiones_gasto_access" ON finanzas.divisiones_gasto;
CREATE POLICY "divisiones_gasto_access" ON finanzas.divisiones_gasto FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "liquidaciones_access" ON finanzas.liquidaciones;
CREATE POLICY "liquidaciones_access" ON finanzas.liquidaciones FOR ALL TO authenticated
  USING (
    creado_por IS NULL
    OR creado_por = auth.uid()
    OR deudor_user_id = auth.uid()
    OR acreedor_user_id = auth.uid()
    OR (grupo_id IS NOT NULL AND finanzas.fn_usuario_pertenece_a_grupo(grupo_id))
  )
  WITH CHECK (
    creado_por IS NULL
    OR creado_por = auth.uid()
    OR (grupo_id IS NOT NULL AND finanzas.fn_usuario_pertenece_a_grupo(grupo_id))
  );

-- Políticas: transacciones, presupuestos, prestamos
DROP POLICY IF EXISTS "transacciones_owner" ON finanzas.transacciones;
CREATE POLICY "transacciones_owner" ON finanzas.transacciones FOR ALL TO authenticated
  USING (user_id IS NULL OR user_id = auth.uid())
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

DROP POLICY IF EXISTS "presupuestos_owner" ON finanzas.presupuestos;
CREATE POLICY "presupuestos_owner" ON finanzas.presupuestos FOR ALL TO authenticated
  USING (user_id IS NULL OR user_id = auth.uid())
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

DROP POLICY IF EXISTS "prestamos_owner" ON finanzas.prestamos_creditos;
CREATE POLICY "prestamos_owner" ON finanzas.prestamos_creditos FOR ALL TO authenticated
  USING (user_id IS NULL OR user_id = auth.uid())
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

DROP POLICY IF EXISTS "prestamos_cuotas_owner" ON finanzas.prestamos_cuotas;
CREATE POLICY "prestamos_cuotas_owner" ON finanzas.prestamos_cuotas FOR ALL TO authenticated
  USING (user_id IS NULL OR user_id = auth.uid())
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

-- Función RPC para reclamar automáticamente registros históricos con user_id IS NULL al iniciar sesión
CREATE OR REPLACE FUNCTION finanzas.fn_reclamar_datos_historicos()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = finanzas, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  UPDATE finanzas.cuentas SET user_id = v_uid WHERE user_id IS NULL;
  UPDATE finanzas.transacciones SET user_id = v_uid WHERE user_id IS NULL;
  UPDATE finanzas.presupuestos SET user_id = v_uid WHERE user_id IS NULL;
  UPDATE finanzas.prestamos_creditos SET user_id = v_uid WHERE user_id IS NULL;
  UPDATE finanzas.prestamos_cuotas SET user_id = v_uid WHERE user_id IS NULL;
  UPDATE finanzas.contactos SET owner_user_id = v_uid WHERE owner_user_id IS NULL;
  UPDATE finanzas.grupos SET creado_por = v_uid WHERE creado_por IS NULL;
  UPDATE finanzas.gastos_compartidos SET creado_por = v_uid WHERE creado_por IS NULL;
  UPDATE finanzas.liquidaciones SET creado_por = v_uid WHERE creado_por IS NULL;
END;
$$;

-- =============================================================================
-- PERMISOS EXPLÍCITOS DE TABLAS, VISTAS, SECUENCIAS Y FUNCIONES (GRANTs)
-- =============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA finanzas TO authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA finanzas TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA finanzas TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA finanzas TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA finanzas
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA finanzas
  GRANT SELECT ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA finanzas
  GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA finanzas
  GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

-- =============================================================================
-- SEED INICIAL: CATEGORÍAS Y SUBCATEGORÍAS DEL EXCEL + COTIZACIONES BASE
-- =============================================================================
DO $$
DECLARE
  v_cat_depto uuid;
  v_cat_personal uuid;
  v_cat_vida uuid;
  v_cat_viajes uuid;
  v_cat_impuestos uuid;
  v_cat_ingresos uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM finanzas.categorias WHERE user_id IS NULL) THEN
    -- 1. Departamento / Vivienda
    INSERT INTO finanzas.categorias (user_id, nombre, tipo, icono, color, orden)
    VALUES (NULL, 'Departamento', 'gasto', 'Home', '#3b82f6', 1)
    RETURNING id INTO v_cat_depto;

    INSERT INTO finanzas.subcategorias (categoria_id, nombre) VALUES
      (v_cat_depto, 'Alquiler / Hipotecario'),
      (v_cat_depto, 'Expensas'),
      (v_cat_depto, 'Fondo de reserva'),
      (v_cat_depto, 'Municipal / ABL'),
      (v_cat_depto, 'Luz (Edenor)'),
      (v_cat_depto, 'Gas (Fenosa / Naturgy)'),
      (v_cat_depto, 'Agua (Aysa)'),
      (v_cat_depto, 'Cable + Internet'),
      (v_cat_depto, 'Teléfono Fijo'),
      (v_cat_depto, 'Reparación y Obra');

    -- 2. Personal y Vehículo
    INSERT INTO finanzas.categorias (user_id, nombre, tipo, icono, color, orden)
    VALUES (NULL, 'Personal', 'gasto', 'User', '#8b5cf6', 2)
    RETURNING id INTO v_cat_personal;

    INSERT INTO finanzas.subcategorias (categoria_id, nombre) VALUES
      (v_cat_personal, 'Prepaga (OSDE)'),
      (v_cat_personal, 'Auto (Seguro / Patente / Nafta)'),
      (v_cat_personal, 'Celular (Movistar / Tuenti)'),
      (v_cat_personal, 'Trabajo / Herramientas'),
      (v_cat_personal, 'Salud y Óptica'),
      (v_cat_personal, 'Indumentaria');

    -- 3. Vida Diaria y Tarjetas
    INSERT INTO finanzas.categorias (user_id, nombre, tipo, icono, color, orden)
    VALUES (NULL, 'Consumo y Tarjetas', 'gasto', 'CreditCard', '#f59e0b', 3)
    RETURNING id INTO v_cat_vida;

    INSERT INTO finanzas.subcategorias (categoria_id, nombre) VALUES
      (v_cat_vida, 'Supermercado'),
      (v_cat_vida, 'Restaurantes y Salidas'),
      (v_cat_vida, 'Resumen Débito + Crédito'),
      (v_cat_vida, 'Regalos'),
      (v_cat_vida, 'Electrodomésticos y Hogar');

    -- 4. Viajes y Proyectos Compartidos
    INSERT INTO finanzas.categorias (user_id, nombre, tipo, icono, color, orden)
    VALUES (NULL, 'Viajes y Escapadas', 'gasto', 'Plane', '#ec4899', 4)
    RETURNING id INTO v_cat_viajes;

    INSERT INTO finanzas.subcategorias (categoria_id, nombre) VALUES
      (v_cat_viajes, 'Pasajes y Vuelos'),
      (v_cat_viajes, 'Hoteles y Alojamiento'),
      (v_cat_viajes, 'Excursiones y Entradas'),
      (v_cat_viajes, 'Gastronomía en Viaje'),
      (v_cat_viajes, 'Transporte y Trenes'),
      (v_cat_viajes, 'Compras y Souvenirs');

    -- 5. Impuestos y Profesional
    INSERT INTO finanzas.categorias (user_id, nombre, tipo, icono, color, orden)
    VALUES (NULL, 'Impuestos', 'gasto', 'Landmark', '#ef4444', 5)
    RETURNING id INTO v_cat_impuestos;

    INSERT INTO finanzas.subcategorias (categoria_id, nombre) VALUES
      (v_cat_impuestos, 'Monotributo'),
      (v_cat_impuestos, 'Ingresos Brutos'),
      (v_cat_impuestos, 'Comisiones y Escribanía');

    -- 6. Ingresos
    INSERT INTO finanzas.categorias (user_id, nombre, tipo, icono, color, orden)
    VALUES (NULL, 'Ingresos', 'ingreso', 'TrendingUp', '#10b981', 6)
    RETURNING id INTO v_cat_ingresos;

    INSERT INTO finanzas.subcategorias (categoria_id, nombre) VALUES
      (v_cat_ingresos, 'Sueldo / Honorarios (Blanco)'),
      (v_cat_ingresos, 'Extras / Freelance (Negro)'),
      (v_cat_ingresos, 'Rendimientos de Inversión'),
      (v_cat_ingresos, 'Reintegros y Ahorro IVA');
  END IF;

  -- Cotizaciones iniciales de referencia extraídas del Excel
  IF NOT EXISTS (SELECT 1 FROM finanzas.cotizaciones WHERE user_id IS NULL) THEN
    INSERT INTO finanzas.cotizaciones (user_id, moneda_origen, moneda_destino, tipo_cotizacion, valor, fecha)
    VALUES
      (NULL, 'USD', 'ARS', 'MEP', 1315.0000, CURRENT_DATE),
      (NULL, 'UVA', 'ARS', 'UVA', 1800.0500, CURRENT_DATE);
  END IF;
END $$;
