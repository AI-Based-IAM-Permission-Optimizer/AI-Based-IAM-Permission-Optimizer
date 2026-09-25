/**
 * build_lambda.js
 *
 * Packages the backend into terraform/lambda_payload.zip for Lambda deployment.
 *
 * Strategy:
 * - Reads only the top-level node_modules entries (production deps only).
 * - Resolves pnpm symlinks to their real paths in the content-addressable store.
 * - Writes a valid ZIP file directly using Node.js zlib (no PowerShell, no external tools).
 *
 * Usage: node terraform/build_lambda.js
 */

"use strict";

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const backendDir = path.resolve(__dirname, "..");
const zipPath = path.join(__dirname, "lambda_payload.zip");

// Dev-only packages to exclude from node_modules
const DEV_DEPS = new Set(["supertest"]);

// ─── CRC-32 table ──────────────────────────────────────────────────────────
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[i] = c;
}
function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

// ─── ZIP writer ─────────────────────────────────────────────────────────────
const fd = fs.openSync(zipPath, "w");
let offset = 0;
const centralDir = [];

function writeBytes(buf) {
  fs.writeSync(fd, buf, 0, buf.length, offset);
  offset += buf.length;
}
function writeU16(n) { const b=Buffer.alloc(2); b.writeUInt16LE(n); writeBytes(b); }
function writeU32(n) { const b=Buffer.alloc(4); b.writeUInt32LE(n>>>0); writeBytes(b); }

function addFile(absPath, zipEntry) {
  let content;
  try { content = fs.readFileSync(absPath); }
  catch { return; }

  const compressed = zlib.deflateRawSync(content, { level: 6 });
  const crc = crc32(content);
  const fileNameBuf = Buffer.from(zipEntry, "utf8");
  const localOffset = offset;

  writeBytes(Buffer.from([0x50,0x4b,0x03,0x04]));
  writeU16(20); writeU16(0x0808); writeU16(8);
  writeU16(0); writeU16(0);
  writeU32(crc); writeU32(compressed.length); writeU32(content.length);
  writeU16(fileNameBuf.length); writeU16(0);
  writeBytes(fileNameBuf);
  writeBytes(compressed);

  centralDir.push({ fileName: zipEntry, localOffset, crc32: crc,
    compressedSize: compressed.length, uncompressedSize: content.length });
}

function walk(absDir, zipBase) {
  let entries;
  try { entries = fs.readdirSync(absDir, { withFileTypes: true }); }
  catch { return; }

  for (const e of entries) {
    const abs = path.join(absDir, e.name);
    const zipEntry = `${zipBase}/${e.name}`;
    let target = abs;
    let stat;
    try {
      stat = fs.statSync(abs);
      if (e.isSymbolicLink()) { target = fs.realpathSync(abs); stat = fs.statSync(target); }
    } catch { continue; }

    if (stat.isDirectory()) walk(target, zipEntry);
    else if (stat.isFile()) addFile(target, zipEntry);
  }
}

// ─── Build file list ────────────────────────────────────────────────────────

console.log("=== Building Lambda Deployment Package ===");
console.log(`Backend : ${backendDir}`);
console.log(`Output  : ${zipPath}`);

// 1. Add src/
console.log("\n[1/3] Adding src/...");
walk(path.join(backendDir, "src"), "src");

// 2. Add package.json
console.log("[2/3] Adding package.json...");
addFile(path.join(backendDir, "package.json"), "package.json");

// 3. Add node_modules (production only, resolved from pnpm symlinks)
console.log("[3/3] Adding node_modules (production deps only)...");

const nmDir = path.join(backendDir, "node_modules");
const topEntries = fs.readdirSync(nmDir, { withFileTypes: true });

for (const e of topEntries) {
  if (e.name.startsWith(".")) continue; // skip .pnpm, .modules.yaml, etc.

  if (e.name.startsWith("@")) {
    // Scoped package namespace — iterate children
    const scopeDir = path.join(nmDir, e.name);
    let scopeStat;
    try {
      scopeStat = fs.statSync(scopeDir);
      if (e.isSymbolicLink()) {
        const real = fs.realpathSync(scopeDir);
        scopeStat = fs.statSync(real);
      }
    } catch { continue; }

    const scopeEntries = fs.readdirSync(scopeDir, { withFileTypes: true });
    for (const se of scopeEntries) {
      const abs = path.join(scopeDir, se.name);
      const zipBase = `node_modules/${e.name}/${se.name}`;
      let target = abs;
      try {
        if (se.isSymbolicLink()) target = fs.realpathSync(abs);
        const stat = fs.statSync(target);
        if (stat.isDirectory()) {
          process.stdout.write(`  Resolving ${e.name}/${se.name}...\n`);
          walk(target, zipBase);
        }
      } catch { continue; }
    }
  } else {
    // Unscoped package
    if (DEV_DEPS.has(e.name)) { console.log(`  Skipping devDep: ${e.name}`); continue; }

    const abs = path.join(nmDir, e.name);
    let target = abs;
    try {
      if (e.isSymbolicLink()) target = fs.realpathSync(abs);
      const stat = fs.statSync(target);
      if (stat.isDirectory()) {
        process.stdout.write(`  Resolving ${e.name}...\n`);
        walk(target, `node_modules/${e.name}`);
      } else if (stat.isFile()) {
        addFile(target, `node_modules/${e.name}`);
      }
    } catch { continue; }
  }
}

// ─── Write central directory + EOCD ─────────────────────────────────────────
const cdStart = offset;
for (const e of centralDir) {
  const fileNameBuf = Buffer.from(e.fileName, "utf8");
  writeBytes(Buffer.from([0x50,0x4b,0x01,0x02]));
  writeU16(20); writeU16(20); writeU16(0x0808); writeU16(8);
  writeU16(0); writeU16(0);
  writeU32(e.crc32); writeU32(e.compressedSize); writeU32(e.uncompressedSize);
  writeU16(fileNameBuf.length); writeU16(0); writeU16(0);
  writeU16(0); writeU16(0); writeU32(0); writeU32(e.localOffset);
  writeBytes(fileNameBuf);
}
const cdSize = offset - cdStart;

writeBytes(Buffer.from([0x50,0x4b,0x05,0x06]));
writeU16(0); writeU16(0);
writeU16(centralDir.length); writeU16(centralDir.length);
writeU32(cdSize); writeU32(cdStart); writeU16(0);

fs.closeSync(fd);

const sizeMB = (fs.statSync(zipPath).size / 1024 / 1024).toFixed(2);
console.log(`\n✅  Done! ${centralDir.length} files | ${sizeMB} MB`);
console.log(`   ${zipPath}`);
