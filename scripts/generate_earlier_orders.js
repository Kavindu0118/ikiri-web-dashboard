import { initializeApp } from 'firebase/app';
import { initializeFirestore, collection, getDocs, doc, writeBatch, Timestamp, setDoc, getDoc } from 'firebase/firestore';

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

const MENU_ITEMS = [
  { itemId: 1, name: "Margherita Pizza", price: 4350.00 },
  { itemId: 2, name: "Pepperoni Supreme", price: 5100.00 },
  { itemId: 3, name: "BBQ Chicken Pizza", price: 5550.00 },
  { itemId: 4, name: "Truffle Mushroom Pizza", price: 5850.00 },
  { itemId: 5, name: "Quattro Formaggi", price: 4950.00 },

  { itemId: 6, name: "Classic Cheeseburger", price: 3750.00 },
  { itemId: 7, name: "Crispy Fried Chicken Burger", price: 3450.00 },
  { itemId: 8, name: "Double Smash Beef Burger", price: 4500.00 },
  { itemId: 9, name: "Steak & Caramelized Onion Sandwich", price: 4950.00 },
  { itemId: 10, name: "Veggie Avocado Club", price: 3600.00 },

  { itemId: 11, name: "Creamy Pasta Carbonara", price: 4650.00 },
  { itemId: 12, name: "Seafood Marinara Linguine", price: 5550.00 },
  { itemId: 13, name: "Penne Arrabbiata", price: 4050.00 },
  { itemId: 14, name: "Grilled Ribeye Steak (250g)", price: 8550.00 },
  { itemId: 15, name: "Pan-Seared Atlantic Salmon", price: 7200.00 },

  { itemId: 16, name: "Crispy Truffle Fries", price: 1950.00 },
  { itemId: 17, name: "Spicy Buffalo Chicken Wings", price: 2850.00 },
  { itemId: 18, name: "Garlic Butter Herb Bread", price: 1650.00 },
  { itemId: 19, name: "Calamari Fritti", price: 3150.00 },
  { itemId: 20, name: "Classic Caesar Salad", price: 2550.00 },

  { itemId: 21, name: "Authentic Tiramisu", price: 2250.00 },
  { itemId: 22, name: "New York Cheesecake", price: 2400.00 },
  { itemId: 23, name: "Warm Chocolate Lava Cake", price: 2550.00 },
  { itemId: 24, name: "Artisan Gelato Trio", price: 1800.00 },

  { itemId: 25, name: "Iced Vanilla Latte", price: 1440.00 },
  { itemId: 26, name: "Single Origin Espresso", price: 1140.00 },
  { itemId: 27, name: "Passionfruit Mojito", price: 2850.00 },
  { itemId: 28, name: "Tropical Mango Smoothie", price: 1950.00 },
  { itemId: 29, name: "Aperol Spritz", price: 3300.00 },
  { itemId: 30, name: "Craft IPA Draught Beer", price: 2250.00 },
  { itemId: 31, name: "San Pellegrino Sparkling (500ml)", price: 1050.00 },

  { itemId: 32, name: "Surfboard Full Day Rental", price: 7500.00 },
  { itemId: 33, name: "Stand-Up Paddleboard 2hr", price: 6000.00 },
  { itemId: 34, name: "Private Surf Lesson 1hr", price: 13500.00 }
];

const SOURCES = ['COUNTER', 'TABLE', 'ROOM', 'SURFHOUSE', 'ONLINE'];
const PAYMENT_METHODS = ['CASH', 'CARD', 'ONLINE'];
const NOTES = [
  null,
  null,
  null,
  'Guest request: Extra napkins',
  'No spicy',
  'Table celebration',
  'Room delivery prompt',
  'Surfing group booking'
];

