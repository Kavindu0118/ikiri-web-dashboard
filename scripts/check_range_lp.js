import { initializeApp } from 'firebase/app';
import { initializeFirestore, collection, getDocs } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBJiICeW-yBBH8vRA4DSVus6ndrwQMFrys",
  authDomain: "ikiri-5325e.firebaseapp.com",
  projectId: "ikiri-5325e",
  storageBucket: "ikiri-5325e.firebasestorage.app",
  messagingSenderId: "25723571190",
  appId: "1:25723571190:web:b6c2eca99e618a3df195d7"
};

const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
});
const restaurantId = 'jy1PbeHtzCDlaxdXL5on';

async function checkRange() {
  const snap = await getDocs(collection(db, 'backup', restaurantId, 'orders'));
  const dates = [];
  const ids = [];

  snap.forEach(d => {
    const data = d.data();
    if (data.createdAt) dates.push(data.createdAt);
    if (data.id) ids.push(Number(data.id) || 0);
  });

  dates.sort();
  console.log(`Orders count: ${snap.size}`);
  console.log(`Min date: ${dates[0]}`);
  console.log(`Max date: ${dates[dates.length - 1]}`);
  console.log(`Min ID: ${Math.min(...ids)}, Max ID: ${Math.max(...ids)}`);

  process.exit(0);
}

checkRange().catch(err => {
  console.error(err);
  process.exit(1);
});
