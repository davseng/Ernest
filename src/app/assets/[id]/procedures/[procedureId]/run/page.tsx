import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { ChecklistRunner } from "@/components/checklist-runner";
import { getAsset } from "@/data/assets";
import { getProcedure } from "@/data/procedures";

export const dynamic = "force-dynamic";

export default async function ChecklistRunPage({ params }: { params: Promise<{ id: string; procedureId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  const { id, procedureId } = await params;
  const [asset, procedure] = await Promise.all([
    getAsset(id, session.user.id),
    getProcedure(procedureId, id, session.user.id),
  ]);
  if (!asset || !procedure) notFound();
  if (procedure.procedureType !== "checklist") redirect(`/assets/${id}/procedures`);

  return <ChecklistRunner
    assetId={id}
    assetName={asset.name}
    title={procedure.title}
    notes={procedure.notes}
    steps={procedure.steps}
    sourceDocumentTitle={procedure.sourceDocumentTitle}
    sourcePage={procedure.sourcePage}
  />;
}
