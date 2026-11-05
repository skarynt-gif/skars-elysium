import { RELEASE_TIME_ZONE } from './release.ts';

/**
 * Central game constants. Anything a non-programmer might want to tweak
 * (artist name, release timezone, walking speed) lives here so it never has
 * to be hunted down inside game systems.
 */
export const GAME_CONFIG = {
  /** Shown on the title screen (the self-hosted pixel font includes the curly apostrophe). */
  gameTitle: 'SKAR’S ELYSIUM',
  /** Default artist credit (each song's own "artist" field is what the player shows). */
  artistName: 'Skar',

  /**
   * Where the content manifest is fetched from at runtime.
   * During development this is the local demo file; in production it can be
   * set to the media storage URL with VITE_CONTENT_URL, so adding songs never
   * requires a rebuild.
   */
  contentUrl: import.meta.env.VITE_CONTENT_URL || '/content/manifest.json',

  /** Release times in the manifest without an explicit offset are read in this zone. */
  releaseTimeZone: RELEASE_TIME_ZONE,

  player: {
    /** Camera height in meters — human eye level. */
    eyeHeight: 1.6,
    walkSpeed: 3.0,
    runSpeed: 5.8,
    acceleration: 12,
    deceleration: 14,
    /** Radians of turn per mouse pixel at sensitivity 1. */
    mouseLookSpeed: 0.0022,
    /** Radians of turn for a swipe across the full screen width, at sensitivity 1. */
    touchLookSweep: 3.4,
    /** Radius of the invisible capsule used for collision. */
    radius: 0.35,
  },

  interaction: {
    /** How close a visitor must be (meters) for a flower to become focused. */
    focusDistance: 2.2,
  },

  /** PS1/PS2 look. Render resolution per device comes from quality.ts. */
  retro: {
    /** Shades per color channel. 32 = PS1 15-bit color; lower is more 8-bit. */
    colorLevels: 32,
    /** Ordered dithering strength, 0..1. */
    dither: 1,
    /**
     * Vertex wobble grid relative to the render resolution. 1 = snap to
     * retro pixels (subtle); 0.5 = coarser, stronger wobble.
     */
    snapScale: 1,
  },

  /** Sunset palette shared by the 3D world and the HTML interface. */
  palette: {
    /** Sky gradient, top to bottom. */
    skyZenith: '#2a1846',
    skyUpper: '#6a3a8a',
    skyPink: '#e0607e',
    skyHorizon: '#ff9a4d',
    sunGold: '#ffd27a',
    /** Distance fog. The sky below the horizon uses the same color, so land melts into sky. */
    fog: '#a8557d',
    /** Light colors */
    sunLight: '#ffcf8a',
    hemiSky: '#ffb08a',
    hemiGround: '#4a2a5a',
    uiPurple: '#1a0f2e',
    uiBronze: '#a8703c',
    uiGold: '#e8c15a',
  },
} as const;
