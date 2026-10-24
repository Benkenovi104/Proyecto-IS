import { NavLink } from 'react-router-dom';
import { cx, Icono } from '../../components/ui';

const SECCIONES = [
  { a: '/admin/salas', icono: 'stadium', texto: 'Salas y mapas' },
  { a: '/admin/lista-negra', icono: 'gpp_bad', texto: 'Lista negra' },
  { a: '/admin/usuarios', icono: 'manage_accounts', texto: 'Usuarios' },
];

/** Pestañas del backoffice del administrador (van en la subbarra de la cabecera). */
export function NavAdmin() {
  return (
    <nav aria-label="Secciones del administrador" className="flex items-center gap-1 rounded-lg border border-nv-line bg-surface-container-lowest p-0.5">
      {SECCIONES.map((s) => (
        <NavLink
          key={s.a}
          to={s.a}
          className={({ isActive }) =>
            cx('flex items-center gap-1.5 rounded-md px-2.5 py-1 text-label-md transition', isActive ? 'bg-surface-container-high text-white' : 'text-on-surface-variant hover:text-on-surface')
          }
        >
          <Icono nombre={s.icono} className="text-[16px]" />
          {s.texto}
        </NavLink>
      ))}
    </nav>
  );
}
