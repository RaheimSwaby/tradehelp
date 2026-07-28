# TradeHelp Mobile Release Checklist

## App Store Connect record

Create the app record before uploading the first production build:

- Platform: iOS
- Name: TradeHelp
- Primary language: English (U.S.)
- Bundle ID: `app.tradehelp.mobile`
- SKU: `tradehelp-mobile-ios`
- User access: Full Access
- Primary category: Finance
- Secondary category: Productivity

Suggested metadata:

- Subtitle: `Journal trades while fresh`
- Support URL: `https://trade-help.app/support.html`
- Privacy policy URL: `https://trade-help.app/privacy.html`
- Copyright: `2026 Raheim Swaby`

Position the product as an educational trading journal. It does not execute
trades, hold funds, connect to a brokerage in the mobile release, or provide
financial advice.

## TestFlight build

From the `mobile` directory:

```powershell
npm run typecheck
npx expo export --platform ios
npx eas-cli@latest build --platform ios --profile production
npx eas-cli@latest submit --platform ios --latest
```

In App Store Connect:

1. Open TradeHelp, then TestFlight.
2. Wait for the uploaded build to finish processing.
3. Complete Export Compliance. The app uses standard/exempt encryption and
   `ITSAppUsesNonExemptEncryption` is already set to `false`.
4. Add an Internal Testing group and invite the first testers.
5. Add beta review notes:
   - No account or login is required.
   - Quick Log, stats, rules, history, and news work without desktop pairing.
   - Desktop pairing is optional and requires both devices on the same private
     Wi-Fi network.
   - The app is a journal and does not execute financial transactions.
6. After the internal build is stable, create an External Testing group. The
   first external build normally requires TestFlight App Review.

## Public App Store submission

Complete these items on the iOS version page:

- Description, subtitle, keywords, promotional text, and release notes.
- App icon from the production build.
- One to ten accurate iPhone screenshots. Capture Home, Quick Log, post-trade
  rules, on-device stats, News, and local pairing.
- Support URL and privacy policy URL.
- App Privacy questionnaire. Confirm the behavior of every included SDK and
  calendar provider before declaring whether data is collected.
- Age Rating questionnaire.
- Content Rights declaration for the economic-calendar feed.
- Pricing and Availability: Free for the first release.
- App Review contact information and detailed review notes.
- Select the processed production build, click Add for Review, then Submit for
  Review.

Keep Gumroad license activation, Gumroad buy links, and external purchase calls
to action out of the iOS app. The free mobile application must remain useful
without purchasing the desktop product.

## Release blockers

- Verify authenticated local-network sync from packaged Windows and macOS
  desktop builds.
- Verify local news notifications on a physical iPhone at 30, 15, and 5
  minutes.
- Verify permission-denied and permission-restored behavior.
- Confirm the economic-calendar feed may be redistributed in a public app.
- Run an internal TestFlight soak before requesting external review.
- Publish the privacy and support pages before entering their URLs in App Store
  Connect.
