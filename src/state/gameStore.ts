import { create } from 'zustand';
import type { ContentIssue, Manifest } from '../content/types.ts';
import type { QualitySettings, QualityTier } from '../config/quality.ts';
import type { RenderSize } from '../game/render/renderSize.ts';
import { readMemory, writeMemory } from '../platform/visitMemory.ts';
import type { EngineState } from '../audio/engine.ts';
import type { QualityChoice } from './prefs.ts';
import { DEFAULT_EFFECTS, type EffectSettings } from '../audio/effectsMath.ts';

/**
 * The single shared store connecting the 3D world and the HTML interface.
 * Later stages add slices here (focused flower, now playing, player settings,
 * collectibles) rather than creating separate stores.
 *
 * Per-frame values (camera position, velocity) deliberately do NOT live here:
 * they change 60 times a second and are kept in plain refs inside the game
 * loop so React never re-renders on every frame.
 */
export type GamePhase =
  | 'booting' // loading content and the garden
  | 'title' // gates closed, PRESS START shown
  | 'entering' // gate-opening cutscene
  | 'exploring' // visitor has control
  | 'paused';

export type ContentState =
  | { status: 'loading' }
  | { status: 'ready'; manifest: Manifest; issues: ContentIssue[] }
  | { status: 'failed'; message: string };

/** Visitor preferences, edited in the settings menu and remembered (see prefs.ts). */
export interface PlayerSettings {
  /** Multiplier on mouse/touch look speed. */
  lookSensitivity: number;
  invertY: boolean;
  /** Walking camera bob; off by default for reduced-motion visitors. */
  headBob: boolean;
  /** Graphics quality; 'auto' picks from the device. */
  quality: QualityChoice;
  /** Garden sounds (wind, fountain, birds), 0..1. Separate from music. */
  ambientVolume: number;
}

/** Which overlay panel is open (desktop releases the mouse while one is). */
export type UiPanel = 'none' | 'player' | 'menu' | 'details';

/** A big retro banner, e.g. when a new release blooms. */
export interface Announcement {
  id: number;
  title: string;
  text: string;
}

/** What the visitor is currently aiming at / standing near, for on-screen prompts. */
export interface Focus {
  kind: 'arrow' | 'flower';
  id: string;
  label: string;
  /** Flowers: artist or status line. */
  detail?: string;
  /** Flowers: LISTEN / PREVIEW / DETAILS. */
  action?: string;
}

interface GameState {
  phase: GamePhase;
  focus: Focus | null;
  /** Destination name while auto-walking via an arrow. */
  travelLabel: string | null;
  /** The hidden grove has been discovered (remembered across visits). */
  groveFound: boolean;
  /** Song chosen by selecting its flower (or next/previous in the player). */
  currentSongId: string | null;
  /** Bumped on every selection, so re-selecting the same flower restarts it. */
  songRequest: number;
  playerOpen: boolean;
  uiPanel: UiPanel;
  /** Song shown on the Coming Soon card. */
  detailSongId: string | null;
  announcement: Announcement | null;
  /** Laurel wreaths found (remembered in this browser). */
  laurelsFound: string[];
  laurelsAllFound: boolean;
  /** Mirror of the audio engine's state (what is actually audible). */
  playback: EngineState;
  /** Master music volume, 0..1. */
  volume: number;
  /** Reverb, delay and speed; kept across songs and visits. */
  effects: EffectSettings;
  settings: PlayerSettings;
  /** Desktop: whether the mouse is captured for mouse-look. */
  pointerLocked: boolean;
  content: ContentState;
  quality: QualitySettings | null;
  /** Tier chosen by the automatic performance governor (when graphics = Auto). */
  autoTier: QualityTier | null;
  /** Measured frames per second (updated every few seconds, for the debug panel). */
  fps: number | null;
  /** The browser dropped the 3D graphics (low memory); showing a recovery screen. */
  graphicsLost: boolean;
  /** Current low-res frame size; null when the retro pass is off. Updated on resize only. */
  renderSize: RenderSize | null;
  setPhase: (phase: GamePhase) => void;
  setContent: (content: ContentState) => void;
  setQuality: (quality: QualitySettings) => void;
  setAutoTier: (tier: QualityTier | null) => void;
  setFps: (fps: number) => void;
  setGraphicsLost: (lost: boolean) => void;
  setRenderSize: (renderSize: RenderSize | null) => void;
  updateSettings: (patch: Partial<PlayerSettings>) => void;
  setPointerLocked: (locked: boolean) => void;
  setFocus: (focus: Focus | null) => void;
  setTravelLabel: (label: string | null) => void;
  discoverGrove: () => void;
  requestSong: (songId: string) => void;
  setPlayerOpen: (open: boolean) => void;
  setUiPanel: (panel: UiPanel) => void;
  openDetails: (songId: string) => void;
  announce: (title: string, text: string) => void;
  clearAnnouncement: (id: number) => void;
  setLaurels: (found: string[], allFound: boolean) => void;
  setPlayback: (playback: EngineState) => void;
  setVolume: (volume: number) => void;
  setEffects: (patch: Partial<EffectSettings>) => void;
}

