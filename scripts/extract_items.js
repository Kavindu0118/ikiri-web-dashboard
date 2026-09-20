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

async function checkOtherMenu() {
  const menuDoc = await getDoc(doc(db, 'restaurants', 'whjz02BsCugky7Z7F18y', 'menu', 'current'));
  if (menuDoc.exists()) {
    console.log('Cafe 98 Menu data:', JSON.stringify(menuDoc.data(), null, 2));
  } else {
    console.log('Cafe 98 Menu doc does not exist');
  }

  // Also extract all unique items from jy1PbeHtzCDlaxdXL5on backup orders
  const backupOrders = await getDocs(collection(db, 'backup', 'jy1PbeHtzCDlaxdXL5on', 'orders'));
  const itemsMap = new Map();
  backupOrders.forEach(d => {
    const ord = d.data();
    if (Array.isArray(ord.items)) {
      ord.items.forEach(it => {
        if (!it.name) return;
        const key = it.name.trim();
        if (!itemsMap.has(key)) {
          itemsMap.set(key, {
            name: key,
            prices: new Set(),
            categories: new Set(),
            itemIds: new Set(),
            notes: new Set(),
            count: 0
          });
        }
        const record = itemsMap.get(key);
        record.count += (it.qty || 1);
        if (it.price !== undefined) record.prices.add(it.price);
        if (it.category) record.categories.add(it.category);
        if (it.itemId) record.itemIds.add(it.itemId);
        if (it.specialNotes) record.notes.add(it.specialNotes);
      });
    }
  });

  console.log(`\nFound ${itemsMap.size} unique items in backup orders:`);
  itemsMap.forEach((val, key) => {
    console.log(`- ${key}: prices=[${Array.from(val.prices).join(', ')}], categories=[${Array.from(val.categories).join(', ')}], itemIds=[${Array.from(val.itemIds).join(', ')}], totalOrderedQty=${val.count}`);
  });

  process.exit(0);
}

checkOtherMenu().catch(err => {
  console.error(err);
  process.exit(1);
});
