# Personal Expense Tracker — React Native (Expo) Mobile App

## Overview

A personal expense tracker mobile app for Android (and iOS) built with Expo SDK 53 and React Native. All data is stored on-device — no backend, no external services, no accounts required.

## Tech Stack

- **Expo SDK 53**, React Native, TypeScript
- **expo-router** (file-based tabs: Home, Analytics, All Transactions, Settings)
- **expo-sqlite** for on-device transaction + category storage
- **AsyncStorage** for payment sources and reminder settings
- **expo-notifications** for local scheduled reminders
- **react-native-get-sms-android** for SMS parsing (native Android build only)
- **@expo/vector-icons** (Feather icons only)
- **EAS Build** configured with a preview profile outputting a direct-install APK

## Project Structure

```
artifacts/expense-tracker/
├── app/
│   ├── _layout.tsx              # Root layout, initializes DB
│   └── (tabs)/
│       ├── _layout.tsx          # Tab bar configuration
│       ├── index.tsx            # Home screen
│       ├── analytics.tsx        # Analytics screen
│       ├── transactions.tsx     # All transactions screen
│       └── settings.tsx         # Settings screen
├── components/
│   ├── AddTransactionModal.tsx  # Add/edit transaction modal
│   └── SmsImportModal.tsx       # SMS import modal
├── lib/
│   ├── database.ts              # SQLite database layer
│   ├── smsParser.ts             # SMS parsing + bank detection
│   └── paymentSources.ts       # AsyncStorage payment sources
├── app.json                     # Expo config
├── eas.json                     # EAS Build config (preview = APK)
├── metro.config.js              # Metro bundler config (web WASM fix)
└── package.json
```

## Key Features

### Home Screen
- Month navigator with slide animation
- Spent/Received/Net summary card
- Summary chips: Daily Avg, Transaction Count, vs-last-month %
- Transaction list grouped by date (tap to edit, long-press to delete)
- Floating "+ Add" button
- "Import SMS" button

### SMS Import (Android native build only)
- User-triggered (tap button), not automatic
- Requests READ_SMS permission with explanation dialog
- Reads up to 1,000 inbox messages, processed in chunks of 50
- Identifies bank SMS by DLT sender ID fragments or ≥2 signal words
- Skips OTP/promotional messages automatically
- Parses: Amount (₹/Rs./INR formats), Type (debit/credit scoring), Bank, Merchant, Date
- Deduplication via `smsId` (Android SMS `_id`) stored in DB
- Visual progress bar + live counters (SMS Read / Bank SMS / Transactions Found)
- In Expo Go: shows clear "APK Build Required" message
- On non-Android: shows "Android Only" message

### Analytics Screen
- Month/year navigator
- Month-over-month comparison card
- Spending by category with bar chart

### Settings Screen
- Evening reminder toggle + time (local notifications)
- Payment sources CRUD (stored in AsyncStorage)
- Categories CRUD with icon picker + color picker

## Database Schema

**transactions table:**
- id, amount, type (debit/credit), category, description, note, date, bank, smsId (UNIQUE)

**categories table:**
- id, name, icon (Feather), color (hex), isDefault

## Running / Building

**Development (web preview):**
```
cd artifacts/expense-tracker && npx expo start --web --port 5000
```

**Test on device:**
Scan the QR code from Expo Go app (SMS import won't work in Expo Go)

**Build Android APK:**
```
cd artifacts/expense-tracker && eas build --platform android --profile preview
```

## Technical Notes

- SQLite dynamically required via `require('expo-sqlite')` to avoid web loading
- Web uses an in-memory shim — SQLite features don't work in browser preview
- expo-notifications lazily imported inside async functions (avoids Expo Go SDK crash)
- SMS import detects Expo Go via `Constants.executionEnvironment === 'storeClient'`
- Metro config excludes wa-sqlite WASM for web bundling
- App package: `com.expensetracker.app`
