import {
  ExerciseCategory,
  RunningDistanceKey,
  RunningPaceZones,
  ScheduledExerciseItem,
  TrainingProgram,
  VALIDATION_LIMITS,
} from '../types';

export interface RunningDistanceTemplate {
  key: RunningDistanceKey;
  label: string;
  shortLabel: string;
  distanceKm: number;
  defaultTargetTimeSeconds: number;
  defaultSessionsPerWeek: number;
  defaultPriceCents: number;
  tagline: string;
  phases: [string, string, string, string];
}

export const RUNNING_DISTANCE_TEMPLATES: Record<
  RunningDistanceKey,
  RunningDistanceTemplate
> = {
  '5km': {
    key: '5km',
    label: 'Programme 5 km',
    shortLabel: '5 km',
    distanceKm: 5,
    defaultTargetTimeSeconds: 25 * 60, // 25 min (5:00/km)
    defaultSessionsPerWeek: 3,
    defaultPriceCents: 4900,
    tagline: 'Vitesse, VMA courte et soutien à l’allure 5 km sur 12 semaines.',
    phases: [
      'Sem. 1–4 · Test VMA, socle aérobie & foulée',
      'Sem. 5–8 · Développement VMA & tolérance lactique',
      'Sem. 9–11 · Blocs à allure spécifique AS5',
      'Sem. 12 · Affûtage & Course 5 km',
    ],
  },
  '10km': {
    key: '10km',
    label: 'Programme 10 km',
    shortLabel: '10 km',
    distanceKm: 10,
    defaultTargetTimeSeconds: 50 * 60, // 50 min (5:00/km)
    defaultSessionsPerWeek: 3,
    defaultPriceCents: 5900,
    tagline: 'Équilibre VMA, seuil et résistance spécifique 10 km sur 12 semaines.',
    phases: [
      'Sem. 1–4 · Test VMA, endurance & renforcement runner',
      'Sem. 5–8 · VMA longue & travail au seuil',
      'Sem. 9–11 · Allure spécifique AS10 & rappels VMA',
      'Sem. 12 · Affûtage & Course 10 km',
    ],
  },
  '21km': {
    key: '21km',
    label: 'Programme 21 km (Semi-marathon)',
    shortLabel: '21 km',
    distanceKm: 21.1,
    defaultTargetTimeSeconds: 115 * 60, // 1h55
    defaultSessionsPerWeek: 4,
    defaultPriceCents: 7900,
    tagline: 'Endurance fondamentale, seuil prolongé et allure semi AS21.',
    phases: [
      'Sem. 1–4 · Test VMA, volume progressif & gainage',
      'Sem. 5–8 · Seuil tempo & sorties longues',
      'Sem. 9–11 · Allure spécifique AS21 sous fatigue',
      'Sem. 12 · Affûtage & Semi-marathon',
    ],
  },
  '42km': {
    key: '42km',
    label: 'Programme 42 km (Marathon)',
    shortLabel: '42 km',
    distanceKm: 42.195,
    defaultTargetTimeSeconds: 4 * 3600, // 4h00
    defaultSessionsPerWeek: 4,
    defaultPriceCents: 9900,
    tagline: 'Volume aérobie, robustesse musculaire et maîtrise de l’allure AS42.',
    phases: [
      'Sem. 1–4 · Test VMA, endurance & PPG protectrice',
      'Sem. 5–8 · Montée en volume & blocs AS42',
      'Sem. 9–11 · Pic de charge spécifique Marathon',
      'Sem. 12 · Affûtage & Marathon',
    ],
  },
};

export const RUNNING_DISTANCE_LIST: RunningDistanceTemplate[] = [
  RUNNING_DISTANCE_TEMPLATES['5km'],
  RUNNING_DISTANCE_TEMPLATES['10km'],
  RUNNING_DISTANCE_TEMPLATES['21km'],
  RUNNING_DISTANCE_TEMPLATES['42km'],
];

export const WEEKDAY_OPTIONS: { day: number; short: string; label: string }[] = [
  { day: 1, short: 'Lun', label: 'Lundi' },
  { day: 2, short: 'Mar', label: 'Mardi' },
  { day: 3, short: 'Mer', label: 'Mercredi' },
  { day: 4, short: 'Jeu', label: 'Jeudi' },
  { day: 5, short: 'Ven', label: 'Vendredi' },
  { day: 6, short: 'Sam', label: 'Samedi' },
  { day: 7, short: 'Dim', label: 'Dimanche' },
];

