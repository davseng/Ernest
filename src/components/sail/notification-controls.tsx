"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { sendSailUpdates } from "@/app/sail/timeline-actions";
export function SailNotificationControls() {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(false),
    router = useRouter();
  return (
    <>
      <div className="sail-actions">
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await sendSailUpdates();
              setMessage(r.message);
              setError(!r.ok);
              router.refresh();
            } catch {
              setMessage("Delivery could not be confirmed. Review the queue.");
              setError(true);
            } finally {
              setBusy(false);
            }
          }}
        >
          Send pending updates
        </button>
        <details>
          <summary>Retry failed updates</summary>
          <p>
            A previous attempt may have reached the mail provider even if its
            response was lost. Check your inbox first.
          </p>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await sendSailUpdates(true);
                setMessage(r.message);
                setError(!r.ok);
                router.refresh();
              } catch {
                setMessage(
                  "Delivery could not be confirmed. Review the queue.",
                );
                setError(true);
              } finally {
                setBusy(false);
              }
            }}
          >
            Confirm retry of failed updates
          </button>
        </details>
      </div>
      {message ? <p role={error ? "alert" : "status"}>{message}</p> : null}
    </>
  );
}
