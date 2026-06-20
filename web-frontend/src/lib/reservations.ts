import { useEffect, useState } from 'react';

export type ReservationStatus = 'CONFIRMED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';

export type TimedReservation = {
  status: ReservationStatus;
  endTime?: string | Date | null;
};

export function parseReservationEnd(endTime?: string | Date | null): Date | null {
  if (!endTime) return null;
  const end = endTime instanceof Date ? endTime : new Date(endTime);
  return Number.isNaN(end.getTime()) ? null : end;
}

export function isReservationLive(reservation: TimedReservation, now = new Date()): boolean {
  const end = parseReservationEnd(reservation.endTime);
  return reservation.status === 'CONFIRMED' && !!end && end > now;
}

export function getReservationEffectiveStatus(
  reservation: TimedReservation,
  now = new Date()
): ReservationStatus {
  if (reservation.status === 'CONFIRMED' && !isReservationLive(reservation, now)) {
    return 'EXPIRED';
  }
  return reservation.status;
}

export function useReservationClock(reservations: TimedReservation[]): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const nextExpiryMs = reservations
      .filter(reservation => reservation.status === 'CONFIRMED')
      .map(reservation => parseReservationEnd(reservation.endTime))
      .filter((end): end is Date => !!end && end > now)
      .reduce<number | null>((next, end) => {
        const ms = end.getTime() - now.getTime();
        return next == null ? ms : Math.min(next, ms);
      }, null);

    if (nextExpiryMs == null) return;

    const delay = Math.min(Math.max(nextExpiryMs + 250, 250), 60_000);
    const timer = window.setTimeout(() => setNow(new Date()), delay);
    return () => window.clearTimeout(timer);
  }, [reservations, now]);

  return now;
}
