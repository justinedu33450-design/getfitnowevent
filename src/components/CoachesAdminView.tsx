import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  Award,
  CheckCircle2,
  Clock,
  FileText,
  LogOut,
  Mail,
  MapPin,
  Phone,
  Power,
  Save,
  Send,
  Shield,
  ShieldCheck,
  ShieldOff,
  Trash2,
  UserCheck,
  UserCog,
  UserPlus,
  X,
  XCircle,
} from 'lucide-react';
import { User } from 'firebase/auth';
import {
  CoachAccessRequest,
  CoachAdminInvite,
  CoachAdminRequestStatus,
  CoachAdminUser,
  CoachRole,
  VALIDATION_LIMITS,
} from '../types';
import {
  addCoachMember,
  approveCoachAccessRequest,
  deleteCoachAccessRequest,
  deleteCoachAdmin,
  deleteCoachInvite,
  rejectCoachAccessRequest,
  requestCoachAdminPromotion,
  setCoachAdminActive,
  setCoachInviteStatus,
  setCoachRole,
  updateMyCoachProfile,
} from '../services/firestoreService';
import { formatFrenchDateShort } from '../utils/dateAndValidation';
import { PhotoUploadField, ProfileAvatar } from './ProfileAvatar';
import { PasswordSettingsCard } from './PasswordSettingsCard';

interface CoachesAdminViewProps {
  currentAdminUser: User;
  isCoachAdmin: boolean;
  admins: CoachAdminUser[];
  requests: CoachAccessRequest[];
  invites: CoachAdminInvite[];
  onSignOut: () => void;
}

