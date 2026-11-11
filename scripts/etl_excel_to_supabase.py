#!/usr/bin/env python3
"""
ETL Determinista: Ingresos - Gastos General.xlsx -> Esquema Supabase `finanzas`
Procesa e incorpora íntegramente:
1. Hoja `Ingresos` (2014 - 2026): Ingresos formales, Extras (Negro/Alquiler), Inversiones.
2. Hoja `Gastos Disc.` (2017 - 2026):
   - Servicios Básicos (Alquiler, Expensas, OSDE, Patente, Seguro Auto, Municipal, Fenosa, CableVision, Claro, Telecom, Celular, Aysa, Edenor, Monotributo, IIBB)
   - Efectivo - Débito (35 rubros detallados)
   - Tarjeta Cabal
   - Tarjeta Visa | BBVA (31 rubros detallados)
   - Auto (Pago + gastos + crédito, Seguro)
   - Crédito Hipotecario (Cuota UVA, Cuota pesos, Seguro)
   - Casa (Expensas, Expensas cochera, Electricidad, Gas, Agua, Internet, ARBA Inmobiliario)
   - Tarjeta Visa | Galicia
   - Tarjeta Mastercard | Galicia
   - Compra de Dólares (Monto ARS, Dólares eq. USD, Tipo de cambio implícito)
3. Hoja `Hipotecario` (240 cuotas UVA: 2025 - 2045, con amortización, interés, seguro, saldo UVA, MEP, USD).
4. Hoja `Nueva York 2026` (Gastos compartidos Splitwise en USD y ARS entre Gonza y Flor).
"""

import datetime
import json
import os
import re
import uuid
import openpyxl

EXCEL_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "Ingresos - Gastos General.xlsx")
SQL_OUT_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "supabase", "migration_etl_excel.sql")
JSON_OUT_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src", "data", "excel_seed.json")

NAMESPACE = uuid.UUID("6ba7b810-9dad-11d1-80b4-00c04fd430c8")


def det_uuid(key: str) -> str:
    return str(uuid.uuid5(NAMESPACE, f"finanzas.gonpa:{key}"))


def to_num(val) -> float:
    if val is None:
        return 0.0
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).strip()
    if not s or s == "-" or s.startswith("#"):
        return 0.0
    try:
        return float(s.replace(",", "."))
    except ValueError:
        return 0.0


# Mapeo de Cuentas / Medios de Pago detectados en Gastos Disc. e Ingresos
CUENTAS_DEF = [
    {
        "id": det_uuid("cuenta:banco_principal_ars"),
        "key": "banco_ars",
        "nombre": "Banco Principal (ARS)",
        "tipo": "banco",
        "institucion": "Banco Galicia / BBVA",
        "moneda": "ARS",
        "saldo_inicial": 163400.00,
        "color": "#10b981",
        "icono": "Landmark",
    },
    {
        "id": det_uuid("cuenta:efectivo_debito_ars"),
        "key": "efectivo_debito",
        "nombre": "Efectivo / Débito",
        "tipo": "efectivo",
        "institucion": "Caja & Débito Directo",
        "moneda": "ARS",
        "saldo_inicial": 0.00,
        "color": "#3b82f6",
        "icono": "Wallet",
    },
    {
        "id": det_uuid("cuenta:tarjeta_visa_bbva"),
        "key": "visa_bbva",
        "nombre": "Tarjeta Visa | BBVA",
        "tipo": "tarjeta_credito",
        "institucion": "BBVA",
        "moneda": "ARS",
        "saldo_inicial": 0.00,
        "color": "#6366f1",
        "icono": "CreditCard",
    },
    {
        "id": det_uuid("cuenta:tarjeta_visa_galicia"),
        "key": "visa_galicia",
        "nombre": "Tarjeta Visa | Galicia",
        "tipo": "tarjeta_credito",
        "institucion": "Banco Galicia",
        "moneda": "ARS",
        "saldo_inicial": 0.00,
        "color": "#f97316",
        "icono": "CreditCard",
    },
    {
        "id": det_uuid("cuenta:tarjeta_master_galicia"),
        "key": "master_galicia",
        "nombre": "Tarjeta Mastercard | Galicia",
        "tipo": "tarjeta_credito",
        "institucion": "Banco Galicia",
        "moneda": "ARS",
        "saldo_inicial": 0.00,
        "color": "#ef4444",
        "icono": "CreditCard",
    },
    {
        "id": det_uuid("cuenta:tarjeta_cabal"),
        "key": "cabal",
        "nombre": "Tarjeta Cabal",
        "tipo": "tarjeta_credito",
        "institucion": "Cabal",
        "moneda": "ARS",
        "saldo_inicial": 0.00,
        "color": "#8b5cf6",
        "icono": "CreditCard",
    },
    {
        "id": det_uuid("cuenta:inversiones_iol_ars"),
        "key": "iol_ars",
        "nombre": "IOL Inversiones (ARS)",
        "tipo": "inversion",
        "institucion": "InvertirOnline",
        "moneda": "ARS",
        "saldo_inicial": 65683.02,
        "color": "#eab308",
        "icono": "TrendingUp",
    },
    {
        "id": det_uuid("cuenta:ahorro_usd"),
        "key": "banco_usd",
        "nombre": "Caja de Ahorro / Caja (USD)",
        "tipo": "banco",
        "institucion": "Banco / Custodia USD",
        "moneda": "USD",
        "saldo_inicial": 61.96,
        "color": "#14b8a6",
        "icono": "DollarSign",
    },
]

