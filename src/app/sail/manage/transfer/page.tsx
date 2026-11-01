import Link from "next/link";
import { sailOwnerContext } from "../context";
import { SailContentTransfer } from "@/components/sail/content-transfer";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Content transfer",
  robots: { index: false, follow: false },
};
export default async function TransferPage() {
  const { assets } = await sailOwnerContext();
  return (
    <main id="sail-main" className="sail-main sail-narrow">
      <p>
        <Link href="/sail/manage">← Owner workspace</Link>
      </p>
      <h1>Move your Sail content</h1>
      <p>
        You’re on{" "}
        <strong>
          {process.env.VERCEL_ENV === "production"
            ? "Production"
            : "Preview / development"}
        </strong>
        . Choose the vessel you want to copy from or into.
      </p>
      <SailContentTransfer
        assets={assets.map((a) => ({ id: a.id, name: a.name }))}
      />
    </main>
  );
}
