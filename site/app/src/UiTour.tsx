import { useId, useState, type CSSProperties } from 'react';

// Interactive tour of a real battle capture. Each stop names an area of the
// screenshot in capture pixels; the active area is outlined and the rest dims.
export type TourStop = { title: string; body: string; keys?: string; area: [number, number, number, number] };

type Props = { src: string; alt: string; width: number; height: number; stops: TourStop[] };

export default function UiTour({ src, alt, width, height, stops }: Props) {
  const [active, setActive] = useState(0);
  const base = useId();
  const [x, y, w, h] = stops[active].area;
  const box = {
    '--x': `${(x / width) * 100}%`,
    '--y': `${(y / height) * 100}%`,
    '--w': `${(w / width) * 100}%`,
    '--h': `${(h / height) * 100}%`
  } as CSSProperties;

  return (
    <div className="tour tour--live">
      <figure className="frame tour__shot">
        <div className="tour__stage">
          <img src={src} alt={alt} width={width} height={height} loading="lazy" />
          <span className="tour__focus" style={box} aria-hidden="true">
            <span className="tour__corner" />
          </span>
        </div>
      </figure>
      <ol className="tour__list" role="tablist" aria-orientation="vertical" aria-label="Parts of the battle interface">
        {stops.map((stop, i) => {
          const on = i === active;
          return (
            <li key={stop.title} role="presentation">
              <button
                type="button"
                role="tab"
                id={`${base}-t${i}`}
                aria-selected={on}
                aria-controls={`${base}-p${i}`}
                tabIndex={on ? 0 : -1}
                className="tour__stop"
                onClick={() => setActive(i)}
                onPointerEnter={(e) => e.pointerType === 'mouse' && setActive(i)}
                onFocus={() => setActive(i)}
                onKeyDown={(e) => {
                  const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
                  if (!step) return;
                  e.preventDefault();
                  const next = (i + step + stops.length) % stops.length;
                  document.getElementById(`${base}-t${next}`)?.focus();
                }}
              >
                <span className="tour__title">{stop.title}</span>
                {stop.keys && <kbd>{stop.keys}</kbd>}
              </button>
              <p id={`${base}-p${i}`} role="tabpanel" aria-labelledby={`${base}-t${i}`} className="tour__body" hidden={!on}>
                {stop.body}
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
