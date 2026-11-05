# Putting Skar’s Elysium online

This guide gets the garden live at a free `https://<name>.pages.dev` address
on Cloudflare, with your music stored in Cloudflare R2. No domain needed.
Budget about an hour the first time.

## How it fits together

```
Visitor ──▶ https://<name>.pages.dev
             ├─ the game (static files, free and unlimited)
             └─ /media/*  ──▶ small Cloudflare function ──▶ R2 bucket
                                                         (songs, covers, manifest.json)
```

- The **game** only changes when the code changes (push to GitHub, it redeploys).
- **Music** changes with `npm run publish-media`; no rebuild, new visitors see it immediately.
- Media is served from the same address as the game, so no CORS setup is needed.

**Free-plan limits** (Cloudflare docs, Oct 2026): static files are free and
unlimited; the media function shares the Workers free quota of **100,000
requests per day** (a song play uses a handful). R2 includes 10 GB storage
free with no download fees. If you ever outgrow the daily quota, Cloudflare's
paid Workers plan lifts it.

> R2's own `r2.dev` web address is rate-limited and meant for development
> only, which is why the media goes through your Pages site instead.

---

## 1. Accounts and tools (one time)

1. Install **Node.js 22.18 or newer** from https://nodejs.org.
2. Create a free **GitHub** account and a free **Cloudflare** account.
3. In this project folder:
   ```bash
   npm install
   npm test            # all checks should pass
   npm run dev         # try it locally first
   ```

## 2. Put the code on GitHub

Create an empty repository on GitHub (e.g. `skars-elysium`), then:

```bash
git remote add origin https://github.com/<you>/skars-elysium.git
git push -u origin main
```

## 3. Create the media bucket

Cloudflare dashboard → **R2 Object Storage** → **Create bucket**
- Name: `skars-elysium-media` (or change `bucket_name` in `wrangler.toml` to match yours)
- Leave **public access off**; the site's function reads it privately.

## 4. Create the Pages site

Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** →
**Connect to Git** → pick your repository.

| Setting | Value |
| --- | --- |
| Project name | `skars-elysium` (becomes `skars-elysium.pages.dev`; pick another if taken) |
| Framework preset | Vite (or None) |
| Build command | `npm run build` |
| Build output directory | `dist` |

**Environment variables** (Settings → Variables, for Production):

| Name | Value |
| --- | --- |
| `NODE_VERSION` | `22` |
| `VITE_CONTENT_URL` | `/media/manifest.json` |
| `VITE_SITE_URL` | `https://skars-elysium.pages.dev` (your actual address) |

**Connect the bucket**: `wrangler.toml` already declares the `MEDIA` binding.
If the dashboard shows no binding under Settings → Bindings, add one:
type **R2 bucket**, variable name `MEDIA`, bucket `skars-elysium-media`.

Click **Save and Deploy**.

## 5. Publish your music

```bash
npx wrangler login                     # one time: opens Cloudflare in your browser
npm run publish-media -- --dry-run     # see what will be uploaded
npm run publish-media                  # upload songs, covers, then the manifest
```

Open your `pages.dev` address. 🎉

### Adding a song later

1. Put the file in `public/content/media/audio/` (and a cover in `media/covers/`).
2. Add the song to `public/content/manifest.json` (see README → Adding music).
3. `npm run validate-content`
4. `npm run publish-media`

That's it: no rebuild. Re-uploading a file **under the same name** can take up
to a day to reach visitors who already cached it; use a new file name
(e.g. `slow-burn-v2.mp3`) for instant changes.

### Before launch

- Replace the demo collections, songs and media in `public/content`
  (the demo tracks are synthesized placeholders).
- Previews and upcoming titles in the manifest are public once published. Only
  upload a full track when it's released; use `"teaser": true` to hide a title.

---

## 6. Test on real devices

The code has 333 automated checks, but graphics, sound and touch need real
hardware. Open your site (add `?debug` to see FPS and quality) and check:

