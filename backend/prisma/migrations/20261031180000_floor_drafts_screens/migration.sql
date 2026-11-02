-- Big screens / TVs as floor landmarks, and server-side layout drafts.
ALTER TYPE "FloorObjectKind" ADD VALUE IF NOT EXISTS 'SCREEN';
ALTER TYPE "FloorObjectKind" ADD VALUE IF NOT EXISTS 'TV';
ALTER TABLE "floor_plans" ADD COLUMN "draft" JSONB, ADD COLUMN "draftSavedAt" TIMESTAMPTZ(3);
