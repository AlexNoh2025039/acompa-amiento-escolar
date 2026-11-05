CREATE SCHEMA IF NOT EXISTS public;

CREATE TYPE Role AS ENUM (
    'parent',
    'student'
);

CREATE TYPE DayOfWeek AS ENUM (
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday'
);

CREATE TYPE TaskType AS ENUM (
    'homework',
    'exam',
    'reading'
);

CREATE TYPE TaskStatus AS ENUM (
    'pending',
    'in_progress',
    'completed'
);

CREATE TYPE TutorMessageRole AS ENUM (
    'student',
    'assistant'
);

CREATE TYPE AiUsagePurpose AS ENUM (
    'tutor',
    'summary',
    'practice',
    'podcast',
    'video'
);

CREATE TYPE LearningArtifactType AS ENUM (
    'summary',
    'practice',
    'podcast',
    'video'
);

CREATE TABLE families (
    id TEXT NOT NULL,
    name TEXT,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(3) NOT NULL,
    CONSTRAINT families_pkey PRIMARY KEY (id)
);

CREATE TABLE users (
    id TEXT NOT NULL,
    family_id TEXT NOT NULL,
    role Role NOT NULL,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(3) NOT NULL,
    CONSTRAINT users_pkey PRIMARY KEY (id)
);

CREATE TABLE refresh_tokens (
    id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMP(3) NOT NULL,
    revoked_at TIMESTAMP(3),
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id)
);

CREATE TABLE children (
    id TEXT NOT NULL,
    family_id TEXT NOT NULL,
    user_id TEXT,
    full_name TEXT NOT NULL,
    birth_date DATE NOT NULL,
    grade TEXT NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(3) NOT NULL,
    CONSTRAINT children_pkey PRIMARY KEY (id)
);

CREATE TABLE subjects (
    id TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT subjects_pkey PRIMARY KEY (id)
);

CREATE TABLE child_subjects (
    id TEXT NOT NULL,
    child_id TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT child_subjects_pkey PRIMARY KEY (id)
);

CREATE TABLE schedule_blocks (
    id TEXT NOT NULL,
    child_id TEXT NOT NULL,
    subject_id TEXT,
    day_of_week DayOfWeek NOT NULL,
    start_time VARCHAR(5) NOT NULL,
    end_time VARCHAR(5) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(3) NOT NULL,
    CONSTRAINT schedule_blocks_pkey PRIMARY KEY (id)
);

CREATE TABLE tasks (
    id TEXT NOT NULL,
    child_id TEXT NOT NULL,
    created_by_user_id TEXT NOT NULL,
    subject_id TEXT,
    title TEXT NOT NULL,
    description TEXT,
    type TaskType NOT NULL,
    due_at TIMESTAMP(3),
    status TaskStatus NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(3) NOT NULL,
    CONSTRAINT tasks_pkey PRIMARY KEY (id)
);

CREATE TABLE task_attachments (
    id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    storage_key TEXT NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT task_attachments_pkey PRIMARY KEY (id)
);

CREATE TABLE evaluations (
    id TEXT NOT NULL,
    child_id TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    title TEXT NOT NULL,
    score DECIMAL(6,2) NOT NULL,
    max_score DECIMAL(6,2) NOT NULL,
    evaluated_at TIMESTAMP(3) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(3) NOT NULL,
    CONSTRAINT evaluations_pkey PRIMARY KEY (id)
);

CREATE TABLE notification_preferences (
    id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    email_summary BOOLEAN NOT NULL DEFAULT false,
    reminder_time VARCHAR(5),
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(3) NOT NULL,
    CONSTRAINT notification_preferences_pkey PRIMARY KEY (id)
);

CREATE TABLE practice_attempts (
    id TEXT NOT NULL,
    child_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    score INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL,
    questions JSONB NOT NULL,
    completed_at TIMESTAMP(3),
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT practice_attempts_pkey PRIMARY KEY (id)
);

CREATE TABLE tutor_conversations (
    id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    child_id TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT 'Nueva conversación',
    expires_at TIMESTAMP(3) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(3) NOT NULL,
    CONSTRAINT tutor_conversations_pkey PRIMARY KEY (id)
);

CREATE TABLE tutor_messages (
    id TEXT NOT NULL,
    conversation_id TEXT NOT NULL,
    role TutorMessageRole NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT tutor_messages_pkey PRIMARY KEY (id)
);

CREATE TABLE password_reset_tokens (
    id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMP(3) NOT NULL,
    used_at TIMESTAMP(3),
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id)
);

CREATE TABLE ai_usage (
    id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    purpose AiUsagePurpose NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ai_usage_pkey PRIMARY KEY (id)
);

CREATE TABLE learning_artifacts (
    id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    child_id TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    task_id TEXT,
    type LearningArtifactType NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    storage_key TEXT,
    mime_type TEXT,
    duration_seconds INTEGER,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT learning_artifacts_pkey PRIMARY KEY (id)
);

CREATE TABLE storage_deletions (
    id TEXT NOT NULL,
    storage_key TEXT NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT storage_deletions_pkey PRIMARY KEY (id)
);

CREATE UNIQUE INDEX users_email_key ON users(email);
CREATE INDEX users_family_id_idx ON users(family_id);

