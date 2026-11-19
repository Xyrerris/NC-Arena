# Checkpoint 1 — repository analysis and inventory

Read-only analysis, 2026-11-19, branch `feature/application-design-restyle`. No application file was
touched. Screens were read as structure (functions, tests), not line by line; UI judgements are in
`CHECKPOINT_2_AUDIT.md`.

## 1. Architecture

- Expo (managed, not bare), Android only (`platforms: ['android']`, no `ios` block). Expo Router, file-based
  (`src/app`). Routes are thin and compose features; features may not import each other, `core/db` or
  `core/network` (enforced by `eslint-plugin-boundaries`).
- `src/core`: `design-system`, `data`, `db` (Drizzle + expo-sqlite), `network`, `ocr`, `prefs` (MMKV),
  `purchase`, `model`, `collection`, `common`.
- `src/features`: `roster`, `player`, `playerForm`, `collection`, `upgrade`, `accountSetup`, `keystore`,
  `viewerAvatar`, `rosterBackup`, `sectionTabs`. Each splits into `*Screen.tsx`, `use*.ts` (logic),
  `*UiState.ts` (pure state) and `strings.ts`.
- Root layout holds the splash until migrations and fonts are ready, then wraps the app in
  `GestureHandlerRootView`, `SafeAreaProvider`, `QueryClientProvider`; shows `AccountSetupScreen` as a gate
  when a backend is configured and no key is stored. The stack is remounted on a font-scale change (ADR-0030).
- Dark theme only (`userInterfaceStyle: 'dark'`). `backend/` exists and is out of scope.

## 2. Stack (from `package.json`)

React Native 0.86.3, React 19.2.3, Expo ~57, TypeScript ~6.0. expo-router, react-native-screens,
safe-area-context, FlashList 2.0.2, Reanimated 4.5.1 + worklets, gesture-handler, TanStack Query, Drizzle,
MMKV, zod, ML Kit OCR, image-picker, media-library. No UI library, no icon library, no SVG. Styling is
`StyleSheet` over typed `as const` tokens. Fonts: Cinzel (display), Barlow (body), JetBrains Mono (numbers),
8 static TTF, OFL. Tests: Jest (`node` + `jest-expo` projects), Maestro flows (`boot`, `catalogue`,
`player-detail`), `npm run verify`.

## 3. Screens

| Entry point                        | Screen                                                                                                  | Reached by                             |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `/`                                | Roster ("Arena"): header, sync state, ViewerCard, search, sort, swipeable rows; empty / error / loading | Home                                   |
| `/collection`                      | Collection: progress header, Collections / Items / Offers views, filters                                | Section tabs                           |
| `/upgrade`                         | Upgrade: materials ranked by NCG/Gexp, Planner                                                          | Section tabs                           |
| `/me`                              | "You": ViewerScreen + avatar, keystore, account connect, backup                                         | Viewer card on roster                  |
| `/player/[id]`                     | Detail: Stats and Vs You tabs, record stepper                                                           | Roster row                             |
| `/player/new`, `/player/edit/[id]` | Player form with OCR scan, delete                                                                       | "+ New player", "Edit"                 |
| `/account`                         | Account setup / link                                                                                    | From `/me`                             |
| gate                               | `AccountSetupScreen` (recovery code shown once)                                                         | First launch with a backend            |
| —                                  | `ViewerChoiceScreen`                                                                                    | to be verified in Checkpoint 2         |
| —                                  | `BootFailure`, `+not-found`                                                                             | error cases                            |
| `/catalogue`                       | Component catalogue                                                                                     | dev builds / `EXPO_PUBLIC_CATALOGUE=1` |

Sheets (React Native `Modal`): `MarketSheet`, `OfferSheet`, `PlannerSheet`, `BatchSheet` (core/purchase),
plus `FilterPanel`, `PurchaseCard`, `PurchaseTry` inline.

## 4. UI components

- Design system (12): `ArenaButton`, `ArenaText`, `FormField`, `SearchField`, `SegmentedTabs`, `SortChip`,
  `StatRow`, `CompareBar`, `ProgressBar`, `RecordBadge`, `ViewerCard`, `ScreenScaffold`.
- Feature-level, candidates for promotion: `RosterRow`, `CollectionRow`, `SkillMark`, `KeystoreSection`,
  `ViewerAvatarSection`, `RosterBackupControls`, `AccountConnectPrompt`, `SectionTabs`, `RecordStepper`,
  `StepButton`, `StepperRow`, `ScanBlock`, `CandidateRow`, `RefreshLine`.
- Absent: icons, switch / checkbox / radio, dropdown / select, toast, shared dialog, skeleton.

## 5. Navigation

Flat stack, `headerShown: false`. Arena / Collection / Upgrade are a segmented control at the top using
`router.replace`. Detail and `/me` use `push`. Predictive back is on. Back affordance is the text "← ROSTER".

## 6. Technical constraints for the redesign

1. A token-based design system already exists; the redesign replaces tokens and component internals.
2. Lint rejects raw hex / `rgba()` / raw spacing outside `core/design-system`, and UI words in `.tsx`
   (strings go in `strings.ts`). New token keys must keep `check:rules` green; changes to
   `eslint.config.js` or the check scripts need their own probe.
3. Text tokens are clamped at WCAG AA 4.5:1 (open decision 5, not signed off).
4. Android only: iOS compilation cannot be verified.
5. Large test suites pin testIDs, strings and structure (Collection, Roster, PlayerForm, Upgrade).
6. Four different `Modal` sheets with no shared chrome; no icon asset pipeline.
7. Reanimated used in only three files.
8. `verify` includes `verify:backend`.

## 7. Decisions given by the owner (2026-11-19)

Light + dark themes; AA clamp at my discretion; new dependencies allowed after an advisor check, owner asked
only on risk; font replacement allowed; navigation change is a separate proposal; fresh screenshots by me;
mockups in HTML; Fable runs as the `advisor` tool.
