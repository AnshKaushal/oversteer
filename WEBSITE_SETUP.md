# Marketing website setup — OverSteer

Recommendation: keep the marketing site in this repo under `/website` (monorepo) instead of a separate repo.

Why:
- One source of truth for version, screenshots, car list, changelog.
- Vercel deploys a subdirectory natively (set **Root Directory** to `website`).
- One git history; website PRs can reference game commits.

The one catch: `.github/workflows/release.yml` runs on **every** push to `main`. Without changes, a typo fix in marketing copy would ship a new game build and bump the patch version. Fix with **path filters** (Step 3).

Alternative if you prefer full isolation: a separate repo (`oversteer-site`). Trade-off: you'll manually sync version/screenshots.

---

## Step 1 — Scaffold `/website` with Astro

From the repo root:

```bash
# Create the folder and scaffold (pick "Empty" or a starter template)
mkdir website
cd website
npm create astro@latest . -- --template minimal --typescript strict --no-install
# or: pnpm create astro@latest . --template minimal --typescript strict --no-install

# Install deps
npm install
# Tailwind (optional but recommended for a landing page)
npx astro add tailwind
```

Suggested structure:

```
website/
├── astro.config.mjs
├── package.json
├── tsconfig.json
├── public/
│   ├── favicon.svg
│   ├── screenshots/        # copy from game release assets / capture fresh
│   └── downloads/          # optional: mirror of latest DMG/zip
├── src/
│   ├── layouts/
│   │   └── Base.astro
│   ├── components/
│   │   ├── Hero.astro
│   │   ├── CarGrid.astro
│   │   ├── Features.astro
│   │   └── Download.astro
│   └── pages/
│       └── index.astro
└── README.md
```

`website/astro.config.mjs`:

```js
import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  site: 'https://oversteer.example.com', // set your domain
  integrations: [tailwind()],
  output: 'static',
});
```

`website/package.json`:

```json
{
  "name": "oversteer-site",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "check": "astro check"
  },
  "dependencies": {
    "astro": "^5.0.0",
    "@astrojs/tailwind": "^5.0.0",
    "tailwindcss": "^4.0.0"
  }
}
```

Add `website/` to the root `.gitignore` build outputs (Astro writes to `website/dist`):

```gitignore
# website
website/dist/
website/.astro/
website/node_modules/
```

---

## Step 2 — Vercel project setup

1. Push the repo (with `/website`) to GitHub.
2. In Vercel: **Add New → Project → import `car-game`**.
3. **Framework Preset**: Astro (auto-detected).
4. **Root Directory**: `website`  ← important, this is what makes the monorepo work.
5. Build command: `npm run build` (default). Output dir: `dist` (default).
6. Deploy. Every push to `main` that touches `website/**` redeploys; pushes that only touch game code won't trigger a site redeploy unless you configure "Ignored Build Step" — optional.

Preview deploys: Vercel creates a preview URL for every PR automatically.

Custom domain: add in Vercel → Project → Settings → Domains.

---

## Step 3 — Path-filter the game release workflow (critical)

Edit `.github/workflows/release.yml` so game releases only fire when game code changes. Add `paths` (and `paths-ignore`) to the `push` trigger:

```yaml
on:
  push:
    branches: [main]
    paths:
      - 'src/**'
      - 'scripts/**'
      - 'public/**'
      - 'package.json'
      - 'pnpm-lock.yaml'
      - 'electrobun.config.ts'
      - 'vite.config.ts'
      - 'tsconfig.json'
      - '.github/workflows/release.yml'
  workflow_dispatch:
```

Equivalent diff:

```diff
 on:
   push:
     branches: [main]
+    paths:
+      - 'src/**'
+      - 'scripts/**'
+      - 'public/**'
+      - 'package.json'
+      - 'pnpm-lock.yaml'
+      - 'electrobun.config.ts'
+      - 'vite.config.ts'
+      - 'tsconfig.json'
+      - '.github/workflows/release.yml'
   workflow_dispatch:
```

Notes:
- `workflow_dispatch` still lets you manually release anytime.
- If you later add a website-only workflow (e.g. Lighthouse), keep it separate and path-filtered to `website/**`.
- If you want the site to redeploy on game releases (e.g. to update a "latest version" badge), trigger Vercel via a deploy hook from the release job instead of relying on git push.

---

## Step 4 — Share version / data between game and site

Option A (simplest): hardcode the current version in the site and bump manually on release. Low effort, fine for a landing page.

Option B (auto): read the game's version at build time. Add a small script that copies `package.json` version into the site:

`scripts/sync-version.mjs` (in game root):

```js
import { readFileSync, writeFileSync } from 'node:fs';
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
writeFileSync('website/src/version.ts', `export const VERSION = '${pkg.version}';\n`);
console.log('synced version', pkg.version);
```

Run before building the site (Vercel build command: `node ../scripts/sync-version.mjs && npm run build`), or wire into a prebuild script. Note `scripts/` here refers to the game repo root; adjust paths if Vercel's working dir is `website/`.

Option C: fetch latest release from GitHub API at build time:

```astro
---
const res = await fetch('https://api.github.com/repos/AnshKaushal/car-game/releases/latest');
const release = await res.json();
const version = release.tag_name; // e.g. "v2.0.4"
const dmg = release.assets.find(a => a.name.endsWith('.dmg'));
---
<a href={dmg?.browser_download_url}>Download {version}</a>
```

Recommended: combine B (version) + C (download URLs), so download links always point to the newest release without manual updates.

---

## Step 5 — Content checklist for the landing page

- Hero: game name, one-line pitch, "Download for macOS / Windows" buttons.
- Screenshots / short gameplay GIF or video (capture from the app; keep < 5 MB).
- Feature list (reuse README bullets).
- Car grid (12 cars — names + thumbnails if you have them).
- Controls summary (compact).
- System requirements (macOS/Windows, Apple Silicon + x64).
- Gatekeeper install note (reuse `.github/MACOS_INSTALL_NOTE.md`).
- Footer: GitHub repo link, releases link, license.

---

## Step 6 — Optional: auto-update "latest version" on release

Add to the `release` job in `release.yml` (after creating the release), a step that triggers a Vercel deploy hook:

```yaml
- name: Trigger website redeploy
  if: success()
  run: curl -X POST "${{ secrets.VERCEL_DEPLOY_HOOK_URL }}"
```

Store `VERCEL_DEPLOY_HOOK_URL` in repo secrets (Vercel → Project → Settings → Git → Deploy Hooks).

---

## If you change your mind: separate repo

```bash
# from a new empty repo
git clone https://github.com/AnshKaushal/car-game.git oversteer-site  # no — start fresh
mkdir oversteer-site && cd oversteer-site
npm create astro@latest .
git init && git remote add origin https://github.com/AnshKaushal/oversteer-site.git
```

Then duplicate screenshots/version manually, or pull them via the GitHub API at build time (Step 4, Option C). Keep this doc's Step 2/5/6.

---

## Done when

- [ ] `/website` builds locally (`npm run build` in `website/`).
- [ ] Vercel project created with Root Directory = `website`.
- [ ] `release.yml` has path filters; a website-only commit to `main` does not create a GitHub Release.
- [ ] Download buttons resolve to latest release assets.
- [ ] Custom domain configured (optional).
