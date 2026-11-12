# What does Knock's in-app feed offer?

Research for [#8](https://github.com/oestec/cohort-005-project-fork/issues/8), part of the wayfinder map [#6](https://github.com/oestec/cohort-005-project-fork/issues/6) (in-app Notifications via Knock).

Researched 2026-11-12 against docs.knock.app (its `.md` page sources), the published npm tarballs of the Knock SDKs, and knock.app/pricing. Versions checked:

| Package                 | Version | Role                                                            |
| ----------------------- | ------- | --------------------------------------------------------------- |
| `@knocklabs/react`      | 0.15.1  | Prebuilt feed UI + re-exports every hook from `react-core`      |
| `@knocklabs/react-core` | 0.17.1  | Providers and headless hooks (no UI)                            |
| `@knocklabs/client`     | 0.23.1  | Browser JS client: feed store, Phoenix websocket                |
| `@knocklabs/node`       | 1.41.1  | Server SDK: trigger workflows, identify users, sign user tokens |
| `@knocklabs/cli`        | 1.6.2   | CLI for workflows-as-code and `workflow run`                    |

Sources: `npm view <pkg>`; tarballs via `npm pack`.

## TL;DR

- **One package for the browser: `@knocklabs/react`.** It ships both a prebuilt bell + popover + feed and the headless hooks. You can mix them: use the hooks with your own markup and never import the CSS.
- **Prebuilt UI is styled with `--rnf-*` CSS variables and `rnf-` classes**, plus `renderItem`/`renderHeader` slots and `colorMode`. You can't restyle it with Tailwind utilities. For a UI that matches Cadence closely, go headless (`useNotifications` + `useNotificationStore`).
- **Realtime is built in.** A Phoenix websocket opens client-side only and pushes `new-message` events, so no polling is needed. Nothing is server-rendered: the feed fetches in the browser after hydration.
- **Users are identified by our own user id.** `KnockProvider user={{ id, ...props }}` upserts the user from the browser by default (`identificationStrategy: "inline"`). Server-side, the workflow trigger can also identify recipients inline.
- **Production needs enhanced security mode:** an RS256 JWT signed on our server with `signUserToken` from `@knocklabs/node` (default lifetime 1 h), passed as `userToken`. It is off by default and has to be switched on in the dashboard per environment.
- **Server triggering:** `knock.workflows.trigger(key, { recipients, actor, data, tenant, cancellation_key })`. Idempotency uses the `Idempotency-Key` header (trigger endpoint only, kept 24 h, only successes are cached). The SDK retries 408/409/429/5xx twice by default and adds its own idempotency key to each POST.
- **Testing without Knock:** in-app has no sandbox mode. Inject a fake (an interface over `workflows.trigger`) in unit tests. Otherwise point `new Knock({ baseURL, fetch })` at a stub, or use a separate Knock development environment.
- **Free plan:** $0, up to 10,000 messages a month, unlimited environments and seats, unlimited feed retention, Knock branding stays. A new account starts with **only a production environment**; development has to be enabled.

---

## 1. In-app feed API and React components

### Data model

- A feed is a per-user, reverse-chronological list of `FeedItem`s for one in-app **channel** (identified by a channel UUID, `KNOCK_FEED_CHANNEL_ID`) ([api-overview](https://docs.knock.app/in-app-ui/api-overview)).
- `FeedItem` fields include `id`, `actors`, `data` (the workflow trigger `data`, passed through), `blocks` (rendered template content), `source` (workflow key and categories), `tenant`, `seen_at`, `read_at`, `archived_at`, `link_clicked_at`, `inserted_at` ([api-overview](https://docs.knock.app/in-app-ui/api-overview#feeditem)).
- `blocks` are `markdown` (rendered HTML), `text`, or `button_set` (primary/secondary buttons with an `action` URI). The notification copy is written in Knock's template editor, not in our code. The feed returns **rendered HTML**, so a custom UI renders it with `dangerouslySetInnerHTML` (as Knock's own example does) ([api-overview](https://docs.knock.app/in-app-ui/api-overview#message-content-blocks-contentblock), [headless](https://docs.knock.app/in-app-ui/react/headless/feed)).
- Feed metadata gives `total_count`, `unread_count`, and `unseen_count` for badges ([api-overview](https://docs.knock.app/in-app-ui/api-overview#feedmetadata)).
- Feed messages are immutable once generated. To change one, archive it and trigger again ([in-app feeds FAQ](https://docs.knock.app/integrations/in-app/feeds)).
- The default `mode: "compact"` omits nested arrays and objects from `data` and returns at most one actor. Use `mode: "rich"` for the full payload ([headless](https://docs.knock.app/in-app-ui/react/headless/feed#feed-mode); `FeedClientOptions` in `@knocklabs/client/src/clients/feed/interfaces.ts`). **This matters if we pass nested objects in trigger `data`.**
- Filters (`FeedClientOptions`): `page_size`, `status` (`unread|read|unseen|seen|all`), `archived` (`exclude` by default, `include`, `only`), `tenant`, `has_tenant`, `source` (workflow key), `workflow_categories`, `trigger_data`, `inserted_at_date_range` (same file).
- Server-side reads are also possible: `knock.users.feeds.listItems(userId, channelId, query)` in `@knocklabs/node` (`src/resources/users/feeds.ts`). That endpoint's rate limit is always scoped per user and per environment.

### Prebuilt UI (`@knocklabs/react`)

```tsx
import {
  KnockProvider,
  KnockFeedProvider,
  NotificationIconButton,
  NotificationFeedPopover,
} from "@knocklabs/react";
import "@knocklabs/react/dist/index.css";

<KnockProvider apiKey={PUBLIC_KEY} user={{ id: user.id }} userToken={token}>
  <KnockFeedProvider feedId={FEED_CHANNEL_ID} colorMode="light">
    <NotificationIconButton ref={btnRef} onClick={() => setOpen(!open)} />
    <NotificationFeedPopover
      buttonRef={btnRef}
      isVisible={open}
      onClose={() => setOpen(false)}
    />
  </KnockFeedProvider>
</KnockProvider>;
```

([react/feed](https://docs.knock.app/in-app-ui/react/feed))

- **Components:** `NotificationIconButton` (bell with an unseen badge; `badgeCountType="unread"` switches it to unread), `NotificationFeedPopover`, `NotificationFeed` (full-page list), `NotificationCell`, `Avatar`, `EmptyFeed`, `MarkAsRead`, `UnseenBadge`, `NotificationFeedHeader` (exports in `dist/types/index.d.ts`).
- **Behaviour:** the popover calls `markAllAsSeen()` when it opens. Clicking a cell marks it `interacted` and redirects to the template's action URL by default. Override with `onNotificationClick` / `onNotificationButtonClick`. Each item has an "x" that archives it. There is a status filter header ([react/feed](https://docs.knock.app/in-app-ui/react/feed), [in-app feeds](https://docs.knock.app/integrations/in-app/feeds)). A **default redirect is a full navigation**, so in React Router we would supply `onNotificationClick` that calls `navigate()`.
- **Styling** ([feeds/styling](https://docs.knock.app/in-app-ui/feeds/styling)):
  1. Override `--rnf-*` CSS variables (full list in [`packages/react/src/theme.css`](https://github.com/knocklabs/javascript/blob/main/packages/react/src/theme.css)).
  2. Replace Knock's CSS entirely. All classes are prefixed `rnf-`.
  3. Use slots: `renderItem` (wrap or replace `NotificationCell`), `renderHeader`, an `avatar` prop on cells, and `colorMode: "light" | "dark"`.
  4. Localise strings with `i18n` on `KnockProvider`. Only `en` ships.
- The prebuilt package pulls in a large dependency tree: Knock's Telegraph design system (`@telegraph/*`), Radix dialog and hover-card, `@popperjs/core`, `lucide-react` (`npm view @knocklabs/react dependencies`).

### Headless hooks

Every hook from `@knocklabs/react-core` is re-exported by `@knocklabs/react`:

- `useKnockClient()`: the authenticated client from `KnockProvider`.
- `useNotifications(knock, channelId, options)`: creates a `Feed` client and calls `listenForUpdates()` on it.
- `useNotificationStore(feedClient)`: `{ items, metadata, loading, networkStatus, pageInfo }`, with an optional selector.
- `useKnockFeed()`: `{ feedClient, useFeedStore, colorMode }` inside `KnockFeedProvider`.
- Also `useAuthenticatedKnockClient`, `useKnockAuthState`, `usePreferences`, `useTranslations`.

([headless](https://docs.knock.app/in-app-ui/react/headless/feed); `dist/types/index.d.ts`)

**In headless mode we must mark items seen ourselves**, or `unseen_count` never decreases ([headless](https://docs.knock.app/in-app-ui/react/headless/feed#marking-items-as-seen)). The hooks package has no UI dependencies, so a headless build could depend on `@knocklabs/react-core` alone (plus `@knocklabs/client`) and avoid the Telegraph/Radix tree.

## 2. Realtime vs fetch on page load

- Knock runs a managed websocket (Phoenix channels, `phoenix@1.8.9` in `@knocklabs/client`). The one event is `new-message`. It carries only updated badge metadata (no message body) and "might be throttled". The client refetches on receipt ([api-overview](https://docs.knock.app/in-app-ui/api-overview#real-time-delivery)).
- `useNotifications` calls `feedClient.listenForUpdates()` automatically. Fetching items is a separate `feedClient.fetch()`. The prebuilt components call it, and in headless mode we call it in a `useEffect` ([headless](https://docs.knock.app/in-app-ui/react/headless/feed)).
- Options on `defaultFeedOptions` ([react/feed](https://docs.knock.app/in-app-ui/react/feed#socket-behavior-options)):
  - `auto_manage_socket_connection` with `auto_manage_socket_connection_delay` (default 2000 ms) disconnects when the tab is hidden.
  - `__experimentalCrossBrowserUpdates` syncs tabs via `BroadcastChannel`.
- **SSR / React Router 7 (`ssr: true` in `react-router.config.ts`):**
  - There is **no React Router or Remix guidance** in Knock's docs. The only router integrations are `@knocklabs/react/next` and `@knocklabs/react/tanstack`, and both export just `KnockGuideLocationSensor`, which is for Guides, not feeds (`package.json` `exports`, `dist/types/next|tanstack/index.d.ts`). The `next` and `@tanstack/react-router` peer dependencies are marked optional (`peerDependenciesMeta`).
  - The ESM bundle starts with `"use client"`, which only matters for RSC. Cadence doesn't use RSC, so it has no effect.
  - The client guards the socket with `typeof window !== "undefined" && typeof WebSocket !== "undefined"` (`@knocklabs/client/src/api.ts`), and `BroadcastChannel` and `document.visibilitychange` are guarded too. Rendering `KnockProvider` on the server is therefore expected to be harmless. Note, though, that `KnockProvider` constructs `new Knock(...)` inside `useMemo`, and `useNotifications` creates the feed client inside a `useState` initializer, so both also run during SSR (`react-core/src/modules/core/hooks/useAuthenticatedKnockClient.ts`, `.../feed/hooks/useNotifications.ts`). **Unverified in practice.** The safe pattern is to render the bell client-only, or accept that the server renders an empty or zero badge that fills in after hydration.
  - An alternative for a server-rendered first paint: read the feed in a loader with `knock.users.feeds.listItems` (secret key), with realtime taking over on the client. This is more work and not documented as a pattern.
- `KnockProvider` takes `enabled` (default `true`). When `false` the client stays idle: no identify, no requests, no socket. It's meant for waiting on an async token (`KnockProvider.tsx`). Changing the user id remounts the feed subtree (`feedProviderKey` includes `userId`), which suits Cadence's DevUI user switcher.

## 3. User identification

- The recipient `id` is **our own user id**, the only required property. Reserved properties: `name`, `email`, `avatar`, `phone_number`, `timezone`, `locale`, `created_at`. Custom properties are allowed up to 256 kB ([identifying-recipients](https://docs.knock.app/managing-recipients/identifying-recipients)).
- There are three ways to identify ([identifying-recipients](https://docs.knock.app/managing-recipients/identifying-recipients)):
  - Direct: `knock.users.update(id, props)` / `PUT /v1/users/:id`, server-side.
  - Inline: as recipient objects in `workflows.trigger`. Knock guarantees the recipients are upserted before the run.
  - Bulk: `POST /v1/users/bulk/identify`.
- **Client-side inline identify happens by default.** `KnockProvider user={{ id, name }}` calls `knock.user.identify(properties)` on authenticate unless `identificationStrategy="skip"` (`@knocklabs/client/src/knock.ts` lines ~116–180). Knock's docs recommend server-side identification for anything sensitive.
- When to call it: lazily, inline in triggers (quick start), and again whenever Knock-relevant fields (name, email) change ([identifying-recipients#when-to-identify](https://docs.knock.app/managing-recipients/identifying-recipients)). The actor (the person who caused the notification) is also a recipient object and can be inline-identified too.
- Data is per environment, so dev users and prod users are separate ([environments](https://docs.knock.app/version-control/environments)).

## 4. Auth: public key, signed user tokens, enhanced security mode

([security-and-authentication](https://docs.knock.app/in-app-ui/security-and-authentication))

- The browser uses the environment's **public** API key (`pk_...`). The secret key (`sk_...`) stays on the server.
- **Without enhanced security**, anyone with the public key can read and modify any user's feed. Knock says to enable it **before** releasing to users. It is **off by default**, and the setting is per environment, so the usual setup is off in development and on in production.
- **Token:** an RS256 JWT with `sub` = user id, recommended `iat`/`exp`, and optional `grants`/`explicit_grants` to narrow scope. It is signed on our server with the environment's signing key from Dashboard > Platform > API keys. The key is shown once, as PEM or base64 PEM, and goes in `KNOCK_SIGNING_KEY` by convention.
- **Node helper:** `import { signUserToken } from "@knocklabs/node"` (re-exported from `lib/tokenSigner`), called as `await signUserToken(userId, { signingKey?, expiresInSeconds = 3600, grants? })`. It uses `jose` and needs no network call (`@knocklabs/node/src/lib/tokenSigner.ts`).
- **Client:** pass `userToken` to `KnockProvider`. Refresh with `onUserTokenExpiring` (and `timeBeforeExpirationInMs`), which returns a new token. Re-authenticating restarts the socket. Knock suggests matching the token's lifetime to our session.
- **Fits React Router like this:** sign the token in the root (or layout) loader for the logged-in user and pass it down to `KnockProvider`. Add a resource route for refresh if needed.
- Rate limits under a user token are scoped per environment and per user ([rate-limits](https://docs.knock.app/api-reference/overview/rate-limits)).

## 5. Triggering workflows from the server

([Node SDK](https://github.com/knocklabs/knock-node), `@knocklabs/node/src/resources/workflows.ts`, `src/client.ts`)

```ts
import Knock from "@knocklabs/node";
const knock = new Knock(); // reads KNOCK_API_KEY (secret); KNOCK_BASE_URL overrides the host
await knock.workflows.trigger(
  "refund-issued",
  {
    recipients: [{ id: user.id, name: user.name }], // ids or inline-identify objects
    actor: adminId,
    data: { courseId, amount }, // ≤10 MB; becomes FeedItem.data
    tenant: undefined,
    cancellation_key: `refund-${refundId}`, // lets us cancel delayed/batched runs
  },
  { idempotencyKey: `refund-${refundId}` }
);
// -> { workflow_run_id }
```

- Workflows (steps, channels, templates) are defined in the Knock dashboard or as code with the CLI. API triggers always run the **last committed** version of a workflow; the dashboard test runner uses the last saved version ([testing-workflows](https://docs.knock.app/send-notifications/testing-workflows)).
- **Idempotency** ([idempotent-requests](https://docs.knock.app/api-reference/overview/idempotent-requests)):
  - Send an `Idempotency-Key` header, up to 255 chars. Only `POST /workflows/:key/trigger` honours it.
  - A replay within 24 h returns the original response with `idempotent-replayed: true`. A replay with different parameters is an error.
  - Only successful responses are cached, so a request that failed with 4xx or 5xx runs again on retry.
  - The Node SDK attaches an auto-generated key (`stainless-node-retry-<uuid>`) to every non-GET request, which keeps its own retries safe. Pass `{ idempotencyKey }` to make our own retries or double submits safe too.
- **Failure behaviour:**
  - The SDK retries 408, 409, 429 and ≥500 responses plus connection errors, `maxRetries` = 2 by default with backoff, and obeys `x-should-retry`.
  - The default timeout is 60 s and is retried too.
  - Errors throw `APIError` subclasses.
  - Trigger is asynchronous: a 200 only means Knock accepted the run. Delivery and the run's progress are visible in the dashboard's workflow debugger and logs.
  - **Decision for #10:** whether a Knock failure should fail the Cadence action. Our DB write and the Knock call are not atomic.
- `settings: { sandbox_mode?, skip_delay? }` on a trigger applies to tests. Note that the in-app channel ignores sandbox mode (see §8).

## 6. Read / seen / archived states

([message-statuses](https://docs.knock.app/send-notifications/message-statuses), [in-app feeds](https://docs.knock.app/integrations/in-app/feeds))

- Engagement statuses are independent of each other, each a timestamp: `seen_at`, `read_at`, `interacted_at`, `link_clicked_at`, `archived_at`.
- The prebuilt UI sets them like this:
  - **seen:** when the popover opens (`markAllAsSeen`).
  - **interacted:** when a cell is clicked.
  - **archived:** via the "x".
  - **read:** via "mark all as read".
- The feed client methods are `markAsSeen/Unseen`, `markAsRead/Unread`, `markAsInteracted`, `markAsArchived/Unarchived`, `markAllAsSeen`, `markAllAsRead`, `markAllAsArchived`, `markAllReadAsArchived` (`@knocklabs/client/src/clients/feed/feed.ts`). They update the store optimistically.
- Server-side, the Node SDK has `messages.*` and `messages.batch.*` status endpoints.
- The badge defaults to **unseen** count. Knock argues it's less noisy than **unread**.
- Archived items are excluded from the feed by default. The prebuilt UI offers no way to view archived items; use `archived: "only"` to build one.
- `link_clicked` requires link tracking and covers links in the body only.

## 7. Preferences (out of scope, for reference)

([preferences/overview](https://docs.knock.app/preferences/overview))

- Each user has a `PreferenceSet` that opts them out by `workflows`, `categories`, `channel_types` (e.g. `in_app_feed`), or `channels`. Knock evaluates it at workflow run time, and suppressed steps don't count as messages.
- There are environment-level defaults, a merge hierarchy, conditions, and bulk set.
- Knock offers a hosted preference center or a custom one built on the API or the React `usePreferences` hook.
- Per-tenant preferences are Enterprise-only ([knock-plans](https://docs.knock.app/manage-your-account/knock-plans)).

## 8. Plans, environments, testing without Knock

- **Free plan** ([pricing](https://knock.app/pricing), [knock-plans](https://docs.knock.app/manage-your-account/knock-plans)):
  - $0/month, up to **10,000 messages a month**. A message is one successful delivery to one user on one channel, and usage accrues in **every** environment, development included.
  - Unlimited environments and seats, 30-day log retention, **unlimited feed message retention**, Knock branding kept, Google SSO.
  - Not included: translations, SAML, SCIM, per-tenant branding or preferences, and custom roles.
  - Starter is $250/month for 50k messages.
- **Environments** ([environments](https://docs.knock.app/version-control/environments)):
  - A new account starts with **only `production`**. "Enabling environments" adds `development`, and more can be created.
  - Each environment has its own API keys, signing key, users, and messages. Content (workflows, templates) is version-controlled and promoted from development to production.
- **No sandbox mode for in-app.** Sandbox mode doesn't apply to the in-app channel, because Knock does the delivery itself. Use channel conditions to limit in-app messages in non-production environments ([knock-plans FAQ](https://docs.knock.app/manage-your-account/knock-plans#faq-sandbox-in-app-feed-messages)).
- **Testing without hitting Knock** (Knock publishes **no official mock or test server**):
  - Wrap trigger and token calls behind our own small module and inject a fake in Vitest. This is the simplest and needs nothing from Knock.
  - `new Knock({ apiKey, baseURL, fetch })` accepts a custom `fetch` and base URL (`@knocklabs/node/src/client.ts`), so an msw or stub-fetch handler works for SDK-level tests.
  - On the browser side, `KnockProvider enabled={false}` keeps the client fully idle, which is useful when no key is configured in local dev and in tests.
  - For manual end-to-end testing: the dashboard test runner, `knock workflow run` in the CLI, or a separate development environment.

## Open questions to settle elsewhere

- **#7, #11:** prebuilt (CSS variables plus an `rnf-` override) vs headless (our own Tailwind UI on `react-core`). Decide in the appearance prototype.
- **#10:** whether a failure to reach Knock should block the Cadence action or be logged and swallowed. Also what idempotency key to use per Notification.
- **#9:** enable environments at account creation. Turn on enhanced security in production only. Note the signing key when it's shown, since it's displayed once.
