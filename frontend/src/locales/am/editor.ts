/** Amharic: Product editor (sellers; admin sees it in English). */
export const editor: Record<string, string> = {
  // ---- history labels (ACTION_LABEL) ----
  Created: 'ተፈጥሯል',
  Edited: 'ተስተካክሏል',
  Stock: 'ክምችት',
  Hidden: 'የተደበቀ',
  Shown: 'እንዲታይ ተደርጓል',
  Duplicated: 'ቅጂ ተሠርቷል',
  'Photo added': 'ፎቶ ተጨምሯል',
  'Photo removed': 'ፎቶ ተወግዷል',
  'Photos reordered': 'የፎቶዎች ቅደም ተከተል ተቀይሯል',
  'Taken down': 'ከገበያ ወርዷል',
  'Put back': 'ተመልሷል',

  // ---- details form ----
  'Enter a name': 'ስም ያስገቡ',
  'Choose a category': 'ምድብ ይምረጡ',
  'Price must be more than 0': 'ዋጋው ከ0 በላይ መሆን አለበት',
  "Shown on the store's product page. Old orders keep the name and price they were bought at.":
    'በገበያው የምርት ገጽ ላይ ይታያል። የቀድሞ ትዕዛዞች በተገዙበት ጊዜ የነበረውን ስምና ዋጋ ይይዛሉ።',
  'URL slug': 'የURL ስም',
  'made from the name': 'ከስሙ ይሠራል',
  Category: 'ምድብ',
  '(hidden)': '(የተደበቀ)',
  'Low-stock alert at': 'የክምችት ማስጠንቀቂያ ገደብ',
  'Store shows “only N left” at or below this.': 'ክምችቱ ይህን ያህል ወይም ከዚያ በታች ሲሆን ገበያው “N ብቻ ቀርቷል” ያሳያል።',
  'Starting stock': 'የመነሻ ክምችት',
  Condition: 'ሁኔታ',
  'Not set': 'አልተገለጸም',
  'New (shop stock)': 'አዲስ (የሱቅ እቃ)',
  'Where is it?': 'እቃው የት ነው ያለው?',
  "Leave empty for the shop's area": 'የሱቁን አካባቢ ለመጠቀም ባዶ ይተዉት',
  'Buyers may offer less': 'ገዢዎች ያነሰ ዋጋ ሊያቀርቡ ይችላሉ',
  Description: 'መግለጫ',
  'What it is, size, materials, care…': 'ምን እንደሆነ፣ መጠን፣ የተሠራበት ነገር፣ አያያዝ…',
  'Show in store': 'በገበያው ይታይ',
  'Off = hidden, but kept for order history': 'ሲጠፋ = የተደበቀ ይሆናል፣ ግን ለትዕዛዝ ታሪክ ይቀመጣል',
  'Shown on the home page': 'በመነሻ ገጹ ላይ ይታያል',
  'Create product': 'ምርት ፍጠር',
  'Save changes': 'ለውጦቹን አስቀምጥ',

  // ---- photos ----
  'Only {n} more photo allowed (max {max}).': 'ተጨማሪ {n} ፎቶ ብቻ ይፈቀዳል (ቢበዛ {max})።',
  'Only {n} more photos allowed (max {max}).': 'ተጨማሪ {n} ፎቶዎች ብቻ ይፈቀዳሉ (ቢበዛ {max})።',
  '{name}: use JPG, PNG or WebP.': '{name}፦ JPG፣ PNG ወይም WebP ይጠቀሙ።',
  '{name} is larger than 5 MB.': '{name} ከ5 MB በላይ ነው።',
  'Uploading {i} of {n}: {name}': '{i} ከ{n} በመጫን ላይ፦ {name}',
  Photos: 'ፎቶዎች',
  'The first photo is the main one. Drag to reorder. JPG, PNG or WebP, up to 5 MB, at least 300×300.':
    'የመጀመሪያው ፎቶ ዋና ፎቶ ነው። ቅደም ተከተሉን ለመቀየር ይጎትቱ። JPG፣ PNG ወይም WebP፣ እስከ 5 MB፣ ቢያንስ 300×300።',
  'Currently using a built-in photo. Upload one to replace it.': 'አሁን የተዘጋጀ ፎቶ እየተጠቀመ ነው። ለመተካት ፎቶ ይጫኑ።',
  Main: 'ዋና',
  'Move left': 'ወደ ግራ አንቀሳቅስ',
  'Move right': 'ወደ ቀኝ አንቀሳቅስ',
  'Make main photo': 'ዋና ፎቶ አድርግ',
  'Remove this photo?': 'ይህ ፎቶ ይወገድ?',
  'Add photos': 'ፎቶዎች ያክሉ',

  // ---- stock ----
  'Stock is now {n}': 'ክምችቱ አሁን {n} ነው',
  "Units held by unpaid orders can't be removed.": 'ላልተከፈሉ ትዕዛዞች የተያዙ እቃዎችን ማስወገድ አይቻልም።',
  Held: 'የተያዘ',
  Available: 'ለሽያጭ ያለ',
  Quantity: 'ብዛት',
  Restock: 'አዲስ ክምችት',
  'Stock count correction': 'የቆጠራ ማስተካከያ',
  'Damaged or lost': 'የተበላሸ ወይም የጠፋ',
  'Returned by customer': 'በደንበኛ የተመለሰ',
  'Remove {n}': '{n} ቀንስ',
  'Add {n}': '{n} ጨምር',

  // ---- history ----
  History: 'ታሪክ',
  'No changes yet.': 'እስካሁን ምንም ለውጥ የለም።',
  system: 'ሲስተም',

  // ---- page ----
  'Shown in the store': 'በገበያው ይታያል',
  'Hidden from the store': 'ከገበያው ተደብቋል',
  'Copy created (hidden, no stock)': 'ቅጂ ተፈጥሯል (የተደበቀ፣ ክምችት የለውም)',
  Products: 'ምርቶች',
  'New product': 'አዲስ ምርት',
  'Save the details first, then add photos.': 'መጀመሪያ ዝርዝሮቹን ያስቀምጡ፣ ከዚያ ፎቶዎች ያክሉ።',
  'View in store': 'በገበያው ይመልከቱ',
  Duplicate: 'ቅጂ ፍጠር',
  Hide: 'ደብቅ',
  "Shoppers can't see this yet: it shows in the store once Sodo Gebeya approves your shop.":
    'ገዢዎች ይህንን ገና ማየት አይችሉም፦ ሶዶ ገበያ ሱቅዎን ሲያጸድቅ በገበያው ይታያል።',
  'Product created. Now add photos.': 'ምርቱ ተፈጥሯል። አሁን ፎቶዎች ያክሉ።',

  // ---- held / taken down ----
  'Put back in the store': 'ወደ ገበያው መልስ',
  'Held for a quick check:': 'ለአጭር ምርመራ ተይዟል፦',
  'Taken down by Sodo Gebeya after reports:': 'ከሪፖርቶች በኋላ በሶዶ ገበያ ከገበያ ወርዷል፦',
  'We usually check within a day; you can edit it meanwhile.': 'ብዙውን ጊዜ በአንድ ቀን ውስጥ እንመረምራለን፤ እስከዚያው ማስተካከል ይችላሉ።',
  'Fix it, then call us to put it back.': 'ያስተካክሉት፣ ከዚያ እንድንመልሰው ይደውሉልን።',
}
