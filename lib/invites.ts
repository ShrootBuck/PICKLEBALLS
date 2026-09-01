import "server-only";

import { createHash, randomBytes } from "node:crypto";

export const adminEmail = "zayd@zaydkrunz.com";
export const inviteLifetimeMs = 7 * 24 * 60 * 60 * 1000;
export const inviteClaimLifetimeMs = 5 * 60 * 1000;

export function isAdminEmail(email: string) {
  return email.trim().toLowerCase() === adminEmail;
}

export function createInviteToken() {
  return randomBytes(32).toString("base64url");
}

export function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