export function getDefaultPreferredDays(sessionsPerWeek: number): number[] {
  switch (sessionsPerWeek) {
    case 2:
      return [2, 6]; // Mar, Sam
    case 3:
      return [2, 4, 7]; // Mar, Jeu, Dim
    case 4:
      return [2, 4, 6, 7]; // Mar, Jeu, Sam, Dim
    case 5:
      return [1, 2, 4, 6, 7]; // Lun, Mar, Jeu, Sam, Dim
    case 6:
      return [1, 2, 3, 4, 6, 7]; // Lun..Jeu, Sam, Dim
    default:
      return [2, 4, 7];
  }
}

export function normalizePreferredDays(
  preferredDays: number[],
  sessionsPerWeek: number
): number[] {
  const clampedCount = Math.min(
    VALIDATION_LIMITS.PROGRAM_SESSIONS_PER_WEEK_MAX,
    Math.max(
      VALIDATION_LIMITS.PROGRAM_SESSIONS_PER_WEEK_MIN,
      Math.round(sessionsPerWeek) || 3
    )
  );
  const validUnique = Array.from(
    new Set(
      preferredDays
        .map((d) => Math.round(d))
        .filter((d) => d >= 1 && d <= 7)
    )
  ).sort((a, b) => a - b);

  if (validUnique.length === clampedCount) {
    return validUnique;
  }
  if (validUnique.length > clampedCount) {
    return validUnique.slice(0, clampedCount);
  }
  const fallback = getDefaultPreferredDays(clampedCount);
  const merged = Array.from(new Set([...validUnique, ...fallback])).sort(
    (a, b) => a - b
  );
  if (merged.length >= clampedCount) {
    return merged.slice(0, clampedCount);
  }
  for (let d = 1; d <= 7 && merged.length < clampedCount; d += 1) {
    if (!merged.includes(d)) merged.push(d);
  }
  return merged.sort((a, b) => a - b);
}

export function formatDurationHMS(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  if (hours > 0) {
    return `${hours}h${String(minutes).padStart(2, '0')}${
      seconds > 0 ? `:${String(seconds).padStart(2, '0')}` : ''
    }`;
  }
  return `${minutes}m${String(seconds).padStart(2, '0')}`;
}

export function formatPaceMinPerKm(secPerKm: number): string {
  const safe = Math.max(120, Math.round(secPerKm));
  const min = Math.floor(safe / 60);
  const sec = safe % 60;
  return `${min}'${String(sec).padStart(2, '0')}"/km`;
}

export function paceSecToKmh(secPerKm: number): number {
  if (secPerKm <= 0) return 0;
  return Math.round((3600 / secPerKm) * 10) / 10;
}

export function kmhToSecPerKm(kmh: number): number {
  if (kmh <= 0) return 360;
  return Math.round(3600 / kmh);
}

export function computeTargetRacePaceSecPerKm(
  distance: RunningDistanceKey,
  targetTimeSeconds: number
): number {
  const tpl = RUNNING_DISTANCE_TEMPLATES[distance];
  return Math.round(targetTimeSeconds / tpl.distanceKm);
}

/**
 * Calcul VMA depuis test terrain (ex. Demi-Cooper 6 min = distanceMeters / 100).
 * Généralisé pour n'importe quelle durée en secondes :
 * VMA (km/h) = (distanceMeters / 1000) / (durationSeconds / 3600)
 */
export function computeVmaFromTest(
  distanceMeters: number,
  durationSeconds: number
): number {
  if (distanceMeters <= 0 || durationSeconds <= 0) return 0;
  const raw = (distanceMeters / 1000) / (durationSeconds / 3600);
  return Math.round(raw * 10) / 10;
}

export function computeVmaPaceZones(
  vmaKmh: number,
  distance: RunningDistanceKey,
  targetTimeSeconds: number
): RunningPaceZones {
  const safeVma = Math.min(
    VALIDATION_LIMITS.PROGRAM_VMA_MAX_KMH,
    Math.max(VALIDATION_LIMITS.PROGRAM_VMA_MIN_KMH, vmaKmh)
  );
  const targetRacePaceSecPerKm = computeTargetRacePaceSecPerKm(
    distance,
    targetTimeSeconds
  );

  return {
    vmaKmh: Math.round(safeVma * 10) / 10,
    efMinSecPerKm: kmhToSecPerKm(safeVma * 0.72),
    efMaxSecPerKm: kmhToSecPerKm(safeVma * 0.64),
    as42SecPerKm: kmhToSecPerKm(safeVma * 0.78),
    as21SecPerKm: kmhToSecPerKm(safeVma * 0.83),
    seuilSecPerKm: kmhToSecPerKm(safeVma * 0.86),
    as10SecPerKm: kmhToSecPerKm(safeVma * 0.9),
    as5SecPerKm: kmhToSecPerKm(safeVma * 0.94),
    vma100SecPerKm: kmhToSecPerKm(safeVma * 1.0),
    vma105SecPerKm: kmhToSecPerKm(safeVma * 1.05),
    targetRacePaceSecPerKm,
  };
}

