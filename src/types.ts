import { Timestamp } from 'firebase/firestore';

export type Discipline = string;

export type DisciplineColorKey =
  | 'emerald'
  | 'orange'
  | 'sky'
  | 'violet'
  | 'rose'
  | 'teal'
  | 'amber'
  | 'indigo'
  | 'lime'
  | 'slate';

export interface CustomDiscipline {
  id: string;
  name: string;
  slug: string;
  colorKey: DisciplineColorKey;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface DisciplineItem {
  id: string;
  name: string;
  colorKey: DisciplineColorKey;
  customDoc?: CustomDiscipline;
}

export type EventStatus = 'published' | 'cancelled';
export type EventCancelReason = 'manual' | 'no_registrants' | '';
export type RegistrationStatus = 'confirmed' | 'cancelled';
export type FollowUpStatus = 'active' | 'to_follow_up' | 'paused';
export type FitnessLevel = 'beginner' | 'intermediate' | 'advanced';
export type EventPaymentMode = 'online' | 'onsite' | 'both';
export type PaymentStatus = 'free' | 'paid' | 'pending' | 'refunded';
export type PaymentMethod = 'free' | 'card' | 'onsite';

export const VALIDATION_LIMITS = {
  TITLE_MIN: 2,
  TITLE_MAX: 100,
  DISCIPLINE_MIN: 2,
  DISCIPLINE_MAX: 50,
  DESCRIPTION_MAX: 600,
  LOCATION_MIN: 2,
  LOCATION_MAX: 120,
  CITY_MIN: 2,
  CITY_MAX: 80,
  REGION_MAX: 80,
  COACH_NAME_MIN: 2,
  COACH_NAME_MAX: 200,
  SINGLE_COACH_NAME_MAX: 80,
  COACHES_PER_EVENT_MAX: 10,
  DURATION_MIN: 15,
  DURATION_MAX: 240,
  CAPACITY_MIN: 1,
  CAPACITY_MAX: 200,
  GUESTS_PER_BOOKING_MAX: 10,
  PRICE_MIN_CENTS: 100,
  PRICE_MAX_CENTS: 100000,
  PAYMENT_REF_MAX: 64,
  FIRST_NAME_MIN: 1,
  FIRST_NAME_MAX: 60,
  LAST_NAME_MIN: 1,
  LAST_NAME_MAX: 60,
  EMAIL_MIN: 5,
  EMAIL_MAX: 120,
  PHONE_MAX: 30,
  GOAL_MAX: 120,
  NOTES_MAX: 1000,
  DISPLAY_NAME_MIN: 2,
  DISPLAY_NAME_MAX: 80,
  REQUEST_MESSAGE_MAX: 500,
  SPECIALTY_MAX: 120,
  CERTIFICATIONS_MAX: 200,
  BIO_MAX: 600,
  PHOTO_URL_MAX: 80000,
  BIRTH_DATE_MAX: 10,
  BIRTH_DATE_REGEX: /^\d{4}-\d{2}-\d{2}$/,
  EMAIL_REGEX: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  BOOKING_CUTOFF_MS: 60 * 60 * 1000, // 1 heure avant le début
  ENDED_EVENT_RETENTION_DAYS: 30,
  ENDED_EVENT_RETENTION_MS: 30 * 24 * 60 * 60 * 1000, // 30 jours après la fin
} as const;

export interface SportEvent {
  id: string;
  title: string;
  discipline: Discipline;
  description: string;
  location: string;
  city: string;
  region: string;
  hasCoords: boolean;
  lat: number;
  lng: number;
  coachName: string;
  coachNames?: string[];
  coachUids?: string[];
  startAt: Timestamp;
  durationMinutes: number;
  isUnlimitedCapacity: boolean;
  maxCapacity: number;
  registeredCount: number;
  lastRegId: string;
  status: EventStatus;
  cancelReason?: EventCancelReason;
  isPaid?: boolean;
  priceCents?: number;
  currency?: 'EUR';
  paymentMode?: EventPaymentMode;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Registration {
  id: string;
  eventId: string;
  eventTitle: string;
  eventStartAt: Timestamp;
  eventDurationMinutes?: number;
  eventEndAt?: Timestamp;
  firstName: string;
  lastName: string;
  email: string;
  emailKey: string;
  attended: boolean;
  memberValidated?: boolean;
  status: RegistrationStatus;
  amountCents?: number;
  currency?: 'EUR';
  paymentStatus?: PaymentStatus;
  paymentMethod?: PaymentMethod;
  paymentReference?: string;
  cardBrand?: string;
  cardLast4?: string;
  paidAt?: Timestamp | null;
  isGuest?: boolean;
  invitedByEmail?: string;
  invitedByEmailKey?: string;
  invitedByName?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface GuestInput {
  firstName: string;
  lastName: string;
  email: string;
}

export interface PaymentRecord {
  id: string;
  registrationId: string;
  eventId: string;
  eventTitle: string;
  eventStartAt: Timestamp;
  memberEmail: string;
  memberEmailKey: string;
  memberName: string;
  amountCents: number;
  currency: 'EUR';
  method: 'card' | 'onsite';
  status: 'paid' | 'pending' | 'refunded';
  reference: string;
  cardBrand: string;
  cardLast4: string;
  paidAt: Timestamp | null;
  isGuest?: boolean;
  payerEmail?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface MemberProfile {
  id: string;
  emailKey: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  goal: string;
  birthDate?: string;
  fitnessLevel?: FitnessLevel | '';
  notes: string;
  followUpStatus: FollowUpStatus;
  photoUrl?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface MemberAggregate {
  emailKey: string;
  email: string;
  firstName: string;
  lastName: string;
  profile: MemberProfile | null;
  registrations: Registration[];
  totalRegistrations: number;
  attendedCount: number;
  pastRegistrationsCount: number;
  upcomingRegistrationsCount: number;
  attendanceRate: number | null;
  lastSessionDate: Date | null;
  nextSessionDate: Date | null;
}

export type CoachRole = 'coach' | 'coach_admin';
export type CoachAdminRequestStatus = 'none' | 'pending' | 'rejected';
export type CoachAccessRequestStatus = 'pending' | 'approved' | 'rejected';
export type CoachInviteStatus = 'pending' | 'disabled' | 'claimed';
export type CoachAccessResolution = 'active' | 'disabled' | 'none';

export interface CoachAdminUser {
  id: string;
  uid: string;
  email: string;
  emailKey: string;
  displayName: string;
  phone?: string;
  specialty?: string;
  city?: string;
  region?: string;
  certifications?: string;
  bio?: string;
  photoUrl?: string;
  role: CoachRole;
  adminRequestStatus?: CoachAdminRequestStatus;
  active: boolean;
  isPrimary: boolean;
  createdByUid: string;
  createdByEmail: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CoachAccessRequest {
  id: string;
  uid: string;
  email: string;
  emailKey: string;
  displayName: string;
  message: string;
  status: CoachAccessRequestStatus;
  reviewedByEmail: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CoachAdminInvite {
  id: string;
  email: string;
  emailKey: string;
  displayName: string;
  role: CoachRole;
  status: CoachInviteStatus;
  invitedByUid: string;
  invitedByEmail: string;
  claimedByUid: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type BookingAvailabilityState =
  | 'open'
  | 'cutoff_closed'
  | 'full'
  | 'past'
  | 'cancelled';

export type AppSection =
  | 'calendar'
  | 'sessions'
  | 'member-profile'
  | 'members'
  | 'manage'
  | 'coaches';

export interface CoachNotification {
  id: string;
  coachUid: string;
  type: 'new_registration';
  eventId: string;
  eventTitle: string;
  eventStartAt: Timestamp;
  registrationId: string;
  memberName: string;
  memberEmail: string;
  invitedByName?: string;
  read: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type MemberNotificationType = 'validate_session' | 'event_cancelled';

export interface MemberNotification {
  id: string;
  registrationId: string;
  eventId: string;
  eventTitle: string;
  eventStartAt: Timestamp;
  eventEndAt: Timestamp;
  memberEmail: string;
  memberEmailKey: string;
  type: MemberNotificationType;
  coachName?: string;
  wasPaid?: boolean;
  read: boolean;
  validated: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
