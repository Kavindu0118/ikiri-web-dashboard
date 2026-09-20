import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';

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

const menuPayload = {
  title: "POS Main Menu",
  menuTitle: "POS Main Menu",
  restaurantName: "yoooo",
  templateId: "minimal-cafe",
  templateLabel: "Minimal Cafe",
  notes: "All prices include service and taxes.",
  isPublished: true,
  updatedAt: serverTimestamp(),
  sections: [
    {
      id: "sec_pizza",
      title: "Artisanal Pizza",
      items: [
        {
          id: "item_1",
          name: "Margherita Pizza",
          price: "14.50",
          description: "San Marzano tomato sauce, fresh mozzarella fior di latte, basil leaves, extra virgin olive oil.",
          cost: "0.00",
          imageUrl: ""
        },
        {
          id: "item_2",
          name: "Pepperoni Supreme",
          price: "17.00",
          description: "Artisan pepperoni, rich marinara sauce, mozzarella cheese blend, oregano.",
          cost: "0.00",
          imageUrl: ""
        },
        {
          id: "item_3",
          name: "BBQ Chicken Pizza",
          price: "18.50",
          description: "Smoked shredded chicken, sweet smokey BBQ sauce, red onions, cilantro, mozzarella.",
          cost: "0.00",
          imageUrl: ""
        },
        {
          id: "item_4",
          name: "Truffle Mushroom Pizza",
          price: "19.50",
          description: "Wild forest mushrooms, white truffle oil, mozzarella, fresh thyme, garlic cream base.",
          cost: "0.00",
          imageUrl: ""
        },
        {
          id: "item_5",
          name: "Quattro Formaggi",
          price: "16.50",
          description: "Mozzarella, gorgonzola, parmesan, and fontina cheeses on a crispy hand-stretched crust.",
          cost: "0.00",
          imageUrl: ""
        }
      ]
    },
    {
      id: "sec_burgers",
      title: "Burgers & Sandwiches",
      items: [
        {
          id: "item_6",
          name: "Classic Cheeseburger",
          price: "12.50",
          description: "Prime beef patty, aged cheddar, crisp lettuce, tomato, house special sauce on a brioche bun.",
          cost: "0.00",
          imageUrl: ""
        },
        {
          id: "item_7",
          name: "Crispy Fried Chicken Burger",
          price: "11.50",
          description: "Buttermilk crispy fried chicken thigh, spicy coleslaw, pickles, chipotle mayo on brioche.",
          cost: "0.00",
          imageUrl: ""
        },
        {
          id: "item_8",
          name: "Double Smash Beef Burger",
          price: "15.00",
          description: "Two smashed beef patties, double American cheese, caramelized onions, secret burger relish.",
          cost: "0.00",
          imageUrl: ""
        },
        {
          id: "item_9",
          name: "Steak & Caramelized Onion Sandwich",
          price: "16.50",
          description: "Grilled tender steak strips, balsamic caramelized onions, melted provolone, garlic aioli on ciabatta.",
          cost: "0.00",
          imageUrl: ""
        },
        {
          id: "item_10",
          name: "Veggie Avocado Club",
          price: "12.00",
          description: "Ripe avocado, grilled halloumi, roasted red peppers, baby spinach, pesto on toasted sourdough.",
          cost: "0.00",
          imageUrl: ""
        }
      ]
    },
    {
      id: "sec_mains",
      title: "Mains & Pasta",
      items: [
        {
          id: "item_11",
          name: "Creamy Pasta Carbonara",
          price: "15.50",
          description: "Classic creamy parmesan sauce, crispy pancetta, cracked black pepper, egg yolk.",
          cost: "0.00",
          imageUrl: ""
        },
        {
          id: "item_12",
          name: "Seafood Marinara Linguine",
          price: "18.50",
          description: "Fresh ocean prawns, calamari, mussels tossed in rich garlic marinara sauce and white wine.",
          cost: "0.00",
          imageUrl: ""
        },
        {
          id: "item_13",
          name: "Penne Arrabbiata",
          price: "13.50",
          description: "Penne tossed in spicy garlic tomato sauce with chili flakes, parsley, and olive oil.",
          cost: "0.00",
          imageUrl: ""
        },
        {
          id: "item_14",
          name: "Grilled Ribeye Steak (250g)",
          price: "28.50",
          description: "Char-grilled prime ribeye steak served with herb butter, roasted vegetables, and red wine jus.",
          cost: "0.00",
          imageUrl: ""
        },
        {
          id: "item_15",
          name: "Pan-Seared Atlantic Salmon",
          price: "24.00",
          description: "Crispy-skin Atlantic salmon fillet, lemon herb butter, asparagus, creamy potato puree.",
          cost: "0.00",
          imageUrl: ""
        }
      ]
    },
    {
      id: "sec_starters",
      title: "Starters & Sides",
      items: [
        {
          id: "item_16",
          name: "Crispy Truffle Fries",
          price: "6.50",
          description: "Hand-cut golden fries tossed with white truffle oil, grated parmesan cheese, and fresh parsley.",
          cost: "0.00",
          imageUrl: ""
        },
        {
          id: "item_17",
          name: "Spicy Buffalo Chicken Wings",
          price: "9.50",
          description: "Crispy chicken wings tossed in fiery Buffalo glaze, served with blue cheese dip and celery.",
          cost: "0.00",
          imageUrl: ""
        },
        {
          id: "item_18",
          name: "Garlic Butter Herb Bread",
          price: "5.50",
          description: "Toasted artisan baguette brushed with roasted garlic butter, parsley, and sea salt.",
          cost: "0.00",
          imageUrl: ""
        },
        {
          id: "item_19",
          name: "Calamari Fritti",
          price: "10.50",
          description: "Tender calamari lightly dusted and fried golden, served with lemon garlic aioli.",
          cost: "0.00",
          imageUrl: ""
        },
        {
          id: "item_20",
          name: "Classic Caesar Salad",
          price: "8.50",
          description: "Crisp romaine hearts, shaved parmesan, garlic herb croutons, creamy Caesar dressing.",
          cost: "0.00",
          imageUrl: ""
        }
      ]
    },
    {
      id: "sec_desserts",
      title: "Desserts",
      items: [
        {
          id: "item_21",
          name: "Authentic Tiramisu",
          price: "7.50",
          description: "Espresso-soaked ladyfingers layered with rich mascarpone cream and dusted with Dutch cocoa.",
          cost: "0.00",
          imageUrl: ""
        },
        {
          id: "item_22",
          name: "New York Cheesecake",
          price: "8.00",
          description: "Rich and velvety baked cheesecake on a graham cracker crust with berry compote.",
          cost: "0.00",
          imageUrl: ""
        },
        {
          id: "item_23",
          name: "Warm Chocolate Lava Cake",
          price: "8.50",
          description: "Decadent molten dark chocolate cake with a gooey center, served with vanilla ice cream.",
          cost: "0.00",
          imageUrl: ""
        },
        {
          id: "item_24",
          name: "Artisan Gelato Trio",
          price: "6.00",
          description: "Three scoops of handcrafted Italian gelato with choices of chocolate, pistachio, or vanilla bean.",
          cost: "0.00",
          imageUrl: ""
        }
      ]
    },
    {
      id: "sec_beverages",
      title: "Beverages & Cocktails",
      items: [
        {
          id: "item_25",
          name: "Iced Vanilla Latte",
          price: "4.80",
          description: "Double shot espresso over cold milk and Madagascar vanilla syrup on ice.",
          cost: "0.00",
          imageUrl: ""
        },
        {
          id: "item_26",
          name: "Single Origin Espresso",
          price: "3.80",
          description: "Full-bodied single origin espresso with notes of dark chocolate and citrus.",
          cost: "0.00",
          imageUrl: ""
        },
        {
          id: "item_27",
          name: "Passionfruit Mojito",
          price: "9.50",
          description: "White rum, muddled fresh mint, passion fruit pulp, lime juice, sparkling soda.",
          cost: "0.00",
          imageUrl: ""
        },
        {
          id: "item_28",
          name: "Tropical Mango Smoothie",
          price: "6.50",
          description: "Fresh ripe mango, greek yogurt, honey, coconut milk blended to perfection.",
          cost: "0.00",
          imageUrl: ""
        },
        {
          id: "item_29",
          name: "Aperol Spritz",
          price: "11.00",
          description: "Aperol aperitivo, prosecco, splash of club soda, garnished with fresh orange slice.",
          cost: "0.00",
          imageUrl: ""
        },
        {
          id: "item_30",
          name: "Craft IPA Draught Beer",
          price: "7.50",
          description: "Locally brewed IPA with vibrant citrus and pine hop notes on tap.",
          cost: "0.00",
          imageUrl: ""
        },
        {
          id: "item_31",
          name: "San Pellegrino Sparkling (500ml)",
          price: "3.50",
          description: "Crisp Italian sparkling natural mineral water bottle.",
          cost: "0.00",
          imageUrl: ""
        }
      ]
    },
    {
      id: "sec_activities",
      title: "Beach Activities & Lessons",
      items: [
        {
          id: "item_32",
          name: "Surfboard Full Day Rental",
          price: "25.00",
          description: "Premium surfboard rental suitable for beginners to advanced surfers.",
          cost: "0.00",
          imageUrl: ""
        },
        {
          id: "item_33",
          name: "Stand-Up Paddleboard 2hr",
          price: "20.00",
          description: "2-hour rental including board, paddle, and safety leash.",
          cost: "0.00",
          imageUrl: ""
        },
        {
          id: "item_34",
          name: "Private Surf Lesson 1hr",
          price: "45.00",
          description: "1-on-1 personalized surf coaching with certified instructor including gear.",
          cost: "0.00",
          imageUrl: ""
        }
      ]
    }
  ]
};

async function populateMenu() {
  console.log(`Writing menu to restaurants/${restaurantId}/menu/current ...`);
  const menuDocRef = doc(db, 'restaurants', restaurantId, 'menu', 'current');
  await setDoc(menuDocRef, menuPayload, { merge: true });

  console.log('Successfully written menu to Firestore!');

  console.log('Verifying read back...');
  const verifySnap = await getDoc(menuDocRef);
  if (verifySnap.exists()) {
    const data = verifySnap.data();
    console.log('Verified menu doc title:', data.title);
    console.log('Total sections in Firestore:', data.sections.length);
    const totalItems = data.sections.reduce((acc, sec) => acc + (sec.items?.length || 0), 0);
    console.log('Total items in Firestore:', totalItems);
  } else {
    console.error('Menu doc not found after write!');
  }

  process.exit(0);
}

populateMenu().catch(err => {
  console.error('Error writing menu:', err);
  process.exit(1);
});
