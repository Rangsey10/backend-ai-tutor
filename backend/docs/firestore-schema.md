# Firestore Schema Reference

This backend stores Firestore documents with plain string foreign keys and Firestore `Timestamp` fields for dates.

## MVP Collections Summary

1. `users`
1. `student_profiles`
1. `grade_levels`
1. `subjects`
1. `topics`
1. `student_subjects`
1. `tutor_sessions`
1. `tutor_sessions/{sessionId}/turns`
1. `tutor_sessions/{sessionId}/attempts`
1. `tutor_sessions/{sessionId}/verifications`
1. `quizzes`
1. `quizzes/{quizId}/questions`
1. `quizzes/{quizId}/questions/{questionId}/options`
1. `quiz_attempts`
1. `quiz_attempts/{attemptId}/answers`
1. `student_topic_progress`
1. `reported_ai_responses`
1. `ai_request_logs`

## Collections

- `users`: auth and profile records, including `firebase_uid`, `role`, and account metadata.
- `student_profiles`: student-specific learning preferences and progress, linked by `user_id`.
- `grade_levels`: canonical grade metadata used for placement and filtering.
- `subjects`: subject catalog entries with display metadata.
- `topics`: topics scoped by `unit_id`, `subject_id`, and `grade_level_id`, with compact subject and grade snapshots when needed.
- `student_subjects`: subject selections and mastery progress per student.
- `tutor_sessions`: top-level session records for a tutor-driven lesson flow.
- `tutor_sessions/{sessionId}/turns`: ordered conversation turns between the student and AI tutor.
- `tutor_sessions/{sessionId}/attempts`: student answers submitted during a session.
- `tutor_sessions/{sessionId}/verifications`: mathematical verification records tied to a turn.
- `quizzes`: top-level quiz definitions generated from topics, sessions, or manual authoring.
- `quizzes/{quizId}/questions`: ordered quiz questions.
- `quizzes/{quizId}/questions/{questionId}/options`: answer choices for multiple-choice questions.
- `quiz_attempts`: per-student quiz attempt summaries.
- `quiz_attempts/{attemptId}/answers`: question-level quiz answers inside an attempt.
- `student_topic_progress`: denormalized student mastery and progress by topic.
- `reported_ai_responses`: student-submitted AI response reports for moderation.
- `ai_request_logs`: operational logs for AI provider requests and responses.

## Notes

- Relationships are stored as plain string IDs for portability.
- Date fields use Firestore `Timestamp`, not JavaScript `Date`.
- User roles are defined in one editable place at `src/types/user-role.ts`.
- The current role list includes `student`, `administrator`, and `teacher`; confirm the final MVP role set with the project lead before locking behavior.
- Group B keeps unconfirmed ERD fields explicitly marked with `TODO: confirm remaining fields with ERD` in the model files.
- Group C keeps unconfirmed ERD fields explicitly marked with `TODO: confirm remaining fields with ERD` in the model files.
- Group D keeps unconfirmed ERD fields explicitly marked with `TODO: confirm remaining fields with ERD` in the model files.
- Quiz math questions should route through mathematical verification in the service layer before they are marked correct.
