import { notFound } from "next/navigation";
import { sailOwnerContext } from "../context";
import { SailVoyageForm } from "@/components/sail/voyage-form";
export const dynamic = "force-dynamic";
export default async function NewSailVoyage() {
  const { assets, ready } = await sailOwnerContext();
  if (!ready) notFound();
  return (
    <main id="sail-main" className="sail-main sail-narrow">
      <p className="sail-kicker">Owner workspace</p>
      <h1>Plan a voyage</h1>
      <SailVoyageForm
        assets={assets.map((a) => ({ id: a.id, name: a.name }))}
      />
    </main>
  );
}
