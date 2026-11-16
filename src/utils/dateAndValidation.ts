import {
  BookingAvailabilityState,
  EventPaymentMode,
  FitnessLevel,
  PaymentStatus,
  Registration,
  SportEvent,
  VALIDATION_LIMITS,
} from '../types';

export function getEventCoachNames(
  event: Pick<SportEvent, 'coachName' | 'coachNames'>
): string[] {
  if (Array.isArray(event.coachNames) && event.coachNames.length > 0) {
    const cleaned = event.coachNames
      .map((name) => name.trim())
      .filter(Boolean);
    if (cleaned.length > 0) return cleaned;
  }
  const split = (event.coachName || '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  return split.length > 0 ? split : [];
}

export function formatEventCoachesLabel(
  event: Pick<SportEvent, 'coachName' | 'coachNames'>
): string {
  const names = getEventCoachNames(event);
  if (names.length === 0) return 'Coach';
  if (names.length === 1) return `Coach ${names[0]}`;
  return `Coachs : ${names.join(', ')}`;
}

export function getRegistrationEndMs(
  reg: Registration,
  matchedEvent?: SportEvent | null
): number {
  if (matchedEvent) {
    return (
      matchedEvent.startAt.toMillis() +
      matchedEvent.durationMinutes * 60 * 1000
    );
  }
  if (reg.eventEndAt) {
    return reg.eventEndAt.toMillis();
  }
  if (
    typeof reg.eventDurationMinutes === 'number' &&
    reg.eventDurationMinutes > 0
  ) {
    return reg.eventStartAt.toMillis() + reg.eventDurationMinutes * 60 * 1000;
  }
  return reg.eventStartAt.toMillis();
}

export interface BookingEvaluation {
  state: BookingAvailabilityState;
  isAutoCancelledNoRegistrants: boolean;
  isUnlimited: boolean;
  remainingSpots: number | null;
  startMs: number;
  endMs: number;
  cutoffMs: number;
  msUntilCutoff: number;
  msUntilStart: number;
  statusLabel: string;
  helperText: string;
  capacityLabel: string;
}

export function evaluateEventBooking(
  event: SportEvent,
  nowMs: number = Date.now(),
  options?: { hideRegisteredCount?: boolean }
): BookingEvaluation {
  const hideRegisteredCount = Boolean(options?.hideRegisteredCount);
  const startMs = event.startAt.toMillis();
  const endMs = startMs + event.durationMinutes * 60 * 1000;
  const cutoffMs = startMs - VALIDATION_LIMITS.BOOKING_CUTOFF_MS;
  const msUntilCutoff = cutoffMs - nowMs;
  const msUntilStart = startMs - nowMs;
  const isUnlimited = Boolean(event.isUnlimitedCapacity);
  const remainingSpots = isUnlimited
    ? null
    : Math.max(0, event.maxCapacity - event.registeredCount);

  const isAutoCancelledNoRegistrants =
    event.registeredCount === 0 &&
    nowMs >= cutoffMs &&
    (event.status === 'published' ||
      event.cancelReason === 'no_registrants' ||
      event.cancelReason !== 'manual');

  const capacityLabel = hideRegisteredCount
    ? isUnlimited
      ? 'Places illimitées'
      : isAutoCancelledNoRegistrants || event.status === 'cancelled'
        ? 'Séance annulée'
        : (remainingSpots ?? 0) <= 0
          ? 'Séance complète'
          : nowMs >= startMs || nowMs >= cutoffMs
            ? 'Places limitées'
            : 'Places disponibles'
    : isUnlimited
      ? `${event.registeredCount} inscrit${event.registeredCount > 1 ? 's' : ''} · Places illimitées`
      : `${event.registeredCount}/${event.maxCapacity} inscrits · ${remainingSpots} place${(remainingSpots ?? 0) > 1 ? 's' : ''} restante${(remainingSpots ?? 0) > 1 ? 's' : ''}`;

  if (isAutoCancelledNoRegistrants) {
    return {
      state: 'cancelled',
      isAutoCancelledNoRegistrants: true,
      isUnlimited,
      remainingSpots,
      startMs,
      endMs,
      cutoffMs,
      msUntilCutoff,
      msUntilStart,
      statusLabel: hideRegisteredCount ? 'Annulé' : 'Annulé (0 inscrit)',
      helperText: hideRegisteredCount
        ? 'Cet événement a été automatiquement annulé 1 heure avant le début.'
        : 'Événement annulé automatiquement : aucun inscrit 1 heure avant le début.',
      capacityLabel,
    };
  }

  if (event.status === 'cancelled') {
    return {
      state: 'cancelled',
      isAutoCancelledNoRegistrants: false,
      isUnlimited,
      remainingSpots,
      startMs,
      endMs,
      cutoffMs,
      msUntilCutoff,
      msUntilStart,
      statusLabel: 'Annulé',
      helperText: 'Cette séance a été annulée par le coach.',
      capacityLabel,
    };
  }

  if (nowMs >= startMs) {
    return {
      state: 'past',
      isAutoCancelledNoRegistrants: false,
      isUnlimited,
      remainingSpots,
      startMs,
      endMs,
      cutoffMs,
      msUntilCutoff,
      msUntilStart,
      statusLabel: nowMs < endMs ? 'En cours' : 'Terminée',
      helperText:
        nowMs < endMs
          ? 'La séance est actuellement en cours.'
          : 'Cette séance est terminée.',
      capacityLabel,
    };
  }

  if (nowMs >= cutoffMs) {
    const minsLeft = Math.max(1, Math.ceil(msUntilStart / 60000));
    return {
      state: 'cutoff_closed',
      isAutoCancelledNoRegistrants: false,
      isUnlimited,
      remainingSpots,
      startMs,
      endMs,
      cutoffMs,
      msUntilCutoff,
      msUntilStart,
      statusLabel: 'Clôturé (H-1)',
      helperText: `Inscriptions fermées — la séance débute dans ${minsLeft} min (clôture 1h avant).`,
      capacityLabel,
    };
  }

  if (!isUnlimited && (remainingSpots ?? 0) <= 0) {
    return {
      state: 'full',
      isAutoCancelledNoRegistrants: false,
      isUnlimited,
      remainingSpots: 0,
      startMs,
      endMs,
      cutoffMs,
      msUntilCutoff,
      msUntilStart,
      statusLabel: 'Complet',
      helperText: 'Toutes les places disponibles ont été réservées.',
      capacityLabel,
    };
  }

  return {
    state: 'open',
    isAutoCancelledNoRegistrants: false,
    isUnlimited,
    remainingSpots,
    startMs,
    endMs,
    cutoffMs,
    msUntilCutoff,
    msUntilStart,
    statusLabel: 'Inscriptions ouvertes',
    helperText: `Clôture à ${formatFrenchTime(new Date(cutoffMs))} (${formatDurationRemaining(msUntilCutoff)} restant)`,
    capacityLabel,
  };
}

export function formatCapacityCompact(event: SportEvent): string {
  if (event.isUnlimitedCapacity) {
    return `${event.registeredCount} · Illimité`;
  }
  return `${event.registeredCount}/${event.maxCapacity}`;
}

export function formatDurationRemaining(ms: number): string {
  if (ms <= 0) return '0 min';
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `${days}j ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  }
  return `${minutes} min`;
}

export function formatFrenchTime(date: Date): string {
  return new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatFrenchDateShort(date: Date): string {
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(date);
}

export function formatFrenchDateLong(date: Date): string {
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export function formatTimeRange(start: Date, durationMinutes: number): string {
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
  return `${formatFrenchTime(start)} – ${formatFrenchTime(end)}`;
}

export function toLocalDateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function toLocalTimeInputValue(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function getMonthDaysGrid(year: number, monthIndex: number): Date[] {
  const firstOfMonth = new Date(year, monthIndex, 1);
  const startDayOffset = (firstOfMonth.getDay() + 6) % 7;
  const gridStart = new Date(year, monthIndex, 1 - startDayOffset);

  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    days.push(
      new Date(
        gridStart.getFullYear(),
        gridStart.getMonth(),
        gridStart.getDate() + i
      )
    );
  }
  return days;
}

export function getWeekDays(anchorDate: Date): Date[] {
  const dayOffset = (anchorDate.getDay() + 6) % 7;
  const monday = new Date(
    anchorDate.getFullYear(),
    anchorDate.getMonth(),
    anchorDate.getDate() - dayOffset
  );
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    days.push(
      new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)
    );
  }
  return days;
}

export async function hashEmailKey(email: string): Promise<string> {
  const normalized = email.trim().toLowerCase();
  const encoded = new TextEncoder().encode(normalized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return hex.slice(0, 24);
}

export function downloadEventIcs(event: SportEvent): void {
  const start = event.startAt.toDate();
  const end = new Date(start.getTime() + event.durationMinutes * 60 * 1000);
  const fmt = (d: Date) =>
    d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const escapeIcs = (text: string) =>
    text.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/\n/g, '\\n');

  const fullLocation = [event.location, event.city, event.region]
    .filter(Boolean)
    .join(', ');

  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//GetFitNow Event//FR',
    'BEGIN:VEVENT',
    `UID:${event.id}@getfitnow-event`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${escapeIcs(`${event.title} (${event.discipline})`)}`,
    `LOCATION:${escapeIcs(fullLocation)}`,
    `DESCRIPTION:${escapeIcs(
      `${event.description || 'Séance sportive'} — ${formatEventCoachesLabel(event)}`
    )}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `seance-${event.id}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportCsv(filename: string, headers: string[], rows: string[][]): void {
  const escapeCell = (val: string) => {
    const safe = val.replace(/"/g, '""');
    return `"${safe}"`;
  };
  const csvLines = [
    headers.map(escapeCell).join(';'),
    ...rows.map((r) => r.map(escapeCell).join(';')),
  ];
  const blob = new Blob(['\uFEFF' + csvLines.join('\r\n')], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function formatPriceEuros(priceCents: number): string {
  const safeCents = Math.max(0, Math.round(priceCents));
  if (safeCents === 0) return '0 €';
  const isWhole = safeCents % 100 === 0;
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(safeCents / 100);
}

export function formatEventPrice(
  event: Pick<SportEvent, 'isPaid' | 'priceCents'>
): string {
  if (event.isPaid && typeof event.priceCents === 'number' && event.priceCents > 0) {
    return formatPriceEuros(event.priceCents);
  }
  return 'Gratuit';
}

export function formatPaymentModeLabel(mode?: EventPaymentMode): string {
  if (mode === 'onsite') return 'Sur place';
  if (mode === 'both') return 'Carte ou sur place';
  return 'Carte en ligne';
}

export function getRegistrationPaymentBadgeInfo(
  reg: Pick<
    Registration,
    'amountCents' | 'paymentStatus' | 'paymentMethod' | 'cardBrand' | 'cardLast4'
  >
): {
  status: PaymentStatus;
  label: string;
  shortLabel: string;
  amountLabel: string;
} {
  const amount = typeof reg.amountCents === 'number' ? reg.amountCents : 0;
  const amountLabel = amount > 0 ? formatPriceEuros(amount) : 'Gratuit';
  const status: PaymentStatus =
    reg.paymentStatus ?? (amount > 0 ? 'pending' : 'free');

  if (status === 'free' || amount <= 0) {
    return {
      status: 'free',
      label: 'Gratuit',
      shortLabel: 'Gratuit',
      amountLabel: 'Gratuit',
    };
  }

  if (status === 'paid') {
    const cardDetails =
      reg.paymentMethod === 'card' && reg.cardLast4
        ? ` · ${reg.cardBrand || 'CB'} •••• ${reg.cardLast4}`
        : reg.paymentMethod === 'onsite'
          ? ' · Sur place'
          : '';
    return {
      status: 'paid',
      label: `Payé (${amountLabel})${cardDetails}`,
      shortLabel: `Payé · ${amountLabel}`,
      amountLabel,
    };
  }

  if (status === 'refunded') {
    return {
      status: 'refunded',
      label: `Remboursé (${amountLabel})`,
      shortLabel: `Remboursé · ${amountLabel}`,
      amountLabel,
    };
  }

  return {
    status: 'pending',
    label: `À régler sur place (${amountLabel})`,
    shortLabel: `Sur place · ${amountLabel}`,
    amountLabel,
  };
}

export const FITNESS_LEVEL_OPTIONS: ReadonlyArray<{
  value: FitnessLevel;
  label: string;
  shortLabel: string;
  frequency: string;
}> = [
  {
    value: 'beginner',
    label: 'Débutant (0/1 fois par semaine)',
    shortLabel: 'Débutant (0/1×/sem.)',
    frequency: '0/1 fois par semaine',
  },
  {
    value: 'intermediate',
    label: 'Intermédiaire (2/4 fois par semaine)',
    shortLabel: 'Intermédiaire (2/4×/sem.)',
    frequency: '2/4 fois par semaine',
  },
  {
    value: 'advanced',
    label: 'Avancé (5 fois et + par semaine)',
    shortLabel: 'Avancé (5+×/sem.)',
    frequency: '5 fois et + par semaine',
  },
];

export function formatFitnessLevelLabel(
  level?: FitnessLevel | '' | null,
  short = false
): string {
  if (!level) return '';
  const match = FITNESS_LEVEL_OPTIONS.find((opt) => opt.value === level);
  if (!match) return '';
  return short ? match.shortLabel : match.label;
}

export function isValidBirthDateString(birthDate?: string | null): boolean {
  const clean = (birthDate ?? '').trim();
  if (!clean) return false;
  if (!VALIDATION_LIMITS.BIRTH_DATE_REGEX.test(clean)) return false;
  const [yStr, mStr, dStr] = clean.split('-');
  const year = Number(yStr);
  const month = Number(mStr);
  const day = Number(dStr);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    year < 1900 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return false;
  }
  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return false;
  }
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return parsed.getTime() <= todayMidnight.getTime();
}

export function calculateAgeFromBirthDate(
  birthDate?: string | null,
  referenceDate: Date = new Date()
): number | null {
  const clean = (birthDate ?? '').trim();
  if (!isValidBirthDateString(clean)) return null;
  const [yStr, mStr, dStr] = clean.split('-');
  const year = Number(yStr);
  const month = Number(mStr);
  const day = Number(dStr);
  let age = referenceDate.getFullYear() - year;
  const currentMonth = referenceDate.getMonth() + 1;
  const currentDay = referenceDate.getDate();
  if (currentMonth < month || (currentMonth === month && currentDay < day)) {
    age -= 1;
  }
  if (age < 0 || age > 125) return null;
  return age;
}

export function formatBirthDateFrench(birthDate?: string | null): string {
  const clean = (birthDate ?? '').trim();
  if (!isValidBirthDateString(clean)) return '';
  const [yStr, mStr, dStr] = clean.split('-');
  const date = new Date(Number(yStr), Number(mStr) - 1, Number(dStr));
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

