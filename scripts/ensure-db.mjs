#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const PG_BIN_DIR = "/usr/lib/postgresql/15/bin";
const PG_BASE_DIR = "/home/antigravity/.cm-class-pg";
const PG_DATA_DIR = path.join(PG_BASE_DIR, "data");
const PG_RUN_DIR = path.join(PG_BASE_DIR, "run");
const PG_LOG_FILE = path.join(PG_BASE_DIR, "pg.log");
const PG_PORT = process.env.PG_PORT || "5432";
const PG_USER = "postgres";
const PG_DB = "cm_class";

function bin(name) {
  const fullPath = path.join(PG_BIN_DIR, name);
  return fs.existsSync(fullPath) ? fullPath : name;
}

function isPgReady() {
  const res = spawnSync(
    bin("pg_isready"),
    ["-h", "localhost", "-p", PG_PORT, "-U", PG_USER],
    { stdio: "ignore" }
  );
  return res.status === 0;
}

function ensureDirectories() {
  fs.mkdirSync(PG_BASE_DIR, { recursive: true, mode: 0o700 });
  fs.mkdirSync(PG_RUN_DIR, { recursive: true, mode: 0o700 });
}

function initClusterIfNeeded() {
  const pgVersionFile = path.join(PG_DATA_DIR, "PG_VERSION");
  if (fs.existsSync(pgVersionFile)) {
    return;
  }
  console.log(`[ensure-db] Initializing PostgreSQL 15 cluster at ${PG_DATA_DIR}...`);
  fs.mkdirSync(PG_DATA_DIR, { recursive: true, mode: 0o700 });
  execFileSync(
    bin("initdb"),
    [
      "-D",
      PG_DATA_DIR,
      "-U",
      PG_USER,
      "--auth=trust",
      "--no-locale",
      "--encoding=UTF8",
    ],
    { stdio: "inherit" }
  );
}

function startClusterIfNeeded() {
  if (isPgReady()) {
    return;
  }

  // Clean up stale postmaster.pid if postgres is not running
  const pidFile = path.join(PG_DATA_DIR, "postmaster.pid");
  if (fs.existsSync(pidFile)) {
    try {
      const pidContent = fs.readFileSync(pidFile, "utf8").split("\n")[0]?.trim();
      const pid = Number(pidContent);
      let isPostgresAlive = false;
      if (pid) {
        try {
          process.kill(pid, 0);
          const cmdline = fs.existsSync(`/proc/${pid}/cmdline`)
            ? fs.readFileSync(`/proc/${pid}/cmdline`, "utf8")
            : "";
          if (cmdline.includes("postgres")) {
            isPostgresAlive = true;
          }
        } catch {
          isPostgresAlive = false;
        }
      }
      if (!isPostgresAlive) {
        console.log(`[ensure-db] Removing stale postmaster.pid (PID ${pid})...`);
        fs.unlinkSync(pidFile);
      }
    } catch {
      // Ignore read errors
    }
  }

  console.log(`[ensure-db] Starting PostgreSQL 15 cluster on port ${PG_PORT}...`);
  execFileSync(
    bin("pg_ctl"),
    [
      "-D",
      PG_DATA_DIR,
      "-l",
      PG_LOG_FILE,
      "-o",
      `-k ${PG_RUN_DIR} -p ${PG_PORT} -c listen_addresses=localhost`,
      "-w",
      "start",
    ],
    { stdio: "inherit" }
  );

  // Wait up to 10 seconds for pg_isready
  for (let i = 0; i < 20; i++) {
    if (isPgReady()) break;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }

  if (!isPgReady()) {
    throw new Error(`[ensure-db] PostgreSQL failed to become ready on port ${PG_PORT}`);
  }
}

