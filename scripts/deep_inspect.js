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

async function deepInspectItems() {
  const snapshot = await getDocs(collection(db, 'backup', 'jy1PbeHtzCDlaxdXL5on', 'orders'));
  const allFields = new Set();
  const itemMap = {};

  snapshot.forEach(docSnap => {
    const data = docSnap.data();
    if (Array.isArray(data.items)) {
      data.items.forEach(it => {
        Object.keys(it).forEach(k => allFields.add(k));
        const name = (it.name || '').trim();
        if (!name) return;
        if (!itemMap[name]) {
          itemMap[name] = {
            sample: it,
            distinctPrices: new Set(),
            distinctNotes: new Set(),
            distinctCategories: new Set(),
            count: 0
          };
        }
        itemMap[name].count += (it.qty || 1);
        if (it.price !== undefined) itemMap[name].distinctPrices.add(it.price);
        if (it.category) itemMap[name].distinctCategories.add(it.category);
        if (it.specialNotes) itemMap[name].distinctNotes.add(it.specialNotes);
      });
    }
  });

  console.log('All Item field keys across all orders:', Array.from(allFields));
  console.log('\nDetailed Items Summary:');
  Object.keys(itemMap).sort().forEach(name => {
    const info = itemMap[name];
    console.log(`- ${name}: itemId=${info.sample.itemId}, price=${Array.from(info.distinctPrices).join('/')}, ordered=${info.count} times, notes=${Array.from(info.distinctNotes).slice(0, 3).join('; ')}`);
  });

  process.exit(0);
}

deepInspectItems();
