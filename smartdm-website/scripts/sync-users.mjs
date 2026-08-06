import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const customServiceAccountPath = process.argv[2];

function initAdmin() {
  if (getApps().length > 0) return;
  const keyEnv = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  const credPath = customServiceAccountPath || process.env.GOOGLE_APPLICATION_CREDENTIALS || './service-account.json';

  if (keyEnv) {
    try {
      initializeApp({ credential: cert(JSON.parse(keyEnv)) });
      return;
    } catch (e) {}
  }

  const resolvedPath = resolve(process.cwd(), credPath);
  if (existsSync(resolvedPath)) {
    initializeApp({ credential: cert(JSON.parse(readFileSync(resolvedPath, 'utf8'))) });
    return;
  }
  
  initializeApp();
}

async function main() {
  try {
    initAdmin();
    const auth = getAuth();
    const db = getFirestore();
    
    console.log('Fetching all users from Firebase Auth...');
    const listUsersResult = await auth.listUsers(1000);
    const users = listUsersResult.users;
    console.log(`Found ${users.length} users.`);

    let adminFound = false;

    for (const user of users) {
      const isTargetAdmin = user.email === 'ifahad2k@gmail.com';
      if (isTargetAdmin) adminFound = true;

      const userRef = db.collection('users').doc(user.uid);
      
      const profileData = {
        uid: user.uid,
        email: user.email || null,
        displayName: user.displayName || (user.email ? user.email.split('@')[0] : 'User'),
        photoURL: user.photoURL || null,
        isAdmin: isTargetAdmin,
        emailVerified: user.emailVerified,
        role: isTargetAdmin ? 'Admin' : 'User',
        updatedAt: new Date().toISOString(),
      };

      await userRef.set(profileData, { merge: true });
      console.log(`Synced user: ${user.email || user.uid} (Admin: ${isTargetAdmin})`);
    }

    if (!adminFound) {
      console.log('\x1b[33mWarning: ifahad2k@gmail.com was not found in the auth list. Did you sign up with a different email?\x1b[0m');
    }

    console.log('\x1b[32mSuccessfully synced all users to Firestore!\x1b[0m');
  } catch (error) {
    console.error('\x1b[31mSync failed:\x1b[0m', error);
    process.exit(1);
  }
}

main();
