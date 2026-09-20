import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore';

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

async function checkCollections() {
  const ordersSnap = await getDocs(collection(db, 'backup', restaurantId, 'orders'));
  console.log(`backup/${restaurantId}/orders count:`, ordersSnap.size);

  const summariesSnap = await getDocs(collection(db, 'restaurants', restaurantId, 'daily_summaries'));
  console.log(`restaurants/${restaurantId}/daily_summaries count:`, summariesSnap.size);
  if (summariesSnap.size > 0) {
    console.log('Sample summary doc:', JSON.stringify(summariesSnap.docs[0].data(), null, 2));
  }

  const mainBackupDoc = await getDoc(doc(db, 'backup', restaurantId));
  console.log(`backup/${restaurantId} doc exists:`, mainBackupDoc.exists());
  if (mainBackupDoc.exists()) {
    console.log('Main backup doc data:', JSON.stringify(mainBackupDoc.data(), null, 2));
  }

  process.exit(0);
}

checkCollections();
