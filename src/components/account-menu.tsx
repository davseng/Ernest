import { signOut } from "@/auth";

export function AccountMenu({ email, compact = false }: { email?: string | null; compact?: boolean }) {
  if (compact) {
    return (
      <details className="account-popover">
        <summary aria-label="Account" title="Account">●</summary>
        <div className="account-popover-panel">
          {email ? <span>{email}</span> : null}
          <form action={async () => {
            "use server";
            await signOut({ redirectTo: "/sign-in" });
          }}>
            <button type="submit">Sign out</button>
          </form>
        </div>
      </details>
    );
  }

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
