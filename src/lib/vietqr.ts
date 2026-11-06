import QRCode from "qrcode";

export interface VietQrBankInfo {
  bin: string;
  code: string;
  shortName: string;
  name: string;
}

export const VIETQR_BANKS: readonly VietQrBankInfo[] = [
  {
    bin: "970436",
    code: "VCB",
    shortName: "Vietcombank",
    name: "Ngân hàng TMCP Ngoại thương Việt Nam (Vietcombank)",
  },
  {
    bin: "970422",
    code: "MB",
    shortName: "MBBank",
    name: "Ngân hàng TMCP Quân đội (MBBank)",
  },
  {
    bin: "970407",
    code: "TCB",
    shortName: "Techcombank",
    name: "Ngân hàng TMCP Kỹ thương Việt Nam (Techcombank)",
  },
  {
    bin: "970416",
    code: "ACB",
    shortName: "ACB",
    name: "Ngân hàng TMCP Á Châu (ACB)",
  },
  {
    bin: "970418",
    code: "BIDV",
    shortName: "BIDV",
    name: "Ngân hàng TMCP Đầu tư và Phát triển Việt Nam (BIDV)",
  },
  {
    bin: "970415",
    code: "ICB",
    shortName: "VietinBank",
    name: "Ngân hàng TMCP Công thương Việt Nam (VietinBank)",
  },
  {
    bin: "970432",
    code: "VPB",
    shortName: "VPBank",
    name: "Ngân hàng TMCP Việt Nam Thịnh Vượng (VPBank)",
  },
  {
    bin: "970423",
    code: "TPB",
    shortName: "TPBank",
    name: "Ngân hàng TMCP Tiên Phong (TPBank)",
  },
  {
    bin: "970405",
    code: "VBA",
    shortName: "Agribank",
    name: "Ngân hàng Nông nghiệp và Phát triển Nông thôn Việt Nam (Agribank)",
  },
] as const;

export function findBankByBinOrCode(
  binOrCode: string | null | undefined
): VietQrBankInfo | undefined {
  if (!binOrCode) return undefined;
  const key = binOrCode.trim().toUpperCase();
  return VIETQR_BANKS.find(
    (b) =>
      b.bin === key ||
      b.code.toUpperCase() === key ||
      b.shortName.toUpperCase() === key
  );
}

