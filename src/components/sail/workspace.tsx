"use client";
import { useState } from "react";
import type { Voyage, Participant } from "@/data/sail-store";
import { SailVoyageForm } from "@/components/sail/voyage-form";
import { SailAvailabilityForm } from "@/components/sail/availability-form";
import type { SailAvailability } from "@/domain/sail-timeline";
import { SailPeople } from "@/components/sail/people";
export function SailWorkspace({
  voyage,
  assets,
  people,
  enquiries,
  availability,
  availabilityReady = false,
}: {
  availability?: SailAvailability | null;
  availabilityReady?: boolean;
  voyage: Voyage;
  assets: { id: string; name: string }[];
  people: Participant[];
  enquiries: {
    id: string;
    full_name: string;
    email: string;
    role: string;
    message: string;
    reviewed: boolean;
  }[];
}) {
  const [saved, setSaved] = useState(false);
  return (
    <>
      {saved ? <p role="status">Voyage saved.</p> : null}
      <SailVoyageForm
        key={voyage.revision}
        initial={voyage}
        id={voyage.id}
        assetId={voyage.assetId}
        revision={voyage.revision}
        assets={assets}
        onSaved={() => setSaved(true)}
        onDirty={() => setSaved(false)}
      />
      {availabilityReady ? (
        <SailAvailabilityForm voyageId={voyage.id} initial={availability} />
      ) : null}
      <SailPeople
        voyageId={voyage.id}
        voyageRevision={voyage.revision}
        people={people}
        enquiries={enquiries}
      />
    </>
  );
}