CUENTAS_BY_KEY = {c["key"]: c["id"] for c in CUENTAS_DEF}

# Categorías estructurales
CATEGORIAS_DEF = [
    {"id": det_uuid("cat:Ingresos"), "nombre": "Ingresos", "tipo": "ingreso", "icono": "TrendingUp", "color": "#10b981", "orden": 1},
    {"id": det_uuid("cat:Servicios Basicos"), "nombre": "Servicios Básicos", "tipo": "gasto", "icono": "Zap", "color": "#3b82f6", "orden": 2},
    {"id": det_uuid("cat:Vivienda y Casa"), "nombre": "Vivienda y Casa", "tipo": "gasto", "icono": "Home", "color": "#0ea5e9", "orden": 3},
    {"id": det_uuid("cat:Credito Hipotecario"), "nombre": "Crédito Hipotecario", "tipo": "gasto", "icono": "Building2", "color": "#8b5cf6", "orden": 4},
    {"id": det_uuid("cat:Alimentacion y Super"), "nombre": "Alimentación y Supermercado", "tipo": "gasto", "icono": "ShoppingCart", "color": "#f59e0b", "orden": 5},
    {"id": det_uuid("cat:Transporte y Auto"), "nombre": "Transporte y Auto", "tipo": "gasto", "icono": "Car", "color": "#ef4444", "orden": 6},
    {"id": det_uuid("cat:Salud y Deporte"), "nombre": "Salud y Deporte", "tipo": "gasto", "icono": "HeartPulse", "color": "#ec4899", "orden": 7},
    {"id": det_uuid("cat:Ocio y Suscripciones"), "nombre": "Ocio, Salidas y Suscripciones", "tipo": "gasto", "icono": "Film", "color": "#a855f7", "orden": 8},
    {"id": det_uuid("cat:Compras y Hogar"), "nombre": "Compras, Ropa y Equipamiento", "tipo": "gasto", "icono": "ShoppingBag", "color": "#6366f1", "orden": 9},
    {"id": det_uuid("cat:Impuestos y Bancos"), "nombre": "Impuestos y Cargos Bancarios", "tipo": "gasto", "icono": "Landmark", "color": "#64748b", "orden": 10},
    {"id": det_uuid("cat:Viajes y Vacaciones"), "nombre": "Viajes y Vacaciones", "tipo": "gasto", "icono": "Plane", "color": "#14b8a6", "orden": 11},
    {"id": det_uuid("cat:Ahorro y Cambio"), "nombre": "Ahorro y Compra de Divisas", "tipo": "ambos", "icono": "Coins", "color": "#059669", "orden": 12},
]

CAT_BY_NAME = {c["nombre"]: c["id"] for c in CATEGORIAS_DEF}


def classify_gasto_disc_concept(concept: str, section: str) -> str:
    c = concept.lower()
    if section == "Credito Hipotecario" or "hipotecario" in c or "cuota uva" in c or "cuota pesos" in c:
        return CAT_BY_NAME["Crédito Hipotecario"]
    if section == "Casa" or any(k in c for k in ["alquiler", "expensas", "limpieza dpto", "plomero", "arreglos casa", "inmobiliario", "calefon"]):
        return CAT_BY_NAME["Vivienda y Casa"]
    if any(k in c for k in ["fenosa", "cablevision", "claro", "telecom", "celular", "aysa", "edenor", "municipal", "electricidad", "gas", "agua", "internet", "recargas celular"]):
        return CAT_BY_NAME["Servicios Básicos"]
    if section == "Auto" or any(k in c for k in ["auto", "patente", "nafta", "peajes", "combustible", "bicicleta", "bateria", "cabify", "sube", "estacionamiento", "registro conducir"]):
        return CAT_BY_NAME["Transporte y Auto"]
    if any(k in c for k in ["verduleria", "supermercado", "comida hecha", "dietetica", "mcdonalds", "kiosco", "panaderia", "heladeria", "carniceria", "pedidosya"]):
        return CAT_BY_NAME["Alimentación y Supermercado"]
    if any(k in c for k in ["osde", "obra social", "gimnasio", "psicologa", "remedios", "deportes", "peluqueria"]):
        return CAT_BY_NAME["Salud y Deporte"]
    if any(k in c for k in ["vacaciones"]):
        return CAT_BY_NAME["Viajes y Vacaciones"]
    if any(k in c for k in ["monotributo", "ingresos brutos", "banco frances", "gastos admin"]):
        return CAT_BY_NAME["Impuestos y Cargos Bancarios"]
    if any(k in c for k in ["salida con amigos", "cine", "spotify", "meli", "disney", "videojuegos", "areaticket", "cumpleaños", "regalos"]):
        return CAT_BY_NAME["Ocio, Salidas y Suscripciones"]
    return CAT_BY_NAME["Compras, Ropa y Equipamiento"]


