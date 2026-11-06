import { describe, expect, it } from "vitest";
import {
  VIETQR_BANKS,
  buildVietQrPayload,
  buildVietQrQuickLinkUrl,
  computeCrc16Ccitt,
  findBankByBinOrCode,
  formatTransferMemo,
  generateVietQrBundle,
  stripVietnameseDiacritics,
} from "@/lib/vietqr";

describe("src/lib/vietqr.ts", () => {
  it("contains all 9 official Vietnamese banks with accurate NAPAS BINs", () => {
    const bins = VIETQR_BANKS.map((b) => b.bin);
    expect(bins).toEqual([
      "970436",
      "970422",
      "970407",
      "970416",
      "970418",
      "970415",
      "970432",
      "970423",
      "970405",
    ]);
    expect(findBankByBinOrCode("970436")?.shortName).toBe("Vietcombank");
    expect(findBankByBinOrCode("MB")?.bin).toBe("970422");
  });

  it("strips Vietnamese diacritics and formats ASCII transfer memo HP <STUDENTCODE> <INVOICENO>", () => {
    expect(stripVietnameseDiacritics("Nguyễn Đặng Ánh Tuyết")).toBe(
      "Nguyen Dang Anh Tuyet"
    );
    expect(formatTransferMemo("HS-001", "INV-202611-0001")).toBe(
      "HP HS001 INV2026110001"
    );
  });

  it("builds valid EMVCo NAPAS247 QR payload with 4-char CRC-16-CCITT checksum", () => {
    const payload = buildVietQrPayload({
      bankBin: "970436",
      accountNumber: "0123456789",
      amount: 1500000,
      transferMemo: "HP HS001 INV2026110001",
    });

    expect(payload.startsWith("000201010212")).toBe(true);
    expect(payload).toContain("A000000727");
    expect(payload).toContain("970436");
    expect(payload).toContain("0123456789");
    expect(payload).toContain("5303704");
    expect(payload).toContain("54071500000");
    expect(payload).toContain("5802VN");
    expect(payload).toMatch(/6304[0-9A-F]{4}$/);

    const withoutCrc = payload.slice(0, -4);
    const expectedCrc = computeCrc16Ccitt(withoutCrc);
    expect(payload.slice(-4)).toBe(expectedCrc);
  });

  it("generates offline SVG/DataURL and VietQR QuickLink URL", async () => {
    const bundle = await generateVietQrBundle({
      bankBin: "970422",
      accountNumber: "999888777",
      accountName: "Nguyễn Văn Minh",
      amount: 850000,
      studentCode: "HS-015",
      invoiceNumber: "INV-202611-0015",
    });

    expect(bundle.transferContent).toBe("HP HS015 INV2026110015");
    expect(bundle.qrSvg).toContain("<svg");
    expect(bundle.qrDataUrl.startsWith("data:image/png;base64,")).toBe(true);
    expect(bundle.vietQrImageUrl).toBe(
      "https://img.vietqr.io/image/970422-999888777-compact2.png?amount=850000&addInfo=HP+HS015+INV2026110015&accountName=NGUYEN+VAN+MINH"
    );
    expect(
      buildVietQrQuickLinkUrl({
        bankBin: "970422",
        accountNumber: "999888777",
        accountName: "Nguyễn Văn Minh",
        amount: 850000,
        transferMemo: "HP HS015 INV2026110015",
      })
    ).toBe(bundle.vietQrImageUrl);
  });
});
