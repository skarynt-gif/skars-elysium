/** Tiny typed event emitter for one-off game events (taps, selections). */
export interface Emitter<T> {
  on(listener: (event: T) => void): () => void;
  emit(event: T): void;
}

export function createEmitter<T>(): Emitter<T> {
  const listeners = new Set<(event: T) => void>();
  return {
    on(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit(event) {
      for (const listener of [...listeners]) listener(event);
    },
  };
}
