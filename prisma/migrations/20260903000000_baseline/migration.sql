-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('OWNER', 'MEMBER');

-- CreateEnum
CREATE TYPE "CommitmentStatus" AS ENUM ('OPEN', 'AWAITING_REVIEW', 'VERIFIED', 'MISSED', 'RENEGOTIATED');

-- CreateEnum
CREATE TYPE "DailySignal" AS ENUM ('WORKING', 'CLEAR', 'AT_RISK');

-- CreateEnum
CREATE TYPE "ProofReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'CHALLENGED');

-- CreateEnum
CREATE TYPE "ProofReviewDecision" AS ENUM ('APPROVED', 'CHALLENGED');

-- CreateEnum
CREATE TYPE "AIAssessmentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "ActivityKind" AS ENUM ('TASK_CREATED', 'TASK_RENEGOTIATED', 'TASK_MISSED', 'PROOF_SUBMITTED', 'PROOF_APPROVED', 'PROOF_CHALLENGED', 'CHECK_IN_SET', 'REPLY_POSTED', 'INVITE_CREATED', 'INVITE_REVOKED');

-- CreateEnum
CREATE TYPE "AIFeature" AS ENUM ('PROOF_ASSESSMENT', 'BLOCKER_COACH');

-- CreateEnum
CREATE TYPE "AIRunStatus" AS ENUM ('SUCCEEDED', 'FAILED', 'RATE_LIMITED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "initials" TEXT NOT NULL DEFAULT 'PB',
    "discordId" TEXT,
    "discordUsername" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "lastRequest" BIGINT NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Circle" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL DEFAULT 'pickle-balls',
    "name" TEXT NOT NULL DEFAULT 'Pickle Balls',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Circle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "userId" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("userId","circleId")
);

