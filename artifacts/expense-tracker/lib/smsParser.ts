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
  AXISBK: 'Axis Bank',
  AXISBK2: 'Axis Bank',
  AXISNB: 'Axis Bank',
  AXISCC: 'Axis Credit Card',
  SBIINB: 'SBI',
  CBSSBI: 'SBI',
  SBIUPI: 'SBI UPI',
  SBIPSG: 'SBI',
  SBIBNK: 'SBI',
};

const BANK_BODY_KEYWORDS: string[] = [
  'axis bank', 'axisbank', 'sbi', 'state bank',
  'axis credit card', 'axis cc',
];

const SIGNAL_WORDS = [
  'debited', 'credited', 'debit', 'credit',
  'inr', 'rs.', '₹', 'upi', 'imps', 'neft', 'rtgs',
  'withdrawn', 'deposited', 'transferred', 'payment',
  'transaction', 'spent', 'received', 'balance',
  'a/c', 'acct', 'account',
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
  const isKnownSender = Object.keys(BANK_SENDER_PATTERNS).some(fragment =>
    upperAddr.includes(fragment)
  );
  if (isKnownSender) return true;

  const lowerBody = body.toLowerCase();
  const hasBodyKeyword = BANK_BODY_KEYWORDS.some(kw => lowerBody.includes(kw));
  if (!hasBodyKeyword) return false;

  const signalCount = SIGNAL_WORDS.filter(word => lowerBody.includes(word)).length;
  return signalCount >= 2;
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
  for (const [fragment, bankName] of Object.entries(BANK_SENDER_PATTERNS)) {
    if (upperAddr.includes(fragment)) return bankName;
  }

  const lowerBody = body.toLowerCase();
  if (lowerBody.includes('axis bank') || lowerBody.includes('axisbank')) return 'Axis Bank';
  if (lowerBody.includes('axis credit') || lowerBody.includes('axis cc')) return 'Axis Credit Card';
  if (lowerBody.includes('state bank') || lowerBody.includes(' sbi')) return 'SBI';

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
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
