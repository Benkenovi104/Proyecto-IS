import { QRCodeSVG } from 'qrcode.react';
import { cx } from './ui';

const INSIGNIAS = {
  ENTRADA: { texto: 'TFR', color: '#4f46e5' },
  PASE: { texto: 'CAR', color: '#0d9488' },
  VOUCHER: { texto: 'BAR', color: '#d97706' },
} as const;

const insignia = (texto: string, color: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" rx="6" fill="${color}"/>` +
      `<text x="20" y="25" font-family="Arial,sans-serif" font-size="12" font-weight="700" fill="#fff" text-anchor="middle">${texto}</text></svg>`,
  )}`;

/**
 * QR real (contenido firmado que emite la API) sobre sustrato blanco con 8px de margen,
 * como pide la guía para asegurar la lectura óptica. La insignia central replica el diseño de Stitch.
 */
export function CodigoQR({ valor, tipo, anulado, tam = 160 }: { valor: string | null; tipo: keyof typeof INSIGNIAS; anulado?: string; tam?: number }) {
  const { texto, color } = INSIGNIAS[tipo];
  return (
    <div className="relative rounded-xl bg-white p-3 shadow-2xl">
      {valor ? (
        <QRCodeSVG
          value={valor}
          size={tam}
          level="H"
          fgColor="#0f172a"
          bgColor="#ffffff"
          imageSettings={{ src: insignia(texto, color), height: tam * 0.25, width: tam * 0.25, excavate: true }}
        />
      ) : (
        <div className="flex items-center justify-center bg-slate-100" style={{ width: tam, height: tam }}>
          <span className="material-symbols-outlined text-[64px] text-slate-300">qr_code_2</span>
        </div>
      )}
      {anulado && (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-nv-canvas/80 backdrop-blur-[2px]">
          <span className="rotate-[-12deg] rounded border-2 border-red-400 px-3 py-1 text-label-md uppercase tracking-widest text-red-300">{anulado}</span>
        </div>
      )}
    </div>
  );
}

/** Patente estilo Mercosur (República Argentina). */
export function PatenteMercosur({ patente, grande }: { patente: string; grande?: boolean }) {
  return (
    <div className="inline-flex flex-col overflow-hidden rounded border border-slate-400 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 bg-indigo-900 px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest text-white">
        <span>República Argentina</span>
        <span>Mercosur</span>
      </div>
      <span className={cx('px-3 py-1 text-center font-mono font-black tracking-widest text-slate-950', grande ? 'text-headline-md' : 'text-body-md')}>{patente}</span>
    </div>
  );
}

/** Línea perforada que separa la cabecera del QR en las tarjetas de pase (guía "Ticket Passes"). */
export function Perforado({ fondo = 'bg-surface-container-lowest' }: { fondo?: string }) {
  return (
    <div className="relative -mx-5 flex items-center py-1">
      <div className={cx('h-6 w-3 rounded-r-full', fondo)} />
      <div className="mx-2 w-full border-t border-dashed border-nv-line-strong" />
      <div className={cx('h-6 w-3 rounded-l-full', fondo)} />
    </div>
  );
}
