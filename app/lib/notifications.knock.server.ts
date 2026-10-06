import Knock, { NotFoundError, signUserToken } from "@knocklabs/node";
import type {
  PreferenceSet,
  PreferenceSetChannelTypes,
} from "@knocklabs/node/resources/recipients/preferences";
import type { NotificationKind } from "~/lib/notification-feed";
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CHANNELS,
  type NotificationCategory,
  type NotificationChannel,
  type NotificationPreferences,
} from "~/lib/notification-preferences";
import type {
  NotificationPerson,
  Notifications,
} from "~/lib/notifications.server";

// ─── Knock adapter for the Notifications port ───
// The only server code that imports the Knock SDK or knows Knock's keys.
// Each Notification kind is one Knock workflow in its preference category,
// pushed and committed by scripts/push-knock-workflows.ts.

/**
 * The Knock workflow for each Notification kind, and the Notification
 * category it belongs to. Each workflow is pushed in that category's
 * Knock key (`CATEGORY_KEYS`), which is what lets a feed switch silence it.
 */
const WORKFLOWS: Record<
  NotificationKind,
  { key: string; category: NotificationCategory }
> = {
  "discussion-reply": {
    key: "discussion-reply",
    category: "discussionReplies",
  },
  "discussion-question": {
    key: "discussion-question",
    category: "discussionQuestions",
  },
  "seat-claimed": { key: "seat-claimed", category: "seatClaims" },
  "new-enrollment": { key: "new-enrollment", category: "enrollments" },
  "refund-requested": {
    key: "refund-requested",
    category: "refundRequestUpdates",
  },
  "refund-request-open": {
    key: "refund-request-open",
    category: "openRefundRequests",
  },
  "refund-approved": {
    key: "refund-approved",
    category: "refundRequestUpdates",
  },
  "refund-declined": {
    key: "refund-declined",
    category: "refundRequestUpdates",
  },
};

/** Knock preference category key per Cadence Notification category. */
const CATEGORY_KEYS: Record<NotificationCategory, string> = {
  refundRequestUpdates: "refund-request-updates",
  seatClaims: "seat-claims",
  enrollments: "enrollments",
  discussionQuestions: "discussion-questions",
  openRefundRequests: "open-refund-requests",
  discussionReplies: "discussion-replies",
};

/** Each Knock workflow key with its category key, for pushing workflows. */
export const KNOCK_WORKFLOWS = (
  Object.entries(WORKFLOWS) as [
    NotificationKind,
    (typeof WORKFLOWS)[NotificationKind],
  ][]
).map(([kind, { key, category }]) => ({
  kind,
  key,
  categoryKey: CATEGORY_KEYS[category],
}));

type KnockChannelType = keyof PreferenceSetChannelTypes;

/** Knock channel type per Cadence channel. */
const CHANNEL_TYPES: Record<NotificationChannel, KnockChannelType> = {
  feed: "in_app_feed",
};

/**
 * Every Knock channel type, so a category stored as one on/off for all of them
 * can be spelled out per channel before one channel changes.
 */
const ALL_KNOCK_CHANNEL_TYPES: KnockChannelType[] = [
  "chat",
  "email",
  "http",
  "in_app_feed",
  "push",
  "sms",
];

/** Cadence keeps each user's preferences in Knock's `default` set. */
const PREFERENCE_SET = "default";

const USER_TOKEN_LIFETIME_SECONDS = 60 * 60;

export type KnockConfig = {
  secretKey: string;
  publicKey: string;
  signingKey: string;
  feedChannelId: string;
};