export type ProgramFocusZone =
  | 'vma_test'
  | 'ef'
  | 'vma_short'
  | 'vma_long'
  | 'threshold'
  | 'race_pace'
  | 'long_run'
  | 'strength_hills'
  | 'race_day';

export interface GeneratedProgramSession {
  key: string; // e.g. 'w1-s1'
  programId: string;
  weekNumber: number; // 1..12
  sessionIndexInWeek: number; // 1..sessionsPerWeek
  phaseLabel: string;
  scheduledDate: Date;
  durationMinutes: number;
  title: string;
  discipline: string;
  focusZone: ProgramFocusZone;
  focusLabel: string;
  isVmaTest: boolean;
  isRaceDay: boolean;
  targetPaceLabel: string;
  targetPaceRangeLabel: string;
  coachNotes: string;
  exercises: ScheduledExerciseItem[];
  completed: boolean;
}

function makeEx(
  exerciseId: string,
  name: string,
  category: ExerciseCategory,
  repetitions: number,
  durationSeconds: number,
  setsOrRounds: number,
  intraSetPauseSeconds: number,
  restBetweenRoundsSeconds: number,
  notes: string
): ScheduledExerciseItem {
  return {
    exerciseId,
    name,
    category,
    repetitions,
    durationSeconds,
    setsOrRounds,
    intraSetPauseSeconds,
    restBetweenRoundsSeconds,
    notes,
  };
}

function toIsoWeekday(date: Date): number {
  const js = date.getDay(); // 0=Sun..6=Sat
  return js === 0 ? 7 : js; // 1=Mon..7=Sun
}

function addDaysAtHour(base: Date, daysOffset: number, hour = 18, minute = 0): Date {
  return new Date(
    base.getFullYear(),
    base.getMonth(),
    base.getDate() + daysOffset,
    hour,
    minute,
    0,
    0
  );
}

function computeWeekDates(
  startDate: Date,
  sessionsPerWeek: number,
  preferredDays: number[]
): Date[][] {
  const normalizedDays = normalizePreferredDays(preferredDays, sessionsPerWeek);
  const startIsoDay = toIsoWeekday(startDate);
  // Start of Week 1 Monday relative to startDate
  const mondayW1 = new Date(
    startDate.getFullYear(),
    startDate.getMonth(),
    startDate.getDate() - (startIsoDay - 1),
    0,
    0,
    0,
    0
  );

  const weeks: Date[][] = [];
  for (let w = 0; w < VALIDATION_LIMITS.PROGRAM_DURATION_WEEKS; w += 1) {
    if (w === 0) {
      // Week 1 ALWAYS begins on Day 1 (startDate) for the VMA test!
      const w1Dates: Date[] = [
        new Date(
          startDate.getFullYear(),
          startDate.getMonth(),
          startDate.getDate(),
          9,
          0,
          0,
          0
        ),
      ];
      // Remaining Week 1 sessions spread between Day 2 and Sunday of Week 1
      const daysAfterStart = normalizedDays.filter((d) => d > startIsoDay);
      const needed = sessionsPerWeek - 1;
      const chosenIsoDays: number[] = [...daysAfterStart.slice(0, needed)];
      for (let d = startIsoDay + 1; d <= 7 && chosenIsoDays.length < needed; d += 1) {
        if (!chosenIsoDays.includes(d)) chosenIsoDays.push(d);
      }
      chosenIsoDays.sort((a, b) => a - b);
      chosenIsoDays.forEach((isoDay) => {
        w1Dates.push(addDaysAtHour(mondayW1, isoDay - 1, 18, 0));
      });
      // If startDate is Saturday/Sunday and still missing slots in W1, place next valid slots in early days after startDate
      let extraDayOffset = 1;
      while (w1Dates.length < sessionsPerWeek) {
        const candidate = addDaysAtHour(startDate, extraDayOffset, 18, 0);
        if (!w1Dates.some((x) => x.getTime() === candidate.getTime())) {
          w1Dates.push(candidate);
        }
        extraDayOffset += 1;
      }
      w1Dates.sort((a, b) => a.getTime() - b.getTime());
      weeks.push(w1Dates);
    } else {
      const weekDates = normalizedDays.map((isoDay) =>
        addDaysAtHour(mondayW1, w * 7 + (isoDay - 1), isoDay >= 6 ? 9 : 18, 0)
      );
      weeks.push(weekDates);
    }
  }
  return weeks;
}

function getPhaseForWeek(
  distance: RunningDistanceKey,
  weekNumber: number
): string {
  const phases = RUNNING_DISTANCE_TEMPLATES[distance].phases;
  if (weekNumber <= 4) return phases[0];
  if (weekNumber <= 8) return phases[1];
  if (weekNumber <= 11) return phases[2];
  return phases[3];
}

