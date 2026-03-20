export interface ParsedSmsTransaction {
  amount: number;
  type: 'debit' | 'credit';
  bank: string;
  merchant: string;
  date: string;
  description: string;
  smsId: string;
}

export interface RawSms {
  _id: string;
  address: string;
  body: string;
  date: number;
}

const BANK_SENDER_FRAGMENTS: { fragment: string; name: string }[] = [
  { fragment: 'AXISBK', name: 'Axis Bank' },
  { fragment: 'AXISNB', name: 'Axis Bank' },
  { fragment: 'AXISCC', name: 'Axis Credit Card' },
  { fragment: 'SBIINB', name: 'SBI' },
  { fragment: 'CBSSBI', name: 'SBI' },
  { fragment: 'SBIUPI', name: 'SBI' },
  { fragment: 'SBIPSG', name: 'SBI' },
  { fragment: 'SBIBNK', name: 'SBI' },
  { fragment: 'HDFCBK', name: 'HDFC Bank' },
  { fragment: 'HDFCBANKIND', name: 'HDFC Bank' },
  { fragment: 'ICICIB', name: 'ICICI Bank' },
  { fragment: 'ICICIT', name: 'ICICI Bank' },
  { fragment: 'KOTAKB', name: 'Kotak Bank' },
  { fragment: 'KOTAK', name: 'Kotak Bank' },
  { fragment: 'INDBNK', name: 'Indian Bank' },
  { fragment: 'INDBK', name: 'Indian Bank' },
  { fragment: 'INDBN', name: 'Indian Bank' },
  { fragment: 'IOBSMS', name: 'Indian Overseas Bank' },
  { fragment: 'IOBCHN', name: 'Indian Overseas Bank' },
  { fragment: 'PNBSMS', name: 'Punjab National Bank' },
  { fragment: 'PNBALR', name: 'Punjab National Bank' },
  { fragment: 'BOISG', name: 'Bank of India' },
  { fragment: 'BOIIND', name: 'Bank of India' },
  { fragment: 'BOISMS', name: 'Bank of India' },
  { fragment: 'BOBIPR', name: 'Bank of Baroda' },
  { fragment: 'BOBSMS', name: 'Bank of Baroda' },
  { fragment: 'CANBSM', name: 'Canara Bank' },
  { fragment: 'CANBK', name: 'Canara Bank' },
  { fragment: 'CNRBNK', name: 'Canara Bank' },
  { fragment: 'CENTBK', name: 'Central Bank of India' },
  { fragment: 'CORPBK', name: 'Corporation Bank' },
  { fragment: 'UNIONB', name: 'Union Bank' },
  { fragment: 'UCOBNK', name: 'UCO Bank' },
  { fragment: 'SCBNKI', name: 'Standard Chartered' },
  { fragment: 'YESBNK', name: 'Yes Bank' },
  { fragment: 'IDBIBN', name: 'IDBI Bank' },
  { fragment: 'IDFCBK', name: 'IDFC Bank' },
  { fragment: 'PAYTMB', name: 'Paytm Bank' },
  { fragment: 'INDUSB', name: 'IndusInd Bank' },
  { fragment: 'RBLBNK', name: 'RBL Bank' },
  { fragment: 'FEDBNK', name: 'Federal Bank' },
  { fragment: 'KVBSMS', name: 'Karur Vysya Bank' },
  { fragment: 'JKBANK', name: 'J&K Bank' },
  { fragment: 'SYNBNK', name: 'Syndicate Bank' },
  { fragment: 'DENABN', name: 'Dena Bank' },
  { fragment: 'ALLBNK', name: 'Allahabad Bank' },
  { fragment: 'ANDBKN', name: 'Andhra Bank' },
  { fragment: 'TMBLSM', name: 'Tamilnad Mercantile Bank' },
  { fragment: 'CITIBK', name: 'Citi Bank' },
  { fragment: 'HSBCIN', name: 'HSBC India' },
  { fragment: 'AMEXIN', name: 'Amex India' },
];

