-- =============================================================================
-- PARCHE DE HARDENING Y SEGURIDAD — ESQUEMA: finanzas
-- Proyecto Supabase: gonpa-design | Dominio: finanzas.gonpa.com.ar
-- =============================================================================
-- Ejecutar este script en el SQL Editor de Supabase para blindar el esquema
-- "finanzas" ya existente sin perder tablas ni estructura.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. BLOQUEAR ACCESO ANÓNIMO (ROL anon) AL ESQUEMA finanzas
-- -----------------------------------------------------------------------------
-- Ningún visitante sin sesión autenticada (rol anon) puede consultar tablas,
-- vistas, secuencias ni ejecutar funciones RPC del esquema finanzas.
REVOKE ALL ON SCHEMA finanzas FROM anon;
REVOKE ALL ON ALL TABLES IN SCHEMA finanzas FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA finanzas FROM anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA finanzas FROM PUBLIC, anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA finanzas REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA finanzas REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA finanzas REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon;

-- Garantizar que solo usuarios autenticados y service_role tengan acceso al esquema
GRANT USAGE ON SCHEMA finanzas TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA finanzas TO authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA finanzas TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. ASEGURAR DEFAULT auth.uid() EN COLUMNAS DE PROPIEDAD
-- -----------------------------------------------------------------------------
ALTER TABLE finanzas.cuentas ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE finanzas.transacciones ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE finanzas.presupuestos ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE finanzas.prestamos_creditos ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE finanzas.prestamos_cuotas ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE finanzas.contactos ALTER COLUMN owner_user_id SET DEFAULT auth.uid();
ALTER TABLE finanzas.grupos ALTER COLUMN creado_por SET DEFAULT auth.uid();
ALTER TABLE finanzas.gastos_compartidos ALTER COLUMN creado_por SET DEFAULT auth.uid();
ALTER TABLE finanzas.liquidaciones ALTER COLUMN creado_por SET DEFAULT auth.uid();

-- -----------------------------------------------------------------------------
-- 3. PROTEGER LA VISTA v_saldos_grupos CON security_invoker = true
-- -----------------------------------------------------------------------------
-- Sin security_invoker = true, las vistas en PostgreSQL se ejecutan con los
-- permisos del owner (postgres) y saltean el RLS de las tablas base.
ALTER VIEW finanzas.v_saldos_grupos SET (security_invoker = true);

