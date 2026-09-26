import {
  describe,
  expect,
  it,
} from "vitest"

import {
  extractMemoryFacts,
  formatCustomerMemoryContext,
} from "./customer-memory"

describe(
  "customer memory",
  () => {
    it("extracts preferred service", () => {
      const facts =
        extractMemoryFacts(
          "I want a deep tissue massage",
        )

      expect(facts).toEqual([
        expect.objectContaining({
          key: "preferred_service",
          value:
            "Deep Tissue Massage",
        }),
      ])
    })

    it("extracts customer location", () => {
      const facts =
        extractMemoryFacts(
          "I live in Gomti Nagar",
        )

      expect(facts).toEqual([
        expect.objectContaining({
          key: "customer_location",
          value:
            "Gomti Nagar",
        }),
      ])
    })

    it("returns no facts for unrelated text", () => {
      expect(
        extractMemoryFacts(
          "Hello, how are you?",
        ),
      ).toEqual([])
    })

    it("formats saved memory for AI context", () => {
      const context =
        formatCustomerMemoryContext([
          {
            id: "1",
            account_id: "a",
            contact_id: "c",
            memory_key:
              "preferred_service",
            memory_value:
              "Deep Tissue Massage",
            value_type: "text",
            source: "customer",
            confidence: 0.9,
            metadata: {},
            first_seen_at: "",
            last_seen_at: "",
            created_at: "",
            updated_at: "",
          },
        ])

      expect(context).toContain(
        "preferred_service: Deep Tissue Massage",
      )
    })

    it("uses a safe empty-memory context", () => {
      expect(
        formatCustomerMemoryContext([]),
      ).toBe(
        "No saved customer memory.",
      )
    })
  },
)
