import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

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

async function checkUserAndRest() {
  const userDoc = await getDoc(doc(db, 'users', 'fNtIEiakaJRzz9USQ2RHdmc2FPl2'));
  console.log('User doc:', userDoc.exists() ? userDoc.data() : 'Not found');

  const restDoc = await getDoc(doc(db, 'restaurants', 'jy1PbeHtzCDlaxdXL5on'));
  console.log('Restaurant doc:', restDoc.exists() ? restDoc.data() : 'Not found');

  const subDoc = await getDoc(doc(db, 'subscriptions', 'jy1PbeHtzCDlaxdXL5on'));
  console.log('Subscription doc:', subDoc.exists() ? subDoc.data() : 'Not found');

  process.exit(0);
}

checkUserAndRest();
