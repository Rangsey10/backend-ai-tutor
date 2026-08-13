import type { Request, Response } from 'express';
import {
  addCurrentUserSubject,
  createCurrentUserProfile,
  getCurrentUserPreferences,
  getCurrentUserProfile,
  getCurrentUserSubjects,
  removeCurrentUserSubject,
  updateCurrentUserPreferences,
  updateCurrentUserProfile,
} from '../services/profile.service';
import { asyncHandler } from '../utils/asyncHandler';
import { sendCreated, sendNoContent, sendSuccess } from '../utils/ApiResponse';

export const getProfile = asyncHandler(async (req: Request, res: Response) => {
  const profile = await getCurrentUserProfile(req.user!.uid);
  sendSuccess(res, profile, 'Profile retrieved successfully');
});

export const createProfile = asyncHandler(async (req: Request, res: Response) => {
  const profile = await createCurrentUserProfile(req.user!.uid, req.body);
  sendCreated(res, profile, 'Profile created successfully');
});

export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  const profile = await updateCurrentUserProfile(req.user!.uid, req.body);
  sendSuccess(res, profile, 'Profile updated successfully');
});

export const getPreferences = asyncHandler(async (req: Request, res: Response) => {
  const preferences = await getCurrentUserPreferences(req.user!.uid);
  sendSuccess(res, preferences, 'Learning preferences retrieved successfully');
});

export const updatePreferences = asyncHandler(async (req: Request, res: Response) => {
  const preferences = await updateCurrentUserPreferences(req.user!.uid, req.body);
  sendSuccess(res, preferences, 'Learning preferences saved successfully');
});

export const getProfileSubjects = asyncHandler(async (req: Request, res: Response) => {
  const subjects = await getCurrentUserSubjects(req.user!.uid);
  sendSuccess(res, subjects, 'Selected subjects retrieved successfully');
});

export const addProfileSubject = asyncHandler(async (req: Request, res: Response) => {
  const subject = await addCurrentUserSubject(req.user!.uid, req.body);
  sendCreated(res, subject, 'Subject added successfully');
});

export const deleteProfileSubject = asyncHandler(async (req: Request, res: Response) => {
  await removeCurrentUserSubject(req.user!.uid, req.params.subjectId);
  sendNoContent(res);
});
