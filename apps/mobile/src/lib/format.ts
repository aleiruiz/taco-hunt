/** "1 reseña", "2 reseñas", "0 reseñas". */
export function reviewCountLabel(count: number): string {
  return `${count} ${count === 1 ? "reseña" : "reseñas"}`;
}
