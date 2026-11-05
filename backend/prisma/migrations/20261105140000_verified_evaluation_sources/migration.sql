ALTER TABLE "evaluations"
ADD COLUMN "practice_attempt_id" TEXT;

CREATE UNIQUE INDEX "evaluations_practice_attempt_id_key"
ON "evaluations"("practice_attempt_id");

ALTER TABLE "evaluations"
ADD CONSTRAINT "evaluations_practice_attempt_id_fkey"
FOREIGN KEY ("practice_attempt_id") REFERENCES "practice_attempts"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
