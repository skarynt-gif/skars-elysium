# Skar's Elysium

A first-person, retro (PS1 / early-PS2) 3D music portfolio. Visitors explore a
Greek garden at sunset where flower beds are collections and flowers are songs.

## Getting started

Requires **Node.js 22.18 or newer** (runs the tests and content checker
directly from TypeScript).

```bash
npm install
npm run dev        # open the printed URL; phones on the same Wi-Fi can use the Network URL
npm test           # unit tests
npm run typecheck  # strict TypeScript check
npm run build      # production build into dist/
npm run validate-content   # check public/content before publishing
npm run publish-media      # upload music to the live garden (see DEPLOY.md)
```

**To put the garden online, follow [DEPLOY.md](DEPLOY.md)** (Cloudflare Pages
+ R2, free `pages.dev` address, no domain needed).

URL switches for testing on any device (including the live site):

| Switch | Effect |
| --- | --- |
| `?debug` | Diagnostics panel (always on in dev) |
| `?retro=off` | Disable the whole retro pass, for comparison |
| `?wobble=off` | Keep pixels and colors, disable PS1 vertex wobble |
| `?dither=off` | Keep limited colors, disable dithering |
| `?skipintro` | Skip the title and gate intro (development) |
| `?orbit` | Free orbit camera for inspecting the world (development) |

## Retro rendering

`src/game/render/` produces the PS1/early-PS2 look:

- **Low-res frame:** the scene renders into a small frame (240–448px tall by
  quality tier) using a whole-number scale, so every retro pixel is the same size.
- **Vertex wobble:** `retroMaterial(material)` adds PS1 vertex snapping to any
  built-in Three.js material. Lighting, fog and textures keep working.
  Turned off automatically for visitors who prefer reduced motion.
- **Color pass:** 32 shades per channel (PS1 15-bit color) with 4×4 ordered
  dithering. Tune in `GAME_CONFIG.retro`.
- **Pixel textures:** `createPixelTexture()` paints small textures in code;
  `configurePixelTexture()` prepares loaded PNGs the same way.

## Testing

