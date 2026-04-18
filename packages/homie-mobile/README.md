# @homie/mobile

iOS-first Expo + React Native app for Homie consumer (homeowners).

## First-time setup

From the **repo root**:

```bash
# Install workspace deps (picks up the new mobile package)
npm install

# Install Xcode from the Mac App Store (15+ GB, takes a while)
# Then accept the license and install Simulator runtime:
sudo xcodebuild -license accept
xcodebuild -downloadPlatform iOS
```

## Running locally

From `packages/homie-mobile/`:

```bash
npm run ios
```

That will start the Metro bundler and open the iOS Simulator. First boot
takes ~30s. After that, the app hot-reloads on file save.

To run on a physical iPhone, install **Expo Go** from the App Store, scan
the QR code printed in the terminal.

## Project layout

```
app/                     File-based routes (Expo Router)
  _layout.tsx            Root layout — wraps every screen
  index.tsx              Home screen (currently a Phase 1 sanity check)
assets/                  App icon, splash screen images (TODO: design)
metro.config.js          Workspace-aware bundler config (don't delete)
app.json                 Expo project config (bundle ID, splash, icon)
```

## How shared code works

```ts
import { cleanPrice, type AccountBooking } from '@homie/shared';
```

Types and pure helpers live in `packages/shared` and are imported by
both this app and `packages/web`. Editing `packages/shared` triggers a
hot reload here automatically.

Don't put React/DOM/Vite code in `@homie/shared` — it has to stay
platform-neutral.

## Next phases

- **Phase 2:** Auth flow (login/register screen + secure token storage via `expo-secure-store`)
- **Phase 3:** Tab navigation (Home / Quotes / Bookings / Account)
- **Phase 4:** Port the Account dashboard, then quotes + bookings + messaging
- **Phase 5:** Push notifications via Expo Push + APNS
- **Phase 6:** App Store submission via EAS
