import { describe, expect, it } from "vitest";
import {
  pinToHubOrganization,
  resolveWorkspaceSelection,
} from "@/lib/workspace/resolver";

const TAC = { id: "tac", slug: "timberhill-athletic-club" };
const G3 = { id: "g3", slug: "g3-performance" };

describe("pinToHubOrganization", () => {
  it("offers only the hub organization when the user can access it", () => {
    expect(pinToHubOrganization([G3, TAC], TAC.slug)).toEqual({
      options: [TAC],
      pinned: true,
    });
  });

  it("leaves access unchanged when the user is not in the hub organization", () => {
    expect(pinToHubOrganization([G3], TAC.slug)).toEqual({
      options: [G3],
      pinned: false,
    });
  });

  it("means no stored selection can reach another organization", () => {
    const { options } = pinToHubOrganization([G3, TAC], TAC.slug);
    const access = {
      organizationIds: options.map((o) => o.id),
      defaultOrganizationId: G3.id,
      canAccessAll: false,
    };
    for (const requested of [G3.id, "all", "nonsense", null]) {
      expect(resolveWorkspaceSelection(requested, access)).toEqual({
        kind: "organization",
        organizationId: TAC.id,
      });
    }
  });
});
