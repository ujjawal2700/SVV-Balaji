/**
 * Flat illustrations in the style of the supplied onboarding art (warm
 * oranges, soft blob background). Drawn inline so the app ships no image
 * assets for them and they stay crisp on any screen.
 */

export function HandoverArt() {
  return (
    <svg viewBox="0 0 320 240" width="100%" style={{ maxWidth: 320 }} aria-hidden>
      <ellipse cx="150" cy="120" rx="130" ry="100" fill="#fff3e3" />
      <path d="M30 206h260" stroke="#2e2e38" strokeWidth="2" />
      {/* door */}
      <rect x="196" y="40" width="70" height="166" rx="4" fill="#1f5a5c" />
      <rect x="203" y="48" width="56" height="152" fill="#fff" />
      <path d="M203 48 244 60v148l-41-8Z" fill="#2a7174" />
      <circle cx="238" cy="130" r="2.5" fill="#f4c35a" />
      {/* plant */}
      <path d="M282 206v-30" stroke="#2e7d4f" strokeWidth="3" />
      <path d="M282 180c-14-6-18-22-10-30 8 8 12 20 10 30Zm0-6c12-8 22-6 24 2-10 4-18 2-24-2Z" fill="#3aa36b" />
      <path d="M270 190h24l-3 16h-18Z" fill="#e2453b" />
      {/* boxes */}
      <rect x="40" y="170" width="34" height="36" rx="2" fill="#f0a24b" />
      <rect x="46" y="140" width="28" height="30" rx="2" fill="#f7b867" />
      <path d="M57 140v30M40 188h34" stroke="#d98a2e" strokeWidth="1.5" />
      {/* courier */}
      <circle cx="110" cy="72" r="11" fill="#f2c5a0" />
      <path d="M98 68c2-9 22-10 24 0Z" fill="#e2453b" />
      <path d="M96 88h28l6 50h-40Z" fill="#ff8a00" />
      <rect x="96" y="104" width="40" height="30" rx="2" fill="#f2a654" />
      <path d="M100 138h14l-2 66h-10ZM116 138h14l4 66h-10Z" fill="#23232d" />
      <path d="M130 110l24 6" stroke="#f2c5a0" strokeWidth="6" strokeLinecap="round" />
      {/* customer */}
      <circle cx="176" cy="76" r="10" fill="#8a5a3c" />
      <path d="M166 74c0-12 20-12 20 0 3 8-3 14-10 14s-13-6-10-14Z" fill="#2b2017" />
      <path d="M166 92h22l8 62h-38Z" fill="#f4c35a" />
      <path d="M170 154h8l-2 50h-8ZM182 154h8l2 50h-8Z" fill="#8a5a3c" />
      <path d="M168 104l-12 10" stroke="#8a5a3c" strokeWidth="6" strokeLinecap="round" />
      <rect x="150" y="110" width="12" height="8" rx="1" fill="#6fbf73" />
      {/* paper plane */}
      <path d="m30 60 22-8-9 20-3-7Z" fill="#fff" stroke="#2e2e38" strokeWidth="1.2" />
    </svg>
  );
}

