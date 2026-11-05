/**
 * URL switches for testing on any device, including the live site:
 *   ?debug          show the diagnostics panel
 *   ?retro=off      turn off the whole retro pass (compare with modern rendering)
 *   ?wobble=off     keep the pixel look but disable vertex wobble
 *   ?dither=off     keep limited colors but disable dithering
 *   ?skipintro      jump straight into the garden (development)
 *   ?orbit          free orbit camera to inspect the world (development)
 */
export interface DebugFlags {
  debug: boolean;
  retro: boolean;
  wobble: boolean;
  dither: boolean;
  skipIntro: boolean;
  orbit: boolean;
}

export function parseDebugFlags(search: string, isDev: boolean): DebugFlags {
  const params = new URLSearchParams(search);
  const off = (name: string) => params.get(name) === 'off';
  return {
    debug: isDev || params.has('debug'),
    retro: !off('retro'),
    wobble: !off('wobble'),
    dither: !off('dither'),
    skipIntro: params.has('skipintro'),
    orbit: params.has('orbit'),
  };
}