def parse_ingresos(wb) -> list:
    ws = wb["Ingresos"]
    txs = []
    current_year = None
    for r in range(2, ws.max_row + 1):
        label = ws.cell(r, 1).value
        if label is None:
            continue
        label_str = str(label).strip()
        if label_str.startswith("Año "):
            m = re.search(r"(\d{4})", label_str)
            if m:
                current_year = int(m.group(1))
            continue
        if not current_year or label_str.lower() == "total":
            continue

        # Determinar subtipo de ingreso
        if "negro" in label_str.lower() or "extra" in label_str.lower():
            condicion = "negro"
            cuenta_id = CUENTAS_BY_KEY["efectivo_debito"]
            concepto_norm = label_str
        elif "inversion" in label_str.lower():
            condicion = "blanco"
            cuenta_id = CUENTAS_BY_KEY["iol_ars"]
            concepto_norm = "Rendimientos de Inversiones"
        else:
            condicion = "blanco"
            cuenta_id = CUENTAS_BY_KEY["banco_ars"]
            concepto_norm = "Ingresos Formales / Sueldo"

        for month_idx in range(1, 13):
            col = month_idx + 1  # Col 2 = Enero .. Col 13 = Diciembre
            val = to_num(ws.cell(r, col).value)
            if val <= 0:
                continue
            fecha = f"{current_year}-{month_idx:02d}-05"
            tx_id = det_uuid(f"ingresos:{current_year}:{month_idx}:{label_str}")
            txs.append({
                "id": tx_id,
                "cuenta_id": cuenta_id,
                "cuenta_destino_id": None,
                "tipo": "ingreso",
                "concepto": f"{concepto_norm} ({month_idx:02d}/{current_year})",
                "monto": round(val, 2),
                "monto_caja": round(val, 2),
                "moneda": "ARS",
                "fecha": fecha,
                "categoria_id": CAT_BY_NAME["Ingresos"],
                "condicion_fiscal": condicion,
                "estado_pago": "pagado",
                "es_recurrente": True,
                "observaciones": f"Importado de hoja Ingresos · {label_str}",
                "origen_hoja_excel": "Ingresos",
                "metadatos": {
                    "anio": current_year,
                    "mes": month_idx,
                    "rubro_original": label_str,
                    "seccion": "Ingresos",
                },
            })
    return txs