**Desktop (Chrome, Safari, Firefox)**
- [ ] Title shows SKAR’S ELYSIUM; PRESS START opens the gates and glides in
- [ ] Pixelated look and gentle wobble (compare with `?retro=off`)
- [ ] WASD/arrows walk, Shift runs, mouse looks; you can't walk through the fountain, columns or walls
- [ ] Esc frees the mouse; clicking recaptures it
- [ ] Aim at a gold arrow: label appears; click glides you there; pressing W stops it
- [ ] Walk up to a flower: gold outline + title; E plays it; the halo follows the song
- [ ] Player: play/pause, next/previous, seek, volume, visualizer moves
- [ ] Effects: Slowed + Reverb sounds slowed and roomy; delay echoes; Dry returns to normal
- [ ] Golden bud in the EP Garden opens the Coming Soon card with a countdown
- [ ] Wind, birds and the fountain are audible; music ducks them
- [ ] Find a laurel; reload the page and settings still show it found

**iPhone (Safari)** and **Android (Chrome)**
- [ ] Tap to start produces sound (audio unlock)
- [ ] Left thumb walks, right thumb looks, both at once; full push runs
- [ ] LISTEN button plays a focused flower; tapping an arrow travels
- [ ] Lock screen shows the song with working play/pause/next
- [ ] Panels scroll on small screens; nothing bounces or zooms
- [ ] Android goes fullscreen on start
- [ ] `?debug` shows a steady FPS; quality may step down on older phones

**Link preview**: paste your address into iMessage or Discord; the pixel
banner should appear.

**Creator Studio** (after Studio steps 1–4)
- [ ] Someone else's email is stopped at the Cloudflare login
- [ ] Import, edit a song, upload a cover and a track; the top bar says "All changes saved"
- [ ] Flowers: the 3D preview appears and follows your color/size changes
- [ ] Decor: place a lantern; Publish → *Open private preview* shows it in the game, with "STUDIO PREVIEW" at the top
- [ ] Publish; the public garden shows the change after a reload
- [ ] Restore the previous version; the garden goes back

---

# The Creator Studio (private)

The Studio is a second, private website where you manage the garden without
touching code. It's a separate Cloudflare Pages project built from the
`studio/` folder of the same repository, locked so only your email can open it.

```
You ──▶ https://skars-elysium-studio.pages.dev
         ├─ Cloudflare Access login (only your email gets through)
         └─ /api/*  ──▶ Studio functions ──┬─▶ D1 database (your draft + publish history)
                                           └─▶ R2 bucket (the same one the garden reads)
Visitors never touch the Studio; the garden keeps working even if it's down.
```

Everything here is on Cloudflare's free plans (D1 free tier, Zero Trust free
for up to 50 users). Budget 20 minutes.

## Studio step 1. Create the database

Cloudflare dashboard → **Storage & Databases** → **D1 SQL Database** →
**Create** → name it `skars-elysium-studio`. That's all: the Studio creates
its own tables the first time it runs.

## Studio step 2. Create the Studio site

**Workers & Pages** → **Create** → **Pages** → **Connect to Git** → pick the
**same repository** again.

| Setting | Value |
| --- | --- |
| Project name | `skars-elysium-studio` |
| Framework preset | None |
| Root directory (advanced) | `studio` |
| Build command | `cd .. && npm ci && npm run build:studio` |
| Build output directory | `dist` |

**Variables** (Settings → Variables and Secrets, Production):

| Name | Value |
| --- | --- |
| `NODE_VERSION` | `22` |
| `GARDEN_URL` | your garden's address, e.g. `https://skars-elysium.pages.dev` |
| `ADMIN_EMAILS` | your email (several? separate with commas) |
| `ACCESS_TEAM_DOMAIN` | filled in during step 3 |
| `ACCESS_AUD` | filled in during step 3 |

**Bindings** (Settings → Bindings):

