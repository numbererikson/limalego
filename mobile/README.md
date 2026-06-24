# Limalego Mobile

A standalone **Expo / React Native** version of Limalego that runs entirely on
your phone — no home server to keep running. It stores the sets you track in a
local SQLite database on the device and pulls each set's parts list live from
the Rebrickable API when you add it.

## How it differs from the web app

| | Web app (`/frontend` + `/backend`) | Mobile app (`/mobile`) |
|---|---|---|
| Backend | Python/FastAPI on a LAN box | none — all on the phone |
| Data | full ~130 MB Rebrickable catalog in SQLite | only your tracked sets (a few MB) |
| Adding a set | flip a flag on pre-imported catalog | fetch parts live from Rebrickable API |
| Part recognition | Brickognize (server proxy) | Brickognize (called directly) |
| Needs internet | for scanning | for scanning **and** adding a set |

The scan workflow is identical: photograph a brick, Brickognize identifies the
shape, and the app cross-references it against every set you track to tell you
where it's still needed and in which color.

## Prerequisites

- Node 20+ on your computer.
- A **free Rebrickable API key** — create an account at
  <https://rebrickable.com/>, then Profile → Settings → API → generate. You
  enter this in the app's **Settings** tab on first run.
- The **Expo Go** app on your phone (for development), or an
  [Expo account](https://expo.dev/) for cloud builds.

## Run it (development)

```bash
cd mobile
npm install
npx expo start
```

Scan the QR code with Expo Go (Android) or the Camera app (iOS). On first
launch, open **Settings** and paste your Rebrickable API key.

## Build a standalone app (no Mac needed)

[EAS Build](https://docs.expo.dev/build/introduction/) compiles the app in
Expo's cloud, so you don't need Xcode or Android Studio locally:

```bash
npm install -g eas-cli
eas login
eas build -p android        # produces an installable .apk/.aab
eas build -p ios            # iOS (needs an Apple Developer account to install)
```

## Project layout

```
mobile/
├── App.tsx              navigation (tabs + set-detail stack)
├── src/
│   ├── api/             rebrickable.ts, brickognize.ts  (network clients)
│   ├── db/              schema.ts, database.ts          (expo-sqlite)
│   ├── store/           settings.ts                     (secure-store: API key)
│   ├── data/            sets / inventory / scan / stats  (logic ported from the backend)
│   ├── components/      PartThumb.tsx
│   └── screens/         Home, SetSearch, SetDetail, Scan, Settings
```
