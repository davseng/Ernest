import { signOut } from "@/auth";

export function AccountMenu({ email }: { email?: string | null }) {
  return (
    <div className="account-menu">
      {email && <span>{email}</span>}
      <form action={async () => {
        "use server";
        await signOut({ redirectTo: "/sign-in" });
      }}>
        <button type="submit">Sign out</button>
      </form>
    </div>
  );
}
