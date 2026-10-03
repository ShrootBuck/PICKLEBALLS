-- Streak posts are a new like and comment target.
ALTER TABLE "PostLike" DROP CONSTRAINT "PostLike_single_target";
ALTER TABLE "PostLike" ADD CONSTRAINT "PostLike_single_target"
CHECK (num_nonnulls("proofId", "checkInUpdateId", "replyId", "reviewId", "streakEventId") = 1);

ALTER TABLE "SocialReply" DROP CONSTRAINT "SocialReply_single_target";
ALTER TABLE "SocialReply" ADD CONSTRAINT "SocialReply_single_target"
  CHECK (num_nonnulls("commitmentId", "checkInId", "checkInUpdateId", "proofId", "reviewId", "bucketItemId", "streakEventId") = 1);
