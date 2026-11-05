ALTER TABLE "tasks"
ADD COLUMN "quiz_questions" JSONB,
ADD COLUMN "reviewed_at" TIMESTAMP(3);

ALTER TABLE "practice_attempts"
ADD COLUMN "task_id" TEXT;

CREATE UNIQUE INDEX "practice_attempts_task_id_key" ON "practice_attempts"("task_id");

ALTER TABLE "practice_attempts"
ADD CONSTRAINT "practice_attempts_task_id_fkey"
FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "point_transactions" (
  "id" TEXT NOT NULL,
  "child_id" TEXT NOT NULL,
  "points" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "source_type" TEXT NOT NULL,
  "source_id" TEXT NOT NULL,
  "practice_attempt_id" TEXT,
  "task_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "point_transactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "point_transactions_source_type_source_id_key"
ON "point_transactions"("source_type", "source_id");
CREATE UNIQUE INDEX "point_transactions_practice_attempt_id_key"
ON "point_transactions"("practice_attempt_id");
CREATE INDEX "point_transactions_child_id_created_at_idx"
ON "point_transactions"("child_id", "created_at");

ALTER TABLE "point_transactions"
ADD CONSTRAINT "point_transactions_child_id_fkey"
FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "point_transactions"
ADD CONSTRAINT "point_transactions_practice_attempt_id_fkey"
FOREIGN KEY ("practice_attempt_id") REFERENCES "practice_attempts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "point_transactions"
ADD CONSTRAINT "point_transactions_task_id_fkey"
FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "child_grade_history" (
  "id" TEXT NOT NULL,
  "child_id" TEXT NOT NULL,
  "changed_by_user_id" TEXT NOT NULL,
  "from_grade" TEXT NOT NULL,
  "to_grade" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "child_grade_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "child_grade_history_child_id_created_at_idx"
ON "child_grade_history"("child_id", "created_at");

ALTER TABLE "child_grade_history"
ADD CONSTRAINT "child_grade_history_child_id_fkey"
FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "child_grade_history"
ADD CONSTRAINT "child_grade_history_changed_by_user_id_fkey"
FOREIGN KEY ("changed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
