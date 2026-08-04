# apps/mobile — ProFit Manager

> Expo (React Native) app for the **manager**: what the gym did, who is on the
> roster, who came in, and what is on the shelf. Ships to the Play Store and the
> App Store via EAS.

Read this before touching it — a few things here are deliberately unlike
`apps/web`, and one of them (the token transport) is load-bearing.

## What it is, and is not

Five tabs — **Members · Attendance · Home · Storage · Staff** — with Home raised
in the middle. There is no ordering, no terminal, no plans and no cashbox: those
are desk work, and the desk app keeps them.

**Everything is read-only.** Nothing in `src/api/queries.ts` writes. That is a
starting position, not a permanent one — see "Where writes go" below.

## Stack

| Concern | Choice |
| --- | --- |
| Runtime | Expo SDK 54, React Native 0.81, New Architecture on |
| Routing | `expo-router` (file-based, like `apps/web`'s TanStack Router) |
| Data | TanStack Query — same mental model as the desk app |
| Styling | Plain `StyleSheet` + `src/theme.ts`. **No Tailwind, no NativeWind.** |
| Secrets | `expo-secure-store` (Android Keystore / iOS Keychain) |
| Icons | `@expo/vector-icons` (Feather) |

## Running it

```bash
pnpm --filter mobile start          # Metro; press a / i, or scan with Expo Go
pnpm --filter mobile typecheck
pnpm --filter backend dev           # the API this talks to, on :7090
```

**Point it at the backend first.** The app needs an absolute host — a phone's
`localhost` is the phone.

```bash
# .env.local in apps/mobile, or an EAS profile env (see eas.json)
EXPO_PUBLIC_API_URL=http://192.168.1.10:7090   # your machine's LAN address
```

Without it the app falls back to `extra.apiUrl` in `app.json`
(`http://localhost:7090`), which only works in a simulator on the same machine.

## The auth difference — read this one

The desk app puts the refresh token in an **httpOnly cookie**. This app cannot:
there is no reliable cookie jar across both native platforms, and the whole
point of `httpOnly` (keeping page scripts away from it) has no meaning where
there is no document.

So the app asks `/auth/login` for its **default `mode: "token"`**, which returns
the pair in the response body, and puts the refresh token in the platform
keystore instead. `apps/backend/src/schemas/auth.ts` has had both modes all
along — nothing on the server changed to support this app.

What carries over unchanged from `apps/web`:

- The access token is **in memory only**, never on disk.
- One **single-flight** refresh, so five screens resuming behind an expired
  token produce one rotation rather than five racing ones.
- A **generation counter**, so a request that left before a renewal is replayed
  rather than triggering a second refresh.
- Boot distinguishes **three** answers — `session`, `rejected`, `offline`. Only a
  rejection signs anyone out. An unreachable API gets its own screen with a
  retry, because a sign-in form needs the same server that just failed.
- Boot **does not block**: `AuthProvider` restores behind a status flag while the
  tree renders.

## Layout

```
app/                      expo-router. Routing only.
  _layout.tsx             providers + the AppState → refetch bridge
  index.tsx               boot: session / sign-in / offline
  sign-in.tsx
  (tabs)/_layout.tsx      the hand-drawn tab bar with the raised centre
  (tabs)/index.tsx        home — the dashboard
  (tabs)/{members,attendance,storage,staff}.tsx
  profile.tsx             modal, opened top-right of home
src/
  api/                    tokens (SecureStore), client (fetch + refresh), queries
  auth/context.tsx        session state + boot
  components/             ui.tsx (the primitives), screen.tsx, revenue-chart.tsx
  lib/                    format, phone, use-debounced
  theme.ts                the design tokens, restated
  i18n.ts                 uz / ru / en, Uzbek by default
  types.ts                wire shapes
```

## Conventions that will bite you if ignored

- **`src/theme.ts` is a copy, not an import.** It mirrors
  `packages/design-system/styles/globals.css`. When a colour changes there,
  change it here — the two apps are meant to look like one product.
- **`--primary` (`#2ee87f`) is a fill, never text.** It is ~1.7:1 against the
  dark background. Where the green must be *read*, use `primaryAccent`.
- **Selected = tint + edge + green text**, never a solid neon fill. Same rule as
  `@repo/design-system/lib/selected` on the desk.
- **No `AbortSignal.timeout`.** React Native polyfills `AbortSignal` from the
  `abort-controller` package (`Libraries/Core/setUpXHR.js`), which has the
  instance API and **none of the statics** — while TypeScript, seeing the DOM
  lib, typechecks it happily. It threw while building the argument to `fetch`,
  before there was a promise to `.catch()`, so sign-in reported "wrong phone or
  password" for a request that never left the phone. Every call goes through
  `fetchWithTimeout` in `src/api/client.ts`; do not reintroduce the static.
- **The sign-in number is assembled, not typed raw.** `src/components/phone-field.tsx`
  is the phone's `packages/auth/components/phone-field.tsx`: a country picker
  over the same six-country table (ported to `src/lib/countries.ts`, keyed by
  ISO code because KZ and RU share +7) plus the national digits. State is bare
  digits; grouping is display-only. Flags are **emoji** here — the desk uses
  inline SVG only because Windows has no flag glyphs, which is not a problem on
  either phone platform.
- **No `Intl`.** Hermes ships a cut-down ICU that differs between Android and
  iOS, so `Intl.NumberFormat` can come back unformatted on a real phone.
  `src/lib/format.ts` hand-rolls grouping and dates. Do not reintroduce `Intl`.
- **Money is a decimal string** all the way from MySQL. Do not parse it to a
  number except at the point of display.
- **Metro keeps hierarchical lookup ON.** Expo's monorepo guide says to disable
  it — that guidance is for hoisted npm/yarn workspaces. pnpm puts a package's
  dependencies beside it inside `.pnpm/`, so the upward walk is the only way to
  reach them. Disabling it fails on `@expo/metro-runtime`, then `whatwg-fetch`,
  and keeps going. See the comments in `metro.config.js`.
- **`metro.config.js` is CommonJS**, so it uses `__dirname`. Biome's
  `noGlobalDirnameFilename` will try to rewrite that to `import.meta.dirname`,
  which is a syntax error there. It carries a `biome-ignore`; keep it.

## Where writes go, when they come

The read screens were built so the write flows drop in without rework:

- **Stocktake** is the one worth doing first. `POST /inventory/stocktakes`
  already exists, and counting stock is genuinely *better* on a phone than at
  the desk — you are standing at the shelf. It moves no money, so none of the
  cash-accountability problem applies.
- **Manual check-in** (`POST /attendance/…`, see `manualVisitSchema`) is the
  other safe one: a write with no money attached.
- **Anything that takes cash is the hard one**, and it is an operational
  question rather than a UI one. The cashbox has no table — a balance *is*
  `income.payment_type` summed minus `expenses.method` (see the comment at the
  top of `apps/backend/src/schemas/transaction.ts`). So a cash sale taken on the
  gym floor raises the "cash" till balance while the money is in somebody's
  pocket, and close-of-day shows a shortfall that is neither theft nor an error.
  Card, transfer and debt do not have this problem.

## Shipping

`eas.json` has three profiles. Set `EXPO_PUBLIC_API_URL` per profile.

```bash
npx eas login
npx eas build:configure          # writes a real extra.eas.projectId into app.json
npx eas build --profile preview --platform android    # installable APK
npx eas build --profile production --platform all
npx eas submit --profile production --platform android
```

Two things to fix before a real store submission:

1. **`extra.eas.projectId` in `app.json` is a placeholder** (all zeros).
   `eas build:configure` replaces it.
2. **The API must be HTTPS.** `expo-build-properties` currently sets
   `usesCleartextTraffic` on Android and `NSAllowsArbitraryLoads` on iOS, which
   is right for a LAN backend during development and is a question Apple's
   review will ask about. Serve the backend over TLS and drop both.
