import { CountUp } from "./CountUp";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Expand,
  Star,
} from "lucide-react";
import Modal from "./Modal";
import {
  sortReviewsPhotosFirst,
  useReviewsData,
  type Review,
} from "../lib/reviews";
import "./reviews.css";

type OpenedReview = {
  review: Review;
  kind: "text" | "photo";
  photoIndex: number;
};
const batchSize = 9;
const reviewPlural = new Intl.PluralRules("ru");
function reviewWord(count: number) {
  const form = reviewPlural.select(count);
  return form === "one" ? "отзыв" : form === "few" ? "отзыва" : "отзывов";
}
const dateFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Moscow",
});
function Stars({ rating }: { rating: number }) {
  return (
    <span
      className="review-stars"
      role="img"
      aria-label={`Оценка ${rating} из 5`}
    >
      {Array.from({ length: 5 }, (_, index) => (
        <Star
          key={index}
          size={14}
          fill={index < rating ? "currentColor" : "none"}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}
export default function Reviews({
  variant = "full",
  headingLevel = 2,
}: {
  variant?: "preview" | "full";
  headingLevel?: 1 | 2;
}) {
  const reviewData = useReviewsData();
  const reviews = useMemo(
    () => sortReviewsPhotosFirst(reviewData.reviews),
    [reviewData.reviews],
  );
  const preview = variant === "preview";
  const Heading = headingLevel === 1 ? "h1" : "h2";
  const AuthorHeading = headingLevel === 1 ? "h2" : "h3";
  const id = useId();
  const titleId = `${id}-title`;
  const gridId = `${id}-grid`;
  const sentinel = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(batchSize);
  const displayedCount = preview ? 3 : visibleCount;
  const [opened, setOpened] = useState<OpenedReview | null>(null);
  const [failedPhotos, setFailedPhotos] = useState<Set<string>>(
    () => new Set(),
  );
  const remaining = Math.max(0, reviews.length - visibleCount);
  const nextBatchCount = Math.min(batchSize, remaining);

  useEffect(() => {
    const end = sentinel.current;
    if (
      !end ||
      preview ||
      opened ||
      visibleCount >= reviews.length ||
      typeof IntersectionObserver === "undefined"
    )
      return;
    let hasScrolled = false;
    let reachedEnd = false;
    let appended = false;
    let previousY = window.scrollY;
    function appendAtEnd() {
      if (!hasScrolled || !reachedEnd || appended) return;
      appended = true;
      setVisibleCount((current) =>
        Math.min(current + batchSize, reviews.length),
      );
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        reachedEnd = entry.isIntersecting;
        appendAtEnd();
      },
      { rootMargin: "0px 0px 100px 0px" },
    );
    observer.observe(end);
    function onScroll() {
      const currentY = window.scrollY;
      if (currentY > previousY + 3) {
        hasScrolled = true;
        // Measure again so a pending observer callback cannot append a second batch.
        const rect = end!.getBoundingClientRect();
        reachedEnd = rect.top <= window.innerHeight + 100 && rect.bottom >= 0;
        appendAtEnd();
      }
      previousY = currentY;
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, [visibleCount, opened, preview, reviews.length]);

  useEffect(() => {
    if (opened?.kind !== "photo") return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const direction = event.key === "ArrowRight" ? 1 : -1;
      setOpened((current) =>
        current
          ? {
              ...current,
              photoIndex: Math.max(
                0,
                Math.min(
                  (current.review.photos?.length || 1) - 1,
                  current.photoIndex + direction,
                ),
              ),
            }
          : current,
      );
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [opened?.kind]);

  function photoFailed(src: string) {
    setFailedPhotos((current) => new Set(current).add(src));
  }
  function movePhoto(direction: number) {
    setOpened((current) =>
      current
        ? {
            ...current,
            photoIndex: Math.max(
              0,
              Math.min(
                (current.review.photos?.length || 1) - 1,
                current.photoIndex + direction,
              ),
            ),
          }
        : current,
    );
  }
  const activePhoto =
    opened?.kind === "photo"
      ? opened.review.photos?.[opened.photoIndex]
      : undefined;

  return (
    <section
      className={`client-reviews client-reviews-${variant}`}
      aria-labelledby={titleId}
    >
      <div className="reviews-heading">
        <div>
          <Heading id={titleId}>Отзывы клиентов</Heading>
          <p className="reviews-intro">
            Отзывы и фотографии наших клиентов из Яндекс Карт.
          </p>
        </div>
        <a
          className="reviews-heading-source"
          href={reviewData.sourceUrl}
          target="_blank"
          rel="noreferrer"
        >
          Яндекс Карты <ArrowUpRight size={18} aria-hidden="true" />
        </a>
      </div>
      <div
        className="reviews-stats"
        aria-label="Опыт компании и оценки клиентов"
      >
        <div className="reviews-stats-context">
          <span className="eyebrow">Доверие в цифрах</span>
          <a href={reviewData.sourceUrl} target="_blank" rel="noreferrer">
            Оценки из Яндекс Карт <ArrowUpRight size={16} aria-hidden="true" />
          </a>
        </div>
        <dl>
          <div>
            <dt>Средняя оценка</dt>
            <dd>
              <CountUp value={reviewData.rating} decimals={1} />{" "}
              <Star size={24} fill="currentColor" aria-hidden="true" />
            </dd>
          </div>
          <div>
            <dt>Оценок клиентов</dt>
            <dd><CountUp value={reviewData.ratingCount} /></dd>
          </div>
          <div>
            <dt>Отзывов</dt>
            <dd><CountUp value={reviewData.reviewCount} /></dd>
          </div>
          <div>
            <dt>
              <a
                href={reviewData.businessExperience.sourceUrl}
                target="_blank"
                rel="noreferrer"
                aria-label="Опыт компании: источник на vip2d.ru"
              >
                Лет опыта <ArrowUpRight size={12} aria-hidden="true" />
              </a>
            </dt>
            <dd>
              <CountUp
                value={reviewData.businessExperience.years}
                suffix={reviewData.businessExperience.isMinimum ? "+" : ""}
              />
            </dd>
          </div>
        </dl>
      </div>
      <ul className="reviews-grid" id={gridId} aria-label="Отзывы клиентов">
        {reviews.slice(0, displayedCount).map((review, index) => {
          const photos = (review.photos || [])
            .map((photo, photoIndex) => ({ ...photo, photoIndex }))
            .filter((photo) => !failedPhotos.has(photo.src));
          return (
            <li
              className={`review-card ${photos.length ? "review-card-with-photo" : "review-card-without-photo"}`}
              key={review.id}
              aria-label={`Отзыв ${index + 1} из ${reviews.length}`}
            >
              <div className="review-author">
                <div>
                  <AuthorHeading>{review.author}</AuthorHeading>
                  <time dateTime={review.date}>
                    {dateFormat.format(new Date(review.date))}
                  </time>
                </div>
                <Stars rating={review.rating} />
              </div>
              <blockquote>{review.excerpt}</blockquote>
              {photos.length > 0 && (
                <div
                  className={`review-photos ${photos.length > 1 ? "review-photos-multiple" : ""}`}
                >
                  {photos.slice(0, 2).map((photo, photoPosition) => (
                    <button
                      className="review-work-photo"
                      key={photo.src}
                      type="button"
                      onClick={() =>
                        setOpened({
                          review,
                          kind: "photo",
                          photoIndex: photo.photoIndex,
                        })
                      }
                      aria-label={`Открыть фото ${photo.photoIndex + 1} из отзыва: ${review.author}`}
                    >
                      <img
                        src={photo.src}
                        alt={`Фото работы из отзыва ${review.author}`}
                        width={photo.width || 600}
                        height={photo.height || 400}
                        loading="lazy"
                        decoding="async"
                        onError={() => photoFailed(photo.src)}
                      />
                      <span className="review-photo-control" aria-hidden="true">
                        {photoPosition === 1 && photos.length > 2 ? (
                          `+${photos.length - 2}`
                        ) : (
                          <Expand size={16} />
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <div className="review-actions">
                <button
                  className="review-read"
                  type="button"
                  onClick={() =>
                    setOpened({ review, kind: "text", photoIndex: 0 })
                  }
                  aria-label={`Читать отзыв: ${review.author}`}
                >
                  Читать отзыв <ArrowRight size={16} aria-hidden="true" />
                </button>
                <a
                  className="review-source"
                  href={review.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Отзыв: ${review.author}, на Яндекс Картах. Открыть в новой вкладке`}
                >
                  Яндекс Карты <ArrowUpRight size={14} aria-hidden="true" />
                </a>
              </div>
            </li>
          );
        })}
      </ul>
      {!preview && (
        <div className="reviews-sentinel" ref={sentinel} aria-hidden="true" />
      )}
      <div className="reviews-footer">
        {preview ? (
          <Link className="reviews-preview-all" to="/projects">
            Все отзывы <ArrowRight size={17} aria-hidden="true" />
          </Link>
        ) : (
          <>
            <p
              className="reviews-origin"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              Показано {Math.min(visibleCount, reviews.length)} из{" "}
              {reviews.length} отзывов
            </p>
            {remaining > 0 ? (
              <button
                className="reviews-load-more"
                type="button"
                onClick={() =>
                  setVisibleCount((current) =>
                    Math.min(current + batchSize, reviews.length),
                  )
                }
                aria-controls={gridId}
              >
                Показать ещё {nextBatchCount} {reviewWord(nextBatchCount)}{" "}
                <ArrowDown size={17} aria-hidden="true" />
              </button>
            ) : (
              <a
                className="reviews-all-source"
                href={reviewData.sourceUrl}
                target="_blank"
                rel="noreferrer"
              >
                Все отзывы на Яндекс Картах{" "}
                <ArrowUpRight size={16} aria-hidden="true" />
              </a>
            )}
          </>
        )}
      </div>
      <Modal
        open={opened !== null}
        onClose={() => setOpened(null)}
        title={
          opened
            ? `${opened.kind === "photo" ? "Фото из отзыва" : "Отзыв"}: ${opened.review.author}`
            : "Отзыв клиента"
        }
        className={
          opened?.kind === "photo" ? "review-photo-dialog" : "review-dialog"
        }
      >
        {opened?.kind === "photo" && activePhoto ? (
          <figure className="review-photo-expanded">
            {!failedPhotos.has(activePhoto.src) ? (
              <img
                src={activePhoto.src}
                alt={`Фото ${opened.photoIndex + 1} из отзыва ${opened.review.author}`}
                width={activePhoto.width || 900}
                height={activePhoto.height || 600}
                onError={() => photoFailed(activePhoto.src)}
              />
            ) : (
              <p className="review-photo-unavailable">
                Фотография недоступна. Её можно посмотреть в оригинальном
                отзыве.
              </p>
            )}
            <figcaption>
              <div>
                <strong>Фото из отзыва {opened.review.author}</strong>
                <a
                  href={opened.review.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Открыть отзыв на Яндекс Картах{" "}
                  <ArrowUpRight size={16} aria-hidden="true" />
                </a>
              </div>
              {(opened.review.photos?.length || 0) > 1 && (
                <div className="review-gallery-navigation">
                  <span aria-live="polite" aria-atomic="true">
                    {opened.photoIndex + 1} / {opened.review.photos?.length}
                  </span>
                  <button
                    className="icon-button"
                    type="button"
                    disabled={opened.photoIndex === 0}
                    onClick={() => movePhoto(-1)}
                    aria-label="Предыдущее фото"
                  >
                    <ArrowLeft size={20} />
                  </button>
                  <button
                    className="icon-button"
                    type="button"
                    disabled={
                      opened.photoIndex ===
                      (opened.review.photos?.length || 1) - 1
                    }
                    onClick={() => movePhoto(1)}
                    aria-label="Следующее фото"
                  >
                    <ArrowRight size={20} />
                  </button>
                </div>
              )}
            </figcaption>
          </figure>
        ) : opened ? (
          <div className="review-expanded">
            <p className="eyebrow">
              {opened.review.isExcerpt && !opened.review.fullText
                ? "Выдержка из отзыва"
                : "Отзыв клиента"}
            </p>
            <h2>{opened.review.author}</h2>
            <div className="review-expanded-meta">
              <Stars rating={opened.review.rating} />
              <time dateTime={opened.review.date}>
                {dateFormat.format(new Date(opened.review.date))}
              </time>
            </div>
            <blockquote>
              {opened.review.fullText || opened.review.excerpt}
            </blockquote>
            <a
              className="review-read"
              href={opened.review.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              {opened.review.isExcerpt && !opened.review.fullText
                ? "Полный отзыв на Яндекс Картах"
                : "Открыть на Яндекс Картах"}
              <ArrowUpRight size={18} aria-hidden="true" />
            </a>
          </div>
        ) : null}
      </Modal>
    </section>
  );
}
