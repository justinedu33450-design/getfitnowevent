import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getDocsFromServer,
  increment,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  Unsubscribe,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { User } from 'firebase/auth';
import {
  auth,
  BOOTSTRAPPED_COACH_EMAIL,
  buildFirestoreErrorInfo,
  db,
  handleFirestoreError,
  OperationType,
} from '../firebase';
import {
  CoachAccessRequest,
  CoachAccessResolution,
  CoachAdminInvite,
  CoachAdminRequestStatus,
  CoachAdminUser,
  CoachDirectoryEntry,
  CoachNotification,
  CoachRole,
  Conversation,
  ConversationSenderRole,
  CustomDiscipline,
  DirectMessage,
  Discipline,
  DisciplineColorKey,
  DisciplineIconKey,
  EventCancelReason,
  EventLike,
  EventPaymentMode,
  EventReview,
  EventStatus,
  FitnessLevel,
  FollowUpStatus,
  GuestInput,
  MemberNotification,
  MemberProfile,
  MemberScheduleSession,
  PaymentMethod,
  PaymentRecord,
  PaymentStatus,
  Registration,
  SportEvent,
  VALIDATION_LIMITS,
} from '../types';
import {
  evaluateEventBooking,
  formatPublicAuthorName,
  getRegistrationEndMs,
  hashEmailKey,
  isValidBirthDateString,
} from '../utils/dateAndValidation';
import {
  inferDisciplineIconKey,
  pickNextUnusedColorKey,
  slugifyDiscipline,
} from '../utils/disciplineColors';
import { generatePaymentReference } from '../utils/paymentHelpers';