export function stripVietnameseDiacritics(input: string): string {
  if (!input) return "";
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

export function sanitizeAccountName(input: string | null | undefined): string {
  if (!input) return "";
  return stripVietnameseDiacritics(input)
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const sanitizeAsciiUpper = sanitizeAccountName;

/**
 * Formats invoice transfer memo as "HP <STUDENTCODE> <INVOICENO>"
 * Example: studentCode="HS-001", invoiceNumber="INV-202611-0001" -> "HP HS001 INV2026110001"
 */
export function formatTransferMemo(
  studentCode: string,
  invoiceNumber: string
): string {
  const cleanStudent = stripVietnameseDiacritics(studentCode || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  const cleanInvoice = stripVietnameseDiacritics(invoiceNumber || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return `HP ${cleanStudent} ${cleanInvoice}`.trim().slice(0, 50).trim();
}

function tlv(id: string, value: string): string {
  const len = value.length.toString().padStart(2, "0");
  return `${id}${len}${value}`;
}

/**
 * Computes EMVCo CRC-16-CCITT (polynomial 0x1021, initial value 0xFFFF).
 */
export function computeCrc16Ccitt(payload: string): string {
  let crc = 0xffff;
  const bytes = Buffer.from(payload, "utf8");
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i] << 8;
    for (let bit = 0; bit < 8; bit++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export interface BuildVietQrParams {
  bankBin: string;
  accountNumber: string;
  accountName?: string | null;
  amount: number;
  transferMemo: string;
  template?: "compact2" | "compact" | "qr_only" | "print";
}

/**
 * Builds NAPAS 247 EMVCo QR payload with CRC-16 checksum.
 */
export function buildVietQrPayload(params: BuildVietQrParams): string {
  const bankBin = String(params.bankBin || "").replace(/\D/g, "");
  const accountNumber = String(params.accountNumber || "")
    .trim()
    .replace(/\s+/g, "");
  if (bankBin.length !== 6) {
    throw new Error("Mã BIN ngân hàng phải gồm đúng 6 chữ số");
  }
  if (!accountNumber) {
    throw new Error("Số tài khoản ngân hàng không được để trống");
  }

  const amountInt = Math.max(0, Math.round(Number(params.amount) || 0));
  const memo = stripVietnameseDiacritics(params.transferMemo || "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 50)
    .trim();

  // Tag 38: Consumer Account Information for VietQR NAPAS247
  const beneficiaryOrg = tlv("00", bankBin) + tlv("01", accountNumber);
  const merchantAccountInfo =
    tlv("00", "A000000727") +
    tlv("01", beneficiaryOrg) +
    tlv("02", "QRIBFTTA");

  const pointOfInitiation = amountInt > 0 ? "12" : "11"; // 12 = Dynamic QR, 11 = Static QR

  let payload =
    tlv("00", "01") + // Payload Format Indicator
    tlv("01", pointOfInitiation) +
    tlv("38", merchantAccountInfo) +
    tlv("53", "704"); // VND Currency ISO 4217 numeric code

  if (amountInt > 0) {
    payload += tlv("54", String(amountInt));
  }

  payload += tlv("58", "VN");

  if (memo) {
    const additionalData = tlv("08", memo);
    payload += tlv("62", additionalData);
  }

  // Append Tag 63 (CRC) header "6304" before computing CRC-16
  const payloadWithCrcHeader = `${payload}6304`;
  const crcHex = computeCrc16Ccitt(payloadWithCrcHeader);
  return `${payloadWithCrcHeader}${crcHex}`;
}

export function buildVietQrQuickLinkUrl(params: BuildVietQrParams): string {
  const bankBin = String(params.bankBin || "").replace(/\D/g, "");
  const accountNumber = String(params.accountNumber || "")
    .trim()
    .replace(/\s+/g, "");
  const template = params.template || "compact2";
  const amountInt = Math.max(0, Math.round(Number(params.amount) || 0));
  const memo = stripVietnameseDiacritics(params.transferMemo || "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 50)
    .trim();
  const accountName = sanitizeAccountName(params.accountName);

  const search = new URLSearchParams();
  if (amountInt > 0) {
    search.set("amount", String(amountInt));
  }
  if (memo) {
    search.set("addInfo", memo);
  }
  if (accountName) {
    search.set("accountName", accountName);
  }

  const query = search.toString();
  return `https://img.vietqr.io/image/${bankBin}-${accountNumber}-${template}.png${
    query ? `?${query}` : ""
  }`;
}

export interface VietQrBundle {
  qrPayload: string;
  qrSvg: string;
  qrDataUrl: string;
  vietQrImageUrl: string;
  amount: number;
  transferContent: string;
  bankInfo: {
    bankBin: string;
    bankCode: string;
    bankName: string;
    bankAccountNumber: string;
    bankAccountName: string;
  };
}

export async function generateVietQrBundle(params: {
  bankBin: string;
  bankCode?: string | null;
  bankName?: string | null;
  accountNumber: string;
  accountName?: string | null;
  amount: number;
  studentCode: string;
  invoiceNumber: string;
  customMemo?: string;
}): Promise<VietQrBundle> {
  const transferContent = params.customMemo
    ? stripVietnameseDiacritics(params.customMemo)
        .toUpperCase()
        .replace(/[^A-Z0-9 ]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 50)
        .trim()
    : formatTransferMemo(params.studentCode, params.invoiceNumber);

  const amount = Math.max(0, Math.round(Number(params.amount) || 0));
  const cleanAccName = sanitizeAccountName(params.accountName);
  const matchedBank = findBankByBinOrCode(params.bankBin || params.bankCode);

  const qrPayload = buildVietQrPayload({
    bankBin: params.bankBin,
    accountNumber: params.accountNumber,
    accountName: cleanAccName,
    amount,
    transferMemo: transferContent,
  });

  const qrSvg = await QRCode.toString(qrPayload, {
    type: "svg",
    margin: 1,
    width: 260,
  });

  const qrDataUrl = await QRCode.toDataURL(qrPayload, {
    margin: 1,
    width: 260,
  });

  const vietQrImageUrl = buildVietQrQuickLinkUrl({
    bankBin: params.bankBin,
    accountNumber: params.accountNumber,
    accountName: cleanAccName,
    amount,
    transferMemo: transferContent,
  });

  return {
    qrPayload,
    qrSvg,
    qrDataUrl,
    vietQrImageUrl,
    amount,
    transferContent,
    bankInfo: {
      bankBin: params.bankBin,
      bankCode: params.bankCode || matchedBank?.code || "",
      bankName: params.bankName || matchedBank?.shortName || "",
      bankAccountNumber: params.accountNumber.trim(),
      bankAccountName: cleanAccName,
    },
  };
}

export const generateVietQrData = generateVietQrBundle;

export async function buildSampleVietQrPreview(workspace: {
  bankBin?: string | null;
  bankCode?: string | null;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  bankAccountName?: string | null;
}): Promise<VietQrBundle | null> {
  if (
    !workspace.bankBin ||
    !workspace.bankAccountNumber ||
    !workspace.bankAccountName
  ) {
    return null;
  }
  try {
    return await generateVietQrBundle({
      bankBin: workspace.bankBin,
      bankCode: workspace.bankCode,
      bankName: workspace.bankName,
      accountNumber: workspace.bankAccountNumber,
      accountName: workspace.bankAccountName,
      amount: 1500000,
      studentCode: "HS001",
      invoiceNumber: "INV-202611-0001",
    });
  } catch {
    return null;
  }
}