const pad = (n) => String(n).padStart(2, '0');

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomElement(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function generateEarlierOrders() {
  console.log('Generating orders from March 1, 2026 to July 14, 2026...');

  const startDate = new Date(2026, 2, 1); // March 1, 2026
  const endDate = new Date(2026, 6, 14); // July 14, 2026

  let globalOrderId = 200; // order ID starting from 200 up to ~990
  let globalItemId = 1000;

  const newOrders = [];
  const dailySummariesMap = {};

  const curr = new Date(startDate);
  while (curr <= endDate) {
    const year = curr.getFullYear();
    const month = pad(curr.getMonth() + 1);
    const day = pad(curr.getDate());
    const dateKey = `${year}-${month}-${day}`;

    // 4 to 8 orders per day
    const ordersTodayCount = getRandomInt(4, 8);

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

    for (let dailyNum = 1; dailyNum <= ordersTodayCount; dailyNum++) {
      globalOrderId += 1;
      const orderId = globalOrderId;

      // Random hour between 11:00 and 22:30
      const hour = getRandomInt(11, 22);
      const minute = getRandomInt(0, 59);
      const second = getRandomInt(0, 59);
      const createdAtStr = `${dateKey}T${pad(hour)}:${pad(minute)}:${pad(second)}.000`;

      const source = getRandomElement(SOURCES);
      let orderType = 'counter';
      let tableNumber = null;
      let roomNumber = null;
      let serviceFeeRate = 0;

      if (source === 'TABLE') {
        orderType = 'dine-in';
        tableNumber = getRandomInt(1, 12);
        serviceFeeRate = 0.10;
      } else if (source === 'ROOM') {
        orderType = 'room';
        roomNumber = String(getRandomInt(101, 110));
        serviceFeeRate = 0.10;
      } else if (source === 'SURFHOUSE') {
        orderType = 'rental';
        serviceFeeRate = 0;
      } else if (source === 'ONLINE') {
        orderType = 'online';
        serviceFeeRate = 0;
      } else {
        orderType = 'counter';
        serviceFeeRate = 0;
      }

      const paymentMethod = getRandomElement(PAYMENT_METHODS);
      const cardFeeRate = paymentMethod === 'CARD' ? 0.025 : 0;

      // 1 to 4 items in this order
      const itemCount = getRandomInt(1, 4);
      const orderItems = [];
      let grossSubtotal = 0;
      let totalDiscount = 0;

      for (let itIdx = 0; itIdx < itemCount; itIdx++) {
        globalItemId += 1;
        const baseItem = getRandomElement(MENU_ITEMS);
        const qty = getRandomInt(1, 2);

        // 15% chance of discount
        const hasDiscount = Math.random() < 0.15;
        const discountType = hasDiscount ? 'PERCENTAGE' : null;
        const discountValue = hasDiscount ? 15 : 0;
        const discountName = hasDiscount ? 'Happy Hour (15%)' : null;
        const discountAmount = hasDiscount ? Number(((baseItem.price * qty * 0.15)).toFixed(2)) : 0;

        orderItems.push({
          id: globalItemId,
          ticketId: orderId,
          itemId: baseItem.itemId,
          name: baseItem.name,
          price: baseItem.price,
          qty,
          discountType,
          discountValue,
          discountName,
          discountAmount,
          specialNotes: '[]'
        });

        grossSubtotal += (baseItem.price * qty);
        totalDiscount += discountAmount;
      }

      const netSubtotal = grossSubtotal - totalDiscount;
      const serviceFeeAmount = Number((netSubtotal * serviceFeeRate).toFixed(2));
      const cardFeeAmount = Number(((netSubtotal + serviceFeeAmount) * cardFeeRate).toFixed(2));
      const total = Number((netSubtotal + serviceFeeAmount + cardFeeAmount).toFixed(2));

      const orderDocData = {
        id: orderId,
        dailyNumber: dailyNum,
        createdAt: createdAtStr,
        source,
        orderType,
        tableNumber,
        roomNumber,
        paymentMethod,
        currency: 'LKR',
        status: 'PAID',
        isBackedUp: 1,
        note: getRandomElement(NOTES),
        serviceFeeRate,
        serviceFeeAmount,
        cardFeeRate,
        cardFeeAmount,
        total,
        items: orderItems
      };

      newOrders.push(orderDocData);

      // Accumulate daily summary
      const sum = dailySummariesMap[dateKey];
      sum.grossRevenue += grossSubtotal;
      sum.totalDiscounts += totalDiscount;
      sum.totalServiceFees += serviceFeeAmount;
      sum.totalCardFees += cardFeeAmount;
      sum.netRevenue += total;
      sum.totalItemsSold += orderItems.reduce((acc, it) => acc + it.qty, 0);
      sum.totalOrdersCount += 1;
      if (paymentMethod === 'CASH') {
        sum.cashTotal += total;
      } else {
        sum.cashlessTotal += total;
      }
    }

    curr.setDate(curr.getDate() + 1);
  }

  console.log(`Generated ${newOrders.length} earlier orders across ${Object.keys(dailySummariesMap).length} days (March - July 2026).`);

  // Write new orders in chunks of 400
  const CHUNK_SIZE = 400;
  for (let i = 0; i < newOrders.length; i += CHUNK_SIZE) {
    const chunk = newOrders.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    chunk.forEach((ord) => {
      const orderRef = doc(db, 'backup', restaurantId, 'orders', String(ord.id));
      batch.set(orderRef, ord, { merge: true });
    });
    await batch.commit();
    console.log(`Committed orders batch ${Math.floor(i / CHUNK_SIZE) + 1} (${chunk.length} orders)`);
  }

  // Write daily summaries
  const dateKeys = Object.keys(dailySummariesMap);
  for (let i = 0; i < dateKeys.length; i += CHUNK_SIZE) {
    const chunkKeys = dateKeys.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    chunkKeys.forEach((key) => {
      const summary = dailySummariesMap[key];
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

  // Update main backup doc total count
  const allOrdersSnap = await getDocs(collection(db, 'backup', restaurantId, 'orders'));
  console.log(`New total orders count in Firestore: ${allOrdersSnap.size}`);
  await setDoc(doc(db, 'backup', restaurantId), {
    totalBackedUpOrders: allOrdersSnap.size,
    updatedAt: Timestamp.now()
  }, { merge: true });

  console.log('Successfully generated and saved historical orders from March 2026!');
  process.exit(0);
}

generateEarlierOrders().catch(err => {
  console.error('Error generating earlier orders:', err);
  process.exit(1);
});
