# H5 spike: sign-in on a real iPhone

**Branch:** `h5-signin-spike`, from `main` after PR #12 · **SPEC:** v3.0 §12.4 · **App version:** 0.1.4 · **Started:** 2026-11-04

## What the spike answers

SPEC §12.4: H5 starts by trying Cloudflare Access (emailed codes) on an iPhone before any sync code is written. Three questions:

1. **Sign-in from the home-screen app.** Can someone sign in with an emailed code when the app is opened from the home screen, and does the app see that they're signed in?
2. **The session lasts at least 30 days.** Does the phone stay signed in for a month, both from the home screen and in Safari, without signing in again?
3. **A sync after an offline week.** After a week with no connection, does the app still open, and can it reach the server again without trouble?

If any of these fail, the fallback in §12.4 applies: the Worker sends its own codes and issues device tokens.

## What was built

- **The Worker** (`worker/index.ts`, `cloudflare.config.ts`) serves the built app and a small API on `hiebert-home-inventory.<subdomain>.workers.dev`. It is deployed with the cf CLI (`npm run worker:deploy`).
  - `GET /api/whoami`: the Access email and the session's start and end, read from the Access token. Not signed in gives 401.
  - `GET /api/signin`: Access shows its login first, then this sends the phone back to the app.
  - The token's signature isn't checked yet. That comes with the real API.
- **More › Settings › Sign-in check (H5 test):** who this phone is signed in as, how long ago they signed in, and when the session ends. **Check now** and, when signed out, **Sign in**. It also says whether the app was opened from the home screen or in Safari.
- **A log of checks on the phone** (`src/data/signin-log.ts`): one at launch and one each time the app comes back to the screen, at most once an hour, with the last 60 kept. A session that ends early shows up without anyone remembering to check. The log is a device setting, never in a backup, and goes away with the spike.
- The service worker never answers `/api/` page loads from its cache, so **Sign in** always reaches Access.
- The GitHub Pages copy is unchanged. Its check says "This copy has no server".

## Setup

**Dan, in the Cloudflare dashboard (one time):**

1. Register the account's **workers.dev subdomain**. Done: `dhiebert7251`, so the app is at `hiebert-home-inventory.dhiebert7251.workers.dev`.
2. **Turn on Zero Trust** (Access) at `one.dash.cloudflare.com`, with a team name and the **Free** plan (up to 50 users). Done 2026-11-05: the login page is `hiebert-personal.cloudflareaccess.com`.

**Claude, with the cf CLI, once those are done:**

3. Deploy the Worker: `npm run worker:deploy`.
4. Add **One-time PIN** as a login method.
5. Add a self-hosted Access application for the Worker's workers.dev address, with a **session duration of 1 month** (Access's longest) and a policy allowing the spike's email addresses.
6. Check that `/api/whoami` without a session redirects to the Access login.

Steps 3–6 done 2026-11-05: Access app "Hiebert Home Inventory", session 730h, One-time PIN only, policy "Spike emails" allowing dhiebert7251@gmail.com. An Access app on the workers.dev hostname had no effect; it works with a `worker` destination (the Worker's ID), which covers every address the Worker has. Signed out, `/`, `/sw.js` and `/api/whoami` all redirect to the login.

Access settings live in Cloudflare, not in the repo. `cloudflare.config.ts`'s `access` option only fakes Access for `cf dev`.

## Phone test plan

On Dan's iPhone, with the workers.dev address. It is a different site from GitHub Pages, so it has its own empty storage, and test data there is fine.

| # | Step | Expect |
|---|------|--------|
| 1 | Open the address in Safari | The Access login page, asking for an email |
| 2 | Enter the email, then the emailed code | The app opens |
| 3 | More › Settings › Sign-in check | "Signed in as …", session ends about a month from now |
| 4 | Share › Add to Home Screen, open it from there | The app opens. The check says signed in, or signed out (the home-screen app may not share Safari's cookies) |
| 5 | If signed out in step 4: **Sign in** from the home-screen app | The Access page opens in the app or in Safari, the code works, and the app comes back signed in |
| 6 | Use the app normally for 30+ days | The check log shows signed in throughout, for both home screen and browser |
| 7 | Airplane mode for 7 days, open the app a few times | The app opens and works. The log shows "Couldn't reach the server" |
| 8 | Back online | The next check is signed in, or **Sign in** works in one go. The app's update banner still appears after a new deploy |

## Results

_To fill in as the test runs._

| Question | Result | Date | Notes |
|----------|--------|------|-------|
| 1. Sign-in from the home-screen app | Pass | 2026-11-05 | Steps 1–5 on Dan's iPhone. The home-screen app was already signed in (step 4), so it shares Safari's session; step 5 wasn't needed |
| 2. Session lasts 30+ days | | | |
| 3. Offline week | | | |

## Open questions

- **The longest Access session is one month (730 hours),** just over the 30 days SPEC asks for. After that, the phone must sign in again: the app keeps working offline, and changes wait in the outbox (§12.4).
- **App updates while signed out:** Access also guards `sw.js`, so a phone with an ended session can't fetch an update until it signs in. Step 8 checks the update arrives afterwards.
- **Free email sender:** only needed if the fallback is used.
