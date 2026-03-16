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

const BANK_SENDER_PATTERNS: Record<string, string> = {
  HDFCBK: 'HDFC Bank',
  SBIINB: 'SBI',
  ICICIB: 'ICICI Bank',
  AXISBK: 'Axis Bank',
  KOTAKB: 'Kotak Bank',
  PNBSMS: 'PNB',
  BOIIND: 'Bank of India',
  CANBNK: 'Canara Bank',
  UNIONB: 'Union Bank',
  YESBNK: 'Yes Bank',
  INDUSB: 'IndusInd Bank',
  SCBANK: 'Standard Chartered',
  HSBCIN: 'HSBC',
  CBSSBI: 'SBI',
  SBIUPI: 'SBI UPI',
  PAYTMB: 'Paytm Bank',
  IDBIBK: 'IDBI Bank',
  FEDBKM: 'Federal Bank',
  RBLBNK: 'RBL Bank',
  BARODN: 'Bank of Baroda',
  SYNDBK: 'Syndicate Bank',
  CENTBK: 'Central Bank',
  MAHBNK: 'Maharashtra Bank',
  OBCBNK: 'OBC',
  ALLBNK: 'Allahabad Bank',
  ANDBNK: 'Andhra Bank',
  UCOBKL: 'UCO Bank',
  VJYBKL: 'Vijaya Bank',
  CORPBK: 'Corporation Bank',
  DENABN: 'Dena Bank',
  ORNTBK: 'Oriental Bank',
};

const SIGNAL_WORDS = [
  'debited', 'credited', 'debit', 'credit',
  'inr', 'rs.', '₹', 'upi', 'imps', 'neft', 'rtgs',
  'withdrawn', 'deposited', 'transferred', 'payment',
  'transaction', 'spent', 'received', 'balance',
  'a/c', 'acct', 'account', 'bank',
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

function isBankSms(address: string, body: string): boolean {
  const upperAddr = address.toUpperCase();
  const isKnownSender = Object.keys(BANK_SENDER_PATTERNS).some(fragment =>
    upperAddr.includes(fragment)
  );
  if (isKnownSender) return true;

  const lowerBody = body.toLowerCase();
  const signalCount = SIGNAL_WORDS.filter(word => lowerBody.includes(word)).length;
  return signalCount >= 2;
}

function isOtpOrPromo(body: string): boolean {
  if (OTP_PATTERNS.some(p => p.test(body))) return true;
  if (PROMO_PATTERNS.some(p => p.test(body))) return true;
  return false;
}

function parseAmount(body: string): number | null {
  const patterns = [
    /(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/i,
    /([\d,]+(?:\.\d{1,2})?)\s*(?:INR|Rs\.?|₹)/i,
    /(?:of|for|amount)\s+(?:INR|Rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,
  ];

  for (const pattern of patterns) {
    const match = body.match(pattern);
    if (match) {
      const amount = parseFloat(match[1].replace(/,/g, ''));
      if (!isNaN(amount) && amount > 0) return amount;
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

  for (const kw of debitKeywords) {
    if (lowerBody.includes(kw)) debitScore++;
  }
  for (const kw of creditKeywords) {
    if (lowerBody.includes(kw)) creditScore++;
  }

  return creditScore > debitScore ? 'credit' : 'debit';
}

function parseBank(address: string, body: string): string {
  const upperAddr = address.toUpperCase();
  for (const [fragment, bankName] of Object.entries(BANK_SENDER_PATTERNS)) {
    if (upperAddr.includes(fragment)) return bankName;
  }

  const bankBodyMatch = body.match(/(?:from|to|via)\s+([A-Z][a-zA-Z\s]{2,20}(?:Bank|Pay|UPI))/);
  if (bankBodyMatch) return bankBodyMatch[1].trim();

  return 'Unknown Bank';
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
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseSmsMessage(sms: RawSms): ParsedSmsTransaction | null {
  if (!isBankSms(sms.address, sms.body)) return null;
  if (isOtpOrPromo(sms.body)) return null;

  const amount = parseAmount(sms.body);
  if (!amount) return null;

  const type = parseType(sms.body);
  const bank = parseBank(sms.address, sms.body);
  const merchant = parseMerchant(sms.body);
  const date = formatDate(sms.date);

  const description = merchant
    ? `${type === 'debit' ? 'Payment to' : 'Received from'} ${merchant}`
    : `${type === 'debit' ? 'Debit' : 'Credit'} via ${bank}`;

  return {
    amount,
    type,
    bank,
    merchant,
    date,
    description,
    smsId: sms._id,
  };
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
      parsed.push({
        ...result,
        alreadyImported: importedIds.has(sms._id),
      });
    }
  }

  return { parsed, bankSmsCount };
}
