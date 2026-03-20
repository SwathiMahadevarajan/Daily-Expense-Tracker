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

### Theme Switcher
- Manual Light / Dark / System (follows device) toggle in Settings → Appearance
- Module-level store in `lib/theme.ts` with listener Set; no React Context needed
- Persisted to AsyncStorage (`theme_preference`); loaded on app start
- All screens and modals use `useTheme()` hook; no hardcoded colors anywhere
- Exports: `useTheme()`, `setThemeMode()`, `getThemeMode()`, `ThemeMode`

### Home Screen
- Month navigator with slide animation
- Spent/Received/Net summary card
- Summary chips: Daily Avg, Transaction Count, vs-last-month %
- Transaction list grouped by date; tap to edit, long-press (350ms) to enter bulk mode
- Bulk bar: two-row layout — top row (count + All/None + X cancel), bottom row (horizontal ScrollView with pill chips: Category, Source, Delete)
- Floating "+ Add" button, "Import SMS" button; FAB hides while in bulk mode

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
- Month/year navigator with Overview / Trends / Insights tabs
- KPI cards: Total Spent, Total Received, Net, Savings Rate, Daily Avg
- **Source Balances card**: per-account current balance = opening balance + credits − debits ± transfers (all-time); replaces carry-forward
- Monthly Budget: set, track, projected spend alert
- Spending by category ranked bar chart
- Top 5 expenses + top income sources
- 6-month trend chart, weekly breakdown, income vs expense comparison
- Day-of-week spending heatmap, source stats (SMS vs manual), efficiency metrics
- All analytics queries exclude transfer transactions (`WHERE transfer_to IS NULL`)

### All Transactions Screen
- Full transaction list with search and type filter (All/Debit/Credit)
- Long-press (350ms) to enter bulk mode; same two-row scrollable chip bar as Home
- Transfer transactions shown with repeat icon and "From → To" meta text

### Settings Screen
- **Theme toggle**: Light / Dark / System options at top of screen
- **Opening Balances**: per-source input fields; stored as `source_ob_${sourceName}` in AsyncStorage
- Evening reminder toggle + time (local notifications)
- Payment sources CRUD (stored in AsyncStorage)
- Categories CRUD with icon picker + color picker
- Built-in categories can now be edited/deleted (confirmation dialog shown)

### Transfer Transactions
- Added via AddTransactionModal with Debit / Credit / Transfer three-button toggle
- Transfer: stored as `type='debit'` with `transfer_to` field set to destination source
- Shown in Home and All Transactions with repeat icon and "From → To" format
- Transfer category "Transfer" added to DEFAULT_CATEGORIES (icon: repeat, color: grey)
- Excluded from all analytics spend/income totals
- Source balance formula: `opening_balance + credits − debits + transferIn − transferOut`

## Database Schema

**transactions table:**
- id, amount, type (debit/credit), category, description, note, date, bank, smsId (UNIQUE), transfer_to

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