-- CreateTable
CREATE TABLE "Invite" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "label" VARCHAR(80),
    "role" "MembershipRole" NOT NULL DEFAULT 'MEMBER',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "claimNonce" TEXT,
    "claimExpiresAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "usedById" TEXT,
    "circleId" TEXT NOT NULL,

    CONSTRAINT "Invite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Commitment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "definitionOfDone" VARCHAR(500) NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" "CommitmentStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Commitment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskProof" (
    "id" TEXT NOT NULL,
    "commitmentId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,
    "ownerNote" VARCHAR(500),
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isLate" BOOLEAN NOT NULL,
    "aiStatus" "AIAssessmentStatus" NOT NULL DEFAULT 'PENDING',
    "aiVisibleEvidence" TEXT,
    "aiUncertainty" TEXT,
    "aiReviewerQuestion" TEXT,
    "aiTaskMatch" TEXT,
    "aiOneLiner" TEXT,
    "reviewStatus" "ProofReviewStatus" NOT NULL DEFAULT 'PENDING',
    "replacedById" TEXT,

    CONSTRAINT "TaskProof_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskProofImage" (
    "proofId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskProofImage_pkey" PRIMARY KEY ("proofId")
);

-- CreateTable
CREATE TABLE "TaskProofReview" (
    "id" TEXT NOT NULL,
    "proofId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,
    "decision" "ProofReviewDecision" NOT NULL,
    "note" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskProofReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckIn" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "signal" "DailySignal" NOT NULL,
    "blocker" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckInUpdate" (
    "id" TEXT NOT NULL,
    "checkInId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "signal" "DailySignal" NOT NULL,
    "blocker" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckInUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialReply" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,
    "commitmentId" TEXT,
    "checkInId" TEXT,
    "proofId" TEXT,
    "reviewId" TEXT,
    "body" VARCHAR(500) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialReply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityEvent" (
    "id" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "kind" "ActivityKind" NOT NULL,
    "entityId" TEXT,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,
    "feature" "AIFeature" NOT NULL,
    "status" "AIRunStatus" NOT NULL,
    "model" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_discordId_key" ON "User"("discordId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE INDEX "Account_providerId_accountId_idx" ON "Account"("providerId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_issuer_accountId_key" ON "Account"("issuer", "accountId");

-- CreateIndex
CREATE INDEX "Verification_identifier_idx" ON "Verification"("identifier");

-- CreateIndex
CREATE INDEX "Verification_expiresAt_idx" ON "Verification"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "RateLimit_key_key" ON "RateLimit"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Circle_slug_key" ON "Circle"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_key" ON "Membership"("userId");

-- CreateIndex
CREATE INDEX "Membership_circleId_idx" ON "Membership"("circleId");

-- CreateIndex
CREATE UNIQUE INDEX "Invite_tokenHash_key" ON "Invite"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Invite_claimNonce_key" ON "Invite"("claimNonce");

-- CreateIndex
CREATE INDEX "Invite_circleId_createdAt_idx" ON "Invite"("circleId", "createdAt");

-- CreateIndex
CREATE INDEX "Invite_expiresAt_idx" ON "Invite"("expiresAt");

-- CreateIndex
CREATE INDEX "Commitment_circleId_day_idx" ON "Commitment"("circleId", "day");

-- CreateIndex
CREATE INDEX "Commitment_userId_day_idx" ON "Commitment"("userId", "day");

-- CreateIndex
CREATE INDEX "Commitment_dueAt_status_idx" ON "Commitment"("dueAt", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TaskProof_replacedById_key" ON "TaskProof"("replacedById");

-- CreateIndex
CREATE INDEX "TaskProof_commitmentId_submittedAt_idx" ON "TaskProof"("commitmentId", "submittedAt");

-- CreateIndex
CREATE INDEX "TaskProof_circleId_submittedAt_idx" ON "TaskProof"("circleId", "submittedAt");

-- CreateIndex
CREATE INDEX "TaskProof_ownerId_submittedAt_idx" ON "TaskProof"("ownerId", "submittedAt");

-- CreateIndex
CREATE INDEX "TaskProofReview_proofId_idx" ON "TaskProofReview"("proofId");

-- CreateIndex
CREATE INDEX "TaskProofReview_circleId_createdAt_idx" ON "TaskProofReview"("circleId", "createdAt");

-- CreateIndex
CREATE INDEX "TaskProofReview_reviewerId_createdAt_idx" ON "TaskProofReview"("reviewerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TaskProofReview_proofId_reviewerId_key" ON "TaskProofReview"("proofId", "reviewerId");

-- CreateIndex
CREATE INDEX "CheckIn_circleId_day_idx" ON "CheckIn"("circleId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "CheckIn_userId_circleId_day_key" ON "CheckIn"("userId", "circleId", "day");

-- CreateIndex
CREATE INDEX "CheckInUpdate_checkInId_createdAt_idx" ON "CheckInUpdate"("checkInId", "createdAt");

-- CreateIndex
CREATE INDEX "CheckInUpdate_circleId_day_createdAt_idx" ON "CheckInUpdate"("circleId", "day", "createdAt");

-- CreateIndex
CREATE INDEX "CheckInUpdate_userId_day_createdAt_idx" ON "CheckInUpdate"("userId", "day", "createdAt");

-- CreateIndex
CREATE INDEX "SocialReply_commitmentId_createdAt_idx" ON "SocialReply"("commitmentId", "createdAt");

-- CreateIndex
CREATE INDEX "SocialReply_checkInId_createdAt_idx" ON "SocialReply"("checkInId", "createdAt");

-- CreateIndex
CREATE INDEX "SocialReply_proofId_createdAt_idx" ON "SocialReply"("proofId", "createdAt");

-- CreateIndex
CREATE INDEX "SocialReply_reviewId_createdAt_idx" ON "SocialReply"("reviewId", "createdAt");

-- CreateIndex
CREATE INDEX "SocialReply_circleId_createdAt_idx" ON "SocialReply"("circleId", "createdAt");

-- CreateIndex
CREATE INDEX "SocialReply_authorId_createdAt_idx" ON "SocialReply"("authorId", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityEvent_circleId_createdAt_idx" ON "ActivityEvent"("circleId", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityEvent_circleId_kind_createdAt_idx" ON "ActivityEvent"("circleId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityEvent_createdAt_idx" ON "ActivityEvent"("createdAt");

-- CreateIndex
CREATE INDEX "AIRun_userId_feature_createdAt_idx" ON "AIRun"("userId", "feature", "createdAt");

-- CreateIndex
CREATE INDEX "AIRun_circleId_createdAt_idx" ON "AIRun"("circleId", "createdAt");

-- CreateIndex
CREATE INDEX "AIRun_createdAt_idx" ON "AIRun"("createdAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_usedById_fkey" FOREIGN KEY ("usedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commitment" ADD CONSTRAINT "Commitment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commitment" ADD CONSTRAINT "Commitment_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskProof" ADD CONSTRAINT "TaskProof_commitmentId_fkey" FOREIGN KEY ("commitmentId") REFERENCES "Commitment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskProof" ADD CONSTRAINT "TaskProof_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskProof" ADD CONSTRAINT "TaskProof_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskProof" ADD CONSTRAINT "TaskProof_replacedById_fkey" FOREIGN KEY ("replacedById") REFERENCES "TaskProof"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskProofImage" ADD CONSTRAINT "TaskProofImage_proofId_fkey" FOREIGN KEY ("proofId") REFERENCES "TaskProof"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskProofReview" ADD CONSTRAINT "TaskProofReview_proofId_fkey" FOREIGN KEY ("proofId") REFERENCES "TaskProof"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskProofReview" ADD CONSTRAINT "TaskProofReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskProofReview" ADD CONSTRAINT "TaskProofReview_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckInUpdate" ADD CONSTRAINT "CheckInUpdate_checkInId_fkey" FOREIGN KEY ("checkInId") REFERENCES "CheckIn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckInUpdate" ADD CONSTRAINT "CheckInUpdate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckInUpdate" ADD CONSTRAINT "CheckInUpdate_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialReply" ADD CONSTRAINT "SocialReply_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialReply" ADD CONSTRAINT "SocialReply_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialReply" ADD CONSTRAINT "SocialReply_commitmentId_fkey" FOREIGN KEY ("commitmentId") REFERENCES "Commitment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialReply" ADD CONSTRAINT "SocialReply_checkInId_fkey" FOREIGN KEY ("checkInId") REFERENCES "CheckIn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialReply" ADD CONSTRAINT "SocialReply_proofId_fkey" FOREIGN KEY ("proofId") REFERENCES "TaskProof"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialReply" ADD CONSTRAINT "SocialReply_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "TaskProofReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIRun" ADD CONSTRAINT "AIRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIRun" ADD CONSTRAINT "AIRun_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Enforce exactly one reply target at the DB level (app also enforces).
ALTER TABLE "SocialReply" ADD CONSTRAINT "SocialReply_single_target" CHECK (num_nonnulls("commitmentId", "checkInId", "proofId", "reviewId") = 1);