def parse_gastos_disc(wb) -> list:
    ws = wb["Gastos Disc."]
    txs = []

    # Detectar bloques de años en la fila 2:
    # (2, 'Año 2017'), (15, 'Año 2018'), ..., (119, 'Año 2026')
    year_blocks = []
    for c in range(1, ws.max_column + 1):
        v = ws.cell(2, c).value
        if v and "Año" in str(v):
            m = re.search(r"(\d{4})", str(v))
            if m:
                year_blocks.append((int(m.group(1)), c))

    # Mapear filas de Gastos Disc. a secciones y cuentas
    # R3..R17: Basicos
    # R25..R59: Efectivo - Debito
    # R62..R67: Tarjeta Cabal
    # R70..R100: Tarjeta Visa | BBVA
    # R103..R104: Auto
    # R107..R109: Credito Hipotecario (R108 = Cuota pesos, R109 = Seguro; R107 = Cuota UVA o Pesos en 2026)
    # R112..R118: Casa
    # R121..R129: Tarjeta Visa | Galicia
    # R132..R133: Tarjeta Mastercard | Galicia
    # R135..R137: Compra dolares

    def get_row_section(r: int):
        if 3 <= r <= 17:
            return ("Servicios Básicos", CUENTAS_BY_KEY["banco_ars"])
        if 25 <= r <= 59:
            return ("Efectivo - Débito", CUENTAS_BY_KEY["efectivo_debito"])
        if 62 <= r <= 67:
            return ("Tarjeta Cabal", CUENTAS_BY_KEY["cabal"])
        if 70 <= r <= 100:
            return ("Tarjeta Visa | BBVA", CUENTAS_BY_KEY["visa_bbva"])
        if 103 <= r <= 104:
            return ("Auto", CUENTAS_BY_KEY["banco_ars"])
        if 112 <= r <= 118:
            return ("Casa", CUENTAS_BY_KEY["banco_ars"])
        if 121 <= r <= 129:
            return ("Tarjeta Visa | Galicia", CUENTAS_BY_KEY["visa_galicia"])
        if 132 <= r <= 133:
            return ("Tarjeta Mastercard | Galicia", CUENTAS_BY_KEY["master_galicia"])
        return None

    for year, start_col in year_blocks:
        for month_idx in range(1, 13):
            col = start_col + (month_idx - 1)
            fecha = f"{year}-{month_idx:02d}-10"

            # 1. Filas estándar de gasto por sección
            for r in range(3, 135):
                sec_info = get_row_section(r)
                if not sec_info:
                    continue
                section_name, cuenta_id = sec_info
                concept = ws.cell(r, 1).value
                if not concept:
                    continue
                concept_str = str(concept).strip()
                raw_val = to_num(ws.cell(r, col).value)
                if raw_val == 0:
                    continue

                # Si hay un valor negativo (ej. reintegro en tarjeta), lo tratamos como ingreso/reintegro o ajuste
                tipo_tx = "gasto" if raw_val > 0 else "ingreso"
                monto_abs = round(abs(raw_val), 2)
                cat_id = classify_gasto_disc_concept(concept_str, section_name)

                tx_id = det_uuid(f"gastos_disc:{year}:{month_idx}:R{r}:{concept_str}")
                txs.append({
                    "id": tx_id,
                    "cuenta_id": cuenta_id,
                    "cuenta_destino_id": None,
                    "tipo": tipo_tx,
                    "concepto": f"{concept_str} ({section_name})",
                    "monto": monto_abs,
                    "monto_caja": monto_abs,
                    "moneda": "ARS",
                    "fecha": fecha,
                    "categoria_id": cat_id,
                    "condicion_fiscal": "blanco",
                    "estado_pago": "pagado",
                    "es_recurrente": section_name in ("Servicios Básicos", "Casa"),
                    "observaciones": f"Hoja Gastos Disc. · Sección: {section_name}",
                    "origen_hoja_excel": "Gastos Disc.",
                    "metadatos": {
                        "anio": year,
                        "mes": month_idx,
                        "fila_excel": r,
                        "rubro_original": concept_str,
                        "seccion": section_name,
                    },
                })

            # 2. Bloque especial: Crédito Hipotecario en Gastos Disc. (R107, R108, R109)
            # En 2025: R107 = Cuota UVA (662.5, 485.64...), R108 = Cuota pesos (960602.38...), R109 = Seguro (10097.15...)
            # En 2026: R107 tiene la Cuota en Pesos (830752.17...) y R108 tiene el Seguro en Pesos (8468.47...)!
            r107 = to_num(ws.cell(107, col).value)
            r108 = to_num(ws.cell(108, col).value)
            r109 = to_num(ws.cell(109, col).value)

            if year == 2025:
                cuota_uva = r107
                cuota_ars = r108
                seguro_ars = r109
            else:
                # En 2026 pusieron la cuota en ARS en la fila 107 y el seguro en ARS en la fila 108
                cuota_uva = 0.0
                cuota_ars = r107 if r107 > 5000 else r108
                seguro_ars = r108 if r107 > 5000 else r109

            total_hip_mes = round(cuota_ars + seguro_ars, 2)
            if total_hip_mes > 0:
                tx_id = det_uuid(f"gastos_disc:{year}:{month_idx}:R110:CreditoHipotecario")
                txs.append({
                    "id": tx_id,
                    "cuenta_id": CUENTAS_BY_KEY["banco_ars"],
                    "cuenta_destino_id": None,
                    "tipo": "gasto",
                    "concepto": f"Cuota Crédito Hipotecario UVA ({month_idx:02d}/{year})",
                    "monto": total_hip_mes,
                    "monto_caja": total_hip_mes,
                    "moneda": "ARS",
                    "fecha": f"{year}-{month_idx:02d}-15",
                    "categoria_id": CAT_BY_NAME["Crédito Hipotecario"],
                    "condicion_fiscal": "blanco",
                    "estado_pago": "pagado",
                    "es_recurrente": True,
                    "observaciones": f"Cuota ARS: ${cuota_ars:,.2f} + Seguro: ${seguro_ars:,.2f}" + (f" ({cuota_uva} UVAs)" if cuota_uva > 0 else ""),
                    "origen_hoja_excel": "Gastos Disc.",
                    "metadatos": {
                        "anio": year,
                        "mes": month_idx,
                        "seccion": "Credito Hipotecario",
                        "rubro_original": "Crédito Hipotecario + Seguro",
                        "cuota_ars": cuota_ars,
                        "seguro_ars": seguro_ars,
                        "cuota_uva": cuota_uva,
                    },
                })

            # 3. Bloque especial: Compra de Dólares (R135 = ARS pagados, R136 = USD comprados, R137 = TC)
            ars_dolares = to_num(ws.cell(135, col).value)
            usd_comprados = to_num(ws.cell(136, col).value)
            tc_usd = to_num(ws.cell(137, col).value)
            if ars_dolares > 0:
                tx_id = det_uuid(f"gastos_disc:{year}:{month_idx}:R135:CompraDolares")
                txs.append({
                    "id": tx_id,
                    "cuenta_id": CUENTAS_BY_KEY["banco_ars"],
                    "cuenta_destino_id": CUENTAS_BY_KEY["banco_usd"],
                    "tipo": "transferencia",
                    "concepto": f"Compra de Dólares: USD {usd_comprados:,.2f}" if usd_comprados > 0 else "Compra de Dólares",
                    "monto": round(ars_dolares, 2),
                    "monto_caja": round(ars_dolares, 2),
                    "moneda": "ARS",
                    "cotizacion_ars": round(tc_usd, 4) if tc_usd > 0 else None,
                    "fecha": f"{year}-{month_idx:02d}-12",
                    "categoria_id": CAT_BY_NAME["Ahorro y Compra de Divisas"],
                    "condicion_fiscal": "blanco",
                    "estado_pago": "pagado",
                    "es_recurrente": False,
                    "observaciones": f"Compra USD {usd_comprados:,.2f} a TC ${tc_usd:,.2f}",
                    "origen_hoja_excel": "Gastos Disc.",
                    "metadatos": {
                        "anio": year,
                        "mes": month_idx,
                        "seccion": "Compra Dólares",
                        "rubro_original": "Compra dolares",
                        "usd_comprados": usd_comprados,
                        "tipo_cambio": tc_usd,
                    },
                })

    return txs


