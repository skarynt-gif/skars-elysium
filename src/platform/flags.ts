import { parseDebugFlags } from './debugFlags.ts';

/** Read once at startup; see debugFlags.ts for the available URL switches. */
export const DEBUG_FLAGS = parseDebugFlags(window.location.search, import.meta.env.DEV);