-- -----------------------------------------------------------------------------
-- 4. FUNCIONES AUXILIARES DE AUTORIZACIÓN RLS
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION finanzas.fn_usuario_pertenece_a_grupo(p_grupo_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = finanzas, public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL OR p_grupo_id IS NULL THEN false
    ELSE EXISTS (
      SELECT 1 FROM finanzas.grupos g
      WHERE g.id = p_grupo_id AND g.creado_por = auth.uid()
    ) OR EXISTS (
      SELECT 1 FROM finanzas.grupos_miembros gm
      WHERE gm.grupo_id = p_grupo_id AND gm.user_id = auth.uid()
    )
  END;
$$;

CREATE OR REPLACE FUNCTION finanzas.fn_usuario_accede_gasto_compartido(p_gasto_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = finanzas, public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL OR p_gasto_id IS NULL THEN false
    ELSE EXISTS (
      SELECT 1 FROM finanzas.gastos_compartidos gc
      WHERE gc.id = p_gasto_id
        AND (
          gc.creado_por = auth.uid()
          OR (gc.grupo_id IS NOT NULL AND finanzas.fn_usuario_pertenece_a_grupo(gc.grupo_id))
        )
    )
  END;
$$;

-- Validar autorización dentro del RPC de sincronización de gasto compartido
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
  IF auth.uid() IS NOT NULL AND NOT finanzas.fn_usuario_accede_gasto_compartido(p_gasto_id) THEN
    RAISE EXCEPTION 'Acceso denegado al gasto compartido %', p_gasto_id;
  END IF;

  SELECT * INTO v_gasto
  FROM finanzas.gastos_compartidos
  WHERE id = p_gasto_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

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
        r_user.total_debido,
        r_user.total_pagado,
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

-- Eliminar la función RPC de reclamo masivo de huérfanos para evitar apropiación por terceros
DROP FUNCTION IF EXISTS finanzas.fn_reclamar_datos_historicos();

-- Otorgar EXECUTE únicamente sobre las funciones necesarias para RLS y sincronización a authenticated
GRANT EXECUTE ON FUNCTION finanzas.fn_usuario_pertenece_a_grupo(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION finanzas.fn_usuario_accede_gasto_compartido(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION finanzas.fn_sincronizar_gasto_compartido(uuid) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5. REEMPLAZAR POLÍTICAS RLS POR POLÍTICAS ESTRICTAS (CERO FUGAS user_id IS NULL)
-- -----------------------------------------------------------------------------

-- 5.1 usuarios_perfiles: cada usuario solo ve y edita su propio perfil
DROP POLICY IF EXISTS "perfiles_select" ON finanzas.usuarios_perfiles;
CREATE POLICY "perfiles_select" ON finanzas.usuarios_perfiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS "perfiles_insert" ON finanzas.usuarios_perfiles;
CREATE POLICY "perfiles_insert" ON finanzas.usuarios_perfiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "perfiles_update" ON finanzas.usuarios_perfiles;
CREATE POLICY "perfiles_update" ON finanzas.usuarios_perfiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- 5.2 cotizaciones: lectura de globales (user_id IS NULL) + propias; escritura solo propias
DROP POLICY IF EXISTS "cotizaciones_select" ON finanzas.cotizaciones;
CREATE POLICY "cotizaciones_select" ON finanzas.cotizaciones
  FOR SELECT TO authenticated
  USING (user_id IS NULL OR user_id = auth.uid());

DROP POLICY IF EXISTS "cotizaciones_write" ON finanzas.cotizaciones;
CREATE POLICY "cotizaciones_write" ON finanzas.cotizaciones
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 5.3 categorias y subcategorias: lectura de globales + propias; escritura solo propias
DROP POLICY IF EXISTS "categorias_select" ON finanzas.categorias;
CREATE POLICY "categorias_select" ON finanzas.categorias
  FOR SELECT TO authenticated
  USING (user_id IS NULL OR user_id = auth.uid());

DROP POLICY IF EXISTS "categorias_write" ON finanzas.categorias;
CREATE POLICY "categorias_write" ON finanzas.categorias
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "subcategorias_select" ON finanzas.subcategorias;
CREATE POLICY "subcategorias_select" ON finanzas.subcategorias
  FOR SELECT TO authenticated
  USING (user_id IS NULL OR user_id = auth.uid());

DROP POLICY IF EXISTS "subcategorias_write" ON finanzas.subcategorias;
CREATE POLICY "subcategorias_write" ON finanzas.subcategorias
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 5.4 Tablas patrimoniales estrictamente privadas (cuentas, transacciones, presupuestos, préstamos)
-- Prohibido "user_id IS NULL" en USING/WITH CHECK: solo el propietario autenticado accede.
DROP POLICY IF EXISTS "cuentas_owner" ON finanzas.cuentas;
CREATE POLICY "cuentas_owner" ON finanzas.cuentas
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "transacciones_owner" ON finanzas.transacciones;
CREATE POLICY "transacciones_owner" ON finanzas.transacciones
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "presupuestos_owner" ON finanzas.presupuestos;
CREATE POLICY "presupuestos_owner" ON finanzas.presupuestos
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "prestamos_owner" ON finanzas.prestamos_creditos;
CREATE POLICY "prestamos_owner" ON finanzas.prestamos_creditos
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "prestamos_cuotas_owner" ON finanzas.prestamos_cuotas;
CREATE POLICY "prestamos_cuotas_owner" ON finanzas.prestamos_cuotas
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 5.5 Contactos Splitwise: solo el owner o el usuario vinculado
DROP POLICY IF EXISTS "contactos_access" ON finanzas.contactos;
CREATE POLICY "contactos_access" ON finanzas.contactos
  FOR ALL TO authenticated
  USING (owner_user_id = auth.uid() OR linked_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

-- 5.6 Grupos y Miembros de Grupo (cierra escalación de privilegios por WITH CHECK (true))
DROP POLICY IF EXISTS "grupos_select" ON finanzas.grupos;
CREATE POLICY "grupos_select" ON finanzas.grupos
  FOR SELECT TO authenticated
  USING (creado_por = auth.uid() OR finanzas.fn_usuario_pertenece_a_grupo(id));

DROP POLICY IF EXISTS "grupos_insert" ON finanzas.grupos;
CREATE POLICY "grupos_insert" ON finanzas.grupos
  FOR INSERT TO authenticated
  WITH CHECK (creado_por = auth.uid());

DROP POLICY IF EXISTS "grupos_update" ON finanzas.grupos;
CREATE POLICY "grupos_update" ON finanzas.grupos
  FOR UPDATE TO authenticated
  USING (creado_por = auth.uid() OR finanzas.fn_usuario_pertenece_a_grupo(id))
  WITH CHECK (creado_por = auth.uid() OR finanzas.fn_usuario_pertenece_a_grupo(id));

DROP POLICY IF EXISTS "grupos_delete" ON finanzas.grupos;
CREATE POLICY "grupos_delete" ON finanzas.grupos
  FOR DELETE TO authenticated
  USING (creado_por = auth.uid());

DROP POLICY IF EXISTS "grupos_miembros_access" ON finanzas.grupos_miembros;
CREATE POLICY "grupos_miembros_access" ON finanzas.grupos_miembros
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR finanzas.fn_usuario_pertenece_a_grupo(grupo_id))
  WITH CHECK (finanzas.fn_usuario_pertenece_a_grupo(grupo_id));

-- 5.7 Gastos Compartidos, Pagadores, Divisiones y Liquidaciones (cierra USING (true))
DROP POLICY IF EXISTS "gastos_compartidos_access" ON finanzas.gastos_compartidos;
CREATE POLICY "gastos_compartidos_access" ON finanzas.gastos_compartidos
  FOR ALL TO authenticated
  USING (creado_por = auth.uid() OR (grupo_id IS NOT NULL AND finanzas.fn_usuario_pertenece_a_grupo(grupo_id)))
  WITH CHECK (creado_por = auth.uid() OR (grupo_id IS NOT NULL AND finanzas.fn_usuario_pertenece_a_grupo(grupo_id)));

DROP POLICY IF EXISTS "gastos_pagadores_access" ON finanzas.gastos_pagadores;
CREATE POLICY "gastos_pagadores_access" ON finanzas.gastos_pagadores
  FOR ALL TO authenticated
  USING (finanzas.fn_usuario_accede_gasto_compartido(gasto_compartido_id))
  WITH CHECK (finanzas.fn_usuario_accede_gasto_compartido(gasto_compartido_id));

DROP POLICY IF EXISTS "divisiones_gasto_access" ON finanzas.divisiones_gasto;
CREATE POLICY "divisiones_gasto_access" ON finanzas.divisiones_gasto
  FOR ALL TO authenticated
  USING (finanzas.fn_usuario_accede_gasto_compartido(gasto_compartido_id))
  WITH CHECK (finanzas.fn_usuario_accede_gasto_compartido(gasto_compartido_id));

DROP POLICY IF EXISTS "liquidaciones_access" ON finanzas.liquidaciones;
CREATE POLICY "liquidaciones_access" ON finanzas.liquidaciones
  FOR ALL TO authenticated
  USING (
    creado_por = auth.uid()
    OR deudor_user_id = auth.uid()
    OR acreedor_user_id = auth.uid()
    OR (grupo_id IS NOT NULL AND finanzas.fn_usuario_pertenece_a_grupo(grupo_id))
  )
  WITH CHECK (
    creado_por = auth.uid()
    OR (grupo_id IS NOT NULL AND finanzas.fn_usuario_pertenece_a_grupo(grupo_id))
  );

COMMIT;
