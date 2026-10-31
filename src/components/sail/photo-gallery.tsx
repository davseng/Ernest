"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { PublicSailPhoto } from "@/data/sail-photo-store";
export function SailPhotoGallery({
  photos,
  allPhotos = photos,
  variant = "grid",
}: {
  photos: PublicSailPhoto[];
  allPhotos?: PublicSailPhoto[];
  variant?: "grid" | "collage" | "portrait" | "berths";
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    trigger = useRef<HTMLButtonElement | null>(null),
    [selected, setSelected] = useState<number | null>(null),
    [failed, setFailed] = useState(false);
  const photo = selected == null ? null : allPhotos[selected];
  const close = () => {
    dialog.current?.close();
    setSelected(null);
    setFailed(false);
    trigger.current?.focus();
  };
  const move = (direction: number) => {
    setSelected((i) =>
      i == null ? null : (i + direction + allPhotos.length) % allPhotos.length,
    );
    setFailed(false);
  };
  useEffect(() => {
    if (photo && selected != null && !dialog.current?.open)
      dialog.current?.showModal();
    if (!photo) dialog.current?.close();
  }, [selected, photo]);
  const open = selected != null && !!photo;
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);
  if (!photos.length) return null;
  return (
    <>
      <div className={`sail-photo-grid sail-photo-${variant}`}>
        {photos.map((p) => (
          <figure key={p.id}>
            <button
              type="button"
              className="sail-photo-open"
              aria-label={`View photo: ${p.caption}`}
              onClick={(e) => {
                trigger.current = e.currentTarget;
                setFailed(false);
                setSelected(
                  Math.max(
                    0,
                    allPhotos.findIndex((photo) => photo.id === p.id),
                  ),
                );
              }}
            >
              <Image
                unoptimized
                src={`/sail/media/${p.id}`}
                alt={p.altText}
                width={p.width ?? 1200}
                height={p.height ?? 800}
                loading="lazy"
              />
              <span className="sail-photo-enlarge" aria-hidden="true">
                ↗
              </span>
            </button>
            <figcaption>{p.caption}</figcaption>
          </figure>
        ))}
      </div>
      <dialog
        ref={dialog}
        className="sail-lightbox"
        aria-label="Boat photographs"
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") {
            e.preventDefault();
            move(1);
          }
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            move(-1);
          }
        }}
      >
        {photo ? (
          <div className="sail-lightbox-inner">
            <header>
              <span>
                {(selected ?? 0) + 1} / {allPhotos.length}
              </span>
              <button
                type="button"
                autoFocus
                aria-label="Close photo"
                onClick={close}
              >
                Close ×
              </button>
            </header>
            <figure>
              {failed ? (
                <p role="status">
                  This photo is no longer available. Try the next one.
                </p>
              ) : (
                <Image
                  unoptimized
                  key={photo.id}
                  src={`/sail/media/${photo.id}`}
                  alt={photo.altText}
                  width={photo.width ?? 1600}
                  height={photo.height ?? 1000}
                  onError={() => setFailed(true)}
                />
              )}
              <figcaption>{photo.caption}</figcaption>
            </figure>
            <nav aria-label="Photo navigation">
              <button
                type="button"
                disabled={allPhotos.length < 2}
                onClick={() => move(-1)}
              >
                ← Previous
              </button>
              <button
                type="button"
                disabled={allPhotos.length < 2}
                onClick={() => move(1)}
              >
                Next →
              </button>
            </nav>
          </div>
        ) : null}
      </dialog>
    </>
  );
}
