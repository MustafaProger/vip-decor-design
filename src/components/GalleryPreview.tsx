import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Picture } from "./Primitives";
import "./gallery-preview.css";

/** Pointer position selects a photograph; touch and keyboard use the same controls. */
export default function GalleryPreview({
  images,
  title,
  active,
  onChange,
  href,
  children,
}: {
  images: string[];
  title: string;
  active: number;
  onChange: (index: number) => void;
  href?: string;
  children?: ReactNode;
}) {
  const target = images[active] || images[0];
  const [shown, setShown] = useState(target);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  useEffect(() => {
    if (!target || target === shown) return;
    let current = true;
    const image = new Image();
    // Keep the previous photo visible until the next one is ready.
    image.onload = () => {
      if (current) setShown(target);
    };
    image.src = target;
    return () => {
      current = false;
    };
  }, [target, shown]);
  const photo = (
    <Picture
      src={shown}
      alt={`${title} — фотография ${Math.max(0, images.indexOf(shown)) + 1}`}
    />
  );
  return (
    <div
      className={`gallery-preview ${href ? "gallery-preview-card" : "gallery-preview-detail"}`}
      onPointerMove={(event) => {
        if (
          event.pointerType !== "mouse" ||
          event.buttons ||
          images.length < 2 ||
          (event.target as HTMLElement).closest("button")
        )
          return;
        const box = event.currentTarget.getBoundingClientRect();
        onChange(
          Math.max(
            0,
            Math.min(
              images.length - 1,
              Math.floor(
                ((event.clientX - box.left) / box.width) * images.length,
              ),
            ),
          ),
        );
      }}
      onPointerLeave={(event) => {
        if (href && event.pointerType === "mouse") onChange(0);
      }}
      onTouchStart={(event) => {
        const point = event.touches[0];
        touch.current = { x: point.clientX, y: point.clientY };
        swiped.current = false;
      }}
      onTouchEnd={(event) => {
        const start = touch.current;
        touch.current = null;
        if (!start || images.length < 2) return;
        const point = event.changedTouches[0];
        const dx = point.clientX - start.x;
        if (
          Math.abs(dx) > 40 &&
          Math.abs(dx) > Math.abs(point.clientY - start.y)
        ) {
          swiped.current = true;
          onChange(
            (active + (dx < 0 ? 1 : -1) + images.length) % images.length,
          );
        }
      }}
      onClickCapture={(event) => {
        if (swiped.current) {
          event.preventDefault();
          event.stopPropagation();
          swiped.current = false;
        }
      }}
    >
      {href ? (
        <Link
          to={href}
          className="gallery-preview-photo"
          tabIndex={-1}
          aria-hidden="true"
        >
          {photo}
        </Link>
      ) : (
        <div className="gallery-preview-photo">{photo}</div>
      )}
      {children}
      {images.length > 1 && (
        <div
          className="gallery-preview-track"
          role="group"
          aria-label={`Фотографии ${title}`}
        >
          {images.map((src, index) => (
            <button
              key={src}
              type="button"
              aria-label={`Показать фото ${index + 1} — ${title}`}
              aria-pressed={active === index}
              onClick={() => onChange(index)}
              onKeyDown={(event) => {
                if (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
                  return;
                event.preventDefault();
                const next =
                  (index +
                    (event.key === "ArrowRight" ? 1 : -1) +
                    images.length) %
                  images.length;
                onChange(next);
                (
                  event.currentTarget.parentElement?.children[
                    next
                  ] as HTMLElement
                )?.focus();
              }}
            >
              <span />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
