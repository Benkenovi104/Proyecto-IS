import { type ReactNode, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Cabecera, ESTILO_LATERAL } from '../../components/Cabecera';
import { cx, Icono } from '../../components/ui';

const SECCIONES = [
  { a: '/admin/salas', icono: 'stadium', texto: 'Salas y mapas' },
  { a: '/admin/lista-negra', icono: 'gpp_bad', texto: 'Lista negra' },
  { a: '/admin/usuarios', icono: 'manage_accounts', texto: 'Usuarios' },
];

const CLAVE_COMPACTA = 'ticketfr.admin.lateral-compacta';

function leerCompacta() {
  try {
    return localStorage.getItem(CLAVE_COMPACTA) === 'true';
  } catch {
    return false;
  }
}

/** Barra lateral del administrador; se puede contraer a íconos para darle más lugar al editor de salas. */
function LateralAdmin() {
  const [compacta, setCompacta] = useState(leerCompacta);
  const alternar = () =>
    setCompacta((c) => {
      try {
        localStorage.setItem(CLAVE_COMPACTA, String(!c));
      } catch {
        // preferencia no persistida
      }
      return !c;
    });

  return (
    <aside
      style={ESTILO_LATERAL}
      className={cx(
        'sticky hidden shrink-0 flex-col justify-between border-r border-nv-line bg-surface-container-lowest py-space-md transition-[width] duration-200 lg:flex',
        compacta ? 'w-16' : 'w-60',
      )}
    >
      <div className="px-space-sm">
        <div className={cx('mb-2 px-space-sm text-label-xs uppercase tracking-wider text-outline', compacta && 'sr-only')}>Administración</div>
        <nav aria-label="Secciones del administrador" className="space-y-1">
          {SECCIONES.map((s) => (
            <NavLink
              key={s.a}
              to={s.a}
              title={compacta ? s.texto : undefined}
              aria-label={compacta ? s.texto : undefined}
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-3 rounded-lg py-2 text-body-md transition-colors',
                  compacta ? 'justify-center px-0' : 'px-3',
                  isActive
                    ? 'bg-primary-container font-medium text-white shadow-sm shadow-primary-container/20'
                    : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface',
                )
              }
            >
              <Icono nombre={s.icono} className="text-[20px]" />
              {!compacta && s.texto}
            </NavLink>
          ))}
        </nav>
      </div>
      <div className="px-space-sm">
        <button
          type="button"
          onClick={alternar}
          title={compacta ? 'Expandir menú' : undefined}
          aria-label={compacta ? 'Expandir menú' : 'Contraer menú'}
          aria-expanded={!compacta}
          className={cx(
            'flex w-full items-center gap-3 rounded-lg py-2 text-body-sm text-outline transition-colors hover:bg-surface-container hover:text-on-surface',
            compacta ? 'justify-center px-0' : 'px-3',
          )}
        >
          <Icono nombre={compacta ? 'keyboard_double_arrow_right' : 'keyboard_double_arrow_left'} className="text-[20px]" />
          {!compacta && 'Contraer menú'}
        </button>
      </div>
    </aside>
  );
}

/** En pantallas chicas no hay lugar para la barra lateral: las secciones van como pestañas sobre el contenido. */
function PestanasAdmin() {
  return (
    <nav aria-label="Secciones del administrador" className="flex gap-1 overflow-x-auto border-b border-nv-line bg-surface-container-lowest px-4 py-2 lg:hidden">
      {SECCIONES.map((s) => (
        <NavLink
          key={s.a}
          to={s.a}
          className={({ isActive }) =>
            cx(
              'flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-label-md transition',
              isActive ? 'bg-surface-container-high text-white' : 'text-on-surface-variant hover:text-on-surface',
            )
          }
        >
          <Icono nombre={s.icono} className="text-[16px]" />
          {s.texto}
        </NavLink>
      ))}
    </nav>
  );
}

/** Estructura común de las pantallas del administrador: cabecera, barra lateral de secciones y contenido. */
export function LayoutAdmin({ subbarra, children }: { subbarra?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Cabecera subbarra={subbarra} />
      <div className="flex flex-1">
        <LateralAdmin />
        <div className="flex min-w-0 flex-1 flex-col">
          <PestanasAdmin />
          {children}
        </div>
      </div>
    </div>
  );
}
