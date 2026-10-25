/** Amharic: Jobs board, employers, shared job parts. */
export const work: Record<string, string> = {
  // ---- shared labels (lib/work-api.ts maps; also used by profile / CV pages) ----
  // JOB_TYPE_LABEL
  'Full time': 'ሙሉ ጊዜ',
  'Part time': 'ትርፍ ጊዜ',
  Internship: 'ልምምድ',
  Contract: 'ኮንትራት',
  // APP_STATUS_LABEL
  Sent: 'ተልኳል',
  Shortlisted: 'ተመርጠዋል',
  Interview: 'ቃለ መጠይቅ',
  Hired: 'ተቀጥረዋል',
  'Not selected': 'አልተመረጡም',
  // TALENT_STATUS_LABEL
  Student: 'ተማሪ',
  Graduate: 'ተመራቂ',
  'Looking for work': 'ሥራ በመፈለግ ላይ',
  'Working, open to offers': 'እየሠራሁ ነው፣ ለአዲስ ዕድል ዝግጁ ነኝ',
  // profile facts
  Education: 'ትምህርት',
  Skills: 'ክህሎቶች',
  Languages: 'ቋንቋዎች',
  Experience: 'የሥራ ልምድ',
  'Verified student': 'የተረጋገጠ ተማሪ',
  'Uploaded PDF': 'የተጫነ PDF',
  'Something went wrong': 'የሆነ ችግር ተፈጥሯል',
  Back: 'ይመለሱ',

  // ---- jobs tabs (WorkNav) ----
  'My profile': 'የእኔ ፕሮፋይል',
  'Free CV': 'ነጻ CV',
  Applied: 'ያመለከቱት',
  Hiring: 'ቅጥር',
  'Use a customer account': 'የደንበኛ መለያ ይጠቀሙ',
  'Jobs and CVs are for customer accounts. Staff manage them in the admin pages.':
    'ሥራና CV ለደንበኛ መለያዎች ናቸው። ሠራተኞች በአስተዳዳሪ ገጾች ያስተዳድሯቸዋል።',

  // ---- deadlines and salary ----
  'Closes today': 'ዛሬ ይዘጋል',
  '1 day left': '1 ቀን ቀርቷል',
  '{n} days left': '{n} ቀናት ቀርተዋል',
  '{min}–{max} birr': '{min}–{max} ብር',
  'From {n} birr': 'ከ{n} ብር ጀምሮ',
  'Up to {n} birr': 'እስከ {n} ብር',
  'Salary not listed': 'ደመወዝ አልተገለጸም',
  '{n} birr': '{n} ብር',

  // ---- job board ----
  'The jobs board is coming soon': 'የሥራ ማስታወቂያ ሰሌዳው በቅርቡ ይመጣል',
  "Make your free profile and CV now, so you're ready.": 'ዝግጁ እንዲሆኑ ነጻ ፕሮፋይልዎንና CVዎን አሁኑኑ ይሥሩ።',
  'Jobs in Wolaita Sodo': 'በወላይታ ሶዶ ያሉ ሥራዎች',
  'Find work near you. Apply in one tap.': 'በአቅራቢያዎ ሥራ ያግኙ። በአንድ ንክኪ ያመልክቱ።',
  'Every job is checked by our team. Never pay anyone to apply.': 'እያንዳንዱ ሥራ በቡድናችን ይመረመራል። ለማመልከት ለማንም በፍጹም አይክፈሉ።',
  'Accountant, nurse, driver…': 'የሂሳብ ባለሙያ፣ ነርስ፣ ሹፌር…',
  'Search jobs': 'ሥራዎችን ይፈልጉ',
  'All jobs': 'ሁሉም ሥራዎች',
  "No jobs match yet. New jobs arrive every week. Make your profile so you're ready.":
    'እስካሁን የሚዛመድ ሥራ የለም። በየሳምንቱ አዳዲስ ሥራዎች ይገባሉ። ዝግጁ እንዲሆኑ ፕሮፋይልዎን ይሥሩ።',
  'Your free profile': 'ነጻ ፕሮፋይልዎ',
  'One profile, one tap to apply. Employers see your skills and your CV.':
    'አንድ ፕሮፋይል፣ ለማመልከት አንድ ንክኪ። ቀጣሪዎች ክህሎቶችዎንና CVዎን ያያሉ።',
  'Make my profile': 'ፕሮፋይሌን ልሥራ',
  'Need a strong CV?': 'ጠንካራ CV ይፈልጋሉ?',
  'Our team writes it for you, from {price} birr.': 'ቡድናችን ይጽፍልዎታል፣ ከ{price} ብር ጀምሮ።',
  'See CV packages': 'የCV ጥቅሎችን ይመልከቱ',
  'Post your first job free. We check it and it goes live.': 'የመጀመሪያ የሥራ ማስታወቂያዎን በነጻ ይለጥፉ። እኛ እንመረምረዋለን፣ ከዚያ ይታያል።',
  'Post a job and get applications with CVs.': 'የሥራ ማስታወቂያ ይለጥፉና ከCV ጋር ማመልከቻዎችን ያግኙ።',
  'Post a job': 'የሥራ ማስታወቂያ ይለጥፉ',

  // ---- job page and apply ----
  "This job isn't open": 'ይህ ሥራ ክፍት አይደለም',
  'It may have closed or been filled. {link}.': 'ተዘግቶ ወይም ሰው ተቀጥሮበት ሊሆን ይችላል። {link}።',
  'See other jobs': 'ሌሎች ሥራዎችን ይመልከቱ',
  'Apply by {date} ({left})': 'የመጨረሻ ቀን {date} ({left})',
  'Manage this job': 'ይህን ሥራ ያስተዳድሩ',
  'You applied': 'አመልክተዋል',
  'Posted {date}': 'የተለጠፈው {date}',
  'About the job': 'ስለ ሥራው',
  "What they're looking for": 'የሚፈልጉት',
  'Safety:': 'ጥንቃቄ፦',
  'real employers never ask you to pay to apply, for training, or for a uniform. If anyone does, report it to us.':
    'እውነተኛ ቀጣሪዎች ለማመልከቻ፣ ለስልጠና ወይም ለዩኒፎርም እንዲከፍሉ በፍጹም አይጠይቁም። ማንም ቢጠይቅዎ ለእኛ ያሳውቁ።',
  'Sent! The employer can now see your profile and phone number.': 'ተልኳል! ቀጣሪው አሁን ፕሮፋይልዎንና ስልክ ቁጥርዎን ማየት ይችላል።',
  'Apply for {title}': 'ለ{title} ያመልክቱ',
  '{employer} sees your profile, your CV and your phone number.': '{employer} ፕሮፋይልዎን፣ CVዎንና ስልክ ቁጥርዎን ያያል።',
  'Make your free profile first. It takes 3 minutes and you use it for every job.':
    'መጀመሪያ ነጻ ፕሮፋይልዎን ይሥሩ። 3 ደቂቃ ብቻ ይወስዳል፤ ለሁሉም ሥራ ይጠቀሙበታል።',
  'Which CV?': 'የትኛው CV?',
  'My Sodo Gebeya CV': 'የሶዶ ገበያ CVዬ',
  'Made from your profile': 'ከፕሮፋይልዎ የተሠራ',
  'A short note to the employer (optional)': 'ለቀጣሪው አጭር መልዕክት (አማራጭ)',
  'Send application': 'ማመልከቻ ይላኩ',

  // ---- my applications ----
  'My applications': 'ማመልከቻዎቼ',
  'We send you an SMS when an employer wants to interview you.': 'ቀጣሪ ለቃለ መጠይቅ ሲፈልግዎ በSMS እናሳውቅዎታለን።',
  "You haven't applied yet.": 'እስካሁን አላመለከቱም።',
  'See jobs': 'ሥራዎችን ይመልከቱ',
  'Job removed': 'ሥራው ተወግዷል',
  'applied {date}': '{date} ያመለከቱ',

  // ---- employer: my job posts ----
  Checking: 'በመመርመር ላይ',
  'Not approved': 'አልጸደቀም',
  Closed: 'ተዘግቷል',
  'Find people': 'ሰዎችን ያግኙ',
  'Find good people in Sodo': 'በሶዶ ጥሩ ሠራተኞችን ያግኙ',
  'Post a job. We check it, it goes live, and applications arrive here with CVs and phone numbers.':
    'የሥራ ማስታወቂያ ይለጥፉ። እኛ እንመረምረዋለን፣ ይታያል፣ ማመልከቻዎችም ከCVና ከስልክ ቁጥር ጋር እዚህ ይደርሳሉ።',
  'posted {date}': '{date} የተለጠፈ',
  'Fee {fee} birr not received yet. See how to pay below.': 'የ{fee} ብር ክፍያው ገና አልደረሰንም። እንዴት እንደሚከፍሉ ከታች ይመልከቱ።',
  'How to pay the job post fee': 'የሥራ ማስታወቂያ ክፍያን እንዴት እንደሚከፍሉ',
  'Send the fee by telebirr or bank transfer to {phone}, then call or message us with the job title.':
    'ክፍያውን በቴሌብር ወይም በባንክ ዝውውር ወደ {phone} ይላኩ፣ ከዚያ የሥራውን ርዕስ ይዘው ይደውሉልን ወይም መልዕክት ይላኩልን።',
  'Send the fee by telebirr or bank transfer, then call or message us with the job title.':
    'ክፍያውን በቴሌብር ወይም በባንክ ዝውውር ይላኩ፣ ከዚያ የሥራውን ርዕስ ይዘው ይደውሉልን ወይም መልዕክት ይላኩልን።',
  'We mark it paid and your job goes live after our check.': 'ክፍያውን እንመዘግባለን፤ ከምርመራችን በኋላ ሥራዎ ይታያል።',

  // ---- employer: applicants ----
  'Done. We sent them an SMS.': 'ተጠናቋል። በSMS አሳውቀናቸዋል።',
  'Job closed': 'ሥራው ተዘግቷል',
  '{n} application': '{n} ማመልከቻ',
  '{n} applications': '{n} ማመልከቻዎች',
  'See the post': 'ማስታወቂያውን ይመልከቱ',
  'Close job': 'ሥራውን ይዝጉ',
  'No applications yet.': 'እስካሁን ምንም ማመልከቻ የለም።',
  'Open their CV': 'CVያቸውን ይክፈቱ',
  'See their profile': 'ፕሮፋይላቸውን ይመልከቱ',

  // ---- employer: find people ----
  'Skill or field, e.g. accounting': 'ክህሎት ወይም ዘርፍ፣ ለምሳሌ ሂሳብ አያያዝ',
  'Search people': 'ሰዎችን ይፈልጉ',
  'People who chose to be found. Their phone number shows once they apply to one of your jobs.':
    'ለመገኘት የፈቀዱ ሰዎች። ስልክ ቁጥራቸው የሚታየው ከሥራዎችዎ ለአንዱ ሲያመለክቱ ነው።',
  'No one matches yet.': 'እስካሁን የሚዛመድ ሰው የለም።',
  'Profile not available': 'ፕሮፋይሉ አይገኝም',

  // ---- post a job ----
  'Sent! We check every job, usually within a few hours.': 'ተልኳል! እያንዳንዱን ሥራ እንመረምራለን፤ ብዙውን ጊዜ በጥቂት ሰዓታት ውስጥ።',
  'Job posts are coming soon': 'የሥራ ማስታወቂያዎች በቅርቡ ይመጣሉ',
  'Your first job post is {free}.': 'የመጀመሪያው የሥራ ማስታወቂያዎ {free} ነው።',
  free: 'ነጻ',
  'A job post costs {price}, paid by telebirr or bank after you send it.':
    'የአንድ የሥራ ማስታወቂያ ዋጋ {price} ነው፤ ከላኩት በኋላ በቴሌብር ወይም በባንክ ይከፈላል።',
  'Our team checks it before it goes live.': 'ከመታየቱ በፊት ቡድናችን ይመረምረዋል።',
  'Job title': 'የሥራው መጠሪያ',
  Accountant: 'የሂሳብ ባለሙያ',
  'Employer name': 'የቀጣሪው ስም',
  'Your business': 'የእርስዎ ድርጅት',
  Place: 'ቦታ',
  'Field (optional)': 'ዘርፍ (አማራጭ)',
  'Health, finance, sales…': 'ጤና፣ ፋይናንስ፣ ሽያጭ…',
  Type: 'ዓይነት',
  'What the job is': 'ሥራው ምንድን ነው',
  'Daily tasks, hours, who they work with.': 'የዕለት ተግባራት፣ የሥራ ሰዓት፣ ከማን ጋር እንደሚሠሩ።',
  "Who you're looking for (optional)": 'የሚፈልጉት ሰው (አማራጭ)',
  'Education, experience, languages.': 'ትምህርት፣ የሥራ ልምድ፣ ቋንቋዎች።',
  'Salary from (birr)': 'ደመወዝ ከ (ብር)',
  'Salary to (birr)': 'ደመወዝ እስከ (ብር)',
  'Apply by': 'የማመልከቻ የመጨረሻ ቀን',
  'Salary note (optional)': 'ስለ ደመወዝ ማስታወሻ (አማራጭ)',
  'Monthly, plus lunch': 'በወር፣ ምሳን ጨምሮ',
  'Posts that ask applicants to pay anything (fees, deposits, training) are not allowed.':
    'አመልካቾች ማንኛውንም ክፍያ (የአገልግሎት ክፍያ፣ ቅድመ ክፍያ፣ ስልጠና) እንዲከፍሉ የሚጠይቁ ማስታወቂያዎች አይፈቀዱም።',
  'Send for checking': 'ለምርመራ ይላኩ',
}
