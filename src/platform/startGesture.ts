/**
 * The PRESS START moment.
 *
 * Browsers only allow some things inside a real click/tap/keypress:
 * unlocking audio (essential on iPhone), capturing the mouse for mouse-look,
 * and fullscreen on Android. Systems register here, and the title screen runs
 * every listener synchronously inside that gesture.
 *
 *   Registered: mouse capture (DesktopInput), audio unlock (MusicController),
 *   fullscreen on Android (App).
 */
type Listener = () => void;

export interface StartGestureHub {
  onStart(listener: Listener): () => void;
  run(): void;
  readonly hasRun: boolean;
}

export function createStartGestureHub(log: (err: unknown) => void = console.error): StartGestureHub {
  const listeners = new Set<Listener>();
  let hasRun = false;
  return {
    onStart(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    run() {
      hasRun = true;
      for (const listener of listeners) {
        // One failing system (e.g. pointer lock refused) must not stop the others.
        try {
          listener();
        } catch (err) {
          log(err);
        }
      }
    },
    get hasRun() {
      return hasRun;
    },
  };
}

export const startGesture = createStartGestureHub();
