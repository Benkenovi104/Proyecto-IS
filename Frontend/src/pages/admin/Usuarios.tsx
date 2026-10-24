// Gestionar usuarios del backoffice.
import { type FormEvent, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { Cabecera } from '../../components/Cabecera';
import { useToast } from '../../components/Toast';
import { Aviso, Boton, Campo, Cargando, Chip, Icono, Interruptor } from '../../components/ui';
import { api, mensajeError } from '../../lib/api';
import { dni, fechaCorta, NOMBRE_ROL } from '../../lib/formato';
import type { Rol, Usuario } from '../../lib/tipos';
import { useCarga } from '../../lib/useCarga';
import { NavAdmin } from './NavAdmin';

type UsuarioListado = Usuario & { activo: boolean; creadoEn: string };
const TONO_ROL: Record<Rol, 'primario' | 'info' | 'vivo' | 'neutro'> = { ADMINISTRADOR: 'primario', ORGANIZADOR: 'info', CONTROLADOR: 'vivo', COMPRADOR: 'neutro' };

export default function Usuarios() {
  const { usuario: yo } = useAuth();
  const toast = useToast();
  const { datos, error, recargar } = useCarga(() => api.get<UsuarioListado[]>('/admin/usuarios'), []);
  const [rolFiltro, setRolFiltro] = useState<Rol | ''>('');
  const [f, setF] = useState({ nombre: '', email: '', password: '', rol: 'CONTROLADOR' as Exclude<Rol, 'COMPRADOR'>, productora: '', puntoAcceso: '' });

  const crear = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/admin/usuarios', { ...f, productora: f.productora || undefined, puntoAcceso: f.puntoAcceso || undefined });
      toast(`Usuario ${NOMBRE_ROL[f.rol].toLowerCase()} creado`);
      setF({ ...f, nombre: '', email: '', password: '', productora: '', puntoAcceso: '' });
      recargar();
    } catch (err) {
      toast(mensajeError(err), 'error');
    }
  };

  const cambiarActivo = async (u: UsuarioListado, activo: boolean) => {
    try {
      await api.patch(`/admin/usuarios/${u.id}`, { activo });
      toast(activo ? `${u.nombre} reactivado` : `${u.nombre} desactivado`);
      recargar();
    } catch (err) {
      toast(mensajeError(err), 'error');
    }
  };

  const visibles = datos?.filter((u) => !rolFiltro || u.rol === rolFiltro);

  return (
    <>
      <Cabecera subbarra={<NavAdmin />} />
      <main className="mx-auto grid w-full max-w-7xl gap-6 p-4 lg:grid-cols-3 lg:p-8">
        <form onSubmit={crear} className="h-fit space-y-3 rounded-lg border border-nv-line bg-nv-card p-5">
          <h1 className="flex items-center gap-2 text-headline-md text-white">
            <Icono nombre="person_add" className="text-secondary" /> Alta de usuario del backoffice
          </h1>
          <p className="text-body-sm text-on-surface-variant">Los compradores se registran solos desde el portal.</p>
          <Campo etiqueta="Rol">
            <select className="campo" value={f.rol} onChange={(e) => setF({ ...f, rol: e.target.value as typeof f.rol })}>
              <option value="CONTROLADOR">Controlador de acceso</option>
              <option value="ORGANIZADOR">Organizador</option>
              <option value="ADMINISTRADOR">Administrador</option>
            </select>
          </Campo>
          <Campo etiqueta="Nombre y apellido">
            <input className="campo" required value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
          </Campo>
          <Campo etiqueta="Email">
            <input className="campo" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          </Campo>
          <Campo etiqueta="Contraseña inicial">
            <input className="campo" type="password" required minLength={6} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
          </Campo>
          {f.rol === 'ORGANIZADOR' && (
            <Campo etiqueta="Productora">
              <input className="campo" required value={f.productora} onChange={(e) => setF({ ...f, productora: e.target.value })} />
            </Campo>
          )}
          {f.rol === 'CONTROLADOR' && (
            <Campo etiqueta="Punto de acceso">
              <input className="campo" placeholder="Ej: Molinete 2 - Acceso Central" value={f.puntoAcceso} onChange={(e) => setF({ ...f, puntoAcceso: e.target.value })} />
            </Campo>
          )}
          <Boton type="submit" variante="primario" icono="person_add" className="w-full">
            Crear usuario
          </Boton>
        </form>

        <section className="space-y-4 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-title-sm text-white">Usuarios {visibles && <span className="text-outline">({visibles.length})</span>}</h2>
            <select className="campo w-56" value={rolFiltro} onChange={(e) => setRolFiltro(e.target.value as Rol | '')}>
              <option value="">Todos los roles</option>
              {(Object.keys(NOMBRE_ROL) as Rol[]).map((r) => (
                <option key={r} value={r}>
                  {NOMBRE_ROL[r]}
                </option>
              ))}
            </select>
          </div>
          {error && <Aviso tono="peligro">{error}</Aviso>}
          {!visibles ? (
            <Cargando />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-nv-line">
              <table className="w-full text-left text-body-sm">
                <thead className="border-b border-nv-line-strong bg-nv-page text-label-xs uppercase text-slate-400">
                  <tr>
                    <th className="px-3 py-2.5">Nombre</th>
                    <th className="px-3 py-2.5">Email</th>
                    <th className="px-3 py-2.5">Rol</th>
                    <th className="px-3 py-2.5">Detalle</th>
                    <th className="px-3 py-2.5">Alta</th>
                    <th className="px-3 py-2.5 text-right">Activo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-nv-line bg-nv-card">
                  {visibles.map((u) => (
                    <tr key={u.id} className="hover:bg-nv-raised">
                      <td className="px-3 py-2.5 text-on-surface">{u.nombre}</td>
                      <td className="px-3 py-2.5 text-on-surface-variant">{u.email}</td>
                      <td className="px-3 py-2.5">
                        <Chip tono={TONO_ROL[u.rol]}>{NOMBRE_ROL[u.rol]}</Chip>
                      </td>
                      <td className="px-3 py-2.5 text-on-surface-variant">{u.productora ?? u.puntoAcceso ?? (u.dni ? `DNI ${dni(u.dni)}` : '—')}</td>
                      <td className="px-3 py-2.5 font-mono text-outline">{fechaCorta(u.creadoEn)}</td>
                      <td className="px-3 py-2.5 text-right">
                        <Interruptor activo={u.activo} etiqueta={`Activar ${u.nombre}`} deshabilitado={u.id === yo?.id} onCambio={(v) => cambiarActivo(u, v)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </>
  );
}
