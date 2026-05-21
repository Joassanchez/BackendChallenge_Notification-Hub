-- AlterTable
ALTER TABLE "notification_targets" ADD COLUMN "user_id" UUID NOT NULL;

-- CreateIndex
CREATE INDEX "notification_targets_user_id_idx" ON "notification_targets"("user_id");

-- AddForeignKey
ALTER TABLE "notification_targets" ADD CONSTRAINT "notification_targets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
