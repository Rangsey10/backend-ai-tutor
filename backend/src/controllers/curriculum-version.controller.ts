import type { Request, Response } from 'express';
import { Timestamp } from 'firebase-admin/firestore';
import { getFirestore } from '../config/firebase';
import { normalizeUserRole } from '../types/user-role';
import { asyncHandler } from '../utils/asyncHandler';
import { sendCreated, sendSuccess } from '../utils/ApiResponse';
import { AppError } from '../utils/AppError';
import { publishCurriculumVersionToAi, unpublishCurriculumVersionFromAi } from '../services/curriculum-publisher.service';

type VersionStatus = 'draft' | 'in_review' | 'published' | 'archived';
type VersionDocument = {
  curriculum_version_id: string; grade_level_id: string; subject_id: string; label: string;
  status: VersionStatus; change_summary: string; created_by: string; reviewed_by?: string | null;
  published_by?: string | null; created_at: FirebaseFirestore.Timestamp; updated_at: FirebaseFirestore.Timestamp;
  reviewed_at?: FirebaseFirestore.Timestamp | null; published_at?: FirebaseFirestore.Timestamp | null;
  rejection_reason?: string | null; revision: number;
};

function assertAdmin(req: Request) {
  if (!req.user?.userId || normalizeUserRole(req.user.role ?? 'student') !== 'admin') throw new AppError('Admin access is required', 403);
}
function actor(req: Request): string { assertAdmin(req); return req.user!.userId!; }
function read(value: unknown, label: string) { if (typeof value !== 'string' || !value.trim()) throw new AppError(`${label} is required`, 400); return value.trim(); }
function iso(value?: FirebaseFirestore.Timestamp | null) { return value ? value.toDate().toISOString() : null; }
function dto(doc: VersionDocument) { return { ...doc, created_at: iso(doc.created_at), updated_at: iso(doc.updated_at), reviewed_at: iso(doc.reviewed_at), published_at: iso(doc.published_at) }; }
function versionId(gradeId: string, subjectId: string, label: string) { return `${gradeId}-${subjectId}-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${Date.now()}`; }
async function audit(actor: string, action: string, versionIdValue: string, details: Record<string, unknown>) {
  const now = Timestamp.now();
  await getFirestore().collection('admin_audit_logs').doc(`${versionIdValue}-${action}-${now.toMillis()}`).set({
    audit_id: `${versionIdValue}-${action}-${now.toMillis()}`, actor_id: actor, action, resource_type: 'curriculum_version', resource_id: versionIdValue, details, created_at: now,
  });
}
async function requireGradeAndSubject(gradeLevelId: string, subjectId: string) {
  const db = getFirestore();
  const [grade, subject] = await Promise.all([db.collection('grade_levels').doc(gradeLevelId).get(), db.collection('subjects').doc(subjectId).get()]);
  if (!grade.exists) throw new AppError('Grade level not found', 404);
  if (!subject.exists) throw new AppError('Subject not found', 404);
  if (subject.data()?.grade_level_id !== gradeLevelId) throw new AppError('Subject does not belong to the selected grade level', 400);
}
async function getVersion(id: string) {
  const snapshot = await getFirestore().collection('curriculum_versions').doc(id).get();
  if (!snapshot.exists) throw new AppError('Curriculum version not found', 404);
  return { ref: snapshot.ref, version: snapshot.data() as VersionDocument };
}
async function requirePublishableContent(version: VersionDocument) {
  const contents = await getFirestore().collection('admin_curriculum_content').where('curriculum_version_id', '==', version.curriculum_version_id).get();
  if (contents.empty) throw new AppError('A curriculum version must contain at least one lesson', 400);
  const seen = new Set<string>();
  for (const doc of contents.docs) {
    const content = doc.data() as Record<string, unknown>;
    if (content.grade_level_id !== version.grade_level_id || content.subject_id !== version.subject_id) throw new AppError('Content grade or subject does not match the curriculum version', 400);
    if (!['formula', 'concept', 'example', 'exercise'].includes(String(content.kind))) throw new AppError('Curriculum content has an invalid content type', 400);
    if (content.status !== 'draft') throw new AppError('Only draft content can be published through a version', 400);
    if (!String(content.topic_id ?? '').trim() || !String(content.lesson ?? '').trim()) throw new AppError('Curriculum content has an empty lesson', 400);
    const topic = await getFirestore().collection('topics').doc(String(content.topic_id)).get();
    if (!topic.exists || topic.data()?.subject_id !== version.subject_id || topic.data()?.grade_level_id !== version.grade_level_id) throw new AppError('Content topic does not belong to the curriculum version', 400);
    const instructionalEnglish = String(content.body ?? content.description ?? content.expression ?? '').trim();
    const khmerTerms = Array.isArray(content.khmer_terms) ? content.khmer_terms : [];
    const hasKhmer = khmerTerms.some((term) => term && typeof term === 'object' && String((term as Record<string, unknown>).khmer ?? '').trim());
    if (!instructionalEnglish || !hasKhmer) throw new AppError('Each lesson needs required English and Khmer instructional fields', 400);
    const key = `${content.topic_id}:${content.kind}:${content.title ?? content.expression ?? doc.id}`.toLowerCase();
    if (seen.has(key)) throw new AppError('Duplicate content IDs or codes found in curriculum version', 400);
    seen.add(key);
  }
  return contents;
}

