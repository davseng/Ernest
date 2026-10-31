import Link from "next/link";
import { sailOwnerContext } from "../context";
import { sailPhotos } from "@/data/sail-photos";
import { sail } from "@/data/sail";
import { SailPhotoManager } from "@/components/sail/photo-manager";
export const dynamic = "force-dynamic";
export default async function SailPhotoAdmin() {
  const { session, assets } = await sailOwnerContext(),
    ready = await sailPhotos().available();
  const photos = ready ? await sailPhotos().list(session.user.id) : [],
    voyages = ready ? await sail().ownerList(session.user.id) : [];
  return (
    <main id="sail-main" className="sail-main">
      <p className="sail-kicker">
        <Link href="/sail/manage">← Owner workspace</Link>
      </p>
      <h1>Website photos</h1>
      <p>
        Choose the pictures that introduce the boat and bring each voyage to
        life.
      </p>
      {ready ? (
        <SailPhotoManager
          assets={assets.map((a) => ({ id: a.id, name: a.name }))}
          photos={photos.map((p) => ({ ...p }))}
          voyages={voyages.map((v) => ({
            id: v.id,
            assetId: v.assetId,
            title: v.title,
          }))}
        />
      ) : (
        <p className="sail-notice">
          Photo setup is pending. The isolated database needs migration 028
          before uploading.
        </p>
      )}
    </main>
  );
}
