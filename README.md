# Finanzas Personales, Hipotecario UVA & Splitwise Integrado (`finanzas.gonpa.com.ar`)

Plataforma web integral de gestión financiera personal, patrimonial, seguimiento de Crédito Hipotecario UVA (240 cuotas) y gastos compartidos tipo Splitwise con reflejo automático en billeteras y presupuestos.

---

## Arquitectura & Stack

- **Frontend:** React 19 + Vite + TypeScript (Strict) + Tailwind CSS v4 + Lucide Icons.
- **Hosting:** Cloudflare Pages / Workers Static Assets (`wrangler.jsonc` con `single-page-application`).
- **Dominio:** `finanzas.gonpa.com.ar` (Zona `gonpa.com.ar`).
- **Base de Datos & Auth:** Supabase (Proyecto `gonpa-design`) bajo el esquema estrictamente aislado **`finanzas`** (sin tocar `public` ni `impresion3d`).

---

## Hojas del Excel Incorporadas (`Ingresos - Gastos General.xlsx`)

1. **Hoja `Ingresos` (2014–2026):** **276 registros mensuales** clasificados en Sueldo/Honorarios (Blanco), Extras/Alquiler (Negro) y Rendimientos de Inversiones (IOL).
2. **Hoja `Gastos Disc.` (2017–2026):** **3.640 registros** organizados en los 10 bloques de la planilla:
   - *Servicios Básicos*
   - *Efectivo - Débito* (35 rubros)
   - *Tarjeta Visa | BBVA* (31 rubros)
   - *Tarjeta Visa | Galicia*
   - *Tarjeta Mastercard | Galicia*
   - *Tarjeta Cabal*
   - *Crédito Hipotecario*
   - *Casa*
   - *Auto*
   - *Compra de Dólares* (con monto ARS, USD equivalentes y tipo de cambio implícito)
3. **Hoja `Hipotecario` (2025–2045):** **240 cuotas UVA** (`1/240` a `240/240`) con Valor UVA, Amortización, Interés, Seguro, Saldo de Deuda UVA, Dólar MEP, Cuota en USD y Deuda en USD, más simulador en vivo.
4. **Módulo Splitwise (`Nueva York 2026` + Grupos):** **91 gastos compartidos** en USD y ARS con los 5 métodos de división de Splitwise (`Equitativo`, `Monto Exacto`, `Porcentual`, `Partes/Shares`, `Ajuste +/-`), simplificación de deudas por grafos y **sincronización automática con Finanzas Personales** (diferenciando `monto` devengado real de `monto_caja` de billetera).

---

## Paso a Paso: Configuración en Supabase (`gonpa-design`)

1. **Crear el esquema y tablas (`schema.sql`):**
   - Abrí el **SQL Editor** en el Dashboard de Supabase (`gonpa-design`).
   - Copiá y ejecutá el contenido de [`supabase/schema.sql`](./supabase/schema.sql).
2. **Exponer el esquema `finanzas` en la API de Supabase:**
   - En el Dashboard de Supabase, andá a **Project Settings → Data API → Exposed schemas**.
   - Agregá `finanzas` a la lista (quedando por ejemplo: `public, impresion3d, finanzas`) y hacé clic en **Save**.
3. **Cargar los datos históricos del Excel:**
   - **Opción A (Desde la Web con 1 clic):** Iniciá sesión en la web, abrí el botón **`Supabase (finanzas)`** arriba a la derecha y hacé clic en **"Subir Todo a Supabase"**.
   - **Opción B (Por SQL Editor):** Ejecutá [`supabase/migration_etl_excel.sql`](./supabase/migration_etl_excel.sql) en el SQL Editor de Supabase.

---

## Paso a Paso: Deploy en Cloudflare (`finanzas.gonpa.com.ar`)

1. **Variables de Entorno de Build (Cloudflare Dashboard):**
   - En tu proyecto de Cloudflare (**Workers & Pages → Settings → Build → Variables and secrets**), agregá:
     - `VITE_SUPABASE_URL` = `https://<tu-project-ref>.supabase.co` *(sin `/rest/v1` al final)*
     - `VITE_SUPABASE_ANON_KEY` = `<tu-anon-key>`
     - `VITE_SUPABASE_SCHEMA` = `finanzas`
2. **Build Command & Output:**
   - Build command: `npm run build`
   - Build output directory: `dist`
   - El archivo [`wrangler.jsonc`](./wrangler.jsonc) ya incluye `"not_found_handling": "single-page-application"` para evitar errores 404 al recargar rutas.
3. **Vincular el subdominio `finanzas.gonpa.com.ar`:**
   - En Cloudflare **Workers & Pages → tu proyecto → Settings → Domains & Routes → Add → Custom domain**, escribí:
     `finanzas.gonpa.com.ar`
   - Cloudflare creará automáticamente el registro DNS CNAME/Worker en la zona `gonpa.com.ar` con certificado SSL activo.