function paceInfoForZone(
  zone: ProgramFocusZone,
  distance: RunningDistanceKey,
  zones: RunningPaceZones | null
): { label: string; range: string } {
  if (zone === 'vma_test') {
    return {
      label: 'Allure maximale soutenue sur 6 min (Test VMA)',
      range: 'Donne toutes vos allures des 12 semaines',
    };
  }
  if (!zones) {
    return {
      label: 'Allure calibrée après le test VMA du Jour 1',
      range: 'En attente du test VMA (Jour 1)',
    };
  }

  switch (zone) {
    case 'ef':
      return {
        label: `EF 64–72% VMA : ${formatPaceMinPerKm(zones.efMinSecPerKm)} – ${formatPaceMinPerKm(zones.efMaxSecPerKm)}`,
        range: `${formatPaceMinPerKm(zones.efMinSecPerKm)} à ${formatPaceMinPerKm(zones.efMaxSecPerKm)}`,
      };
    case 'vma_short':
      return {
        label: `VMA 100–105% : ${formatPaceMinPerKm(zones.vma105SecPerKm)} – ${formatPaceMinPerKm(zones.vma100SecPerKm)}`,
        range: `${paceSecToKmh(zones.vma100SecPerKm)}–${paceSecToKmh(zones.vma105SecPerKm)} km/h`,
      };
    case 'vma_long':
      return {
        label: `VMA 95–100% : ${formatPaceMinPerKm(zones.vma100SecPerKm)} – ${formatPaceMinPerKm(zones.as5SecPerKm)}`,
        range: `${formatPaceMinPerKm(zones.vma100SecPerKm)} à ${formatPaceMinPerKm(zones.as5SecPerKm)}`,
      };
    case 'threshold':
      return {
        label: `Seuil 85–88% VMA : ${formatPaceMinPerKm(zones.seuilSecPerKm)}`,
        range: `${paceSecToKmh(zones.seuilSecPerKm)} km/h · Effort soutenu contrôlé`,
      };
    case 'race_pace': {
      const specificPace =
        distance === '5km'
          ? zones.as5SecPerKm
          : distance === '10km'
            ? zones.as10SecPerKm
            : distance === '21km'
              ? zones.as21SecPerKm
              : zones.as42SecPerKm;
      return {
        label: `Allure spéc. ${RUNNING_DISTANCE_TEMPLATES[distance].shortLabel} : ${formatPaceMinPerKm(specificPace)} (Obj. ${formatPaceMinPerKm(zones.targetRacePaceSecPerKm)})`,
        range: `VMA ${distance === '5km' ? '94%' : distance === '10km' ? '90%' : distance === '21km' ? '83%' : '78%'}`,
      };
    }
    case 'long_run': {
      const endPace =
        distance === '42km'
          ? zones.as42SecPerKm
          : distance === '21km'
            ? zones.as21SecPerKm
            : zones.efMinSecPerKm;
      return {
        label: `EF ${formatPaceMinPerKm(zones.efMaxSecPerKm)} → Fin ${formatPaceMinPerKm(endPace)}`,
        range: 'Endurance progressive',
      };
    }
    case 'strength_hills':
      return {
        label: `EF ${formatPaceMinPerKm(zones.efMinSecPerKm)} + Côtes / Renforcement`,
        range: 'Puissance & prévention blessures',
      };
    case 'race_day':
      return {
        label: `Allure objectif : ${formatPaceMinPerKm(zones.targetRacePaceSecPerKm)} (VMA ${zones.vmaKmh.toFixed(1)} km/h)`,
        range: `Objectif chrono ${formatDurationHMS(zones.targetRacePaceSecPerKm * RUNNING_DISTANCE_TEMPLATES[distance].distanceKm)}`,
      };
    default:
      return { label: '', range: '' };
  }
}

