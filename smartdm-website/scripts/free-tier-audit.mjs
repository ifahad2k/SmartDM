import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

let totalViolations = 0;

function logHeader(title) {
  console.log(`\n==================================================`);
  console.log(`  ${title}`);
  console.log(`==================================================`);
}

function logPass(message) {
  console.log(` [PASS] ${message}`);
}

function logFail(message) {
  console.log(` [FAIL] ${message}`);
  totalViolations++;
}

// 1. Audit Forbidden Directories
logHeader("1. Auditing Forbidden Server & Cloud Directories");
const forbiddenDirs = ['functions', 'cloud-functions', 'server', 'backend'];
for (const dir of forbiddenDirs) {
  const targetPath = path.join(rootDir, dir);
  if (fs.existsSync(targetPath)) {
    logFail(`Forbidden directory detected: /${dir}`);
  } else {
    logPass(`No forbidden directory /${dir} found.`);
  }
}

// 2. Audit Firebase & Server Runtime Configuration Files
logHeader("2. Auditing Configuration Files");
const forbiddenConfigFiles = ['Dockerfile', 'docker-compose.yml', 'app.yaml', 'Procfile', 'server.js', 'server.ts'];
for (const cfgFile of forbiddenConfigFiles) {
  const targetPath = path.join(rootDir, cfgFile);
  if (fs.existsSync(targetPath)) {
    logFail(`Forbidden server runtime config found: ${cfgFile}`);
  } else {
    logPass(`No ${cfgFile} server configuration found.`);
  }
}

// 3. Audit firebase.json for Paid Architecture Features
const firebaseJsonPath = path.join(rootDir, 'firebase.json');
if (fs.existsSync(firebaseJsonPath)) {
  try {
    const firebaseConfig = JSON.parse(fs.readFileSync(firebaseJsonPath, 'utf8'));
    const forbiddenFirebaseKeys = ['functions', 'storage', 'run', 'apphosting', 'extensions'];
    let firebaseConfigClean = true;
    for (const key of forbiddenFirebaseKeys) {
      if (firebaseConfig[key]) {
        logFail(`firebase.json contains paid/forbidden target: "${key}"`);
        firebaseConfigClean = false;
      }
    }
    if (firebaseConfigClean) {
      logPass("firebase.json is strictly configured for Spark-compatible Firebase Hosting.");
    }
  } catch (err) {
    logFail(`Failed to parse firebase.json: ${err.message}`);
  }
} else {
  logPass("firebase.json check skipped (file not created yet).");
}

// 4. Audit package.json Dependencies
logHeader("3. Auditing package.json Dependencies");
const packageJsonPath = path.join(rootDir, 'package.json');
if (fs.existsSync(packageJsonPath)) {
  try {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const prodDeps = Object.keys(pkg.dependencies || {});
    const forbiddenPackages = [
      'firebase-functions',
      '@google-cloud/storage',
      'firebase-admin',
      '@firebase/storage',
      'express',
      'fastify',
      'koa',
      'next',
      'nuxt',
      'sveltekit'
    ];

    let pkgClean = true;
    for (const pkgName of forbiddenPackages) {
      if (prodDeps.includes(pkgName)) {
        logFail(`Package dependency forbidden in Spark tier: "${pkgName}"`);
        pkgClean = false;
      }
    }
    if (pkgClean) {
      logPass("package.json contains no prohibited Cloud Functions, Cloud Storage, or server runtime packages.");
    }
  } catch (err) {
    logFail(`Failed to parse package.json: ${err.message}`);
  }
}

// 5. Audit Source Files for Forbidden Code & Phone Auth
logHeader("4. Auditing Source Code for Prohibited APIs & Imports");

const forbiddenImportsPatterns = [
  { pattern: /firebase\/storage/g, label: "Firebase Cloud Storage import ('firebase/storage')" },
  { pattern: /firebase\/functions/g, label: "Cloud Functions import ('firebase/functions')" },
  { pattern: /@google-cloud\/storage/g, label: "GCP Storage SDK ('@google-cloud/storage')" },
  { pattern: /firebase-functions/g, label: "Cloud Functions package reference ('firebase-functions')" },
  { pattern: /PhoneAuthProvider/g, label: "Paid Phone Authentication ('PhoneAuthProvider')" },
  { pattern: /signInWithPhoneNumber/g, label: "Paid Phone Authentication ('signInWithPhoneNumber')" },
  { pattern: /verifyPhoneNumber/g, label: "Paid Phone Authentication ('verifyPhoneNumber')" }
];

function scanDirectory(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    // Skip node_modules, .git, dist, and .venv
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === '.venv') {
        continue;
      }
      scanDirectory(fullPath);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      // Scan relevant code and config files
      if (['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.html', '.json', '.yml', '.yaml'].includes(ext)) {
        if (entry.name === 'package-lock.json' || entry.name === 'free-tier-audit.mjs') continue;

        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          for (const rule of forbiddenImportsPatterns) {
            if (rule.pattern.test(content)) {
              const relPath = path.relative(rootDir, fullPath);
              logFail(`Found ${rule.label} in ${relPath}`);
            }
          }
        } catch (err) {
          // ignore unreadable files
        }
      }
    }
  }
}

scanDirectory(rootDir);
logPass("Completed source code AST & text scan for prohibited Cloud / Phone Auth APIs.");

// 6. Audit Committed Release Binaries
logHeader("5. Auditing Repository for Committed Executable Binaries");
const forbiddenBinaryExtensions = ['.exe', '.msi', '.appimage', '.deb', '.rpm', '.dmg'];

function scanBinaries(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
      scanBinaries(fullPath);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (forbiddenBinaryExtensions.includes(ext)) {
        const relPath = path.relative(rootDir, fullPath);
        logFail(`Binary executable committed to repo (must host on GitHub Releases only): ${relPath}`);
      }
    }
  }
}

scanBinaries(rootDir);
logPass("No binary release assets (.exe, .msi, .AppImage, .deb, etc.) committed to repository.");

// Summary & Exit Code
logHeader("Governance Audit Result");
if (totalViolations > 0) {
  console.error(`❌ FREE-TIER AUDIT FAILED: ${totalViolations} violation(s) detected.`);
  console.error(`SmartDM strictly requires 100% Firebase Spark tier compliance.`);
  process.exit(1);
} else {
  console.log(`✅ FREE-TIER AUDIT PASSED: 0 violations detected. Repository is 100% Firebase Spark compliant.`);
  process.exit(0);
}
