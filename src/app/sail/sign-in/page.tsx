import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Owner sign-in",
  robots: { index: false, follow: false },
};
export default async function SailSignInPage() {
  if ((await auth())?.user?.id) redirect("/sail/manage");
  return (
    <main id="sail-main" className="sail-main sail-narrow">
      <p className="sail-kicker">Owner workspace</p>
      <h1>Welcome back.</h1>
      <p>
        Sign in to plan voyages and manage invitations. Crew and passengers can
        use the private link in their invitation email.
      </p>
      <form
        className="sail-form"
        action={async (formData) => {
          "use server";
          await signIn("nodemailer", {
            email: String(formData.get("email") ?? ""),
            redirectTo: "/sail/manage",
          });
        }}
      >
        <label>
          Email
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <button className="sail-button">Email me a sign-in link</button>
      </form>
    </main>
  );
}
