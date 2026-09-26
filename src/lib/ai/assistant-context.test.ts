import {
  describe,
  expect,
  it,
} from "vitest";

import {
  canUseAIAssistant,
  formatConversationHistory,
} from "./assistant-context";

describe(
  "AI assistant context",
  () => {
    it(
      "allows AI mode on active conversations",
      () => {
        expect(
          canUseAIAssistant({
            controlMode: "ai",
            status: "open",
          }),
        ).toBe(true);
      },
    );

    it(
      "blocks human mode",
      () => {
        expect(
          canUseAIAssistant({
            controlMode: "human",
            status: "open",
          }),
        ).toBe(false);
      },
    );

    it(
      "blocks paused mode",
      () => {
        expect(
          canUseAIAssistant({
            controlMode: "paused",
            status: "open",
          }),
        ).toBe(false);
      },
    );

    it(
      "blocks closed conversations",
      () => {
        expect(
          canUseAIAssistant({
            controlMode: "ai",
            status: "closed",
          }),
        ).toBe(false);
      },
    );

    it(
      "formats customer and agent history",
      () => {
        expect(
          formatConversationHistory([
            {
              sender_type:
                "customer",
              content_text:
                "Price?",
            },
            {
              sender_type:
                "agent",
              content_text:
                "Which service?",
            },
          ]),
        ).toBe(
          "Customer: Price?\nAgent: Which service?",
        );
      },
    );

    it(
      "limits history to the latest 12 messages",
      () => {
        const messages =
          Array.from(
            {
              length: 15,
            },
            (_, index) => ({
              sender_type:
                "customer" as const,
              content_text:
                `message-${index}`,
            }),
          );

        const result =
          formatConversationHistory(
            messages,
          );

        expect(
          result.includes(
            "message-0",
          ),
        ).toBe(false);

        expect(
          result.includes(
            "message-3",
          ),
        ).toBe(true);

        expect(
          result.includes(
            "message-14",
          ),
        ).toBe(true);
      },
    );
  },
);