export function CoachesAdminView({
  currentAdminUser,
  isCoachAdmin,
  admins,
  requests,
  invites,
  onSignOut,
}: CoachesAdminViewProps) {
  const myAdminRecord = useMemo(
    () => admins.find((a) => a.id === currentAdminUser.uid) ?? null,
    [admins, currentAdminUser.uid]
  );

  // Coach personal info sheet state
  const [profileName, setProfileName] = useState(
    currentAdminUser.displayName || ''
  );
  const [profilePhone, setProfilePhone] = useState('');
  const [profileSpecialty, setProfileSpecialty] = useState('');
  const [profileCity, setProfileCity] = useState('');
  const [profileRegion, setProfileRegion] = useState('');
  const [profileCertifications, setProfileCertifications] = useState('');
  const [profileBio, setProfileBio] = useState('');
  const [profilePhotoUrl, setProfilePhotoUrl] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileFeedback, setProfileFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [inspectedCoach, setInspectedCoach] = useState<CoachAdminUser | null>(
    null
  );

  useEffect(() => {
    if (!myAdminRecord) {
      setProfileName(currentAdminUser.displayName || '');
      return;
    }
    setProfileName(myAdminRecord.displayName || currentAdminUser.displayName || '');
    setProfilePhone(myAdminRecord.phone || '');
    setProfileSpecialty(myAdminRecord.specialty || '');
    setProfileCity(myAdminRecord.city || '');
    setProfileRegion(myAdminRecord.region || '');
    setProfileCertifications(myAdminRecord.certifications || '');
    setProfileBio(myAdminRecord.bio || '');
    setProfilePhotoUrl(myAdminRecord.photoUrl || '');
  }, [
    myAdminRecord?.id,
    myAdminRecord?.displayName,
    myAdminRecord?.phone,
    myAdminRecord?.specialty,
    myAdminRecord?.city,
    myAdminRecord?.region,
    myAdminRecord?.certifications,
    myAdminRecord?.bio,
    myAdminRecord?.photoUrl,
    currentAdminUser.displayName,
  ]);

  const [nominationName, setNominationName] = useState('');
  const [nominationEmail, setNominationEmail] = useState('');
  const [nominating, setNominating] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteAdminId, setConfirmDeleteAdminId] = useState<string | null>(
    null
  );
  const [confirmDeleteInviteId, setConfirmDeleteInviteId] = useState<
    string | null
  >(null);

  const [requestingAdmin, setRequestingAdmin] = useState(false);

  const pendingRequests = useMemo(
    () => requests.filter((r) => r.status === 'pending'),
    [requests]
  );

  const pendingAdminPromotions = useMemo(
    () =>
      admins.filter(
        (a) =>
          a.active &&
          !a.isPrimary &&
          a.role === 'coach' &&
          a.adminRequestStatus === 'pending'
      ),
    [admins]
  );

  const processedRequests = useMemo(
    () => requests.filter((r) => r.status !== 'pending'),
    [requests]
  );

  const activeInvites = useMemo(
    () => invites.filter((inv) => inv.status !== 'claimed'),
    [invites]
  );

  const activeCoachesCount = useMemo(
    () => admins.filter((a) => a.active).length,
    [admins]
  );
  const adminCoachesCount = useMemo(
    () =>
      admins.filter((a) => a.active && (a.isPrimary || a.role === 'coach_admin'))
        .length,
    [admins]
  );

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setProfileFeedback(null);
    setSavingProfile(true);
    try {
      await updateMyCoachProfile({
        user: currentAdminUser,
        displayName: profileName,
        phone: profilePhone,
        specialty: profileSpecialty,
        city: profileCity,
        region: profileRegion,
        certifications: profileCertifications,
        bio: profileBio,
        photoUrl: profilePhotoUrl,
      });
      setProfileFeedback({
        type: 'success',
        text: 'Votre fiche de renseignement coach a été enregistrée.',
      });
    } catch (err) {
      setProfileFeedback({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Impossible d’enregistrer votre fiche coach.',
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleNominate = async (e: FormEvent) => {
    e.preventDefault();
    if (!isCoachAdmin) return;
    setFeedback(null);
    setNominating(true);
    try {
      const outcome = await addCoachMember({
        email: nominationEmail,
        displayName: nominationName,
        adminUser: currentAdminUser,
        existingAdmins: admins,
        existingRequests: requests,
        existingInvites: invites,
      });
      setNominationName('');
      setNominationEmail('');
      if (outcome === 'activated_existing') {
        setFeedback({
          type: 'success',
          text: 'Ce coach existait déjà et son compte vient d’être réactivé (rôle inchangé).',
        });
      } else if (outcome === 'approved_request') {
        setFeedback({
          type: 'success',
          text: 'La demande d’accès correspondante a été approuvée avec le rôle Coach (non administrateur).',
        });
      } else {
        setFeedback({
          type: 'success',
          text: 'Coach ajouté : il recevra le rôle Coach (non administrateur) dès sa connexion Google avec cette adresse.',
        });
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Impossible d’ajouter ce coach.',
      });
    } finally {
      setNominating(false);
    }
  };

  const handleApproveRequest = async (req: CoachAccessRequest) => {
    if (!isCoachAdmin) return;
    setFeedback(null);
    setBusyId(req.id);
    try {
      await approveCoachAccessRequest({
        request: req,
        adminUser: currentAdminUser,
      });
      setFeedback({
        type: 'success',
        text: `${req.displayName} (${req.email}) a été accepté en tant que coach (rôle standard, non administrateur).`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Erreur lors de la validation de la demande.',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleSetCoachRole = async (
    target: CoachAdminUser,
    role: CoachRole,
    adminRequestStatus: CoachAdminRequestStatus = 'none'
  ) => {
    if (!isCoachAdmin) return;
    setFeedback(null);
    setBusyId(target.id);
    try {
      await setCoachRole({
        targetAdmin: target,
        role,
        adminRequestStatus,
        currentAdminUid: currentAdminUser.uid,
      });
      if (role === 'coach_admin') {
        setFeedback({
          type: 'success',
          text: `${target.displayName} a été nommé coach administrateur.`,
        });
      } else if (adminRequestStatus === 'rejected') {
        setFeedback({
          type: 'success',
          text: `La demande d’administration de ${target.displayName} a été refusée.`,
        });
      } else {
        setFeedback({
          type: 'success',
          text: `Les droits administrateur de ${target.displayName} ont été retirés (rôle Coach conservé).`,
        });
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Impossible de modifier le rôle de ce coach.',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleRequestAdminPromotion = async () => {
    setFeedback(null);
    setRequestingAdmin(true);
    try {
      await requestCoachAdminPromotion(currentAdminUser.uid);
      setFeedback({
        type: 'success',
        text: 'Votre demande pour devenir coach administrateur a été transmise aux coachs administrateurs.',
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Impossible d’envoyer la demande administrateur.',
      });
    } finally {
      setRequestingAdmin(false);
    }
  };

  const handleRejectRequest = async (req: CoachAccessRequest) => {
    setFeedback(null);
    setBusyId(req.id);
    try {
      await rejectCoachAccessRequest({
        requestId: req.id,
        adminUser: currentAdminUser,
      });
      setFeedback({
        type: 'success',
        text: `La demande de ${req.displayName} a été refusée.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text:
          err instanceof Error ? err.message : 'Erreur lors du refus de la demande.',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleAdminActive = async (target: CoachAdminUser) => {
    setFeedback(null);
    setBusyId(target.id);
    try {
      await setCoachAdminActive({
        targetAdmin: target,
        active: !target.active,
      });
      setFeedback({
        type: 'success',
        text: target.active
          ? `Le coach ${target.displayName} a été désactivé.`
          : `Le coach ${target.displayName} a été réactivé.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Impossible de modifier le statut du coach.',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteAdmin = async (target: CoachAdminUser) => {
    setFeedback(null);
    setBusyId(target.id);
    try {
      await deleteCoachAdmin({
        targetAdmin: target,
        currentAdminUid: currentAdminUser.uid,
      });
      setConfirmDeleteAdminId(null);
      if (inspectedCoach?.id === target.id) {
        setInspectedCoach(null);
      }
      setFeedback({
        type: 'success',
        text: `Le coach ${target.displayName} a été supprimé de l’application.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Impossible de supprimer ce coach.',
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      {/* Header */}
      <div className="flex flex-col gap-4 border-b border-slate-200 dark:border-slate-800 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-2xl">
            Équipe coachs & fiche personnelle
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {isCoachAdmin
              ? `Connecté en tant que coach administrateur (${currentAdminUser.email}) · Personnalisez votre fiche coach et gérez les accès de l’équipe.`
              : `Connecté en tant que coach (${currentAdminUser.email}) · Personnalisez votre fiche coach et consultez l’équipe.`}
          </p>
        </div>

        <button
          type="button"
          onClick={onSignOut}
          className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white self-start sm:self-auto cursor-pointer"
        >
          <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
          Déconnexion
        </button>
      </div>

      {/* KPI Strip */}
      {isCoachAdmin ? (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Coachs actifs</p>
            <p className="mt-1 font-mono text-2xl font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
              {activeCoachesCount}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Administrateurs</p>
            <p className="mt-1 font-mono text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
              {adminCoachesCount}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Demandes en attente</p>
            <p className="mt-1 font-mono text-2xl font-bold text-amber-600 dark:text-amber-400 tabular-nums">
              {pendingRequests.length + pendingAdminPromotions.length}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Invitations en attente</p>
            <p className="mt-1 font-mono text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
              {activeInvites.filter((i) => i.status === 'pending').length}
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Coachs actifs</p>
            <p className="mt-1 font-mono text-2xl font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
              {activeCoachesCount}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Mon statut</p>
            <p className="mt-1 font-display text-lg font-bold text-slate-900 dark:text-white">
              {myAdminRecord?.adminRequestStatus === 'pending'
                ? 'Coach (admin demandé)'
                : 'Coach'}
            </p>
          </div>
        </div>
      )}

      {/* Section 0: My Coach Info Sheet */}
      <div className="mt-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
        <div className="flex items-start gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900">
            <UserCog className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Ma fiche de renseignement coach
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Personnalisez votre nom affiché sur vos séances, vos spécialités, diplômes, coordonnées et présentation.
            </p>
          </div>
        </div>

        <form onSubmit={handleSaveProfile} className="mt-4 space-y-4">
          <PhotoUploadField
            label="Photo de profil du coach"
            name={profileName || currentAdminUser.email || 'Coach'}
            photoUrl={profilePhotoUrl}
            onChange={setProfilePhotoUrl}
          />

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label
                htmlFor="coach-profile-name"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Nom affiché (sur les séances) *
              </label>
              <input
                id="coach-profile-name"
                type="text"
                required
                minLength={VALIDATION_LIMITS.DISPLAY_NAME_MIN}
                maxLength={VALIDATION_LIMITS.DISPLAY_NAME_MAX}
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                placeholder="Ex. David Frosio"
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
              />
            </div>

            <div>
              <label
                htmlFor="coach-profile-specialty"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Spécialités sportives
              </label>
              <input
                id="coach-profile-specialty"
                type="text"
                maxLength={VALIDATION_LIMITS.SPECIALTY_MAX}
                value={profileSpecialty}
                onChange={(e) => setProfileSpecialty(e.target.value)}
                placeholder="Ex. HIIT, Préparation physique, Running"
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
              />
            </div>

            <div>
              <label
                htmlFor="coach-profile-phone"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Téléphone professionnel
              </label>
              <input
                id="coach-profile-phone"
                type="tel"
                maxLength={VALIDATION_LIMITS.PHONE_MAX}
                value={profilePhone}
                onChange={(e) => setProfilePhone(e.target.value)}
                placeholder="06 12 34 56 78"
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
              />
            </div>

            <div>
              <label
                htmlFor="coach-profile-city"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Ville d’intervention
              </label>
              <input
                id="coach-profile-city"
                type="text"
                maxLength={VALIDATION_LIMITS.CITY_MAX}
                value={profileCity}
                onChange={(e) => setProfileCity(e.target.value)}
                placeholder="Ex. Paris"
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
              />
            </div>

            <div>
              <label
                htmlFor="coach-profile-region"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Région
              </label>
              <input
                id="coach-profile-region"
                type="text"
                maxLength={VALIDATION_LIMITS.REGION_MAX}
                value={profileRegion}
                onChange={(e) => setProfileRegion(e.target.value)}
                placeholder="Ex. Île-de-France"
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
              />
            </div>

            <div>
              <label
                htmlFor="coach-profile-certifications"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Diplômes & certifications
              </label>
              <input
                id="coach-profile-certifications"
                type="text"
                maxLength={VALIDATION_LIMITS.CERTIFICATIONS_MAX}
                value={profileCertifications}
                onChange={(e) => setProfileCertifications(e.target.value)}
                placeholder="Ex. BPJEPS AF, CrossFit Level 1"
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="coach-profile-bio"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
            >
              Présentation & approche pédagogique
            </label>
            <textarea
              id="coach-profile-bio"
              rows={2}
              maxLength={VALIDATION_LIMITS.BIO_MAX}
              value={profileBio}
              onChange={(e) => setProfileBio(e.target.value)}
              placeholder="Décrivez votre parcours, votre méthode d’accompagnement et vos objectifs pour vos groupes..."
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
            />
          </div>

          {profileFeedback && (
            <div
              className={`rounded-lg border p-3 text-xs ${
                profileFeedback.type === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200'
                  : 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200'
              }`}
            >
              {profileFeedback.text}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingProfile}
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-5 py-2 text-xs font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-60 cursor-pointer"
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              {savingProfile ? 'Enregistrement...' : 'Enregistrer ma fiche coach'}
            </button>
          </div>
        </form>
      </div>

      {/* Section 0b: Coach Password Settings */}
      <div className="mt-6">
        <PasswordSettingsCard user={currentAdminUser} />
      </div>

      {/* Section 0c: Standard Coach Admin Status & Promotion Request */}
      {!isCoachAdmin && myAdminRecord && (
        <div className="mt-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                <Shield className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  Droits d’administration
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Vous disposez actuellement du rôle <strong>Coach</strong>. Seul un coach administrateur peut accepter ou refuser de vous nommer administrateur.
                </p>
                {myAdminRecord.adminRequestStatus === 'pending' && (
                  <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                    <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                    Demande en attente de validation par un coach administrateur.
                  </p>
                )}
                {myAdminRecord.adminRequestStatus === 'rejected' && (
                  <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700 dark:text-rose-400">
                    <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                    Votre précédente demande de nomination administrateur a été refusée.
                  </p>
                )}
              </div>
            </div>

            {myAdminRecord.adminRequestStatus !== 'pending' && (
              <button
                type="button"
                disabled={requestingAdmin}
                onClick={() => void handleRequestAdminPromotion()}
                className="inline-flex min-h-[42px] shrink-0 items-center justify-center gap-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 px-4 py-2 text-xs font-semibold text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-white disabled:opacity-60 cursor-pointer"
              >
                <Send className="h-3.5 w-3.5" aria-hidden="true" />
                {requestingAdmin
                  ? 'Envoi...'
                  : 'Demander le rôle administrateur'}
              </button>
            )}
          </div>
        </div>
      )}

      {feedback && (
        <div
          className={`mt-5 rounded-xl border p-3.5 text-sm ${
            feedback.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200'
              : 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* Section 1: Add a new Coach (Coach Admin only — added as standard Coach, NOT admin) */}
      {isCoachAdmin && (
        <div className="mt-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400">
              <UserPlus className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Ajouter un coach
              </h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Ajoutez un nouveau coach par son nom et son adresse Google. Il reçoit automatiquement le rôle <strong>Coach</strong> (sans droits administrateur). Seul un coach administrateur pourra ensuite accepter ou refuser de le nommer administrateur.
              </p>
            </div>
          </div>

          <form
            onSubmit={handleNominate}
            className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-12 sm:items-end"
          >
            <div className="sm:col-span-4">
              <label
                htmlFor="nominate-name"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Nom complet *
              </label>
              <input
                id="nominate-name"
                type="text"
                required
                minLength={VALIDATION_LIMITS.DISPLAY_NAME_MIN}
                maxLength={VALIDATION_LIMITS.DISPLAY_NAME_MAX}
                value={nominationName}
                onChange={(e) => setNominationName(e.target.value)}
                placeholder="Ex. Julien Moreau"
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
              />
            </div>

            <div className="sm:col-span-5">
              <label
                htmlFor="nominate-email"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Adresse email Google *
              </label>
              <input
                id="nominate-email"
                type="email"
                required
                maxLength={VALIDATION_LIMITS.EMAIL_MAX}
                value={nominationEmail}
                onChange={(e) => setNominationEmail(e.target.value)}
                placeholder="coach.partenaire@gmail.com"
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
              />
            </div>

            <div className="sm:col-span-3">
              <button
                type="submit"
                disabled={nominating}
                className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 px-4 py-2 text-xs font-semibold text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-white disabled:opacity-60 cursor-pointer"
              >
                <UserCheck className="h-4 w-4" aria-hidden="true" />
                {nominating ? 'Ajout en cours...' : 'Ajouter ce coach'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Section 2: Incoming Access Requests & Admin Promotion Requests (Coach Admin only) */}
      {isCoachAdmin && (
        <div className="mt-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-6">
          {/* 2a. New coach access requests */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-4">
              <div>
                <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  Demandes d’accès de nouveaux coachs
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Seul un coach administrateur peut accepter ou refuser un nouveau coach. L’acceptation attribue le rôle Coach (non administrateur).
                </p>
              </div>
              {pendingRequests.length > 0 && (
                <span className="font-mono text-xs font-semibold text-amber-700 dark:text-amber-400 tabular-nums">
                  {pendingRequests.length} en attente
                </span>
              )}
            </div>

            {pendingRequests.length === 0 ? (
              <div className="py-5 text-center text-sm text-slate-500 dark:text-slate-400">
                Aucune demande d’accès coach en attente pour le moment.
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {pendingRequests.map((req) => (
                  <div
                    key={req.id}
                    className="flex flex-col gap-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/35 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {req.displayName}
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                          En attente
                        </span>
                      </div>
                      <p className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 break-all">
                        <Mail className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                        {req.email}
                      </p>
                      {req.message && (
                        <p className="text-xs text-slate-700 dark:text-slate-200 bg-white/80 dark:bg-slate-900/80 rounded border border-amber-100 dark:border-amber-900/60 p-2">
                          « {req.message} »
                        </p>
                      )}
                      {req.createdAt && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Reçue le {formatFrenchDateShort(req.createdAt.toDate())}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={busyId === req.id}
                        onClick={() => void handleApproveRequest(req)}
                        className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-60 cursor-pointer"
                      >
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                        Accepter comme coach
                      </button>
                      <button
                        type="button"
                        disabled={busyId === req.id}
                        onClick={() => void handleRejectRequest(req)}
                        className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-rose-50 dark:hover:bg-rose-950/60 hover:text-rose-700 dark:hover:text-rose-300 hover:border-rose-200 dark:hover:border-rose-800 disabled:opacity-60 cursor-pointer"
                      >
                        <XCircle className="h-4 w-4" aria-hidden="true" />
                        Refuser
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 2b. Pending admin promotion requests */}
          <div className="border-t border-slate-100 dark:border-slate-800 pt-5">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
              <div>
                <h4 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                  Demandes de nomination administrateur
                </h4>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Acceptez ou refusez de nommer un coach existant comme coach administrateur.
                </p>
              </div>
              {pendingAdminPromotions.length > 0 && (
                <span className="font-mono text-xs font-semibold text-amber-700 dark:text-amber-400 tabular-nums">
                  {pendingAdminPromotions.length} en attente
                </span>
              )}
            </div>

            {pendingAdminPromotions.length === 0 ? (
              <p className="py-3 text-center text-xs text-slate-500 dark:text-slate-400">
                Aucune demande de rôle administrateur en attente.
              </p>
            ) : (
              <div className="space-y-2.5">
                {pendingAdminPromotions.map((coach) => (
                  <div
                    key={coach.id}
                    className="flex flex-col gap-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/35 p-3.5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <ProfileAvatar
                        name={coach.displayName}
                        photoUrl={coach.photoUrl}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                          {coach.displayName}
                        </p>
                        <p className="text-xs text-slate-600 dark:text-slate-300 break-all">
                          {coach.email}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={busyId === coach.id}
                        onClick={() =>
                          void handleSetCoachRole(coach, 'coach_admin', 'none')
                        }
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-60 cursor-pointer"
                      >
                        <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                        Accepter administrateur
                      </button>
                      <button
                        type="button"
                        disabled={busyId === coach.id}
                        onClick={() =>
                          void handleSetCoachRole(coach, 'coach', 'rejected')
                        }
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-rose-50 dark:hover:bg-rose-950/60 hover:text-rose-700 dark:hover:text-rose-300 hover:border-rose-200 dark:hover:border-rose-800 disabled:opacity-60 cursor-pointer"
                      >
                        <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                        Refuser
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {processedRequests.length > 0 && (
            <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2.5">
                Historique des demandes d’accès traitées
              </p>
              <div className="space-y-2">
                {processedRequests.map((req) => (
                  <div
                    key={req.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/60 px-3.5 py-2.5 text-xs"
                  >
                    <div className="min-w-0">
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {req.displayName}
                      </span>{' '}
                      <span className="text-slate-500 dark:text-slate-400">({req.email})</span>
                      {req.reviewedByEmail && (
                        <span className="text-slate-400 dark:text-slate-500">
                          {' '}
                          · par {req.reviewedByEmail}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={`font-semibold ${
                          req.status === 'approved'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-rose-700 dark:text-rose-400'
                        }`}
                      >
                        {req.status === 'approved' ? 'Approuvée' : 'Refusée'}
                      </span>
                      <button
                        type="button"
                        onClick={() => void deleteCoachAccessRequest(req.id)}
                        aria-label={`Effacer la demande de ${req.displayName}`}
                        title="Effacer de l’historique"
                        className="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Section 3: Registered Coaches */}
      <div className="mt-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
        <div className="border-b border-slate-100 dark:border-slate-800 pb-4">
          <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
            Coachs de l’application
          </h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {isCoachAdmin
              ? 'Consultez les fiches de renseignement, nommez ou retirez le rôle administrateur, activez/désactivez ou supprimez l’accès d’un coach.'
              : 'Consultez l’annuaire et les fiches de renseignement des coachs de l’équipe.'}
          </p>
        </div>

        {/* Mobile Cards (< md) */}
        <div className="mt-4 space-y-3 md:hidden">
          {admins.map((admin) => {
            const isSelf = admin.id === currentAdminUser.uid;
            const isProtected = admin.isPrimary;
            const isAdminRole = isProtected || admin.role === 'coach_admin';
            const hasPendingPromo =
              !isAdminRole && admin.adminRequestStatus === 'pending';

            return (
              <div
                key={admin.id}
                className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3 min-w-0">
                    <ProfileAvatar
                      name={admin.displayName}
                      photoUrl={admin.photoUrl}
                      size="md"
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="font-semibold text-slate-900 dark:text-white">
                          {admin.displayName}
                        </p>
                        {isProtected ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                            Admin principal
                          </span>
                        ) : isAdminRole ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                            Administrateur
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                            <Shield className="h-3 w-3" aria-hidden="true" />
                            Coach
                          </span>
                        )}
                        {isSelf && (
                          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                            (Vous)
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300 break-all">
                        {admin.email}
                      </p>
                      {isCoachAdmin && hasPendingPromo && (
                        <p className="mt-1 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                          Demande à devenir administrateur
                        </p>
                      )}
                      {admin.specialty && (
                        <p className="mt-1 text-xs font-medium text-slate-700 dark:text-slate-200">
                          {admin.specialty}
                        </p>
                      )}
                      {(admin.city || admin.phone) && (
                        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                          {[admin.city, admin.phone].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 text-xs font-semibold ${
                      admin.active ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'
                    }`}
                  >
                    {admin.active ? 'Actif' : 'Désactivé'}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 dark:border-slate-800 pt-3">
                  <button
                    type="button"
                    onClick={() => setInspectedCoach(admin)}
                    className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                  >
                    <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                    Fiche
                  </button>

                  {isCoachAdmin && !isProtected && !isSelf && (
                    <>
                      {!isAdminRole ? (
                        hasPendingPromo ? (
                          <>
                            <button
                              type="button"
                              disabled={busyId === admin.id}
                              onClick={() =>
                                void handleSetCoachRole(admin, 'coach_admin', 'none')
                              }
                              className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 cursor-pointer"
                            >
                              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                              Accepter admin
                            </button>
                            <button
                              type="button"
                              disabled={busyId === admin.id}
                              onClick={() =>
                                void handleSetCoachRole(admin, 'coach', 'rejected')
                              }
                              className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/60 px-3 py-2 text-xs font-semibold text-rose-800 dark:text-rose-200 hover:bg-rose-100 dark:hover:bg-rose-950 cursor-pointer"
                            >
                              <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                              Refuser admin
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            disabled={busyId === admin.id}
                            onClick={() =>
                              void handleSetCoachRole(admin, 'coach_admin', 'none')
                            }
                            className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/60 px-3 py-2 text-xs font-semibold text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-950 cursor-pointer"
                          >
                            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                            Nommer admin
                          </button>
                        )
                      ) : (
                        <button
                          type="button"
                          disabled={busyId === admin.id}
                          onClick={() =>
                            void handleSetCoachRole(admin, 'coach', 'none')
                          }
                          className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
                        >
                          <ShieldOff className="h-3.5 w-3.5" aria-hidden="true" />
                          Retirer admin
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={busyId === admin.id}
                        onClick={() => void handleToggleAdminActive(admin)}
                        className={`inline-flex min-h-[42px] flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold cursor-pointer ${
                          admin.active
                            ? 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-950'
                            : 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-950'
                        }`}
                      >
                        <Power className="h-3.5 w-3.5" aria-hidden="true" />
                        {admin.active ? 'Désactiver' : 'Activer'}
                      </button>

                      {confirmDeleteAdminId === admin.id ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={busyId === admin.id}
                            onClick={() => void handleDeleteAdmin(admin)}
                            className="min-h-[42px] rounded-lg bg-rose-600 px-3 text-xs font-semibold text-white hover:bg-rose-700 cursor-pointer"
                          >
                            Confirmer
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteAdminId(null)}
                            className="min-h-[42px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-xs text-slate-600 dark:text-slate-300 cursor-pointer"
                          >
                            Annuler
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteAdminId(admin.id)}
                          className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:border-rose-200 dark:hover:border-rose-800 hover:bg-rose-50 dark:hover:bg-rose-950/60 hover:text-rose-700 dark:hover:text-rose-300 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          Supprimer
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop Table (>= md) */}
        <div className="mt-4 hidden overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800 md:block">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-xs font-semibold text-slate-600 dark:text-slate-300">
              <tr>
                <th className="px-4 py-3">Coach & Spécialité</th>
                <th className="px-4 py-3">Coordonnées</th>
                <th className="px-4 py-3">Rôle & Statut</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {admins.map((admin) => {
                const isSelf = admin.id === currentAdminUser.uid;
                const isProtected = admin.isPrimary;
                const isAdminRole = isProtected || admin.role === 'coach_admin';
                const hasPendingPromo =
                  !isAdminRole && admin.adminRequestStatus === 'pending';

                return (
                  <tr key={admin.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <ProfileAvatar
                          name={admin.displayName}
                          photoUrl={admin.photoUrl}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-900 dark:text-white">
                              {admin.displayName}
                            </span>
                            {isSelf && (
                              <span className="text-xs text-slate-500 dark:text-slate-400">(Vous)</span>
                            )}
                          </div>
                          {(admin.specialty || admin.certifications) && (
                            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 truncate max-w-xs">
                              {[admin.specialty, admin.certifications]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                      <p>{admin.email}</p>
                      {(admin.city || admin.phone) && (
                        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                          {[admin.city, admin.region, admin.phone]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        {isProtected ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                            Admin principal
                          </span>
                        ) : isAdminRole ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                            Administrateur
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 dark:text-slate-200">
                            <Shield className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                            Coach
                          </span>
                        )}
                        <span
                          className={`text-[11px] font-semibold ${
                            admin.active ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'
                          }`}
                        >
                          {admin.active ? 'Actif' : 'Désactivé'}
                          {isCoachAdmin && hasPendingPromo
                            ? ' · Demande admin'
                            : ''}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setInspectedCoach(admin)}
                          className="inline-flex min-h-[34px] items-center gap-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                          Fiche
                        </button>

                        {isCoachAdmin &&
                          (isProtected ? (
                            <span className="text-xs text-slate-400 dark:text-slate-500">
                              Protégé
                            </span>
                          ) : isSelf ? (
                            <span className="text-xs text-slate-400 dark:text-slate-500">
                              Session actuelle
                            </span>
                          ) : (
                            <>
                              {!isAdminRole ? (
                                hasPendingPromo ? (
                                  <>
                                    <button
                                      type="button"
                                      disabled={busyId === admin.id}
                                      onClick={() =>
                                        void handleSetCoachRole(
                                          admin,
                                          'coach_admin',
                                          'none'
                                        )
                                      }
                                      className="inline-flex min-h-[34px] items-center gap-1 rounded-md bg-emerald-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 cursor-pointer"
                                    >
                                      <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                                      Accepter admin
                                    </button>
                                    <button
                                      type="button"
                                      disabled={busyId === admin.id}
                                      onClick={() =>
                                        void handleSetCoachRole(
                                          admin,
                                          'coach',
                                          'rejected'
                                        )
                                      }
                                      className="inline-flex min-h-[34px] items-center gap-1 rounded-md border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/60 px-2.5 py-1 text-xs font-semibold text-rose-800 dark:text-rose-200 hover:bg-rose-100 dark:hover:bg-rose-950 cursor-pointer"
                                    >
                                      <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                                      Refuser admin
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={busyId === admin.id}
                                    onClick={() =>
                                      void handleSetCoachRole(
                                        admin,
                                        'coach_admin',
                                        'none'
                                      )
                                    }
                                    className="inline-flex min-h-[34px] items-center gap-1 rounded-md border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-950 cursor-pointer"
                                  >
                                    <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                                    Nommer admin
                                  </button>
                                )
                              ) : (
                                <button
                                  type="button"
                                  disabled={busyId === admin.id}
                                  onClick={() =>
                                    void handleSetCoachRole(
                                      admin,
                                      'coach',
                                      'none'
                                    )
                                  }
                                  className="inline-flex min-h-[34px] items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
                                >
                                  <ShieldOff className="h-3.5 w-3.5" aria-hidden="true" />
                                  Retirer admin
                                </button>
                              )}

                              <button
                                type="button"
                                disabled={busyId === admin.id}
                                onClick={() => void handleToggleAdminActive(admin)}
                                className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold cursor-pointer ${
                                  admin.active
                                    ? 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-950'
                                    : 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-950'
                                }`}
                              >
                                <Power className="h-3.5 w-3.5" aria-hidden="true" />
                                {admin.active ? 'Désactiver' : 'Activer'}
                              </button>

                              {confirmDeleteAdminId === admin.id ? (
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    disabled={busyId === admin.id}
                                    onClick={() => void handleDeleteAdmin(admin)}
                                    className="min-h-[34px] rounded-md bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-rose-700 cursor-pointer"
                                  >
                                    Confirmer
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteAdminId(null)}
                                    className="min-h-[34px] rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-xs text-slate-600 dark:text-slate-300 cursor-pointer"
                                  >
                                    Non
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteAdminId(admin.id)}
                                  className="inline-flex min-h-[34px] items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:border-rose-200 dark:hover:border-rose-800 hover:bg-rose-50 dark:hover:bg-rose-950/60 hover:text-rose-700 dark:hover:text-rose-300 cursor-pointer"
                                >
                                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                  Supprimer
                                </button>
                              )}
                            </>
                          ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pending Email Invitations (Coach Admin only) */}
        {isCoachAdmin && activeInvites.length > 0 && (
          <div className="mt-6 border-t border-slate-100 dark:border-slate-800 pt-5">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Invitations en attente de première connexion ({activeInvites.length})
            </h4>
            <div className="mt-3 space-y-2.5">
              {activeInvites.map((invite) => (
                <div
                  key={invite.id}
                  className="flex flex-col gap-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/60 p-3.5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-sm text-slate-900 dark:text-white">
                        {invite.displayName}
                      </span>
                      <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                        · Rôle :{' '}
                        {invite.role === 'coach_admin'
                          ? 'Administrateur'
                          : 'Coach'}
                      </span>
                      <span
                        className={`text-xs font-semibold ${
                          invite.status === 'pending'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-rose-700 dark:text-rose-400'
                        }`}
                      >
                        {invite.status === 'pending'
                          ? 'Active (en attente de connexion)'
                          : 'Désactivée'}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300 break-all">
                      {invite.email} · ajouté par {invite.invitedByEmail}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        void setCoachInviteStatus({
                          inviteId: invite.id,
                          status:
                            invite.status === 'pending' ? 'disabled' : 'pending',
                        })
                      }
                      className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                        invite.status === 'pending'
                          ? 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-950'
                          : 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-950'
                      }`}
                    >
                      <Power className="h-3.5 w-3.5" aria-hidden="true" />
                      {invite.status === 'pending' ? 'Désactiver' : 'Activer'}
                    </button>

                    {confirmDeleteInviteId === invite.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={async () => {
                            await deleteCoachInvite(invite.id);
                            setConfirmDeleteInviteId(null);
                          }}
                          className="min-h-[38px] rounded-lg bg-rose-600 px-3 text-xs font-semibold text-white hover:bg-rose-700 cursor-pointer"
                        >
                          Confirmer
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteInviteId(null)}
                          className="min-h-[38px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer"
                        >
                          Non
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteInviteId(invite.id)}
                        className="inline-flex min-h-[38px] items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:border-rose-200 dark:hover:border-rose-800 hover:bg-rose-50 dark:hover:bg-rose-950/60 hover:text-rose-700 dark:hover:text-rose-300 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        Supprimer
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Coach Info Sheet Detail Modal */}
      {inspectedCoach && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="coach-sheet-modal-title"
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 dark:bg-slate-950/75 p-0 backdrop-blur-xs sm:items-center sm:p-4"
          onClick={() => setInspectedCoach(null)}
        >
          <div
            className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl sm:rounded-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 dark:border-slate-800 p-4 sm:p-5">
              <div className="flex items-center gap-3.5 min-w-0">
                <ProfileAvatar
                  name={inspectedCoach.displayName}
                  photoUrl={inspectedCoach.photoUrl}
                  size="lg"
                />
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                    Fiche de renseignement coach
                  </p>
                  <h3
                    id="coach-sheet-modal-title"
                    className="mt-0.5 font-display text-lg font-bold text-slate-900 dark:text-white truncate"
                  >
                    {inspectedCoach.displayName}
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectedCoach(null)}
                aria-label="Fermer"
                className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-4 p-4 sm:p-5 text-sm">
              <div className="space-y-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 p-4 text-xs text-slate-700 dark:text-slate-200">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-slate-400 dark:text-slate-500 shrink-0" aria-hidden="true" />
                  <span className="break-all">{inspectedCoach.email}</span>
                </div>
                {inspectedCoach.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-slate-400 dark:text-slate-500 shrink-0" aria-hidden="true" />
                    <span className="font-mono">{inspectedCoach.phone}</span>
                  </div>
                )}
                {(inspectedCoach.city || inspectedCoach.region) && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-slate-400 dark:text-slate-500 shrink-0" aria-hidden="true" />
                    <span>
                      {[inspectedCoach.city, inspectedCoach.region]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </div>
                )}
                {inspectedCoach.certifications && (
                  <div className="flex items-center gap-2">
                    <Award className="h-4 w-4 text-slate-400 dark:text-slate-500 shrink-0" aria-hidden="true" />
                    <span>{inspectedCoach.certifications}</span>
                  </div>
                )}
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Spécialités sportives
                </p>
                <p className="mt-1 text-sm text-slate-900 dark:text-white">
                  {inspectedCoach.specialty?.trim() || 'Non renseignées'}
                </p>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Présentation & approche
                </p>
                <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                  {inspectedCoach.bio?.trim() ||
                    'Aucune présentation renseignée pour le moment.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
