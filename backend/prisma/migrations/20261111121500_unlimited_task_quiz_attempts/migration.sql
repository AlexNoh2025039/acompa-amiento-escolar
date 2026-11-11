DROP INDEX "practice_attempts_task_id_key";

CREATE INDEX "practice_attempts_task_id_idx" ON "practice_attempts"("task_id");
