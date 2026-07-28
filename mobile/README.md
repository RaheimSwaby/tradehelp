# TradeHelp Mobile

Deferred iOS/Android companion scaffold. This directory is intentionally isolated
from the Electron desktop application and is not part of the desktop build.

## Prototype scope

- Home summary and daily checklist
- Two-step quick capture with a post-trade rule checklist
- Chart screenshot/camera attachment
- Local trade history
- Local SQLite persistence
- Offline sync outbox
- QR pairing and authenticated same-network sync with TradeHelp Desktop
- Bidirectional trading-rule sync with latest-change-wins conflict handling
- Economic-calendar panel with local 30, 15, and 5 minute news alerts
- On-device performance stats before and after desktop sync
- Cumulative P&L curve with 1-week, 1-month, 3-month, and all-time ranges
- Offline trade creation, editing, and deletion with queued desktop sync
- System, dark, and light appearance modes
- TestFlight distribution

Desktop remains the source of truth for trades in the first synchronization version.
Trading rules can be edited on either device; the most recently changed rule set
wins on the next sync.
Screen recording, CSV watching, broker connectors, Ollama, and detailed chart
analysis remain desktop-only.

The sync transport is authenticated but not yet encrypted. Use it
only on a trusted private network. Mobile chart screenshots remain local during
this first sync pass; trade fields, checklist evidence, rules, and recent desktop
history synchronize.

## Resume development

1. Install dependencies:

   ```powershell
   cd mobile
   npm install
   npx expo install --fix
   ```

2. Start the development server:

   ```powershell
   npm run start
   ```

3. Authenticate Expo and confirm the existing EAS project link:

   ```powershell
   npx eas-cli@latest login
   npx eas-cli@latest init --id b301fe1d-b348-4743-9e08-a9b4fae7b84a
   ```

4. Create an iOS development build:

   ```powershell
   npx eas-cli@latest build --platform ios --profile development
   ```

5. When the prototype is ready for testers, create and submit a production build:

   ```powershell
   npx eas-cli@latest build --platform ios --profile production
   npx eas-cli@latest submit --platform ios
   ```

## Deferred engineering work

- Wire `SQLiteProvider` to `src/storage/schema.ts`.
- Implement quick-log validation and persistence.
- Add `expo-image-picker` capture/selection.
- Implement the QR-based local-network desktop pairing protocol.
- Keep mobile-created trades in an offline outbox until the desktop reconnects.
- Make desktop the source of truth; keep synced trade edits/deletes desktop-only
  for the first release.
- Add stable device IDs, event IDs, dedupe, and conflict handling.
- Extract reusable stats/grading logic from desktop into a shared package.
- Decide how desktop Gumroad licenses map to mobile distribution.

The native application identifier is `app.tradehelp.mobile` on iOS and Android.
