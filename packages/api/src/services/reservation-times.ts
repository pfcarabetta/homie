/**
 * Standard reservation check-in / check-out times.
 *
 * Homie uses fixed times across all reservations regardless of source:
 *   - Check-in:  4:00 PM
 *   - Check-out: 11:00 AM
 *
 * iCal feeds, Track PMS imports, and CSV imports usually only carry a date
 * (no time-of-day) or carry a midnight timestamp. Normalizing on import keeps
 * the database consistent so downstream consumers (dispatch scheduling,
 * dashboard widgets, calendar displays) all see the same wall-clock values.
 *
 * Times are stored in UTC. The display layer formats them with
 * `timeZone: 'UTC'` so every viewer sees "4 PM" / "11 AM" regardless of their
 * local timezone.
 */

export const RESERVATION_CHECK_IN_HOUR_UTC = 16; // 4 PM
export const RESERVATION_CHECK_OUT_HOUR_UTC = 11; // 11 AM

/**
 * Returns a new Date with the time component set to 4:00 PM UTC. The day,
 * month, and year are taken from the input — useful for normalizing iCal /
 * PMS dates that come in as midnight or arbitrary times.
 */
export function applyStandardCheckInTime(d: Date): Date {
  const out = new Date(d);
  out.setUTCHours(RESERVATION_CHECK_IN_HOUR_UTC, 0, 0, 0);
  return out;
}

/**
 * Returns a new Date with the time component set to 11:00 AM UTC.
 */
export function applyStandardCheckOutTime(d: Date): Date {
  const out = new Date(d);
  out.setUTCHours(RESERVATION_CHECK_OUT_HOUR_UTC, 0, 0, 0);
  return out;
}
