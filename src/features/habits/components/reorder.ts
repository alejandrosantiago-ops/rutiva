/** Posición (índice) de cada elemento de la lista, por id. */
export type Positions = Record<string, number>;

/**
 * Mueve `id` a la posición `target` desplazando los elementos intermedios
 * (como al arrastrar en una lista), sin intercambiar con el destino.
 * Se ejecuta en el hilo de animación durante el arrastre (worklet).
 */
export function moveTo(positions: Positions, id: string, target: number): Positions {
  'worklet';
  const current = positions[id];
  if (current === undefined || current === target) return positions;
  const next: Positions = { ...positions };
  for (const other in next) {
    if (other === id) continue;
    const i = next[other];
    if (target < current && i >= target && i < current) next[other] = i + 1;
    else if (target > current && i <= target && i > current) next[other] = i - 1;
  }
  next[id] = target;
  return next;
}

/** Ids ordenados según sus posiciones. */
export function orderOf(positions: Positions): string[] {
  return Object.entries(positions)
    .sort((a, b) => a[1] - b[1])
    .map(([id]) => id);
}
