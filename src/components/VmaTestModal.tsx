import { FormEvent, useMemo, useState } from 'react';
import { Activity, CheckCircle2, Gauge, Info, X } from 'lucide-react';
import { TrainingProgram, VALIDATION_LIMITS } from '../types';
import { submitTrainingProgramVmaTest } from '../services/firestoreService';
import {
  computeVmaFromTest,
  computeVmaPaceZones,
  formatDurationHMS,
  formatPaceMinPerKm,
  formatPreferredDaysShort,
  getProgramAutoSendConfig,
  paceSecToKmh,
  RUNNING_DISTANCE_TEMPLATES,
} from '../utils/runningProgramGenerator';

interface VmaTestModalProps {
  program: TrainingProgram;
  isCoach?: boolean;
  nowMs?: number;
  onClose: () => void;
  onSubmitted?: (vmaKmh: number) => void;
}

export function VmaTestModal({
  program,
  onClose,
  onSubmitted,
}: VmaTestModalProps) {
  const [inputMode, setInputMode] = useState<'demicooper' | 'direct'>(
    program.vmaTestDistanceMeters > 0 ? 'demicooper' : 'demicooper'
  );
  const [distanceMeters, setDistanceMeters] = useState<number>(
    program.vmaTestDistanceMeters > 0 ? program.vmaTestDistanceMeters : 1200
  );
  const [durationSeconds, setDurationSeconds] = useState<number>(
    program.vmaTestDurationSeconds > 0 ? program.vmaTestDurationSeconds : 360
  );
  const [directVmaKmh, setDirectVmaKmh] = useState<string>(
    program.vmaKmh > 0 ? String(program.vmaKmh) : '12.0'
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tpl = RUNNING_DISTANCE_TEMPLATES[program.distance];
  const chosenDaysLabel = formatPreferredDaysShort(
    program.preferredDays,
    program.sessionsPerWeek
  );
  const autoSendConfig = getProgramAutoSendConfig(program);

  const computedVma = useMemo(() => {
    if (inputMode === 'direct') {
      const parsed = Number(directVmaKmh.replace(',', '.'));
      if (!Number.isFinite(parsed)) return 0;
      return Math.round(parsed * 10) / 10;
    }
    return computeVmaFromTest(distanceMeters, durationSeconds);
  }, [inputMode, directVmaKmh, distanceMeters, durationSeconds]);

  const isVmaValid =
    computedVma >= VALIDATION_LIMITS.PROGRAM_VMA_MIN_KMH &&
    computedVma <= VALIDATION_LIMITS.PROGRAM_VMA_MAX_KMH;

  const previewZones = useMemo(() => {
    if (!isVmaValid) return null;
    return computeVmaPaceZones(
      computedVma,
      program.distance,
      program.targetTimeSeconds
    );
  }, [isVmaValid, computedVma, program.distance, program.targetTimeSeconds]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isVmaValid) {
      setError(
        `La VMA doit être comprise entre ${VALIDATION_LIMITS.PROGRAM_VMA_MIN_KMH} et ${VALIDATION_LIMITS.PROGRAM_VMA_MAX_KMH} km/h.`
      );
      return;
    }

    setSaving(true);
    try {
      const savedVma = await submitTrainingProgramVmaTest({
        program,
        distanceMeters: inputMode === 'demicooper' ? distanceMeters : undefined,
        durationSeconds:
          inputMode === 'demicooper' ? durationSeconds : undefined,
        directVmaKmh: inputMode === 'direct' ? computedVma : undefined,
      });
      onSubmitted?.(savedVma);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Impossible d’enregistrer le test VMA.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="vma-test-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-xs dark:bg-black/75"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[16px] border border-slate-200 bg-white p-5 shadow-2xl dark:border-[#262626] dark:bg-[#161616] sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4 dark:border-[#262626]">
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-emerald-50 text-emerald-700 dark:bg-[#4ADE80]/15 dark:text-[#4ADE80]">
              <Gauge className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2
                id="vma-test-title"
                className="font-display text-lg font-bold text-slate-900 dark:text-[#E5E5E5]"
              >
                Test VMA · Effectuable n’importe quel jour
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-[#8E8E8E] tabular-nums">
                {program.title} · Objectif {tpl.shortLabel} en{' '}
                {formatDurationHMS(program.targetTimeSeconds)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer la fenêtre du test VMA"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-slate-400 hover:bg-slate-100 hover:text-slate-800 dark:text-[#8E8E8E] dark:hover:bg-[#1F1F1F] dark:hover:text-[#E5E5E5] cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="flex items-start gap-2.5 rounded-[12px] border border-emerald-200 bg-emerald-50/80 p-3.5 text-xs text-emerald-950 dark:border-[#4ADE80]/30 dark:bg-[#4ADE80]/10 dark:text-[#E5E5E5]">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700 dark:text-[#4ADE80]" aria-hidden="true" />
            <p>
              Seule la séance <strong>Test VMA</strong> peut être effectuée n’importe quel jour.
              Tant que ce test n’est pas validé, l’envoi du programme reste en attente.
              Dès validation, vous recevez immédiatement la <strong>Semaine 1</strong> (jours choisis :{' '}
              <strong>{chosenDaysLabel}</strong>), puis la Semaine 2 le <strong>{autoSendConfig.label}</strong> et ainsi de suite chaque {autoSendConfig.label}.
            </p>
          </div>

          {/* Protocol explainer */}
          <div className="rounded-[12px] border border-slate-200 bg-slate-50/70 p-3.5 text-xs text-slate-700 dark:border-[#262626] dark:bg-[#1F1F1F] dark:text-[#A3A3A3]">
            <p className="font-bold text-slate-900 dark:text-[#E5E5E5]">
              Protocole Demi-Cooper (6 minutes)
            </p>
            <p className="mt-1 leading-relaxed tabular-nums">
              Après 15 min d’échauffement souple, courez la plus grande distance possible pendant
              6 minutes à allure régulière. Votre VMA calibre automatiquement toutes vos séances
              des {program.durationWeeks || 12} semaines.
            </p>
          </div>

          {/* Mode switch */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setInputMode('demicooper')}
              className={`rounded-[10px] border px-3 py-2 text-xs font-semibold cursor-pointer ${
                inputMode === 'demicooper'
                  ? 'border-emerald-600 bg-emerald-50 text-emerald-900 dark:border-[#4ADE80] dark:bg-[#4ADE80]/15 dark:text-[#4ADE80]'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-[#262626] dark:bg-[#1F1F1F] dark:text-[#A3A3A3] dark:hover:text-[#E5E5E5]'
              }`}
            >
              Calculer depuis distance & durée
            </button>
            <button
              type="button"
              onClick={() => setInputMode('direct')}
              className={`rounded-[10px] border px-3 py-2 text-xs font-semibold cursor-pointer ${
                inputMode === 'direct'
                  ? 'border-emerald-600 bg-emerald-50 text-emerald-900 dark:border-[#4ADE80] dark:bg-[#4ADE80]/15 dark:text-[#4ADE80]'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-[#262626] dark:bg-[#1F1F1F] dark:text-[#A3A3A3] dark:hover:text-[#E5E5E5]'
              }`}
            >
              Saisir la VMA (km/h) directement
            </button>
          </div>

          {inputMode === 'demicooper' ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="vma-distance"
                  className="block text-xs font-semibold text-slate-700 dark:text-[#A3A3A3]"
                >
                  Distance parcourue (mètres) *
                </label>
                <input
                  id="vma-distance"
                  type="number"
                  min={400}
                  max={5000}
                  step={10}
                  required
                  value={distanceMeters}
                  onChange={(e) =>
                    setDistanceMeters(Math.max(0, Math.round(Number(e.target.value) || 0)))
                  }
                  className="mt-1 min-h-[42px] w-full rounded-[10px] border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 tabular-nums focus:border-emerald-600 focus:outline-none dark:border-[#262626] dark:bg-[#1F1F1F] dark:text-[#E5E5E5] dark:focus:border-[#4ADE80]"
                />
                <span className="text-[11px] text-slate-500 dark:text-[#8E8E8E] tabular-nums">
                  Ex. 1200 m en 6 min = 12.0 km/h · 1500 m = 15.0 km/h
                </span>
              </div>

              <div>
                <label
                  htmlFor="vma-duration"
                  className="block text-xs font-semibold text-slate-700 dark:text-[#A3A3A3]"
                >
                  Durée du test (secondes) *
                </label>
                <input
                  id="vma-duration"
                  type="number"
                  min={180}
                  max={1800}
                  step={30}
                  required
                  value={durationSeconds}
                  onChange={(e) =>
                    setDurationSeconds(Math.max(60, Math.round(Number(e.target.value) || 360)))
                  }
                  className="mt-1 min-h-[42px] w-full rounded-[10px] border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 tabular-nums focus:border-emerald-600 focus:outline-none dark:border-[#262626] dark:bg-[#1F1F1F] dark:text-[#E5E5E5] dark:focus:border-[#4ADE80]"
                />
                <span className="text-[11px] text-slate-500 dark:text-[#8E8E8E] tabular-nums">
                  360 sec = 6 min (Demi-Cooper standard)
                </span>
              </div>
            </div>
          ) : (
            <div>
              <label
                htmlFor="vma-direct"
                className="block text-xs font-semibold text-slate-700 dark:text-[#A3A3A3]"
              >
                VMA mesurée (km/h) *
              </label>
              <input
                id="vma-direct"
                type="number"
                min={VALIDATION_LIMITS.PROGRAM_VMA_MIN_KMH}
                max={VALIDATION_LIMITS.PROGRAM_VMA_MAX_KMH}
                step="0.1"
                required
                value={directVmaKmh}
                onChange={(e) => setDirectVmaKmh(e.target.value)}
                className="mt-1 min-h-[42px] w-full rounded-[10px] border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 tabular-nums focus:border-emerald-600 focus:outline-none dark:border-[#262626] dark:bg-[#1F1F1F] dark:text-[#E5E5E5] dark:focus:border-[#4ADE80]"
              />
            </div>
          )}

          {/* Computed Pace Zones Preview */}
          <div className="rounded-[12px] border border-slate-200 bg-white p-4 dark:border-[#262626] dark:bg-[#1F1F1F]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-[#262626]">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-emerald-700 dark:text-[#4ADE80]" aria-hidden="true" />
                <span className="font-display text-sm font-bold text-slate-900 dark:text-[#E5E5E5] tabular-nums">
                  Allures calculées pour les {program.durationWeeks || 12} semaines
                </span>
              </div>
              <span className="text-base font-bold text-emerald-700 dark:text-[#4ADE80] tabular-nums">
                {isVmaValid ? `VMA ${computedVma.toFixed(1)} km/h` : 'VMA invalide'}
              </span>
            </div>

            {previewZones ? (
              <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {[
                  {
                    label: 'EF Z2 (65–72%)',
                    pace: `${formatPaceMinPerKm(previewZones.efMinSecPerKm)} – ${formatPaceMinPerKm(previewZones.efMaxSecPerKm)}`,
                    sub: 'Footing & sorties longues',
                  },
                  {
                    label: 'Seuil (86%)',
                    pace: formatPaceMinPerKm(previewZones.seuilSecPerKm),
                    sub: `${paceSecToKmh(previewZones.seuilSecPerKm)} km/h`,
                  },
                  {
                    label: `Allure ${tpl.shortLabel}`,
                    pace: formatPaceMinPerKm(
                      program.distance === '5km'
                        ? previewZones.as5SecPerKm
                        : program.distance === '10km'
                          ? previewZones.as10SecPerKm
                          : program.distance === '21km'
                            ? previewZones.as21SecPerKm
                            : previewZones.as42SecPerKm
                    ),
                    sub: `Obj. chrono ${formatPaceMinPerKm(previewZones.targetRacePaceSecPerKm)}`,
                  },
                  {
                    label: 'VMA 100%',
                    pace: formatPaceMinPerKm(previewZones.vma100SecPerKm),
                    sub: `${previewZones.vmaKmh.toFixed(1)} km/h`,
                  },
                ].map((z) => (
                  <div
                    key={z.label}
                    className="rounded-[10px] border border-slate-200 bg-slate-50/70 p-2.5 dark:border-[#262626] dark:bg-[#161616]"
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-[#8E8E8E]">
                      {z.label}
                    </p>
                    <p className="mt-0.5 text-xs font-bold text-slate-900 dark:text-[#E5E5E5] tabular-nums">
                      {z.pace}
                    </p>
                    <p className="mt-0.5 truncate text-[10px] text-emerald-700 dark:text-[#4ADE80] tabular-nums">
                      {z.sub}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs text-rose-600 dark:text-rose-400 tabular-nums">
                Renseignez une valeur produisant une VMA entre 6.0 et 26.0 km/h.
              </p>
            )}
          </div>

          {error && (
            <div className="rounded-[10px] border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-200">
              {error}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4 dark:border-[#262626]">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] rounded-[10px] border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-[#262626] dark:bg-[#1F1F1F] dark:text-[#E5E5E5] dark:hover:bg-[#262626] cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving || !isVmaValid}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-[10px] bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800 dark:bg-[#4ADE80] dark:text-[#0A0A0A] dark:hover:bg-[#22C55E] disabled:opacity-60 cursor-pointer"
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              {saving
                ? 'Calcul des allures...'
                : 'Valider la VMA & générer les allures'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