| Type | Variable name | Value |
| --- | --- | --- |
| D1 database | `DB` | `skars-elysium-studio` |
| R2 bucket | `MEDIA` | `skars-elysium-media` (the garden's bucket) |

Deploy. Until step 3 is done the Studio shows **“The Studio is locked”** and
refuses every request: it fails closed, never open.

## Studio step 3. Lock it to your email (Cloudflare Access)

1. Dashboard → **Zero Trust**. The first time, pick a **team name** (e.g.
   `skar`) and the **Free** plan. Cloudflare may ask for a card even though
   the Free plan costs $0.
2. **Access** → **Applications** → **Add an application** → **Self-hosted**.
   - Name: `Skar’s Elysium Studio`
   - Public hostname: `skars-elysium-studio.pages.dev`
   - Add a second hostname `*.skars-elysium-studio.pages.dev`
     (covers preview builds)
   - Policy: **Allow**, include **Emails** → your email
   - Login method: **One-time PIN** (a code is emailed to you) is fine
3. Open the application's overview and copy its **Application Audience (AUD) Tag**.
4. Back in the Studio project's variables, set:
   - `ACCESS_TEAM_DOMAIN` = your team name (`skar`)
   - `ACCESS_AUD` = the AUD tag
5. **Deployments** → **Retry deployment** (variables apply to new deployments).

Open `https://skars-elysium-studio.pages.dev`: you'll get Cloudflare's login,
a code by email, then the Studio. Anyone else gets stopped at the login. As a
second lock, the Studio's own code re-checks every request's signed login
token, its team, its app and your email.

## Studio step 4. Bring in your garden

On the Studio home page, **Import live garden** copies the beds, songs,
decorations and atmosphere visitors see today into your draft. Nothing
changes for visitors.

From now on, manage music in the Studio instead of `public/content` and
`npm run publish-media`: publishing from the Studio and running the script
would overwrite each other. (If it happens, the Studio warns you and can
import the live garden again.)

## Using the Studio day to day

| Tab | What it's for |
| --- | --- |
| **Music** | Add songs (drag audio files in), files, release state and date, auto-bloom |
| **Beds** | Albums, EPs, singles, genre beds and the vault; place them on the map; drag songs between them |
| **Flowers** | Each song's flower: type, colors, size, label, description, with a live 3D preview |
| **Decor** | Statues, columns, lanterns, benches, urns, archways, trees, hedges; sky, mist, particles, clouds |
| **Files** | Everything you've uploaded, and what uses it |
| **Publish** | What changed, a private preview of the real game, the publish button, and your version history |

Every change saves itself as a **private draft**. Visitors see nothing new
until you press **Publish to the garden**; then everyone gets it on their
next visit, with no rebuild. Problems (a released song without its full
track, a missing file) block publishing so the live garden never breaks.
**Restore** on any earlier version puts it live again in one click.

**Private preview**: Publish → *Open private preview* runs the real game
with your draft at `…studio.pages.dev/preview/`, behind the same login.

**Optional:** so a Studio change doesn't rebuild the garden (and vice versa),
set **Build watch paths** (Settings → Builds): garden project exclude
`studio/*`; Studio project include `studio/*`, `src/content/*`, `src/config/*`.

**Optional, local testing:** copy `studio/.dev.vars.example` to
`studio/.dev.vars`, then `npm run studio:local` and open http://localhost:8788
(a local practice database; your real one isn't touched).

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| "Couldn't load" on every song | Run `npm run publish-media`; check the `MEDIA` binding and `VITE_CONTENT_URL` |
| Beds are empty / "song list couldn't load" | `/media/manifest.json` missing: publish media; check the binding |
| `Media storage is not connected` | Add the `MEDIA` R2 binding to the Pages project, then redeploy |
| Old song version still playing | Use a new file name, or wait up to a day |
| Black screen | Try another browser; open the browser console and send me the error |
| Studio: “The Studio is locked … missing” | Set the named variables (Studio step 2/3), then retry the deployment |
| Studio: “Token is for a different Access application” | `ACCESS_AUD` doesn't match the app's AUD tag; copy it again |
| Studio: “… is not allowed into the Studio” | Add that email to `ADMIN_EMAILS` (and the Access policy) |
| Studio: “The database is not connected” | Add the `DB` binding (Studio step 2), retry the deployment |
| Studio: “Sign-in expired” | Reload the page and sign in again |
| Studio: “Some files are missing from storage” | Upload those files again on the song's page (Music), then publish |
| Studio: “changed outside the Studio” | Someone ran `publish-media`. Publish to replace it, or Home → Start over from the live garden to keep it |
| Private preview shows the old garden or a blank page | Retry the Studio deployment; the preview is built with it (`npm run build:studio`) |