export const listCurriculumVersions = asyncHandler(async (req, res) => {
  assertAdmin(req); const snapshot = await getFirestore().collection('curriculum_versions').get();
  const versions = snapshot.docs.map((doc) => dto(doc.data() as VersionDocument)).sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
  sendSuccess(res, { versions }, 'Curriculum versions loaded');
});
export const createCurriculumVersion = asyncHandler(async (req: Request, res: Response) => {
  const adminId = actor(req); const gradeLevelId = read(req.body.grade_level_id, 'Grade level id'); const subjectId = read(req.body.subject_id, 'Subject id');
  await requireGradeAndSubject(gradeLevelId, subjectId); const label = read(req.body.label, 'Version label'); const now = Timestamp.now(); const id = versionId(gradeLevelId, subjectId, label);
  const version: VersionDocument = { curriculum_version_id: id, grade_level_id: gradeLevelId, subject_id: subjectId, label, status: 'draft', change_summary: read(req.body.change_summary, 'Change summary'), created_by: adminId, reviewed_by: null, published_by: null, created_at: now, updated_at: now, reviewed_at: null, published_at: null, rejection_reason: null, revision: 1 };
  await getFirestore().collection('curriculum_versions').doc(id).set(version); await audit(adminId, 'curriculum_version.created', id, { status: 'draft' }); sendCreated(res, dto(version), 'Draft curriculum version created');
});
async function transition(req: Request, res: Response, target: 'in_review' | 'published' | 'archived', action: string, allowed: VersionStatus[], reasonRequired = false) {
  const adminId = actor(req); const id = read(req.params.curriculumVersionId, 'Curriculum version id'); const requestId = read(req.body.idempotency_key, 'Idempotency key'); const reason = req.body.reason === undefined ? null : read(req.body.reason, 'Reason');
  if (reasonRequired && !reason) throw new AppError('Reason is required', 400); const { ref, version } = await getVersion(id);
  const idemRef = getFirestore().collection('curriculum_version_idempotency').doc(`${id}-${action}-${requestId}`); const existing = await idemRef.get(); if (existing.exists) { sendSuccess(res, dto(version), 'Idempotent curriculum lifecycle request'); return; }
  if (version.status === target) { await idemRef.set({ curriculum_version_id: id, action, request_id: requestId, created_at: Timestamp.now() }); sendSuccess(res, dto(version), 'Curriculum version already in requested state'); return; }
  if (!allowed.includes(version.status)) throw new AppError(`Cannot ${action} a curriculum version in ${version.status} state`, 409);
  if (target === 'published') await requirePublishableContent(version);
  const now = Timestamp.now(); const next: VersionDocument = { ...version, status: target, updated_at: now, revision: version.revision + 1 };
  if (target === 'in_review') { next.reviewed_by = adminId; next.reviewed_at = now; next.rejection_reason = null; }
  if (target === 'published') { next.published_by = adminId; next.published_at = now; }
  if (target === 'archived') next.rejection_reason = reason;
  if (target === 'published') {
    const publication = await publishCurriculumVersionToAi(next);
    await ref.set({ ...next, ai_curriculum_chunk_ids: publication.chunkIds, ai_payload_hash: publication.payloadHash }, { merge: true });
  } else if (target === 'archived' && version.status === 'published') {
    await unpublishCurriculumVersionFromAi(id);
    await ref.set(next, { merge: true });
  } else {
    await ref.set(next, { merge: true });
  }
  await idemRef.set({ curriculum_version_id: id, action, request_id: requestId, created_at: now }); await audit(adminId, `curriculum_version.${action}`, id, { from: version.status, to: target, reason }); sendSuccess(res, dto(next), `Curriculum version ${action}`);
}
export const submitCurriculumVersionForReview = asyncHandler((req, res) => transition(req, res, 'in_review', 'submitted_for_review', ['draft']));
export const publishCurriculumVersion = asyncHandler((req, res) => transition(req, res, 'published', 'published', ['in_review']));
export const archiveCurriculumVersion = asyncHandler((req, res) => transition(req, res, 'archived', 'archived', ['draft', 'in_review', 'published']));
export const rejectCurriculumVersion = asyncHandler(async (req, res) => {
  const adminId = actor(req); const id = read(req.params.curriculumVersionId, 'Curriculum version id'); const reason = read(req.body.reason, 'Reason'); const requestId = read(req.body.idempotency_key, 'Idempotency key'); const { ref, version } = await getVersion(id);
  const idemRef = getFirestore().collection('curriculum_version_idempotency').doc(`${id}-rejected-${requestId}`);
  if ((await idemRef.get()).exists) { sendSuccess(res, dto(version), 'Idempotent curriculum lifecycle request'); return; }
  if (version.status !== 'in_review') throw new AppError('Only a version in review can be rejected', 409); const now = Timestamp.now(); const next = { ...version, status: 'draft' as const, reviewed_by: adminId, reviewed_at: now, rejection_reason: reason, updated_at: now, revision: version.revision + 1 };
  await ref.set(next, { merge: true }); await idemRef.set({ curriculum_version_id: id, action: 'rejected', request_id: requestId, created_at: now }); await audit(adminId, 'curriculum_version.rejected', id, { reason }); sendSuccess(res, dto(next), 'Curriculum version rejected to draft');
});
export const compareCurriculumVersion = asyncHandler(async (req, res) => {
  assertAdmin(req); const { version } = await getVersion(read(req.params.curriculumVersionId, 'Curriculum version id')); const db = getFirestore(); const [draft, published] = await Promise.all([db.collection('admin_curriculum_content').where('curriculum_version_id', '==', version.curriculum_version_id).get(), db.collection('curriculum_versions').where('grade_level_id', '==', version.grade_level_id).get()]);
  const publishedVersion = published.docs.map((doc) => doc.data() as VersionDocument).find((item) => item.subject_id === version.subject_id && item.status === 'published'); const publishedContent = publishedVersion ? await db.collection('admin_curriculum_content').where('curriculum_version_id', '==', publishedVersion.curriculum_version_id).get() : null; const ids = (snapshot: FirebaseFirestore.QuerySnapshot | null) => new Set(snapshot?.docs.map((doc) => doc.id) ?? []);
  const draftIds = ids(draft); const publishedIds = ids(publishedContent); sendSuccess(res, { curriculum_version_id: version.curriculum_version_id, published_version_id: publishedVersion?.curriculum_version_id ?? null, added_content_ids: [...draftIds].filter((id) => !publishedIds.has(id)), removed_content_ids: [...publishedIds].filter((id) => !draftIds.has(id)), unchanged_content_ids: [...draftIds].filter((id) => publishedIds.has(id)) }, 'Curriculum versions compared');
});