CREATE UNIQUE INDEX refresh_tokens_token_hash_key ON refresh_tokens(token_hash);
CREATE INDEX refresh_tokens_user_id_idx ON refresh_tokens(user_id);

CREATE UNIQUE INDEX children_user_id_key ON children(user_id);
CREATE INDEX children_family_id_idx ON children(family_id);

CREATE UNIQUE INDEX subjects_name_key ON subjects(name);

CREATE UNIQUE INDEX child_subjects_child_id_subject_id_key ON child_subjects(child_id, subject_id);
CREATE INDEX child_subjects_child_id_idx ON child_subjects(child_id);
CREATE INDEX child_subjects_subject_id_idx ON child_subjects(subject_id);

CREATE INDEX schedule_blocks_child_id_idx ON schedule_blocks(child_id);
CREATE INDEX schedule_blocks_subject_id_idx ON schedule_blocks(subject_id);

CREATE INDEX tasks_child_id_idx ON tasks(child_id);
CREATE INDEX tasks_created_by_user_id_idx ON tasks(created_by_user_id);
CREATE INDEX tasks_subject_id_idx ON tasks(subject_id);
CREATE INDEX tasks_due_at_idx ON tasks(due_at);

CREATE INDEX task_attachments_task_id_idx ON task_attachments(task_id);

CREATE INDEX evaluations_child_id_idx ON evaluations(child_id);
CREATE INDEX evaluations_subject_id_idx ON evaluations(subject_id);

CREATE UNIQUE INDEX notification_preferences_user_id_key ON notification_preferences(user_id);

CREATE INDEX practice_attempts_child_id_created_at_idx ON practice_attempts(child_id, created_at);
CREATE INDEX practice_attempts_user_id_created_at_idx ON practice_attempts(user_id, created_at);
CREATE INDEX practice_attempts_subject_id_idx ON practice_attempts(subject_id);

CREATE INDEX tutor_conversations_user_id_updated_at_idx ON tutor_conversations(user_id, updated_at);
CREATE INDEX tutor_conversations_child_id_idx ON tutor_conversations(child_id);
CREATE INDEX tutor_conversations_subject_id_idx ON tutor_conversations(subject_id);
CREATE INDEX tutor_conversations_expires_at_idx ON tutor_conversations(expires_at);

CREATE INDEX tutor_messages_conversation_id_created_at_idx ON tutor_messages(conversation_id, created_at);

CREATE UNIQUE INDEX password_reset_tokens_token_hash_key ON password_reset_tokens(token_hash);
CREATE INDEX password_reset_tokens_user_id_created_at_idx ON password_reset_tokens(user_id, created_at);
CREATE INDEX password_reset_tokens_expires_at_idx ON password_reset_tokens(expires_at);

CREATE INDEX ai_usage_user_id_created_at_idx ON ai_usage(user_id, created_at);

CREATE INDEX learning_artifacts_user_id_created_at_idx ON learning_artifacts(user_id, created_at);
CREATE INDEX learning_artifacts_child_id_created_at_idx ON learning_artifacts(child_id, created_at);
CREATE INDEX learning_artifacts_subject_id_idx ON learning_artifacts(subject_id);
CREATE INDEX learning_artifacts_task_id_idx ON learning_artifacts(task_id);

CREATE UNIQUE INDEX storage_deletions_storage_key_key ON storage_deletions(storage_key);
CREATE INDEX storage_deletions_created_at_idx ON storage_deletions(created_at);

ALTER TABLE users ADD CONSTRAINT users_family_id_fkey FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE refresh_tokens ADD CONSTRAINT refresh_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE children ADD CONSTRAINT children_family_id_fkey FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE children ADD CONSTRAINT children_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE child_subjects ADD CONSTRAINT child_subjects_child_id_fkey FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE child_subjects ADD CONSTRAINT child_subjects_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE schedule_blocks ADD CONSTRAINT schedule_blocks_child_id_fkey FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE schedule_blocks ADD CONSTRAINT schedule_blocks_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE tasks ADD CONSTRAINT tasks_child_id_fkey FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE tasks ADD CONSTRAINT tasks_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE tasks ADD CONSTRAINT tasks_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE task_attachments ADD CONSTRAINT task_attachments_task_id_fkey FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE evaluations ADD CONSTRAINT evaluations_child_id_fkey FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE evaluations ADD CONSTRAINT evaluations_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE notification_preferences ADD CONSTRAINT notification_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE practice_attempts ADD CONSTRAINT practice_attempts_child_id_fkey FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE practice_attempts ADD CONSTRAINT practice_attempts_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE practice_attempts ADD CONSTRAINT practice_attempts_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE tutor_conversations ADD CONSTRAINT tutor_conversations_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE tutor_conversations ADD CONSTRAINT tutor_conversations_child_id_fkey FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE tutor_conversations ADD CONSTRAINT tutor_conversations_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE tutor_messages ADD CONSTRAINT tutor_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES tutor_conversations(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE password_reset_tokens ADD CONSTRAINT password_reset_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE ai_usage ADD CONSTRAINT ai_usage_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE learning_artifacts ADD CONSTRAINT learning_artifacts_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE learning_artifacts ADD CONSTRAINT learning_artifacts_child_id_fkey FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE learning_artifacts ADD CONSTRAINT learning_artifacts_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE learning_artifacts ADD CONSTRAINT learning_artifacts_task_id_fkey FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE ON UPDATE CASCADE;