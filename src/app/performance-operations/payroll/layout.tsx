import type { ReactNode } from "react";
import { HubLibrary } from "@/components/hub/hub-library";
import { OnlyOnPath } from "@/components/hub/only-on-path";

/** Adds the section's notes and documents under the index page only. */
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-6">
      {children}
      <OnlyOnPath path="/performance-operations/payroll">
        <HubLibrary section="payroll" />
      </OnlyOnPath>
    </div>
  );
}
