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

async function inspect() {
  console.log('--- Checking restaurant doc: jy1PbeHtzCDlaxdXL5on ---');
  const restDoc = await getDoc(doc(db, 'restaurants', 'jy1PbeHtzCDlaxdXL5on'));
  if (restDoc.exists()) {
    console.log('Restaurant data:', JSON.stringify(restDoc.data(), null, 2));
  } else {
    console.log('Restaurant doc does not exist');
  }

  console.log('--- Checking current menu: restaurants/jy1PbeHtzCDlaxdXL5on/menu/current ---');
  const menuDoc = await getDoc(doc(db, 'restaurants', 'jy1PbeHtzCDlaxdXL5on', 'menu', 'current'));
  if (menuDoc.exists()) {
    console.log('Menu data:', JSON.stringify(menuDoc.data(), null, 2));
  } else {
    console.log('Menu doc does not exist');
  }

  console.log('--- Checking backup collections for jy1PbeHtzCDlaxdXL5on ---');
  const backupDoc = await getDoc(doc(db, 'backup', 'jy1PbeHtzCDlaxdXL5on'));
  if (backupDoc.exists()) {
    console.log('Backup doc data keys:', Object.keys(backupDoc.data()));
    console.log('Backup doc data sample:', JSON.stringify(backupDoc.data()).slice(0, 1000));
  } else {
    console.log('Backup doc does not exist');
  }

  const backupOrdersCol = await getDocs(collection(db, 'backup', 'jy1PbeHtzCDlaxdXL5on', 'orders'));
  console.log(`backup/jy1PbeHtzCDlaxdXL5on/orders count: ${backupOrdersCol.size}`);
  if (backupOrdersCol.size > 0) {
    const sample = backupOrdersCol.docs[0].data();
    console.log('Sample order from backup/orders:', JSON.stringify(sample, null, 2));
  }

  const restOrdersCol = await getDocs(collection(db, 'restaurants', 'jy1PbeHtzCDlaxdXL5on', 'orders'));
  console.log(`restaurants/jy1PbeHtzCDlaxdXL5on/orders count: ${restOrdersCol.size}`);

  // Also check top-level backup collection docs
  const backupAll = await getDocs(collection(db, 'backup'));
  console.log(`Top level backup collection doc count: ${backupAll.size}`);
  backupAll.forEach(d => console.log('backup doc ID:', d.id));

  // Also check top-level restaurants
  const restAll = await getDocs(collection(db, 'restaurants'));
  console.log(`Top level restaurants collection doc count: ${restAll.size}`);
  restAll.forEach(d => console.log('restaurant doc ID:', d.id, d.data().name, d.data().slug));

  process.exit(0);
}

inspect().catch(err => {
  console.error('Inspect error:', err);
  process.exit(1);
});