def parse_hipotecario(wb) -> dict:
    ws = wb["Hipotecario"]
    ws_gd = wb["Gastos Disc."]
    prestamo_id = det_uuid("prestamo:hipotecario_uva_240")

    cuotas = []
    # Cuota 1/240 (Mayo 2025) extraída de Gastos Disc. col 110 (Mayo 2025)
    c1_uva = to_num(ws_gd.cell(107, 110).value)  # 662.5
    c1_ars = to_num(ws_gd.cell(108, 110).value)  # 960602.38
    c1_seg = to_num(ws_gd.cell(109, 110).value)  # 10603.0
    cuotas.append({
        "id": det_uuid("hipotecario:cuota:1"),
        "prestamo_id": prestamo_id,
        "numero_cuota": 1,
        "etiqueta_cuota": "1/240",
        "fecha_vencimiento": "2025-05-15",
        "valor_uva": round(c1_ars / c1_uva, 4) if c1_uva > 0 else 1449.97,
        "amortizacion_uva": 131.45,
        "interes_uva": 349.19,
        "intereses_ars": round(349.19 * (c1_ars / c1_uva), 2) if c1_uva > 0 else 506315.0,
        "impuestos_ars": 0.0,
        "seguro_uva": 7.31,
        "seguro_ars": round(c1_seg, 2),
        "cuota_total_uva": round(c1_uva, 4),
        "cuota_total_ars": round(c1_ars + c1_seg, 2),
        "saldo_deuda_uva": 64338.43,
        "cotizacion_mep": 1180.00,
        "cuota_usd": round((c1_ars + c1_seg) / 1180.0, 2),
        "deuda_ars": round(64338.43 * (c1_ars / c1_uva), 2) if c1_uva > 0 else 93288792.0,
        "deuda_usd": round((64338.43 * (c1_ars / c1_uva)) / 1180.0, 2) if c1_uva > 0 else 79058.30,
        "pagada": True,
    })

    # Cuotas 2/240 a 240/240 desde la hoja Hipotecario
    for r in range(2, ws.max_row + 1):
        etiq = ws.cell(r, 1).value
        if not etiq or "/" not in str(etiq):
            continue
        etiq_str = str(etiq).strip()
        num_cuota = int(etiq_str.split("/")[0])
        raw_date = ws.cell(r, 2).value
        if isinstance(raw_date, datetime.datetime):
            fecha_vto = raw_date.strftime("%Y-%m-%d")
        else:
            fecha_vto = str(raw_date)[:10]

        valor_uva = to_num(ws.cell(r, 3).value)
        amort_uva = to_num(ws.cell(r, 4).value)
        interes_uva = to_num(ws.cell(r, 5).value)
        intereses_ars = to_num(ws.cell(r, 6).value)
        impuestos_ars = to_num(ws.cell(r, 7).value)
        seguro_uva = to_num(ws.cell(r, 8).value)
        seguro_ars = to_num(ws.cell(r, 9).value)
        cuota_uva = to_num(ws.cell(r, 10).value)
        cuota_ars = to_num(ws.cell(r, 11).value)
        saldo_uva = to_num(ws.cell(r, 12).value)
        mep = to_num(ws.cell(r, 13).value)
        cuota_usd = to_num(ws.cell(r, 14).value)
        deuda_ars = to_num(ws.cell(r, 16).value)
        deuda_usd = to_num(ws.cell(r, 17).value)

        # Se considera pagada si tiene Valor UVA cargado o si en Gastos Disc. 2026 ya tiene cuota en pesos cargada
        pagada = bool(valor_uva > 0 or (cuota_ars > 0 and fecha_vto <= "2026-08-15"))

        cuotas.append({
            "id": det_uuid(f"hipotecario:cuota:{num_cuota}"),
            "prestamo_id": prestamo_id,
            "numero_cuota": num_cuota,
            "etiqueta_cuota": etiq_str,
            "fecha_vencimiento": fecha_vto,
            "valor_uva": round(valor_uva, 4) if valor_uva > 0 else None,
            "amortizacion_uva": round(amort_uva, 4),
            "interes_uva": round(interes_uva, 4),
            "intereses_ars": round(intereses_ars, 2) if intereses_ars > 0 else None,
            "impuestos_ars": round(impuestos_ars, 2),
            "seguro_uva": round(seguro_uva, 4),
            "seguro_ars": round(seguro_ars, 2) if seguro_ars > 0 else None,
            "cuota_total_uva": round(cuota_uva, 4),
            "cuota_total_ars": round(cuota_ars, 2) if cuota_ars > 0 else None,
            "saldo_deuda_uva": round(saldo_uva, 4),
            "cotizacion_mep": round(mep, 4) if mep > 0 else None,
            "cuota_usd": round(cuota_usd, 2) if cuota_usd > 0 else None,
            "deuda_ars": round(deuda_ars, 2) if deuda_ars > 0 else None,
            "deuda_usd": round(deuda_usd, 2) if deuda_usd > 0 else None,
            "pagada": pagada,
        })

    cuotas_pagadas_count = sum(1 for c in cuotas if c["pagada"])
    prestamo = {
        "id": prestamo_id,
        "nombre": "Crédito Hipotecario UVA (240 Cuotas)",
        "tipo": "hipotecario_uva",
        "moneda_original": "UVA",
        "total_cuotas": 240,
        "cuotas_pagadas": cuotas_pagadas_count,
        "monto_capital_total": 64338.43,
        "notas": "Crédito Hipotecario en UVAs a 20 años (Vencimiento día 15 de cada mes, 2025-2045).",
        "activo": True,
        "cuotas": cuotas,
    }
    return prestamo