const SIGNAL_WORDS = [
  'debited', 'credited', 'debit', 'credit',
  'inr', 'rs.', '₹', 'upi', 'imps', 'neft', 'rtgs',
  'withdrawn', 'deposited', 'transferred', 'payment',
  'transaction', 'spent', 'received', 'balance',
  'a/c', 'acct', 'account', 'avbl', 'available',
  'successful', 'approved', 'cleared',
];

const OTP_PATTERNS = [
  /\botp\b/i,
  /\bone.?time.?password\b/i,
  /\bverification.?code\b/i,
  /\b\d{4,8}\s*is\s*(your|the)\s*(otp|code|pin)\b/i,
  /do\s*not\s*share/i,
];

const PROMO_PATTERNS = [
  /offer|cashback|discount|reward|earn|bonus|loot|deal|sale|click|visit|apply/i,
  /congratulations|you.?ve\s*won|selected|eligible/i,
];

const AUTOPAY_PATTERNS = [
  /auto.?pay/i,
  /standing\s*instruction/i,
  /\bsi\s*(created|registered|cancelled|revoked|set up|activated|deactivated|updated|modified|deleted)\b/i,
  /mandate\s*(created|registered|cancelled|revoked|approved|rejected|success|failed|activated|deactivated)/i,
  /\bnach\b/i,
  /auto.?debit\s*(created|registered|mandate|set|enabled|disabled)/i,
  /emi\s*(registered|mandate|set up|created)/i,
  /recurring\s*(payment|mandate|instruction)\s*(set|created|registered)/i,
  /\bregistered\b.*\b(mandate|autopay|si)\b/i,
  /\b(mandate|autopay|si)\b.*\bregistered\b/i,
];

function isFromKnownBank(address: string, body: string): boolean {
  const upperAddr = address.toUpperCase();
  for (const { fragment } of BANK_SENDER_FRAGMENTS) {
    if (upperAddr.includes(fragment)) return true;
  }

  const lowerBody = body.toLowerCase();
  const signalCount = SIGNAL_WORDS.filter(w => lowerBody.includes(w)).length;

  if (signalCount >= 4) return true;
  if (signalCount >= 2) {
    const bankWords = [
      'bank', 'hdfc', 'icici', 'axis', 'sbi', 'indian bank', 'iob',
      'pnb', 'kotak', 'canara', 'union bank', 'bob', 'boi',
      'yes bank', 'idbi', 'idfc', 'indusind', 'federal bank',
      'paytm', 'phonepay', 'gpay', 'upi id',
    ];
    return bankWords.some(kw => lowerBody.includes(kw));
  }
  return false;
}

function isOtpOrPromo(body: string): boolean {
  if (OTP_PATTERNS.some(p => p.test(body))) return true;
  if (PROMO_PATTERNS.some(p => p.test(body))) return true;
  return false;
}

function isAutopayOrMandateMessage(body: string): boolean {
  return AUTOPAY_PATTERNS.some(p => p.test(body));
}

