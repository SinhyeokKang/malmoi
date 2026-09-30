-- AlterEnum
BEGIN;
CREATE TYPE "ActorKind_new" AS ENUM ('USER', 'AUTOMATION');
ALTER TABLE "ProjectEvent" ALTER COLUMN "actorKind" TYPE "ActorKind_new" USING ("actorKind"::text::"ActorKind_new");
ALTER TYPE "ActorKind" RENAME TO "ActorKind_old";
ALTER TYPE "ActorKind_new" RENAME TO "ActorKind";
DROP TYPE "public"."ActorKind_old";
COMMIT;

-- AlterTable
ALTER TABLE "Account" DROP COLUMN "id_token",
DROP COLUMN "scope",
DROP COLUMN "session_state",
DROP COLUMN "token_type";

-- AlterTable
ALTER TABLE "DeliveryConfirmation" DROP COLUMN "confirmedAt";

-- AlterTable
ALTER TABLE "TranslationBaseline" DROP COLUMN "recordedAt";

