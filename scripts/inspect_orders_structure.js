import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, limit, query } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBJiICeW-yBBH8vRA4DSVus6ndrwQMFrys",
  authDomain: "ikiri-5325e.firebaseapp.com",
  projectId: "ikiri-5325e",
  storageBucket: "ikiri-5325e.firebasestorage.app",
  messagingSenderId: "25723571190",
  appId: "1:25723571190:web:b6c2eca99e618a3df195d7"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function inspectSampleOrders() {
  const q = query(collection(db, 'backup', 'jy1PbeHtzCDlaxdXL5on', 'orders'), limit(5));
  const snap = await getDocs(q);
  snap.forEach(d => {
    console.log('Doc ID:', d.id);
    console.log('Doc Data:', JSON.stringify(d.data(), null, 2));
  });

  // Also check if there are daily_summaries or anything else in restaurants/jy1PbeHtzCDlaxdXL5on
  const summaries = await getDocs(collection(db, 'restaurants', 'jy1PbeHtzCDlaxdXL5on', 'daily_summaries'));
  console.log('Daily summaries count:', summaries.size);

  process.exit(0);
}

inspectSampleOrders();
