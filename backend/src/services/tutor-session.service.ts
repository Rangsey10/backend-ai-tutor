import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { getFirestore } from '../config/firebase';
import {
  studentProfileConverter,
  tutorSessionConverter,
  tutorSessionSnapshotConverter,
  tutorTurnConverter,
} from '../config/firestore-converters';
import type { TutorSession } from '../models/tutor-sessions.model';
import type { TutorSessionSnapshot } from '../models/tutor-session-snapshots.model';
import type { TutorTurn } from '../models/tutor-turns.model';
import { AppError } from '../utils/AppError';

type CreateTutorSessionPayload = {
  subject_id: string;
  topic_id: string;
  lesson_id?: string | null;
  original_question: string;
  initial_prompt?: string | null;
  visual_context?: Record<string, unknown> | null;
  detected_language: string;
  detected_intent: string;
  detected_problem_type: string;
};

type AppendTurnPayload = {
  sender_type: 'student' | 'ai_tutor';
  message_text: string;
  stage: string;
  teaching_strategy: string;
  interaction_type: string;
  expected_answer?: string | null;
  visual_state?: Record<string, unknown> | null;
  expected_last_turn_number?: number;
  snapshot?: {
    snapshot_type: 'canvas_state' | 'visual_cards' | 'diagram' | 'checkpoint';
    payload: Record<string, unknown>;
  };
};

export type TutorSessionDetailResponse = {
  session: TutorSession;
  turns: TutorTurn[];
  snapshots: TutorSessionSnapshot[];
};

function db(): Firestore {
  return getFirestore();
}

async function requireProfileId(firebaseUid: string): Promise<string> {
  const snapshot = await db()
    .collection('student_profiles')
    .withConverter(studentProfileConverter)
    .where('user_id', '==', firebaseUid)
    .limit(1)
    .get();

  if (snapshot.empty) {
    throw new AppError('Student profile not found for the authenticated user', 404);
  }

  return snapshot.docs[0].data().student_profile_id;
}

async function requireOwnedSession(firebaseUid: string, sessionId: string): Promise<TutorSession> {
  const profileId = await requireProfileId(firebaseUid);
  const sessionDocument = await db()
    .collection('tutor_sessions')
    .withConverter(tutorSessionConverter)
    .doc(sessionId)
    .get();

  if (!sessionDocument.exists) {
    throw new AppError('Tutor session not found', 404);
  }

  const session = sessionDocument.data()!;

  if (session.student_profile_id !== profileId) {
    throw new AppError('You do not have access to this tutor session', 403);
  }

  return session;
}

export async function createTutorSession(
  firebaseUid: string,
  payload: CreateTutorSessionPayload
): Promise<TutorSession> {
  const profileId = await requireProfileId(firebaseUid);
  const now = Timestamp.now();
  const sessionRef = db().collection('tutor_sessions').withConverter(tutorSessionConverter).doc();
  const session: TutorSession = {
    tutor_session_id: sessionRef.id,
    student_profile_id: profileId,
    subject_id: payload.subject_id,
    topic_id: payload.topic_id,
    lesson_id: payload.lesson_id ?? null,
    original_question: payload.original_question,
    initial_prompt: payload.initial_prompt ?? null,
    visual_context: payload.visual_context ?? null,
    resume_checkpoint: null,
    last_turn_number: 0,
    detected_language: payload.detected_language,
    detected_intent: payload.detected_intent,
    detected_problem_type: payload.detected_problem_type,
    session_status: 'active',
    verification_status: 'pending',
    archived_at: null,
    created_at: now,
    updated_at: now,
  };

  await sessionRef.set(session);
  return session;
}

