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

function main() {
  ensureDirectories();
  if (!isPgReady()) {
    initClusterIfNeeded();
    startClusterIfNeeded();
  }
  ensureDatabaseExists();
  console.log(`[ensure-db] PostgreSQL 15 is ready at localhost:${PG_PORT}/${PG_DB}`);
}

main();
