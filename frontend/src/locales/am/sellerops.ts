/** Amharic: Seller area: products, orders, money, plan; home promos. */
export const sellerops: Record<string, string> = {
  // ---- seller: products list ----
  'Search your products': 'ምርቶችዎን ይፈልጉ',
  'No products match.': 'የሚስማማ ምርት የለም።',
  'No products yet.': 'እስካሁን ምንም ምርት የለም።',
  'Add a product': 'ምርት ያክሉ',
  '{n} available': '{n} ለሽያጭ ዝግጁ',
  '{n} held': '{n} የተያዘ',
  'Low stock': 'ክምችት እያለቀ ነው',
  Boost: 'ያድምቁ',

  // ---- seller: orders ----
  'To send': 'የሚላኩ',
  'Order number or buyer': 'የትዕዛዝ ቁጥር ወይም ገዢ',
  'Only paid orders with your items show here, and only your items in them.':
    'እዚህ የሚታዩት የእርስዎ እቃዎች ያሉባቸው የተከፈሉ ትዕዛዞች ብቻ ናቸው፤ በውስጣቸውም የሚታዩት የእርስዎ እቃዎች ብቻ ናቸው።',
  'Nothing to send right now.': 'አሁን የሚላክ ነገር የለም።',
  'No orders here yet.': 'እዚህ እስካሁን ምንም ትዕዛዝ የለም።',
  'Order is now: {status}. The buyer was told.': 'የትዕዛዙ ሁኔታ አሁን፦ {status}። ለገዢው ተነግሯል።',
  'Paid {date}': '{date} ተከፍሏል',
  'Your items': 'የእርስዎ እቃዎች',
  'Your share': 'የእርስዎ ድርሻ',
  'Delivery the buyer paid for this parcel': 'ገዢው ለዚህ ጥቅል የከፈለው የማድረሻ ክፍያ',
  'The buyer also bought from other sellers in this order.': 'ገዢው በዚህ ትዕዛዝ ከሌሎች ሻጮችም ገዝቷል።',
  'You deliver only your parcel {parcel}; the others bring theirs.':
    'እርስዎ የሚያደርሱት የራስዎን ጥቅል {parcel} ብቻ ነው፤ ሌሎቹ የራሳቸውን ያደርሳሉ።',
  'Deliver to': 'የሚደርስበት',
  'Note: {note}': 'ማስታወሻ፦ {note}',
  'Sent with: {note}': 'የሚያደርሰው፦ {note}',
  'Who is bringing it?': 'ማን ነው የሚያደርሰው?',
  '(optional, the buyer sees this)': '(አማራጭ፣ ገዢው ያየዋል)',
  'e.g. Bajaj rider Dawit, 0916 000 111': 'ለምሳሌ የባጃጅ ሾፌር ዳዊት፣ 0916 000 111',
  "Can't deliver it? Call Sodo Gebeya: only we can cancel a paid order, because the buyer gets a refund.":
    'ማድረስ አይችሉም? ለሶዶ ገበያ ይደውሉ፦ ገዢው ገንዘቡ ስለሚመለስለት የተከፈለን ትዕዛዝ መሰረዝ የምንችለው እኛ ብቻ ነን።',
  // next-step buttons (STEP_ACTION)
  'Packing it': 'እያዘጋጀሁት ነው',
  'Sent: on the way': 'ተልኳል፦ በመንገድ ላይ ነው',
  // parcel status (FULFILMENT_LABEL in seller/shared.tsx)
  'Paid, to pack': 'ተከፍሏል፣ የሚዘጋጅ',
  Packing: 'በዝግጅት ላይ',

  // ---- seller: money ----
  'Payout account saved': 'የክፍያ መቀበያ ሂሳብ ተቀምጧል',
  'Payout method': 'ክፍያ የሚቀበሉበት መንገድ',
  'Bank account': 'የባንክ ሂሳብ',
  Bank: 'ባንክ',
  'e.g. Commercial Bank of Ethiopia': 'ለምሳሌ የኢትዮጵያ ንግድ ባንክ',
  'Account holder': 'የሂሳቡ ባለቤት ስም',
  'Account number': 'የሂሳብ ቁጥር',
  'Save payout account': 'የክፍያ መቀበያ ሂሳቡን ያስቀምጡ',
  "Asked for {amount}. We'll text you when it's sent.": '{amount} ጠይቀዋል። ሲላክ በSMS እናሳውቅዎታለን።',
  'Ready to withdraw': 'ለማውጣት ዝግጁ',
  'Held until delivery:': 'እስኪደርስ የተያዘ፦',
  'On its way to you:': 'ወደ እርስዎ በመላክ ላይ፦',
  'Paid out so far:': 'እስካሁን የተከፈለ፦',
  "Buyers' money is held by Sodo Gebeya until they confirm they got their items, or {hours} hours after delivery. Then it's yours to withdraw.":
    'የገዢዎች ገንዘብ እቃዎቻቸው እንደደረሷቸው እስኪያረጋግጡ ድረስ፣ ወይም ከደረሰ {hours} ሰዓት እስኪሆነው ድረስ በሶዶ ገበያ ተይዞ ይቆያል። ከዚያ በኋላ የእርስዎ ነው፤ ማውጣት ይችላሉ።',
  'Withdraw money': 'ገንዘብ ያውጡ',
  'Where should we send your money?': 'ገንዘብዎን ወዴት እንላክልዎ?',
  'To {account}': 'ወደ {account}',
  Change: 'ቀይር',
  "A payout is on its way. You can ask again once it's sent.": 'አንድ ክፍያ በመላክ ላይ ነው። ከተላከ በኋላ እንደገና መጠየቅ ይችላሉ።',
  'Amount in birr': 'መጠን በብር',
  '{n} or more': '{n} ወይም ከዚያ በላይ',
  'Ask for payout': 'ክፍያ ይጠይቁ',
  'Smallest payout {amount}. Our team sends it and texts you the reference.':
    'ዝቅተኛው የክፍያ መጠን {amount} ነው። ቡድናችን ገንዘቡን ይልካል፤ የማጣቀሻ ቁጥሩንም በSMS ይልክልዎታል።',
  'ref {ref}': 'ማጣቀሻ {ref}',
  Statement: 'መግለጫ',
  'Each sale: what the buyer paid for your parcel, the Sodo Gebeya fee, and what you get.':
    'እያንዳንዱ ሽያጭ፦ ገዢው ለጥቅልዎ የከፈለው፣ የሶዶ ገበያ ኮሚሽን እና እርስዎ የሚያገኙት።',
  'No sales yet.': 'እስካሁን ምንም ሽያጭ የለም።',
  'items {amount}': 'እቃዎች {amount}',
  'fee {amount} ({percent}%)': 'ኮሚሽን {amount} ({percent}%)',
  // payout status
  'On its way': 'በመላክ ላይ',
  'Not sent': 'አልተላከም',

  // ---- seller: plan and boosts ----
  'Request sent. Pay, then type the transaction number below.': 'ጥያቄው ተልኳል። ይክፈሉ፣ ከዚያ የግብይት ቁጥሩን ከታች ይጻፉ።',
  'Free plan': 'ነጻ ዕቅድ',
  'Active until {date}. No product limit, Pro badge, statistics and {n} points less commission.':
    'እስከ {date} ንቁ ነው። ያልተገደበ ምርት፣ የፕሮ ምልክት፣ ስታቲስቲክስ እና በ{n} ነጥብ ያነሰ ኮሚሽን።',
  '{used} of {max} products used.': 'ከ{max} ምርቶች {used} ተጠቅመዋል።',
  'No product limit right now.': 'አሁን የምርት ገደብ የለም።',
  'No limit on products': 'የምርት ገደብ የለም',
  'Pro badge on your shop and listings': 'በሱቅዎና በማስታወቂያዎችዎ ላይ የፕሮ ምልክት',
  'Statistics: who called, chatted and offered': 'ስታቲስቲክስ፦ ማን እንደደወለ፣ እንደተወያየና ዋጋ እንዳቀረበ',
  '{n} points less commission on online sales': 'በኦንላይን ሽያጭ ላይ በ{n} ነጥብ ያነሰ ኮሚሽን',
  'Pro plan, {n} months': 'የፕሮ ዕቅድ፣ {n} ወር',
  '1 month': '1 ወር',
  '{n} months': '{n} ወር',
  'Renew Pro': 'ፕሮን ያድሱ',
  'Go Pro': 'ወደ ፕሮ ያሳድጉ',
  Boosts: 'ማድመቂያዎች',
  'A boosted listing shows first in search and on the home page. 3 days {p3}, 7 days {p7}, 14 days {p14}.':
    'የደመቀ ማስታወቂያ በፍለጋና በመነሻ ገጹ ላይ ቀድሞ ይታያል። 3 ቀን {p3}፣ 7 ቀን {p7}፣ 14 ቀን {p14}።',
  'Boost from your products list': 'ከምርቶችዎ ዝርዝር ያድምቁ',
  'No boosts yet.': 'እስካሁን ምንም ማድመቂያ የለም።',
  '{n} days': '{n} ቀን',
  'On until {date}': 'እስከ {date} ንቁ',
  Ended: 'አብቅቷል',
  'Not started': 'አልተጀመረም',
  'Send {amount} by telebirr or bank to {phone}, then type the transaction number. We start it as soon as it arrives.':
    '{amount} በtelebirr ወይም በባንክ ወደ {phone} ይላኩ፣ ከዚያ የግብይት ቁጥሩን ይጻፉ። ገንዘቡ እንደደረሰ እንጀምራለን።',
  'Send {amount} by telebirr or bank to Sodo Gebeya, then type the transaction number. We start it as soon as it arrives.':
    '{amount} በtelebirr ወይም በባንክ ለሶዶ ገበያ ይላኩ፣ ከዚያ የግብይት ቁጥሩን ይጻፉ። ገንዘቡ እንደደረሰ እንጀምራለን።',
  'Thanks! We check it soon.': 'እናመሰግናለን! በቅርቡ እናረጋግጣለን።',
  'Statistics, last 30 days': 'ስታቲስቲክስ፣ ያለፉት 30 ቀናት',
  Product: 'ምርት',
  'Phone shown': 'ስልኩ የታየበት',
  Offers: 'የዋጋ ጥያቄዎች',
  'Boost requested. Pay to start it: see Plan.': 'ማድመቂያ ተጠይቋል። ለማስጀመር ይክፈሉ፦ የዕቅድ ገጹን ይመልከቱ።',
  'Boost “{name}”': '“{name}”ን ያድምቁ',
  'It shows first in search and on the home page, with a Boosted label.':
    'በፍለጋና በመነሻ ገጹ ላይ “ተደምቋል” የሚል ምልክት ይዞ ቀድሞ ይታያል።',
  Days: 'ቀናት',

  // ---- home: promos ----
  'Special offers': 'ልዩ ቅናሾች',
}
