import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, writeBatch, Timestamp } from 'firebase/firestore';

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

// Item prices in LKR
const ITEM_PRICES_LKR = {
  "Margherita Pizza": 4350.00,
  "Pepperoni Supreme": 5100.00,
  "BBQ Chicken Pizza": 5550.00,
  "Truffle Mushroom Pizza": 5850.00,
  "Quattro Formaggi": 4950.00,

  "Classic Cheeseburger": 3750.00,
  "Crispy Fried Chicken Burger": 3450.00,
  "Double Smash Beef Burger": 4500.00,
  "Steak & Caramelized Onion Sandwich": 4950.00,
  "Veggie Avocado Club": 3600.00,

  "Creamy Pasta Carbonara": 4650.00,
  "Seafood Marinara Linguine": 5550.00,
  "Penne Arrabbiata": 4050.00,
  "Grilled Ribeye Steak (250g)": 8550.00,
  "Pan-Seared Atlantic Salmon": 7200.00,

  "Crispy Truffle Fries": 1950.00,
  "Spicy Buffalo Chicken Wings": 2850.00,
  "Garlic Butter Herb Bread": 1650.00,
  "Calamari Fritti": 3150.00,
  "Classic Caesar Salad": 2550.00,

  "Authentic Tiramisu": 2250.00,
  "New York Cheesecake": 2400.00,
  "Warm Chocolate Lava Cake": 2550.00,
  "Artisan Gelato Trio": 1800.00,

  "Single Origin Espresso": 1140.00,
  "Iced Vanilla Latte": 1440.00,
  "San Pellegrino Sparkling (500ml)": 1050.00,
  "Tropical Mango Smoothie": 1950.00,
  "Craft IPA Draught Beer": 2250.00,
  "Passionfruit Mojito": 2850.00,
  "Aperol Spritz": 3300.00,

  "Surfboard Full Day Rental": 7500.00,
  "Stand-Up Paddleboard 2hr": 6000.00,
  "Private Surf Lesson 1hr": 13500.00
};

async function updateOrdersAndSummaries() {
  console.log('Fetching all backup orders...');
  const ordersSnap = await getDocs(collection(db, 'backup', restaurantId, 'orders'));
  console.log(`Found ${ordersSnap.size} orders to update.`);

  const dailySummariesMap = {};

  const updatedOrders = [];

  ordersSnap.forEach((docSnap) => {
    const orderData = docSnap.data();
    const items = Array.isArray(orderData.items) ? orderData.items : [];

    let grossItemsSubtotal = 0;
    let totalDiscounts = 0;
    let totalItemsSold = 0;

    const updatedItems = items.map((item) => {
      const name = (item.name || '').trim();
      const lkrPrice = ITEM_PRICES_LKR[name] || (item.price ? Number(item.price) * 300 : 0);
      const qty = item.qty || 1;
      totalItemsSold += qty;

      let discountAmount = 0;
      const discountType = (item.discountType || '').toUpperCase();
      const discountVal = Number(item.discountValue || 0);

      if (discountType === 'PERCENTAGE' && discountVal > 0) {
        discountAmount = Number(((lkrPrice * qty * discountVal) / 100).toFixed(2));
      } else if (item.discountAmount) {
        discountAmount = Number((Number(item.discountAmount) * 300).toFixed(2));
      }

      grossItemsSubtotal += (lkrPrice * qty);
      totalDiscounts += discountAmount;

      return {
        ...item,
        price: lkrPrice,
        discountAmount: discountAmount
      };
    });

    const netSubtotal = grossItemsSubtotal - totalDiscounts;
    const serviceFeeRate = Number(orderData.serviceFeeRate || 0);
    const cardFeeRate = Number(orderData.cardFeeRate || 0);

    const serviceFeeAmount = Number((netSubtotal * serviceFeeRate).toFixed(2));
    const cardFeeAmount = Number(((netSubtotal + serviceFeeAmount) * cardFeeRate).toFixed(2));
    const total = Number((netSubtotal + serviceFeeAmount + cardFeeAmount).toFixed(2));

    const updatedOrder = {
      ...orderData,
      items: updatedItems,
      serviceFeeAmount,
      cardFeeAmount,
      total,
      currency: 'LKR'
    };

    updatedOrders.push({
      ref: docSnap.ref,
      id: docSnap.id,
      data: updatedOrder
    });

    // Aggregate daily summaries
    const createdAtStr = String(orderData.createdAt || '');
    const dateKey = createdAtStr.split('T')[0];
    if (dateKey && /^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      if (!dailySummariesMap[dateKey]) {
        dailySummariesMap[dateKey] = {
          date: dateKey,
          grossRevenue: 0,
          totalDiscounts: 0,
          totalServiceFees: 0,
          totalCardFees: 0,
          netRevenue: 0,
          cashTotal: 0,
          cashlessTotal: 0,
          totalItemsSold: 0,
          totalOrdersCount: 0,
          updatedAt: Timestamp.now()
        };
      }
      const summary = dailySummariesMap[dateKey];
      summary.grossRevenue += grossItemsSubtotal;
      summary.totalDiscounts += totalDiscounts;
      summary.totalServiceFees += serviceFeeAmount;
      summary.totalCardFees += cardFeeAmount;
      summary.netRevenue += total;
      summary.totalItemsSold += totalItemsSold;
      summary.totalOrdersCount += 1;

      const pMethod = (orderData.paymentMethod || '').toUpperCase();
      if (pMethod === 'CASH') {
        summary.cashTotal += total;
      } else {
        summary.cashlessTotal += total;
      }
    }
  });

  // Batch update orders (batches of 400)
  console.log(`Writing ${updatedOrders.length} updated orders in batches...`);
  const CHUNK_SIZE = 400;
  for (let i = 0; i < updatedOrders.length; i += CHUNK_SIZE) {
    const chunk = updatedOrders.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    chunk.forEach((item) => {
      batch.set(item.ref, item.data, { merge: true });
    });
    await batch.commit();
    console.log(`Committed batch ${Math.floor(i / CHUNK_SIZE) + 1} (${chunk.length} orders)`);
  }

  // Batch update daily summaries
  const dateKeys = Object.keys(dailySummariesMap);
  console.log(`Writing ${dateKeys.length} daily summaries in batches...`);
  for (let i = 0; i < dateKeys.length; i += CHUNK_SIZE) {
    const chunkKeys = dateKeys.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    chunkKeys.forEach((key) => {
      const summary = dailySummariesMap[key];
      // round summary values
      summary.grossRevenue = Number(summary.grossRevenue.toFixed(2));
      summary.totalDiscounts = Number(summary.totalDiscounts.toFixed(2));
      summary.totalServiceFees = Number(summary.totalServiceFees.toFixed(2));
      summary.totalCardFees = Number(summary.totalCardFees.toFixed(2));
      summary.netRevenue = Number(summary.netRevenue.toFixed(2));
      summary.cashTotal = Number(summary.cashTotal.toFixed(2));
      summary.cashlessTotal = Number(summary.cashlessTotal.toFixed(2));

      const summaryRef = doc(db, 'restaurants', restaurantId, 'daily_summaries', key);
      batch.set(summaryRef, summary, { merge: true });
    });
    await batch.commit();
    console.log(`Committed daily summaries batch ${Math.floor(i / CHUNK_SIZE) + 1}`);
  }

  console.log('All orders and daily summaries updated to LKR successfully!');
  process.exit(0);
}

updateOrdersAndSummaries().catch((err) => {
  console.error('Error updating orders and summaries:', err);
  process.exit(1);
});
