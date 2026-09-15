import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

/** A local film: shaded cloth opens onto an interior concept. */
export default function HeroFilm() {
  const [reduced, setReduced] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(preference.matches);
    preference.addEventListener("change", change);
    return () => preference.removeEventListener("change", change);
  }, []);
  const video = useRef<HTMLVideoElement>(null);
  const frame = useRef<HTMLElement>(null);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const media = video.current;
    const surface = frame.current;
    if (!media || !surface || reduced || failed) return;
    let inView = true;
    const sync = () => {
      if (paused || !inView || document.hidden) media.pause();
      else void media.play().catch(() => setPlaying(false));
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting;
        sync();
      },
      { threshold: 0.05 },
    );
    observer.observe(surface);
    document.addEventListener("visibilitychange", sync);
    sync();
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
      media.pause();
    };
  }, [reduced, paused, failed]);
  return (
    <figure ref={frame} className="hero-film">
      <img
        src="/images/concept-living.webp"
        alt="Светлые портьеры и воздушный тюль в гостиной — визуализация оформления"
        fetchPriority="high"
      />
      {!reduced && !failed && (
        <video
          ref={video}
          muted
          loop
          playsInline
          autoPlay
          preload="metadata"
          poster="/images/concept-living.webp"
          aria-hidden="true"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onError={() => setFailed(true)}
          src="/video/curtain-reveal.mp4"
        />
      )}
      <div className="hero-film-top">
        <span>Фактура в движении</span>
        <i aria-hidden="true" />
      </div>
      <figcaption>Идея оформления · визуализация</figcaption>
      {!reduced && !failed && (
        <button
          className="hero-film-control"
          type="button"
          onClick={() => {
            if (playing) {
              setPaused(true);
              video.current?.pause();
            } else {
              setPaused(false);
              void video.current?.play().catch(() => setPlaying(false));
            }
          }}
          aria-label={playing ? "Приостановить видео" : "Воспроизвести видео"}
        >
          {playing ? <Pause size={17} /> : <Play size={17} />}
        </button>
      )}
    </figure>
  );
}
