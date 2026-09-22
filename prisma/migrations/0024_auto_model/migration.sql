-- Which model answered, when nobody chose one.
--
-- `model` already exists and holds a person's choice. This records that the
-- value in it was picked by the fallback instead — so the admin screen can say
-- "chosen automatically on the 22nd, because the default was out of quota"
-- rather than showing a name nobody typed and letting them wonder.

ALTER TABLE "AiCredential" ADD COLUMN "autoModelAt" TIMESTAMP(3);
