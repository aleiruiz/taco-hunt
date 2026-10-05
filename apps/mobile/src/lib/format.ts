/** "1 reseña", "2 reseñas", "0 reseñas". */
export function reviewCountLabel(count: number): string {
  return `${count} ${count === 1 ? "reseña" : "reseñas"}`;
}

/** "1 puesto", "2 puestos", "0 puestos". */
export function placeCountLabel(count: number): string {
  return `${count} ${count === 1 ? "puesto" : "puestos"}`;
}
