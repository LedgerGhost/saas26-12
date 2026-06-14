import type { CSSProperties } from 'react';

export type IconName =
  | 'map' | 'clock' | 'history' | 'chart' | 'doc' | 'download' | 'search' | 'filter'
  | 'user' | 'globe' | 'settings' | 'x' | 'check' | 'arrow-right' | 'arrow-up'
  | 'arrow-down' | 'plus' | 'minus' | 'more' | 'ext' | 'bolt' | 'card' | 'building'
  | 'key' | 'lock' | 'shield' | 'calendar' | 'chevron-down' | 'chevron-up'
  | 'chevron-right' | 'tower' | 'menu' | 'logout' | 'tag' | 'trend-up'
  | 'circle-check' | 'info' | 'star';

type Props = { name: IconName; size?: number; stroke?: number; style?: CSSProperties };

export function Icon({ name, size = 16, stroke = 1.75, style }: Props) {
  const common = {
    width: size, height: size, viewBox: '0 0 24 24',
    fill: 'none', stroke: 'currentColor', strokeWidth: stroke,
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
    style: { flexShrink: 0, ...style }
  };
  switch (name) {
    case 'map':          return <svg {...common}><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z"/><path d="M9 4v14"/><path d="M15 6v14"/></svg>;
    case 'clock':        return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>;
    case 'history':      return <svg {...common}><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 7v5l3 2"/></svg>;
    case 'chart':        return <svg {...common}><path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6"/></svg>;
    case 'doc':          return <svg {...common}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/><path d="M9 13h6"/><path d="M9 17h4"/></svg>;
    case 'download':     return <svg {...common}><path d="M12 4v12"/><path d="m7 11 5 5 5-5"/><path d="M5 20h14"/></svg>;
    case 'search':       return <svg {...common}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>;
    case 'filter':       return <svg {...common}><path d="M3 5h18l-7 9v6l-4-2v-4z"/></svg>;
    case 'user':         return <svg {...common}><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>;
    case 'globe':        return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18"/><path d="M12 3a14 14 0 0 0 0 18"/></svg>;
    case 'settings':     return <svg {...common}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3 1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></svg>;
    case 'x':            return <svg {...common}><path d="M6 6l12 12"/><path d="M18 6 6 18"/></svg>;
    case 'check':        return <svg {...common}><path d="m5 12 5 5 9-11"/></svg>;
    case 'arrow-right':  return <svg {...common}><path d="M5 12h14"/><path d="m13 5 7 7-7 7"/></svg>;
    case 'arrow-up':     return <svg {...common}><path d="M12 5v14"/><path d="m5 12 7-7 7 7"/></svg>;
    case 'arrow-down':   return <svg {...common}><path d="M12 5v14"/><path d="m5 12 7 7 7-7"/></svg>;
    case 'plus':         return <svg {...common}><path d="M12 5v14"/><path d="M5 12h14"/></svg>;
    case 'minus':        return <svg {...common}><path d="M5 12h14"/></svg>;
    case 'more':         return <svg {...common}><circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/></svg>;
    case 'ext':          return <svg {...common}><path d="M14 3h7v7"/><path d="M10 14 21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></svg>;
    case 'bolt':         return <svg {...common}><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>;
    case 'card':         return <svg {...common}><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/></svg>;
    case 'building':     return <svg {...common}><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/></svg>;
    case 'key':          return <svg {...common}><circle cx="8" cy="15" r="4"/><path d="m11 12 9-9"/><path d="m17 6 3 3"/><path d="m14 9 3 3"/></svg>;
    case 'lock':         return <svg {...common}><rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V8a4 4 0 1 1 8 0v3"/></svg>;
    case 'shield':       return <svg {...common}><path d="M12 3 4 6v6a9 9 0 0 0 8 9 9 9 0 0 0 8-9V6Z"/></svg>;
    case 'calendar':     return <svg {...common}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M8 3v4M16 3v4"/></svg>;
    case 'chevron-down': return <svg {...common}><path d="m6 9 6 6 6-6"/></svg>;
    case 'chevron-up':   return <svg {...common}><path d="m6 15 6-6 6 6"/></svg>;
    case 'chevron-right':return <svg {...common}><path d="m9 6 6 6-6 6"/></svg>;
    case 'tower':        return <svg {...common}><path d="M5 21 12 3l7 18"/><path d="M8 14h8"/><path d="M9.5 17h5"/></svg>;
    case 'menu':         return <svg {...common}><path d="M4 6h16M4 12h16M4 18h16"/></svg>;
    case 'logout':       return <svg {...common}><path d="M15 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="m10 17-5-5 5-5"/><path d="M5 12h11"/></svg>;
    case 'tag':          return <svg {...common}><path d="M3 12V4h8l10 10-8 8z"/><circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none"/></svg>;
    case 'trend-up':     return <svg {...common}><path d="m3 17 6-6 4 4 8-9"/><path d="M14 6h7v7"/></svg>;
    case 'circle-check': return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-7"/></svg>;
    case 'info':         return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M12 8h.01"/><path d="M11 12h1v5"/></svg>;
    case 'star':         return <svg {...common}><path d="m12 3 2.9 6 6.6.6-5 4.5 1.5 6.5L12 17l-6 3.6 1.5-6.5-5-4.5L9 9z"/></svg>;
    default: return null;
  }
}
