-- Rewrite the daily status from WORKING / CLEAR / AT_RISK to a simple YAY / NAY.
-- Legacy values remain valid during deployment so the previous Vercel release
-- can keep serving requests until the new release takes over. New code only
-- writes YAY/NAY; a later migration may remove the legacy enum labels.
CREATE TYPE "DailySignal_new" AS ENUM (
  'YAY',
  'NAY',
  'WORKING',
  'CLEAR',
  'AT_RISK'
);

ALTER TABLE "CheckIn" ALTER COLUMN "signal" TYPE "DailySignal_new"
  USING (
    CASE WHEN "signal"::text = 'AT_RISK'
      THEN 'NAY'::"DailySignal_new"
      ELSE 'YAY'::"DailySignal_new"
    END
  );

ALTER TABLE "CheckInUpdate" ALTER COLUMN "signal" TYPE "DailySignal_new"
  USING (
    CASE WHEN "signal"::text = 'AT_RISK'
      THEN 'NAY'::"DailySignal_new"
      ELSE 'YAY'::"DailySignal_new"
    END
  );

ALTER TYPE "DailySignal" RENAME TO "DailySignal_old";
ALTER TYPE "DailySignal_new" RENAME TO "DailySignal";
DROP TYPE "DailySignal_old";
