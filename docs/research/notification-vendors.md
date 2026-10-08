# Which hosted notification vendor fits Cadence?

Research for [#13](https://github.com/ai-hero-dev/cohort-005-project/issues/13), child of the map [#12](https://github.com/ai-hero-dev/cohort-005-project/issues/12). Sources are official vendor docs and pricing pages, read on 2026-10-07. Prices change, so re-check them before signing up.

## Recommendation: Knock

Knock is the only candidate that meets every criterion on its free plan:

- **Free tier:** the Developer plan is $0 and includes 10K messages a month, with unlimited workflows and channels.
- **Feed auth:** in production it *requires* signed user tokens. They are RS256 JWTs that our server signs with `sub` = user id and an `exp`.
- **Preferences:** it has the richest vendor-stored preference model, covering category × channel type. That maps directly onto "per category × per channel".
- **Feed API:** a mature headless feed API returns `unread_count` and `unseen_count` and has endpoints to mark messages seen, read or archived.

The costs:

- **No first-party web push channel.** Web push goes through Firebase Cloud Messaging, which means adding the Firebase SDK, a service worker and a Firebase project.
- **Steep jump to paid.** The first paid tier is $250/mo.

Neither cost breaks a criterion. The alternatives each fail or weaken a criterion that matters more, as the table and notes below show.

## Comparison

| | Knock | Novu Cloud | MagicBell | Courier | SuprSend |
|---|---|---|---|---|---|
| Free tier | 10K messages/mo [1] | 10K workflow runs/mo, 24h activity retention [6] | **1K deliveries/mo** [10] | 10K sends/mo [14] | 10K notifications/mo [18] |
| Headless feed API | Yes: list, unread/unseen counts, seen/read/archive [3] | Yes, via `@novu/js` / `@novu/react` hooks: list, counts, read, archive [8] | Yes, REST: list, unread count, read, read-all, archive [13] | Yes, `@trycourier/courier-js` [16] | Yes, headless SDKs [20] |
| Node triggering | Node SDK | Node SDK | Node SDK / REST | Node SDK | Node SDK |
| Per-user feed auth | **RS256 signed user token, mandatory in prod** [2] | HMAC-SHA256 of subscriberId: a static hash with no expiry [7] | User JWT signed with project secret [12] | JWT via `POST /auth/issue-token`, scoped, with expiry [15] | ES256 signed user JWT (replaced HMAC) [19] |
| Web push | Via FCM only, no first-party channel [4] | Via FCM, OneSignal, Pusher Beams, Pushpad, webhook [9] | **Native VAPID** web push channel [11] | Via OneSignal / FCM, no native channel [17] | **Native** web push (VAPID key from dashboard, service worker) [21] |
| Email on same workflow | Yes | Yes | Yes | Yes | Yes |
| Vendor-stored preferences | **Category × channel type**, plus per-workflow and per-channel [5] | Workflow × channel only, no category concept [8b] | Category × channel [12b] | Topic × channel (custom routing), with OPTED_IN/OUT/REQUIRED defaults [16b] | **Not on Free**: channel prefs from Essentials, category prefs from Business [18] |
| Beyond free | Starter $250/mo for 50K, then $0.005/msg [1] | Pro from $30/mo for 30K runs, then $1.20/1K [6] | Startup $249/mo for 50K, then $0.0025 [10] | Pay as you go, $0.005/send [14] | Essentials $100/mo (annual) for 50K; Business $250/mo [18] |

What counts toward the quota differs by vendor:

- **Knock:** one message = one user on one channel. An in-app plus an email counts as 2. Messages that preferences suppress are not billed [1b].
- **SuprSend:** each channel also counts separately, in-app included [18].
- **Novu:** counts workflow runs, not per-channel messages [6].

## Notes per vendor

- **Knock.** Enhanced security mode needs a public key plus a signed user token, or client calls are rejected. The private key comes from the dashboard as base64 PEM [2]. Fitting this to the DevUI switcher is simple: the server signs a token for whichever user is in the session. The docs do not say whether enhanced security is plan-gated. The pricing page lists no such gating [1].
- **Novu Cloud.** It has the cheapest paid tier. Its Inbox security is an HMAC of the subscriber id [7], which is weaker than a signed token: the hash never expires and is not scoped. Preferences cover workflow × channel only, so "category" would mean one workflow per category or grouping in the UI [8b].
- **MagicBell.** It is technically the closest fit for web push, because it has a native VAPID channel [11], user JWTs [12] and a category × channel preference object [12b]. The catch is the free tier: 1,000 deliveries a month is thin even for development across four roles, and the next step is $249/mo [10].
- **Courier.** It is solid on auth (scoped JWTs with expiry [15]) and preferences (topics × channels [16b]). Pay as you go at $0.005/send after the free tier is the gentlest pricing curve [14]. Web push needs a third-party provider such as OneSignal [17], and the push providers page lists no native browser push [17]. It is a reasonable runner-up.
- **SuprSend.** It has native web push and ES256 JWTs. It fails the brief because vendor-stored preferences are unavailable on Free and category preferences need Business at $250/mo [18].
- **Other options.** Engagespot was considered, but its pricing page returned 404, so it was not evaluated.

## Sources

1. Knock pricing, https://knock.app/pricing
1b. Knock, Messages (billing semantics), https://docs.knock.app/concepts/messages
2. Knock, Security and authentication, https://docs.knock.app/in-app-ui/security-and-authentication
3. Knock, In-app API overview, https://docs.knock.app/in-app-ui/api-overview
4. Knock, Sending web push with FCM, https://docs.knock.app/tutorials/sending-web-push-notifications-with-fcm ; Push overview, https://docs.knock.app/integrations/push/overview
5. Knock, Preferences overview, https://docs.knock.app/preferences/overview
6. Novu pricing, https://novu.co/pricing
7. Novu, Prepare Inbox for production (HMAC), https://docs.novu.co/platform/inbox/prepare-for-production
8. Novu, Headless Inbox API reference, https://docs.novu.co/platform/inbox/headless/api-reference
8b. Novu, Preferences concept, https://docs.novu.co/platform/concepts/preferences
9. Novu, Push integrations, https://docs.novu.co/platform/integrations/push
10. MagicBell pricing, https://www.magicbell.com/pricing
11. MagicBell, Web Push channel, https://www.magicbell.com/docs/channels/web_push
12. MagicBell, API authentication (User JWT), https://www.magicbell.com/docs/api/authentication
12b. MagicBell, API reference (`PUT /channels/user_preferences`), https://www.magicbell.com/docs/api/reference
13. MagicBell, API reference (notifications endpoints), https://www.magicbell.com/docs/api/reference ; In-app channel, https://www.magicbell.com/docs/channels/in_app
14. Courier pricing, https://www.courier.com/pricing
15. Courier, Inbox authentication, https://www.courier.com/docs/platform/inbox/authentication
16. Courier, JS SDK, https://www.courier.com/docs/sdk-libraries/courier-js-web
16b. Courier, Preferences API, https://www.courier.com/docs/recipients/preferences/api
17. Courier, Push overview, https://www.courier.com/docs/external-integrations/push/intro-to-push ; OneSignal push, https://www.courier.com/docs/guides/providers/push/onesignal-push/
18. SuprSend pricing (feature table and FAQ), https://www.suprsend.com/pricing
19. SuprSend, Client authentication, https://docs.suprsend.com/docs/client-authentication
20. SuprSend, Inbox overview, https://docs.suprsend.com/docs/inbox-overview
21. SuprSend, WebPush (JS), https://docs.suprsend.com/docs/js-webpush
