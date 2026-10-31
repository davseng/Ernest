import Image from "next/image";
import type { PublicSailPhoto } from "@/data/sail-photo-store";
export function SailPhotoGallery({ photos }: { photos: PublicSailPhoto[] }) {
  return (
    <div className="sail-photo-grid">
      {photos.map((p) => (
        <figure key={p.id}>
          <a
            href={`/sail/media/${p.id}`}
            target="_blank"
            rel="noreferrer"
            aria-label={`View full photo: ${p.caption}`}
          >
            <Image
              unoptimized
              src={`/sail/media/${p.id}`}
              alt={p.altText}
              width={p.width ?? 1200}
              height={p.height ?? 800}
              loading="lazy"
            />
          </a>
          <figcaption>{p.caption}</figcaption>
        </figure>
      ))}
    </div>
  );
}
