-- "Feedback" was the wrong word for it.
--
-- Feedback is something you receive; a ticket is something you work through.
-- The difference is not cosmetic: a list called Feedback is read, and a list
-- called Tickets is emptied. The thing being collected was always the second
-- one, so it is called that from here on.
--
-- **A separate migration rather than a rewrite of 0017.** Renaming the table
-- in the file that created it would change that file's checksum, and Prisma
-- refuses to deploy when a migration it has already applied no longer matches
-- what is on disk. Whether 0017 has been applied anywhere is not something
-- this file can know, so it does the rename as its own step, which works in
-- both cases. One extra file is a small price for a deploy that cannot wedge.
--
-- ALTER TABLE ... RENAME carries the data, the primary key, the foreign key
-- and the sequence with it. The indexes and constraints keep their old names
-- underneath, which is invisible in use, so they are renamed too — a
-- constraint called Feedback_userId_fkey on a table called Ticket is the kind
-- of thing that costs somebody twenty minutes in two years.

ALTER TABLE "Feedback" RENAME TO "Ticket";

ALTER TABLE "Ticket" RENAME CONSTRAINT "Feedback_pkey" TO "Ticket_pkey";
ALTER TABLE "Ticket" RENAME CONSTRAINT "Feedback_userId_fkey" TO "Ticket_userId_fkey";

ALTER INDEX "Feedback_resolvedAt_createdAt_idx" RENAME TO "Ticket_resolvedAt_createdAt_idx";
ALTER INDEX "Feedback_userId_idx" RENAME TO "Ticket_userId_idx";

ALTER SEQUENCE "Feedback_id_seq" RENAME TO "Ticket_id_seq";
