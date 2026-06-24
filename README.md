# Limalego

A standalone **mobile app** that helps you find which LEGO® parts from your
scattered brick pile belong to a specific set you want to build. You point your
phone's camera at a brick, the app tells you which of your tracked sets need it
and in which color — so you can pick the right ones out of a 10 000-piece pile
without losing your sanity.

Everything runs on the phone. No home server: the sets you track live in a
local database on the device, and each set's parts list is pulled live from the
[Rebrickable](https://rebrickable.com/) API when you add it. Part recognition
uses the public [Brickognize](https://brickognize.com/) API.

> Built with Expo / React Native. The earlier self-hosted web version
> (FastAPI + React) lived under `backend/` and `frontend/` and remains in the
> git history.

## What it does

- **My sets** — track which LEGO sets you own / want to build, grouped by
  theme, with status (tracking / building / done) and overall progress.
- **Per-set inventory** — every part the set needs, grouped and filtered by
  color, with real-product photos. Tap `+/−` to mark how many you've collected.
  Grab a box of red bricks, filter to red, see exactly what's still missing.
- **Camera scan** — point your phone at a brick; the app calls Brickognize,
  cross-references the result against *every* set you're tracking, and tells
  you where it's needed and in which color (or that it fits nowhere).
- **Stats** — total parts across all your sets, most-needed colors, the sets
  closest to completion.

## Tech stack

- **Expo / React Native** (TypeScript) — iPhone & Android.
- **expo-sqlite** — on-device database of your tracked sets (a few MB, not the
  full ~130 MB Rebrickable catalog).
- **expo-secure-store** — your Rebrickable API key, entered in-app.
- **expo-camera / expo-image-picker** — the scan camera.
- **Rebrickable API** + **Brickognize API** — called directly from the device.

## Prerequisites

- Node 20+ on your computer.
- A **free Rebrickable API key** — create an account at
  <https://rebrickable.com/>, then Profile → Settings → API → generate. Enter
  it in the app's **Settings** tab on first run.
- The **Expo Go** app on your phone (for development), or an
  [Expo account](https://expo.dev/) for cloud builds.

## Run it (development)

```bash
cd mobile
npm install
npx expo start
```

Scan the QR code with Expo Go (Android) or the Camera app (iOS). On first
launch, open **Settings** and paste your Rebrickable API key, then add a set
from the **Find** tab.

## Build a standalone app (no Mac needed)

[EAS Build](https://docs.expo.dev/build/introduction/) compiles the app in
Expo's cloud — no Xcode or Android Studio required locally:

```bash
npm install -g eas-cli
eas login
eas build -p android        # installable .apk/.aab
eas build -p ios            # iOS (needs an Apple Developer account to install)
```

## Project layout

```
limalego/
├── mobile/                  Expo / React Native app
│   ├── App.tsx              navigation (tabs + set-detail stack)
│   └── src/
│       ├── api/             rebrickable.ts, brickognize.ts  (network clients)
│       ├── db/              schema.ts, database.ts          (expo-sqlite)
│       ├── store/           settings.ts                     (secure-store: API key)
│       ├── data/            sets / inventory / scan / stats  (app logic)
│       ├── components/      PartThumb.tsx
│       └── screens/         Home, SetSearch, SetDetail, Scan, Settings
└── LICENSE
```

## Credits

- [Rebrickable](https://rebrickable.com/) — parts/sets database, photos.
- [Brickognize](https://brickognize.com/) — public part-recognition API.
- LEGO® is a registered trademark of the LEGO Group, which does not sponsor,
  endorse, or authorize this software.

## License

MIT — see [LICENSE](LICENSE).
