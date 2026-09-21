import { describe, expect, it } from "vitest";
import {
  getFlowTemplate,
  listFlowTemplates,
} from "./templates";
import { validateFlowForActivation } from "./validate";

describe("flow templates", () => {
  it("includes the spa booking template", () => {
    const template =
      getFlowTemplate("spa_booking");

    expect(template).not.toBeNull();
    expect(
      template?.entry_node_id,
    ).toBe("start");

    expect(
      template?.nodes.length,
    ).toBeGreaterThanOrEqual(5);
  });

  it("spa booking template has a valid graph", () => {
    const template =
      getFlowTemplate("spa_booking");

    expect(template).not.toBeNull();

    const issues =
      validateFlowForActivation(
        {
          name: template!.name,
          trigger_type:
            template!.trigger_type,
          trigger_config:
            template!.trigger_config as Record<string, unknown>,
          entry_node_id:
            template!.entry_node_id,
        },
        template!.nodes.map(
          (node) => ({
            node_key:
              node.node_key,
            node_type:
              node.node_type,
            config:
              node.config as Record<
                string,
                unknown
              >,
          }),
        ),
      );

    const errors =
      issues.filter(
        (issue) =>
          issue.severity ===
          "error",
      );

    expect(errors).toEqual([]);
  });

  it("keeps existing templates available", () => {
    const slugs =
      listFlowTemplates().map(
        (template) =>
          template.slug,
      );

    expect(slugs).toEqual(
      expect.arrayContaining([
        "welcome_menu",
        "faq_bot",
        "lead_capture",
        "spa_booking",
      ]),
    );
  });
});