def parse_splitwise_ny2026(wb) -> dict:
    ws = wb["Nueva York 2026"]
    grupo_id = det_uuid("grupo:nueva_york_2026")
    miembro_gonza_id = det_uuid("miembro:ny2026:gonza")
    miembro_flor_id = det_uuid("miembro:ny2026:flor")

    gastos = []
    for r in range(2, ws.max_row + 1):
        desc = ws.cell(r, 1).value
        moneda = ws.cell(r, 2).value
        valor = to_num(ws.cell(r, 3).value)
        pago = ws.cell(r, 4).value
        if not desc or valor <= 0 or not pago:
            continue
        desc_str = str(desc).strip()
        moneda_str = str(moneda).strip().upper() if moneda else "USD"
        if moneda_str not in ("USD", "ARS", "EUR"):
            moneda_str = "USD"
        pago_str = str(pago).strip()
        pagador_id = miembro_gonza_id if "gonz" in pago_str.lower() else miembro_flor_id
        pagador_nombre = "Gonza" if pagador_id == miembro_gonza_id else "Flor"

        mitad = round(valor / 2.0, 2)
        resto = round(valor - mitad, 2)
        gasto_id = det_uuid(f"ny2026:R{r}:{desc_str}")
        gastos.append({
            "id": gasto_id,
            "grupo_id": grupo_id,
            "descripcion": desc_str,
            "monto_total": round(valor, 2),
            "moneda": moneda_str,
            "fecha": "2026-09-01",
            "categoria_id": CAT_BY_NAME["Viajes y Vacaciones"],
            "metodo_division": "equitativo",
            "notas": f"Importado de hoja Nueva York 2026 (Fila {r})",
            "origen_migracion": "Nueva York 2026",
            "pagadores": [
                {
                    "id": det_uuid(f"ny2026:pagador:R{r}"),
                    "miembro_id": pagador_id,
                    "nombre_pagador": pagador_nombre,
                    "monto_pagado": round(valor, 2),
                }
            ],
            "divisiones": [
                {
                    "id": det_uuid(f"ny2026:div:gonza:R{r}"),
                    "miembro_id": miembro_gonza_id,
                    "nombre_participante": "Gonza",
                    "monto_debido": mitad,
                    "porcentaje": 50.0,
                },
                {
                    "id": det_uuid(f"ny2026:div:flor:R{r}"),
                    "miembro_id": miembro_flor_id,
                    "nombre_participante": "Flor",
                    "monto_debido": resto,
                    "porcentaje": 50.0,
                },
            ],
        })

    return {
        "id": grupo_id,
        "nombre": "Nueva York & Miami 2026",
        "descripcion": "Viaje compartido NY / Washington / Miami (US Open & Inter Miami)",
        "tipo_grupo": "viaje",
        "moneda_principal": "USD",
        "simplificar_deudas": True,
        "icono": "Plane",
        "color": "#ec4899",
        "miembros": [
            {"id": miembro_gonza_id, "grupo_id": grupo_id, "nombre_display": "Gonza", "rol": "admin", "porcentaje_defecto": 50.0},
            {"id": miembro_flor_id, "grupo_id": grupo_id, "nombre_display": "Flor", "rol": "miembro", "porcentaje_defecto": 50.0},
        ],
        "gastos": gastos,
    }


def sql_str(val) -> str:
    if val is None:
        return "NULL"
    return "'" + str(val).replace("'", "''") + "'"


def sql_num(val) -> str:
    if val is None:
        return "NULL"
    return str(val)


