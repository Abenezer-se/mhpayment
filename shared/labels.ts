/** Amharic labels for fixed system codes. (Business data like departments/prices lives in the DB.) */
export const STATUS_LABEL: Record<string, string> = {
  UNPAID: "አልተከፈለም",
  PENDING: "በማረጋገጥ ላይ",
  PAID: "ተከፍሏል",
  REJECTED: "አልተቀበለም",
};
export const TX_STATUS_LABEL: Record<string, string> = {
  PENDING: "በማረጋገጥ ላይ",
  VERIFIED: "ተረጋግጧል",
  REJECTED: "አልተቀበለም",
  VOIDED: "ተሰርዟል",
};
export const METHOD_LABEL: Record<string, string> = {
  CASH: "ጥሬ ገንዘብ",
  MOBILE_BANKING: "ሞባይል ባንክ",
};
export const ROLE_LABEL: Record<string, string> = {
  ADMIN: "ዋና አስተዳዳሪ",
  FINANCE: "የገንዘብ ያዥ",
  MEMBER: "አባል",
};
export const AUDIT_LABEL: Record<string, string> = {
  MEMBER_REGISTERED: "አባል ተመዝግቧል",
  MEMBER_UPDATED: "የአባል መረጃ ተሻሽሏል",
  MEMBER_DEACTIVATED: "አባል ታግዷል",
  MEMBER_ACTIVATED: "አባል ተመልሷል",
  PASSWORD_RESET: "የይለፍ ቃል ተቀይሯል (በአስተዳዳሪ)",
  PASSWORD_CHANGED: "ተጠቃሚው የይለፍ ቃሉን ቀይሯል",
  PAYMENT_RECORDED: "ክፍያ በእጅ ተመዝግቧል",
  PAYMENT_SUBMITTED: "የክፍያ ማረጋገጫ ገብቷል",
  PAYMENT_APPROVED: "የክፍያ ማረጋገጫ ተቀባይነት አግኝቷል",
  PAYMENT_REJECTED: "የክፍያ ማረጋገጫ ውድቅ ተደርጓል",
  PAYMENT_VOIDED: "ክፍያ ተሰርዟል",
  PRICE_CHANGED: "የክፍያ መጠን ተሻሽሏል",
  LOOKUP_CREATED: "አዲስ ዝርዝር ተጨምሯል",
  LOOKUP_UPDATED: "ዝርዝር ተሻሽሏል",
  LOOKUP_DELETED: "ዝርዝር ተሰርዟል",
  SETTINGS_CHANGED: "የድርጅት ቅንብር ተሻሽሏል",
  LOGO_CHANGED: "አርማ ተቀይሯል",
  STAFF_CREATED: "የገንዘብ ያዥ ተፈጥሯል",
  STAFF_UPDATED: "የገንዘብ ያዥ መረጃ ተሻሽሏል",
  CREDENTIAL_VIEWED: "የመጀመሪያ ይለፍ ቃል ታይቷል",
  CREDENTIAL_EXPORTED: "የመጀመሪያ መግቢያ መረጃ ወርዷል",
  CREDENTIALS_GENERATED: "የመጀመሪያ ይለፍ ቃሎች ተፈጥረዋል",
};
