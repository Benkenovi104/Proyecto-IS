// Componentes base del design system Nocturne Velocity (botones, chips, switch, modal...).
import { type ButtonHTMLAttributes, type ReactNode, useEffect } from 'react';

const cx = (...clases: (string | false | null | undefined)[]) => clases.filter(Boolean).join(' ');
export { cx };

export function Icono({ nombre, className, relleno, tam }: { nombre: string; className?: string; relleno?: boolean; tam?: number }) {
  return (
    <span aria-hidden className={cx('material-symbols-outlined', relleno && 'icono-relleno', className)} style={tam ? { fontSize: tam } : undefined}>
      {nombre}
    </span>
  );
}

type VarianteBoton = 'primario' | 'secundario' | 'peligro' | 'exito' | 'fantasma' | 'suave';

const VARIANTES: Record<VarianteBoton, string> = {
  primario: 'bg-primary-container text-white shadow-lg shadow-primary-container/30 hover:bg-indigo-500',
  secundario: 'bg-surface-container-high text-on-surface hover:bg-surface-bright',
  peligro: 'bg-red-500/10 text-red-400 border border-red-500/25 hover:bg-red-500 hover:text-white',
  exito: 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-500',
  fantasma: 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface',
  suave: 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface',
};

export function Boton({
  variante = 'secundario',
  icono,
  cargando,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: VarianteBoton; icono?: string; cargando?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      disabled={props.disabled || cargando}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-label-md font-semibold transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100',
        VARIANTES[variante],
        className,
      )}
    >
      {cargando ? <Icono nombre="progress_activity" className="animate-spin text-[18px]" /> : icono && <Icono nombre={icono} className="text-[18px]" />}
      {children}
    </button>
  );
}

type Tono = 'exito' | 'alerta' | 'peligro' | 'vivo' | 'info' | 'neutro' | 'primario';

const TONOS: Record<Tono, string> = {
  exito: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  alerta: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  peligro: 'bg-red-500/10 text-red-400 border-red-500/30',
  vivo: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
  info: 'bg-primary-container/20 text-primary-fixed border-primary-container/40',
  neutro: 'bg-surface-container-high text-on-surface-variant border-outline-variant/40',
  primario: 'bg-primary-container text-on-primary-container border-transparent',
};

/** Chip de estado: label-xs en mayúsculas (guía "Badges & Status Chips"). */
export function Chip({ tono = 'neutro', punto, pulso, icono, children, className }: { tono?: Tono; punto?: boolean; pulso?: boolean; icono?: string; children: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded border px-2 py-0.5 text-label-xs uppercase', TONOS[tono], className)}>
      {punto && <span className={cx('h-1.5 w-1.5 rounded-full bg-current', pulso && 'animate-pulse')} />}
      {icono && <Icono nombre={icono} className="text-[13px]" />}
      {children}
    </span>
  );
}

export function Interruptor({ activo, onCambio, etiqueta, deshabilitado }: { activo: boolean; onCambio: (v: boolean) => void; etiqueta: string; deshabilitado?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      disabled={deshabilitado}
      onClick={() => onCambio(!activo)}
      className={cx(
        'relative inline-flex h-6 w-12 flex-shrink-0 items-center rounded-full transition-colors duration-200 disabled:opacity-50',
        activo ? 'bg-tertiary-container' : 'bg-surface-container-highest',
      )}
    >
      <span className={cx('inline-block h-5 w-5 rounded-full shadow transition-transform duration-200', activo ? 'translate-x-6 bg-tertiary-fixed' : 'translate-x-0.5 bg-outline')} />
    </button>
  );
}

export function Campo({ etiqueta, ayuda, children, className }: { etiqueta: string; ayuda?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="etiqueta">{etiqueta}</span>
      {children}
      {ayuda && <span className="mt-1 block text-[11px] text-outline">{ayuda}</span>}
    </label>
  );
}

export function Modal({ abierto, onCerrar, titulo, icono, children, ancho = 'max-w-lg' }: { abierto: boolean; onCerrar: () => void; titulo: string; icono?: string; children: ReactNode; ancho?: string }) {
  useEffect(() => {
    if (!abierto) return;
    const alPresionar = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, [abierto, onCerrar]);
  if (!abierto) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-nv-canvas/75 p-4 backdrop-blur-md" onMouseDown={onCerrar}>
      <div
        role="dialog"
        aria-modal
        aria-label={titulo}
        onMouseDown={(e) => e.stopPropagation()}
        className={cx('w-full animate-entrar rounded-xl border border-nv-line-strong bg-nv-raised shadow-z2', ancho)}
      >
        <div className="flex items-center justify-between border-b border-nv-line px-5 py-4">
          <h3 className="flex items-center gap-2 text-title-sm text-on-surface">
            {icono && <Icono nombre={icono} className="text-[20px] text-secondary" />}
            {titulo}
          </h3>
          <button type="button" onClick={onCerrar} className="rounded p-1 text-outline hover:bg-surface-container-high hover:text-on-surface" aria-label="Cerrar">
            <Icono nombre="close" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-on-surface-variant">
      <Icono nombre="progress_activity" className="animate-spin text-secondary" />
      <span>{texto}</span>
    </div>
  );
}

export function Aviso({ tono = 'info', icono, titulo, children, className }: { tono?: 'info' | 'alerta' | 'peligro' | 'exito'; icono?: string; titulo?: string; children: ReactNode; className?: string }) {
  const estilos = {
    info: 'border-primary-container/40 bg-primary-container/10 text-primary-fixed',
    alerta: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
    peligro: 'border-red-500/40 bg-red-500/10 text-red-200',
    exito: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
  }[tono];
  const iconoPorDefecto = { info: 'info', alerta: 'warning', peligro: 'error', exito: 'check_circle' }[tono];
  return (
    <div className={cx('flex items-start gap-3 rounded-lg border p-3.5 text-body-sm leading-relaxed', estilos, className)}>
      <Icono nombre={icono ?? iconoPorDefecto} className="mt-0.5 text-[20px]" />
      <div>
        {titulo && <strong className="block text-label-md">{titulo}</strong>}
        {children}
      </div>
    </div>
  );
}

export function Vacio({ icono, titulo, children }: { icono: string; titulo: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-outline-variant/50 px-6 py-12 text-center">
      <Icono nombre={icono} className="text-[40px] text-outline" />
      <p className="text-title-sm text-on-surface">{titulo}</p>
      {children && <div className="max-w-md text-body-sm text-on-surface-variant">{children}</div>}
    </div>
  );
}

/** Barra de progreso fina (KPIs y cupos). */
export function Progreso({ valor, total, color = 'bg-secondary', className }: { valor: number; total: number; color?: string; className?: string }) {
  const pct = total > 0 ? Math.min(100, (valor / total) * 100) : 0;
  return (
    <div className={cx('h-1.5 w-full overflow-hidden rounded-full bg-surface-container-lowest', className)}>
      <div className={cx('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
    </div>
  );
}