def generate_sql(txs_ingresos, txs_gastos_disc, prestamo_hip, grupo_ny) -> str:
    lines = [
        "-- =============================================================================",
        "-- MIGRACIÓN ETL DETERMINISTA DESDE EXCEL: Ingresos, Gastos Disc., Hipotecario",
        "-- Esquema destino: finanzas (Supabase PostgreSQL)",
        "-- =============================================================================",
        "BEGIN;",
        "",
        "DO $$",
        "DECLARE",
        "  v_uid uuid;",
        "BEGIN",
        "  -- Si ya existe un usuario en auth.users (ej. cuenta de Gonzalo), le vincula los datos",
        "  SELECT id INTO v_uid FROM auth.users ORDER BY created_at ASC LIMIT 1;",
        "",
        "  -- 1. Cuentas / Medios de Pago",
    ]

    for c in CUENTAS_DEF:
        lines.append(
            f"  INSERT INTO finanzas.cuentas (id, user_id, nombre, tipo, institucion, moneda, saldo_inicial, saldo_actual, color, icono) "
            f"VALUES ({sql_str(c['id'])}, v_uid, {sql_str(c['nombre'])}, {sql_str(c['tipo'])}, {sql_str(c['institucion'])}, "
            f"{sql_str(c['moneda'])}, {c['saldo_inicial']}, {c['saldo_inicial']}, {sql_str(c['color'])}, {sql_str(c['icono'])}) "
            f"ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre, institucion = EXCLUDED.institucion;"
        )

    lines.append("")
    lines.append("  -- 2. Categorías Estructurales")
    for cat in CATEGORIAS_DEF:
        lines.append(
            f"  INSERT INTO finanzas.categorias (id, user_id, nombre, tipo, icono, color, orden) "
            f"VALUES ({sql_str(cat['id'])}, NULL, {sql_str(cat['nombre'])}, {sql_str(cat['tipo'])}, "
            f"{sql_str(cat['icono'])}, {sql_str(cat['color'])}, {cat['orden']}) "
            f"ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre, color = EXCLUDED.color;"
        )

    lines.append("")
    lines.append("  -- 3. Préstamo Hipotecario UVA (240 Cuotas)")
    lines.append(
        f"  INSERT INTO finanzas.prestamos_creditos (id, user_id, nombre, tipo, moneda_original, total_cuotas, cuotas_pagadas, monto_capital_total, notas, activo) "
        f"VALUES ({sql_str(prestamo_hip['id'])}, v_uid, {sql_str(prestamo_hip['nombre'])}, {sql_str(prestamo_hip['tipo'])}, "
        f"'UVA', {prestamo_hip['total_cuotas']}, {prestamo_hip['cuotas_pagadas']}, {prestamo_hip['monto_capital_total']}, {sql_str(prestamo_hip['notas'])}, true) "
        f"ON CONFLICT (id) DO UPDATE SET cuotas_pagadas = EXCLUDED.cuotas_pagadas, monto_capital_total = EXCLUDED.monto_capital_total;"
    )

    # Cuotas Hipotecario en bloque compacto
    cuota_rows = []
    for q in prestamo_hip["cuotas"]:
        cuota_rows.append(
            f"    ({sql_str(q['id'])}, {sql_str(q['prestamo_id'])}, v_uid, {q['numero_cuota']}, {sql_str(q['etiqueta_cuota'])}, {sql_str(q['fecha_vencimiento'])}, "
            f"{sql_num(q['valor_uva'])}, {sql_num(q['amortizacion_uva'])}, {sql_num(q['interes_uva'])}, {sql_num(q['intereses_ars'])}, {sql_num(q['impuestos_ars'])}, "
            f"{sql_num(q['seguro_uva'])}, {sql_num(q['seguro_ars'])}, {sql_num(q['cuota_total_uva'])}, {sql_num(q['cuota_total_ars'])}, {sql_num(q['saldo_deuda_uva'])}, "
            f"{sql_num(q['cotizacion_mep'])}, {sql_num(q['cuota_usd'])}, {sql_num(q['deuda_ars'])}, {sql_num(q['deuda_usd'])}, {str(q['pagada']).lower()})"
        )
    lines.append(
        "  INSERT INTO finanzas.prestamos_cuotas ("
        "id, prestamo_id, user_id, numero_cuota, etiqueta_cuota, fecha_vencimiento, "
        "valor_uva, amortizacion_uva, interes_uva, intereses_ars, impuestos_ars, "
        "seguro_uva, seguro_ars, cuota_total_uva, cuota_total_ars, saldo_deuda_uva, "
        "cotizacion_mep, cuota_usd, deuda_ars, deuda_usd, pagada) VALUES\n"
        + ",\n".join(cuota_rows)
        + "\n  ON CONFLICT (id) DO UPDATE SET "
        "valor_uva = EXCLUDED.valor_uva, cuota_total_ars = EXCLUDED.cuota_total_ars, "
        "cotizacion_mep = EXCLUDED.cotizacion_mep, cuota_usd = EXCLUDED.cuota_usd, "
        "deuda_ars = EXCLUDED.deuda_ars, deuda_usd = EXCLUDED.deuda_usd, pagada = EXCLUDED.pagada;"
    )

    lines.append("")
    lines.append(f"  -- 4. Transacciones Históricas de Ingresos ({len(txs_ingresos)} registros) y Gastos Disc. ({len(txs_gastos_disc)} registros)")
    lines.append("  ALTER TABLE finanzas.transacciones DISABLE TRIGGER after_transaccion_saldo;")

    all_txs = txs_ingresos + txs_gastos_disc
    batch_size = 500
    for i in range(0, len(all_txs), batch_size):
        batch = all_txs[i:i + batch_size]
        tx_rows = []
        for tx in batch:
            meta_json = json.dumps(tx["metadatos"], ensure_ascii=False, separators=(",", ":")).replace("'", "''")
            tx_rows.append(
                f"    ({sql_str(tx['id'])}, v_uid, {sql_str(tx['cuenta_id'])}, {sql_str(tx.get('cuenta_destino_id'))}, "
                f"{sql_str(tx['tipo'])}, {sql_str(tx['concepto'])}, {tx['monto']}, {tx['monto_caja']}, "
                f"{sql_str(tx['moneda'])}, {sql_num(tx.get('cotizacion_ars'))}, {sql_str(tx['fecha'])}, {sql_str(tx['categoria_id'])}, "
                f"{sql_str(tx['condicion_fiscal'])}, {sql_str(tx['estado_pago'])}, {str(tx['es_recurrente']).lower()}, "
                f"{sql_str(tx['observaciones'])}, {sql_str(tx['origen_hoja_excel'])}, '{meta_json}'::jsonb)"
            )
        lines.append(
            "  INSERT INTO finanzas.transacciones ("
            "id, user_id, cuenta_id, cuenta_destino_id, tipo, concepto, monto, monto_caja, "
            "moneda, cotizacion_ars, fecha, categoria_id, condicion_fiscal, estado_pago, "
            "es_recurrente, observaciones, origen_hoja_excel, metadatos) VALUES\n"
            + ",\n".join(tx_rows)
            + "\n  ON CONFLICT (id) DO UPDATE SET monto = EXCLUDED.monto, monto_caja = EXCLUDED.monto_caja, metadatos = EXCLUDED.metadatos;"
        )

    lines.append("  ALTER TABLE finanzas.transacciones ENABLE TRIGGER after_transaccion_saldo;")

    lines.append("")
    lines.append("  -- 5. Grupo Splitwise: Nueva York 2026")
    lines.append(
        f"  INSERT INTO finanzas.grupos (id, creado_por, nombre, descripcion, tipo_grupo, moneda_principal, simplificar_deudas, icono, color) "
        f"VALUES ({sql_str(grupo_ny['id'])}, v_uid, {sql_str(grupo_ny['nombre'])}, {sql_str(grupo_ny['descripcion'])}, "
        f"'viaje', 'USD', true, 'Plane', '#ec4899') ON CONFLICT (id) DO NOTHING;"
    )
    for m in grupo_ny["miembros"]:
        user_ref = "v_uid" if m["nombre_display"] == "Gonza" else "NULL"
        lines.append(
            f"  INSERT INTO finanzas.grupos_miembros (id, grupo_id, user_id, nombre_display, rol, porcentaje_defecto) "
            f"VALUES ({sql_str(m['id'])}, {sql_str(m['grupo_id'])}, {user_ref}, {sql_str(m['nombre_display'])}, "
            f"{sql_str(m['rol'])}, {m['porcentaje_defecto']}) ON CONFLICT (id) DO NOTHING;"
        )
    for g in grupo_ny["gastos"]:
        lines.append(
            f"  INSERT INTO finanzas.gastos_compartidos (id, creado_por, grupo_id, descripcion, monto_total, moneda, fecha, categoria_id, metodo_division, notas, origen_migracion) "
            f"VALUES ({sql_str(g['id'])}, v_uid, {sql_str(g['grupo_id'])}, {sql_str(g['descripcion'])}, {g['monto_total']}, "
            f"{sql_str(g['moneda'])}, {sql_str(g['fecha'])}, {sql_str(g['categoria_id'])}, 'equitativo', {sql_str(g['notas'])}, 'Nueva York 2026') "
            f"ON CONFLICT (id) DO NOTHING;"
        )
        for p in g["pagadores"]:
            user_ref = "v_uid" if p["nombre_pagador"] == "Gonza" else "NULL"
            lines.append(
                f"  INSERT INTO finanzas.gastos_pagadores (id, gasto_compartido_id, miembro_id, user_id, nombre_pagador, monto_pagado) "
                f"VALUES ({sql_str(p['id'])}, {sql_str(g['id'])}, {sql_str(p['miembro_id'])}, {user_ref}, "
                f"{sql_str(p['nombre_pagador'])}, {p['monto_pagado']}) ON CONFLICT (id) DO NOTHING;"
            )
        for d in g["divisiones"]:
            user_ref = "v_uid" if d["nombre_participante"] == "Gonza" else "NULL"
            lines.append(
                f"  INSERT INTO finanzas.divisiones_gasto (id, gasto_compartido_id, miembro_id, user_id, nombre_participante, monto_debido, porcentaje) "
                f"VALUES ({sql_str(d['id'])}, {sql_str(g['id'])}, {sql_str(d['miembro_id'])}, {user_ref}, "
                f"{sql_str(d['nombre_participante'])}, {d['monto_debido']}, {d['porcentaje']}) ON CONFLICT (id) DO NOTHING;"
            )

    lines.append("")
    lines.append("  -- 6. Recalcular saldos de todas las cuentas")
    for c in CUENTAS_DEF:
        lines.append(f"  PERFORM finanzas.fn_recalcular_saldo_cuenta({sql_str(c['id'])});")

    lines.append("END $$;")
    lines.append("COMMIT;")
    return "\n".join(lines)


