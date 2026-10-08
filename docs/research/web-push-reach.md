# Web push reach for Cadence

Researched 2026-10-07 against primary sources (MDN and its browser-compat-data, WebKit, Chrome/Chromium, Mozilla, Apple, W3C, IETF, vendor docs).

## Question

How far can browser web push reach without a native app? Is web push a credible out-of-app channel for Cadence (a web-only React Router + Node + SQLite video-course platform), or should email be the default?

## TL;DR

Make **email the default** out-of-app channel for Notifications. Offer **web push as an extra channel people opt into**, alongside the in-app Notification Feed.

- Web push works on desktop Chrome, Edge, Firefox and Safari (macOS Ventura+), and in Android Chrome, Firefox and Samsung Internet ([MDN BCD](#sources)).
- On **iPhone and iPad it only works after the person adds Cadence to their Home Screen as a web app** (iOS/iPadOS 16.4+). Plain Safari tabs can't receive it ([WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)). That is a big drop-off for a web-only product.
- Every browser lets a person opt in once, and if they refuse the refusal is sticky. Browsers increasingly punish prompts and pushes that people ignore: Firefox requires a user gesture, Chrome has a quieter permission UI, removes permission automatically (from Oct 2025), and rate-limits push (from Jan 2026).
- Delivery is best-effort. Push services may drop messages or expire subscriptions ([RFC 8030](https://www.rfc-editor.org/rfc/rfc8030)).
- Email reaches every person with an address and needs no install and no prompt. It should carry anything a person must not miss. Web push suits timely, low-stakes Notifications for people who explicitly opt in.

## 1. Browser and OS support

From MDN browser-compat-data v8.1.4 (2026-10-01), `api.PushManager` / `PushManager.subscribe` / `ServiceWorkerRegistration.showNotification` ([BCD data](https://unpkg.com/@mdn/browser-compat-data/data.json), [MDN PushManager.subscribe](https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe)):

| Browser | Push API since | Notes |
| --- | --- | --- |
| Chrome desktop / Android | 42 | `applicationServerKey` required |
| Edge | 17 | `applicationServerKey` required |
| Firefox desktop | 44 | user gesture required from 72 |
| Firefox Android | 48 | user gesture required from 79 |
| Safari macOS | 16 | "Notifications are supported on macOS Ventura and later." |
| Safari iOS/iPadOS | 16.4 | "Notifications are supported in web apps saved to the home screen." |
| Samsung Internet | 4.0 | `applicationServerKey` required |
| Android WebView | not supported | so in-app browsers built on WebView can't subscribe |

- MDN marks the Push API "Baseline: Widely available … since March 2023" ([MDN Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)). Note that iOS support still depends on Home Screen install.
- On iOS, `Notification` "is undefined, unless the page is a web app saved to the home screen. The app's manifest must have a non-default `display` value" (BCD note on `api.Notification`, safari_ios).
- Safari 16 on macOS Ventura was the first Safari to support standards-based Web Push. It uses a system daemon, so pushes arrive even when Safari isn't running ([WebKit: Meet Web Push](https://webkit.org/blog/12945/meet-web-push/)).

## 2. iOS / iPadOS: Home Screen install is mandatory

- Web Push works only for Home Screen web apps: sites added through the Share menu with a manifest whose `display` is `standalone` or `fullscreen`, on iOS/iPadOS 16.4+ ([WebKit, iOS 16.4](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)).
- WebKit: "A web app that has been added to the Home Screen can request permission to receive push notifications as long as that request is in response to direct user interaction" ([WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)).
- No Apple Developer Program membership is needed. Push endpoints are on `*.push.apple.com`, so allow-list them. Notifications respect Focus modes, and the Badging API is available ([WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)).
- **Declarative Web Push** (iOS/iPadOS 18.4, macOS 15.5) lets a site subscribe through `window.pushManager` and show notifications without a service worker. The push payload itself describes the notification ([WebKit: Meet Declarative Web Push](https://webkit.org/blog/16535/meet-declarative-web-push/)). The post talks about Home Screen web apps. I couldn't confirm that it lifts the Home Screen requirement for Safari tabs on iOS, so assume it does not.
- **EU / DMA:** iOS 17.4 betas removed Home Screen web apps in the EU. Apple then reversed this and kept "the existing Home Screen web apps capability in the EU", built on WebKit, from iOS 17.4 onward ([Apple Developer, DMA update; also news post](https://developer.apple.com/support/dma-and-apps-in-the-eu/)). Note: the current version of that support page no longer contains this text. I verified the wording only through a search-indexed snapshot of Apple's page, so the EU status should be rechecked before you rely on it.
- Third-party iOS browsers: not verified here whether they can install Home Screen web apps that get push on all iOS versions.

**What this means for Cadence:** to reach an iPhone learner by push, they have to (1) know that Add to Home Screen exists, (2) do it, (3) open the installed app, and (4) tap an opt-in control. Each step loses people.

## 3. Permission prompt rules

- **User gesture:**
  - Firefox 72+ instantly rejects `Notification.requestPermission()` and `PushManager.subscribe()` unless they follow a click, tap or keypress. Without a gesture, the person only sees a small icon in the URL bar ([Mozilla Hacks](https://hacks.mozilla.org/2019/11/upcoming-notification-permission-changes-in-firefox-72/)).
  - Mozilla found "unsolicited prompts are denied in over 99% of cases" ([same](https://hacks.mozilla.org/2019/11/upcoming-notification-permission-changes-in-firefox-72/)).
  - MDN: request permission only from a user gesture. "Firefox is already doing this from version 72 … and Safari has done it for some time" ([MDN Using the Notifications API](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API/Using_the_Notifications_API)).
  - Safari requires "an explicit user gesture" to subscribe ([WebKit: Meet Web Push](https://webkit.org/blog/12945/meet-web-push/)).
- **Chrome quieter UI:**
  - "Chrome will automatically enroll sites with very low Accept rates into the quieter UI." This is decided separately for mobile and desktop ([Chrome for Developers, CrUX notification data](https://developer.chrome.com/blog/notification-permission-data-in-crux)).
  - Acceptance varies a lot by use case. The example given, Google News, had 82.3% accept, but low accept plus high block signals that people don't see the value ([same](https://developer.chrome.com/blog/notification-permission-data-in-crux)).
- **Chrome auto-revocation (Oct 2025+, Android and desktop):**
  - Chrome removes notification permission from sites that send a lot of notifications but get little engagement. Installed web apps are exempt ([Google/Chromium blog](https://blog.google/chromium/automatic-notification-permission/)).
  - "Less than 1% of all notifications receive any interaction from users" ([same](https://blog.google/chromium/automatic-notification-permission/)).
- **Chrome push rate limits (from Jan 2026):**
  - Sites judged disruptive (by push volume against visit time, prompt frequency and engagement) are capped at no less than 1000 pushes per minute and get HTTP 429 above that.
  - Penalties run 1, 7 and then 14 days ([Chrome for Developers](https://developer.chrome.com/blog/web-push-rate-limits)).
- **Denied is sticky:**
  - "If the user blocks the permission request, your web app can't ask for permission again" ([web.dev](https://web.dev/articles/push-notifications-permissions-ux)).
  - The permission states are `default` / `granted` / `denied` ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API/Using_the_Notifications_API)).
- **Best practice:**
  - Don't prompt when the page loads. Ask when the benefit is obvious.
  - Use a "double permission" soft pre-prompt (your own UI first, then the browser prompt).
  - Offer the toggle in settings, and explain how to turn push off ([web.dev](https://web.dev/articles/push-notifications-permissions-ux)).

## 4. Technical requirements

- **Secure context:** the Push API needs HTTPS ([W3C Push API](https://www.w3.org/TR/push-api/), Working Draft dated 2026-10-05; [MDN](https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe)). Most browsers allow `localhost` for development ([SuprSend docs](https://docs.suprsend.com/docs/js-webpush)).
- **Service worker:** "For an app to receive push messages, it has to have an active service worker" ([MDN Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)). The exception is Declarative Web Push on recent Apple platforms (§2).
- **`PushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`** ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe)):
  - Chrome and Edge reject the call unless `userVisibleOnly` is `true`.
  - `applicationServerKey` is an ECDSA P-256 public key. Once it is set, every send must use VAPID.
- **VAPID ([RFC 8292](https://www.rfc-editor.org/rfc/rfc8292)):** the server signs a JWT with ES256. The token carries `aud` (the push service origin), `exp` (≤ 24h) and an optional `sub` (`mailto:`/`https:` contact). The JWT and public key go in the `Authorization` header.
- **Must show a notification for every push:**
  - `userVisibleOnly` promises that each message has a visible effect ([W3C Push API](https://www.w3.org/TR/push-api/)).
  - WebKit revokes the subscription if the service worker fails to show one ([WebKit](https://webkit.org/blog/12945/meet-web-push/), [Declarative Web Push](https://webkit.org/blog/16535/meet-declarative-web-push/)).
  - So "silent" background sync over push is not an option.
- **Endpoints and expiry:**
  - The subscription endpoint is a secret capability URL. Anyone who knows it can send pushes ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)).
  - Subscriptions can have an `expirationTime`. `pushsubscriptionchange` fires when a subscription is refreshed, revoked or lost ([W3C](https://www.w3.org/TR/push-api/)).
  - "A push service MAY expire a subscription at any time" and signals it with 404. The server must send `TTL`, and the push service may keep a message for less time than requested ([RFC 8030](https://www.rfc-editor.org/rfc/rfc8030)). Cadence would need to store subscriptions per device in SQLite and delete them on 404/410.

## 5. Hosted vendor support

| Vendor | Web push? | How | Free tier |
| --- | --- | --- | --- |
| Knock | Not first-party | "Knock does not have a first-party web push channel. Instead, you'll use FCM": Firebase SDK, FCM service worker, VAPID key from Firebase. The tutorial notes iPhone users must Add to Home Screen ([Knock](https://docs.knock.app/tutorials/sending-web-push-notifications-with-fcm)) | Not checked |
| Novu | Through providers only | FCM, APNS, OneSignal, Pusher Beams, Pushpad, Push Webhook, Expo. No native VAPID channel ([Novu](https://docs.novu.co/platform/integrations/push)) | Not checked |
| Courier | Through providers only | Push providers listed: APNs, FCM, Expo, OneSignal, Airship, SNS, Pusher Beams, Pusher, MagicBell, etc. No native Web Push provider is listed on the overview page ([Courier](https://www.courier.com/docs/external-integrations/push/intro-to-push)) | Not checked |
| MagicBell | Yes, native | Manages VAPID key generation and rotation. SDKs (React, Svelte, vanilla JS) register the service worker. Handles iOS 16.4+ Home Screen apps ([MagicBell](https://www.magicbell.com/web-push)) | Builder $0: "All integrations", 1,000 deliveries/mo ([pricing](https://www.magicbell.com/pricing)) |
| SuprSend | Yes, native "WebPush" vendor | VAPID key from the dashboard. You host `/serviceworker.js`, which imports the SuprSend script. `registerPush()` asks permission, subscribes and sends the token. Call it from a user interaction ([SuprSend](https://docs.suprsend.com/docs/js-webpush)) | Free: 10k notifications/mo, unlimited channels incl. web push ([pricing](https://www.suprsend.com/pricing)) |

Whichever vendor you pick, every iOS/permission constraint above still applies. A vendor removes the VAPID and subscription-storage work, but it doesn't increase reach.

## 6. Conclusion for Cadence

- **Default: email.** It works on every platform with no install, permission prompt or browser engagement scoring. It also reaches iPhone learners who will never add Cadence to their Home Screen.
- **Supplementary: web push, opt-in.**
  - Offer it from a soft pre-prompt at a moment that makes sense, for example after someone enrols, "Get a Notification when the next lesson drops", and from notification settings.
  - Keep volume low and relevance high to avoid Chrome's quiet UI, auto-revocation and rate limits.
  - On iOS, show Add to Home Screen guidance first.
  - Every web push should match an item in the Notification Feed, so nothing exists only as a push.
- **Don't rely on web push for anything critical** (billing, account and security messages). Delivery is best-effort, subscriptions expire, and permission can be revoked automatically.
- **Build cost** is modest: a service worker, a VAPID keypair, a subscriptions table and the `web-push` protocol. A vendor (MagicBell, SuprSend natively; Knock, Novu, Courier through FCM or other providers) can absorb this if Cadence uses one for email anyway.

## Couldn't verify

- Current Apple primary text on the EU Home Screen web app outcome (the live DMA page no longer contains it. The reversal is confirmed only through a search snapshot of Apple's developer pages).
- Whether Declarative Web Push works in Safari tabs on iOS (not only Home Screen apps).
- The Chromium 2020 "quieter permission UI" announcement body (page didn't render). Its behaviour is confirmed through the Chrome for Developers CrUX post instead.
- Real-world web push opt-in rates for a site like Cadence. No primary source gives cross-industry figures.
- Free-tier status of web push for Knock, Novu and Courier.

## Sources

- MDN, Push API: https://developer.mozilla.org/en-US/docs/Web/API/Push_API
- MDN, PushManager.subscribe(): https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe
- MDN, Using the Notifications API: https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API/Using_the_Notifications_API
- MDN browser-compat-data v8.1.4: https://unpkg.com/@mdn/browser-compat-data/data.json
- W3C Push API (Working Draft): https://www.w3.org/TR/push-api/
- RFC 8030, Generic Event Delivery Using HTTP Push: https://www.rfc-editor.org/rfc/rfc8030
- RFC 8292, VAPID: https://www.rfc-editor.org/rfc/rfc8292
- WebKit, Meet Web Push: https://webkit.org/blog/12945/meet-web-push/
- WebKit, Web Push for Web Apps on iOS and iPadOS: https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
- WebKit, Meet Declarative Web Push: https://webkit.org/blog/16535/meet-declarative-web-push/
- Apple Developer, Update on apps distributed in the EU: https://developer.apple.com/support/dma-and-apps-in-the-eu/
- Mozilla Hacks, Notification permission changes in Firefox 72: https://hacks.mozilla.org/2019/11/upcoming-notification-permission-changes-in-firefox-72/
- Chrome for Developers, Notification permission data in CrUX: https://developer.chrome.com/blog/notification-permission-data-in-crux
- Chrome for Developers, Web push rate limits: https://developer.chrome.com/blog/web-push-rate-limits
- Google/Chromium blog, Automatic notification permission revocation: https://blog.google/chromium/automatic-notification-permission/
- web.dev, Push notification permissions UX: https://web.dev/articles/push-notifications-permissions-ux
- Knock, Web push with FCM: https://docs.knock.app/tutorials/sending-web-push-notifications-with-fcm
- Novu, Push integrations: https://docs.novu.co/platform/integrations/push
- Courier, Push overview: https://www.courier.com/docs/external-integrations/push/intro-to-push
- MagicBell, Web push: https://www.magicbell.com/web-push and pricing: https://www.magicbell.com/pricing
- SuprSend, WebPush SDK: https://docs.suprsend.com/docs/js-webpush and pricing: https://www.suprsend.com/pricing