function buildWorkoutForSlot(params: {
  distance: RunningDistanceKey;
  weekNumber: number;
  slotIndex: number; // 0-based within week
  sessionsPerWeek: number;
  zones: RunningPaceZones | null;
}): {
  title: string;
  focusZone: ProgramFocusZone;
  focusLabel: string;
  durationMinutes: number;
  isVmaTest: boolean;
  isRaceDay: boolean;
  coachNotes: string;
  exercises: ScheduledExerciseItem[];
} {
  const { distance, weekNumber, slotIndex, sessionsPerWeek, zones } = params;

  // DAY 1 (Week 1, Session 1) = TEST VMA OBLIGATOIRE
  if (weekNumber === 1 && slotIndex === 0) {
    return {
      title: 'Jour 1 · Test VMA (Demi-Cooper 6 min)',
      focusZone: 'vma_test',
      focusLabel: 'Évaluation VMA',
      durationMinutes: 45,
      isVmaTest: true,
      isRaceDay: false,
      coachNotes:
        'Séance fondatrice du programme : échauffez-vous 15 min puis parcourez la plus grande distance possible en 6 minutes à allure régulière. Enregistrez votre résultat pour débloquer vos allures personnalisées.',
      exercises: [
        makeEx(
          'run-ef-warmup',
          'Échauffement progressif + gammes (talons-fesses, montées de genoux)',
          'running',
          1,
          900,
          1,
          0,
          120,
          'Footing souple aisé + 3 accélérations progressives de 15 sec.'
        ),
        makeEx(
          'run-vma-test-6min',
          'Test VMA Demi-Cooper 6 min (effort maximal régulier)',
          'running',
          1,
          360,
          1,
          0,
          300,
          'Mesurez précisément la distance (mètres) en 6 min : VMA = distance ÷ 100.'
        ),
        makeEx(
          'mob-cooldown',
          'Retour au calme + mobilité hanches & mollets',
          'mobility',
          1,
          480,
          1,
          0,
          0,
          'Trot très lent 8 min puis étirements légers.'
        ),
      ],
    };
  }

  // RACE WEEK (Week 12, Last Session) = JOUR DE COURSE
  if (weekNumber === 12 && slotIndex === sessionsPerWeek - 1) {
    const raceLabel = RUNNING_DISTANCE_TEMPLATES[distance].shortLabel;
    const paceStr = zones
      ? formatPaceMinPerKm(zones.targetRacePaceSecPerKm)
      : 'allure objectif';
    return {
      title: `Jour J · Course objectif ${raceLabel}`,
      focusZone: 'race_day',
      focusLabel: `Course ${raceLabel}`,
      durationMinutes:
        distance === '42km'
          ? 240
          : distance === '21km'
            ? 135
            : distance === '10km'
              ? 75
              : 55,
      isVmaTest: false,
      isRaceDay: true,
      coachNotes: `Semaine d’affûtage accomplie : partez prudemment au premier kilomètre puis calez-vous sur ${paceStr}.`,
      exercises: [
        makeEx(
          'mob-race-warmup',
          'Échauffement d’avant-course & activation',
          'mobility',
          1,
          600,
          1,
          0,
          180,
          '10 min footing léger + 3 lignes droites progressives.'
        ),
        makeEx(
          'run-race-goal',
          `Course officielle ${raceLabel} à allure cible`,
          'running',
          1,
          distance === '5km'
            ? 1500
            : distance === '10km'
              ? 3000
              : distance === '21km'
                ? 6900
                : 7200,
          1,
          0,
          0,
          `Allure cible : ${paceStr}. Gérez l’hydratation et la cadence.`
        ),
      ],
    };
  }

  // Week 12 taper sessions (before race day)
  if (weekNumber === 12) {
    if (slotIndex === 0) {
      const pace = zones ? formatPaceMinPerKm(zones.efMinSecPerKm) : 'EF Z2';
      return {
        title: 'Affûtage · Footing souple & rappels d’allure',
        focusZone: 'race_pace',
        focusLabel: 'Affûtage & Jus',
        durationMinutes: 35,
        isVmaTest: false,
        isRaceDay: false,
        coachNotes:
          'Volume réduit de 50% pour arriver frais le jour J tout en gardant la tonicité neuromusculaire.',
        exercises: [
          makeEx(
            'run-ef-taper',
            'Footing d’endurance fondamentale',
            'running',
            1,
            1200,
            1,
            0,
            60,
            `Allure très confortable (${pace}).`
          ),
          makeEx(
            'run-strides-taper',
            'Lignes droites à allure spécifique',
            'running',
            4,
            30,
            1,
            60,
            0,
            zones
              ? `4 × 30 sec à ${formatPaceMinPerKm(zones.targetRacePaceSecPerKm)} sans fatigue.`
              : '4 × 30 sec fluides et relâchées.'
          ),
        ],
      };
    }
    return {
      title: 'Affûtage · Activation courte & mobilité',
      focusZone: 'ef',
      focusLabel: 'Activation pré-course',
      durationMinutes: 25,
      isVmaTest: false,
      isRaceDay: false,
      coachNotes: 'Footing très léger la veille ou l’avant-veille pour délier les jambes.',
      exercises: [
        makeEx(
          'run-shakeout',
          'Footing de décrassage très souple',
          'running',
          1,
          900,
          1,
          0,
          60,
          zones
            ? `Rester plus lent que ${formatPaceMinPerKm(zones.efMinSecPerKm)}.`
            : 'Allure conversationnelle.'
        ),
        makeEx(
          'mob-hips-ankles',
          'Mobilité chevilles, hanches & étirements actifs',
          'mobility',
          10,
          45,
          2,
          15,
          60,
          'Zéro courbature avant la course.'
        ),
      ],
    };
  }

  // Assign session roles within a normal week (Weeks 1..11)
  // Slot mapping depending on sessionsPerWeek (2..6)
  type Role = 'quality_vma' | 'race_or_threshold' | 'long_run' | 'ef_strength' | 'ef_recovery';
  let role: Role = 'ef_recovery';

  if (sessionsPerWeek === 2) {
    role = slotIndex === 0 ? (weekNumber % 2 === 1 ? 'quality_vma' : 'race_or_threshold') : 'long_run';
  } else if (sessionsPerWeek === 3) {
    if (slotIndex === 0) role = 'quality_vma';
    else if (slotIndex === 1) role = weekNumber >= 5 ? 'race_or_threshold' : 'ef_strength';
    else role = 'long_run';
  } else if (sessionsPerWeek === 4) {
    if (slotIndex === 0) role = 'quality_vma';
    else if (slotIndex === 1) role = 'ef_strength';
    else if (slotIndex === 2) role = 'race_or_threshold';
    else role = 'long_run';
  } else if (sessionsPerWeek === 5) {
    if (slotIndex === 0) role = 'quality_vma';
    else if (slotIndex === 1) role = 'ef_recovery';
    else if (slotIndex === 2) role = 'race_or_threshold';
    else if (slotIndex === 3) role = 'ef_strength';
    else role = 'long_run';
  } else {
    // 6 sessions/week
    if (slotIndex === 0) role = 'quality_vma';
    else if (slotIndex === 1) role = 'ef_recovery';
    else if (slotIndex === 2) role = 'race_or_threshold';
    else if (slotIndex === 3) role = 'ef_strength';
    else if (slotIndex === 4) role = 'ef_recovery';
    else role = 'long_run';
  }

  const progressionIndex = Math.min(10, weekNumber - 1); // 0..10
  const isRecoveryWeek = weekNumber === 4 || weekNumber === 8;

  if (role === 'quality_vma') {
    const isShortVma = distance === '5km' || weekNumber <= 5;
    const reps = isShortVma
      ? isRecoveryWeek
        ? 6
        : Math.min(12, 7 + Math.floor(progressionIndex / 2))
      : isRecoveryWeek
        ? 5
        : Math.min(8, 5 + Math.floor(progressionIndex / 3));
    const workSec = isShortVma ? 30 : 90;
    const pauseSec = isShortVma ? 30 : 60;
    const rounds = isShortVma ? 2 : 1;
    const paceLabel = zones
      ? formatPaceMinPerKm(
          isShortVma ? zones.vma100SecPerKm : zones.as5SecPerKm
        )
      : isShortVma
        ? '100% VMA'
        : '95% VMA';

    return {
      title: isShortVma
        ? `Fractionné VMA · ${rounds}×(${reps}×30"/30")`
        : `VMA longue · ${reps}×${workSec === 90 ? '400m / 1m30' : '2 min'}`,
      focusZone: isShortVma ? 'vma_short' : 'vma_long',
      focusLabel: isShortVma ? 'VMA courte 100%' : 'VMA longue 95%',
      durationMinutes: 50,
      isVmaTest: false,
      isRaceDay: false,
      coachNotes: `Séance clé de vitesse aérobie. Allure cible du bloc : ${paceLabel}.`,
      exercises: [
        makeEx(
          'run-warmup-vma',
          'Échauffement Z2 + éducatifs de course',
          'running',
          1,
          900,
          1,
          0,
          120,
          zones
            ? `15 min EF (${formatPaceMinPerKm(zones.efMaxSecPerKm)}) + montées de genoux.`
            : '15 min footing souple + gammes.'
        ),
        makeEx(
          'run-vma-intervals',
          isShortVma
            ? 'Fractionné VMA 30/30 (efforts rapides / trot léger)'
            : 'Répétitions VMA soutenue',
          'running',
          reps,
          workSec,
          rounds,
          pauseSec,
          180,
          `Allure cible : ${paceLabel}. Régularité sur chaque répétition.`
        ),
        makeEx(
          'run-cooldown-vma',
          'Retour au calme en footing lent',
          'running',
          1,
          480,
          1,
          0,
          0,
          '8 min souples pour relancer la récupération.'
        ),
      ],
    };
  }

  if (role === 'race_or_threshold') {
    const isSpecificPhase = weekNumber >= 7;
    const specificPace = zones
      ? formatPaceMinPerKm(
          distance === '5km'
            ? zones.as5SecPerKm
            : distance === '10km'
              ? zones.as10SecPerKm
              : distance === '21km'
                ? zones.as21SecPerKm
                : zones.as42SecPerKm
        )
      : `Allure ${RUNNING_DISTANCE_TEMPLATES[distance].shortLabel}`;

    const blockSec =
      distance === '5km'
        ? 240
        : distance === '10km'
          ? 360
          : distance === '21km'
            ? 600
            : 900;
    const rounds = isRecoveryWeek ? 2 : isSpecificPhase ? 3 : 2;
    const titlePrefix = isSpecificPhase
      ? `Allure spécifique ${RUNNING_DISTANCE_TEMPLATES[distance].shortLabel}`
      : 'Seuil & Tempo contrôlé';

    return {
      title: `${titlePrefix} · ${rounds}×${Math.round(blockSec / 60)} min`,
      focusZone: isSpecificPhase ? 'race_pace' : 'threshold',
      focusLabel: isSpecificPhase
        ? `Allure ${RUNNING_DISTANCE_TEMPLATES[distance].shortLabel}`
        : 'Seuil 86% VMA',
      durationMinutes: distance === '42km' ? 75 : 60,
      isVmaTest: false,
      isRaceDay: false,
      coachNotes: isSpecificPhase
        ? `Calage précis du rythme de course (${specificPace}).`
        : `Travail au seuil ventilatoire (${zones ? formatPaceMinPerKm(zones.seuilSecPerKm) : '86% VMA'}).`,
      exercises: [
        makeEx(
          'run-warmup-threshold',
          'Échauffement progressif en endurance',
          'running',
          1,
          900,
          1,
          0,
          90,
          zones
            ? `15 min à ${formatPaceMinPerKm(zones.efMaxSecPerKm)}.`
            : '15 min en aisance respiratoire.'
        ),
        makeEx(
          'run-specific-blocks',
          isSpecificPhase
            ? `Blocs à allure ${RUNNING_DISTANCE_TEMPLATES[distance].shortLabel}`
            : 'Blocs continus au seuil',
          'running',
          1,
          blockSec,
          rounds,
          0,
          120,
          isSpecificPhase
            ? `Maintenir ${specificPace} avec relâchement du haut du corps.`
            : `Maintenir ${zones ? formatPaceMinPerKm(zones.seuilSecPerKm) : '86% VMA'}.`
        ),
        makeEx(
          'run-cooldown-threshold',
          'Retour au calme EF',
          'running',
          1,
          480,
          1,
          0,
          0,
          '8 min très souples.'
        ),
      ],
    };
  }

  if (role === 'ef_strength') {
    return {
      title: 'Footing EF + Renforcement spécifique runner',
      focusZone: 'strength_hills',
      focusLabel: 'Endurance & PPG',
      durationMinutes: 50,
      isVmaTest: false,
      isRaceDay: false,
      coachNotes:
        'Améliore l’économie de foulée et protège genoux, hanches et tendons d’Achille.',
      exercises: [
        makeEx(
          'run-ef-pre-ppg',
          'Footing souple en endurance fondamentale',
          'running',
          1,
          1500,
          1,
          0,
          90,
          zones
            ? `Zone EF : ${formatPaceMinPerKm(zones.efMinSecPerKm)} – ${formatPaceMinPerKm(zones.efMaxSecPerKm)}.`
            : 'Allure confortable (parler facilement).'
        ),
        makeEx(
          'str-fentes-runner',
          'Fentes marchées & montées de genou dynamiques',
          'strength',
          12,
          0,
          3,
          20,
          60,
          '12 reps par jambe, buste droit.'
        ),
        makeEx(
          'str-gainage-core',
          'Gainage planche + pont fessier unipodal',
          'strength',
          1,
          45,
          3,
          15,
          45,
          'Stabilité du bassin pour une foulée efficace.'
        ),
        makeEx(
          'str-mollets-plyo',
          'Élévations mollets excentriques sur marche',
          'strength',
          15,
          0,
          3,
          15,
          45,
          'Descente lente en 3 sec pour prévenir les tendinites.'
        ),
      ],
    };
  }

  if (role === 'long_run') {
    const baseMinutes =
      distance === '5km'
        ? 45
        : distance === '10km'
          ? 60
          : distance === '21km'
            ? 75
            : 95;
    const addedMinutes = isRecoveryWeek
      ? 0
      : Math.min(
          distance === '42km' ? 75 : distance === '21km' ? 35 : 20,
          weekNumber * (distance === '42km' ? 7 : 3)
        );
    const totalMin = baseMinutes + addedMinutes;
    const finishSpecificMin = weekNumber >= 6 ? Math.min(25, 10 + weekNumber) : 0;
    const efMin = totalMin - finishSpecificMin;

    return {
      title: `Sortie longue · ${totalMin} min${finishSpecificMin > 0 ? ' (fin progressive)' : ''}`,
      focusZone: 'long_run',
      focusLabel: 'Sortie longue',
      durationMinutes: totalMin,
      isVmaTest: false,
      isRaceDay: false,
      coachNotes:
        'Pilier de l’endurance aérobie : partez sans excès de vitesse en EF Z2.',
      exercises: [
        makeEx(
          'run-long-ef',
          'Bloc principal en Endurance Fondamentale (Z2)',
          'running',
          1,
          efMin * 60,
          1,
          0,
          0,
          zones
            ? `Rester entre ${formatPaceMinPerKm(zones.efMinSecPerKm)} et ${formatPaceMinPerKm(zones.efMaxSecPerKm)}.`
            : 'Allure douce, respiration nasale/aisée.'
        ),
        ...(finishSpecificMin > 0
          ? [
              makeEx(
                'run-long-finish',
                `Final progressif à allure ${RUNNING_DISTANCE_TEMPLATES[distance].shortLabel}`,
                'running',
                1,
                finishSpecificMin * 60,
                1,
                0,
                0,
                zones
                  ? `Accélération contrôlée vers ${formatPaceMinPerKm(
                      distance === '42km'
                        ? zones.as42SecPerKm
                        : distance === '21km'
                          ? zones.as21SecPerKm
                          : zones.seuilSecPerKm
                    )}.`
                  : 'Terminez avec un rythme dynamique sans sprint.'
              ),
            ]
          : []),
      ],
    };
  }

  // ef_recovery
  return {
    title: 'Footing d’assimilation en Endurance Fondamentale',
    focusZone: 'ef',
    focusLabel: 'Endurance Z2',
    durationMinutes: 40,
    isVmaTest: false,
    isRaceDay: false,
    coachNotes: 'Séance d’assimilation pure pour développer la capillarisation sans fatigue.',
    exercises: [
      makeEx(
        'run-ef-recovery',
        'Footing continu facile en Z2',
        'running',
        1,
        2100,
        1,
        0,
        0,
        zones
          ? `Allure stricte : ${formatPaceMinPerKm(zones.efMinSecPerKm)} – ${formatPaceMinPerKm(zones.efMaxSecPerKm)}.`
          : 'Allure très facile.'
      ),
      makeEx(
        'mob-recovery',
        'Mobilité douce & relâchement',
        'mobility',
        8,
        30,
        2,
        15,
        30,
        'Respiration profonde.'
      ),
    ],
  };
}