export const useGameStore = create<GameState>()((set) => ({
  phase: 'booting',
  focus: null,
  travelLabel: null,
  groveFound: readMemory('grove-found') === '1',
  currentSongId: null,
  songRequest: 0,
  playerOpen: false,
  uiPanel: 'none',
  detailSongId: null,
  announcement: null,
  laurelsFound: [],
  laurelsAllFound: false,
  playback: { status: 'idle', trackId: null, position: 0, duration: 0, error: null },
  volume: 0.8,
  effects: DEFAULT_EFFECTS,
  settings: { lookSensitivity: 1, invertY: false, headBob: true, quality: 'auto', ambientVolume: 0.6 },
  pointerLocked: false,
  content: { status: 'loading' },
  quality: null,
  autoTier: null,
  fps: null,
  graphicsLost: false,
  renderSize: null,
  setPhase: (phase) => set({ phase }),
  setContent: (content) => set({ content }),
  setQuality: (quality) => set({ quality }),
  setAutoTier: (autoTier) => set({ autoTier }),
  setFps: (fps) => set({ fps }),
  setGraphicsLost: (graphicsLost) => set({ graphicsLost }),
  setRenderSize: (renderSize) => set({ renderSize }),
  updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
  setPointerLocked: (pointerLocked) => set({ pointerLocked }),
  // Only notify subscribers when the focused thing actually changes.
  setFocus: (focus) =>
    set((s) => (s.focus?.id === focus?.id && s.focus?.label === focus?.label ? s : { focus })),
  setTravelLabel: (travelLabel) => set({ travelLabel }),
  requestSong: (currentSongId) => set((s) => ({ currentSongId, songRequest: s.songRequest + 1, playerOpen: true })),
  setPlayerOpen: (playerOpen) => set({ playerOpen }),
  setUiPanel: (uiPanel) => set({ uiPanel }),
  openDetails: (detailSongId) => set({ detailSongId, uiPanel: 'details' }),
  announce: (title, text) => set((s) => ({ announcement: { id: (s.announcement?.id ?? 0) + 1, title, text } })),
  setLaurels: (laurelsFound, laurelsAllFound) => set({ laurelsFound, laurelsAllFound }),
  clearAnnouncement: (id) => set((s) => (s.announcement?.id === id ? { announcement: null } : s)),
  setPlayback: (playback) => set({ playback }),
  setVolume: (volume) => set({ volume: Math.max(0, Math.min(1, volume)) }),
  setEffects: (patch) => set((s) => ({ effects: { ...s.effects, ...patch } })),
  discoverGrove: () => {
    writeMemory('grove-found', '1');
    set({ groveFound: true });
  },
}));