export function RouteArt() {
  return (
    <svg viewBox="0 0 320 240" width="100%" style={{ maxWidth: 320 }} aria-hidden>
      <ellipse cx="160" cy="120" rx="130" ry="100" fill="#fff3e3" />
      <path d="M50 190c40-60 90 10 130-50s70-30 90-80" stroke="#ff8a00" strokeWidth="4" strokeDasharray="2 10" strokeLinecap="round" fill="none" />
      <circle cx="50" cy="190" r="10" fill="#23232d" />
      <circle cx="50" cy="190" r="4" fill="#fff" />
      <path d="M270 58c0 16-18 34-18 34s-18-18-18-34a18 18 0 0 1 36 0Z" fill="#e2453b" />
      <circle cx="252" cy="58" r="6" fill="#fff" />
      <rect x="120" y="120" width="70" height="44" rx="10" fill="#ff8a00" />
      <circle cx="136" cy="170" r="10" fill="#23232d" />
      <circle cx="176" cy="170" r="10" fill="#23232d" />
      <rect x="132" y="102" width="30" height="22" rx="3" fill="#f7b867" />
      <path d="M150 135h26" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function EarnArt() {
  return (
    <svg viewBox="0 0 320 240" width="100%" style={{ maxWidth: 320 }} aria-hidden>
      <ellipse cx="160" cy="120" rx="130" ry="100" fill="#fff3e3" />
      <rect x="92" y="70" width="136" height="110" rx="16" fill="#fff" stroke="#23232d" strokeWidth="2" />
      <rect x="108" y="92" width="104" height="14" rx="7" fill="#ffe2bf" />
      <rect x="108" y="116" width="70" height="10" rx="5" fill="#ececf0" />
      <rect x="108" y="134" width="84" height="10" rx="5" fill="#ececf0" />
      <circle cx="232" cy="176" r="30" fill="#ff8a00" />
      <text x="232" y="186" textAnchor="middle" fontSize="28" fontWeight="700" fill="#fff" fontFamily="Poppins, sans-serif">₹</text>
      <circle cx="84" cy="178" r="18" fill="#22b573" />
      <path d="m76 178 6 6 11-12" stroke="#fff" strokeWidth="3.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/** Stylised street map for the location screen before a real position is known. */
export function MapArt() {
  return (
    <svg viewBox="0 0 320 180" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <rect width="320" height="180" fill="#ededed" />
      <g stroke="#fff" strokeWidth="14" fill="none" strokeLinecap="round">
        <path d="M-10 60 C80 40 160 120 330 90" />
        <path d="M60 -10 C90 60 70 120 110 190" />
        <path d="M200 -10 C230 70 190 130 250 190" />
      </g>
      <g stroke="#fff" strokeWidth="6" fill="none">
        <path d="M-10 140 H330" />
        <path d="M150 -10 V190" />
      </g>
      <circle cx="170" cy="88" r="30" fill="#ff8a00" opacity="0.18" />
      <circle cx="160" cy="92" r="6" fill="#ff8a00" />
      <path d="M180 56c0 12-12 26-12 26s-12-14-12-26a12 12 0 0 1 24 0Z" fill="#e2453b" />
      <circle cx="168" cy="56" r="4" fill="#fff" />
    </svg>
  );
}

/** Rider on a scooter with a delivery box - the "reject order" pop-up. */
export function ScooterArt({ size = 150 }: { size?: number }) {
  return (
    <svg viewBox="0 0 200 150" width={size} aria-hidden>
      <ellipse cx="100" cy="80" rx="80" ry="62" fill="#fff3e3" />
      <path d="M22 132h156" stroke="#e6e0d8" strokeWidth="2" strokeLinecap="round" />
      {/* box */}
      <rect x="44" y="52" width="40" height="36" rx="4" fill="#ff8a00" />
      <path d="M44 64h40M64 52v12" stroke="#ef7d00" strokeWidth="2" />
      {/* scooter body */}
      <path d="M40 104c0-10 8-16 20-16h40l14 8h22l10-26h10l-14 36c-2 6-6 8-12 8H56c-9 0-16-4-16-10Z" fill="#ff8a00" />
      <path d="M146 70l6-12" stroke="#23232d" strokeWidth="4" strokeLinecap="round" />
      <path d="M150 56h10" stroke="#23232d" strokeWidth="4" strokeLinecap="round" />
      <circle cx="58" cy="118" r="14" fill="#23232d" />
      <circle cx="58" cy="118" r="6" fill="#fff" />
      <circle cx="142" cy="118" r="14" fill="#23232d" />
      <circle cx="142" cy="118" r="6" fill="#fff" />
      {/* rider */}
      <path d="M96 88l10-26c2-6 8-8 13-6l8 4-8 28Z" fill="#f4c35a" />
      <path d="M100 88h26l10 16h-10l-8-8h-18Z" fill="#23232d" />
      <path d="M120 64l18 8" stroke="#f2c5a0" strokeWidth="6" strokeLinecap="round" />
      <circle cx="118" cy="46" r="11" fill="#f2c5a0" />
      <path d="M106 45a12 12 0 0 1 24 0Z" fill="#e2453b" />
      <path d="M128 44h6" stroke="#e2453b" strokeWidth="3" strokeLinecap="round" />
      {/* speed lines */}
      <path d="M14 96h18M8 108h20M18 84h14" stroke="#f7b867" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Orange check with confetti dots - success screens (password reset). */
export function SuccessArt({ size = 170 }: { size?: number }) {
  const dots: Array<[number, number, number]> = [
    [40, 60, 4], [30, 96, 3], [52, 128, 5], [150, 44, 4], [168, 88, 5], [148, 132, 3], [100, 22, 3], [72, 36, 2.5], [128, 30, 2.5], [182, 118, 3], [20, 130, 2.5], [96, 160, 3],
  ];
  return (
    <svg viewBox="0 0 200 180" width={size} aria-hidden>
      {dots.map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} fill="#ff8a00" opacity={0.35 + (i % 3) * 0.2} />)}
      <circle cx="100" cy="90" r="46" fill="#fff" />
      <circle cx="100" cy="90" r="46" fill="none" stroke="#fff3e3" strokeWidth="10" />
      <circle cx="100" cy="90" r="34" fill="#ff8a00" />
      <path d="m84 90 11 11 22-22" stroke="#fff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}
