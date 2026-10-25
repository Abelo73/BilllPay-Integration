/** Amharic: Shop, product page, contact and report, cart. */
export const shop: Record<string, string> = {
  // ---- shop page ----
  'Everything in stock, priced in Ethiopian Birr.': 'ያሉ እቃዎች ሁሉ፣ በኢትዮጵያ ብር ዋጋ።',
  'Search products': 'ምርቶችን ይፈልጉ',
  Sort: 'ደርድር',
  Newest: 'አዲስ የገቡ',
  'Price: low to high': 'ዋጋ፦ ከዝቅተኛ ወደ ከፍተኛ',
  'Price: high to low': 'ዋጋ፦ ከከፍተኛ ወደ ዝቅተኛ',
  Name: 'ስም',
  '{name} types': 'የ{name} ዓይነቶች',
  'All {name}': 'ሁሉም {name}',
  Any: 'ማንኛውም',
  Yes: 'አዎ',
  No: 'አይ',
  'Clear filters': 'ማጣሪያዎችን አጽዳ',
  'Products could not be loaded. Please try again.': 'ምርቶቹን መጫን አልተቻለም። እባክዎ እንደገና ይሞክሩ።',
  'No products match your filters.': 'ከማጣሪያዎችዎ ጋር የሚስማማ ምርት የለም።',
  'Page {page} of {pages}': 'ገጽ {page} ከ{pages}',

  // ---- product page ----
  'Photo {n}': 'ፎቶ {n}',
  'Back to shop': 'ወደ ገበያ ይመለሱ',
  'In stock': 'አለ',
  'Price negotiable': 'ዋጋ ይደራደራል',
  Details: 'ዝርዝሮች',
  'Sold by': 'ሻጭ',
  'Sold and delivered by Sodo Gebeya': 'በሶዶ ገበያ የሚሸጥና የሚደርስ',
  Decrease: 'ቀንስ',
  Increase: 'ጨምር',
  'Add to cart': 'ወደ ጋሪ ጨምር',
  'Secure payment with BillPay Wallet, Bank or Card': 'በBillPay ቦርሳ፣ በባንክ ወይም በካርድ ደህንነቱ የተጠበቀ ክፍያ',
  'Delivery in Wolaita Sodo': 'በወላይታ ሶዶ ውስጥ ማድረሻ',
  'Refunds back to your BillPay method': 'ተመላሽ ገንዘብ በከፈሉበት የBillPay መንገድ ይመለሳል',

  // ---- contact the seller ----
  Call: 'ይደውሉ',
  'Show phone number': 'ስልክ ቁጥሩን አሳይ',
  'Sign in to see the phone number': 'ስልክ ቁጥሩን ለማየት ይግቡ',
  'Buy safely': 'በደህንነት ይግዙ',
  'Meet in a public place in Sodo and check the item before you pay.': 'በሶዶ ውስጥ በሕዝብ ቦታ ይገናኙ፤ ከመክፈልዎ በፊት እቃውን ያረጋግጡ።',
  'Never send money before you see the item.': 'እቃውን ሳያዩ በፍጹም ገንዘብ አይላኩ።',
  'Prefer sellers with the Verified badge. Report anything suspicious.': 'የተረጋገጠ ምልክት ያላቸውን ሻጮች ይምረጡ። አጠራጣሪ ነገር ካዩ ሪፖርት ያድርጉ።',
  "Sodo Gebeya checked this seller's ID": 'ሶዶ ገበያ የዚህን ሻጭ መታወቂያ አረጋግጧል',

  // ---- report a listing (REPORT_REASON_LABEL in lib/trust-api.ts; the rest are in messages.ts) ----
  'Thanks. Our team will look at this listing.': 'እናመሰግናለን። ቡድናችን ይህንን ማስታወቂያ ይመለከተዋል።',
  'Report this listing': 'ይህንን ማስታወቂያ ሪፖርት ያድርጉ',
  'Only Sodo Gebeya sees your report, not the seller.': 'ሪፖርትዎን የሚያየው ሶዶ ገበያ ብቻ ነው፤ ሻጩ አያየውም።',
  Reason: 'ምክንያት',
  "What's wrong?": 'ችግሩ ምንድን ነው?',
  '(optional)': '(አማራጭ)',
  'Fake or counterfeit': 'ሐሰተኛ ወይም አስመሳይ ምርት',
  'Not allowed to be sold': 'መሸጥ የተከለከለ',
  'Wrong price, photo or details': 'የተሳሳተ ዋጋ፣ ፎቶ ወይም ዝርዝር',
  Offensive: 'አጸያፊ',

  // ---- listing form: detail fields ----
  'Choose…': 'ይምረጡ…',
  'Choose {field} first, or type': 'መጀመሪያ {field} ይምረጡ ወይም ይጻፉ',
  'Choose or type…': 'ይምረጡ ወይም ይጻፉ…',
  'Type…': 'ይጻፉ…',

  // ---- cart ----
  'Your cart': 'የእርስዎ ጋሪ',
  'Nothing here yet.': 'እስካሁን ምንም የለም።',
  'Browse the shop and add something you love.': 'ገበያውን ይቃኙና የወደዱትን ይጨምሩ።',
  'From {n} sellers: each delivers their own items, with its own delivery fee.':
    'ከ{n} ሻጮች፦ እያንዳንዱ ሻጭ የራሱን እቃዎች በራሱ የማድረሻ ክፍያ ያደርሳል።',
  'From {name}': 'ከ{name}',
  Subtotal: 'ንዑስ ድምር',
  'Final amount is confirmed at checkout.': 'የመጨረሻው መጠን በክፍያ ጊዜ ይረጋገጣል።',
  'You’ll sign in first; your cart is kept.': 'መጀመሪያ ይገባሉ፤ ጋሪዎ ተጠብቆ ይቆያል።',
  Checkout: 'ክፍያ ፈጽም',
  'Sign in to check out': 'ለመክፈል ይግቡ',
  'Visit shop': 'ሱቁን ይጎብኙ',
}
