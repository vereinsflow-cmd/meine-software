-- CreateEnum
CREATE TYPE "ClubStatus" AS ENUM ('ACTIVE', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "PermissionScope" AS ENUM ('CLUB', 'DEPARTMENT', 'OWN');

-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('ACTIVE', 'PASSIVE', 'LEFT', 'HONORARY', 'BLOCKED');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'COMPLETED', 'CANCELLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('EVENT', 'TRAINING', 'MEETING', 'COMPETITION', 'WORK_ASSIGNMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "EventVisibility" AS ENUM ('INTERNAL', 'PUBLIC');

-- CreateEnum
CREATE TYPE "ParticipantStatus" AS ENUM ('ACCEPTED', 'DECLINED', 'WAITLISTED');

-- CreateEnum
CREATE TYPE "ShiftStatus" AS ENUM ('OPEN', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('SYSTEM', 'SHIFT_ASSIGNED', 'SHIFT_CHANGED', 'SHIFT_CANCELLED', 'SHIFT_REMINDER', 'EVENT_PUBLISHED', 'EVENT_CHANGED', 'EVENT_CANCELLED', 'EVENT_REMINDER', 'TASK_ASSIGNED', 'MESSAGE', 'INVITATION');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('NONE', 'PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENT');

-- CreateEnum
CREATE TYPE "MessageAudience" AS ENUM ('ALL_MEMBERS', 'DEPARTMENT', 'EVENT_PARTICIPANTS', 'EVENT_HELPERS');

-- CreateEnum
CREATE TYPE "ConsentType" AS ENUM ('PRIVACY_POLICY', 'DATA_PROCESSING', 'NEWSLETTER', 'PHOTO_PUBLICATION');

-- CreateEnum
CREATE TYPE "VerificationTokenType" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET', 'EMAIL_CHANGE');

-- CreateEnum
CREATE TYPE "DeletionRequestStatus" AS ENUM ('PENDING', 'COMPLETED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('USER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "DocumentAccess" AS ENUM ('ALL_MEMBERS', 'BOARD', 'ADMIN');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerifiedAt" TIMESTAMPTZ(3),
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false,
    "totpSecretEnc" TEXT,
    "totpEnabledAt" TIMESTAMPTZ(3),
    "recoveryCodeHashes" TEXT[],
    "lastLoginAt" TIMESTAMPTZ(3),
    "termsAcceptedAt" TIMESTAMPTZ(3),
    "termsVersion" TEXT,
    "emailNotifications" BOOLEAN NOT NULL DEFAULT true,
    "disabledAt" TIMESTAMPTZ(3),
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "activeClubId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "userAgent" TEXT,
    "ipPrefix" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "VerificationTokenType" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "newEmail" TEXT,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "resetAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Permission" (
    "key" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Club" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "ClubStatus" NOT NULL DEFAULT 'ACTIVE',
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Berlin',
    "contactEmail" TEXT,
    "phone" TEXT,
    "street" TEXT,
    "postalCode" TEXT,
    "city" TEXT,
    "website" TEXT,
    "privacyContact" TEXT,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "deactivatedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Club_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "clubId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "permissionKey" TEXT NOT NULL,
    "scope" "PermissionScope" NOT NULL DEFAULT 'CLUB',

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionKey")
);

-- CreateTable
CREATE TABLE "ClubMembership" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "joinedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ClubMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "memberId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "invitedByUserId" TEXT,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "acceptedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Member" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "memberNumber" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "street" TEXT,
    "postalCode" TEXT,
    "city" TEXT,
    "country" TEXT DEFAULT 'DE',
    "birthDate" DATE,
    "joinedAt" DATE,
    "leftAt" DATE,
    "status" "MemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "clubFunction" TEXT,
    "internalNotes" TEXT,
    "photoDocumentId" TEXT,
    "userId" TEXT,
    "archivedAt" TIMESTAMPTZ(3),
    "deletedAt" TIMESTAMPTZ(3),
    "anonymizedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberDepartment" (
    "clubId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "isLeader" BOOLEAN NOT NULL DEFAULT false,
    "since" DATE,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberDepartment_pkey" PRIMARY KEY ("memberId","departmentId")
);

-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "departmentId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupMember" (
    "clubId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "isLead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupMember_pkey" PRIMARY KEY ("groupId","memberId")
);

-- CreateTable
CREATE TABLE "Consent" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "type" "ConsentType" NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "textVersion" TEXT,
    "source" TEXT,
    "recordedBy" TEXT,
    "recordedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Consent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "seriesId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "EventType" NOT NULL DEFAULT 'EVENT',
    "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
    "visibility" "EventVisibility" NOT NULL DEFAULT 'INTERNAL',
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "locationName" TEXT,
    "address" TEXT,
    "contactMemberId" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "targetAudience" TEXT,
    "departmentId" TEXT,
    "maxParticipants" INTEGER,
    "registrationRequired" BOOLEAN NOT NULL DEFAULT false,
    "registrationDeadline" TIMESTAMPTZ(3),
    "waitlistEnabled" BOOLEAN NOT NULL DEFAULT false,
    "internalNotes" TEXT,
    "publishedAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "cancelReason" TEXT,
    "createdById" TEXT,
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventParticipant" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "status" "ParticipantStatus" NOT NULL,
    "note" TEXT,
    "respondedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "EventParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventShift" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "taskName" TEXT,
    "description" TEXT,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "meetingPoint" TEXT,
    "requiredCount" INTEGER NOT NULL,
    "minAge" INTEGER,
    "requirements" TEXT,
    "internalNotes" TEXT,
    "responsibleMemberId" TEXT,
    "status" "ShiftStatus" NOT NULL DEFAULT 'OPEN',
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "EventShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftAssignment" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'CONFIRMED',
    "assignedByUserId" TEXT,
    "assignedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMPTZ(3),
    "workedMinutes" INTEGER,
    "hoursApprovedAt" TIMESTAMPTZ(3),
    "hoursApprovedById" TEXT,
    "reminderSentAt" TIMESTAMPTZ(3),
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ShiftAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "eventId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assigneeMemberId" TEXT,
    "groupId" TEXT,
    "dueDate" DATE,
    "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "TaskPriority" NOT NULL DEFAULT 'NORMAL',
    "notes" TEXT,
    "completedAt" TIMESTAMPTZ(3),
    "createdById" TEXT,
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Checklist" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "eventId" TEXT,
    "title" TEXT NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Checklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistItem" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "checklistId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isDone" BOOLEAN NOT NULL DEFAULT false,
    "doneAt" TIMESTAMPTZ(3),
    "doneById" TEXT,
    "assigneeMemberId" TEXT,
    "dueDate" DATE,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "linkUrl" TEXT,
    "readAt" TIMESTAMPTZ(3),
    "dedupeKey" TEXT,
    "emailStatus" "EmailStatus" NOT NULL DEFAULT 'NONE',
    "emailSentAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "authorUserId" TEXT,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "audience" "MessageAudience" NOT NULL,
    "departmentId" TEXT,
    "eventId" TEXT,
    "isAnnouncement" BOOLEAN NOT NULL DEFAULT false,
    "sendInApp" BOOLEAN NOT NULL DEFAULT true,
    "sendEmail" BOOLEAN NOT NULL DEFAULT false,
    "status" "MessageStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMPTZ(3),
    "sentAt" TIMESTAMPTZ(3),
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageRecipient" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "userId" TEXT,
    "readAt" TIMESTAMPTZ(3),
    "emailStatus" "EmailStatus" NOT NULL DEFAULT 'NONE',
    "emailSentAt" TIMESTAMPTZ(3),

    CONSTRAINT "MessageRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentFolder" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DocumentFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "category" TEXT,
    "access" "DocumentAccess" NOT NULL DEFAULT 'ALL_MEMBERS',
    "folderId" TEXT,
    "eventId" TEXT,
    "memberId" TEXT,
    "taskId" TEXT,
    "uploadedById" TEXT,
    "archivedAt" TIMESTAMPTZ(3),
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarFeedToken" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "CalendarFeedToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeletionRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clubId" TEXT,
    "status" "DeletionRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "requestedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scheduledFor" TIMESTAMPTZ(3) NOT NULL,
    "processedAt" TIMESTAMPTZ(3),
    "processedByUserId" TEXT,
    "note" TEXT,

    CONSTRAINT "DeletionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "clubId" TEXT,
    "actorUserId" TEXT,
    "actorType" "AuditActorType" NOT NULL DEFAULT 'USER',
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "summary" TEXT,
    "changes" JSONB,
    "ipPrefix" TEXT,
    "requestId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_tokenHash_key" ON "VerificationToken"("tokenHash");

-- CreateIndex
CREATE INDEX "VerificationToken_userId_type_idx" ON "VerificationToken"("userId", "type");

-- CreateIndex
CREATE INDEX "VerificationToken_expiresAt_idx" ON "VerificationToken"("expiresAt");

-- CreateIndex
CREATE INDEX "RateLimitBucket_resetAt_idx" ON "RateLimitBucket"("resetAt");

-- CreateIndex
CREATE UNIQUE INDEX "Club_slug_key" ON "Club"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Role_clubId_id_key" ON "Role"("clubId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Role_clubId_key_key" ON "Role"("clubId", "key");

-- CreateIndex
CREATE INDEX "RolePermission_clubId_idx" ON "RolePermission"("clubId");

-- CreateIndex
CREATE INDEX "ClubMembership_userId_idx" ON "ClubMembership"("userId");

-- CreateIndex
CREATE INDEX "ClubMembership_clubId_roleId_idx" ON "ClubMembership"("clubId", "roleId");

-- CreateIndex
CREATE UNIQUE INDEX "ClubMembership_clubId_userId_key" ON "ClubMembership"("clubId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "Invitation_clubId_email_idx" ON "Invitation"("clubId", "email");

-- CreateIndex
CREATE INDEX "Invitation_clubId_acceptedAt_revokedAt_idx" ON "Invitation"("clubId", "acceptedAt", "revokedAt");

-- CreateIndex
CREATE INDEX "Member_clubId_status_idx" ON "Member"("clubId", "status");

-- CreateIndex
CREATE INDEX "Member_clubId_lastName_firstName_idx" ON "Member"("clubId", "lastName", "firstName");

-- CreateIndex
CREATE INDEX "Member_clubId_archivedAt_deletedAt_idx" ON "Member"("clubId", "archivedAt", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Member_clubId_id_key" ON "Member"("clubId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Member_clubId_memberNumber_key" ON "Member"("clubId", "memberNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Member_clubId_userId_key" ON "Member"("clubId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Department_clubId_id_key" ON "Department"("clubId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Department_clubId_name_key" ON "Department"("clubId", "name");

-- CreateIndex
CREATE INDEX "MemberDepartment_clubId_departmentId_idx" ON "MemberDepartment"("clubId", "departmentId");

-- CreateIndex
CREATE INDEX "Group_clubId_departmentId_idx" ON "Group"("clubId", "departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Group_clubId_id_key" ON "Group"("clubId", "id");

-- CreateIndex
CREATE INDEX "GroupMember_clubId_memberId_idx" ON "GroupMember"("clubId", "memberId");

-- CreateIndex
CREATE INDEX "Consent_clubId_memberId_type_recordedAt_idx" ON "Consent"("clubId", "memberId", "type", "recordedAt");

-- CreateIndex
CREATE INDEX "Event_clubId_startsAt_idx" ON "Event"("clubId", "startsAt");

-- CreateIndex
CREATE INDEX "Event_clubId_status_startsAt_idx" ON "Event"("clubId", "status", "startsAt");

-- CreateIndex
CREATE INDEX "Event_clubId_departmentId_startsAt_idx" ON "Event"("clubId", "departmentId", "startsAt");

-- CreateIndex
CREATE INDEX "Event_clubId_seriesId_idx" ON "Event"("clubId", "seriesId");

-- CreateIndex
CREATE UNIQUE INDEX "Event_clubId_id_key" ON "Event"("clubId", "id");

-- CreateIndex
CREATE INDEX "EventParticipant_clubId_eventId_status_createdAt_idx" ON "EventParticipant"("clubId", "eventId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "EventParticipant_clubId_memberId_idx" ON "EventParticipant"("clubId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "EventParticipant_eventId_memberId_key" ON "EventParticipant"("eventId", "memberId");

-- CreateIndex
CREATE INDEX "EventShift_clubId_eventId_idx" ON "EventShift"("clubId", "eventId");

-- CreateIndex
CREATE INDEX "EventShift_clubId_startsAt_idx" ON "EventShift"("clubId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "EventShift_clubId_id_key" ON "EventShift"("clubId", "id");

-- CreateIndex
CREATE INDEX "ShiftAssignment_clubId_shiftId_status_idx" ON "ShiftAssignment"("clubId", "shiftId", "status");

-- CreateIndex
CREATE INDEX "ShiftAssignment_clubId_memberId_status_idx" ON "ShiftAssignment"("clubId", "memberId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftAssignment_shiftId_memberId_key" ON "ShiftAssignment"("shiftId", "memberId");

-- CreateIndex
CREATE INDEX "Task_clubId_status_dueDate_idx" ON "Task"("clubId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "Task_clubId_assigneeMemberId_status_idx" ON "Task"("clubId", "assigneeMemberId", "status");

-- CreateIndex
CREATE INDEX "Task_clubId_eventId_idx" ON "Task"("clubId", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "Task_clubId_id_key" ON "Task"("clubId", "id");

-- CreateIndex
CREATE INDEX "Checklist_clubId_eventId_idx" ON "Checklist"("clubId", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "Checklist_clubId_id_key" ON "Checklist"("clubId", "id");

-- CreateIndex
CREATE INDEX "ChecklistItem_clubId_checklistId_position_idx" ON "ChecklistItem"("clubId", "checklistId", "position");

-- CreateIndex
CREATE INDEX "Notification_clubId_userId_readAt_createdAt_idx" ON "Notification"("clubId", "userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_emailStatus_createdAt_idx" ON "Notification"("emailStatus", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_userId_dedupeKey_key" ON "Notification"("userId", "dedupeKey");

-- CreateIndex
CREATE INDEX "Message_clubId_status_scheduledAt_idx" ON "Message"("clubId", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "Message_clubId_createdAt_idx" ON "Message"("clubId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Message_clubId_id_key" ON "Message"("clubId", "id");

-- CreateIndex
CREATE INDEX "MessageRecipient_clubId_userId_readAt_idx" ON "MessageRecipient"("clubId", "userId", "readAt");

-- CreateIndex
CREATE INDEX "MessageRecipient_emailStatus_idx" ON "MessageRecipient"("emailStatus");

-- CreateIndex
CREATE UNIQUE INDEX "MessageRecipient_messageId_memberId_key" ON "MessageRecipient"("messageId", "memberId");

-- CreateIndex
CREATE INDEX "DocumentFolder_clubId_parentId_idx" ON "DocumentFolder"("clubId", "parentId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentFolder_clubId_id_key" ON "DocumentFolder"("clubId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Document_storageKey_key" ON "Document"("storageKey");

-- CreateIndex
CREATE INDEX "Document_clubId_folderId_idx" ON "Document"("clubId", "folderId");

-- CreateIndex
CREATE INDEX "Document_clubId_eventId_idx" ON "Document"("clubId", "eventId");

-- CreateIndex
CREATE INDEX "Document_clubId_memberId_idx" ON "Document"("clubId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "Document_clubId_id_key" ON "Document"("clubId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarFeedToken_tokenHash_key" ON "CalendarFeedToken"("tokenHash");

-- CreateIndex
CREATE INDEX "CalendarFeedToken_clubId_userId_idx" ON "CalendarFeedToken"("clubId", "userId");

-- CreateIndex
CREATE INDEX "DeletionRequest_status_scheduledFor_idx" ON "DeletionRequest"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "DeletionRequest_userId_idx" ON "DeletionRequest"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_clubId_createdAt_idx" ON "AuditLog"("clubId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_clubId_entityType_entityId_createdAt_idx" ON "AuditLog"("clubId", "entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_activeClubId_fkey" FOREIGN KEY ("activeClubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationToken" ADD CONSTRAINT "VerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_clubId_roleId_fkey" FOREIGN KEY ("clubId", "roleId") REFERENCES "Role"("clubId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionKey_fkey" FOREIGN KEY ("permissionKey") REFERENCES "Permission"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubMembership" ADD CONSTRAINT "ClubMembership_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubMembership" ADD CONSTRAINT "ClubMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubMembership" ADD CONSTRAINT "ClubMembership_clubId_roleId_fkey" FOREIGN KEY ("clubId", "roleId") REFERENCES "Role"("clubId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_clubId_roleId_fkey" FOREIGN KEY ("clubId", "roleId") REFERENCES "Role"("clubId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_clubId_memberId_fkey" FOREIGN KEY ("clubId", "memberId") REFERENCES "Member"("clubId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_clubId_userId_fkey" FOREIGN KEY ("clubId", "userId") REFERENCES "ClubMembership"("clubId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberDepartment" ADD CONSTRAINT "MemberDepartment_clubId_memberId_fkey" FOREIGN KEY ("clubId", "memberId") REFERENCES "Member"("clubId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberDepartment" ADD CONSTRAINT "MemberDepartment_clubId_departmentId_fkey" FOREIGN KEY ("clubId", "departmentId") REFERENCES "Department"("clubId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_clubId_departmentId_fkey" FOREIGN KEY ("clubId", "departmentId") REFERENCES "Department"("clubId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_clubId_groupId_fkey" FOREIGN KEY ("clubId", "groupId") REFERENCES "Group"("clubId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_clubId_memberId_fkey" FOREIGN KEY ("clubId", "memberId") REFERENCES "Member"("clubId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_clubId_memberId_fkey" FOREIGN KEY ("clubId", "memberId") REFERENCES "Member"("clubId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_clubId_departmentId_fkey" FOREIGN KEY ("clubId", "departmentId") REFERENCES "Department"("clubId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_clubId_contactMemberId_fkey" FOREIGN KEY ("clubId", "contactMemberId") REFERENCES "Member"("clubId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventParticipant" ADD CONSTRAINT "EventParticipant_clubId_eventId_fkey" FOREIGN KEY ("clubId", "eventId") REFERENCES "Event"("clubId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventParticipant" ADD CONSTRAINT "EventParticipant_clubId_memberId_fkey" FOREIGN KEY ("clubId", "memberId") REFERENCES "Member"("clubId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventShift" ADD CONSTRAINT "EventShift_clubId_eventId_fkey" FOREIGN KEY ("clubId", "eventId") REFERENCES "Event"("clubId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventShift" ADD CONSTRAINT "EventShift_clubId_responsibleMemberId_fkey" FOREIGN KEY ("clubId", "responsibleMemberId") REFERENCES "Member"("clubId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_clubId_shiftId_fkey" FOREIGN KEY ("clubId", "shiftId") REFERENCES "EventShift"("clubId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_clubId_memberId_fkey" FOREIGN KEY ("clubId", "memberId") REFERENCES "Member"("clubId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_clubId_eventId_fkey" FOREIGN KEY ("clubId", "eventId") REFERENCES "Event"("clubId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_clubId_assigneeMemberId_fkey" FOREIGN KEY ("clubId", "assigneeMemberId") REFERENCES "Member"("clubId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_clubId_groupId_fkey" FOREIGN KEY ("clubId", "groupId") REFERENCES "Group"("clubId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Checklist" ADD CONSTRAINT "Checklist_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Checklist" ADD CONSTRAINT "Checklist_clubId_eventId_fkey" FOREIGN KEY ("clubId", "eventId") REFERENCES "Event"("clubId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_clubId_checklistId_fkey" FOREIGN KEY ("clubId", "checklistId") REFERENCES "Checklist"("clubId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_clubId_assigneeMemberId_fkey" FOREIGN KEY ("clubId", "assigneeMemberId") REFERENCES "Member"("clubId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_clubId_userId_fkey" FOREIGN KEY ("clubId", "userId") REFERENCES "ClubMembership"("clubId", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_clubId_departmentId_fkey" FOREIGN KEY ("clubId", "departmentId") REFERENCES "Department"("clubId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_clubId_eventId_fkey" FOREIGN KEY ("clubId", "eventId") REFERENCES "Event"("clubId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageRecipient" ADD CONSTRAINT "MessageRecipient_clubId_messageId_fkey" FOREIGN KEY ("clubId", "messageId") REFERENCES "Message"("clubId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageRecipient" ADD CONSTRAINT "MessageRecipient_clubId_memberId_fkey" FOREIGN KEY ("clubId", "memberId") REFERENCES "Member"("clubId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentFolder" ADD CONSTRAINT "DocumentFolder_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentFolder" ADD CONSTRAINT "DocumentFolder_clubId_parentId_fkey" FOREIGN KEY ("clubId", "parentId") REFERENCES "DocumentFolder"("clubId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_clubId_folderId_fkey" FOREIGN KEY ("clubId", "folderId") REFERENCES "DocumentFolder"("clubId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_clubId_eventId_fkey" FOREIGN KEY ("clubId", "eventId") REFERENCES "Event"("clubId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_clubId_memberId_fkey" FOREIGN KEY ("clubId", "memberId") REFERENCES "Member"("clubId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_clubId_taskId_fkey" FOREIGN KEY ("clubId", "taskId") REFERENCES "Task"("clubId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarFeedToken" ADD CONSTRAINT "CalendarFeedToken_clubId_userId_fkey" FOREIGN KEY ("clubId", "userId") REFERENCES "ClubMembership"("clubId", "userId") ON DELETE CASCADE ON UPDATE CASCADE;
