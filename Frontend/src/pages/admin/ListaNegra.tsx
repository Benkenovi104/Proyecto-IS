// Gestionar lista negra (derecho de admisión).
import { type FormEvent, useState } from 'react';
import { Cabecera } from '../../components/Cabecera';
import { useToast } from '../../components/Toast';
import { Aviso, Boton, Campo, Cargando, Chip, Icono, Vacio } from '../../components/ui';
import { api, mensajeError } from '../../lib/api';
import { dni, fechaCorta } from '../../lib/formato';
import { useCarga } from '../../lib/useCarga';
import { NavAdmin } from './NavAdmin';

interface Registro {
  id: number;
  dni: string;
  nombre: string | null;
  motivo: string;
  fechaAlta: string;
  entradasVigentes: number;
}

export default function ListaNegra() {
  const toast = useToast();
  const { datos, error, recargar } = useCarga(() => api.get<Registro[]>('/admin/lista-negra'), []);
  const [f, setF] = useState({ dni: '', nombre: '', motivo: '' });
  const [filtro, setFiltro] = useState('');

  const agregar = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/admin/lista-negra', f);
      toast(`DNI ${dni(f.dni.replace(/\D/g, ''))} agregado a la lista negra`);
      setF({ dni: '', nombre: '', motivo: '' });
      recargar();
    } catch (err) {
      toast(mensajeError(err), 'error');
    }
  };

  const quitar = async (r: Registro) => {
    if (!confirm(`¿Quitar el DNI ${dni(r.dni)} de la lista negra?`)) return;
    try {
      await api.delete(`/admin/lista-negra/${r.id}`);
      toast('Registro eliminado');
      recargar();
    } catch (err) {
      toast(mensajeError(err), 'error');
    }
  };

  const visibles = datos?.filter((r) => `${r.dni} ${r.nombre ?? ''} ${r.motivo}`.toLowerCase().includes(filtro.toLowerCase()));

  return (
    <>
      <Cabecera subbarra={<NavAdmin />} />
      <main className="mx-auto grid w-full max-w-7xl gap-6 p-4 lg:grid-cols-3 lg:p-8">
        <form onSubmit={agregar} className="h-fit space-y-3 rounded-lg border border-nv-line bg-nv-card p-5">
          <h1 className="flex items-center gap-2 text-headline-md text-white">
            <Icono nombre="gpp_bad" className="text-red-400" /> Derecho de admisión
          </h1>
          <p className="text-body-sm text-on-surface-variant">Los DNI de esta lista no pueden comprar, recibir transferencias ni ingresar por la puerta (se valida en los tres puntos).</p>
          <Campo etiqueta="DNI">
            <input className="campo-mono" required inputMode="numeric" value={f.dni} onChange={(e) => setF({ ...f, dni: e.target.value })} />
          </Campo>
          <Campo etiqueta="Nombre (opcional)">
            <input className="campo" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
          </Campo>
          <Campo etiqueta="Motivo">
            <textarea className="campo min-h-20" required value={f.motivo} onChange={(e) => setF({ ...f, motivo: e.target.value })} />
          </Campo>
          <Boton type="submit" variante="peligro" icono="block" className="w-full">
            Agregar a la lista negra
          </Boton>
        </form>

        <section className="space-y-4 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-title-sm text-white">Registros vigentes {datos && <span className="text-outline">({datos.length})</span>}</h2>
            <input className="campo w-64" placeholder="Buscar DNI, nombre o motivo…" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
          </div>
          {error && <Aviso tono="peligro">{error}</Aviso>}
          {!datos ? (
            <Cargando />
          ) : !visibles?.length ? (
            <Vacio icono="verified_user" titulo="No hay registros" />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-nv-line">
              <table className="w-full text-left text-body-sm">
                <thead className="border-b border-nv-line-strong bg-nv-page text-label-xs uppercase text-slate-400">
                  <tr>
                    <th className="px-3 py-2.5">DNI</th>
                    <th className="px-3 py-2.5">Nombre</th>
                    <th className="px-3 py-2.5">Motivo</th>
                    <th className="px-3 py-2.5">Alta</th>
                    <th className="px-3 py-2.5 text-right">Entradas vigentes</th>
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-nv-line bg-nv-card">
                  {visibles.map((r) => (
                    <tr key={r.id} className="hover:bg-nv-raised">
                      <td className="px-3 py-3 font-mono text-on-surface">{dni(r.dni)}</td>
                      <td className="px-3 py-3 text-on-surface">{r.nombre ?? '—'}</td>
                      <td className="max-w-xs px-3 py-3 text-on-surface-variant">{r.motivo}</td>
                      <td className="px-3 py-3 font-mono text-outline">{fechaCorta(r.fechaAlta)}</td>
                      <td className="px-3 py-3 text-right">{r.entradasVigentes ? <Chip tono="alerta">{r.entradasVigentes} (se bloquean en puerta)</Chip> : <span className="font-mono text-outline">0</span>}</td>
                      <td className="px-3 py-3 text-right">
                        <button type="button" onClick={() => quitar(r)} className="text-outline hover:text-red-400" aria-label={`Quitar ${r.dni}`}>
                          <Icono nombre="delete" className="text-[18px]" />
                        </button>
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
