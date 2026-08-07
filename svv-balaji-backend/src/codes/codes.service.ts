import { Injectable } from '@nestjs/common';
import * as QRCode from 'qrcode';
import { code128Svg } from './code128';

/**
 * Generates QR codes and barcodes (FRD 8.2 / 8.3).
 *
 * Deliberately reusable: farmers get a QR + barcode here in Phase 1, and
 * finished-goods packaging needs the exact same generation in Phase 3
 * (FRD 22.3 / 22.4). Building it once avoids duplicating the logic later.
 *
 * Design note - QR codes encode a PUBLIC TRACEABILITY URL, not raw data.
 * Packaging is printed once and can't be reissued, so pointing at a URL means
 * the linked information (farm details, process video) can change without
 * reprinting a single bag.
 */
@Injectable()
export class CodesService {
  private get baseUrl(): string {
    return (
      process.env.PUBLIC_TRACEABILITY_BASE_URL?.replace(/\/+$/, '') ??
      'https://trace.svvbalaji.com'
    );
  }

  /** Public URL a consumer lands on after scanning a farmer QR. */
  buildFarmerTraceabilityUrl(farmerCode: string): string {
    return `${this.baseUrl}/farmer/${encodeURIComponent(farmerCode)}`;
  }

  /** Public URL for a finished-goods batch (used from Phase 3 onward). */
  buildBatchTraceabilityUrl(batchNumber: string): string {
    return `${this.baseUrl}/batch/${encodeURIComponent(batchNumber)}`;
  }

  /**
   * QR code as an SVG string.
   *
   * Note: keep the options object un-cast. `QRCode.toString` is overloaded with
   * a callback form that returns void, and widening this argument (e.g. `as any`)
   * makes TypeScript resolve to that overload instead of the Promise<string> one.
   */
  async qrSvg(payload: string): Promise<string> {
    const options: QRCode.QRCodeToStringOptions = {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 2,
    };
    return QRCode.toString(payload, options);
  }

  /** QR code as a base64 PNG data URL - handy for embedding in PDFs/labels. */
  async qrDataUrl(payload: string): Promise<string> {
    const options: QRCode.QRCodeToDataURLOptions = {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 300,
    };
    return QRCode.toDataURL(payload, options);
  }

  /**
   * Code 128-B barcode as an SVG string. Used for warehouse scanning and
   * procurement operations (FRD 8.3) where a linear barcode is the norm.
   */
  barcodeSvg(value: string): string {
    return code128Svg(value, { moduleWidth: 2, height: 60, includeText: true });
  }

  /** Convenience: everything needed to render a farmer's identity codes. */
  async farmerCodes(farmerCode: string): Promise<{
    farmerCode: string;
    traceabilityUrl: string;
    qrSvg: string;
    barcodeSvg: string;
  }> {
    const traceabilityUrl = this.buildFarmerTraceabilityUrl(farmerCode);
    return {
      farmerCode,
      traceabilityUrl,
      qrSvg: await this.qrSvg(traceabilityUrl),
      barcodeSvg: this.barcodeSvg(farmerCode),
    };
  }
}
