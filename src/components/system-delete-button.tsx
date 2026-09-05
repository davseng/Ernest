"use client";

export function SystemDeleteButton({ name }: { name: string }) {
  return (
    <button
      className="danger-button"
      type="submit"
      onClick={(event) => {
        if (!window.confirm(`Delete ${name} and all of its components?`)) event.preventDefault();
      }}
    >
      Delete system
    </button>
  );
}
