import type { SVGProps } from 'react';

/** Small stroke icon set (24px grid), matching the outline icons in the design. */
type P = SVGProps<SVGSVGElement> & { size?: number };
const S = ({ size = 22, children, ...p }: P & { children: React.ReactNode }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...p}>
    {children}
  </svg>
);

export const ArrowLeft = (p: P) => <S {...p}><path d="M19 12H5M11 18l-6-6 6-6" /></S>;
export const Menu = (p: P) => <S {...p}><path d="M4 7h16M4 12h16M4 17h10" /></S>;
export const Bell = (p: P) => <S {...p}><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Z" /><path d="M10 20a2 2 0 0 0 4 0" /></S>;
export const Home = (p: P) => <S {...p}><path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1v-8Z" /></S>;
export const Truck = (p: P) => <S {...p}><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7" /><circle cx="7" cy="17.5" r="1.8" /><circle cx="17" cy="17.5" r="1.8" /></S>;
export const Clock = (p: P) => <S {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></S>;
export const User = (p: P) => <S {...p}><circle cx="12" cy="8" r="3.8" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" /></S>;
export const Eye = (p: P) => <S {...p}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></S>;
export const EyeOff = (p: P) => <S {...p}><path d="M3 3l18 18M10.6 5.6A9.7 9.7 0 0 1 12 5.5C18 5.5 21.5 12 21.5 12a17 17 0 0 1-3 3.9M6.5 7.3A16.5 16.5 0 0 0 2.5 12S6 18.5 12 18.5a9.6 9.6 0 0 0 4.2-.9" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></S>;
export const Pin = (p: P) => <S {...p}><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 1 1 13 0c0 5.4-6.5 11-6.5 11Z" /><circle cx="12" cy="10" r="2.4" /></S>;
export const Phone = (p: P) => <S {...p}><path d="M5 4h3.5l1.6 4-2.2 1.4a10.5 10.5 0 0 0 5.7 5.7l1.4-2.2 4 1.6V18a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2Z" /></S>;
export const Cash = (p: P) => <S {...p}><rect x="3" y="6.5" width="18" height="11" rx="2" /><circle cx="12" cy="12" r="2.6" /><path d="M6.5 9.5v5M17.5 9.5v5" /></S>;
export const Box = (p: P) => <S {...p}><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" /><path d="m4 7.5 8 4.5 8-4.5M12 12v9" /></S>;
export const Check = (p: P) => <S {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></S>;
export const X = (p: P) => <S {...p}><path d="M6 6l12 12M18 6 6 18" /></S>;
export const Navigate = (p: P) => <S {...p}><path d="m3.5 11 17-7.5-7.5 17-2-7.5-7.5-2Z" /></S>;
export const Chevron = (p: P) => <S {...p}><path d="m9 6 6 6-6 6" /></S>;
export const Logout = (p: P) => <S {...p}><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l4-4-4-4M14 12H4" /></S>;
export const Wallet = (p: P) => <S {...p}><path d="M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a1 1 0 0 1-1-1V7Z" /><path d="M4 7l11-3v3M16 13.5h2" /></S>;
export const Star = (p: P) => <S {...p}><path d="m12 4 2.4 5 5.4.6-4 3.7 1.1 5.3L12 16l-4.9 2.6 1.1-5.3-4-3.7L9.6 9 12 4Z" /></S>;
export const Store = (p: P) => <S {...p}><path d="M4 9.5 5.5 4h13L20 9.5a2.8 2.8 0 0 1-5.3 1 2.8 2.8 0 0 1-5.4 0 2.8 2.8 0 0 1-5.3-1Z" /><path d="M5.5 12v8h13v-8M10 20v-5h4v5" /></S>;
export const Alert = (p: P) => <S {...p}><path d="M12 4 2.8 19.5h18.4L12 4Z" /><path d="M12 10v4M12 17h.01" /></S>;
export const Camera = (p: P) => <S {...p}><path d="M4 8h3l1.5-2.5h7L17 8h3v11H4V8Z" /><circle cx="12" cy="13" r="3.4" /></S>;
export const Gift = (p: P) => <S {...p}><rect x="4" y="9" width="16" height="11" rx="1" /><path d="M3 9h18v-2H3v2ZM12 7v13M12 7s-1.5-4-4-3.2S9.5 7 12 7Zm0 0s1.5-4 4-3.2S14.5 7 12 7Z" /></S>;
export const Return = (p: P) => <S {...p}><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></S>;
export const CancelIco = (p: P) => <S {...p}><rect x="2.5" y="8" width="11" height="8" rx="1" /><path d="M13.5 10h4l3 3v3h-7" /><path d="m16 3 4 4M20 3l-4 4" /></S>;
export const Deliver = (p: P) => <S {...p}><rect x="4" y="9" width="10" height="8" rx="1" /><path d="M14 11h3.5l2.5 2.5V17h-6" /><circle cx="8" cy="18" r="1.5" /><circle cx="17" cy="18" r="1.5" /><path d="M9 3.5h6M12 3.5v3" /></S>;
export const Chat = (p: P) => <S {...p}><path d="M4 5.5h16v10H9l-5 4v-14Z" /><path d="M8 9.5h8M8 12.5h5" /></S>;
export const Send = (p: P) => <S {...p}><path d="m4 12 16-8-6 16-2.5-6.5L4 12Z" /><path d="m11.5 13.5 3-3" /></S>;
export const Locate = (p: P) => <S {...p}><circle cx="12" cy="12" r="6.5" /><circle cx="12" cy="12" r="2" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" /></S>;
export const Calendar = (p: P) => <S {...p}><rect x="4" y="5.5" width="16" height="14" rx="2" /><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" /></S>;
