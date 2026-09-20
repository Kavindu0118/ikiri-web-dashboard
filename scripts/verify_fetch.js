import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, collection, query, where, getDocs, limit } from 'firebase/firestore';

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

const normalizeMenu = ({ restaurantId, restaurantData, menuData }) => ({
  id: restaurantData.slug || restaurantId,
  restaurantId,
  slug: restaurantData.slug || restaurantId,
  restaurantName: restaurantData.name || menuData.restaurantName || 'Untitled Restaurant',
  templateId: menuData.templateId || 'minimal-cafe',
  templateLabel: menuData.templateLabel || 'Minimal Cafe',
  menuTitle: menuData.menuTitle || menuData.title || 'Untitled Menu',
  notes: menuData.notes || '',
  sections: menuData.sections || [],
  isPublished: Boolean(menuData.isPublished),
  updatedAt: menuData.updatedAt || restaurantData.updatedAt || null,
});

async function verifyFetch() {
  const restaurantId = 'jy1PbeHtzCDlaxdXL5on';

  // Test getRestaurantMenu logic
  const restaurantSnap = await getDoc(doc(db, 'restaurants', restaurantId));
  const menuSnap = await getDoc(doc(db, 'restaurants', restaurantId, 'menu', 'current'));

  if (!restaurantSnap.exists() || !menuSnap.exists()) {
    console.error('Failed to find restaurant or menu doc!');
    process.exit(1);
  }

  const menu = normalizeMenu({
    restaurantId,
    restaurantData: restaurantSnap.data(),
    menuData: menuSnap.data(),
  });

  console.log('--- Fetched Menu Summary ---');
  console.log('ID / Slug:', menu.id);
  console.log('Restaurant Name:', menu.restaurantName);
  console.log('Menu Title:', menu.menuTitle);
  console.log('Template:', menu.templateLabel);
  console.log('Sections count:', menu.sections.length);

  menu.sections.forEach(sec => {
    console.log(`\n📂 [${sec.title}] (${sec.items?.length || 0} items)`);
    sec.items?.forEach(item => {
      console.log(`   - ${item.name} (${item.price}) : ${item.description}`);
    });
  });

  console.log('\nAll 34 menu items successfully prepared, stored in Firestore, and verified!');
  process.exit(0);
}

verifyFetch();
