/**
 * Amharic for refunds without staff: the buyer cancels before packing, the seller cancels or settles a problem
 * (refund in full / offer part back), the buyer accepts or declines an offer. First draft: needs a native speaker's
 * review before launch, like the rest of ./am (docs/MARKETPLACE_ROADMAP.md, M18).
 */
export const refunds: Record<string, string> = {
  // buyer: cancel before packing
  'Cancel and get a refund': 'ሰርዝና ገንዘቤን መልስ',
  'Cancel the items from {seller} and get a refund': 'ከ{seller} ያሉትን ዕቃዎች ሰርዝና ገንዘቤን መልስ',
  'Cancel and get {amount} back?': 'ሰርዘው {amount} ይመለስልዎት?',
  'You can cancel until the seller starts packing. The money goes back to how you paid; banks can take a few days.':
    'ሻጩ ማሸግ እስኪጀምር ድረስ መሰረዝ ይችላሉ። ገንዘቡ በከፈሉበት መንገድ ይመለሳል፤ ባንኮች ጥቂት ቀናት ሊወስዱ ይችላሉ።',
  'Why? (optional)': 'ለምን? (አማራጭ)',
  'Yes, cancel and refund': 'አዎ፣ ሰርዝና ገንዘቡን መልስ',
  'Keep the order': 'ትዕዛዙ ይቆይ',
  'Cancelled. {amount} is on its way back to you through BillPay.': 'ተሰርዟል። {amount} በBillPay በኩል ወደ እርስዎ እየተመለሰ ነው።',

  // seller: cancel their parcel
  "Can't send it? Cancel and refund the buyer": 'መላክ አይችሉም? ሰርዘው ለገዢው ገንዘቡን ይመልሱ',
  'Cancel your part of this order?': 'የዚህን ትዕዛዝ የእርስዎን ክፍል ይሰርዙ?',
  'The buyer gets {amount} back through BillPay, you are not paid for it, and the items go back on sale.':
    'ገዢው {amount} በBillPay በኩል ይመለስለታል፣ ለዚህ አይከፈልዎትም፣ ዕቃዎቹም ተመልሰው ለሽያጭ ይቀርባሉ።',
  'Why? (the buyer sees this)': 'ለምን? (ገዢው ያየዋል)',
  'e.g. Sold out in the shop': 'ለምሳሌ፦ በሱቁ ውስጥ አልቋል',
  'Cancel and refund': 'ሰርዝና ገንዘቡን መልስ',
  'Keep it': 'ይቆይ',
  'Cancelled. The buyer gets {amount} back and was told why.': 'ተሰርዟል። ገዢው {amount} ይመለስለታል፤ ምክንያቱም ተነግሮታል።',

  // seller: settle a problem
  'Settle it yourself': 'እርስዎ ራስዎ ይፍቱት',
  'Refund the buyer, or offer part back for a small fault. Otherwise Sodo Gebeya decides.':
    'ለገዢው ገንዘቡን ይመልሱ፣ ወይም ለትንሽ ጉድለት የተወሰነውን ያቅርቡ። ያለበለዚያ ሶዶ ገበያ ይወስናል።',
  'You offered {amount}; waiting for the buyer. You can still refund in full.':
    '{amount} አቅርበዋል፤ ገዢውን እየጠበቅን ነው። አሁንም ሙሉውን መመለስ ይችላሉ።',
  'Refund in full ({amount})': 'ሙሉውን መልስ ({amount})',
  'Offer part back': 'የተወሰነውን አቅርብ',
  'Amount to give back (birr)': 'የሚመለሰው መጠን (ብር)',
  'Less than {amount}; the buyer must accept it.': 'ከ{amount} ያነሰ፤ ገዢው መቀበል አለበት።',
  'The buyer gets {amount} back now through BillPay and you are not paid for this order.':
    'ገዢው አሁን {amount} በBillPay በኩል ይመለስለታል፤ ለዚህ ትዕዛዝ አይከፈልዎትም።',
  'Message to the buyer (optional)': 'ለገዢው መልዕክት (አማራጭ)',
  'Send offer': 'አቅርቦቱን ላክ',
  'Refund now': 'አሁን መልስ',
  'Offer sent. The buyer accepts or declines.': 'አቅርቦቱ ተልኳል። ገዢው ይቀበላል ወይም ይመልሳል።',
  'Refunded in full. The buyer has been told.': 'ሙሉው ገንዘብ ተመልሷል። ለገዢው ተነግሯል።',
  "The money for this order stays held until it's settled. Answer the buyer here, or settle it yourself below: refund in full or offer part back. If you can't agree, Sodo Gebeya decides.":
    'የዚህ ትዕዛዝ ገንዘብ ጉዳዩ እስኪፈታ ድረስ ተይዞ ይቆያል። ለገዢው እዚህ ይመልሱ፣ ወይም ከታች እርስዎ ራስዎ ይፍቱት፦ ሙሉውን ይመልሱ ወይም የተወሰነውን ያቅርቡ። ካልተስማማችሁ ሶዶ ገበያ ይወስናል።',

  // buyer: the seller's offer
  'Offer from the seller': 'ከሻጩ የቀረበ',
  'The seller offers {amount} back. You keep the items.': 'ሻጩ {amount} ለመመለስ አቅርቧል። ዕቃዎቹ ከእርስዎ ጋር ይቆያሉ።',
  'Accept and the money goes back to you through BillPay; the seller is paid the rest. Decline and Sodo Gebeya decides.':
    'ከተቀበሉ ገንዘቡ በBillPay በኩል ይመለስልዎታል፤ ሻጩ ቀሪውን ይከፈለዋል። ካልተቀበሉ ሶዶ ገበያ ይወስናል።',
  'Accept {amount}': '{amount} ተቀበል',
  'Decline': 'አልቀበልም',
  'Accepted: {amount} is on its way back to you.': 'ተቀብለዋል፦ {amount} ወደ እርስዎ እየተመለሰ ነው።',
  'Declined. Sodo Gebeya will decide.': 'አልተቀበሉም። ሶዶ ገበያ ይወስናል።',
}