function parseAmount(body: string): number | null {
  const patterns = [
    /(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/i,
    /([\d,]+(?:\.\d{1,2})?)\s*(?:INR|Rs\.?|₹)/i,
    /(?:of|for|amount)\s+(?:INR|Rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,
    /(?:debited|credited|withdrawn|deposited)\s+(?:with\s+)?(?:INR|Rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,
  ];
  for (const pattern of patterns) {
    const match = body.match(pattern);
    if (match) {
      const amount = parseFloat(match[1].replace(/,/g, ''));
      if (!isNaN(amount) && amount > 0 && amount < 10000000) return amount;
    }
  }
  return null;
}

function parseType(body: string): 'debit' | 'credit' {
  const lowerBody = body.toLowerCase();
  const debitKeywords = ['debited', 'debit', 'spent', 'withdrawn', 'paid', 'payment made', 'purchase', 'sent', 'transferred from'];
  const creditKeywords = ['credited', 'credit', 'received', 'deposited', 'refund', 'transferred to', 'added'];
  let debitScore = 0;
  let creditScore = 0;
  for (const kw of debitKeywords) { if (lowerBody.includes(kw)) debitScore++; }
  for (const kw of creditKeywords) { if (lowerBody.includes(kw)) creditScore++; }
  return creditScore > debitScore ? 'credit' : 'debit';
}

function parseBank(address: string, body: string): string {
  const upperAddr = address.toUpperCase();
  for (const { fragment, name } of BANK_SENDER_FRAGMENTS) {
    if (upperAddr.includes(fragment)) return name;
  }

  const lowerBody = body.toLowerCase();
  const bodyBankMap: [string, string][] = [
    ['indian bank', 'Indian Bank'],
    ['indian overseas', 'Indian Overseas Bank'],
    ['hdfc', 'HDFC Bank'],
    ['icici', 'ICICI Bank'],
    ['axis bank', 'Axis Bank'],
    ['axis credit', 'Axis Credit Card'],
    ['kotak', 'Kotak Bank'],
    ['state bank', 'SBI'],
    [' sbi', 'SBI'],
    ['punjab national', 'PNB'],
    ['bank of india', 'Bank of India'],
    ['bank of baroda', 'Bank of Baroda'],
    ['canara', 'Canara Bank'],
    ['central bank', 'Central Bank of India'],
    ['union bank', 'Union Bank'],
    ['yes bank', 'Yes Bank'],
    ['idbi', 'IDBI Bank'],
    ['idfc', 'IDFC Bank'],
    ['indusind', 'IndusInd Bank'],
    ['federal bank', 'Federal Bank'],
    ['paytm', 'Paytm Bank'],
  ];
  for (const [kw, name] of bodyBankMap) {
    if (lowerBody.includes(kw)) return name;
  }
  return 'Bank';
}

function parseMerchant(body: string): string {
  const upiMatch = body.match(/(?:to|from|at)\s+([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+)/i);
  if (upiMatch) return upiMatch[1];
  const atMatch = body.match(/(?:at|to|from)\s+([A-Z][A-Za-z0-9\s&'.-]{2,30}?)(?:\s+on|\s+via|\s*\.|\s*,|\s*using|\s*for|\s*\|)/);
  if (atMatch) return atMatch[1].trim();
  const merchantMatch = body.match(/(?:merchant|payee|towards)\s*:?\s*([A-Za-z0-9\s&'.-]{2,30})/i);
  if (merchantMatch) return merchantMatch[1].trim();
  return '';
}

function formatDate(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function parseSmsMessage(sms: RawSms): ParsedSmsTransaction | null {
  if (!isFromKnownBank(sms.address, sms.body)) return null;
  if (isOtpOrPromo(sms.body)) return null;
  if (isAutopayOrMandateMessage(sms.body)) return null;
  const amount = parseAmount(sms.body);
  if (!amount) return null;
  const type = parseType(sms.body);
  const bank = parseBank(sms.address, sms.body);
  const merchant = parseMerchant(sms.body);
  const date = formatDate(sms.date);
  const description = merchant
    ? `${type === 'debit' ? 'Payment to' : 'Received from'} ${merchant}`
    : `${type === 'debit' ? 'Debit' : 'Credit'} via ${bank}`;
  return { amount, type, bank, merchant, date, description, smsId: sms._id };
}

export function processSmsChunk(
  smsList: RawSms[],
  importedIds: Set<string>
): {
  parsed: (ParsedSmsTransaction & { alreadyImported: boolean })[];
  bankSmsCount: number;
} {
  let bankSmsCount = 0;
  const parsed: (ParsedSmsTransaction & { alreadyImported: boolean })[] = [];
  for (const sms of smsList) {
    const result = parseSmsMessage(sms);
    if (result) {
      bankSmsCount++;
      parsed.push({ ...result, alreadyImported: importedIds.has(sms._id) });
    }
  }
  return { parsed, bankSmsCount };
}
