"use client"

import { useMemo } from "react"
import { useSearchParams } from "next/navigation"

import {
  AutomationBuilder,
  type BuilderInitial,
  type BuilderStep,
} from "@/components/automations/automation-builder"

import { AUTOMATION_TEMPLATES, type TemplateSlug } from "@/lib/automations/templates"
import type {
  AutomationStepType,
  AutomationTriggerType,
} from "@/types"

export default function NewAutomationPage() {
  const params = useSearchParams()

  const template =
    params.get("template") as TemplateSlug | null

  const preset =
    params.get("preset")

  const initial: BuilderInitial =
    useMemo(() => {
      if (preset === "cold_lead_followup") {
        return {
          name:
            "Cold Lead WhatsApp Follow-up",
          description:
            "Template-first sequence for manually-added or imported leads outside the 24-hour WhatsApp window. After the lead replies, Send Message steps can continue with free-form text while the customer-service window is open.",
          trigger_type:
            "time_based" as AutomationTriggerType,
          trigger_config: {
            schedule: "manual_enrollment",
          },
          is_active: false,
          steps:
            createColdLeadFollowupSteps(),
        }
      }

      if (preset === "spa_followup") {
        return {
          name:
            "Spa Lead Follow-up",
          description:
            "Flexible WhatsApp follow-up sequence for spa leads. Every wait and follow-up message can be changed from the visual builder.",
          trigger_type:
            "first_inbound_message" as AutomationTriggerType,
          trigger_config: {},
          is_active: false,
          steps:
            createSpaFollowupSteps(),
        }
      }

      if (
        template &&
        AUTOMATION_TEMPLATES[
          template
        ]
      ) {
        const t =
          AUTOMATION_TEMPLATES[
            template
          ]

        const steps =
          expandFromSeeds(
            t.steps.map(
              (
                seed,
                idx,
              ) => ({
                index:
                  idx,
                step_type:
                  seed.step_type,
                step_config:
                  seed.step_config as Record<
                    string,
                    unknown
                  >,
                branch:
                  seed.branch ??
                  null,
                parent_index:
                  seed.parent_index ??
                  null,
              }),
            ),
          )

        return {
          name: t.name,
          description:
            t.description,
          trigger_type:
            t.trigger_type,
          trigger_config:
            t.trigger_config as Record<
              string,
              unknown
            >,
          is_active: false,
          steps,
        }
      }

      return {
        name: "",
        description: "",
        trigger_type:
          "new_message_received" as AutomationTriggerType,
        trigger_config: {},
        is_active: false,
        steps: [],
      }
    }, [
      preset,
      template,
    ])

  return (
    <AutomationBuilder
      initial={initial}
    />
  )
}

function createColdLeadFollowupSteps(): BuilderStep[] {
  const make = (
    step_type: AutomationStepType,
    step_config: Record<string, unknown>,
  ): BuilderStep => ({
    cid: crypto.randomUUID(),
    step_type,
    step_config,
  })

  return [
    make("send_template", {
      template_name:
        "YOUR_APPROVED_COLD_LEAD_TEMPLATE",
      language:
        "en_US",
    }),

    make("wait", {
      amount: 15,
      unit: "minutes",
    }),

    make("send_message", {
      text:
        "Hi 😊 Aapko spa service, package ya available timing ke baare mein help chahiye ho to yahin reply karein.",
      fallback_template_name:
        "YOUR_APPROVED_FOLLOWUP_TEMPLATE",
      fallback_template_language:
        "en_US",
      fallback_task_title:
        "Cold lead follow-up — customer has not replied within the WhatsApp window",
    }),

    make("wait", {
      amount: 4,
      unit: "hours",
    }),

    make("send_message", {
      text:
        "Just checking in 😊 Agar aap batayein ki aap kis service aur kis date ke liye interested hain, hum aapko guide kar sakte hain.",
      fallback_template_name:
        "YOUR_APPROVED_FOLLOWUP_TEMPLATE",
      fallback_template_language:
        "en_US",
      fallback_task_title:
        "Second cold lead follow-up",
    }),

    make("wait", {
      amount: 20,
      unit: "hours",
    }),

    make("send_message", {
      text:
        "Whenever you're ready 😊 Reply here and our team will help you with your spa booking.",
      fallback_template_name:
        "YOUR_APPROVED_FOLLOWUP_TEMPLATE",
      fallback_template_language:
        "en_US",
      fallback_task_title:
        "Final cold lead follow-up",
    }),
  ]
}

