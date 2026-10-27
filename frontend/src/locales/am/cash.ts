/**
 * Amharic for cash on delivery (M7): checkout choice, the buyer's order page, the seller's "Cash received" and
 * cancelling a cash order. First draft: needs a native speaker's review before launch, like the rest of ./am.
 */
export const cash: Record<string, string> = {
  // checkout
  'How do you want to pay?': 'እንዴት መክፈል ይፈልጋሉ?',
  'Pay online now': 'አሁን በኦንላይን ይክፈሉ',
  'BillPay: Wallet, Bank or Card. The money is held until you receive your items.': 'BillPay፦ ዋሌት፣ ባንክ ወይም ካርድ። ዕቃዎቹ እስኪደርሱዎት ድረስ ገንዘቡ ተይዞ ይቆያል።',
  'Cash on delivery': 'ሲደርስ በጥሬ ገንዘብ',
  'Pay the seller in cash when it arrives.': 'ሲደርስ ለሻጩ በጥሬ ገንዘብ ይክፈሉ።',
  'Only for orders up to {limit}.': 'እስከ {limit} ለሚደርሱ ትዕዛዞች ብቻ።',
  'Placing your order…': 'ትዕዛዝዎን እያስገባን ነው…',
  'Place order: pay {amount} in cash': 'ይዘዙ፦ {amount} በጥሬ ገንዘብ ይክፈሉ',
  'Cash on delivery is for orders up to {limit}. Remove something to pay in cash.': 'በጥሬ ገንዘብ መክፈል እስከ {limit} ለሚደርሱ ትዕዛዞች ነው። በጥሬ ለመክፈል አንዳንድ ዕቃ ይቀንሱ።',
  'Pay the seller in cash when your items arrive, or when you pick them up. Only verified sellers take cash.': 'ዕቃዎቹ ሲደርሱዎት ወይም ሲወስዱ ለሻጩ በጥሬ ገንዘብ ይክፈሉ። ጥሬ ገንዘብ የሚቀበሉት የተረጋገጡ ሻጮች ብቻ ናቸው።',

  // buyer's order page
  'cash on delivery': 'ሲደርስ በጥሬ ገንዘብ',
  'On the way: have the cash ready': 'በመንገድ ላይ ነው፦ ጥሬ ገንዘቡን ያዘጋጁ',
  'Pay {amount} in cash to the seller or rider when it arrives.': 'ሲደርስ {amount} ለሻጩ ወይም ለአድራሹ በጥሬ ገንዘብ ይክፈሉ።',
  'Order placed: pay cash on delivery': 'ትዕዛዙ ገብቷል፦ ሲደርስ በጥሬ ገንዘብ ይክፈሉ',
  'Thank you, {name}! The seller is preparing your order. Pay {amount} in cash when it arrives or when you pick it up.':
    'እናመሰግናለን {name}! ሻጩ ትዕዛዝዎን እያዘጋጀ ነው። ሲደርስ ወይም ሲወስዱ {amount} በጥሬ ገንዘብ ይክፈሉ።',
  'Cancelled. Nothing was charged.': 'ተሰርዟል። ምንም አልተከፈለም።',
  'Cancel the items from {seller}': 'ከ{seller} ያሉትን ዕቃዎች ሰርዝ',
  'Cancel this order': 'ይህን ትዕዛዝ ሰርዝ',
  'Cancel this cash order?': 'ይህን በጥሬ ገንዘብ የሚከፈል ትዕዛዝ ይሰርዙ?',
  'You can cancel until the seller starts packing. You pay nothing.': 'ሻጩ ማሸግ እስኪጀምር ድረስ መሰረዝ ይችላሉ። ምንም አይከፍሉም።',
  'Yes, cancel': 'አዎ፣ ሰርዝ',

  // seller
  'cash: collect {amount}': 'ጥሬ ገንዘብ፦ {amount} ይቀበሉ',
  'Cash received {date}': 'ጥሬ ገንዘቡ ተቀብሏል {date}',
  'Cash on delivery: not paid yet': 'ሲደርስ በጥሬ ገንዘብ፦ ገና አልተከፈለም',
  'Cash order: collect {amount}': 'የጥሬ ገንዘብ ትዕዛዝ፦ {amount} ይቀበሉ',
  'The buyer pays you in cash at the door or when they pick it up. Tap the button only once you have the money.':
    'ገዢው በበሩ ላይ ወይም ሲወስድ በጥሬ ገንዘብ ይከፍልዎታል። ቁልፉን የሚጫኑት ገንዘቡን ከተቀበሉ በኋላ ብቻ ነው።',
  'Did you receive {amount} in cash?': '{amount} በጥሬ ገንዘብ ተቀብለዋል?',
  'Cash received': 'ጥሬ ገንዘቡ ተቀብያለሁ',
  'Done: {amount} received. Our commission of {fee} is on your balance.': 'ተጠናቋል፦ {amount} ተቀብለዋል። የእኛ ኮሚሽን {fee} በሂሳብዎ ላይ ተመዝግቧል።',
  'Done: {amount} received. The order is complete.': 'ተጠናቋል፦ {amount} ተቀብለዋል። ትዕዛዙ ተጠናቋል።',
  'Cancelled. The buyer was told why; the items are back on sale.': 'ተሰርዟል። ምክንያቱ ለገዢው ተነግሯል፤ ዕቃዎቹ ተመልሰው ለሽያጭ ቀርበዋል።',
  "Can't send it? Cancel the order": 'መላክ አይችሉም? ትዕዛዙን ይሰርዙ',
  'Nothing was paid yet, so there is nothing to refund. The items go back on sale.': 'እስካሁን ምንም ስላልተከፈለ የሚመለስ ገንዘብ የለም። ዕቃዎቹ ተመልሰው ለሽያጭ ይቀርባሉ።',
  'Cancel the order': 'ትዕዛዙን ሰርዝ',
}
