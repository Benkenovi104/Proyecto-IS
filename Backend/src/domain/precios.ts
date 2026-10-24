// Tarifa.precioVigente(fecha) y Descuento.estaVigente(fecha) del diagrama de clases.

interface DescuentoLike {
  porcentaje: number;
  vigenciaDesde: Date;
  vigenciaHasta: Date;
}

interface TarifaLike {
  precio: number;
  descuentos: DescuentoLike[];
}

export function descuentoEstaVigente(d: DescuentoLike, fecha = new Date()) {
  return d.vigenciaDesde <= fecha && fecha <= d.vigenciaHasta;
}

export function descuentoVigente<T extends DescuentoLike>(descuentos: T[], fecha = new Date()): T | null {
  // Si hubiera más de uno vigente, se aplica el mayor.
  return descuentos.filter((d) => descuentoEstaVigente(d, fecha)).sort((a, b) => b.porcentaje - a.porcentaje)[0] ?? null;
}

export function precioVigente(tarifa: TarifaLike, fecha = new Date()) {
  const d = descuentoVigente(tarifa.descuentos, fecha);
  return d ? Math.round(tarifa.precio * (1 - d.porcentaje / 100)) : tarifa.precio;
}