export async function resolveCoachSession(user: User | null): Promise<{
  isCoach: boolean;
  status: CoachAccessResolution;
  role: CoachRole | null;
}> {
  if (!user || !user.email) {
    return { isCoach: false, status: 'none', role: null };
  }

  const userEmail = user.email.trim().toLowerCase();
  const isBootstrapped =
    user.emailVerified &&
    userEmail === BOOTSTRAPPED_COACH_EMAIL.toLowerCase();

  if (isBootstrapped) {
    try {
      const adminRef = doc(db, 'admins', user.uid);
      const snap = await getDoc(adminRef);
      const emailKey = await hashEmailKey(userEmail);
      const displayName = (
        user.displayName?.trim() ||
        userEmail.split('@')[0] ||
        'Coach principal'
      ).slice(0, VALIDATION_LIMITS.DISPLAY_NAME_MAX);

      if (!snap.exists()) {
        await setDoc(adminRef, {
          uid: user.uid,
          email: userEmail,
          emailKey,
          displayName,
          role: 'coach_admin',
          adminRequestStatus: 'none',
          active: true,
          isPrimary: true,
          createdByUid: user.uid,
          createdByEmail: userEmail,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        const data = snap.data() as Partial<CoachAdminUser>;
        if (data.active === false || data.role !== 'coach_admin') {
          await updateDoc(adminRef, {
            active: true,
            role: 'coach_admin',
            adminRequestStatus: 'none',
            updatedAt: serverTimestamp(),
          });
        }
      }
    } catch (error) {
      console.warn('Synchronisation admin principal impossible:', error);
    }
    return { isCoach: true, status: 'active', role: 'coach_admin' };
  }

  try {
    const adminRef = doc(db, 'admins', user.uid);
    const snap = await getDoc(adminRef);
    if (snap.exists()) {
      const data = snap.data() as Partial<CoachAdminUser>;
      if (data.active !== false) {
        const role: CoachRole =
          data.role === 'coach_admin' ? 'coach_admin' : 'coach';
        return { isCoach: true, status: 'active', role };
      }
      return { isCoach: false, status: 'disabled', role: null };
    }

    // Check if this user has a pending email invitation in /adminInvites (requires verified email)
    if (user.emailVerified) {
      const inviteQuery = query(
        collection(db, 'adminInvites'),
        where('email', '==', userEmail)
      );
      const inviteSnap = await getDocs(inviteQuery);
      const pendingInviteDoc = inviteSnap.docs.find((d) => {
        const data = d.data() as Partial<CoachAdminInvite>;
        return data.status === 'pending';
      });

      if (pendingInviteDoc) {
        const invite = pendingInviteDoc.data() as CoachAdminInvite;
        const emailKey = invite.emailKey || (await hashEmailKey(userEmail));
        const displayName = (
          invite.displayName?.trim() ||
          user.displayName?.trim() ||
          userEmail.split('@')[0]
        ).slice(0, VALIDATION_LIMITS.DISPLAY_NAME_MAX);
        const claimedRole: CoachRole =
          invite.role === 'coach_admin' ? 'coach_admin' : 'coach';

        const batch = writeBatch(db);
        batch.set(adminRef, {
          uid: user.uid,
          email: userEmail,
          emailKey,
          displayName,
          role: claimedRole,
          adminRequestStatus: 'none',
          active: true,
          isPrimary: false,
          createdByUid: invite.invitedByUid,
          createdByEmail: invite.invitedByEmail,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        batch.update(doc(db, 'adminInvites', pendingInviteDoc.id), {
          status: 'claimed',
          claimedByUid: user.uid,
          updatedAt: serverTimestamp(),
        });
        await batch.commit();
        return { isCoach: true, status: 'active', role: claimedRole };
      }
    }

    return { isCoach: false, status: 'none', role: null };
  } catch (error) {
    console.warn('Vérification coach impossible:', error);
    return { isCoach: false, status: 'none', role: null };
  }
}

export function subscribeMyAdminStatus(
  uid: string,
  userEmail: string | null | undefined,
  onStatus: (info: {
    status: CoachAccessResolution;
    role: CoachRole | null;
  }) => void
): Unsubscribe {
  if (
    userEmail &&
    auth.currentUser?.uid === uid &&
    auth.currentUser.emailVerified &&
    userEmail.trim().toLowerCase() === BOOTSTRAPPED_COACH_EMAIL.toLowerCase()
  ) {
    onStatus({ status: 'active', role: 'coach_admin' });
    return () => {};
  }
  return onSnapshot(
    doc(db, 'admins', uid),
    (snap) => {
      if (!snap.exists()) {
        onStatus({ status: 'none', role: null });
        return;
      }
      const data = snap.data() as Partial<CoachAdminUser>;
      if (data.active === false) {
        onStatus({ status: 'disabled', role: null });
        return;
      }
      const role: CoachRole =
        data.role === 'coach_admin' ? 'coach_admin' : 'coach';
      onStatus({ status: 'active', role });
    },
    (error) => {
      console.warn('Écoute statut coach interrompue:', error);
    }
  );
}

export function subscribeMyCoachAccessRequest(
  uid: string,
  onData: (req: CoachAccessRequest | null) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, 'coachAccessRequests', uid),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      onData({
        id: snap.id,
        ...(snap.data() as Omit<CoachAccessRequest, 'id'>),
      });
    },
    (error) => {
      try {
        handleFirestoreError(
          error,
          OperationType.GET,
          `coachAccessRequests/${uid}`
        );
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export function subscribeCoachAdmins(
  onData: (admins: CoachAdminUser[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'admins'),
    (snapshot) => {
      const list: CoachAdminUser[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<CoachAdminUser, 'id'>),
      }));
      list.sort((a, b) => {
        if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
        if (a.active !== b.active) return a.active ? -1 : 1;
        return a.displayName.localeCompare(b.displayName, 'fr');
      });
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'admins');
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export function subscribeCoachAccessRequests(
  onData: (requests: CoachAccessRequest[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'coachAccessRequests'),
    (snapshot) => {
      const list: CoachAccessRequest[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<CoachAccessRequest, 'id'>),
      }));
      list.sort((a, b) => {
        if (a.status === 'pending' && b.status !== 'pending') return -1;
        if (a.status !== 'pending' && b.status === 'pending') return 1;
        const aTime = a.updatedAt?.toMillis?.() ?? 0;
        const bTime = b.updatedAt?.toMillis?.() ?? 0;
        return bTime - aTime;
      });
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(
          error,
          OperationType.LIST,
          'coachAccessRequests'
        );
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export function subscribeCoachInvites(
  onData: (invites: CoachAdminInvite[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'adminInvites'),
    (snapshot) => {
      const list: CoachAdminInvite[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<CoachAdminInvite, 'id'>),
      }));
      list.sort((a, b) => {
        const aTime = a.updatedAt?.toMillis?.() ?? 0;
        const bTime = b.updatedAt?.toMillis?.() ?? 0;
        return bTime - aTime;
      });
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'adminInvites');
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export async function submitCoachAccessRequest(params: {
  user: User;
  displayName: string;
  message: string;
  isResubmission?: boolean;
}): Promise<void> {
  if (!params.user.email) {
    throw new Error('Votre compte doit disposer d’une adresse email.');
  }

  const email = params.user.email.trim().toLowerCase();
  const displayName = params.displayName
    .trim()
    .slice(0, VALIDATION_LIMITS.DISPLAY_NAME_MAX);
  const message = params.message
    .trim()
    .slice(0, VALIDATION_LIMITS.REQUEST_MESSAGE_MAX);

  if (displayName.length < VALIDATION_LIMITS.DISPLAY_NAME_MIN) {
    throw new Error('Veuillez saisir votre nom complet (au moins 2 caractères).');
  }

  const emailKey = await hashEmailKey(email);
  const reqRef = doc(db, 'coachAccessRequests', params.user.uid);

  try {
    if (params.isResubmission) {
      await updateDoc(reqRef, {
        displayName,
        message,
        status: 'pending',
        reviewedByEmail: '',
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(reqRef, {
        uid: params.user.uid,
        email,
        emailKey,
        displayName,
        message,
        status: 'pending',
        reviewedByEmail: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(
      error,
      params.isResubmission ? OperationType.UPDATE : OperationType.CREATE,
      `coachAccessRequests/${params.user.uid}`
    );
  }
}

export async function approveCoachAccessRequest(params: {
  request: CoachAccessRequest;
  adminUser: User;
}): Promise<void> {
  const adminEmail = (params.adminUser.email || '').trim().toLowerCase();
  const batch = writeBatch(db);
  const adminRef = doc(db, 'admins', params.request.uid);
  const reqRef = doc(db, 'coachAccessRequests', params.request.id);

  batch.set(adminRef, {
    uid: params.request.uid,
    email: params.request.email.trim().toLowerCase(),
    emailKey: params.request.emailKey,
    displayName: params.request.displayName.slice(
      0,
      VALIDATION_LIMITS.DISPLAY_NAME_MAX
    ),
    role: 'coach',
    adminRequestStatus: 'none',
    active: true,
    isPrimary: false,
    createdByUid: params.adminUser.uid,
    createdByEmail: adminEmail,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.update(reqRef, {
    status: 'approved',
    reviewedByEmail: adminEmail,
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.WRITE,
      `coachAccessRequests/${params.request.id}`
    );
  }
}

export async function rejectCoachAccessRequest(params: {
  requestId: string;
  adminUser: User;
}): Promise<void> {
  const adminEmail = (params.adminUser.email || '').trim().toLowerCase();
  try {
    await updateDoc(doc(db, 'coachAccessRequests', params.requestId), {
      status: 'rejected',
      reviewedByEmail: adminEmail,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `coachAccessRequests/${params.requestId}`
    );
  }
}

export async function deleteCoachAccessRequest(
  requestId: string
): Promise<void> {
  try {
    await deleteDoc(doc(db, 'coachAccessRequests', requestId));
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.DELETE,
      `coachAccessRequests/${requestId}`
    );
  }
}

export async function addCoachMember(params: {
  email: string;
  displayName: string;
  adminUser: User;
  existingAdmins: CoachAdminUser[];
  existingRequests: CoachAccessRequest[];
  existingInvites: CoachAdminInvite[];
}): Promise<'activated_existing' | 'approved_request' | 'invited'> {
  const email = params.email
    .trim()
    .toLowerCase()
    .slice(0, VALIDATION_LIMITS.EMAIL_MAX);
  const displayName = params.displayName
    .trim()
    .slice(0, VALIDATION_LIMITS.DISPLAY_NAME_MAX);

  if (displayName.length < VALIDATION_LIMITS.DISPLAY_NAME_MIN) {
    throw new Error('Veuillez saisir le nom complet du coach (2 caractères min.).');
  }
  if (!VALIDATION_LIMITS.EMAIL_REGEX.test(email)) {
    throw new Error('Veuillez saisir une adresse email valide.');
  }
  if (email === BOOTSTRAPPED_COACH_EMAIL.toLowerCase()) {
    throw new Error('Ce compte est déjà le coach administrateur principal.');
  }

  const adminEmail = (params.adminUser.email || '').trim().toLowerCase();

  // 1. Check if already in /admins
  const existingAdmin = params.existingAdmins.find(
    (a) => a.email.toLowerCase() === email
  );
  if (existingAdmin) {
    if (existingAdmin.active) {
      throw new Error('Ce coach est déjà actif dans l’équipe.');
    }
    try {
      await updateDoc(doc(db, 'admins', existingAdmin.id), {
        active: true,
        displayName,
        updatedAt: serverTimestamp(),
      });
      return 'activated_existing';
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.UPDATE,
        `admins/${existingAdmin.id}`
      );
    }
  }

  // 2. Check if a pending/rejected access request already exists for this email (grants standard coach role, NOT admin)
  const existingRequest = params.existingRequests.find(
    (r) => r.email.toLowerCase() === email
  );
  if (existingRequest) {
    const batch = writeBatch(db);
    batch.set(doc(db, 'admins', existingRequest.uid), {
      uid: existingRequest.uid,
      email,
      emailKey: existingRequest.emailKey,
      displayName,
      role: 'coach',
      adminRequestStatus: 'none',
      active: true,
      isPrimary: false,
      createdByUid: params.adminUser.uid,
      createdByEmail: adminEmail,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(db, 'coachAccessRequests', existingRequest.id), {
      status: 'approved',
      reviewedByEmail: adminEmail,
      updatedAt: serverTimestamp(),
    });
    try {
      await batch.commit();
      return 'approved_request';
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.WRITE,
        `admins/${existingRequest.uid}`
      );
    }
  }

  // 3. Create or re-enable an email invitation in /adminInvites/{emailKey} with role 'coach' (never auto-admin)
  const emailKey = await hashEmailKey(email);
  const existingInvite = params.existingInvites.find((inv) => inv.id === emailKey);
  const inviteRef = doc(db, 'adminInvites', emailKey);

  try {
    if (existingInvite) {
      await updateDoc(inviteRef, {
        displayName,
        role: 'coach',
        status: 'pending',
        invitedByUid: params.adminUser.uid,
        invitedByEmail: adminEmail,
        claimedByUid: '',
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(inviteRef, {
        email,
        emailKey,
        displayName,
        role: 'coach',
        status: 'pending',
        invitedByUid: params.adminUser.uid,
        invitedByEmail: adminEmail,
        claimedByUid: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    return 'invited';
  } catch (error) {
    handleFirestoreError(
      error,
      existingInvite ? OperationType.UPDATE : OperationType.CREATE,
      `adminInvites/${emailKey}`
    );
  }
}

export async function setCoachRole(params: {
  targetAdmin: CoachAdminUser;
  role: CoachRole;
  adminRequestStatus?: CoachAdminRequestStatus;
  currentAdminUid: string;
}): Promise<void> {
  if (
    params.targetAdmin.isPrimary ||
    params.targetAdmin.email.toLowerCase() ===
      BOOTSTRAPPED_COACH_EMAIL.toLowerCase()
  ) {
    throw new Error(
      'Le rôle du coach administrateur principal ne peut pas être modifié.'
    );
  }
  if (
    params.targetAdmin.id === params.currentAdminUid &&
    params.role !== 'coach_admin'
  ) {
    throw new Error(
      'Vous ne pouvez pas retirer vos propres droits d’administrateur.'
    );
  }
  try {
    await updateDoc(doc(db, 'admins', params.targetAdmin.id), {
      role: params.role,
      adminRequestStatus: params.adminRequestStatus ?? 'none',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `admins/${params.targetAdmin.id}`
    );
  }
}

export async function requestCoachAdminPromotion(uid: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'admins', uid), {
      adminRequestStatus: 'pending',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `admins/${uid}`);
  }
}

export async function setCoachAdminActive(params: {
  targetAdmin: CoachAdminUser;
  active: boolean;
}): Promise<void> {
  if (
    params.targetAdmin.isPrimary ||
    params.targetAdmin.email.toLowerCase() ===
      BOOTSTRAPPED_COACH_EMAIL.toLowerCase()
  ) {
    throw new Error(
      'Le coach administrateur principal ne peut pas être désactivé.'
    );
  }
  try {
    await updateDoc(doc(db, 'admins', params.targetAdmin.id), {
      active: params.active,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `admins/${params.targetAdmin.id}`
    );
  }
}

export async function deleteCoachAdmin(params: {
  targetAdmin: CoachAdminUser;
  currentAdminUid: string;
}): Promise<void> {
  if (
    params.targetAdmin.isPrimary ||
    params.targetAdmin.email.toLowerCase() ===
      BOOTSTRAPPED_COACH_EMAIL.toLowerCase()
  ) {
    throw new Error(
      'Le coach administrateur principal ne peut pas être supprimé.'
    );
  }
  if (params.targetAdmin.id === params.currentAdminUid) {
    throw new Error('Vous ne pouvez pas supprimer votre propre compte.');
  }

  const batch = writeBatch(db);
  batch.delete(doc(db, 'admins', params.targetAdmin.id));
  batch.delete(doc(db, 'coachAccessRequests', params.targetAdmin.uid));
  if (params.targetAdmin.emailKey) {
    batch.delete(doc(db, 'adminInvites', params.targetAdmin.emailKey));
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.DELETE,
      `admins/${params.targetAdmin.id}`
    );
  }
}

export async function setCoachInviteStatus(params: {
  inviteId: string;
  status: 'pending' | 'disabled';
}): Promise<void> {
  try {
    await updateDoc(doc(db, 'adminInvites', params.inviteId), {
      status: params.status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `adminInvites/${params.inviteId}`
    );
  }
}

export async function deleteCoachInvite(inviteId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'adminInvites', inviteId));
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.DELETE,
      `adminInvites/${inviteId}`
    );
  }
}

export async function updateMyCoachProfile(params: {
  user: User;
  displayName: string;
  phone: string;
  specialty: string;
  city: string;
  region: string;
  certifications: string;
  bio: string;
  photoUrl?: string;
}): Promise<void> {
  const displayName = params.displayName
    .trim()
    .slice(0, VALIDATION_LIMITS.DISPLAY_NAME_MAX);

  if (displayName.length < VALIDATION_LIMITS.DISPLAY_NAME_MIN) {
    throw new Error('Votre nom d’affichage doit contenir au moins 2 caractères.');
  }

  const adminRef = doc(db, 'admins', params.user.uid);
  const payload = {
    displayName,
    phone: params.phone.trim().slice(0, VALIDATION_LIMITS.PHONE_MAX),
    specialty: params.specialty.trim().slice(0, VALIDATION_LIMITS.SPECIALTY_MAX),
    city: params.city.trim().slice(0, VALIDATION_LIMITS.CITY_MAX),
    region: params.region.trim().slice(0, VALIDATION_LIMITS.REGION_MAX),
    certifications: params.certifications
      .trim()
      .slice(0, VALIDATION_LIMITS.CERTIFICATIONS_MAX),
    bio: params.bio.trim().slice(0, VALIDATION_LIMITS.BIO_MAX),
    photoUrl: (params.photoUrl ?? '').trim().slice(0, VALIDATION_LIMITS.PHOTO_URL_MAX),
    updatedAt: serverTimestamp(),
  };

  try {
    const snap = await getDoc(adminRef);
    if (!snap.exists()) {
      const email = (params.user.email || '').trim().toLowerCase();
      const emailKey = await hashEmailKey(email);
      const isPrimaryUser = email === BOOTSTRAPPED_COACH_EMAIL.toLowerCase();
      await setDoc(adminRef, {
        uid: params.user.uid,
        email,
        emailKey,
        ...payload,
        role: isPrimaryUser ? 'coach_admin' : 'coach',
        adminRequestStatus: 'none',
        active: true,
        isPrimary: isPrimaryUser,
        createdByUid: params.user.uid,
        createdByEmail: email,
        createdAt: serverTimestamp(),
      });
    } else {
      await updateDoc(adminRef, payload);
    }
    await setDoc(doc(db, 'coachDirectory', params.user.uid), {
      uid: params.user.uid,
      displayName,
      specialty: payload.specialty,
      city: payload.city,
      region: payload.region,
      bio: payload.bio,
      photoUrl: payload.photoUrl,
      active: true,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `admins/${params.user.uid}`
    );
  }
}

export function subscribeDisciplines(
  onData: (disciplines: CustomDiscipline[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'disciplines'),
    (snapshot) => {
      const list: CustomDiscipline[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<CustomDiscipline, 'id'>),
      }));
      list.sort((a, b) =>
        a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' })
      );
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'disciplines');
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export async function createCustomDiscipline(params: {
  name: string;
  colorKey?: DisciplineColorKey;
  iconKey?: DisciplineIconKey;
  coachUid: string;
  existingNames?: string[];
  existingDisciplines?: Array<{ name: string; colorKey: DisciplineColorKey }>;
}): Promise<string> {
  const cleanName = params.name
    .trim()
    .slice(0, VALIDATION_LIMITS.DISCIPLINE_MAX);

  if (cleanName.length < VALIDATION_LIMITS.DISCIPLINE_MIN) {
    throw new Error('Le nom de la discipline doit contenir au moins 2 caractères.');
  }

  const allExistingNames = [
    ...(params.existingNames ?? []),
    ...(params.existingDisciplines ?? []).map((d) => d.name),
  ];
  const duplicate = allExistingNames.some(
    (n) => n.trim().toLowerCase() === cleanName.toLowerCase()
  );
  if (duplicate) {
    throw new Error('Cette discipline existe déjà dans votre catalogue.');
  }

  const resolvedColorKey =
    params.colorKey ??
    pickNextUnusedColorKey(params.existingDisciplines ?? []);
  const resolvedIconKey = params.iconKey ?? inferDisciplineIconKey(cleanName);

  const slug = slugifyDiscipline(cleanName);
  const discRef = doc(db, 'disciplines', slug);

  try {
    const existingSnap = await getDoc(discRef);
    if (existingSnap.exists()) {
      await updateDoc(discRef, {
        name: cleanName,
        colorKey: resolvedColorKey,
        iconKey: resolvedIconKey,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(discRef, {
        name: cleanName,
        slug,
        colorKey: resolvedColorKey,
        iconKey: resolvedIconKey,
        createdBy: params.coachUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    return cleanName;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `disciplines/${slug}`);
  }
}

export async function updateCustomDisciplineColor(params: {
  name: string;
  slug: string;
  colorKey: DisciplineColorKey;
  iconKey?: DisciplineIconKey;
  coachUid: string;
}): Promise<void> {
  const discRef = doc(db, 'disciplines', params.slug);
  const cleanName = params.name.trim().slice(0, VALIDATION_LIMITS.DISCIPLINE_MAX);

  try {
    const existingSnap = await getDoc(discRef);
    if (existingSnap.exists()) {
      await updateDoc(discRef, {
        name: cleanName,
        colorKey: params.colorKey,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(discRef, {
        name: cleanName,
        slug: params.slug,
        colorKey: params.colorKey,
        iconKey: params.iconKey ?? inferDisciplineIconKey(cleanName),
        createdBy: params.coachUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `disciplines/${params.slug}`
    );
  }
}

export async function updateCustomDisciplineIcon(params: {
  name: string;
  slug: string;
  colorKey: DisciplineColorKey;
  iconKey: DisciplineIconKey;
  coachUid: string;
}): Promise<void> {
  const discRef = doc(db, 'disciplines', params.slug);
  const cleanName = params.name.trim().slice(0, VALIDATION_LIMITS.DISCIPLINE_MAX);

  try {
    const existingSnap = await getDoc(discRef);
    if (existingSnap.exists()) {
      await updateDoc(discRef, {
        name: cleanName,
        iconKey: params.iconKey,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(discRef, {
        name: cleanName,
        slug: params.slug,
        colorKey: params.colorKey,
        iconKey: params.iconKey,
        createdBy: params.coachUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `disciplines/${params.slug}`
    );
  }
}

export async function deleteCustomDiscipline(slug: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'disciplines', slug));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `disciplines/${slug}`);
  }
}

export function subscribeEvents(
  isCoach: boolean,
  onData: (events: SportEvent[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const eventsRef = collection(db, 'events');
  const q = isCoach
    ? eventsRef
    : query(eventsRef, where('status', 'in', ['published', 'cancelled']));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: SportEvent[] = snapshot.docs.map((d) => {
        const raw = d.data() as Partial<SportEvent>;
        const priceCents =
          typeof raw.priceCents === 'number' && raw.priceCents >= 0
            ? Math.round(raw.priceCents)
            : 0;
        const isPaid =
          Boolean(raw.isPaid) && priceCents >= VALIDATION_LIMITS.PRICE_MIN_CENTS;
        const paymentMode: EventPaymentMode =
          raw.paymentMode === 'onsite' || raw.paymentMode === 'both'
            ? raw.paymentMode
            : 'online';
        return {
          ...(raw as Omit<SportEvent, 'id'>),
          id: d.id,
          city: typeof raw.city === 'string' && raw.city.trim() ? raw.city : 'Paris',
          region: typeof raw.region === 'string' ? raw.region : '',
          isUnlimitedCapacity: Boolean(raw.isUnlimitedCapacity),
          hasCoords: Boolean(raw.hasCoords),
          lat: typeof raw.lat === 'number' ? raw.lat : 0,
          lng: typeof raw.lng === 'number' ? raw.lng : 0,
          isPaid,
          priceCents: isPaid ? priceCents : 0,
          currency: 'EUR',
          paymentMode,
          likesCount:
            typeof raw.likesCount === 'number' && raw.likesCount >= 0
              ? Math.round(raw.likesCount)
              : 0,
          lastLikeId:
            typeof raw.lastLikeId === 'string' && raw.lastLikeId
              ? raw.lastLikeId
              : 'none',
        };
      });
      list.sort((a, b) => a.startAt.toMillis() - b.startAt.toMillis());
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'events');
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export function subscribeRegistrations(
  onData: (registrations: Registration[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'registrations'),
    (snapshot) => {
      const list: Registration[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Registration, 'id'>),
      }));
      list.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'registrations');
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export function subscribeMembers(
  onData: (members: MemberProfile[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'members'),
    (snapshot) => {
      const list: MemberProfile[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<MemberProfile, 'id'>),
      }));
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'members');
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export function subscribeMyMemberProfile(
  email: string,
  onData: (profile: MemberProfile | null) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const cleanEmail = email.trim().toLowerCase();
  const q = query(collection(db, 'members'), where('email', '==', cleanEmail));
  return onSnapshot(
    q,
    (snapshot) => {
      if (snapshot.empty) {
        onData(null);
        return;
      }
      const d = snapshot.docs[0];
      onData({
        id: d.id,
        ...(d.data() as Omit<MemberProfile, 'id'>),
      });
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'members');
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export function subscribeMyRegistrations(
  email: string,
  onData: (registrations: Registration[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const cleanEmail = email.trim().toLowerCase();
  let ownDocs: Registration[] = [];
  let guestDocs: Registration[] = [];

  const emitMerged = () => {
    const mergedMap = new Map<string, Registration>();
    ownDocs.forEach((r) => mergedMap.set(r.id, r));
    guestDocs.forEach((r) => {
      if (!mergedMap.has(r.id)) {
        mergedMap.set(r.id, r);
      }
    });
    const list = Array.from(mergedMap.values());
    list.sort((a, b) => b.eventStartAt.toMillis() - a.eventStartAt.toMillis());
    onData(list);
  };

  const ownQuery = query(
    collection(db, 'registrations'),
    where('email', '==', cleanEmail)
  );
  const invitedQuery = query(
    collection(db, 'registrations'),
    where('invitedByEmail', '==', cleanEmail)
  );

  const handleSnapshotError = (error: unknown) => {
    try {
      handleFirestoreError(error, OperationType.LIST, 'registrations');
    } catch (wrapped) {
      if (onError && wrapped instanceof Error) {
        onError(wrapped);
      }
    }
  };

  const unsubOwn = onSnapshot(
    ownQuery,
    (snapshot) => {
      ownDocs = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Registration, 'id'>),
      }));
      emitMerged();
    },
    handleSnapshotError
  );

  const unsubInvited = onSnapshot(
    invitedQuery,
    (snapshot) => {
      guestDocs = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Registration, 'id'>),
      }));
      emitMerged();
    },
    handleSnapshotError
  );

  return () => {
    unsubOwn();
    unsubInvited();
  };
}

export interface EventFormInput {
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
  startDate: Date;
  durationMinutes: number;
  isUnlimitedCapacity: boolean;
  maxCapacity: number;
  isPaid?: boolean;
  priceCents?: number;
  paymentMode?: EventPaymentMode;
  status?: EventStatus;
}

function normalizeEventPricing(input: EventFormInput): {
  isPaid: boolean;
  priceCents: number;
  currency: 'EUR';
  paymentMode: EventPaymentMode;
} {
  if (!input.isPaid) {
    return {
      isPaid: false,
      priceCents: 0,
      currency: 'EUR',
      paymentMode: 'online',
    };
  }
  const priceCents = Math.round(Number(input.priceCents ?? 0));
  if (
    !Number.isFinite(priceCents) ||
    priceCents < VALIDATION_LIMITS.PRICE_MIN_CENTS ||
    priceCents > VALIDATION_LIMITS.PRICE_MAX_CENTS
  ) {
    throw new Error(
      'Le tarif d’un événement payant doit être compris entre 1,00 € et 1 000,00 €.'
    );
  }
  const paymentMode: EventPaymentMode =
    input.paymentMode === 'onsite' || input.paymentMode === 'both'
      ? input.paymentMode
      : 'online';
  return {
    isPaid: true,
    priceCents,
    currency: 'EUR',
    paymentMode,
  };
}

function normalizeEventCoaches(input: EventFormInput): {
  coachName: string;
  coachNames: string[];
  coachUids: string[];
} {
  const rawNames =
    Array.isArray(input.coachNames) && input.coachNames.length > 0
      ? input.coachNames
      : (input.coachName || '').split(',');

  const seenNames = new Set<string>();
  const coachNames: string[] = [];
  for (const raw of rawNames) {
    const clean = raw
      .trim()
      .slice(0, VALIDATION_LIMITS.SINGLE_COACH_NAME_MAX);
    if (clean.length < VALIDATION_LIMITS.COACH_NAME_MIN) continue;
    const key = clean.toLowerCase();
    if (seenNames.has(key)) continue;
    seenNames.add(key);
    coachNames.push(clean);
    if (coachNames.length >= VALIDATION_LIMITS.COACHES_PER_EVENT_MAX) break;
  }

  const coachUids = Array.from(
    new Set(
      (input.coachUids ?? [])
        .map((u) => u.trim())
        .filter((u) => /^[a-zA-Z0-9_-]{1,128}$/.test(u))
    )
  ).slice(0, VALIDATION_LIMITS.COACHES_PER_EVENT_MAX);

  const coachName = coachNames
    .join(', ')
    .slice(0, VALIDATION_LIMITS.COACH_NAME_MAX);

  return { coachName, coachNames, coachUids };
}

export async function createEvent(
  input: EventFormInput,
  coachUid: string
): Promise<string> {
  const title = input.title.trim().slice(0, VALIDATION_LIMITS.TITLE_MAX);
  const discipline = input.discipline
    .trim()
    .slice(0, VALIDATION_LIMITS.DISCIPLINE_MAX);
  const description = input.description
    .trim()
    .slice(0, VALIDATION_LIMITS.DESCRIPTION_MAX);
  const location = input.location
    .trim()
    .slice(0, VALIDATION_LIMITS.LOCATION_MAX);
  const city = input.city.trim().slice(0, VALIDATION_LIMITS.CITY_MAX);
  const region = (input.region ?? '').trim().slice(0, VALIDATION_LIMITS.REGION_MAX);
  const { coachName, coachNames, coachUids } = normalizeEventCoaches(input);

  if (title.length < VALIDATION_LIMITS.TITLE_MIN) {
    throw new Error('Le titre doit contenir au moins 2 caractères.');
  }
  if (discipline.length < VALIDATION_LIMITS.DISCIPLINE_MIN) {
    throw new Error('Veuillez sélectionner ou saisir une discipline valide.');
  }
  if (location.length < VALIDATION_LIMITS.LOCATION_MIN) {
    throw new Error('Le lieu doit contenir au moins 2 caractères.');
  }
  if (city.length < VALIDATION_LIMITS.CITY_MIN) {
    throw new Error('La ville doit contenir au moins 2 caractères.');
  }
  if (coachNames.length === 0 || coachName.length < VALIDATION_LIMITS.COACH_NAME_MIN) {
    throw new Error('Veuillez sélectionner ou ajouter au moins un animateur (2 caractères minimum).');
  }
  if (
    input.durationMinutes < VALIDATION_LIMITS.DURATION_MIN ||
    input.durationMinutes > VALIDATION_LIMITS.DURATION_MAX
  ) {
    throw new Error('La durée doit être comprise entre 15 et 240 minutes.');
  }
  if (
    !input.isUnlimitedCapacity &&
    (input.maxCapacity < VALIDATION_LIMITS.CAPACITY_MIN ||
      input.maxCapacity > VALIDATION_LIMITS.CAPACITY_MAX)
  ) {
    throw new Error('La capacité doit être comprise entre 1 et 200 places.');
  }

  const pricing = normalizeEventPricing(input);

  const eventRef = doc(collection(db, 'events'));
  try {
    await setDoc(eventRef, {
      title,
      discipline,
      description,
      location,
      city,
      region,
      hasCoords: Boolean(input.hasCoords),
      lat: input.hasCoords ? Number(input.lat) : 0,
      lng: input.hasCoords ? Number(input.lng) : 0,
      coachName,
      coachNames,
      coachUids,
      startAt: Timestamp.fromDate(input.startDate),
      durationMinutes: Math.round(input.durationMinutes),
      isUnlimitedCapacity: Boolean(input.isUnlimitedCapacity),
      maxCapacity: input.isUnlimitedCapacity ? 0 : Math.round(input.maxCapacity),
      registeredCount: 0,
      lastRegId: 'none',
      likesCount: 0,
      lastLikeId: 'none',
      status: 'published',
      cancelReason: '',
      isPaid: pricing.isPaid,
      priceCents: pricing.priceCents,
      currency: pricing.currency,
      paymentMode: pricing.paymentMode,
      createdBy: coachUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return eventRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `events/${eventRef.id}`);
  }
}

export async function updateEvent(
  eventId: string,
  input: EventFormInput,
  currentRegisteredCount: number
): Promise<void> {
  const title = input.title.trim().slice(0, VALIDATION_LIMITS.TITLE_MAX);
  const discipline = input.discipline
    .trim()
    .slice(0, VALIDATION_LIMITS.DISCIPLINE_MAX);
  const description = input.description
    .trim()
    .slice(0, VALIDATION_LIMITS.DESCRIPTION_MAX);
  const location = input.location
    .trim()
    .slice(0, VALIDATION_LIMITS.LOCATION_MAX);
  const city = input.city.trim().slice(0, VALIDATION_LIMITS.CITY_MAX);
  const region = (input.region ?? '').trim().slice(0, VALIDATION_LIMITS.REGION_MAX);
  const { coachName, coachNames, coachUids } = normalizeEventCoaches(input);

  if (discipline.length < VALIDATION_LIMITS.DISCIPLINE_MIN) {
    throw new Error('Veuillez sélectionner ou saisir une discipline valide.');
  }
  if (city.length < VALIDATION_LIMITS.CITY_MIN) {
    throw new Error('La ville doit contenir au moins 2 caractères.');
  }
  if (coachNames.length === 0 || coachName.length < VALIDATION_LIMITS.COACH_NAME_MIN) {
    throw new Error('Veuillez sélectionner ou ajouter au moins un animateur (2 caractères minimum).');
  }

  if (!input.isUnlimitedCapacity && input.maxCapacity < currentRegisteredCount) {
    throw new Error(
      `La capacité maximale ne peut pas être inférieure au nombre d'inscrits actuels (${currentRegisteredCount}).`
    );
  }

  const pricing = normalizeEventPricing(input);
  const eventRef = doc(db, 'events', eventId);
  const startAtTs = Timestamp.fromDate(input.startDate);
  const durationMinutes = Math.round(input.durationMinutes);
  const eventEndAtTs = Timestamp.fromMillis(
    startAtTs.toMillis() + durationMinutes * 60 * 1000
  );

  try {
    await updateDoc(eventRef, {
      title,
      discipline,
      description,
      location,
      city,
      region,
      hasCoords: Boolean(input.hasCoords),
      lat: input.hasCoords ? Number(input.lat) : 0,
      lng: input.hasCoords ? Number(input.lng) : 0,
      coachName,
      coachNames,
      coachUids,
      startAt: startAtTs,
      durationMinutes,
      isUnlimitedCapacity: Boolean(input.isUnlimitedCapacity),
      maxCapacity: input.isUnlimitedCapacity ? 0 : Math.round(input.maxCapacity),
      isPaid: pricing.isPaid,
      priceCents: pricing.priceCents,
      currency: pricing.currency,
      paymentMode: pricing.paymentMode,
      status: input.status ?? 'published',
      cancelReason: (input.status ?? 'published') === 'published' ? '' : 'manual',
      updatedAt: serverTimestamp(),
    });

    if (currentRegisteredCount > 0) {
      const regSnap = await getDocs(
        query(collection(db, 'registrations'), where('eventId', '==', eventId))
      );
      if (!regSnap.empty) {
        const regBatch = writeBatch(db);
        regSnap.docs.forEach((regDoc) => {
          regBatch.update(regDoc.ref, {
            eventTitle: title,
            eventStartAt: startAtTs,
            eventDurationMinutes: durationMinutes,
            eventEndAt: eventEndAtTs,
            updatedAt: serverTimestamp(),
          });
        });
        await regBatch.commit();
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `events/${eventId}`);
  }
}

async function notifyMembersOfCancelledEvent(params: {
  eventId: string;
  eventData?: Partial<SportEvent> | null;
  confirmedRegs: Registration[];
}): Promise<number> {
  if (params.confirmedRegs.length === 0) {
    return 0;
  }

  const eventTitleBase = (params.eventData?.title || '').trim();
  const coachName = (params.eventData?.coachName || '')
    .trim()
    .slice(0, VALIDATION_LIMITS.COACH_NAME_MAX);
  const fallbackDuration =
    typeof params.eventData?.durationMinutes === 'number' &&
    params.eventData.durationMinutes >= VALIDATION_LIMITS.DURATION_MIN
      ? Math.round(params.eventData.durationMinutes)
      : 60;

  const confirmedEmails = new Set(
    params.confirmedRegs.map((r) => r.email.trim().toLowerCase())
  );

  interface PendingCancelNotif {
    notifId: string;
    payload: {
      registrationId: string;
      eventId: string;
      eventTitle: string;
      eventStartAt: Timestamp;
      eventEndAt: Timestamp;
      memberEmail: string;
      memberEmailKey: string;
      type: 'event_cancelled';
      coachName?: string;
      wasPaid: boolean;
      read: false;
      validated: false;
    };
  }

  const candidates: PendingCancelNotif[] = [];

  for (const reg of params.confirmedRegs) {
    const startAt = params.eventData?.startAt ?? reg.eventStartAt;
    const durationMin =
      typeof reg.eventDurationMinutes === 'number' && reg.eventDurationMinutes > 0
        ? reg.eventDurationMinutes
        : fallbackDuration;
    const computedEndAt =
      reg.eventEndAt && reg.eventEndAt.toMillis() >= startAt.toMillis()
        ? reg.eventEndAt
        : Timestamp.fromMillis(startAt.toMillis() + durationMin * 60 * 1000);
    const title = (eventTitleBase || reg.eventTitle || 'Séance sportive')
      .trim()
      .slice(0, VALIDATION_LIMITS.TITLE_MAX);
    const safeTitle = title.length >= VALIDATION_LIMITS.TITLE_MIN ? title : 'Séance sportive';
    const wasPaid = reg.paymentStatus === 'paid' && (reg.amountCents ?? 0) > 0;
    const memberEmail = reg.email.trim().toLowerCase();

    candidates.push({
      notifId: `cancel__${reg.id}`,
      payload: {
        registrationId: reg.id,
        eventId: params.eventId,
        eventTitle: safeTitle,
        eventStartAt: startAt,
        eventEndAt: computedEndAt,
        memberEmail,
        memberEmailKey: reg.emailKey,
        type: 'event_cancelled',
        ...(coachName ? { coachName } : {}),
        wasPaid,
        read: false,
        validated: false,
      },
    });

    if (reg.isGuest && reg.invitedByEmail) {
      const hostEmail = reg.invitedByEmail.trim().toLowerCase();
      if (hostEmail && !confirmedEmails.has(hostEmail)) {
        confirmedEmails.add(hostEmail);
        const hostEmailKey = reg.invitedByEmailKey || (await hashEmailKey(hostEmail));
        candidates.push({
          notifId: `cancel__host__${reg.id}`,
          payload: {
            registrationId: reg.id,
            eventId: params.eventId,
            eventTitle: safeTitle,
            eventStartAt: startAt,
            eventEndAt: computedEndAt,
            memberEmail: hostEmail,
            memberEmailKey: hostEmailKey,
            type: 'event_cancelled',
            ...(coachName ? { coachName } : {}),
            wasPaid,
            read: false,
            validated: false,
          },
        });
      }
    }
  }

  const existingChecks = await Promise.all(
    candidates.map(async (item) => {
      const snap = await getDoc(doc(db, 'memberNotifications', item.notifId));
      return snap.exists() ? null : item;
    })
  );
  const toCreate = existingChecks.filter(
    (item): item is PendingCancelNotif => item !== null
  );

  const CHUNK_SIZE = 4;
  for (let i = 0; i < toCreate.length; i += CHUNK_SIZE) {
    const chunk = toCreate.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    chunk.forEach(({ notifId, payload }) => {
      batch.set(doc(db, 'memberNotifications', notifId), {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
    await batch.commit();
  }

  return toCreate.length;
}

async function deleteEventLikesForEvent(eventId: string): Promise<void> {
  try {
    const likeSnap = await getDocs(
      query(collection(db, 'eventLikes'), where('eventId', '==', eventId))
    );
    if (likeSnap.empty) return;
    const CHUNK_SIZE = 300;
    for (let i = 0; i < likeSnap.docs.length; i += CHUNK_SIZE) {
      const batch = writeBatch(db);
      likeSnap.docs.slice(i, i + CHUNK_SIZE).forEach((d) => {
        batch.delete(d.ref);
      });
      await batch.commit();
    }
  } catch (error) {
    console.warn(`Nettoyage des likes différé pour events/${eventId}:`, error);
  }
}

async function cancelRegistrationsAndDeleteEvent(
  eventId: string,
  confirmedRegs: Registration[]
): Promise<void> {
  await deleteEventLikesForEvent(eventId);

  const CHUNK_SIZE = 5;
  for (let i = 0; i < confirmedRegs.length; i += CHUNK_SIZE) {
    const chunk = confirmedRegs.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    for (const reg of chunk) {
      const regRef = doc(db, 'registrations', reg.id);
      const nextPayStatus =
        reg.paymentStatus === 'paid' ? 'refunded' : reg.paymentStatus;
      batch.update(regRef, {
        status: 'cancelled',
        ...(nextPayStatus ? { paymentStatus: nextPayStatus } : {}),
        updatedAt: serverTimestamp(),
      });
      if (reg.paymentStatus === 'paid') {
        const payRef = doc(db, 'payments', reg.id);
        const paySnap = await getDoc(payRef);
        if (paySnap.exists()) {
          batch.update(payRef, {
            status: 'refunded',
            updatedAt: serverTimestamp(),
          });
        }
      }
    }
    if (i + CHUNK_SIZE >= confirmedRegs.length) {
      batch.delete(doc(db, 'events', eventId));
    }
    await batch.commit();
  }

  if (confirmedRegs.length === 0) {
    await deleteDoc(doc(db, 'events', eventId));
  }
}

export async function toggleEventStatus(
  eventId: string,
  nextStatus: EventStatus,
  cancelReason?: EventCancelReason
): Promise<void> {
  try {
    if (nextStatus === 'cancelled' && cancelReason !== 'no_registrants') {
      const [eventSnap, regSnap] = await Promise.all([
        getDoc(doc(db, 'events', eventId)),
        getDocs(
          query(collection(db, 'registrations'), where('eventId', '==', eventId))
        ),
      ]);
      const eventData = eventSnap.exists()
        ? (eventSnap.data() as Partial<SportEvent>)
        : null;
      const confirmedRegs = regSnap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<Registration, 'id'>) }))
        .filter((r) => r.status === 'confirmed');
      if (confirmedRegs.length > 0) {
        await notifyMembersOfCancelledEvent({
          eventId,
          eventData,
          confirmedRegs,
        });
      }
    }

    await updateDoc(doc(db, 'events', eventId), {
      status: nextStatus,
      cancelReason:
        nextStatus === 'cancelled' ? (cancelReason ?? 'manual') : '',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `events/${eventId}`);
  }
}

export async function autoCancelZeroRegistrationEvent(
  eventId: string
): Promise<void> {
  try {
    await updateDoc(doc(db, 'events', eventId), {
      status: 'cancelled',
      cancelReason: 'no_registrants',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.warn(
      `Annulation automatique différée pour events/${eventId}:`,
      error
    );
  }
}

export async function autoDeleteCancelledEvent(
  eventId: string
): Promise<boolean> {
  try {
    const [eventSnap, regSnap] = await Promise.all([
      getDoc(doc(db, 'events', eventId)),
      getDocs(
        query(collection(db, 'registrations'), where('eventId', '==', eventId))
      ),
    ]);
    const eventData = eventSnap.exists()
      ? (eventSnap.data() as Partial<SportEvent>)
      : null;
    const confirmedRegs = regSnap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<Registration, 'id'>) }))
      .filter((r) => r.status === 'confirmed');

    if (
      confirmedRegs.length > 0 &&
      eventData?.cancelReason !== 'no_registrants'
    ) {
      await notifyMembersOfCancelledEvent({
        eventId,
        eventData,
        confirmedRegs,
      });
    }

    await cancelRegistrationsAndDeleteEvent(eventId, confirmedRegs);
    return true;
  } catch (error) {
    console.warn(
      `Suppression automatique d’événement annulé différée pour events/${eventId}:`,
      error
    );
    return false;
  }
}

export async function deleteAutoCancelledEventIfEligible(
  eventId: string,
  isCoachUser: boolean
): Promise<boolean> {
  if (isCoachUser) {
    return autoDeleteCancelledEvent(eventId);
  }
  try {
    const eventRef = doc(db, 'events', eventId);
    const snap = await getDocFromServer(eventRef);
    if (!snap.exists()) return true;
    const ev = parseLiveSportEventSnapshot(
      snap.id,
      snap.data() as Partial<SportEvent>
    );
    const evalInfo = evaluateEventBooking(ev, Date.now());
    if (ev.status === 'cancelled' || evalInfo.isAutoCancelledNoRegistrants) {
      await deleteDoc(eventRef);
      return true;
    }
    return false;
  } catch (error) {
    console.warn(
      `Suppression d’événement annulé différée pour events/${eventId}:`,
      error
    );
    return false;
  }
}

export async function notifyMembersOfEndedEvent(
  event: SportEvent
): Promise<boolean> {
  try {
    if (event.status === 'published' && event.registeredCount > 0) {
      const regSnap = await getDocs(
        query(collection(db, 'registrations'), where('eventId', '==', event.id))
      );

      const pendingNotifs: Array<{
        reg: Registration;
        eventEndAt: Timestamp;
      }> = [];

      const fallbackEndAt = Timestamp.fromMillis(
        event.startAt.toMillis() + event.durationMinutes * 60 * 1000
      );

      for (const regDoc of regSnap.docs) {
        const reg = {
          id: regDoc.id,
          ...(regDoc.data() as Omit<Registration, 'id'>),
        };
        if (reg.status !== 'confirmed' || reg.attended) continue;

        const notifSnap = await getDoc(doc(db, 'memberNotifications', reg.id));
        if (!notifSnap.exists()) {
          pendingNotifs.push({
            reg,
            eventEndAt: reg.eventEndAt ?? fallbackEndAt,
          });
        }
      }

      if (pendingNotifs.length > 0) {
        const batch = writeBatch(db);
        pendingNotifs.forEach(({ reg, eventEndAt }) => {
          batch.set(doc(db, 'memberNotifications', reg.id), {
            registrationId: reg.id,
            eventId: reg.eventId,
            eventTitle: (reg.eventTitle || event.title).slice(
              0,
              VALIDATION_LIMITS.TITLE_MAX
            ),
            eventStartAt: reg.eventStartAt,
            eventEndAt,
            memberEmail: reg.email.trim().toLowerCase(),
            memberEmailKey: reg.emailKey,
            type: 'validate_session',
            read: false,
            validated: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        });
        await batch.commit();
      }
    }

    return true;
  } catch (error) {
    console.warn(
      `Notification de fin de séance différée pour events/${event.id}:`,
      error
    );
    return false;
  }
}

export async function deleteEndedEventAfterRetention(
  event: SportEvent
): Promise<boolean> {
  try {
    await notifyMembersOfEndedEvent(event);
    await deleteEventLikesForEvent(event.id);
    await deleteDoc(doc(db, 'events', event.id));
    return true;
  } catch (error) {
    console.warn(
      `Suppression automatique après 30 jours différée pour events/${event.id}:`,
      error
    );
    return false;
  }
}

export function subscribeMyMemberNotifications(
  email: string,
  onData: (notifications: MemberNotification[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const cleanEmail = email.trim().toLowerCase();
  const q = query(
    collection(db, 'memberNotifications'),
    where('memberEmail', '==', cleanEmail)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const list: MemberNotification[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<MemberNotification, 'id'>),
      }));
      list.sort((a, b) => {
        const aMs = a.createdAt?.toMillis?.() ?? a.eventEndAt?.toMillis?.() ?? 0;
        const bMs = b.createdAt?.toMillis?.() ?? b.eventEndAt?.toMillis?.() ?? 0;
        return bMs - aMs;
      });
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'memberNotifications');
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export async function ensureSessionValidationNotification(
  reg: Registration,
  fallbackEndMs: number
): Promise<boolean> {
  if (reg.status !== 'confirmed' || reg.attended) return true;
  try {
    const notifRef = doc(db, 'memberNotifications', reg.id);
    const existing = await getDoc(notifRef);
    if (existing.exists()) return true;

    const eventEndAt =
      reg.eventEndAt ?? Timestamp.fromMillis(fallbackEndMs);
    await setDoc(notifRef, {
      registrationId: reg.id,
      eventId: reg.eventId,
      eventTitle: reg.eventTitle.slice(0, VALIDATION_LIMITS.TITLE_MAX),
      eventStartAt: reg.eventStartAt,
      eventEndAt,
      memberEmail: reg.email.trim().toLowerCase(),
      memberEmailKey: reg.emailKey,
      type: 'validate_session',
      read: false,
      validated: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (error) {
    console.warn(
      `Création différée de notification fin de séance pour ${reg.id}:`,
      error
    );
    return false;
  }
}

export async function validateMemberSession(
  registration: Registration
): Promise<void> {
  if (registration.status !== 'confirmed') {
    throw new Error('Seule une inscription confirmée peut être validée.');
  }
  if (registration.attended) {
    return;
  }

  const regRef = doc(db, 'registrations', registration.id);
  const notifRef = doc(db, 'memberNotifications', registration.id);
  const batch = writeBatch(db);

  batch.update(regRef, {
    attended: true,
    memberValidated: true,
    updatedAt: serverTimestamp(),
  });

  try {
    const notifSnap = await getDoc(notifRef);
    if (notifSnap.exists()) {
      batch.update(notifRef, {
        validated: true,
        read: true,
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `registrations/${registration.id}`
    );
  }
}

export async function markMemberNotificationRead(
  notificationId: string
): Promise<void> {
  try {
    await updateDoc(doc(db, 'memberNotifications', notificationId), {
      read: true,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `memberNotifications/${notificationId}`
    );
  }
}

export async function markAllMemberNotificationsRead(
  notifications: MemberNotification[]
): Promise<void> {
  const unread = notifications.filter((n) => !n.read);
  if (unread.length === 0) return;

  const batch = writeBatch(db);
  unread.forEach((n) => {
    batch.update(doc(db, 'memberNotifications', n.id), {
      read: true,
      updatedAt: serverTimestamp(),
    });
  });
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'memberNotifications');
  }
}

export async function deleteMemberNotification(
  notificationId: string
): Promise<void> {
  try {
    await deleteDoc(doc(db, 'memberNotifications', notificationId));
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.DELETE,
      `memberNotifications/${notificationId}`
    );
  }
}

export function subscribeMyCoachNotifications(
  coachUid: string,
  onData: (notifications: CoachNotification[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, 'coachNotifications'),
    where('coachUid', '==', coachUid)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const list: CoachNotification[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<CoachNotification, 'id'>),
      }));
      list.sort((a, b) => {
        const aMs = a.createdAt?.toMillis?.() ?? 0;
        const bMs = b.createdAt?.toMillis?.() ?? 0;
        return bMs - aMs;
      });
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'coachNotifications');
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export async function markCoachNotificationRead(
  notificationId: string
): Promise<void> {
  try {
    await updateDoc(doc(db, 'coachNotifications', notificationId), {
      read: true,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `coachNotifications/${notificationId}`
    );
  }
}

export async function markAllCoachNotificationsRead(
  notifications: CoachNotification[]
): Promise<void> {
  const unread = notifications.filter((n) => !n.read);
  if (unread.length === 0) return;

  const batch = writeBatch(db);
  unread.forEach((n) => {
    batch.update(doc(db, 'coachNotifications', n.id), {
      read: true,
      updatedAt: serverTimestamp(),
    });
  });
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'coachNotifications');
  }
}

export async function deleteCoachNotification(
  notificationId: string
): Promise<void> {
  try {
    await deleteDoc(doc(db, 'coachNotifications', notificationId));
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.DELETE,
      `coachNotifications/${notificationId}`
    );
  }
}

export async function deleteEvent(
  eventId: string
): Promise<{ cancelledRegistrations: number; notificationsSent: number }> {
  try {
    const [eventSnap, regSnap] = await Promise.all([
      getDoc(doc(db, 'events', eventId)),
      getDocs(
        query(collection(db, 'registrations'), where('eventId', '==', eventId))
      ),
    ]);
    const eventData = eventSnap.exists()
      ? (eventSnap.data() as Partial<SportEvent>)
      : null;
    const confirmedRegs = regSnap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<Registration, 'id'>) }))
      .filter((r) => r.status === 'confirmed');

    const notificationsSent =
      confirmedRegs.length > 0
        ? await notifyMembersOfCancelledEvent({
            eventId,
            eventData,
            confirmedRegs,
          })
        : 0;

    await cancelRegistrationsAndDeleteEvent(eventId, confirmedRegs);
    return {
      cancelledRegistrations: confirmedRegs.length,
      notificationsSent,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `events/${eventId}`);
  }
}

export interface RegisterPaymentInput {
  method: 'free' | 'card' | 'onsite';
  cardBrand?: string;
  cardLast4?: string;
  paymentReference?: string;
  markPaidAsCoach?: boolean;
}

export interface RegisterEventResult {
  registrationId: string;
  emailKey: string;
  amountCents: number;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  paymentReference: string;
  cardBrand: string;
  cardLast4: string;
}

export interface GuestRegistrationResult extends RegisterEventResult {
  firstName: string;
  lastName: string;
  email: string;
}

export interface RegisterEventWithGuestsResult {
  primary: RegisterEventResult | null;
  guests: GuestRegistrationResult[];
  totalAmountCents: number;
}

export class PartialGuestBookingError extends Error {
  primary: RegisterEventResult | null;
  guests: GuestRegistrationResult[];

  constructor(
    message: string,
    primary: RegisterEventResult | null,
    guests: GuestRegistrationResult[]
  ) {
    super(message);
    this.name = 'PartialGuestBookingError';
    this.primary = primary;
    this.guests = guests;
  }
}

function parseLiveSportEventSnapshot(
  id: string,
  raw: Partial<SportEvent>
): SportEvent {
  const priceCents =
    typeof raw.priceCents === 'number' && raw.priceCents >= 0
      ? Math.round(raw.priceCents)
      : 0;
  const isPaid =
    Boolean(raw.isPaid) && priceCents >= VALIDATION_LIMITS.PRICE_MIN_CENTS;
  return {
    ...(raw as Omit<SportEvent, 'id'>),
    id,
    city: typeof raw.city === 'string' && raw.city.trim() ? raw.city : 'Paris',
    region: typeof raw.region === 'string' ? raw.region : '',
    isUnlimitedCapacity: Boolean(raw.isUnlimitedCapacity),
    hasCoords: Boolean(raw.hasCoords),
    lat: typeof raw.lat === 'number' ? raw.lat : 0,
    lng: typeof raw.lng === 'number' ? raw.lng : 0,
    isPaid,
    priceCents: isPaid ? priceCents : 0,
    currency: 'EUR',
    paymentMode:
      raw.paymentMode === 'onsite' || raw.paymentMode === 'both'
        ? raw.paymentMode
        : 'online',
    likesCount:
      typeof raw.likesCount === 'number' && raw.likesCount >= 0
        ? Math.round(raw.likesCount)
        : 0,
    lastLikeId:
      typeof raw.lastLikeId === 'string' && raw.lastLikeId
        ? raw.lastLikeId
        : 'none',
  };
}

async function commitSingleParticipantRegistration(params: {
  event: SportEvent;
  firstName: string;
  lastName: string;
  email: string;
  isGuest: boolean;
  invitedByEmail?: string;
  invitedByEmailKey?: string;
  invitedByName?: string;
  bypassCutoffAsCoach?: boolean;
  isPaidEvent: boolean;
  amountCents: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  paymentReference: string;
  cardBrand: string;
  cardLast4: string;
  prefetchedHostInvitedRegs?: Array<{ id: string; data: Partial<Registration> }>;
  prefetchedHostPayments?: Array<{ id: string; data: Partial<PaymentRecord> }>;
}): Promise<RegisterEventResult> {
  const email = params.email.trim().toLowerCase().slice(0, VALIDATION_LIMITS.EMAIL_MAX);
  const emailKey = await hashEmailKey(email);
  const registrationId = `${params.event.id}__${emailKey}`;

  const findExistingRegistration = async (): Promise<{
    id: string;
    data: Partial<Registration>;
  } | null> => {
    const regRefDirect = doc(db, 'registrations', registrationId);
    if (params.bypassCutoffAsCoach) {
      const snap = await getDocFromServer(regRefDirect);
      return snap.exists()
        ? { id: snap.id, data: snap.data() as Partial<Registration> }
        : null;
    }
    if (params.isGuest) {
      if (params.prefetchedHostInvitedRegs) {
        const cached = params.prefetchedHostInvitedRegs.find(
          (item) => item.id === registrationId
        );
        return cached ?? null;
      }
      const hostEmail = (params.invitedByEmail ?? '').trim().toLowerCase();
      if (!hostEmail) return null;
      const snap = await getDocsFromServer(
        query(
          collection(db, 'registrations'),
          where('invitedByEmail', '==', hostEmail)
        )
      );
      const matched = snap.docs.find((d) => d.id === registrationId);
      return matched
        ? { id: matched.id, data: matched.data() as Partial<Registration> }
        : null;
    }
    const snap = await getDocsFromServer(
      query(collection(db, 'registrations'), where('email', '==', email))
    );
    const matched = snap.docs.find(
      (d) =>
        d.id === registrationId ||
        (d.data() as Partial<Registration>).eventId === params.event.id
    );
    return matched
      ? { id: matched.id, data: matched.data() as Partial<Registration> }
      : null;
  };

  const findExistingPayment = async (
    targetRegistrationId: string
  ): Promise<boolean> => {
    const payRefDirect = doc(db, 'payments', targetRegistrationId);
    if (params.bypassCutoffAsCoach) {
      const snap = await getDocFromServer(payRefDirect);
      return snap.exists();
    }
    if (params.isGuest) {
      if (params.prefetchedHostPayments) {
        return params.prefetchedHostPayments.some(
          (item) =>
            item.id === targetRegistrationId ||
            item.data.registrationId === targetRegistrationId
        );
      }
      const hostEmail = (params.invitedByEmail ?? '').trim().toLowerCase();
      if (!hostEmail) return false;
      const snap = await getDocsFromServer(
        query(collection(db, 'payments'), where('payerEmail', '==', hostEmail))
      );
      return snap.docs.some(
        (d) =>
          d.id === targetRegistrationId ||
          (d.data() as Partial<PaymentRecord>).registrationId ===
            targetRegistrationId
      );
    }
    const snap = await getDocsFromServer(
      query(collection(db, 'payments'), where('memberEmail', '==', email))
    );
    return snap.docs.some(
      (d) =>
        d.id === targetRegistrationId ||
        (d.data() as Partial<PaymentRecord>).registrationId ===
          targetRegistrationId
    );
  };

  const formatPermissionDeniedError = (error: unknown): never => {
    const errInfo = buildFirestoreErrorInfo(
      error,
      OperationType.WRITE,
      `registrations/${registrationId}`
    );
    console.error('Firestore Error: ', JSON.stringify(errInfo));
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('permission-denied') || msg.includes('PERMISSION_DENIED')) {
      if (params.isGuest) {
        throw new Error(
          `Impossible d’inscrire l’invité(e) ${params.firstName} ${params.lastName} (${email}) : cette adresse email est peut-être déjà inscrite à cette séance.`
        );
      }
      const signedInEmail = auth.currentUser?.email?.trim().toLowerCase() ?? '';
      if (!params.bypassCutoffAsCoach && signedInEmail && signedInEmail !== email) {
        throw new Error(
          `L’adresse email saisie (${email}) doit correspondre à votre compte connecté (${signedInEmail}).`
        );
      }
      throw new Error(
        'Impossible de valider votre inscription pour le moment (autorisation refusée). Vérifiez votre connexion et réessayez.'
      );
    }
    throw new Error(JSON.stringify(errInfo));
  };

  let existingReg: { id: string; data: Partial<Registration> } | null = null;
  try {
    existingReg = await findExistingRegistration();
  } catch (error) {
    formatPermissionDeniedError(error);
  }

  let existingEmail = email;
  if (existingReg) {
    if (existingReg.data.status === 'confirmed') {
      throw new Error(
        params.isGuest
          ? `L’invité(e) « ${email} » est déjà inscrit(e) à cette séance.`
          : 'Cette adresse email est déjà inscrite à cette séance.'
      );
    }
    if (typeof existingReg.data.email === 'string' && existingReg.data.email) {
      existingEmail = existingReg.data.email;
    }
  }

  const targetRegistrationId = existingReg?.id ?? registrationId;
  const batch = writeBatch(db);
  const regRef = doc(db, 'registrations', targetRegistrationId);
  const eventRef = doc(db, 'events', params.event.id);

  const durationMinutes = Math.round(params.event.durationMinutes);
  const eventEndAt = Timestamp.fromMillis(
    params.event.startAt.toMillis() + durationMinutes * 60 * 1000
  );

  const guestFieldsForCreate = params.isGuest
    ? {
        isGuest: true,
        invitedByEmail: params.invitedByEmail,
        invitedByEmailKey: params.invitedByEmailKey,
        invitedByName: (params.invitedByName ?? '').slice(0, 125),
      }
    : {
        isGuest: false,
      };

  const guestFieldsForUpdate = params.isGuest
    ? guestFieldsForCreate
    : {
        isGuest: false,
        invitedByEmail: deleteField(),
        invitedByEmailKey: deleteField(),
        invitedByName: deleteField(),
      };

  const registrationBasePayload = {
    eventId: params.event.id,
    eventTitle: params.event.title.slice(0, VALIDATION_LIMITS.TITLE_MAX),
    eventStartAt: params.event.startAt,
    eventDurationMinutes: durationMinutes,
    eventEndAt,
    firstName: params.firstName,
    lastName: params.lastName,
    email: existingEmail,
    emailKey,
    attended: false,
    memberValidated: false,
    status: 'confirmed',
    amountCents: params.amountCents,
    currency: 'EUR',
    paymentStatus: params.paymentStatus,
    paymentMethod: params.paymentMethod,
    paymentReference: params.paymentReference,
    cardBrand: params.cardBrand,
    cardLast4: params.cardLast4,
    paidAt: params.paymentStatus === 'paid' ? serverTimestamp() : null,
    updatedAt: serverTimestamp(),
  };

  if (existingReg) {
    batch.update(regRef, {
      ...registrationBasePayload,
      ...guestFieldsForUpdate,
    });
  } else {
    batch.set(regRef, {
      ...registrationBasePayload,
      ...guestFieldsForCreate,
      createdAt: serverTimestamp(),
    });
  }

  if (
    params.isPaidEvent &&
    (params.paymentMethod === 'card' || params.paymentMethod === 'onsite')
  ) {
    const payRef = doc(db, 'payments', targetRegistrationId);
    let existingPayExists = false;
    try {
      existingPayExists = await findExistingPayment(targetRegistrationId);
    } catch (error) {
      formatPermissionDeniedError(error);
    }
    const paymentPayload = {
      eventTitle: params.event.title.slice(0, VALIDATION_LIMITS.TITLE_MAX),
      eventStartAt: params.event.startAt,
      memberName: `${params.firstName} ${params.lastName}`.trim().slice(0, 125),
      amountCents: params.amountCents,
      method: params.paymentMethod,
      status: params.paymentStatus === 'paid' ? 'paid' : 'pending',
      reference: params.paymentReference,
      cardBrand: params.cardBrand,
      cardLast4: params.cardLast4,
      paidAt: params.paymentStatus === 'paid' ? serverTimestamp() : null,
      updatedAt: serverTimestamp(),
    };

    if (existingPayExists) {
      batch.update(payRef, {
        ...paymentPayload,
        ...(params.isGuest
          ? { isGuest: true, payerEmail: params.invitedByEmail }
          : { isGuest: false, payerEmail: deleteField() }),
      });
    } else {
      batch.set(payRef, {
        registrationId: targetRegistrationId,
        eventId: params.event.id,
        memberEmail: email,
        memberEmailKey: emailKey,
        currency: 'EUR',
        ...paymentPayload,
        ...(params.isGuest
          ? { isGuest: true, payerEmail: params.invitedByEmail }
          : { isGuest: false }),
        createdAt: serverTimestamp(),
      });
    }
  }

  batch.update(eventRef, {
    registeredCount: increment(1),
    lastRegId: targetRegistrationId,
    updatedAt: serverTimestamp(),
  });

  const rawCoachUids =
    Array.isArray(params.event.coachUids) && params.event.coachUids.length > 0
      ? params.event.coachUids
      : [params.event.createdBy];
  const targetCoachUids = Array.from(
    new Set(rawCoachUids.map((u) => u.trim()).filter(Boolean))
  ).slice(0, VALIDATION_LIMITS.COACHES_PER_EVENT_MAX);

  targetCoachUids.forEach((targetCoachUid) => {
    const notifRef = doc(collection(db, 'coachNotifications'));
    batch.set(notifRef, {
      coachUid: targetCoachUid,
      type: 'new_registration',
      eventId: params.event.id,
      eventTitle: params.event.title.slice(0, VALIDATION_LIMITS.TITLE_MAX),
      eventStartAt: params.event.startAt,
      registrationId: targetRegistrationId,
      memberName: `${params.firstName} ${params.lastName}`.trim().slice(0, 125),
      memberEmail: email,
      ...(params.isGuest && params.invitedByName
        ? { invitedByName: params.invitedByName.slice(0, 125) }
        : {}),
      read: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  try {
    await batch.commit();
    return {
      registrationId: targetRegistrationId,
      emailKey,
      amountCents: params.amountCents,
      paymentStatus: params.paymentStatus,
      paymentMethod: params.paymentMethod,
      paymentReference: params.paymentReference,
      cardBrand: params.cardBrand,
      cardLast4: params.cardLast4,
    };
  } catch (error) {
    try {
      const latestSnap = await getDocFromServer(eventRef);
      if (latestSnap.exists()) {
        const latestEvent = parseLiveSportEventSnapshot(
          latestSnap.id,
          latestSnap.data() as Partial<SportEvent>
        );
        const latestEval = evaluateEventBooking(latestEvent, Date.now());
        if (latestEval.state === 'cancelled') {
          if (latestEval.isAutoCancelledNoRegistrants) {
            void deleteAutoCancelledEventIfEligible(
              latestEvent.id,
              Boolean(params.bypassCutoffAsCoach)
            );
          }
          throw new Error('Inscription fermée : événement annulé.');
        }
        if (latestEval.state === 'past' && !params.bypassCutoffAsCoach) {
          throw new Error(
            'Les inscriptions sont fermées : cette séance a déjà commencé.'
          );
        }
        if (latestEval.state === 'full') {
          throw new Error('La dernière place vient d’être réservée.');
        }
      }
      const latestReg = await findExistingRegistration();
      if (latestReg && latestReg.data.status === 'confirmed') {
        throw new Error(
          params.isGuest
            ? `L’invité(e) « ${email} » est déjà inscrit(e) à cette séance.`
            : 'Cette adresse email est déjà inscrite à cette séance.'
        );
      }
    } catch (innerError) {
      if (
        innerError instanceof Error &&
        (innerError.message.includes('fermée') ||
          innerError.message.includes('commencé') ||
          innerError.message.includes('dernière place') ||
          innerError.message.includes('annulé') ||
          innerError.message.includes('déjà inscrit'))
      ) {
        throw innerError;
      }
    }

    return formatPermissionDeniedError(error);
  }
}

export async function registerEventWithGuests(params: {
  event: SportEvent;
  firstName: string;
  lastName: string;
  email: string;
  guests?: GuestInput[];
  skipSelf?: boolean;
  bypassCutoffAsCoach?: boolean;
  payment?: RegisterPaymentInput;
}): Promise<RegisterEventWithGuestsResult> {
  const firstName = params.firstName
    .trim()
    .slice(0, VALIDATION_LIMITS.FIRST_NAME_MAX);
  const lastName = params.lastName
    .trim()
    .slice(0, VALIDATION_LIMITS.LAST_NAME_MAX);
  const email = params.email
    .trim()
    .toLowerCase()
    .slice(0, VALIDATION_LIMITS.EMAIL_MAX);

  if (firstName.length < VALIDATION_LIMITS.FIRST_NAME_MIN) {
    throw new Error('Veuillez saisir votre prénom.');
  }
  if (lastName.length < VALIDATION_LIMITS.LAST_NAME_MIN) {
    throw new Error('Veuillez saisir votre nom.');
  }
  if (!VALIDATION_LIMITS.EMAIL_REGEX.test(email)) {
    throw new Error('Veuillez saisir une adresse email valide.');
  }

  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.email || currentUser.isAnonymous) {
    throw new Error(
      'Veuillez vous connecter avec votre compte pour confirmer votre inscription.'
    );
  }

  const rawGuests = params.guests ?? [];
  if (rawGuests.length > VALIDATION_LIMITS.GUESTS_PER_BOOKING_MAX) {
    throw new Error(
      `Vous pouvez ajouter au maximum ${VALIDATION_LIMITS.GUESTS_PER_BOOKING_MAX} invités à la fois.`
    );
  }

  const normalizedGuests: GuestInput[] = [];
  const seenGuestEmails = new Set<string>();
  for (let i = 0; i < rawGuests.length; i += 1) {
    const g = rawGuests[i];
    const gFirst = (g.firstName || '').trim().slice(0, VALIDATION_LIMITS.FIRST_NAME_MAX);
    const gLast = (g.lastName || '').trim().slice(0, VALIDATION_LIMITS.LAST_NAME_MAX);
    const gEmail = (g.email || '')
      .trim()
      .toLowerCase()
      .slice(0, VALIDATION_LIMITS.EMAIL_MAX);

    if (gFirst.length < VALIDATION_LIMITS.FIRST_NAME_MIN) {
      throw new Error(`Veuillez saisir le prénom de l’invité ${i + 1}.`);
    }
    if (gLast.length < VALIDATION_LIMITS.LAST_NAME_MIN) {
      throw new Error(`Veuillez saisir le nom de l’invité ${i + 1}.`);
    }
    if (!VALIDATION_LIMITS.EMAIL_REGEX.test(gEmail)) {
      throw new Error(
        `Veuillez saisir une adresse email valide pour l’invité ${i + 1}.`
      );
    }
    if (gEmail === email) {
      throw new Error(
        `L’invité ${i + 1} ne peut pas utiliser la même adresse email que vous (${gEmail}).`
      );
    }
    if (seenGuestEmails.has(gEmail)) {
      throw new Error(
        `L’adresse email « ${gEmail} » est saisie plusieurs fois dans vos invités.`
      );
    }
    seenGuestEmails.add(gEmail);
    normalizedGuests.push({
      firstName: gFirst,
      lastName: gLast,
      email: gEmail,
    });
  }

  if (params.skipSelf && normalizedGuests.length === 0) {
    throw new Error('Veuillez ajouter au moins un invité.');
  }

  // Live capacity & status verification before writing any batch
  let liveEvent = params.event;
  try {
    const liveEventSnap = await getDocFromServer(doc(db, 'events', params.event.id));
    if (!liveEventSnap.exists()) {
      throw new Error('Cet événement n’existe plus.');
    }
    liveEvent = parseLiveSportEventSnapshot(
      liveEventSnap.id,
      liveEventSnap.data() as Partial<SportEvent>
    );
  } catch (err) {
    if (err instanceof Error && err.message.includes('n’existe plus')) {
      throw err;
    }
  }

  const evaluation = evaluateEventBooking(liveEvent, Date.now());
  if (evaluation.state === 'cancelled') {
    if (evaluation.isAutoCancelledNoRegistrants) {
      void deleteAutoCancelledEventIfEligible(
        liveEvent.id,
        Boolean(params.bypassCutoffAsCoach)
      );
    }
    throw new Error('Inscription fermée : événement annulé.');
  }
  if (evaluation.state === 'full') {
    throw new Error('Cet événement est complet.');
  }
  if (!params.bypassCutoffAsCoach && evaluation.state === 'past') {
    throw new Error(
      'Les inscriptions sont fermées : cet événement est déjà commencé ou terminé.'
    );
  }

  const neededSpots = (params.skipSelf ? 0 : 1) + normalizedGuests.length;
  if (!liveEvent.isUnlimitedCapacity) {
    const remaining = Math.max(0, liveEvent.maxCapacity - liveEvent.registeredCount);
    if (remaining < neededSpots) {
      throw new Error(
        `Il ne reste que ${remaining} place${remaining > 1 ? 's' : ''} disponible${remaining > 1 ? 's' : ''} pour cette séance (vous demandez ${neededSpots} place${neededSpots > 1 ? 's' : ''}).`
      );
    }
  }

  const isPaidEvent =
    Boolean(liveEvent.isPaid) &&
    typeof liveEvent.priceCents === 'number' &&
    liveEvent.priceCents >= VALIDATION_LIMITS.PRICE_MIN_CENTS;
  const amountCents = isPaidEvent ? Math.round(liveEvent.priceCents!) : 0;
  const allowedMode: EventPaymentMode = liveEvent.paymentMode ?? 'online';

  let paymentMethod: PaymentMethod = 'free';
  let paymentStatus: PaymentStatus = 'free';
  let cardBrand = '';
  let cardLast4 = '';

  if (isPaidEvent) {
    const requestedMethod = params.payment?.method;
    if (requestedMethod !== 'card' && requestedMethod !== 'onsite') {
      throw new Error(
        'Veuillez choisir un mode de règlement pour cette séance payante.'
      );
    }
    if (
      !params.bypassCutoffAsCoach &&
      requestedMethod === 'card' &&
      allowedMode === 'onsite'
    ) {
      throw new Error('Cette séance se règle uniquement sur place.');
    }
    if (
      !params.bypassCutoffAsCoach &&
      requestedMethod === 'onsite' &&
      allowedMode === 'online'
    ) {
      throw new Error('Cette séance nécessite un règlement par carte en ligne.');
    }

    paymentMethod = requestedMethod;
    if (requestedMethod === 'card') {
      const cleanLast4 = (params.payment?.cardLast4 ?? '')
        .replace(/\D/g, '')
        .slice(-4);
      if (cleanLast4.length !== 4) {
        throw new Error('Informations de carte bancaire incomplètes.');
      }
      cardBrand = (params.payment?.cardBrand ?? 'CB').trim().slice(0, 24);
      cardLast4 = cleanLast4;
      paymentStatus = 'paid';
    } else {
      paymentStatus =
        params.bypassCutoffAsCoach && params.payment?.markPaidAsCoach
          ? 'paid'
          : 'pending';
    }
  }

  const signedInEmail = currentUser.email.trim().toLowerCase();
  const hostEmailKey =
    normalizedGuests.length > 0 ? await hashEmailKey(signedInEmail) : '';
  const hostDisplayName = `${firstName} ${lastName}`.trim().slice(0, 125);

  let prefetchedHostInvitedRegs:
    | Array<{ id: string; data: Partial<Registration> }>
    | undefined;
  let prefetchedHostPayments:
    | Array<{ id: string; data: Partial<PaymentRecord> }>
    | undefined;

  if (normalizedGuests.length > 0 && params.bypassCutoffAsCoach) {
    const guestChecks = await Promise.all(
      normalizedGuests.map(async (guest) => {
        const guestEmailKey = await hashEmailKey(guest.email);
        const guestRegId = `${liveEvent.id}__${guestEmailKey}`;
        const snap = await getDocFromServer(doc(db, 'registrations', guestRegId));
        return { guest, snap };
      })
    );
    for (const { guest, snap } of guestChecks) {
      if (snap.exists() && (snap.data() as Partial<Registration>).status === 'confirmed') {
        throw new Error(
          `L’invité(e) ${guest.firstName} ${guest.lastName} (${guest.email}) est déjà inscrit(e) à cette séance.`
        );
      }
    }
  } else if (normalizedGuests.length > 0 && !params.bypassCutoffAsCoach) {
    const [invitedRegsSnap, hostPaySnap] = await Promise.all([
      getDocsFromServer(
        query(
          collection(db, 'registrations'),
          where('invitedByEmail', '==', signedInEmail)
        )
      ),
      isPaidEvent
        ? getDocsFromServer(
            query(
              collection(db, 'payments'),
              where('payerEmail', '==', signedInEmail)
            )
          )
        : Promise.resolve(null),
    ]);

    prefetchedHostInvitedRegs = invitedRegsSnap.docs.map((d) => ({
      id: d.id,
      data: d.data() as Partial<Registration>,
    }));
    prefetchedHostPayments = hostPaySnap
      ? hostPaySnap.docs.map((d) => ({
          id: d.id,
          data: d.data() as Partial<PaymentRecord>,
        }))
      : [];

    for (const guest of normalizedGuests) {
      const guestEmailKey = await hashEmailKey(guest.email);
      const guestRegId = `${liveEvent.id}__${guestEmailKey}`;
      const existingInvited = prefetchedHostInvitedRegs.find(
        (item) => item.id === guestRegId
      );
      if (existingInvited && existingInvited.data.status === 'confirmed') {
        throw new Error(
          `L’invité(e) ${guest.firstName} ${guest.lastName} (${guest.email}) est déjà inscrit(e) à cette séance.`
        );
      }
    }
  }

  let primaryResult: RegisterEventResult | null = null;
  if (!params.skipSelf) {
    const primaryRef = isPaidEvent
      ? (
          params.payment?.paymentReference?.trim() ||
          generatePaymentReference('GFN')
        ).slice(0, VALIDATION_LIMITS.PAYMENT_REF_MAX)
      : '';
    primaryResult = await commitSingleParticipantRegistration({
      event: liveEvent,
      firstName,
      lastName,
      email,
      isGuest: false,
      bypassCutoffAsCoach: params.bypassCutoffAsCoach,
      isPaidEvent,
      amountCents,
      paymentMethod,
      paymentStatus,
      paymentReference: primaryRef,
      cardBrand,
      cardLast4,
    });
  }

  const guestResults: GuestRegistrationResult[] = [];
  for (let i = 0; i < normalizedGuests.length; i += 1) {
    const guest = normalizedGuests[i];
    const guestRef = isPaidEvent
      ? generatePaymentReference('GFN').slice(0, VALIDATION_LIMITS.PAYMENT_REF_MAX)
      : '';
    try {
      const res = await commitSingleParticipantRegistration({
        event: liveEvent,
        firstName: guest.firstName,
        lastName: guest.lastName,
        email: guest.email,
        isGuest: true,
        invitedByEmail: signedInEmail,
        invitedByEmailKey: hostEmailKey,
        invitedByName: hostDisplayName,
        bypassCutoffAsCoach: params.bypassCutoffAsCoach,
        isPaidEvent,
        amountCents,
        paymentMethod,
        paymentStatus,
        paymentReference: guestRef,
        cardBrand,
        cardLast4,
        prefetchedHostInvitedRegs,
        prefetchedHostPayments,
      });
      guestResults.push({
        ...res,
        firstName: guest.firstName,
        lastName: guest.lastName,
        email: guest.email,
      });
    } catch (err) {
      const detail =
        err instanceof Error
          ? err.message
          : `Impossible d’inscrire l’invité(e) ${guest.firstName} ${guest.lastName}.`;
      if (primaryResult || guestResults.length > 0) {
        const doneParts: string[] = [];
        if (primaryResult) doneParts.push('votre inscription');
        if (guestResults.length > 0) {
          doneParts.push(
            `${guestResults.length} invité${guestResults.length > 1 ? 's' : ''}`
          );
        }
        throw new PartialGuestBookingError(
          `Enregistrement partiel (${doneParts.join(' et ')} confirmé(e)s), mais erreur pour ${guest.firstName} ${guest.lastName} : ${detail}`,
          primaryResult,
          guestResults
        );
      }
      throw err;
    }
  }

  return {
    primary: primaryResult,
    guests: guestResults,
    totalAmountCents:
      (primaryResult ? primaryResult.amountCents : 0) +
      guestResults.reduce((sum, g) => sum + g.amountCents, 0),
  };
}

export async function registerForEvent(params: {
  event: SportEvent;
  firstName: string;
  lastName: string;
  email: string;
  bypassCutoffAsCoach?: boolean;
  payment?: RegisterPaymentInput;
}): Promise<RegisterEventResult> {
  const result = await registerEventWithGuests({
    ...params,
    guests: [],
    skipSelf: false,
  });
  if (!result.primary) {
    throw new Error('Impossible de finaliser votre inscription.');
  }
  return result.primary;
}

export async function cancelMyRegistration(
  registration: Registration
): Promise<void> {
  if (registration.status !== 'confirmed') {
    throw new Error('Cette inscription est déjà annulée.');
  }
  if (registration.attended) {
    throw new Error(
      'Une séance déjà validée ne peut plus être annulée.'
    );
  }
  if (registration.eventStartAt.toMillis() <= Date.now()) {
    throw new Error(
      'Cette séance a déjà commencé : il n’est plus possible d’annuler votre inscription.'
    );
  }

  const regRef = doc(db, 'registrations', registration.id);
  const eventRef = doc(db, 'events', registration.eventId);
  const payRef = doc(db, 'payments', registration.id);

  try {
    const [regSnap, eventSnap] = await Promise.all([
      getDocFromServer(regRef),
      getDocFromServer(eventRef),
    ]);

    if (!regSnap.exists()) {
      throw new Error('Inscription introuvable.');
    }

    const liveReg = regSnap.data() as Partial<Registration>;
    if (liveReg.status !== 'confirmed') {
      throw new Error('Cette inscription est déjà annulée.');
    }
    if (liveReg.attended) {
      throw new Error(
        'Une séance déjà validée ne peut plus être annulée.'
      );
    }

    const regStartMs =
      liveReg.eventStartAt?.toMillis?.() ?? registration.eventStartAt.toMillis();
    const eventData = eventSnap.exists()
      ? (eventSnap.data() as Partial<SportEvent>)
      : null;
    const eventStartMs = eventData?.startAt?.toMillis?.() ?? regStartMs;

    if (Math.min(regStartMs, eventStartMs) <= Date.now()) {
      throw new Error(
        'Cette séance a déjà commencé : il n’est plus possible d’annuler votre inscription.'
      );
    }

    const isPaid = liveReg.paymentStatus === 'paid';
    let shouldRefundPaymentDoc = false;
    if (isPaid) {
      const regEmail = (liveReg.email || registration.email).trim().toLowerCase();
      const signedInEmail = auth.currentUser?.email?.trim().toLowerCase() ?? '';
      const isHostedGuest =
        Boolean(liveReg.isGuest ?? registration.isGuest) &&
        Boolean(signedInEmail) &&
        (liveReg.invitedByEmail || registration.invitedByEmail || '')
          .trim()
          .toLowerCase() === signedInEmail;

      const payQuerySnap = await getDocsFromServer(
        isHostedGuest
          ? query(
              collection(db, 'payments'),
              where('payerEmail', '==', signedInEmail)
            )
          : query(collection(db, 'payments'), where('memberEmail', '==', regEmail))
      );
      const matchedPay = payQuerySnap.docs.find(
        (d) =>
          d.id === registration.id ||
          (d.data() as Partial<PaymentRecord>).registrationId === registration.id
      );
      if (matchedPay && matchedPay.data()?.status === 'paid') {
        shouldRefundPaymentDoc = true;
      }
    }

    const batch = writeBatch(db);
    batch.update(regRef, {
      status: 'cancelled',
      ...(isPaid ? { paymentStatus: 'refunded' } : {}),
      updatedAt: serverTimestamp(),
    });

    if (
      eventData &&
      eventData.status === 'published' &&
      typeof eventData.registeredCount === 'number' &&
      eventData.registeredCount > 0
    ) {
      batch.update(eventRef, {
        registeredCount: increment(-1),
        lastRegId: registration.id,
        updatedAt: serverTimestamp(),
      });
    }

    if (shouldRefundPaymentDoc) {
      batch.update(payRef, {
        status: 'refunded',
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();

    if (
      eventData &&
      eventData.status === 'published' &&
      eventData.registeredCount === 1 &&
      Date.now() >= eventStartMs - VALIDATION_LIMITS.BOOKING_CUTOFF_MS
    ) {
      await deleteAutoCancelledEventIfEligible(registration.eventId, false);
    }
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('introuvable') ||
        error.message.includes('déjà annulée') ||
        error.message.includes('déjà validée') ||
        error.message.includes('déjà commencé'))
    ) {
      throw error;
    }
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `registrations/${registration.id}`
    );
  }
}

export async function updateRegistrationPaymentStatus(
  registration: Registration,
  nextStatus: 'paid' | 'pending' | 'refunded'
): Promise<void> {
  try {
    const batch = writeBatch(db);
    const paidAtValue = nextStatus === 'paid' ? serverTimestamp() : null;
    batch.update(doc(db, 'registrations', registration.id), {
      paymentStatus: nextStatus,
      paidAt: paidAtValue,
      updatedAt: serverTimestamp(),
    });
    const payRef = doc(db, 'payments', registration.id);
    const paySnap = await getDoc(payRef);
    if (paySnap.exists()) {
      batch.update(payRef, {
        status: nextStatus,
        paidAt: paidAtValue,
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `registrations/${registration.id}`
    );
  }
}

export async function toggleRegistrationAttendance(
  registrationId: string,
  attended: boolean
): Promise<void> {
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'registrations', registrationId), {
      attended,
      updatedAt: serverTimestamp(),
    });
    const notifRef = doc(db, 'memberNotifications', registrationId);
    const notifSnap = await getDoc(notifRef);
    if (notifSnap.exists()) {
      batch.update(notifRef, {
        validated: attended,
        ...(attended ? { read: true } : {}),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `registrations/${registrationId}`
    );
  }
}

export async function removeRegistration(
  registration: Registration,
  eventRegisteredCount: number
): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'registrations', registration.id));
  const payRef = doc(db, 'payments', registration.id);
  const paySnap = await getDoc(payRef);
  if (paySnap.exists()) {
    if (registration.paymentStatus === 'paid') {
      batch.update(payRef, {
        status: 'refunded',
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.delete(payRef);
    }
  }
  if (eventRegisteredCount > 0) {
    batch.update(doc(db, 'events', registration.eventId), {
      registeredCount: increment(-1),
      updatedAt: serverTimestamp(),
    });
  }
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.DELETE,
      `registrations/${registration.id}`
    );
  }
}

function normalizeMemberBirthDateAndLevel(
  birthDate?: string,
  fitnessLevel?: FitnessLevel | ''
): { birthDate: string; fitnessLevel: FitnessLevel | '' } {
  const cleanBirthDate = (birthDate ?? '')
    .trim()
    .slice(0, VALIDATION_LIMITS.BIRTH_DATE_MAX);
  if (cleanBirthDate && !isValidBirthDateString(cleanBirthDate)) {
    throw new Error(
      'Veuillez saisir une date de naissance valide (antérieure ou égale à aujourd’hui).'
    );
  }
  const cleanLevel = (fitnessLevel ?? '') as FitnessLevel | '';
  if (
    cleanLevel !== '' &&
    cleanLevel !== 'beginner' &&
    cleanLevel !== 'intermediate' &&
    cleanLevel !== 'advanced'
  ) {
    throw new Error('Veuillez sélectionner un niveau sportif valide.');
  }
  return {
    birthDate: cleanBirthDate,
    fitnessLevel: cleanLevel,
  };
}

export async function upsertMemberProfile(params: {
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
  exists: boolean;
}): Promise<void> {
  const memberRef = doc(db, 'members', params.emailKey);
  const { birthDate, fitnessLevel } = normalizeMemberBirthDateAndLevel(
    params.birthDate,
    params.fitnessLevel
  );
  const cleanPayload = {
    firstName: params.firstName.trim().slice(0, VALIDATION_LIMITS.FIRST_NAME_MAX),
    lastName: params.lastName.trim().slice(0, VALIDATION_LIMITS.LAST_NAME_MAX),
    email: params.email.trim().toLowerCase().slice(0, VALIDATION_LIMITS.EMAIL_MAX),
    phone: params.phone.trim().slice(0, VALIDATION_LIMITS.PHONE_MAX),
    goal: params.goal.trim().slice(0, VALIDATION_LIMITS.GOAL_MAX),
    birthDate,
    fitnessLevel,
    notes: params.notes.trim().slice(0, VALIDATION_LIMITS.NOTES_MAX),
    followUpStatus: params.followUpStatus,
    photoUrl: (params.photoUrl ?? '').trim().slice(0, VALIDATION_LIMITS.PHOTO_URL_MAX),
  };

  try {
    if (params.exists) {
      await updateDoc(memberRef, {
        ...cleanPayload,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(memberRef, {
        emailKey: params.emailKey,
        ...cleanPayload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(
      error,
      params.exists ? OperationType.UPDATE : OperationType.CREATE,
      `members/${params.emailKey}`
    );
  }
}

const ensureProfileQueueByEmail = new Map<string, Promise<void>>();

export async function ensureMyMemberProfile(
  user: User,
  syncDisplayName = false
): Promise<void> {
  if (!user.email) return;
  const email = user.email.trim().toLowerCase().slice(0, VALIDATION_LIMITS.EMAIL_MAX);
  const previous = ensureProfileQueueByEmail.get(email) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      try {
        const existingSnap = await getDocs(
          query(collection(db, 'members'), where('email', '==', email))
        );
        const resolvedName = (
          user.displayName ||
          auth.currentUser?.displayName ||
          ''
        )
          .trim()
          .split(/\s+/)
          .filter(Boolean);
        if (!existingSnap.empty) {
          if (syncDisplayName && resolvedName.length > 0) {
            const existingDoc = existingSnap.docs[0];
            const existingData = existingDoc.data() as Partial<MemberProfile>;
            if (existingData.lastName === 'GetFitNow') {
              const firstName = resolvedName[0].slice(
                0,
                VALIDATION_LIMITS.FIRST_NAME_MAX
              );
              const lastName = (
                resolvedName.length > 1
                  ? resolvedName.slice(1).join(' ')
                  : existingData.lastName
              ).slice(0, VALIDATION_LIMITS.LAST_NAME_MAX);
              await updateDoc(doc(db, 'members', existingDoc.id), {
                firstName,
                lastName,
                updatedAt: serverTimestamp(),
              });
            }
          }
          return;
        }

        const emailKey = await hashEmailKey(email);
        const firstName = (
          resolvedName[0] ||
          email.split('@')[0] ||
          'Adhérent'
        ).slice(0, VALIDATION_LIMITS.FIRST_NAME_MAX);
        const lastName = (
          resolvedName.length > 1 ? resolvedName.slice(1).join(' ') : 'GetFitNow'
        ).slice(0, VALIDATION_LIMITS.LAST_NAME_MAX);

        await setDoc(doc(db, 'members', emailKey), {
          emailKey,
          email,
          firstName,
          lastName,
          phone: '',
          goal: '',
          birthDate: '',
          fitnessLevel: '',
          notes: '',
          followUpStatus: 'active',
          photoUrl: '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        console.warn('Initialisation profil adhérent différée:', error);
      }
    });
  ensureProfileQueueByEmail.set(email, next);
  return next;
}

export async function upsertMyMemberProfile(params: {
  user: User;
  firstName: string;
  lastName: string;
  phone: string;
  goal: string;
  birthDate?: string;
  fitnessLevel?: FitnessLevel | '';
  photoUrl: string;
  existingProfile: MemberProfile | null;
}): Promise<void> {
  if (!params.user.email) {
    throw new Error('Vous devez être connecté pour modifier votre profil.');
  }

  const email = params.user.email
    .trim()
    .toLowerCase()
    .slice(0, VALIDATION_LIMITS.EMAIL_MAX);
  const firstName = params.firstName
    .trim()
    .slice(0, VALIDATION_LIMITS.FIRST_NAME_MAX);
  const lastName = params.lastName
    .trim()
    .slice(0, VALIDATION_LIMITS.LAST_NAME_MAX);

  if (firstName.length < VALIDATION_LIMITS.FIRST_NAME_MIN) {
    throw new Error('Veuillez saisir votre prénom.');
  }
  if (lastName.length < VALIDATION_LIMITS.LAST_NAME_MIN) {
    throw new Error('Veuillez saisir votre nom.');
  }

  const { birthDate, fitnessLevel } = normalizeMemberBirthDateAndLevel(
    params.birthDate,
    params.fitnessLevel
  );

  const cleanUpdates = {
    firstName,
    lastName,
    phone: params.phone.trim().slice(0, VALIDATION_LIMITS.PHONE_MAX),
    goal: params.goal.trim().slice(0, VALIDATION_LIMITS.GOAL_MAX),
    birthDate,
    fitnessLevel,
    photoUrl: params.photoUrl.trim().slice(0, VALIDATION_LIMITS.PHOTO_URL_MAX),
    updatedAt: serverTimestamp(),
  };

  try {
    let targetId = params.existingProfile?.id ?? null;
    if (!targetId) {
      const snap = await getDocs(
        query(collection(db, 'members'), where('email', '==', email))
      );
      if (!snap.empty) {
        targetId = snap.docs[0].id;
      }
    }

    if (targetId) {
      await updateDoc(doc(db, 'members', targetId), cleanUpdates);
    } else {
      const emailKey = await hashEmailKey(email);
      await setDoc(doc(db, 'members', emailKey), {
        emailKey,
        email,
        ...cleanUpdates,
        notes: '',
        followUpStatus: 'active',
        createdAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `members/${email}`);
  }
}

export async function createManualMember(params: {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  goal: string;
  birthDate?: string;
  fitnessLevel?: FitnessLevel | '';
  notes: string;
  followUpStatus: FollowUpStatus;
  photoUrl?: string;
  existingEmailKeys: Set<string>;
}): Promise<string> {
  const firstName = params.firstName
    .trim()
    .slice(0, VALIDATION_LIMITS.FIRST_NAME_MAX);
  const lastName = params.lastName
    .trim()
    .slice(0, VALIDATION_LIMITS.LAST_NAME_MAX);
  const email = params.email
    .trim()
    .toLowerCase()
    .slice(0, VALIDATION_LIMITS.EMAIL_MAX);

  if (firstName.length < VALIDATION_LIMITS.FIRST_NAME_MIN) {
    throw new Error('Veuillez saisir le prénom de l’adhérent.');
  }
  if (lastName.length < VALIDATION_LIMITS.LAST_NAME_MIN) {
    throw new Error('Veuillez saisir le nom de l’adhérent.');
  }
  if (!VALIDATION_LIMITS.EMAIL_REGEX.test(email)) {
    throw new Error('Veuillez saisir une adresse email valide.');
  }

  const { birthDate, fitnessLevel } = normalizeMemberBirthDateAndLevel(
    params.birthDate,
    params.fitnessLevel
  );

  const emailKey = await hashEmailKey(email);
  if (params.existingEmailKeys.has(emailKey)) {
    throw new Error(
      'Un adhérent avec cette adresse email existe déjà dans le répertoire.'
    );
  }

  const memberRef = doc(db, 'members', emailKey);
  try {
    await setDoc(memberRef, {
      emailKey,
      email,
      firstName,
      lastName,
      phone: params.phone.trim().slice(0, VALIDATION_LIMITS.PHONE_MAX),
      goal: params.goal.trim().slice(0, VALIDATION_LIMITS.GOAL_MAX),
      birthDate,
      fitnessLevel,
      notes: params.notes.trim().slice(0, VALIDATION_LIMITS.NOTES_MAX),
      followUpStatus: params.followUpStatus,
      photoUrl: (params.photoUrl ?? '').trim().slice(0, VALIDATION_LIMITS.PHOTO_URL_MAX),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return emailKey;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `members/${emailKey}`);
  }
}

export async function deleteMemberCompletely(params: {
  emailKey: string;
  email?: string;
  registrations: Registration[];
  events: SportEvent[];
}): Promise<void> {
  try {
    const memberDocIds = new Set<string>([params.emailKey]);
    let cleanEmail = (params.email ?? '').trim().toLowerCase();

    const directMemberSnap = await getDocFromServer(
      doc(db, 'members', params.emailKey)
    );
    if (directMemberSnap.exists()) {
      const memberEmail = (
        (directMemberSnap.data() as Partial<MemberProfile>).email ?? ''
      )
        .trim()
        .toLowerCase();
      if (!cleanEmail && memberEmail) {
        cleanEmail = memberEmail;
      }
    }

    if (!cleanEmail) {
      const fromPassed = params.registrations.find(
        (r) => r.emailKey === params.emailKey && r.email
      );
      if (fromPassed) {
        cleanEmail = fromPassed.email.trim().toLowerCase();
      }
    }

    if (cleanEmail) {
      const membersByEmailSnap = await getDocsFromServer(
        query(collection(db, 'members'), where('email', '==', cleanEmail))
      );
      membersByEmailSnap.docs.forEach((d) => memberDocIds.add(d.id));
    }

    const regQueryPromises = [
      getDocsFromServer(
        query(
          collection(db, 'registrations'),
          where('emailKey', '==', params.emailKey)
        )
      ),
    ];
    if (cleanEmail) {
      regQueryPromises.push(
        getDocsFromServer(
          query(collection(db, 'registrations'), where('email', '==', cleanEmail))
        )
      );
    }

    const payQueryPromises = [
      getDocsFromServer(
        query(
          collection(db, 'payments'),
          where('memberEmailKey', '==', params.emailKey)
        )
      ),
    ];
    if (cleanEmail) {
      payQueryPromises.push(
        getDocsFromServer(
          query(collection(db, 'payments'), where('memberEmail', '==', cleanEmail))
        )
      );
    }

    const memberNotifQueryPromises = [
      getDocsFromServer(
        query(
          collection(db, 'memberNotifications'),
          where('memberEmailKey', '==', params.emailKey)
        )
      ),
    ];
    if (cleanEmail) {
      memberNotifQueryPromises.push(
        getDocsFromServer(
          query(
            collection(db, 'memberNotifications'),
            where('memberEmail', '==', cleanEmail)
          )
        )
      );
    }

    const coachNotifQueryPromise = cleanEmail
      ? getDocsFromServer(
          query(
            collection(db, 'coachNotifications'),
            where('memberEmail', '==', cleanEmail)
          )
        )
      : Promise.resolve(null);

    const [regSnaps, paySnaps, memberNotifSnaps, coachNotifSnap] =
      await Promise.all([
        Promise.all(regQueryPromises),
        Promise.all(payQueryPromises),
        Promise.all(memberNotifQueryPromises),
        coachNotifQueryPromise,
      ]);

    const regMap = new Map<string, Partial<Registration>>();
    params.registrations.forEach((r) => {
      if (
        r.emailKey === params.emailKey ||
        (cleanEmail && r.email.trim().toLowerCase() === cleanEmail)
      ) {
        regMap.set(r.id, r);
      }
    });
    regSnaps.forEach((snap) => {
      snap.docs.forEach((d) => {
        regMap.set(d.id, d.data() as Partial<Registration>);
      });
    });

    const paymentDocIds = new Set<string>();
    paySnaps.forEach((snap) => {
      snap.docs.forEach((d) => paymentDocIds.add(d.id));
    });

    // Also verify direct payment/{regId} docs in case any lacked memberEmailKey/memberEmail
    const missingPayChecks = Array.from(regMap.keys())
      .filter((regId) => !paymentDocIds.has(regId))
      .map(async (regId) => {
        const paySnap = await getDocFromServer(doc(db, 'payments', regId));
        if (paySnap.exists()) {
          paymentDocIds.add(paySnap.id);
        }
      });
    await Promise.all(missingPayChecks);

    const memberNotifDocIds = new Set<string>();
    memberNotifSnaps.forEach((snap) => {
      snap.docs.forEach((d) => memberNotifDocIds.add(d.id));
    });

    const coachNotifDocIds = new Set<string>();
    if (coachNotifSnap) {
      coachNotifSnap.docs.forEach((d) => coachNotifDocIds.add(d.id));
    }

    const confirmedCountByEvent = new Map<string, number>();
    regMap.forEach((regData) => {
      if (regData.status === 'confirmed' && regData.eventId) {
        confirmedCountByEvent.set(
          regData.eventId,
          (confirmedCountByEvent.get(regData.eventId) ?? 0) + 1
        );
      }
    });

    const eventDecrements = new Map<string, number>();
    await Promise.all(
      Array.from(confirmedCountByEvent.entries()).map(
        async ([eventId, decCount]) => {
          const evSnap = await getDocFromServer(doc(db, 'events', eventId));
          if (!evSnap.exists()) return;
          const liveCount = (evSnap.data() as Partial<SportEvent>).registeredCount;
          if (typeof liveCount === 'number' && liveCount > 0) {
            const actualDec = Math.min(decCount, liveCount);
            if (actualDec > 0) {
              eventDecrements.set(eventId, actualDec);
            }
          }
        }
      )
    );

    type BatchOp = (batch: ReturnType<typeof writeBatch>) => void;
    const ops: BatchOp[] = [];

    eventDecrements.forEach((actualDec, eventId) => {
      ops.push((batch) =>
        batch.update(doc(db, 'events', eventId), {
          registeredCount: increment(-actualDec),
          updatedAt: serverTimestamp(),
        })
      );
    });

    memberDocIds.forEach((id) => {
      ops.push((batch) => batch.delete(doc(db, 'members', id)));
    });
    regMap.forEach((_regData, id) => {
      ops.push((batch) => batch.delete(doc(db, 'registrations', id)));
    });
    paymentDocIds.forEach((id) => {
      ops.push((batch) => batch.delete(doc(db, 'payments', id)));
    });
    memberNotifDocIds.forEach((id) => {
      ops.push((batch) => batch.delete(doc(db, 'memberNotifications', id)));
    });
    coachNotifDocIds.forEach((id) => {
      ops.push((batch) => batch.delete(doc(db, 'coachNotifications', id)));
    });

    const convQueryPromises = [
      getDocsFromServer(
        query(
          collection(db, 'conversations'),
          where('memberEmailKey', '==', params.emailKey)
        )
      ),
    ];
    if (cleanEmail) {
      convQueryPromises.push(
        getDocsFromServer(
          query(
            collection(db, 'conversations'),
            where('memberEmail', '==', cleanEmail)
          )
        )
      );
    }
    const convSnaps = await Promise.all(convQueryPromises);
    const convIds = new Set<string>();
    convSnaps.forEach((snap) => {
      snap.docs.forEach((d) => convIds.add(d.id));
    });
    await Promise.all(
      Array.from(convIds).map(async (convId) => {
        const msgsSnap = await getDocsFromServer(
          collection(db, 'conversations', convId, 'messages')
        );
        msgsSnap.docs.forEach((mDoc) => {
          ops.push((batch) =>
            batch.delete(doc(db, 'conversations', convId, 'messages', mDoc.id))
          );
        });
        ops.push((batch) => batch.delete(doc(db, 'conversations', convId)));
      })
    );

    const scheduleQueryPromises = [
      getDocsFromServer(
        query(
          collection(db, 'memberSchedules'),
          where('memberEmailKey', '==', params.emailKey)
        )
      ),
    ];
    if (cleanEmail) {
      scheduleQueryPromises.push(
        getDocsFromServer(
          query(
            collection(db, 'memberSchedules'),
            where('memberEmail', '==', cleanEmail)
          )
        )
      );
    }
    const scheduleSnaps = await Promise.all(scheduleQueryPromises);
    const scheduleIds = new Set<string>();
    scheduleSnaps.forEach((snap) => {
      snap.docs.forEach((d) => scheduleIds.add(d.id));
    });
    scheduleIds.forEach((id) => {
      ops.push((batch) => batch.delete(doc(db, 'memberSchedules', id)));
    });

    const CHUNK_SIZE = 350;
    for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
      const batch = writeBatch(db);
      const slice = ops.slice(i, i + CHUNK_SIZE);
      slice.forEach((applyOp) => applyOp(batch));
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.DELETE,
      `members/${params.emailKey}`
    );
  }
}

export async function seedDemoEvents(
  coachUid: string,
  coachName: string
): Promise<void> {
  const now = Date.now();
  const hour = 60 * 60 * 1000;
  const day = 24 * hour;

  const makeDate = (offsetMs: number, setHour?: number, setMin = 0) => {
    const d = new Date(now + offsetMs);
    if (typeof setHour === 'number') {
      d.setHours(setHour, setMin, 0, 0);
    }
    return d;
  };

  const demos: EventFormInput[] = [
    {
      title: 'HIIT Express & Cardio (Départ imminent)',
      discipline: 'HIIT',
      description:
        'Séance intense de 45 minutes par intervalles courts. Tapis et kettlebells fournis sur place.',
      location: 'Place de la République',
      city: 'Paris',
      region: 'Île-de-France',
      hasCoords: false,
      lat: 0,
      lng: 0,
      coachName,
      startDate: makeDate(75 * 60 * 1000),
      durationMinutes: 45,
      isUnlimitedCapacity: false,
      maxCapacity: 12,
    },
    {
      title: 'Circuit Training Plein Air (Places illimitées)',
      discipline: 'Circuit Training',
      description:
        'Grand rassemblement sportif en extérieur, ouvert à tous sans limite de places.',
      location: 'Parc de la Tête d’Or',
      city: 'Lyon',
      region: 'Auvergne-Rhône-Alpes',
      hasCoords: false,
      lat: 0,
      lng: 0,
      coachName,
      startDate: makeDate(3.5 * hour),
      durationMinutes: 60,
      isUnlimitedCapacity: true,
      maxCapacity: 0,
    },
    {
      title: 'Renforcement Musculaire & Gainage',
      discipline: 'Renforcement',
      description:
        'Séance orientée posture, sangle abdominale et force fonctionnelle avec haltères et élastiques.',
      location: 'Place de la Bastille',
      city: 'Paris',
      region: 'Île-de-France',
      hasCoords: false,
      lat: 0,
      lng: 0,
      coachName,
      startDate: makeDate(day, 18, 30),
      durationMinutes: 60,
      isUnlimitedCapacity: false,
      maxCapacity: 10,
    },
    {
      title: 'Mobilité Articulaire & Récupération',
      discipline: 'Mobilité',
      description:
        'Décompression rachidienne, ouverture des hanches et travail respiratoire post-entraînement.',
      location: 'Jardin Public de Bordeaux',
      city: 'Bordeaux',
      region: 'Nouvelle-Aquitaine',
      hasCoords: false,
      lat: 0,
      lng: 0,
      coachName,
      startDate: makeDate(2 * day, 12, 15),
      durationMinutes: 45,
      isUnlimitedCapacity: false,
      maxCapacity: 15,
    },
    {
      title: 'Sortie Fractionné & Endurance',
      discipline: 'Course à pied',
      description:
        'Échauffement technique, gammes athlétiques et blocs d’allure spécifique en extérieur.',
      location: 'Parc des Buttes-Chaumont',
      city: 'Paris',
      region: 'Île-de-France',
      hasCoords: false,
      lat: 0,
      lng: 0,
      coachName,
      startDate: makeDate(4 * day, 9, 30),
      durationMinutes: 75,
      isUnlimitedCapacity: true,
      maxCapacity: 0,
    },
  ];

  const demoDisciplines: Array<{
    name: string;
    colorKey: DisciplineColorKey;
    iconKey: DisciplineIconKey;
  }> = [
    { name: 'Circuit Training', colorKey: 'violet', iconKey: 'zap' },
    { name: 'Course à pied', colorKey: 'sky', iconKey: 'running-shoe' },
    { name: 'HIIT', colorKey: 'rose', iconKey: 'flame' },
    { name: 'Mobilité', colorKey: 'teal', iconKey: 'yoga' },
    { name: 'Renforcement', colorKey: 'orange', iconKey: 'dumbbell' },
  ];

  for (const d of demoDisciplines) {
    const slug = slugifyDiscipline(d.name);
    const discRef = doc(db, 'disciplines', slug);
    const snap = await getDoc(discRef);
    if (!snap.exists()) {
      await setDoc(discRef, {
        name: d.name,
        slug,
        colorKey: d.colorKey,
        iconKey: d.iconKey,
        createdBy: coachUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  }

  for (const item of demos) {
    await createEvent(
      {
        ...item,
        coachNames: [coachName],
        coachUids: [coachUid],
      },
      coachUid
    );
  }
}

// ---------------------------------------------------------------------------
// Mentions J'aime (/eventLikes) & Avis / Commentaires (/eventReviews)
// ---------------------------------------------------------------------------

export function subscribeMyEventLikes(
  userId: string,
  onData: (likedEventIds: Set<string>) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, 'eventLikes'),
    where('userId', '==', userId)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const next = new Set<string>();
      snapshot.docs.forEach((d) => {
        const data = d.data() as Partial<EventLike>;
        if (typeof data.eventId === 'string' && data.eventId) {
          next.add(data.eventId);
        }
      });
      onData(next);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'eventLikes');
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export async function toggleEventLike(
  event: SportEvent,
  userId: string
): Promise<boolean> {
  if (!userId) {
    throw new Error('Connexion requise pour aimer un événement.');
  }
  if (event.status !== 'published') {
    throw new Error('Impossible d’aimer une séance annulée.');
  }

  const likeId = `${event.id}__${userId}`;
  const eventRef = doc(db, 'events', event.id);
  const likeRef = doc(db, 'eventLikes', likeId);

  try {
    const [eventSnap, likeQuerySnap] = await Promise.all([
      getDocFromServer(eventRef),
      getDocsFromServer(
        query(collection(db, 'eventLikes'), where('userId', '==', userId))
      ),
    ]);

    if (!eventSnap.exists()) {
      throw new Error('Cet événement n’existe plus.');
    }

    const liveEvent = parseLiveSportEventSnapshot(
      eventSnap.id,
      eventSnap.data() as Partial<SportEvent>
    );

    if (liveEvent.status !== 'published') {
      throw new Error('Impossible d’aimer une séance annulée.');
    }

    const existingLikeDoc =
      likeQuerySnap.docs.find(
        (d) =>
          d.id === likeId ||
          (d.data() as Partial<EventLike>).eventId === event.id
      ) ?? null;

    const currentLikes = Math.max(0, liveEvent.likesCount ?? 0);
    const batch = writeBatch(db);

    if (existingLikeDoc) {
      const targetLikeRef = doc(db, 'eventLikes', existingLikeDoc.id);
      if (currentLikes < 1) {
        batch.delete(targetLikeRef);
        await batch.commit();
        return false;
      }
      batch.delete(targetLikeRef);
      batch.update(eventRef, {
        likesCount: currentLikes - 1,
        lastLikeId: existingLikeDoc.id,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      return false;
    }

    batch.set(likeRef, {
      eventId: event.id,
      userId,
      createdAt: serverTimestamp(),
    });
    batch.update(eventRef, {
      likesCount: currentLikes + 1,
      lastLikeId: likeId,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `eventLikes/${likeId}`);
  }
}

export function subscribePublishedEventReviews(
  onData: (reviews: EventReview[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, 'eventReviews'),
    where('status', '==', 'published')
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const list: EventReview[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<EventReview, 'id'>),
      }));
      list.sort((a, b) => {
        const aMs = a.updatedAt?.toMillis?.() ?? a.createdAt?.toMillis?.() ?? 0;
        const bMs = b.updatedAt?.toMillis?.() ?? b.createdAt?.toMillis?.() ?? 0;
        return bMs - aMs;
      });
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'eventReviews');
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export async function upsertEventReview(params: {
  registration: Registration;
  matchedEvent?: SportEvent | null;
  authorUid: string;
  rating: number;
  comment: string;
  fallbackDisplayName?: string | null;
}): Promise<void> {
  const { registration, matchedEvent, authorUid } = params;
  if (!authorUid) {
    throw new Error('Connexion requise pour publier un avis.');
  }
  if (registration.status !== 'confirmed') {
    throw new Error('Seule une inscription confirmée permet de laisser un avis.');
  }
  if (matchedEvent && matchedEvent.status === 'cancelled') {
    throw new Error('Impossible de laisser un avis sur une séance annulée.');
  }
  const endMs = getRegistrationEndMs(registration, matchedEvent);
  if (Date.now() < endMs) {
    throw new Error(
      'Les avis et commentaires ne peuvent être laissés qu’à partir de l’heure de fin de la séance.'
    );
  }
  if (!registration.attended) {
    throw new Error(
      'Veuillez d’abord valider votre séance à l’issue de l’événement avant de laisser un avis.'
    );
  }

  const rating = Math.round(Number(params.rating));
  if (
    !Number.isInteger(rating) ||
    rating < VALIDATION_LIMITS.REVIEW_RATING_MIN ||
    rating > VALIDATION_LIMITS.REVIEW_RATING_MAX
  ) {
    throw new Error('Veuillez attribuer une note comprise entre 1 et 5 étoiles.');
  }

  const comment = params.comment
    .trim()
    .slice(0, VALIDATION_LIMITS.REVIEW_COMMENT_MAX);
  if (comment.length < VALIDATION_LIMITS.REVIEW_COMMENT_MIN) {
    throw new Error(
      `Votre commentaire doit contenir au moins ${VALIDATION_LIMITS.REVIEW_COMMENT_MIN} caractères.`
    );
  }

  const authorName = formatPublicAuthorName(
    registration.firstName,
    registration.lastName,
    params.fallbackDisplayName
  );
  const reviewId = registration.id;
  const reviewRef = doc(db, 'eventReviews', reviewId);

  try {
    const existingSnap = await getDoc(reviewRef);
    if (existingSnap.exists()) {
      await updateDoc(reviewRef, {
        rating,
        comment,
        authorName,
        updatedAt: serverTimestamp(),
      });
      return;
    }

    const rawTitle = (
      matchedEvent?.title ||
      registration.eventTitle ||
      'Séance sportive'
    )
      .trim()
      .slice(0, VALIDATION_LIMITS.TITLE_MAX);
    const eventTitle =
      rawTitle.length >= VALIDATION_LIMITS.TITLE_MIN
        ? rawTitle
        : 'Séance sportive';

    const rawDiscipline = (matchedEvent?.discipline || 'Coaching')
      .trim()
      .slice(0, VALIDATION_LIMITS.DISCIPLINE_MAX);
    const discipline =
      rawDiscipline.length >= VALIDATION_LIMITS.DISCIPLINE_MIN
        ? rawDiscipline
        : 'Coaching';

    await setDoc(reviewRef, {
      eventId: registration.eventId,
      registrationId: registration.id,
      emailKey: registration.emailKey,
      authorUid,
      authorName,
      eventTitle,
      discipline,
      eventStartAt: registration.eventStartAt,
      rating,
      comment,
      status: 'published',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.WRITE,
      `eventReviews/${reviewId}`
    );
  }
}

export async function deleteEventReview(reviewId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'eventReviews', reviewId));
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.DELETE,
      `eventReviews/${reviewId}`
    );
  }
}

// ---------------------------------------------------------------------------
// Annuaire Coachs (/coachDirectory) & Messagerie directe (/conversations)
// ---------------------------------------------------------------------------

export function subscribeCoachDirectory(
  onData: (coaches: CoachDirectoryEntry[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, 'coachDirectory'),
    where('active', '==', true)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const list: CoachDirectoryEntry[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<CoachDirectoryEntry, 'id'>),
      }));
      list.sort((a, b) => a.displayName.localeCompare(b.displayName, 'fr'));
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'coachDirectory');
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export async function syncCoachDirectoryFromAdmins(params: {
  admins: CoachAdminUser[];
  existingDirectory: CoachDirectoryEntry[];
  isCoachAdmin: boolean;
  currentUid?: string | null;
}): Promise<void> {
  const existingByUid = new Map(
    params.existingDirectory.map((entry) => [entry.uid, entry])
  );

  const candidates = params.admins.filter((admin) => {
    if (!params.isCoachAdmin && admin.uid !== params.currentUid) {
      return false;
    }
    const existing = existingByUid.get(admin.uid);
    if (!admin.active && !existing) {
      return false;
    }
    if (!existing) return true;
    return (
      existing.displayName !== admin.displayName ||
      (existing.specialty ?? '') !== (admin.specialty ?? '') ||
      (existing.city ?? '') !== (admin.city ?? '') ||
      (existing.region ?? '') !== (admin.region ?? '') ||
      (existing.bio ?? '') !== (admin.bio ?? '') ||
      (existing.photoUrl ?? '') !== (admin.photoUrl ?? '') ||
      existing.active !== admin.active
    );
  });

  if (candidates.length === 0) return;

  try {
    const batch = writeBatch(db);
    candidates.forEach((admin) => {
      batch.set(doc(db, 'coachDirectory', admin.uid), {
        uid: admin.uid,
        displayName: admin.displayName.slice(
          0,
          VALIDATION_LIMITS.DISPLAY_NAME_MAX
        ),
        specialty: (admin.specialty ?? '').slice(
          0,
          VALIDATION_LIMITS.SPECIALTY_MAX
        ),
        city: (admin.city ?? '').slice(0, VALIDATION_LIMITS.CITY_MAX),
        region: (admin.region ?? '').slice(0, VALIDATION_LIMITS.REGION_MAX),
        bio: (admin.bio ?? '').slice(0, VALIDATION_LIMITS.BIO_MAX),
        photoUrl: (admin.photoUrl ?? '').slice(
          0,
          VALIDATION_LIMITS.PHOTO_URL_MAX
        ),
        active: Boolean(admin.active),
        updatedAt: serverTimestamp(),
      });
    });
    await batch.commit();
  } catch (error) {
    console.warn('Synchronisation annuaire coach impossible:', error);
  }
}

export function subscribeCoachConversations(
  coachUid: string,
  onData: (conversations: Conversation[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, 'conversations'),
    where('coachUid', '==', coachUid)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const list: Conversation[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Conversation, 'id'>),
      }));
      list.sort((a, b) => {
        const aMs = a.lastMessageAt?.toMillis?.() ?? a.updatedAt?.toMillis?.() ?? 0;
        const bMs = b.lastMessageAt?.toMillis?.() ?? b.updatedAt?.toMillis?.() ?? 0;
        return bMs - aMs;
      });
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'conversations');
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export function subscribeMemberConversations(
  memberEmail: string,
  onData: (conversations: Conversation[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const cleanEmail = memberEmail.trim().toLowerCase();
  const q = query(
    collection(db, 'conversations'),
    where('memberEmail', '==', cleanEmail)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const list: Conversation[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Conversation, 'id'>),
      }));
      list.sort((a, b) => {
        const aMs = a.lastMessageAt?.toMillis?.() ?? a.updatedAt?.toMillis?.() ?? 0;
        const bMs = b.lastMessageAt?.toMillis?.() ?? b.updatedAt?.toMillis?.() ?? 0;
        return bMs - aMs;
      });
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'conversations');
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export function subscribeConversationMessages(params: {
  conversationId: string;
  isCoach: boolean;
  coachUid: string;
  memberEmail: string;
  onData: (messages: DirectMessage[]) => void;
  onError?: (err: Error) => void;
}): Unsubscribe {
  const msgsCollection = collection(
    db,
    'conversations',
    params.conversationId,
    'messages'
  );
  const q = params.isCoach
    ? query(msgsCollection, where('coachUid', '==', params.coachUid))
    : query(
        msgsCollection,
        where('memberEmail', '==', params.memberEmail.trim().toLowerCase())
      );

  return onSnapshot(
    q,
    (snapshot) => {
      const list: DirectMessage[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<DirectMessage, 'id'>),
      }));
      list.sort((a, b) => {
        const aMs = a.createdAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER;
        const bMs = b.createdAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER;
        return aMs - bMs;
      });
      params.onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(
          error,
          OperationType.LIST,
          `conversations/${params.conversationId}/messages`
        );
      } catch (wrapped) {
        if (params.onError && wrapped instanceof Error) {
          params.onError(wrapped);
        }
      }
    }
  );
}

export async function sendDirectMessage(params: {
  coachUid: string;
  coachName: string;
  coachPhotoUrl?: string;
  memberEmail: string;
  memberName: string;
  memberPhotoUrl?: string;
  senderUid: string;
  senderEmail: string;
  senderName: string;
  senderRole: ConversationSenderRole;
  text: string;
  contextEventId?: string;
  contextEventTitle?: string;
}): Promise<string> {
  const cleanMemberEmail = params.memberEmail
    .trim()
    .toLowerCase()
    .slice(0, VALIDATION_LIMITS.EMAIL_MAX);
  const cleanSenderEmail = params.senderEmail
    .trim()
    .toLowerCase()
    .slice(0, VALIDATION_LIMITS.EMAIL_MAX);

  if (!VALIDATION_LIMITS.EMAIL_REGEX.test(cleanMemberEmail)) {
    throw new Error('Adresse email du destinataire invalide.');
  }

  const trimmedText = params.text
    .trim()
    .slice(0, VALIDATION_LIMITS.MESSAGE_TEXT_MAX);
  if (trimmedText.length < VALIDATION_LIMITS.MESSAGE_TEXT_MIN) {
    throw new Error('Veuillez saisir un message avant d’envoyer.');
  }

  const memberEmailKey = await hashEmailKey(cleanMemberEmail);
  const conversationId = `${params.coachUid}__${memberEmailKey}`;
  const previewText =
    trimmedText.length > VALIDATION_LIMITS.MESSAGE_PREVIEW_MAX
      ? `${trimmedText.slice(0, VALIDATION_LIMITS.MESSAGE_PREVIEW_MAX - 1)}…`
      : trimmedText;

  const coachName = (params.coachName.trim() || 'Coach GetFitNow').slice(
    0,
    VALIDATION_LIMITS.DISPLAY_NAME_MAX
  );
  const memberName = (
    params.memberName.trim() ||
    cleanMemberEmail.split('@')[0] ||
    'Adhérent'
  ).slice(0, 125);
  const senderName = (
    params.senderName.trim() ||
    (params.senderRole === 'coach' ? coachName : memberName)
  ).slice(0, 125);
  const coachPhotoUrl = (params.coachPhotoUrl ?? '').slice(
    0,
    VALIDATION_LIMITS.PHOTO_URL_MAX
  );
  const memberPhotoUrl = (params.memberPhotoUrl ?? '').slice(
    0,
    VALIDATION_LIMITS.PHOTO_URL_MAX
  );

  try {
    const existingSnap = await getDocsFromServer(
      params.senderRole === 'coach'
        ? query(
            collection(db, 'conversations'),
            where('coachUid', '==', params.coachUid)
          )
        : query(
            collection(db, 'conversations'),
            where('memberEmail', '==', cleanMemberEmail)
          )
    );
    const existingConv =
      existingSnap.docs.find((d) => d.id === conversationId) ?? null;

    const batch = writeBatch(db);
    const convRef = doc(db, 'conversations', conversationId);
    const msgRef = doc(collection(db, 'conversations', conversationId, 'messages'));

    if (existingConv) {
      if (params.senderRole === 'coach') {
        batch.update(convRef, {
          coachName,
          coachPhotoUrl,
          lastMessageText: previewText,
          lastMessageSenderRole: 'coach',
          lastMessageSenderUid: params.senderUid,
          lastMessageAt: serverTimestamp(),
          coachUnreadCount: 0,
          memberUnreadCount: increment(1),
          updatedAt: serverTimestamp(),
        });
      } else {
        batch.update(convRef, {
          memberUid: params.senderUid,
          memberName,
          memberPhotoUrl,
          lastMessageText: previewText,
          lastMessageSenderRole: 'member',
          lastMessageSenderUid: params.senderUid,
          lastMessageAt: serverTimestamp(),
          memberUnreadCount: 0,
          coachUnreadCount: increment(1),
          updatedAt: serverTimestamp(),
        });
      }
    } else {
      batch.set(convRef, {
        coachUid: params.coachUid,
        coachName,
        coachPhotoUrl,
        memberEmail: cleanMemberEmail,
        memberEmailKey,
        memberName,
        memberPhotoUrl,
        memberUid: params.senderRole === 'member' ? params.senderUid : '',
        lastMessageText: previewText,
        lastMessageSenderRole: params.senderRole,
        lastMessageSenderUid: params.senderUid,
        lastMessageAt: serverTimestamp(),
        coachUnreadCount: params.senderRole === 'member' ? 1 : 0,
        memberUnreadCount: params.senderRole === 'coach' ? 1 : 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    const cleanContextTitle = (params.contextEventTitle ?? '')
      .trim()
      .slice(0, VALIDATION_LIMITS.TITLE_MAX);
    const includeEventContext =
      Boolean(params.contextEventId?.trim()) && cleanContextTitle.length >= 2;

    batch.set(msgRef, {
      conversationId,
      coachUid: params.coachUid,
      memberEmail: cleanMemberEmail,
      senderUid: params.senderUid,
      senderEmail: cleanSenderEmail,
      senderName,
      senderRole: params.senderRole,
      text: trimmedText,
      ...(includeEventContext
        ? {
            contextEventId: params.contextEventId!.trim(),
            contextEventTitle: cleanContextTitle,
          }
        : {}),
      createdAt: serverTimestamp(),
    });

    await batch.commit();
    return conversationId;
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.WRITE,
      `conversations/${conversationId}`
    );
  }
}

export async function markConversationAsRead(params: {
  conversationId: string;
  isCoach: boolean;
  currentUid: string;
}): Promise<void> {
  if (!params.conversationId || !params.currentUid) return;
  try {
    const convRef = doc(db, 'conversations', params.conversationId);
    if (params.isCoach) {
      await updateDoc(convRef, {
        coachUnreadCount: 0,
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(convRef, {
        memberUnreadCount: 0,
        memberUid: params.currentUid,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    console.warn('Impossible de marquer la conversation comme lue:', error);
  }
}

export async function toggleDirectMessageLike(params: {
  conversationId: string;
  message: DirectMessage;
  isCoach: boolean;
}): Promise<boolean> {
  const currentUid = auth.currentUser?.uid ?? '';
  const actingAsCoach = params.isCoach && params.message.coachUid === currentUid;
  const nextLiked = actingAsCoach
    ? !Boolean(params.message.likedByCoach)
    : !Boolean(params.message.likedByMember);
  const msgRef = doc(
    db,
    'conversations',
    params.conversationId,
    'messages',
    params.message.id
  );
  try {
    await updateDoc(
      msgRef,
      actingAsCoach
        ? { likedByCoach: nextLiked, updatedAt: serverTimestamp() }
        : { likedByMember: nextLiked, updatedAt: serverTimestamp() }
    );
    return nextLiked;
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `conversations/${params.conversationId}/messages/${params.message.id}`
    );
  }
}

export async function deleteConversationThread(params: {
  conversation: Conversation;
  currentUid: string;
  currentEmail: string;
}): Promise<void> {
  const convId = params.conversation.id;
  const isThreadCoach = params.conversation.coachUid === params.currentUid;
  const cleanEmail = (params.currentEmail || params.conversation.memberEmail || '')
    .trim()
    .toLowerCase();

  try {
    const msgsCollection = collection(db, 'conversations', convId, 'messages');
    const msgsQuery = isThreadCoach
      ? query(msgsCollection, where('coachUid', '==', params.conversation.coachUid))
      : query(msgsCollection, where('memberEmail', '==', cleanEmail));

    const msgsSnap = await getDocsFromServer(msgsQuery);
    const CHUNK_SIZE = 400;
    const msgDocs = msgsSnap.docs;

    for (let i = 0; i < msgDocs.length; i += CHUNK_SIZE) {
      const batch = writeBatch(db);
      const slice = msgDocs.slice(i, i + CHUNK_SIZE);
      slice.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }

    await deleteDoc(doc(db, 'conversations', convId));
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.DELETE,
      `conversations/${convId}`
    );
  }
}

// ---------------------------------------------------------------------------
// Planning hebdomadaire personnalisé par adhérent (/memberSchedules)
// ---------------------------------------------------------------------------

export function subscribeAllMemberSchedules(
  onData: (sessions: MemberScheduleSession[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'memberSchedules'),
    (snapshot) => {
      const list: MemberScheduleSession[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<MemberScheduleSession, 'id'>),
      }));
      list.sort((a, b) => a.startAt.toMillis() - b.startAt.toMillis());
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'memberSchedules');
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export function subscribeMyMemberSchedule(
  memberEmail: string,
  onData: (sessions: MemberScheduleSession[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const cleanEmail = memberEmail.trim().toLowerCase();
  const q = query(
    collection(db, 'memberSchedules'),
    where('memberEmail', '==', cleanEmail)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const list: MemberScheduleSession[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<MemberScheduleSession, 'id'>),
      }));
      list.sort((a, b) => a.startAt.toMillis() - b.startAt.toMillis());
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'memberSchedules');
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export async function createMemberScheduleSession(params: {
  memberEmail: string;
  memberName: string;
  title: string;
  discipline: string;
  notes: string;
  location: string;
  startDate: Date;
  durationMinutes: number;
  coachUid?: string;
  coachName?: string;
  createdByUid: string;
  createdByRole: 'coach' | 'member';
}): Promise<string> {
  const cleanEmail = params.memberEmail
    .trim()
    .toLowerCase()
    .slice(0, VALIDATION_LIMITS.EMAIL_MAX);
  if (!VALIDATION_LIMITS.EMAIL_REGEX.test(cleanEmail)) {
    throw new Error('Adresse email adhérent invalide.');
  }

  const title = params.title.trim().slice(0, VALIDATION_LIMITS.TITLE_MAX);
  if (title.length < VALIDATION_LIMITS.TITLE_MIN) {
    throw new Error(
      `Le titre de la séance doit contenir au moins ${VALIDATION_LIMITS.TITLE_MIN} caractères.`
    );
  }

  const discipline = params.discipline
    .trim()
    .slice(0, VALIDATION_LIMITS.DISCIPLINE_MAX);
  if (discipline.length < VALIDATION_LIMITS.DISCIPLINE_MIN) {
    throw new Error('Veuillez indiquer une discipline valide.');
  }

  if (Number.isNaN(params.startDate.getTime())) {
    throw new Error('Date et heure de séance invalides.');
  }

  const durationMinutes = Math.min(
    VALIDATION_LIMITS.DURATION_MAX,
    Math.max(
      VALIDATION_LIMITS.DURATION_MIN,
      Math.round(Number(params.durationMinutes) || 45)
    )
  );
  const memberEmailKey = await hashEmailKey(cleanEmail);
  const memberName = (
    params.memberName.trim() ||
    cleanEmail.split('@')[0] ||
    'Adhérent'
  ).slice(0, 125);
  const notes = params.notes
    .trim()
    .slice(0, VALIDATION_LIMITS.SCHEDULE_NOTES_MAX);
  const location = params.location
    .trim()
    .slice(0, VALIDATION_LIMITS.LOCATION_MAX);
  const coachUid = (params.coachUid ?? '').trim().slice(0, 128);
  const coachName = (params.coachName ?? '')
    .trim()
    .slice(0, VALIDATION_LIMITS.DISPLAY_NAME_MAX);

  const sessionRef = doc(collection(db, 'memberSchedules'));
  try {
    await setDoc(sessionRef, {
      memberEmail: cleanEmail,
      memberEmailKey,
      memberName,
      title,
      discipline,
      notes,
      location,
      startAt: Timestamp.fromDate(params.startDate),
      durationMinutes,
      coachUid,
      coachName,
      createdByUid: params.createdByUid,
      createdByRole: params.createdByRole,
      completed: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return sessionRef.id;
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.CREATE,
      `memberSchedules/${sessionRef.id}`
    );
  }
}

export async function updateMemberScheduleSession(
  sessionId: string,
  params: {
    title: string;
    discipline: string;
    notes: string;
    location: string;
    startDate: Date;
    durationMinutes: number;
    coachUid?: string;
    coachName?: string;
    completed?: boolean;
  }
): Promise<void> {
  const title = params.title.trim().slice(0, VALIDATION_LIMITS.TITLE_MAX);
  if (title.length < VALIDATION_LIMITS.TITLE_MIN) {
    throw new Error(
      `Le titre de la séance doit contenir au moins ${VALIDATION_LIMITS.TITLE_MIN} caractères.`
    );
  }

  const discipline = params.discipline
    .trim()
    .slice(0, VALIDATION_LIMITS.DISCIPLINE_MAX);
  if (discipline.length < VALIDATION_LIMITS.DISCIPLINE_MIN) {
    throw new Error('Veuillez indiquer une discipline valide.');
  }

  if (Number.isNaN(params.startDate.getTime())) {
    throw new Error('Date et heure de séance invalides.');
  }

  const durationMinutes = Math.min(
    VALIDATION_LIMITS.DURATION_MAX,
    Math.max(
      VALIDATION_LIMITS.DURATION_MIN,
      Math.round(Number(params.durationMinutes) || 45)
    )
  );
  const notes = params.notes
    .trim()
    .slice(0, VALIDATION_LIMITS.SCHEDULE_NOTES_MAX);
  const location = params.location
    .trim()
    .slice(0, VALIDATION_LIMITS.LOCATION_MAX);
  const coachUid = (params.coachUid ?? '').trim().slice(0, 128);
  const coachName = (params.coachName ?? '')
    .trim()
    .slice(0, VALIDATION_LIMITS.DISPLAY_NAME_MAX);

  try {
    await updateDoc(doc(db, 'memberSchedules', sessionId), {
      title,
      discipline,
      notes,
      location,
      startAt: Timestamp.fromDate(params.startDate),
      durationMinutes,
      coachUid,
      coachName,
      completed: Boolean(params.completed),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `memberSchedules/${sessionId}`
    );
  }
}

export async function toggleMemberScheduleCompleted(
  sessionId: string,
  completed: boolean
): Promise<void> {
  try {
    await updateDoc(doc(db, 'memberSchedules', sessionId), {
      completed,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `memberSchedules/${sessionId}`
    );
  }
}

export async function deleteMemberScheduleSession(
  sessionId: string
): Promise<void> {
  try {
    await deleteDoc(doc(db, 'memberSchedules', sessionId));
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.DELETE,
      `memberSchedules/${sessionId}`
    );
  }
}