export function knockNotifications(config: KnockConfig): Notifications {
  const knock = new Knock({ apiKey: config.secretKey });

  /** The user's raw Knock set, or null when Knock has never seen them. */
  async function getKnockPreferenceSet(
    userId: number
  ): Promise<KnockPreferenceSet | null> {
    try {
      return await knock.users.getPreferences(String(userId), PREFERENCE_SET);
    } catch (error) {
      if (error instanceof NotFoundError) return null;
      throw error;
    }
  }

  return {
    async send(notification, idempotencyKey) {
      await knock.workflows.trigger(
        WORKFLOWS[notification.kind].key,
        {
          recipients: [toKnockUser(notification.recipient)],
          actor: notification.actor
            ? toKnockUser(notification.actor)
            : undefined,
          data: notification.data,
        },
        // Knock dedupes whole trigger requests by key, and one domain event
        // can notify several people (every Platform Admin for an Open Refund
        // Request), so the key Knock sees is scoped to the recipient.
        { idempotencyKey: `${idempotencyKey}:${notification.recipient.id}` }
      );
    },

    async feedCredentials(userId) {
      const knockUserId = String(userId);
      return {
        userId: knockUserId,
        userToken: await signUserToken(knockUserId, {
          signingKey: config.signingKey,
          expiresInSeconds: USER_TOKEN_LIFETIME_SECONDS,
        }),
        publicKey: config.publicKey,
        feedChannelId: config.feedChannelId,
      };
    },

    async identifyUser(person) {
      const { id, ...properties } = toKnockUser(person);
      await knock.users.update(id, properties);
    },

    async getPreferences(userId) {
      return fromKnockPreferenceSet(await getKnockPreferenceSet(userId));
    },

    async mergePreferences(userId, preferences) {
      // Knock replaces the whole set on write, so read it and change only
      // the given switches; whatever else Knock holds is written back as is.
      const stored = await getKnockPreferenceSet(userId);
      await knock.users.setPreferences(
        String(userId),
        PREFERENCE_SET,
        mergeIntoKnockPreferenceSet(stored, preferences)
      );
    },

    async archiveForComment(commentId) {
      // Trigger data filtering matches `data.commentId` exactly, across every
      // recipient (verified against Development with the secret key).
      const messageIds: string[] = [];
      for await (const message of knock.messages.list({
        trigger_data: JSON.stringify({ commentId }),
      })) {
        if (!message.archived_at) messageIds.push(message.id);
      }
      // Knock rejects an empty batch.
      if (messageIds.length === 0) return;
      await knock.messages.batch.archive({ message_ids: messageIds });
    },
  };
}

/** The parts of a Knock preference set Cadence reads and writes back. */
type KnockPreferenceSet = Pick<
  PreferenceSet,
  | "categories"
  | "channel_types"
  | "channels"
  | "workflows"
  | "commercial_subscribed"
>;

type KnockCategorySetting = NonNullable<
  KnockPreferenceSet["categories"]
>[string];

/**
 * Cadence's view of a Knock set: each Cadence category's feed switch. Null
 * when Knock holds no set or one with no categories, so defaults get written.
 */
export function fromKnockPreferenceSet(
  set: KnockPreferenceSet | null
): NotificationPreferences | null {
  const categories = set?.categories;
  if (!categories || Object.keys(categories).length === 0) return null;

  const preferences: NotificationPreferences = {};
  for (const category of NOTIFICATION_CATEGORIES) {
    const setting = categories[CATEGORY_KEYS[category]];
    if (setting === undefined) continue;
    if (typeof setting === "boolean") {
      preferences[category] = { feed: setting };
      continue;
    }
    const feed = setting.channel_types?.[CHANNEL_TYPES.feed];
    preferences[category] = typeof feed === "boolean" ? { feed } : {};
  }
  return preferences;
}

/**
 * The Knock set to write: `stored` with only the given category × channel
 * switches changed. Categories, channels and workflows Cadence doesn't know
 * about are kept as they are.
 */
export function mergeIntoKnockPreferenceSet(
  stored: KnockPreferenceSet | null,
  preferences: NotificationPreferences
): KnockPreferenceSet {
  const categories = { ...stored?.categories };
  for (const category of NOTIFICATION_CATEGORIES) {
    const channels = preferences[category];
    if (!channels) continue;
    const key = CATEGORY_KEYS[category];
    const setting = spellOutChannels(categories[key]);
    const channelTypes = { ...setting.channel_types };
    for (const channel of NOTIFICATION_CHANNELS) {
      const enabled = channels[channel];
      if (enabled !== undefined) channelTypes[CHANNEL_TYPES[channel]] = enabled;
    }
    categories[key] = { ...setting, channel_types: channelTypes };
  }

  // Knock returns its own fields (like `id`) on a set; write back only the
  // preferences.
  return {
    categories,
    channel_types: stored?.channel_types,
    channels: stored?.channels,
    workflows: stored?.workflows,
    commercial_subscribed: stored?.commercial_subscribed,
  };
}

/** A category setting as an object, a single on/off spelled out per channel. */
function spellOutChannels(setting: KnockCategorySetting | undefined) {
  if (setting === undefined) return {};
  if (typeof setting !== "boolean") return setting;
  const channelTypes: PreferenceSetChannelTypes = {};
  for (const type of ALL_KNOCK_CHANNEL_TYPES) channelTypes[type] = setting;
  return { channel_types: channelTypes };
}

/** Inline identify: Knock upserts the user from these properties. */
function toKnockUser(person: NotificationPerson) {
  return {
    id: String(person.id),
    name: person.name,
    email: person.email,
    ...(person.avatarUrl ? { avatar: person.avatarUrl } : {}),
  };
}