def main():
    wb = openpyxl.load_workbook(EXCEL_PATH, data_only=True)
    txs_ingresos = parse_ingresos(wb)
    txs_gastos_disc = parse_gastos_disc(wb)
    prestamo_hip = parse_hipotecario(wb)
    grupo_ny = parse_splitwise_ny2026(wb)

    os.makedirs(os.path.dirname(SQL_OUT_PATH), exist_ok=True)
    os.makedirs(os.path.dirname(JSON_OUT_PATH), exist_ok=True)

    sql_content = generate_sql(txs_ingresos, txs_gastos_disc, prestamo_hip, grupo_ny)
    with open(SQL_OUT_PATH, "w", encoding="utf-8") as f:
        f.write(sql_content)

    seed_payload = {
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "stats": {
            "ingresos_count": len(txs_ingresos),
            "gastos_disc_count": len(txs_gastos_disc),
            "hipotecario_cuotas": len(prestamo_hip["cuotas"]),
            "splitwise_ny_gastos": len(grupo_ny["gastos"]),
        },
        "cuentas": CUENTAS_DEF,
        "categorias": CATEGORIAS_DEF,
        "transacciones": txs_ingresos + txs_gastos_disc,
        "prestamo_hipotecario": prestamo_hip,
        "grupos_splitwise": [grupo_ny],
    }

    with open(JSON_OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(seed_payload, f, ensure_ascii=False, indent=2)

    print("=== ETL COMPLETADO CON ÉXITO ===")
    print(f"  - Transacciones de 'Ingresos' (2014-2026):      {len(txs_ingresos)} registros")
    print(f"  - Transacciones de 'Gastos Disc.' (2017-2026):  {len(txs_gastos_disc)} registros")
    print(f"  - Cuotas de 'Hipotecario' UVA (1/240 a 240/240): {len(prestamo_hip['cuotas'])} cuotas")
    print(f"  - Gastos compartidos 'Nueva York 2026':         {len(grupo_ny['gastos'])} registros")
    print(f"  - SQL generado en: {SQL_OUT_PATH} ({len(sql_content) / 1024:.1f} KB)")
    print(f"  - JSON generado en: {JSON_OUT_PATH}")


if __name__ == "__main__":
    main()
