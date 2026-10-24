import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { cx, Icono } from '../../components/ui';
import { api } from '../../lib/api';
import type { MisCompras } from '../../lib/tipos';
import { useCarga } from '../../lib/useCarga';

/** Sub-pestañas del portal (pantalla 3/4 de Stitch): Cartelera y Compra | Mis Compras. */
export function PestanasComprador({ activa, derecha }: { activa: 'cartelera' | 'mis-compras'; derecha?: ReactNode }) {
  const { usuario } = useAuth();
  const { datos } = useCarga(
    () => (usuario?.rol === 'COMPRADOR' ? api.get<MisCompras>('/compras/mias') : Promise.resolve(null)),
    [usuario?.id],
  );
  const cantidad = datos ? datos.compras.filter((c) => c.estado === 'PAGADA').length + datos.entradasRecibidas.length : 0;
  const pendientes = datos?.transferenciasPendientes.length ?? 0;

  const pestaña = (activo: boolean) =>
    cx(
      'flex items-center gap-2 rounded-xl px-4 py-2 text-label-md transition',
      activo ? 'bg-primary-container text-white shadow-lg shadow-primary-container/30' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface',
    );

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-nv-line pb-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link to="/cartelera" className={pestaña(activa === 'cartelera')}>
          <Icono nombre="explore" className="text-[18px]" /> Cartelera y Compra Interactiva
        </Link>
        <Link to="/mis-compras" className={pestaña(activa === 'mis-compras')}>
          <Icono nombre="confirmation_number" className="text-[18px]" /> Mis Compras / Mis Entradas
          <span className="hidden text-on-surface-variant/80 md:inline">(QR, Devolución &amp; Transferir)</span>
          {cantidad > 0 && (
            <span className={cx('flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold', activa === 'mis-compras' ? 'bg-white text-primary-container' : 'bg-primary-container text-white')}>
              {cantidad}
            </span>
          )}
          {pendientes > 0 && <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" title={`${pendientes} transferencia(s) para aceptar`} />}
        </Link>
      </div>
      {derecha}
    </div>
  );
}
