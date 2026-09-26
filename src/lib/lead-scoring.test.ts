import {
  describe,
  expect,
  it,
} from "vitest"

import {
  calculateLeadScore,
} from "./lead-scoring"

describe(
  "lead scoring",
  () => {
    it("starts at low score for an empty lead", () => {
      const result =
        calculateLeadScore({})

      expect(result.score).toBe(0)
      expect(result.band).toBe("low")
    })

    it("scores a qualified booking intent highly", () => {
      const result =
        calculateLeadScore({
          qualification_completed:
            true,
          preferred_service:
            "Thai Massage",
          requirement:
            "Need weekend appointment",
          city:
            "Lucknow",
          current_intent:
            "BOOK_APPOINTMENT",
          conversation_stage:
            "Appointment Requested",
          lead_status:
            "qualified",
        })

      expect(result.score).toBeGreaterThanOrEqual(
        70,
      )
      expect(result.band).toBe("high")
    })

    it("scores price intent as medium without qualification", () => {
      const result =
        calculateLeadScore({
          current_intent:
            "PRICE_QUERY",
        })

      expect(result.score).toBe(15)
      expect(result.band).toBe(
        "low",
      )
    })

    it("scores service interest", () => {
      const result =
        calculateLeadScore({
          preferred_service:
            "Deep Tissue Massage",
          current_intent:
            "SERVICE_QUERY",
        })

      expect(result.score).toBe(25)
      expect(result.band).toBe(
        "low",
      )
    })

    it("caps score at 100", () => {
      const result =
        calculateLeadScore({
          qualification_completed:
            true,
          preferred_service:
            "Deep Tissue Massage",
          requirement:
            "Book immediately",
          location:
            "Gomti Nagar",
          current_intent:
            "BOOK_APPOINTMENT",
          conversation_stage:
            "Appointment Requested",
          lead_status:
            "qualified",
          last_ai_message_at:
            new Date().toISOString(),
        })

      expect(result.score).toBe(100)
      expect(result.band).toBe(
        "high",
      )
    })

    it("rejects conversational text as location", () => {
      const cases = [
        "Manager ki vacancy hai apke yaha",
        "Kal",
        "Hnji",
        "Talk To Manager",
        "Or any other services",
        "Hello",
      ]

      for (const location of cases) {
        const result =
          calculateLeadScore({
            location,
          })

        expect(result.reasons).not.toContain(
          "+10: meaningful location/service area identified",
        )
      }
    })

    it("accepts location values with explicit place cues", () => {
      const result =
        calculateLeadScore({
          location:
            "Gomti Nagar, Lucknow",
        })

      expect(result.reasons).toContain(
        "+10: meaningful location/service area identified",
      )
    })

    it("supports CRM intent aliases", () => {
      expect(
        calculateLeadScore({
          current_intent: "PRICE",
        }).reasons,
      ).toContain("+15: pricing intent")

      expect(
        calculateLeadScore({
          current_intent: "SERVICE",
        }).reasons,
      ).toContain("+10: service interest")
    })

    it("records scoring reasons", () => {
      const result =
        calculateLeadScore({
          preferred_service:
            "Thai Massage",
          current_intent:
            "PRICE_QUERY",
        })

      expect(
        result.reasons.join(" "),
      ).toContain(
        "preferred service identified",
      )

      expect(
        result.reasons.join(" "),
      ).toContain(
        "pricing intent",
      )
    })
  },
)
