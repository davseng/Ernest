"use client";

export function ComponentDeleteButton({ name }: { name: string }) {
  return (
    <button
      className="danger-button"
      type="submit"
      onClick={(event) => {
        if (!window.confirm(`Delete ${name}?`)) event.preventDefault();
      }}
    >
      Delete component
    </button>
  );
}
