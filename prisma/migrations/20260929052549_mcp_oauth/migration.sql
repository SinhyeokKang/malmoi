-- CreateTable
CREATE TABLE "OAuthConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientName" TEXT,
    "redirectUri" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "grants" TEXT[],
    "allProjects" BOOLEAN NOT NULL,
    "projectIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "accessTokenHash" TEXT NOT NULL,
    "accessExpiresAt" TIMESTAMP(3) NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "OAuthConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthRefreshHistory" (
    "tokenHash" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OAuthRefreshHistory_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateTable
CREATE TABLE "OAuthAuthorizationRequest" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientName" TEXT,
    "redirectUri" TEXT NOT NULL,
    "state" TEXT,
    "codeChallenge" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "OAuthAuthorizationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthCode" (
    "codeHash" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientName" TEXT,
    "redirectUri" TEXT NOT NULL,
    "codeChallenge" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grants" TEXT[],
    "allProjects" BOOLEAN NOT NULL,
    "projectIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "connectionExpiresAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "OAuthCode_pkey" PRIMARY KEY ("codeHash")
);

-- CreateIndex
CREATE UNIQUE INDEX "OAuthConnection_accessTokenHash_key" ON "OAuthConnection"("accessTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthConnection_refreshTokenHash_key" ON "OAuthConnection"("refreshTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthConnection_userId_clientId_key" ON "OAuthConnection"("userId", "clientId");

-- CreateIndex
CREATE INDEX "OAuthRefreshHistory_connectionId_idx" ON "OAuthRefreshHistory"("connectionId");

-- CreateIndex
CREATE INDEX "OAuthAuthorizationRequest_expiresAt_idx" ON "OAuthAuthorizationRequest"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthCode_requestId_key" ON "OAuthCode"("requestId");

-- CreateIndex
CREATE INDEX "OAuthCode_userId_clientId_idx" ON "OAuthCode"("userId", "clientId");

-- AddForeignKey
ALTER TABLE "OAuthConnection" ADD CONSTRAINT "OAuthConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthRefreshHistory" ADD CONSTRAINT "OAuthRefreshHistory_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "OAuthConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthCode" ADD CONSTRAINT "OAuthCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

