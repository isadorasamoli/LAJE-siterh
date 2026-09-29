import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));

const app = initializeApp({
  projectId: config.projectId,
  apiKey: config.apiKey,
  authDomain: config.authDomain,
});

const db = getFirestore(app, config.firestoreDatabaseId);

async function check() {
  try {
    const snap = await getDocs(collection(db, 'responses'));
    console.log(`=== TOTAL RESPONSES: ${snap.size} ===`);
    snap.docs.forEach((d, idx) => {
      const data = d.data();
      console.log(`[${idx + 1}] ID: ${d.id}`);
      console.log(`    Name: "${data.name}"`);
      console.log(`    Email: "${data.email}"`);
      console.log(`    Role: "${data.leagueRole}"`);
      console.log(`    Status: "${data.status}"`);
      console.log(`    UserId: "${data.userId}"`);
      console.log(`    CreatedAt: ${new Date(data.createdAt).toISOString()}`);
    });

    console.log('\n=== AUDIT LOGS ===');
    const auditSnap = await getDocs(collection(db, 'audit_logs'));
    console.log(`Total Audit Logs: ${auditSnap.size}`);
    auditSnap.docs.forEach((d, idx) => {
      const data = d.data();
      console.log(`[Log ${idx + 1}] Action: ${data.action} | Target: ${data.targetMemberName} (${data.targetMemberEmail}) | By: ${data.performedByEmail}`);
      console.log(`    Details: ${data.details}`);
      console.log(`    PreviousValue: ${data.previousValue || ''}`);
    });
  } catch (err) {
    console.error('Error fetching:', err);
  }
}

check();
