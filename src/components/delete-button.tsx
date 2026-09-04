"use client";

export function DeleteButton({ label, confirmation }: { label: string; confirmation: string }) {
  return <button className="danger-button" type="submit" onClick={(event) => {
    if (!window.confirm(confirmation)) event.preventDefault();
  }}>{label}</button>;
}
