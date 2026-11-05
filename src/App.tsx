import { useEffect, useState } from 'react';
import { GAME_CONFIG } from './config/gameConfig.ts';
import { buildQualitySettings, chooseQualityTier } from './config/quality.ts';
import { detectCapabilities, type DeviceCapabilities } from './platform/capabilities.ts';
import { loadManifest } from './content/loadManifest.ts';
import { useGameStore } from './state/gameStore.ts';
import { DEFAULT_PREFS, parsePrefs, serializePrefs } from './state/prefs.ts';
import { readMemory, writeMemory } from './platform/visitMemory.ts';
import { GameCanvas } from './game/GameCanvas.tsx';
import { DebugOverlay } from './ui/DebugOverlay.tsx';
import { TitleScreen } from './ui/TitleScreen.tsx';
import { ExploreOverlay } from './ui/ExploreOverlay.tsx';
import { TouchControls } from './ui/TouchControls.tsx';
import { FocusPrompt } from './ui/FocusPrompt.tsx';
import { MusicController } from './audio/MusicController.tsx';
import { MusicPlayer } from './ui/player/MusicPlayer.tsx';
import { SettingsMenu } from './ui/SettingsMenu.tsx';
import { HudButtons } from './ui/HudButtons.tsx';
import { KeyboardShortcuts } from './ui/KeyboardShortcuts.tsx';
import { ComingSoonCard } from './ui/ComingSoonCard.tsx';
import { AnnouncementBanner } from './ui/AnnouncementBanner.tsx';
import { DEBUG_FLAGS } from './platform/flags.ts';
import { startGesture } from './platform/startGesture.ts';
import { GraphicsLostOverlay } from './ui/GraphicsLostOverlay.tsx';
import { OrientationHint } from './ui/OrientationHint.tsx';
import { introClock } from './game/intro/introClock.ts';
import { UnsupportedScreen } from './ui/UnsupportedScreen.tsx';

/** Built into the Creator Studio's private preview (shows the draft, not the live garden). */
const IS_STUDIO_PREVIEW = Boolean(import.meta.env.VITE_PREVIEW);

/**
 * Boot sequence: detect the device → restore saved preferences → pick a
 * quality tier → load the song manifest → title screen. If the manifest
 * fails, the garden still opens (with empty beds) rather than hanging on LOADING.
 */
export function App() {
  const [caps] = useState<DeviceCapabilities>(() => detectCapabilities());
  const quality = useGameStore((s) => s.quality);
  const qualityChoice = useGameStore((s) => s.settings.quality);
  const autoTier = useGameStore((s) => s.autoTier);
  const setQuality = useGameStore((s) => s.setQuality);
  const setContent = useGameStore((s) => s.setContent);
  const setPhase = useGameStore((s) => s.setPhase);

  // Restore saved preferences once; reduced-motion visitors default to no head bob.
  useEffect(() => {
    const defaults = { ...DEFAULT_PREFS, headBob: !caps.prefersReducedMotion };
    const { volume, effects, ...settings } = parsePrefs(readMemory('prefs'), defaults);
    const store = useGameStore.getState();
    store.updateSettings(settings);
    store.setVolume(volume);
    store.setEffects(effects);

    // Save whenever a preference changes.
    return useGameStore.subscribe((state, prev) => {
      if (state.settings === prev.settings && state.volume === prev.volume && state.effects === prev.effects) return;
      writeMemory('prefs', serializePrefs({ ...state.settings, volume: state.volume, effects: state.effects }));
    });
  }, [caps]);

  // Graphics quality: the visitor's choice, or automatic (device guess,
  // adjusted live by the performance governor).
  useEffect(() => {
    const tier = qualityChoice === 'auto' ? (autoTier ?? chooseQualityTier(caps)) : qualityChoice;
    setQuality(buildQualitySettings(tier, caps));
  }, [caps, qualityChoice, autoTier, setQuality]);

  // Android allows fullscreen from the PRESS START tap (iPhone doesn't for websites).
  useEffect(() => {
    const root = document.documentElement;
    if (!caps.coarsePointer || caps.isIOS || !root.requestFullscreen) return;
    return startGesture.onStart(() => {
      void root.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
    });
  }, [caps]);

  useEffect(() => {
    let cancelled = false;
    loadManifest(GAME_CONFIG.contentUrl, GAME_CONFIG.releaseTimeZone)
      .then(({ manifest, issues }) => {
        if (cancelled) return;
        for (const issue of issues) {
          const log = issue.severity === 'error' ? console.error : console.warn;
          log(`[content] ${issue.path}: ${issue.message}`);
        }
        setContent({ status: 'ready', manifest, issues });
        openGates();
      })
      .catch((err: Error) => {
        if (cancelled) return;
        console.error(`[content] ${err.message}`);
        setContent({ status: 'failed', message: err.message });
        openGates();
      });

    function openGates() {
      if (DEBUG_FLAGS.skipIntro) {
        // Development shortcut: play the intro instantly.
        setPhase('entering');
        introClock.skipRequested = true;
      } else {
        setPhase('title');
      }
    }
    return () => {
      cancelled = true;
    };
  }, [setContent, setPhase]);

  if (!caps.webgl2) return <UnsupportedScreen />;

  const touch = caps.coarsePointer;
  return (
    <div className="app">
      <MusicController />
      <KeyboardShortcuts />
      {quality && <GameCanvas quality={quality} mouseLook={!touch} autoTierCeiling={chooseQualityTier(caps)} touch={touch} />}
      {touch ? <TouchControls /> : <ExploreOverlay />}
      <FocusPrompt touch={touch} />
      <MusicPlayer touch={touch} />
      <HudButtons />
      <SettingsMenu touch={touch} />
      <ComingSoonCard touch={touch} />
      <AnnouncementBanner />
      {IS_STUDIO_PREVIEW && (
        <div className="preview-banner" role="status">
          STUDIO PREVIEW · NOT LIVE
        </div>
      )}
      <OrientationHint touch={touch} />
      <GraphicsLostOverlay />
      <TitleScreen touch={touch} />
      <DebugOverlay caps={caps} />
    </div>
  );
}
