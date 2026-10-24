// Exclusión mutua en memoria por clave (p. ej. "funcion:12").
// Serializa las operaciones que reservan o liberan ubicaciones, cupo y stock de una misma
// función, así dos compradores nunca confirman la última butaca a la vez (riesgo R-01).
// Alcanza para un único proceso; con varias instancias habría que usar un lock distribuido (Redis).

const colas = new Map<string, Promise<void>>();

export async function conBloqueo<T>(clave: string, operacion: () => Promise<T>): Promise<T> {
  const anterior = colas.get(clave) ?? Promise.resolve();
  let liberar!: () => void;
  const turno = new Promise<void>((resolve) => (liberar = resolve));
  const actual = anterior.then(() => turno);
  colas.set(clave, actual);
  await anterior;
  try {
    return await operacion();
  } finally {
    liberar();
    if (colas.get(clave) === actual) colas.delete(clave);
  }
}

export const claveFuncion = (funcionId: number) => `funcion:${funcionId}`;
