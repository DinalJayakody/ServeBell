-- Link local profiles to Supabase Auth; Firebase identity becomes optional during the move.
ALTER TABLE "users" ADD COLUMN "authUserId" UUID;
ALTER TABLE "users" ALTER COLUMN "firebaseUid" DROP NOT NULL;
CREATE UNIQUE INDEX "users_authUserId_key" ON "users"("authUserId");
