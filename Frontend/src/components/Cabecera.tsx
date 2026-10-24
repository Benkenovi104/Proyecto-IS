// Cabecera común (pantallas 2 y 5 de Stitch): marca, selector de roles y sesión activa.
import { type ReactNode, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { RUTA_INICIO, useAuth } from '../auth/AuthContext';
import { mensajeError } from '../lib/api';
import { iniciales, NOMBRE_ROL } from '../lib/formato';
import type { Rol } from '../lib/tipos';
import { useToast } from './Toast';
import { cx, Icono } from './ui';

const ROLES: { rol: Rol; icono: string }[] = [
  { rol: 'ADMINISTRADOR', icono: 'admin_panel_settings' },
  { rol: 'ORGANIZADOR', icono: 'calendar_month' },
  { rol: 'COMPRADOR', icono: 'shopping_bag' },
  { rol: 'CONTROLADOR', icono: 'qr_code_scanner' },
];

const DESCRIPCION_VISTA: Record<Rol, string> = {
  ADMINISTRADOR: 'Administrador de Salas',
  ORGANIZADOR: 'Organizador',
  COMPRADOR: 'Comprador',
  CONTROLADOR: 'Controlador de Acceso',
};

export function Cabecera({ subbarra }: { subbarra?: ReactNode }) {
  const { usuario, demoHabilitado, ingresarDemo, cerrarSesion } = useAuth();
  const navegar = useNavigate();
  const toast = useToast();
  const [menu, setMenu] = useState(false);
  const [cambiando, setCambiando] = useState<Rol | null>(null);

  const cambiarRol = async (rol: Rol) => {
    if (usuario?.rol === rol) return navegar(RUTA_INICIO[rol]);
    setCambiando(rol);
    try {
      const u = await ingresarDemo(rol);
      toast(`Vista de ${NOMBRE_ROL[rol]}: sesión de ${u.nombre}`, 'info');
      navegar(RUTA_INICIO[rol]);
    } catch (e) {
      toast(mensajeError(e), 'error');
    } finally {
      setCambiando(null);
    }
  };

  const subtitulo = usuario
    ? usuario.rol === 'ORGANIZADOR'
      ? usuario.productora
      : usuario.rol === 'CONTROLADOR'
        ? usuario.puntoAcceso
        : NOMBRE_ROL[usuario.rol]
    : null;

  return (
    <header className="sticky top-0 z-50 border-b border-nv-line bg-surface-container-lowest/95 shadow-[0_1px_8px_rgba(0,0,0,0.5)] backdrop-blur-xl">
      <div className="flex h-16 items-center justify-between gap-4 px-4 lg:px-gutter-lg">
        <Link to={usuario ? RUTA_INICIO[usuario.rol] : '/cartelera'} className="flex min-w-max items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-primary-container bg-primary-container/20 text-secondary shadow-glow-primary">
            <Icono nombre="confirmation_number" tam={22} />
          </div>
          <div className="hidden sm:block">
            <div className="flex items-center gap-2">
              <span className="text-headline-md font-bold tracking-tight text-on-surface">TicketFr</span>
              {demoHabilitado && (
                <span className="rounded bg-primary-container px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-on-primary-container">Demo</span>
              )}
            </div>
            <p className="text-label-xs text-on-surface-variant">Portal Integral de Espectáculos</p>
          </div>
        </Link>

        {demoHabilitado && (
          <>
            <nav aria-label="Cambiar de rol" className="hidden items-center gap-1 rounded-xl border border-outline-variant/30 bg-surface-container-low p-1 lg:flex">
              {ROLES.map(({ rol, icono }, i) => {
                const activo = usuario?.rol === rol;
                return (
                  <button
                    key={rol}
                    type="button"
                    onClick={() => cambiarRol(rol)}
                    className={cx(
                      'flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-label-md transition-all',
                      activo
                        ? 'bg-primary-container text-white shadow-lg shadow-primary-container/30'
                        : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface',
                    )}
                  >
                    <Icono nombre={cambiando === rol ? 'progress_activity' : icono} className={cx('text-[16px]', cambiando === rol && 'animate-spin')} />
                    {i + 1}. {NOMBRE_ROL[rol]}
                  </button>
                );
              })}
            </nav>
            <select
              aria-label="Cambiar de rol"
              className="campo w-40 py-1.5 text-label-md lg:hidden"
              value={usuario?.rol ?? ''}
              onChange={(e) => cambiarRol(e.target.value as Rol)}
            >
              <option value="" disabled>
                Cambiar rol…
              </option>
              {ROLES.map(({ rol }, i) => (
                <option key={rol} value={rol}>
                  {i + 1}. {NOMBRE_ROL[rol]}
                </option>
              ))}
            </select>
          </>
        )}

        <div className="flex items-center gap-3">
          {usuario ? (
            <>
              <div className="hidden items-center gap-2 rounded-full border border-tertiary/40 bg-tertiary-container/30 px-3 py-1 text-tertiary xl:flex">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-tertiary" />
                <span className="text-label-xs uppercase">Vista Activa: {DESCRIPCION_VISTA[usuario.rol]}</span>
              </div>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMenu((m) => !m)}
                  className="flex items-center gap-2.5 rounded-lg p-1 pr-2 hover:bg-surface-container"
                  aria-haspopup="menu"
                  aria-expanded={menu}
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-label-md font-bold text-on-primary">{iniciales(usuario.nombre)}</span>
                  <span className="hidden text-left md:block">
                    <span className="block text-label-md leading-none text-on-surface">{usuario.nombre}</span>
                    <span className="mt-0.5 block text-label-xs font-normal text-on-surface-variant">{subtitulo}</span>
                  </span>
                  <Icono nombre="expand_more" className="text-[18px] text-outline" />
                </button>
                {menu && (
                  <div role="menu" className="absolute right-0 mt-2 w-60 animate-entrar rounded-lg border border-nv-line-strong bg-nv-raised p-1 shadow-z2" onMouseLeave={() => setMenu(false)}>
                    <div className="border-b border-nv-line px-3 py-2">
                      <p className="text-label-md text-on-surface">{usuario.nombre}</p>
                      <p className="truncate text-body-sm text-outline">{usuario.email}</p>
                    </div>
                    {usuario.rol === 'COMPRADOR' && (
                      <Link role="menuitem" to="/mis-compras" className="flex items-center gap-2 rounded px-3 py-2 text-body-md text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface" onClick={() => setMenu(false)}>
                        <Icono nombre="confirmation_number" className="text-[18px]" /> Mis compras
                      </Link>
                    )}
                    <button
                      role="menuitem"
                      type="button"
                      onClick={() => {
                        setMenu(false);
                        cerrarSesion();
                        navegar('/cartelera');
                      }}
                      className="flex w-full items-center gap-2 rounded px-3 py-2 text-body-md text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
                    >
                      <Icono nombre="logout" className="text-[18px]" /> Cerrar sesión
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Link to="/registro" className="hidden rounded-lg px-3 py-2 text-label-md text-on-surface-variant hover:text-on-surface sm:block">
                Registrarme
              </Link>
              <Link to="/login" className="inline-flex items-center gap-1.5 rounded-lg bg-primary-container px-3.5 py-2 text-label-md text-white shadow-lg shadow-primary-container/30 hover:bg-indigo-500">
                <Icono nombre="login" className="text-[18px]" /> Ingresar
              </Link>
            </div>
          )}
        </div>
      </div>
      {subbarra && (
        <div className="flex min-h-12 flex-wrap items-center justify-between gap-2 border-t border-outline-variant/20 bg-surface-container-low/90 px-4 py-2 backdrop-blur-md lg:px-gutter-lg">
          {subbarra}
        </div>
      )}
    </header>
  );
}

export interface ItemLateral {
  icono: string;
  texto: string;
  activo?: boolean;
  onClick?: () => void;
  deshabilitado?: boolean;
}

/** Barra lateral del backoffice (260px, se oculta en pantallas chicas). */
export function BarraLateral({ grupos, pie }: { grupos: { titulo?: string; items: ItemLateral[] }[]; pie?: ReactNode }) {
  return (
    <aside className="sticky top-28 hidden h-[calc(100vh-7rem)] w-64 shrink-0 flex-col justify-between border-r border-nv-line bg-surface-container-lowest py-space-md lg:flex">
      <div className="flex-1 overflow-y-auto px-space-sm">
        {grupos.map((g, i) => (
          <div key={i} className={cx(i > 0 && 'mt-6')}>
            {g.titulo && <div className="mb-2 px-space-sm text-label-xs uppercase tracking-wider text-outline">{g.titulo}</div>}
            <nav className="space-y-1">
              {g.items.map((item) => (
                <button
                  key={item.texto}
                  type="button"
                  onClick={item.onClick}
                  disabled={item.deshabilitado}
                  title={item.deshabilitado ? 'Fuera del alcance del caso integrador' : undefined}
                  className={cx(
                    'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-body-md transition-colors',
                    item.activo
                      ? 'bg-primary-container font-medium text-white shadow-sm shadow-primary-container/20'
                      : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface',
                    item.deshabilitado && 'cursor-not-allowed opacity-40 hover:bg-transparent hover:text-on-surface-variant',
                  )}
                >
                  <Icono nombre={item.icono} className="text-[20px]" />
                  {item.texto}
                </button>
              ))}
            </nav>
          </div>
        ))}
      </div>
      {pie && <div className="px-space-sm">{pie}</div>}
    </aside>
  );
}
