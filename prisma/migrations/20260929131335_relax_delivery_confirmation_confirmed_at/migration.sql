-- AlterTable
-- #108 1단계(expand 쪽 이완): 코드가 이 컬럼을 더는 쓰지 않는다. 컬럼 DROP은 이 코드가 프로덕션에 뜬 뒤의 2단계다.
ALTER TABLE "DeliveryConfirmation" ALTER COLUMN "confirmedAt" DROP NOT NULL;
