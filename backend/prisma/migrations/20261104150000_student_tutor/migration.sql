CREATE TYPE "TutorMessageRole" AS ENUM ('student', 'assistant');

CREATE TABLE "tutor_conversations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "child_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Nueva conversación',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tutor_conversations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tutor_messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "role" "TutorMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tutor_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tutor_conversations_user_id_updated_at_idx" ON "tutor_conversations"("user_id", "updated_at");
CREATE INDEX "tutor_conversations_child_id_idx" ON "tutor_conversations"("child_id");
CREATE INDEX "tutor_conversations_expires_at_idx" ON "tutor_conversations"("expires_at");
CREATE INDEX "tutor_messages_conversation_id_created_at_idx" ON "tutor_messages"("conversation_id", "created_at");

ALTER TABLE "tutor_conversations" ADD CONSTRAINT "tutor_conversations_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tutor_conversations" ADD CONSTRAINT "tutor_conversations_child_id_fkey"
FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tutor_conversations" ADD CONSTRAINT "tutor_conversations_subject_id_fkey"
FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tutor_messages" ADD CONSTRAINT "tutor_messages_conversation_id_fkey"
FOREIGN KEY ("conversation_id") REFERENCES "tutor_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