function createSpaFollowupSteps(): BuilderStep[] {
  const make = (
    step_type: AutomationStepType,
    step_config: Record<
      string,
      unknown
    >,
  ): BuilderStep => ({
    cid:
      crypto.randomUUID(),
    step_type,
    step_config,
  })

  return [
    make(
      "assign_conversation",
      {
        mode:
          "round_robin",
      },
    ),

    make(
      "create_task",
      {
        title:
          "Follow up new spa lead",
        description:
          "Review the WhatsApp enquiry and follow up with the lead.",
        priority:
          "high",
        assigned_to: "",
        due_in_minutes:
          30,
        due_in_hours:
          0,
        due_in_days:
          0,
        due_unit:
          "minutes",
      },
    ),

    make(
      "wait",
      {
        amount: 30,
        unit:
          "minutes",
      },
    ),

    make(
      "send_message",
      {
        text:
          "Hi 👋 Just checking in on your spa enquiry. Which service would you like to know about?",
        fallback_template_name:
          "spa_followup_24h",
        fallback_template_language:
          "en_US",
        fallback_task_title:
          "Follow up spa lead manually",
      },
    ),

    make(
      "wait",
      {
        amount: 3,
        unit:
          "hours",
      },
    ),

    make(
      "send_message",
      {
        text:
          "Hello 😊 I can help you choose the right spa service and available timing. What would you like to book?",
        fallback_template_name:
          "spa_followup_24h",
        fallback_template_language:
          "en_US",
        fallback_task_title:
          "Second spa lead follow-up",
      },
    ),

    make(
      "wait",
      {
        amount: 18,
        unit:
          "hours",
      },
    ),

    make(
      "send_message",
      {
        text:
          "Just following up on your enquiry 😊 If you share your preferred date, I can help you with the next step.",
        fallback_template_name:
          "spa_followup_24h",
        fallback_template_language:
          "en_US",
        fallback_task_title:
          "Final in-window spa follow-up",
      },
    ),

    make(
      "wait",
      {
        amount: 6,
        unit:
          "hours",
      },
    ),

    make(
      "send_message",
      {
        text:
          "We would still be happy to help with your spa booking. Reply here and our team can guide you.",
        fallback_template_name:
          "spa_followup_24h",
        fallback_template_language:
          "en_US",
        fallback_task_title:
          "Use approved 24h+ spa follow-up template",
      },
    ),

    make(
      "wait",
      {
        amount: 48,
        unit:
          "hours",
      },
    ),

    make(
      "send_message",
      {
        text:
          "Last follow-up from our side 😊 Whenever you are ready, message us and we will help you book your spa session.",
        fallback_template_name:
          "spa_followup_final",
        fallback_template_language:
          "en_US",
        fallback_task_title:
          "Final spa lead follow-up",
      },
    ),
  ]
}

interface SeedRow {
  index: number
  step_type: AutomationStepType
  step_config: Record<string, unknown>
  branch:
    "yes" | "no" | null
  parent_index:
    number | null
}

function uid(): string {
  return (
    "c_" +
    (
      typeof crypto !==
      "undefined" &&
      "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random()
            .toString(36)
            .slice(2) +
          Date.now().toString(36)
    )
  )
}

function expandFromSeeds(
  rows: SeedRow[],
): BuilderStep[] {
  const nodes: BuilderStep[] =
    rows.map((r) => ({
      cid: uid(),
      step_type:
        r.step_type,
      step_config:
        r.step_config,
      branches:
        r.step_type ===
        "condition"
          ? {
              yes: [] as BuilderStep[],
              no: [] as BuilderStep[],
            }
          : undefined,
    }))

  const roots:
    BuilderStep[] = []

  rows.forEach(
    (r, i) => {
      if (
        r.parent_index ==
        null
      ) {
        roots.push(
          nodes[i],
        )
        return
      }

      const parent =
        nodes[
          r.parent_index
        ]

      if (
        !parent.branches
      ) {
        parent.branches = {
          yes: [],
          no: [],
        }
      }

      parent.branches[
        r.branch ??
          "yes"
      ].push(
        nodes[i],
      )
    },
  )

  return roots
}