export function generateRunningProgramSessions(
  program: TrainingProgram
): GeneratedProgramSession[] {
  const startDate = program.startAt?.toDate ? program.startAt.toDate() : new Date();
  const sessionsPerWeek = Math.min(
    VALIDATION_LIMITS.PROGRAM_SESSIONS_PER_WEEK_MAX,
    Math.max(
      VALIDATION_LIMITS.PROGRAM_SESSIONS_PER_WEEK_MIN,
      program.sessionsPerWeek || 3
    )
  );
  const weekDates = computeWeekDates(
    startDate,
    sessionsPerWeek,
    program.preferredDays || getDefaultPreferredDays(sessionsPerWeek)
  );

  const zones =
    program.vmaTestStatus === 'completed' && program.vmaKmh >= VALIDATION_LIMITS.PROGRAM_VMA_MIN_KMH
      ? computeVmaPaceZones(
          program.vmaKmh,
          program.distance,
          program.targetTimeSeconds
        )
      : null;

  const completedSet = new Set(program.completedSessionKeys || []);
  const sessions: GeneratedProgramSession[] = [];

  for (let w = 0; w < VALIDATION_LIMITS.PROGRAM_DURATION_WEEKS; w += 1) {
    const weekNumber = w + 1;
    const dates = weekDates[w];
    const phaseLabel = getPhaseForWeek(program.distance, weekNumber);

    for (let s = 0; s < dates.length; s += 1) {
      const key = `w${weekNumber}-s${s + 1}`;
      const workout = buildWorkoutForSlot({
        distance: program.distance,
        weekNumber,
        slotIndex: s,
        sessionsPerWeek: dates.length,
        zones,
      });
      const paceInfo = paceInfoForZone(
        workout.focusZone,
        program.distance,
        zones
      );

      sessions.push({
        key,
        programId: program.id,
        weekNumber,
        sessionIndexInWeek: s + 1,
        phaseLabel,
        scheduledDate: dates[s],
        durationMinutes: workout.durationMinutes,
        title: workout.title,
        discipline: 'Course à pied',
        focusZone: workout.focusZone,
        focusLabel: workout.focusLabel,
        isVmaTest: workout.isVmaTest,
        isRaceDay: workout.isRaceDay,
        targetPaceLabel: paceInfo.label,
        targetPaceRangeLabel: paceInfo.range,
        coachNotes: workout.coachNotes,
        exercises: workout.exercises,
        completed: completedSet.has(key),
      });
    }
  }

  return sessions;
}
