import { describe, it, expect } from "vitest";
import {
  fromKnockPreferenceSet,
  mergeIntoKnockPreferenceSet,
} from "./notifications.knock.server";

describe("reading a Knock preference set", () => {
  it("has none when Knock holds no set", () => {
    expect(fromKnockPreferenceSet(null)).toBeNull();
  });

  it("has none when the set has no categories", () => {
    expect(fromKnockPreferenceSet({ categories: {} })).toBeNull();
    expect(fromKnockPreferenceSet({ categories: null })).toBeNull();
  });

  it("reads each Cadence category's feed switch", () => {
    expect(
      fromKnockPreferenceSet({
        categories: {
          enrollments: { channel_types: { in_app_feed: true, email: false } },
          "discussion-replies": false,
          "something-else": true,
        },
      })
    ).toEqual({
      enrollments: { feed: true },
      discussionReplies: { feed: false },
    });
  });
});

describe("changing a Knock preference set", () => {
  it("changes only the given category × channel, keeping everything Cadence doesn't know about", () => {
    const stored = {
      categories: {
        enrollments: {
          channel_types: { in_app_feed: false, email: true },
        },
        "discussion-replies": { channel_types: { in_app_feed: true } },
        "marketing-digest": { channel_types: { email: false } },
      },
      channel_types: { sms: false },
      workflows: { "weekly-summary": false },
    };

    expect(
      mergeIntoKnockPreferenceSet(stored, { enrollments: { feed: true } })
    ).toEqual({
      categories: {
        enrollments: {
          channel_types: { in_app_feed: true, email: true },
        },
        "discussion-replies": { channel_types: { in_app_feed: true } },
        "marketing-digest": { channel_types: { email: false } },
      },
      channel_types: { sms: false },
      workflows: { "weekly-summary": false },
    });
  });

  it("writes the categories it's given when Knock holds no set", () => {
    expect(
      mergeIntoKnockPreferenceSet(null, {
        enrollments: { feed: false },
        discussionReplies: { feed: true },
      })
    ).toEqual({
      categories: {
        enrollments: { channel_types: { in_app_feed: false } },
        "discussion-replies": { channel_types: { in_app_feed: true } },
      },
    });
  });

  it("keeps a category's other channels when it was stored as a single on/off", () => {
    expect(
      mergeIntoKnockPreferenceSet(
        { categories: { enrollments: false } },
        { enrollments: { feed: true } }
      )
    ).toEqual({
      categories: {
        enrollments: {
          channel_types: {
            chat: false,
            email: false,
            http: false,
            in_app_feed: true,
            push: false,
            sms: false,
          },
        },
      },
    });
  });
});
