import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

/**
 * Bootstrap Admin Script for SmartDM
 * Grants custom claim { admin: true } to a targeted user email.
 * 
 * Usage:
 *   node scripts/bootstrap-admin.mjs <user-email> [path-to-service-account.json]
 * Example:
 *   node scripts/bootstrap-admin.mjs admin@smartdm.org
 */

const targetEmail = process.argv[2];
const customServiceAccountPath = process.argv[3];

if (!targetEmail) {
  console.error('\x1b[31mError: Target user email address is required.\x1b[0m');
  console.log('\nUsage:');
  console.log('  node scripts/bootstrap-admin.mjs <user-email> [path-to-service-account.json]\n');
  process.exit(1);
}

function initAdmin() {
  if (getApps().length > 0) return;

  const keyEnv = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  const credPath = customServiceAccountPath || process.env.GOOGLE_APPLICATION_CREDENTIALS || './service-account.json';

  if (keyEnv) {
    try {
      const serviceAccount = JSON.parse(keyEnv);
      initializeApp({ credential: cert(serviceAccount) });
      return;
    } catch (e) {
      console.warn('Warning: Could not parse FIREBASE_SERVICE_ACCOUNT_KEY env var.');
    }
  }

  const resolvedPath = resolve(process.cwd(), credPath);
  if (existsSync(resolvedPath)) {
    try {
      const raw = readFileSync(resolvedPath, 'utf8');
      const serviceAccount = JSON.parse(raw);
      initializeApp({ credential: cert(serviceAccount) });
      return;
    } catch (e) {
      console.warn(`Warning: Could not read service account at ${resolvedPath}`);
    }
  }

  // Fallback default initialization (e.g. Google Cloud Environment / Firebase Emulator)
  try {
    initializeApp();
  } catch (e) {
    console.error('\x1b[31mFailed to initialize Firebase Admin SDK. Please provide service account credentials via environment variable FIREBASE_SERVICE_ACCOUNT_KEY or GOOGLE_APPLICATION_CREDENTIALS file.\x1b[0m');
    process.exit(1);
  }
}

async function main() {
  try {
    initAdmin();
    const auth = getAuth();
    
    console.log(`Searching for user with email: ${targetEmail}...`);
    const user = await auth.getUserByEmail(targetEmail);

    const existingClaims = user.customClaims || {};
    const updatedClaims = { ...existingClaims, admin: true };

    await auth.setCustomUserClaims(user.uid, updatedClaims);

    console.log('\x1b[32m%s\x1b[0m', 'Successfully granted admin custom claim!');
    console.log(`User UID: ${user.uid}`);
    console.log(`Email:    ${user.email}`);
    console.log(`Claims:   ${JSON.stringify(updatedClaims, null, 2)}`);
    console.log('\nNote: Target user must re-authenticate or force token refresh (getIdTokenResult(true)) for changes to reflect.');
  } catch (error) {
    console.error('\x1b[31mBootstrap admin script failed:\x1b[0m', error.message || error);
    process.exit(1);
  }
}

main();
