import * as admin from 'firebase-admin';

function getApp() {
  if (admin.apps.length) return admin.app();
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(serviceAccount))
    });
  } else {
    // Fallback: try default credentials if available
    admin.initializeApp();
  }
  return admin.app();
}

export const firebaseAdmin = getApp();
export const authAdmin = firebaseAdmin.auth();