`npm test` runs 229 automated checks (Node's built-in test runner), including:

- an end-to-end pipeline test on the real demo manifest and media
  (validation → beds → flowers → arrows → walkable routes → playable files)
- every path, arrow route and collectible is reachable without clipping
- the audio engine and effects against a simulated Web Audio graph
  (crossfades, rapid clicks, load failures, autoplay refusal, feedback caps)
- movement at 30/60/144fps, wall sliding, no tunnelling through walls
- the quality governor never flip-flops

The demo songs in `public/content/media` are short synthesized placeholders
(about 1.4 MB total) so the garden can be played immediately; replace them.

**Before launch, test on real devices:** a desktop browser, an iPhone
(Safari) and an Android phone. Add `?debug` to see FPS and quality tier.

## Project structure

```
public/content/manifest.json   Song and collection data (DEMO DATA, replace)
public/content/media/          Songs, previews, covers (demo placeholders)
public/_headers                Security and caching headers (Cloudflare Pages)
functions/media/[[path]].ts    Serves R2 media at /media/* (Cloudflare Pages Function)
scripts/validate-content.ts    Checks the manifest and media files before upload
scripts/publish-media.ts       Uploads songs and the manifest to R2 (manifest last)
wrangler.toml                  Cloudflare project + R2 bucket binding
src/
  config/      Game constants, release time zone, quality tiers
  content/     Manifest types, validation, loading, flower rules
  platform/    Device capability detection
  state/       Shared Zustand store (3D world ↔ HTML interface)
  game/        React Three Fiber scene and per-frame systems
  ui/          HTML interface layered over the 3D canvas
studio/                        The private Creator Studio (its own Cloudflare Pages project)
  src/         Studio web page (React)
  server/      API logic: sign-in check, database, manifest conversion (tested in Node)
  functions/   Cloudflare Pages Functions entry (/api/*)
```

Per-frame values (camera position, velocity) stay in refs inside the render
loop, never in React state, so the game doesn't re-render 60 times a second.

## Adding music

> Once the Creator Studio is set up (DEPLOY.md), add and edit music there
> instead; the steps below are the manual way, without the Studio.

1. Upload the audio file (and optional cover art) next to the manifest, e.g.
   `media/audio/my-song.mp3` and `media/covers/my-song.webp`.
2. Add an entry to `songs` in `manifest.json`:

```json
{
  "id": "my-song",
  "title": "My Song",
  "artist": "Artist Name",
  "collectionId": "my-album",
  "genre": "rnb",
  "status": "released",
  "audio": "media/audio/my-song.mp3",
  "cover": "media/covers/my-song.webp",
  "releaseDate": "2026-12-04",
  "flower": { "hue": 20, "scale": 1.1 }
}
```

3. Run `npm run validate-content` to catch typos and missing files.

| Field | Values |
| --- | --- |
| `genre` | `rnb`, `psychedelic`, `melodic-rap`, `rage`, `other` |
| `status` | `released` (bloomed), `upcoming` (golden bud), `unreleased` (ghostly, vaulted) |
| `releaseDate` | `2026-12-04` (midnight Eastern) or `2026-12-04T09:00:00-05:00` |
| `teaser` | `true` on an upcoming song: shows a "???" sprout and hides the title |
| `flower.species` | `rose`, `spiral`, `iris`, `thistle`, `asphodel`, `lily` (optional override) |

Collections use `type` (`album`, `ep`, `single`, `genre`, `vault`) and `area`
(`main`, `ep-garden`, `hidden`). Set `"autoBloom": true` on a collection to
have its upcoming songs bloom automatically at their release time.

A broken entry is skipped with a message rather than breaking the garden.

**Unreleased music:** anything a browser can play can be downloaded. Use
short `preview` snippets for upcoming and vaulted songs, and add full `audio`
only at release.

In production the manifest and media live in Cloudflare R2: edit
`public/content`, then `npm run publish-media`. New songs never need a
rebuild (see DEPLOY.md).

## Development stages

| # | Stage | Status |
| --- | --- | --- |
| 1 | Project setup | Done |
| 2 | Retro 3D rendering system | Done |
| 3 | Garden environment (incl. title screen gates) | Done |
| 4 | First-person camera and movement | Done |
| 5 | Ground navigation arrows | Done |
| 6 | Flower interaction system | Done |
| 7 | Music playback engine | Done |
| 8 | Game-style music interface | Done |
| 9 | Reverb, delay and playback speed | Done |
| 10 | Special EP garden | Done |
| 11 | Environmental animations | Done |
| 12 | Mobile optimization | Done |
| 13 | Testing | Done |
| 14 | Deployment preparation | Done |
| 15 | Creator Studio foundation (private login, database, import) | Done |
| 16 | Studio: music manager (uploads, release states) | Done |
| 17 | Studio: garden beds | Done |
| 18 | Studio: flower editor | Done |
| 19 | Studio: decorations and environment | Done |
| 20 | Studio: save, preview, publish, history | Done |

## Creator Studio

A private dashboard at its own address (`skars-elysium-studio.pages.dev`)
for managing the garden without editing code. Setup: DEPLOY.md, "The Creator
Studio".

- **Private:** Cloudflare Access lets only your email through its login, and
  the Studio's own code re-verifies Access's signed token (team, app, email)
  on every request. Missing settings lock it rather than open it.
- **Draft vs. live:** the Studio keeps a draft in a Cloudflare D1 database.
  Visitors only ever see the published `manifest.json` in R2, so the game
  needs no login and keeps running even if the Studio is down.
- **Same rules as the game:** the Studio converts its draft to the exact
  manifest format and runs the game's own content checks on it.
- **Self-installing database:** tables are created and upgraded
  automatically (`studio/server/migrations.ts`); no database commands.
- **Music, beds, flowers, decor:** uploads are checked by content and stored
  under fresh names; beds can be pinned to spots on a map drawn from
  `layout.ts`; flowers preview with the game's own models; decorations follow
  walkability rules shared with the game (`game/world/decorations.ts`);
  atmosphere settings are clamped to safe ranges (`game/world/environment.ts`).
- **Publish:** writes `manifest.json` to R2 (the only file the game reads),
  keeps every version in D1 for one-click restore, and refuses drafts with
  problems or missing files. `npm run build:studio` also builds the game into
  `studio/dist/preview/` reading `/api/draft/manifest.json`, for a private
  preview behind the same login.
- `npm run studio:local` runs it locally against a practice database.

## Controls

| Desktop | Phone / tablet |
| --- | --- |
| WASD or arrow keys: walk | Left side: floating joystick |
| Shift: run | Push the joystick fully: run |
| Mouse: look (click to capture) | Right side: drag to look |
| Click: select at the crosshair | Tap: select |
| Esc: release the mouse | |
| Space: play/pause, `[` `]`: previous/next | Corner buttons: settings, music |
| M: music panel, O: settings | |

Controls are chosen by the device's primary pointer, so touchscreen laptops
keep mouse controls. Collision uses the layout's colliders (the garden is
flat, so it's 2D and needs no physics engine); visitors slide along walls.

## Flowers

Every song is a flower, planted automatically in its collection's bed:

| Flower | Used for | Motion |
| --- | --- | --- |
| Rose (crimson, gold heart) | `rnb` | slow, smooth sway |
| Spiral (rainbow, color-cycling) | `psychedelic` | slow wobble |
| Iris (blue-violet, silver) | `melodic-rap` | flowing |
| Thistle (red/black spikes) | `rage` | twitchy pulse |
| Lily (peach trumpet) | `other` | smooth sway |
| Golden bud | `upcoming` songs | gentle pulse |
| Ghostly asphodel | `unreleased` songs | slow drift |

Songs in a bed share a species but vary in hue, height and lean (stable per
song). Singles stand on small marble plinths; vault songs ring the hidden
grove's shrine. Walk up to a flower to focus it (gold outline + title), then
press **E** / click (desktop) or tap **LISTEN** (phone).

## Music player and settings

- **Compact bar** (top of the screen): coin-style cover that turns while
  playing, title/artist, play/pause, next, expand, hide.
- **Full panel**: artwork, title, artist, album, seekable progress, previous /
  play / next, volume with mute, and a pixel visualizer driven by the audio.
- **Settings**: music volume, look speed, invert look, head bob, graphics
  quality (Auto/Low/Med/High). Saved in the browser and restored next visit.
- On desktop, opening a panel frees the mouse so sliders can be dragged;
  closing it recaptures the mouse.

## Music engine

`src/audio/engine.ts` runs on the Web Audio API. The audio graph is built once
(inside the PRESS START tap, which also unlocks audio on iPhone):

```
deck A ─┐            ┌─▶ dry ─────────────────────────┐
        ├─▶ input ───┼─▶ reverb (2 convolvers, A/B) ─┼─▶ volume ─▶ analyser ─▶ speakers
deck B ─┘            └─▶ delay ⇄ tone filter ─────────┘
```

- Songs stream through two `<audio>` decks and crossfade (equal-power, 0.5s).
- Rapid selections are safe: only the latest one plays.
- A song that fails to load shows an error; the current song keeps playing.
- When a song ends, the next playable song in the same bed starts.
- Lock-screen / headphone controls and artwork via the Media Session API.

**Effects** (full player): speed 0.5x–2x with a keep-pitch toggle, reverb
size (courtyard → temple, generated in code) and wet/dry, delay time,
feedback (capped at 85%) and wet/dry, plus presets: Dry, Slowed + Reverb,
Temple Echo, Sped Up. All changes glide smoothly, process the real audio,
and persist across songs and visits. Original files are never modified.

Media is served from the same address as the game (`/media/*`), so no CORS
setup is needed. If you ever host audio on another domain, it must send CORS
headers, or browsers refuse to route it through Web Audio.

## Garden life

All procedural, so there are no extra files to download:

- **Visuals:** butterflies (perch on flowers, scatter when approached),
  fireflies (thickest around the hidden grove), drifting motes, golden dust in
  the sanctuary, flowing fountain water with ripples, drifting pixel clouds.
  Counts scale with the graphics quality setting.
- **Sound** (its own channel, never affected by music effects): wind gusts,
  a 3D-positioned fountain, birdsong, cicadas, rare wind chimes. Dips while
  music plays; "Garden Sounds" volume in settings.
- **Laurels:** 8 golden wreaths hidden around the garden. Progress is saved
  in the browser and shown in settings; finding all of them turns the fountain
  to gold. Spots are listed in `src/game/collectibles/collectibles.ts`.

## Upcoming EP Garden

Collections with `"area": "ep-garden"` grow in the walled sanctuary north of
the plaza; its gateway plaque names the EP.

- **Growth stages:** teaser sprout ("???") → golden bud (title + date) → bloom.
- **Selecting a bud** opens a Coming Soon card: title, release date, a live
  countdown, and PLAY PREVIEW when the song has a `preview` snippet.
- **Blooming:** set `"status": "released"`, or set `"autoBloom": true` on
  the collection and buds open by themselves at their release moment, even
  while visitors are in the garden.
- **Bloom celebration:** visitors who saw a bud before see it unfold with
  gold bursts and a NEW RELEASE banner the first time they come near it.
- **After release:** change the collection to `"area": "main"` to move it into
  a permanent bed and free the sanctuary for the next project.
- The grass grows denser as more songs are released.

## Navigation arrows

Marble arrows with pulsing gold inlays sit in the paths. Aim at one (or tap it)
to glide there along the paths; any movement input stops the glide, and you
can look around while gliding. Arrows are generated from the manifest: each
bed with music gets an arrow out from the plaza and one back. The hidden
grove's arrow appears only after a visitor has found it once.

## Performance and mobile

- Renders at 240–448 pixels tall (by quality tier), then upscales: phones draw
  a fraction of the pixels a normal 3D site would.
- **Auto graphics** watch the frame rate and step quality down on a
  struggling device, and back up only after a long smooth stretch (no
  flickering between settings; 30fps low-power mode isn't penalised).
- Rendering pauses while the tab is hidden; garden sounds go quiet.
- If a phone drops the 3D graphics under memory pressure, a recovery screen
  appears (with a reload button if it doesn't come back on its own).
- Android goes fullscreen at PRESS START; phones held upright get a
  dismissable "turn sideways" tip (portrait still works).
- Add `?debug` on a phone to see FPS, tier and frame size.

## The garden

`src/game/world/layout.ts` is the floor plan every system reads from: bed
plots, paths, colliders, and the navigation graph. Tests verify that every
path and navigation route is walkable without hitting anything.

- **Main beds:** 10 plots around the plaza (6 inner, 4 outer). Collections
  with `"area": "main"` fill them in order; empty plots look overgrown.
- **EP sanctuary:** walled, north of the plaza, 3 beds for `"area": "ep-garden"`.
- **Hidden grove:** a ring of cypress and hedges south-east of the plaza, with
  one gap reached by an unmarked trail off the entrance avenue.
  Holds the first `"area": "hidden"` collection.

Every model and texture is generated in code (low-poly, 16–32px pixel
textures), so there are no 3D files to download. Any of them can later be
replaced by a Blender `.glb` or a hand-drawn PNG.
