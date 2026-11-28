import { FormEvent, useState } from 'react';
import {
  CheckCircle2,
  CreditCard,
  Download,
  Lock,
  MapPin,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  EventPaymentMode,
  MemberScheduleSession,
  TrainingProgram,
} from '../types';
import {
  payMemberScheduleSession,
  payTrainingProgram,
} from '../services/firestoreService';
import {
  formatFrenchDateLong,
  formatPriceEuros,
} from '../utils/dateAndValidation';
import {
  detectCardBrand,
  downloadPaymentReceipt,
  formatCardExpiryInput,
  formatCardNumberInput,
  sanitizeCardDigits,
  validateCardCvc,
  validateCardExpiry,
  validateLuhn,
} from '../utils/paymentHelpers';

export type PayableProgramTarget =
  | { kind: 'program'; program: TrainingProgram }
  | { kind: 'session'; session: MemberScheduleSession };

interface ProgramPaymentModalProps {
  target: PayableProgramTarget;
  onClose: () => void;
  onPaid?: (message: string) => void;
}

export function ProgramPaymentModal({
  target,
  onClose,
  onPaid,
}: ProgramPaymentModalProps) {
  const isProgram = target.kind === 'program';
  const title = isProgram ? target.program.title : target.session.title;
  const priceCents = isProgram
    ? target.program.priceCents
    : target.session.priceCents ?? 900;
  const paymentMode: EventPaymentMode = isProgram
    ? target.program.paymentMode
    : target.session.paymentMode ?? 'both';
  const paymentStatus = isProgram
    ? target.program.paymentStatus
    : target.session.paymentStatus ?? 'pending';
  const paymentMethod = isProgram
    ? target.program.paymentMethod
    : target.session.paymentMethod ?? '';
  const paymentReference = isProgram
    ? target.program.paymentReference
    : target.session.paymentReference ?? '';
  const memberName = isProgram
    ? target.program.memberName
    : target.session.memberName;
  const memberEmail = isProgram
    ? target.program.memberEmail
    : target.session.memberEmail;
  const coachName = isProgram
    ? target.program.coachName
    : target.session.coachName || 'Coach';
  const startAt = isProgram ? target.program.startAt : target.session.startAt;

  const canPayOnline = paymentMode === 'online' || paymentMode === 'both';
  const canPayOnsite = paymentMode === 'onsite' || paymentMode === 'both';

  const [selectedMethod, setSelectedMethod] = useState<'card' | 'onsite'>(() =>
    canPayOnline ? 'card' : 'onsite'
  );
  const [cardHolder, setCardHolder] = useState(memberName);
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cardDigits = sanitizeCardDigits(cardNumber);
  const cardBrand = detectCardBrand(cardDigits);

  const handleDownloadReceipt = () => {
    downloadPaymentReceipt({
      event: {
        id: isProgram ? target.program.id : target.session.id,
        title,
        discipline: isProgram
          ? `Programme running ${target.program.durationWeeks || 12} semaines`
          : target.session.discipline,
        location: isProgram ? 'Suivi personnalisé en ligne / piste' : target.session.location || 'Suivi personnalisé',
        city: 'GetFitNow',
        startAt,
        coachName,
      },
      memberName,
      memberEmail,
      amountCents: priceCents,
      method: paymentMethod === 'card' ? 'card' : 'onsite',
      status: paymentStatus === 'paid' ? 'paid' : 'pending',
      reference: paymentReference || 'GFN-PROGRAM',
      cardBrand: isProgram ? target.program.cardBrand : target.session.cardBrand,
      cardLast4: isProgram ? target.program.cardLast4 : target.session.cardLast4,
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (selectedMethod === 'card') {
      if (!canPayOnline) {
        setError('Le paiement en ligne n’est pas activé pour ce programme.');
        return;
      }
      if (!cardHolder.trim() || cardHolder.trim().length < 2) {
        setError('Veuillez saisir le nom du titulaire de la carte.');
        return;
      }
      if (!validateLuhn(cardDigits)) {
        setError('Numéro de carte bancaire invalide.');
        return;
      }
      if (!validateCardExpiry(cardExpiry)) {
        setError('Date d’expiration invalide ou expirée (MM/AA).');
        return;
      }
      if (!validateCardCvc(cardCvc, cardBrand)) {
        setError('Code CVC invalide.');
        return;
      }
    } else if (!canPayOnsite) {
      setError('Le règlement sur place n’est pas proposé pour ce programme.');
      return;
    }

    setSubmitting(true);
    try {
      const last4 = cardDigits.slice(-4);
      if (isProgram) {
        await payTrainingProgram({
          program: target.program,
          method: selectedMethod,
          cardBrand: selectedMethod === 'card' ? cardBrand : undefined,
          cardLast4: selectedMethod === 'card' ? last4 : undefined,
        });
      } else {
        await payMemberScheduleSession({
          session: target.session,
          method: selectedMethod,
          cardBrand: selectedMethod === 'card' ? cardBrand : undefined,
          cardLast4: selectedMethod === 'card' ? last4 : undefined,
        });
      }
      onPaid?.(
        selectedMethod === 'card'
          ? isProgram
            ? `Paiement de ${formatPriceEuros(priceCents)} confirmé. Votre Semaine 1 vient d’être envoyée ! Les semaines suivantes seront envoyées à la fin de chaque semaine.`
            : `Paiement de ${formatPriceEuros(priceCents)} confirmé. Votre séance personnalisée est débloquée !`
          : 'Demande de règlement sur place enregistrée. Votre coach activera le programme dès réception du paiement.'
      );
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Impossible d’enregistrer le paiement pour le moment.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="program-payment-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 dark:bg-black/75 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-[16px] border border-slate-200 bg-white p-5 shadow-2xl dark:border-[#262626] dark:bg-[#161616] sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4 dark:border-[#262626]">
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-emerald-50 text-emerald-700 dark:bg-[#4ADE80]/10 dark:text-[#4ADE80]">
              <CreditCard className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2
                id="program-payment-title"
                className="font-display text-lg font-bold text-slate-900 dark:text-[#E5E5E5]"
              >
                {paymentStatus === 'paid'
                  ? 'Reçu de paiement du programme'
                  : 'Régler votre programme personnalisé'}
              </h2>
              <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-[#8E8E8E]">
                {title} · Coach {coachName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer la fenêtre de paiement"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-slate-400 hover:bg-slate-100 hover:text-slate-800 dark:text-[#8E8E8E] dark:hover:bg-[#1F1F1F] dark:hover:text-[#E5E5E5] cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Summary strip */}
        <div className="mt-4 flex items-center justify-between gap-3 rounded-[10px] border border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-[#262626] dark:bg-[#1F1F1F]">
          <div className="min-w-0 text-xs">
            <p className="font-semibold text-slate-900 dark:text-[#E5E5E5]">
              {isProgram
                ? `Plan ${target.program.distance.toUpperCase()} · ${target.program.durationWeeks} semaines (${target.program.sessionsPerWeek} séances/sem.)`
                : `${target.session.discipline} · ${target.session.durationMinutes} min`}
            </p>
            <p className="mt-0.5 text-slate-500 dark:text-[#8E8E8E] capitalize">
              Début : {formatFrenchDateLong(startAt.toDate())}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-[#8E8E8E]">
              Tarif
            </p>
            <p className="text-xl font-bold text-emerald-700 dark:text-[#4ADE80] tabular-nums">
              {formatPriceEuros(priceCents)}
            </p>
          </div>
        </div>

        {paymentStatus === 'paid' ? (
          <div className="mt-5 space-y-4">
            <div className="flex items-start gap-2.5 rounded-[10px] border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-950 dark:border-[#4ADE80]/30 dark:bg-[#4ADE80]/10 dark:text-[#E5E5E5]">
              <CheckCircle2
                className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700 dark:text-[#4ADE80]"
                aria-hidden="true"
              />
              <div>
                <p className="font-bold">
                  {isProgram
                    ? 'Programme réglé · Envoi semaine par semaine actif'
                    : 'Programme réglé et actif'}
                </p>
                <p className="mt-0.5 text-emerald-800 dark:text-[#A3A3A3]">
                  Référence : <span className="font-semibold tabular-nums dark:text-[#E5E5E5]">{paymentReference}</span>
                  {isProgram
                    ? ' · Semaine 1 envoyée dès le règlement, puis chaque semaine suivante à la fin de la précédente.'
                    : ''}
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={handleDownloadReceipt}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-[10px] border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-[#262626] dark:bg-[#1F1F1F] dark:text-[#E5E5E5] dark:hover:bg-[#262626] cursor-pointer"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                Télécharger le reçu
              </button>
              <button
                type="button"
                onClick={onClose}
                className="min-h-[40px] rounded-[10px] bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800 dark:bg-[#4ADE80] dark:text-[#0A0A0A] dark:hover:bg-[#22C55E] cursor-pointer"
              >
                Fermer
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            {canPayOnline && canPayOnsite && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedMethod('card')}
                  className={`flex items-center justify-center gap-2 rounded-[10px] border px-3 py-2.5 text-xs font-semibold transition-colors cursor-pointer ${
                    selectedMethod === 'card'
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-900 dark:border-[#4ADE80] dark:bg-[#4ADE80]/15 dark:text-[#4ADE80]'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-[#262626] dark:bg-[#1F1F1F] dark:text-[#A3A3A3]'
                  }`}
                >
                  <CreditCard className="h-4 w-4" aria-hidden="true" />
                  <span>Carte bancaire</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedMethod('onsite')}
                  className={`flex items-center justify-center gap-2 rounded-[10px] border px-3 py-2.5 text-xs font-semibold transition-colors cursor-pointer ${
                    selectedMethod === 'onsite'
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-900 dark:border-[#4ADE80] dark:bg-[#4ADE80]/15 dark:text-[#4ADE80]'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-[#262626] dark:bg-[#1F1F1F] dark:text-[#A3A3A3]'
                  }`}
                >
                  <MapPin className="h-4 w-4" aria-hidden="true" />
                  <span>Sur place (coach)</span>
                </button>
              </div>
            )}

            {selectedMethod === 'card' && canPayOnline ? (
              <div className="space-y-3 rounded-[12px] border border-slate-200 bg-slate-50 p-4 dark:border-[#262626] dark:bg-[#1F1F1F]">
                <div className="flex items-center justify-between text-xs text-slate-600 dark:text-[#A3A3A3]">
                  <span className="inline-flex items-center gap-1.5 font-semibold">
                    <Lock className="h-3.5 w-3.5 text-emerald-600 dark:text-[#4ADE80]" aria-hidden="true" />
                    Paiement sécurisé par carte
                  </span>
                  <span className="text-[11px] font-bold text-slate-700 dark:text-[#E5E5E5] tabular-nums">
                    {cardBrand}
                  </span>
                </div>

                <div>
                  <label
                    htmlFor="pgm-card-holder"
                    className="block text-xs font-semibold text-slate-700 dark:text-[#A3A3A3]"
                  >
                    Titulaire de la carte *
                  </label>
                  <input
                    id="pgm-card-holder"
                    type="text"
                    required
                    value={cardHolder}
                    onChange={(e) => setCardHolder(e.target.value)}
                    className="mt-1 min-h-[40px] w-full rounded-[10px] border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none dark:border-[#262626] dark:bg-[#161616] dark:text-[#E5E5E5] dark:placeholder:text-[#525252] dark:focus:border-[#4ADE80]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="pgm-card-number"
                    className="block text-xs font-semibold text-slate-700 dark:text-[#A3A3A3]"
                  >
                    Numéro de carte *
                  </label>
                  <input
                    id="pgm-card-number"
                    type="text"
                    inputMode="numeric"
                    required
                    value={cardNumber}
                    onChange={(e) =>
                      setCardNumber(formatCardNumberInput(e.target.value))
                    }
                    placeholder="4532 •••• •••• ••••"
                    className="mt-1 min-h-[40px] w-full rounded-[10px] border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 tabular-nums focus:border-emerald-600 focus:outline-none dark:border-[#262626] dark:bg-[#161616] dark:text-[#E5E5E5] dark:placeholder:text-[#525252] dark:focus:border-[#4ADE80]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="pgm-card-expiry"
                      className="block text-xs font-semibold text-slate-700 dark:text-[#A3A3A3]"
                    >
                      Expiration (MM/AA) *
                    </label>
                    <input
                      id="pgm-card-expiry"
                      type="text"
                      inputMode="numeric"
                      required
                      value={cardExpiry}
                      onChange={(e) =>
                        setCardExpiry(formatCardExpiryInput(e.target.value))
                      }
                      placeholder="12/28"
                      className="mt-1 min-h-[40px] w-full rounded-[10px] border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 tabular-nums focus:border-emerald-600 focus:outline-none dark:border-[#262626] dark:bg-[#161616] dark:text-[#E5E5E5] dark:placeholder:text-[#525252] dark:focus:border-[#4ADE80]"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="pgm-card-cvc"
                      className="block text-xs font-semibold text-slate-700 dark:text-[#A3A3A3]"
                    >
                      CVC *
                    </label>
                    <input
                      id="pgm-card-cvc"
                      type="text"
                      inputMode="numeric"
                      required
                      maxLength={4}
                      value={cardCvc}
                      onChange={(e) =>
                        setCardCvc(e.target.value.replace(/\D/g, '').slice(0, 4))
                      }
                      placeholder="123"
                      className="mt-1 min-h-[40px] w-full rounded-[10px] border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 tabular-nums focus:border-emerald-600 focus:outline-none dark:border-[#262626] dark:bg-[#161616] dark:text-[#E5E5E5] dark:placeholder:text-[#525252] dark:focus:border-[#4ADE80]"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-[12px] border border-amber-200 bg-amber-50/90 p-4 text-xs text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200">
                <p className="font-bold">Règlement sur place auprès du coach</p>
                <p className="mt-1 leading-relaxed text-amber-900/90 dark:text-amber-200/85">
                  Votre programme reste en attente jusqu’à validation de votre
                  règlement de {formatPriceEuros(priceCents)} par votre coach.
                </p>
              </div>
            )}

            {error && (
              <div className="rounded-[10px] border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-200">
                {error}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-[#262626]">
              <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-[#8E8E8E]">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-[#4ADE80]" aria-hidden="true" />
                Déblocage immédiat par carte
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-[40px] rounded-[10px] border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-[#262626] dark:bg-[#1F1F1F] dark:text-[#E5E5E5] cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-[10px] bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800 dark:bg-[#4ADE80] dark:text-[#0A0A0A] dark:hover:bg-[#22C55E] disabled:opacity-60 cursor-pointer"
                >
                  {submitting
                    ? 'Traitement...'
                    : selectedMethod === 'card'
                      ? `Payer ${formatPriceEuros(priceCents)}`
                      : 'Confirmer paiement sur place'}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
