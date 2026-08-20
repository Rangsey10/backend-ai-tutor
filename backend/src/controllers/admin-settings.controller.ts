import type { Request, Response } from 'express';
import { Timestamp } from 'firebase-admin/firestore';
import { getFirestore } from '../config/firebase';
import { userConverter } from '../config/firestore-converters';
import { normalizeUserRole } from '../types/user-role';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/ApiResponse';
import { AppError } from '../utils/AppError';

type AdminSettingsDocument = {
  user_id: string;
  organization: string;
  role_label: string;
  language: string;
  timezone: string;
  settings: {
    ai_review: Record<string, boolean>;
    student_access: Record<string, boolean>;
  };
  security: {
    two_factor_authentication: string;
    last_password_update: string;
    audit_logs: string;
  };
  updated_at: FirebaseFirestore.Timestamp;
};

const defaultSettings = {
  organization: 'Rean AI Learning',
  role_label: 'Admin',
  language: 'English',
  timezone: 'Asia/Phnom_Penh',
  settings: {
    ai_review: {
      auto_flag_low_confidence_answers: true,
      require_reviewer_approval_for_red_sessions: true,
      send_daily_quality_summary: false,
    },
    student_access: {
      allow_students_to_view_progress_reports: true,
      enable_quiet_hours_for_study_mode: false,
      lock_inactive_student_accounts: true,
    },
  },
  security: {
    two_factor_authentication: 'Enabled',
    last_password_update: 'Not available',
    audit_logs: '90 days retained',
  },
};

function assertAdmin(req: Request): void {
  if (!req.user?.userId || normalizeUserRole(req.user.role ?? 'student') !== 'admin') {
    throw new AppError('Admin access is required', 403);
  }
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function readNullableString(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value === 'string') return value.trim() || null;
  return undefined;
}

function readBooleanRecord(value: unknown, fallback: Record<string, boolean>): Record<string, boolean> {
  if (!value || typeof value !== 'object') return fallback;
  return Object.entries(value as Record<string, unknown>).reduce<Record<string, boolean>>((next, [key, item]) => {
    next[key] = typeof item === 'boolean' ? item : Boolean(fallback[key]);
    return next;
  }, {});
}

function buildSettingsPayload(user: FirebaseFirestore.DocumentData, settings: Partial<AdminSettingsDocument> | null) {
  const merged = {
    ...defaultSettings,
    ...settings,
    settings: {
      ai_review: {
        ...defaultSettings.settings.ai_review,
        ...(settings?.settings?.ai_review ?? {}),
      },
      student_access: {
        ...defaultSettings.settings.student_access,
        ...(settings?.settings?.student_access ?? {}),
      },
    },
    security: {
      ...defaultSettings.security,
      ...(settings?.security ?? {}),
    },
  };

  return {
    profile: {
      full_name: user.full_name,
      email: user.email,
      role: user.role,
      role_label: merged.role_label,
      organization: merged.organization,
      profile_image_url: user.profile_image_url,
      preferred_language: user.preferred_language,
    },
    workspace: {
      language: merged.language,
      timezone: merged.timezone,
    },
    settings: merged.settings,
    security: merged.security,
  };
}

export const getAdminSettings = asyncHandler(async (req: Request, res: Response) => {
  assertAdmin(req);

  const db = getFirestore();
  const userDoc = await db.collection('users').withConverter(userConverter).doc(req.user!.userId!).get();
  if (!userDoc.exists || normalizeUserRole(userDoc.data()!.role) !== 'admin') {
    throw new AppError('Admin account not found', 404);
  }

  const settingsDoc = await db.collection('admin_settings').doc(req.user!.userId!).get();
  sendSuccess(res, buildSettingsPayload(userDoc.data()!, settingsDoc.exists ? settingsDoc.data() as AdminSettingsDocument : null), 'Admin settings loaded');
});

export const updateAdminSettings = asyncHandler(async (req: Request, res: Response) => {
  assertAdmin(req);

  const db = getFirestore();
  const userRef = db.collection('users').withConverter(userConverter).doc(req.user!.userId!);
  const userDoc = await userRef.get();
  if (!userDoc.exists || normalizeUserRole(userDoc.data()!.role) !== 'admin') {
    throw new AppError('Admin account not found', 404);
  }

  const profile = req.body?.profile && typeof req.body.profile === 'object' ? req.body.profile : {};
  const workspace = req.body?.workspace && typeof req.body.workspace === 'object' ? req.body.workspace : {};
  const settings = req.body?.settings && typeof req.body.settings === 'object' ? req.body.settings : {};
  const currentSettingsDoc = await db.collection('admin_settings').doc(req.user!.userId!).get();
  const currentSettings = currentSettingsDoc.exists ? currentSettingsDoc.data() as Partial<AdminSettingsDocument> : null;
  const currentUser = userDoc.data()!;

  const image = readNullableString(profile.profile_image_url);
  await userRef.update({
    full_name: readString(profile.full_name, currentUser.full_name),
    email: readString(profile.email, currentUser.email),
    profile_image_url: image === undefined ? currentUser.profile_image_url : image,
    preferred_language: readNullableString(profile.preferred_language) ?? currentUser.preferred_language,
  });

  const nextSettings: AdminSettingsDocument = {
    user_id: req.user!.userId!,
    organization: readString(profile.organization, currentSettings?.organization ?? defaultSettings.organization),
    role_label: readString(profile.role_label, currentSettings?.role_label ?? defaultSettings.role_label),
    language: readString(workspace.language, currentSettings?.language ?? defaultSettings.language),
    timezone: readString(workspace.timezone, currentSettings?.timezone ?? defaultSettings.timezone),
    settings: {
      ai_review: readBooleanRecord(
        settings.ai_review,
        currentSettings?.settings?.ai_review ?? defaultSettings.settings.ai_review
      ),
      student_access: readBooleanRecord(
        settings.student_access,
        currentSettings?.settings?.student_access ?? defaultSettings.settings.student_access
      ),
    },
    security: {
      ...defaultSettings.security,
      ...(currentSettings?.security ?? {}),
    },
    updated_at: Timestamp.now(),
  };

  await db.collection('admin_settings').doc(req.user!.userId!).set(nextSettings, { merge: true });
  const updatedUserDoc = await userRef.get();
  sendSuccess(res, buildSettingsPayload(updatedUserDoc.data()!, nextSettings), 'Admin settings updated');
});
