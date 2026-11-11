import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Cloud,
  Database,
  KeyRound,
  LogIn,
  LogOut,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  UploadCloud,
  X,
} from 'lucide-react';
import {
  clearSupabaseConfigLocal,
  fetchDatabaseFromSupabase,
  getSupabaseClient,
  getSupabaseConfig,
  saveSupabaseConfigLocal,
  syncDatabaseToSupabase,
} from '../lib/supabase';
import { AppDatabase } from '../types';

interface SupabaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  db: AppDatabase;
  onReplaceDatabase: (newDb: Partial<AppDatabase>) => void;
  onResetToSeed: () => void;
}

export const SupabaseModal: React.FC<SupabaseModalProps> = ({
  isOpen,
  onClose,
  db,
  onReplaceDatabase,
  onResetToSeed,
}) => {
  const existingCfg = getSupabaseConfig();
  const [url, setUrl] = useState(existingCfg?.url ?? '');
  const [anonKey, setAnonKey] = useState(existingCfg?.anonKey ?? '');
  const [schema, setSchema] = useState(existingCfg?.schema ?? 'finanzas');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const client = getSupabaseClient();
    if (client) {
      client.auth.getSession().then(({ data }) => {
        setUserEmail(data.session?.user?.email ?? null);
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSaveCredentials = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!url.trim() || !anonKey.trim()) {
      setErrorMsg('Completá la URL del proyecto y la Anon Key.');
      return;
    }
    saveSupabaseConfigLocal({
      url: url.trim(),
      anonKey: anonKey.trim(),
      schema: schema.trim() || 'finanzas',
    });
    setStatusMsg('Configuración guardada localmente (Esquema: ' + (schema.trim() || 'finanzas') + ').');
  };

  const handleAuthSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setStatusMsg(null);
    const client = getSupabaseClient();
    if (!client) {
      setErrorMsg('Primero guardá o configurá VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.');
      return;
    }
    setIsBusy(true);
    try {
      const { data, error } = await client.auth.signInWithPassword({
        email: email.trim(),
        password: password.trim(),
      });
      if (error) throw error;
      setUserEmail(data.user?.email ?? email.trim());
      setStatusMsg('Sesión iniciada correctamente en Supabase Auth.');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al iniciar sesión');
    } finally {
      setIsBusy(false);
    }
  };

  const handleSignOut = async () => {
    const client = getSupabaseClient();
    if (client) {
      await client.auth.signOut();
      setUserEmail(null);
      setStatusMsg('Sesión cerrada.');
    }
  };

  const handlePushToSupabase = async () => {
    setErrorMsg(null);
    setStatusMsg(null);
    const client = getSupabaseClient();
    if (!client) {
      setErrorMsg('Configurá primero las credenciales de Supabase.');
      return;
    }
    setIsBusy(true);
    try {
      await syncDatabaseToSupabase(client, db, (msg) => setStatusMsg(msg));
      setStatusMsg(
        '¡Sincronización completa! Todos los registros de Ingresos, Gastos Disc., Hipotecario (240 cuotas) y Splitwise fueron guardados en el esquema finanzas.'
      );
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Error al subir datos. Verificá haber corrido supabase/schema.sql y expuesto el esquema finanzas en Data API.'
      );
    } finally {
      setIsBusy(false);
    }
  };

  const handlePullFromSupabase = async () => {
    setErrorMsg(null);
    setStatusMsg(null);
    const client = getSupabaseClient();
    if (!client) {
      setErrorMsg('Configurá primero las credenciales de Supabase.');
      return;
    }
    setIsBusy(true);
    try {
      setStatusMsg('Descargando datos desde el esquema finanzas...');
      const remote = await fetchDatabaseFromSupabase(client);
      if (!remote) {
        setStatusMsg('El esquema finanzas está vacío en Supabase. Usá "Subir Histórico Excel" primero.');
      } else {
        onReplaceDatabase(remote);
        setStatusMsg('Datos descargados y sincronizados desde Supabase.');
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al descargar de Supabase');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl space-y-5 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <Database className="h-5 w-5 text-emerald-400" />
            <div>
              <h3 className="text-base font-bold text-slate-100">
                Supabase Cloud & Auth · Esquema Aislado <code className="text-emerald-400">finanzas</code>
              </h3>
              <p className="text-xs text-slate-400">
                Proyecto: gonpa-design · Aislado de <code>public</code> e <code>impresion3d</code>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {statusMsg && (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/40 p-3 text-xs text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{statusMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div className="rounded-xl border border-rose-500/40 bg-rose-950/40 p-3 text-xs text-rose-300">
            {errorMsg}
          </div>
        )}

        {/* Bloque 1: Autenticación de Usuario */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              Sesión Supabase Auth (RLS Activo)
            </h4>
            {userEmail && (
              <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300">
                Conectado: {userEmail}
              </span>
            )}
          </div>

          {userEmail ? (
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-slate-400">
                Tus políticas RLS vinculan los datos a tu usuario autenticado.
              </span>
              <button
                onClick={handleSignOut}
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-800 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-slate-700"
              >
                <LogOut className="h-3.5 w-3.5" />
                Cerrar Sesión
              </button>
            </div>
          ) : (
            <form onSubmit={handleAuthSignIn} className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email de usuario..."
                className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100"
              />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Contraseña..."
                className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100"
              />
              <button
                type="submit"
                disabled={isBusy}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
              >
                <LogIn className="h-3.5 w-3.5" />
                Iniciar Sesión
              </button>
            </form>
          )}
        </div>

        {/* Bloque 2: Acciones de Sincronización ETL / Cloud */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <button
            type="button"
            disabled={isBusy}
            onClick={handlePushToSupabase}
            className="flex flex-col items-start justify-between rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3.5 text-left hover:bg-emerald-950/40 transition disabled:opacity-50"
          >
            <UploadCloud className="h-5 w-5 text-emerald-400 mb-2" />
            <div className="text-xs font-bold text-slate-100">Subir Todo a Supabase</div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Sincroniza las 3.916 transacciones, 240 cuotas UVA y Splitwise al esquema finanzas.
            </div>
          </button>

          <button
            type="button"
            disabled={isBusy}
            onClick={handlePullFromSupabase}
            className="flex flex-col items-start justify-between rounded-xl border border-indigo-500/30 bg-indigo-950/20 p-3.5 text-left hover:bg-indigo-950/40 transition disabled:opacity-50"
          >
            <RefreshCw className="h-5 w-5 text-indigo-400 mb-2" />
            <div className="text-xs font-bold text-slate-100">Descargar de Supabase</div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Trae el estado más reciente desde las tablas del esquema finanzas.
            </div>
          </button>

          <button
            type="button"
            disabled={isBusy}
            onClick={() => {
              onResetToSeed();
              setStatusMsg('Base local restaurada a la semilla original del Excel.');
            }}
            className="flex flex-col items-start justify-between rounded-xl border border-slate-700 bg-slate-800/40 p-3.5 text-left hover:bg-slate-800 transition"
          >
            <RotateCcw className="h-5 w-5 text-amber-400 mb-2" />
            <div className="text-xs font-bold text-slate-100">Restaurar Semilla Excel</div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Recarga los datos originales de Ingresos, Gastos Disc. e Hipotecario.
            </div>
          </button>
        </div>

        {/* Bloque 3: Configuración Manual de Credenciales */}
        <form
          onSubmit={handleSaveCredentials}
          className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 space-y-3"
        >
          <div className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <KeyRound className="h-3.5 w-3.5 text-slate-400" />
            Conexión al Proyecto Supabase (Variables de Entorno o Local)
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="block text-[11px] text-slate-400 mb-1">
                VITE_SUPABASE_URL (se sanitiza /rest/v1 automáticamente)
              </label>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://xxxx.supabase.co"
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100"
              />
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
                VITE_SUPABASE_SCHEMA
              </label>
              <input
                type="text"
                value={schema}
                onChange={(e) => setSchema(e.target.value)}
                placeholder="finanzas"
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-bold text-emerald-400"
              />
            </div>

            <div className="sm:col-span-3">
              <label className="block text-[11px] text-slate-400 mb-1">
                VITE_SUPABASE_ANON_KEY
              </label>
              <input
                type="password"
                value={anonKey}
                onChange={(e) => setAnonKey(e.target.value)}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100"
              />
            </div>
          </div>

          <div className="flex justify-between items-center pt-1">
            <button
              type="button"
              onClick={() => {
                clearSupabaseConfigLocal();
                setStatusMsg('Credenciales locales borradas.');
              }}
              className="text-[11px] text-slate-500 hover:text-slate-300"
            >
              Limpiar config local
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-800 border border-slate-700 px-3.5 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700"
            >
              <Cloud className="h-3.5 w-3.5 text-emerald-400" />
              Guardar Conexión
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