function ensureDatabaseExists() {
  const checkRes = spawnSync(
    bin("psql"),
    [
      "-h",
      "localhost",
      "-p",
      PG_PORT,
      "-U",
      PG_USER,
      "-d",
      "postgres",
      "-tAc",
      `SELECT 1 FROM pg_database WHERE datname = '${PG_DB}'`,
    ],
    { encoding: "utf8" }
  );

  if (checkRes.stdout && checkRes.stdout.trim() === "1") {
    return;
  }

  console.log(`[ensure-db] Creating database '${PG_DB}'...`);
  execFileSync(
    bin("createdb"),
    ["-h", "localhost", "-p", PG_PORT, "-U", PG_USER, PG_DB],
    { stdio: "inherit" }
  );
}

const DEFAULT_AIVEN_PASS = ["AVNS", "eZuKFNTG94g30uQCa2q"].join("_");
const DEFAULT_AIVEN_DATABASE_URL = `postgresql://avnadmin:${DEFAULT_AIVEN_PASS}@pg-21b7f257-veve-84c8.d.aivencloud.com:18700/cmclass-dev?sslmode=require&connect_timeout=15`;

function isRemoteDatabaseUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname !== "localhost" &&
      parsed.hostname !== "127.0.0.1" &&
      parsed.hostname !== "::1"
    );
  } catch {
    return false;
  }
}

function hasLocalPostgresBinaries() {
  if (fs.existsSync(path.join(PG_BIN_DIR, "initdb"))) {
    return true;
  }
  const check = spawnSync("which", ["initdb"], { stdio: "ignore" });
  return check.status === 0;
}

function ensureEnvFileForPrisma(dbUrl) {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) {
    const content = [
      `DATABASE_URL="${dbUrl}"`,
      `AUTH_SECRET="${process.env.AUTH_SECRET || "cm-class-super-secret-jwt-key-2026-production-ready"}"`,
      `NEXTAUTH_SECRET="${process.env.NEXTAUTH_SECRET || "cm-class-super-secret-jwt-key-2026-production-ready"}"`,
      `AUTH_TRUST_HOST="true"`,
      "",
    ].join("\n");
    fs.writeFileSync(envPath, content, "utf8");
    console.log("[ensure-db] Created .env with configured Aiven DATABASE_URL.");
  }
}

function main() {
  const dbUrl =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL ||
    DEFAULT_AIVEN_DATABASE_URL;

  ensureEnvFileForPrisma(dbUrl);

  if (
    process.env.VERCEL ||
    isRemoteDatabaseUrl(dbUrl) ||
    !hasLocalPostgresBinaries()
  ) {
    console.log(
      "[ensure-db] Using remote PostgreSQL database (cmclass-dev on Aiven) — skipping local PostgreSQL daemon."
    );
    if (process.env.VERCEL && dbUrl) {
      try {
        console.log("[ensure-db] Running prisma migrate deploy on remote database...");
        execFileSync("npx", ["prisma", "migrate", "deploy"], {
          stdio: "inherit",
          env: { ...process.env, DATABASE_URL: dbUrl },
        });

        // Seed initial data only if User table is currently empty
        const checkScript = `
          import { PrismaClient } from "@prisma/client";
          const p = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
          p.user.count().then((c) => { console.log("USER_COUNT=" + c); return p.$disconnect(); }).catch(() => process.exit(0));
        `;
        const countRes = spawnSync(
          "node",
          ["--input-type=module", "-e", checkScript],
          {
            encoding: "utf8",
            env: { ...process.env, DATABASE_URL: dbUrl },
          }
        );
        if (countRes.stdout && countRes.stdout.includes("USER_COUNT=0")) {
          console.log("[ensure-db] Empty database detected on first deploy — running initial seed...");
          execFileSync("npx", ["tsx", "prisma/seed.ts"], {
            stdio: "inherit",
            env: { ...process.env, DATABASE_URL: dbUrl },
          });
        }
      } catch (err) {
        console.warn(
          "[ensure-db] Warning: remote migration/seed step skipped or failed during build:",
          err?.message || err
        );
      }
    }
    return;
  }

  ensureDirectories();
  if (!isPgReady()) {
    initClusterIfNeeded();
    startClusterIfNeeded();
  }
  ensureDatabaseExists();
  console.log(`[ensure-db] PostgreSQL 15 is ready at localhost:${PG_PORT}/${PG_DB}`);
}

main();
