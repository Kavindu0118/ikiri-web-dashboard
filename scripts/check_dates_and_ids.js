import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

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
const restaurantId = 'jy1PbeHtzCDlaxdXL5on';

async function checkDateRangeAndIds() {
  const snap = await getDocs(collection(db, 'backup', restaurantId, 'orders'));
  const dates = [];
  const ids = [];
  const itemIds = [];

  snap.forEach(d => {
    const data = d.data();
    if (data.createdAt) dates.push(data.createdAt);
    if (data.id) ids.push(Number(data.id) || 0);
    if (Array.isArray(data.items)) {
      data.items.forEach(it => {
        if (it.id) itemIds.push(Number(it.id) || 0);
      });
    }
  });

  dates.sort();
  console.log(`Orders count: ${snap.size}`);
  console.log(`Min date: ${dates[0]}`);
  console.log(`Max date: ${dates[dates.length - 1]}`);
  console.log(`Min ID: ${Math.min(...ids)}, Max ID: ${Math.max(...ids)}`);
  console.log(`Min Item ID: ${Math.min(...itemIds)}, Max Item ID: ${Math.max(...itemIds)}`);

  process.exit(0);
}

checkDateRangeAndIds();
