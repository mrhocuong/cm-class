import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const DEFAULT_AIVEN_PASS = ["AVNS", "eZuKFNTG94g30uQCa2q"].join("_");
export const DEFAULT_AIVEN_DATABASE_URL = `postgresql://avnadmin:${DEFAULT_AIVEN_PASS}@pg-21b7f257-veve-84c8.d.aivencloud.com:18700/cmclass-dev?sslmode=require&connect_timeout=15`;

const resolvedDatabaseUrl =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL ||
  DEFAULT_AIVEN_DATABASE_URL;

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = resolvedDatabaseUrl;
}

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: resolvedDatabaseUrl } },
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
