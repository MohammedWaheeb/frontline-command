// React islands for the static site. Every island enhances markup that already
// works without JavaScript: it reads its content from that markup, then replaces it.
import { createRoot } from 'react-dom/client';
import DecryptedText from './reactbits/DecryptedText';
import SpotlightCard from './reactbits/SpotlightCard';
import CountUp from './reactbits/CountUp';
import UiTour, { type TourStop } from './UiTour';

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const islands = (name: string) => [...document.querySelectorAll<HTMLElement>(`[data-island="${name}"]`)];

// Headline lines decode once, like a radio intercept. Static under reduced motion.
if (!reduce) {
  for (const el of islands('decrypt')) {
    const text = el.textContent ?? '';
    createRoot(el).render(
      <DecryptedText
        text={text}
        animateOn="view"
        sequential
        revealDirection="start"
        speed={34}
        characters="ABCDEFGHJKLMNPRSTUVWXYZ0123456789"
        encryptedClassName="decrypt__noise"
      />
    );
  }
}

// Verified totals count up when the status ledger scrolls into view.
if (!reduce) {
  for (const el of islands('count')) {
    const to = Number(el.dataset.to ?? el.textContent);
    if (!Number.isFinite(to)) continue;
    createRoot(el).render(<CountUp to={to} duration={1.4} separator="," />);
  }
}

// Battle interface tour.
for (const el of islands('ui-tour')) {
  const img = el.querySelector('img');
  if (!img) continue;
  const stops: TourStop[] = [...el.querySelectorAll<HTMLElement>('[data-area]')].map((li) => ({
    title: li.querySelector('h3')?.textContent?.trim() ?? '',
    body: li.querySelector('p')?.textContent?.trim() ?? '',
    keys: li.querySelector('kbd')?.textContent?.trim() || undefined,
    area: li.dataset.area!.split(',').map(Number) as TourStop['area']
  }));
  createRoot(el).render(
    <UiTour src={img.getAttribute('src')!} alt={img.alt} width={Number(img.getAttribute('width'))} height={Number(img.getAttribute('height'))} stops={stops} />
  );
}

// Faction cells: the card keeps its link and art; React Bits adds a spotlight in the faction's paint.
for (const el of islands('spotlight')) {
  const paint = getComputedStyle(el).getPropertyValue('--paint-hi').trim() || '#e2a232';
  const inner = el.innerHTML;
  // site.js already observed the original node for its reveal, so the replacement starts revealed.
  const className = `${el.className} is-in`;
  const faction = el.dataset.faction;
  const holder = document.createElement('div');
  holder.className = 'fcell-host';
  el.replaceWith(holder);
  createRoot(holder).render(
    <SpotlightCard
      className={className}
      data-faction={faction}
      spotlightColor={paint}
      intensity={0.22}
      spotlightSize={320}
      borderGlow={0.8}
      proximity={60}
    >
      <div className="fcell__inner" dangerouslySetInnerHTML={{ __html: inner }} />
    </SpotlightCard>
  );
}