export async function appendTutorSessionTurn(
  firebaseUid: string,
  sessionId: string,
  payload: AppendTurnPayload
): Promise<{ session: TutorSession; turn: TutorTurn; snapshot?: TutorSessionSnapshot }> {
  const profileId = await requireProfileId(firebaseUid);
  const sessionRef = db().collection('tutor_sessions').withConverter(tutorSessionConverter).doc(sessionId);
  const turnRef = db().collection('tutor_turns').withConverter(tutorTurnConverter).doc();
  const snapshotRef = db()
    .collection('tutor_session_snapshots')
    .withConverter(tutorSessionSnapshotConverter)
    .doc();

  let updatedSession: TutorSession | null = null;
  let createdTurn: TutorTurn | null = null;
  let createdSnapshot: TutorSessionSnapshot | undefined;

  await db().runTransaction(async (transaction) => {
    const sessionDoc = await transaction.get(sessionRef);

    if (!sessionDoc.exists) {
      throw new AppError('Tutor session not found', 404);
    }

    const session = sessionDoc.data()!;

    if (session.student_profile_id !== profileId) {
      throw new AppError('You do not have access to this tutor session', 403);
    }

    if (session.session_status !== 'active') {
      throw new AppError('Cannot append turns to a non-active tutor session', 409);
    }

    if (
      payload.expected_last_turn_number !== undefined &&
      payload.expected_last_turn_number !== session.last_turn_number
    ) {
      throw new AppError('Session version conflict, please refresh and retry', 409);
    }

    const now = Timestamp.now();
    const nextTurnNumber = session.last_turn_number + 1;
    const turn: TutorTurn = {
      tutor_turn_id: turnRef.id,
      tutor_session_id: sessionId,
      turn_number: nextTurnNumber,
      sender_type: payload.sender_type,
      message_text: payload.message_text,
      visual_state: payload.visual_state ?? null,
      stage: payload.stage,
      teaching_strategy: payload.teaching_strategy,
      interaction_type: payload.interaction_type,
      expected_answer: payload.expected_answer ?? null,
      created_at: now,
    };

    const nextSession: TutorSession = {
      ...session,
      last_turn_number: nextTurnNumber,
      resume_checkpoint: {
        last_turn_id: turn.tutor_turn_id,
        last_turn_number: nextTurnNumber,
      },
      updated_at: now,
    };

    transaction.set(turnRef, turn);
    transaction.update(sessionRef, {
      last_turn_number: nextSession.last_turn_number,
      resume_checkpoint: nextSession.resume_checkpoint,
      updated_at: nextSession.updated_at,
    });

    if (payload.snapshot) {
      createdSnapshot = {
        tutor_session_snapshot_id: snapshotRef.id,
        tutor_session_id: sessionId,
        tutor_turn_id: turn.tutor_turn_id,
        snapshot_type: payload.snapshot.snapshot_type,
        payload: payload.snapshot.payload,
        created_at: now,
      };
      transaction.set(snapshotRef, createdSnapshot);
    }

    updatedSession = nextSession;
    createdTurn = turn;
  });

  return {
    session: updatedSession!,
    turn: createdTurn!,
    ...(createdSnapshot && { snapshot: createdSnapshot }),
  };
}

export async function getTutorSessionDetail(
  firebaseUid: string,
  sessionId: string
): Promise<TutorSessionDetailResponse> {
  const session = await requireOwnedSession(firebaseUid, sessionId);

  const [turnsSnapshot, snapshotsSnapshot] = await Promise.all([
    db()
      .collection('tutor_turns')
      .withConverter(tutorTurnConverter)
      .where('tutor_session_id', '==', sessionId)
      .orderBy('turn_number', 'asc')
      .get(),
    db()
      .collection('tutor_session_snapshots')
      .withConverter(tutorSessionSnapshotConverter)
      .where('tutor_session_id', '==', sessionId)
      .orderBy('created_at', 'asc')
      .get(),
  ]);

  return {
    session,
    turns: turnsSnapshot.docs.map((doc) => doc.data()),
    snapshots: snapshotsSnapshot.docs.map((doc) => doc.data()),
  };
}

export async function archiveTutorSession(firebaseUid: string, sessionId: string): Promise<void> {
  const session = await requireOwnedSession(firebaseUid, sessionId);

  if (session.session_status === 'archived') {
    return;
  }

  await db()
    .collection('tutor_sessions')
    .withConverter(tutorSessionConverter)
    .doc(sessionId)
    .update({
      session_status: 'archived',
      archived_at: Timestamp.now(),
      updated_at: Timestamp.now(),
    });
}
