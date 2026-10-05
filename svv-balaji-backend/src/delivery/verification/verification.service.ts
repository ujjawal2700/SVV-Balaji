import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Prisma, RiderDepositEntryType, RiderDepositMethod, RiderDocumentStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUrl, Matches, Max, MaxLength, Min, MinLength,
} from 'class-validator';
import { createPaymentGateway } from '../../checkout/payment/payment-gateway';
import { PrismaService } from '../../prisma/prisma.service';
import { DeliverySettingsService } from '../core/delivery-core';
import { DispatchService } from '../dispatch/dispatch.service';
import { assessVerification, endOfExpiryDay, PCC_CODE, type VerificationAssessment } from './verification.logic';

// ------------------------------------------------------------------ DTOs

export class SubmitRiderDocumentDto {
  @ApiProperty() @IsString() typeId!: string;
  @ApiProperty({ type: [String], description: 'Urls from POST /rider/verification/files (front / back, or one PDF)' })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(4) @IsUrl({ protocols: ['https', 'http'], require_tld: false }, { each: true }) fileUrls!: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) documentNumber?: string;
  @ApiPropertyOptional({ description: 'Issuing authority - for the PCC, the police station' }) @IsOptional() @IsString() @MaxLength(120) issuedBy?: string;
  @ApiPropertyOptional({ example: '2026-09-01' }) @IsOptional() @IsDateString() issuedOn?: string;
  @ApiPropertyOptional({ example: '2031-09-01' }) @IsOptional() @IsDateString() expiresOn?: string;
}

export class ReviewDocumentDto {
  @ApiPropertyOptional({ description: 'Staff-only note on the check made' }) @IsOptional() @IsString() @MaxLength(300) note?: string;
}

export class RejectDocumentDto {
  @ApiProperty({ description: 'Shown to the rider' }) @IsString() @MinLength(3) @MaxLength(300) reason!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) note?: string;
}

export class DocumentTypeDto {
  @ApiProperty({ example: 'INSURANCE' }) @IsString() @Matches(/^[A-Z0-9_]{2,40}$/) code!: string;
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(80) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isMandatory?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requiresNumber?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requiresIssuer?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requiresIssueDate?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requiresExpiry?: boolean;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(999) sortOrder?: number;
}

export class RecordDepositDto {
  @ApiProperty({ enum: RiderDepositEntryType }) @IsEnum(RiderDepositEntryType) type!: RiderDepositEntryType;
  @ApiProperty({ description: 'Always positive, except ADJUSTMENT which may be negative' })
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(-1_000_000) @Max(1_000_000) amount!: number;
  @ApiPropertyOptional({ enum: RiderDepositMethod }) @IsOptional() @IsEnum(RiderDepositMethod) method?: RiderDepositMethod;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) reference?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) note?: string;
}

export class CreateDepositOrderDto {
  @ApiPropertyOptional({ description: 'Defaults to the whole pending amount' })
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(1) amount?: number;
}

export class VerifyDepositPaymentDto {
  @ApiProperty() @IsString() gatewayOrderId!: string;
  @ApiProperty() @IsString() paymentId!: string;
  @ApiProperty() @IsString() signature!: string;
}

const DOC_SELECT = {
  id: true, typeId: true, fileUrls: true, documentNumber: true, issuedBy: true, issuedOn: true, expiresOn: true, status: true,
  rejectionReason: true, reviewNote: true, reviewedAt: true, supersededAt: true, createdAt: true,
  reviewedBy: { select: { fullName: true } },
} satisfies Prisma.RiderDocumentSelect;
type DocRow = Prisma.RiderDocumentGetPayload<{ select: typeof DOC_SELECT }>;

const ymd = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const todayIst = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

/**
 * Rider onboarding: documents (the Police Clearance Certificate among them),
 * the security deposit, and the verification gate that decides whether a
 * rider can be approved, go online or be given a delivery.
 *
 * The gate is stored on the rider (isVerified + verifiedUntil) so the
 * dispatcher can filter on it cheaply; every change that can move it calls
 * `recompute`. Expiry needs no sweep: verifiedUntil makes it lapse by itself.
 */
@Injectable()
export class RiderVerificationService {
  private readonly logger = new Logger(RiderVerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: DeliverySettingsService,
    private readonly dispatch: DispatchService,
  ) {}

  // ================================================================ the gate

  private async assess(riderIds: string[]): Promise<Map<string, { a: VerificationAssessment; docs: DocRow[] }>> {
    if (!riderIds.length) return new Map();
    const [types, docs, paid, s] = await Promise.all([
      this.prisma.riderDocumentType.findMany(),
      this.prisma.riderDocument.findMany({ where: { riderId: { in: riderIds }, supersededAt: null }, select: { ...DOC_SELECT, riderId: true } }),
      this.prisma.riderDepositEntry.groupBy({ by: ['riderId'], where: { riderId: { in: riderIds } }, _sum: { amount: true } }),
      this.settings.get(),
    ]);
    const paidBy = new Map(paid.map((p) => [p.riderId, Number(p._sum.amount ?? 0)]));
    const now = new Date();
    return new Map(riderIds.map((id) => {
      const mine = docs.filter((d) => d.riderId === id);
      const a = assessVerification(types, mine, { required: s.securityDepositRequired, amount: Number(s.securityDepositAmount), paid: paidBy.get(id) ?? 0 }, now);
      return [id, { a, docs: mine }];
    }));
  }

  /**
   * Re-derive the gate for these riders and store it. A rider who stops
   * qualifying is taken offline and loses open requests (deliveries already in
   * hand are left alone); either change is told to the rider.
   */
  async recompute(riderIds: string[], why?: string) {
    const riders = await this.prisma.rider.findMany({
      where: { id: { in: riderIds } },
      select: { id: true, status: true, availability: true, isVerified: true, verifiedUntil: true },
    });
    const results = await this.assess(riders.map((r) => r.id));
    for (const r of riders) {
      const { a } = results.get(r.id)!;
      // `stored` = what the rider was last told (even if it has since expired by date).
      const stored = r.isVerified;
      const lapsed = !a.eligible && (stored || r.availability === 'ONLINE');
      const same = stored === a.eligible && (r.verifiedUntil?.getTime() ?? null) === (a.verifiedUntil?.getTime() ?? null);
      if (same && !lapsed) continue;
      await this.prisma.rider.update({
        where: { id: r.id },
        data: {
          isVerified: a.eligible, verifiedUntil: a.verifiedUntil, verificationCheckedAt: new Date(),
          ...(lapsed && r.availability === 'ONLINE' ? { availability: 'OFFLINE', availabilityChangedAt: new Date() } : {}),
        },
      });
      if (lapsed) {
        // Requests showing are withdrawn; deliveries already in hand are left to finish.
        const pending = await this.prisma.deliveryOffer.findMany({ where: { riderId: r.id, status: 'PENDING' }, select: { id: true } });
        for (const p of pending) await this.dispatch.respond(r.id, p.id, false, 'Verification incomplete').catch(() => undefined);
        if (stored && r.status === 'ACTIVE') {
          await this.dispatch.notify(r.id, 'VERIFICATION', 'You cannot take orders right now', `${why ? `${why}. ` : ''}Still needed: ${a.missing.join('; ')}.`).catch(() => undefined);
        }
      } else if (!stored && a.eligible && r.status === 'ACTIVE') {
        await this.dispatch.notify(r.id, 'VERIFICATION', 'Verification complete', 'Your documents and deposit are all in order - go online to get orders.').catch(() => undefined);
      }
    }
    return results;
  }

  /** After a rule change (deposit amount, a document made mandatory): every rider who could be affected. */
  async recomputeAll(why: string) {
    const ids = (await this.prisma.rider.findMany({ where: { status: { in: ['PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED'] } }, select: { id: true } })).map((r) => r.id);
    for (let i = 0; i < ids.length; i += 200) await this.recompute(ids.slice(i, i + 200), why);
    this.logger.log(`Re-checked verification for ${ids.length} rider(s): ${why}`);
    return { riders: ids.length };
  }

  /** Throws a readable 400/403 unless the rider has cleared onboarding. */
  async assertVerified(riderId: string, action: string, Exception: new (body: object) => Error = BadRequestException) {
    const { a } = (await this.recompute([riderId])).get(riderId) ?? {};
    if (!a) throw new NotFoundException('Rider not found');
    if (!a.eligible) throw new Exception({ code: 'NOT_VERIFIED', message: `${action}: ${a.missing.join('; ')}`, missing: a.missing });
  }

  // ================================================================ summaries

  private async types() {
    return this.prisma.riderDocumentType.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  }

  /** Everything the rider's verification screen or the staff tab shows. */
  async summary(riderId: string) {
    const rider = await this.prisma.rider.findUnique({ where: { id: riderId }, select: { id: true, status: true, isVerified: true, verifiedUntil: true } });
    if (!rider) throw new NotFoundException('Rider not found');
    const [types, { a, docs }] = await Promise.all([this.types(), this.recompute([riderId]).then((m) => m.get(riderId)!)]);
    const byId = new Map(docs.map((d) => [d.id, d]));
    const typeBy = new Map(types.map((t) => [t.id, t]));
    const documents = a.documents.map((d) => {
      const t = typeBy.get(d.typeId)!;
      const latest = d.latestId ? byId.get(d.latestId)! : null;
      const approved = d.approvedId && d.approvedId !== d.latestId ? byId.get(d.approvedId)! : null;
      return {
        type: {
          id: t.id, code: t.code, name: t.name, description: t.description, isSystem: t.isSystem,
          requiresNumber: t.requiresNumber, requiresIssuer: t.requiresIssuer, requiresIssueDate: t.requiresIssueDate, requiresExpiry: t.requiresExpiry,
        },
        mandatory: d.mandatory, state: d.state, satisfied: d.satisfied, validUntil: d.validUntil, canUpload: d.canUpload,
        current: latest ? this.view(latest) : null,
        /** An older approval still in force behind a newer (pending / rejected) upload. */
        approvedInForce: approved ? this.view(approved) : null,
      };
    });
    return {
      riderId, status: rider.status,
      eligible: a.eligible, missing: a.missing, verifiedUntil: a.verifiedUntil,
      documents,
      pcc: documents.find((d) => d.type.code === PCC_CODE) ?? null,
      deposit: a.deposit,
    };
  }

  private view(d: DocRow) {
    return {
      id: d.id, status: d.status, fileUrls: d.fileUrls, documentNumber: d.documentNumber, issuedBy: d.issuedBy,
      issuedOn: ymd(d.issuedOn), expiresOn: ymd(d.expiresOn), rejectionReason: d.rejectionReason, reviewNote: d.reviewNote,
      reviewedAt: d.reviewedAt, reviewedBy: d.reviewedBy?.fullName ?? null, supersededAt: d.supersededAt, uploadedAt: d.createdAt,
    };
  }

  /** Every upload this rider ever made, newest first (staff audit trail). */
  async history(riderId: string) {
    const rows = await this.prisma.riderDocument.findMany({
      where: { riderId }, select: { ...DOC_SELECT, type: { select: { code: true, name: true } } }, orderBy: { createdAt: 'desc' }, take: 200,
    });
    return rows.map((d) => ({ ...this.view(d), type: d.type }));
  }

  /** Staff queue: uploads waiting for review, oldest first. */
  async queue(q: { typeCode?: string; warehouseId?: string } = {}) {
    const rows = await this.prisma.riderDocument.findMany({
      where: {
        status: 'PENDING', supersededAt: null,
        ...(q.typeCode ? { type: { code: q.typeCode } } : {}),
        rider: { status: { in: ['PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED'] }, ...(q.warehouseId ? { warehouseId: q.warehouseId } : {}) },
      },
      select: {
        ...DOC_SELECT,
        type: { select: { id: true, code: true, name: true, isSystem: true, requiresExpiry: true } },
        rider: { select: { id: true, code: true, fullName: true, phone: true, status: true, photoUrl: true, isVerified: true, warehouse: { select: { id: true, name: true } } } },
      },
      orderBy: { createdAt: 'asc' },
      take: 300,
    });
    return rows.map((d) => ({ ...this.view(d), type: d.type, rider: d.rider }));
  }

  // ================================================================ documents

  /** A rider uploads (or re-uploads) one document. Older pending / rejected uploads of the type are superseded. */
  async submit(riderId: string, dto: SubmitRiderDocumentDto) {
    const type = await this.prisma.riderDocumentType.findUnique({ where: { id: dto.typeId } });
    if (!type || !(type.isActive || type.isSystem)) throw new BadRequestException('Choose a document from the list');
    const number = dto.documentNumber?.trim() || null;
    const issuer = dto.issuedBy?.trim() || null;
    if (type.requiresNumber && !number) throw new BadRequestException(`Enter the ${type.name} number`);
    if (type.requiresIssuer && !issuer) throw new BadRequestException(type.code === PCC_CODE ? 'Enter the police station / authority that issued it' : 'Enter who issued it');
    if (type.requiresIssueDate && !dto.issuedOn) throw new BadRequestException('Enter the issue date');
    if (type.requiresExpiry && !dto.expiresOn) throw new BadRequestException('Enter the expiry date');
    const today = todayIst();
    if (dto.issuedOn && dto.issuedOn.slice(0, 10) > today) throw new BadRequestException('The issue date cannot be in the future');
    if (dto.expiresOn && dto.expiresOn.slice(0, 10) < today) throw new BadRequestException('This document has already expired - upload a valid one');
    if (dto.issuedOn && dto.expiresOn && dto.expiresOn.slice(0, 10) <= dto.issuedOn.slice(0, 10)) throw new BadRequestException('The expiry date must be after the issue date');

    const created = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM riders WHERE id = ${riderId} FOR UPDATE`;
      const live = await tx.riderDocument.findMany({ where: { riderId, typeId: type.id, supersededAt: null }, orderBy: { createdAt: 'desc' } });
      const approved = live.find((d) => d.status === 'APPROVED');
      const latest = live[0];
      if (latest?.status === 'APPROVED' && approved) {
        const until = approved.expiresOn ? endOfExpiryDay(approved.expiresOn) : null;
        if (!until || until.getTime() - Date.now() > 30 * 864e5) {
          throw new ConflictException(`Your ${type.name} is already approved${until ? ` until ${ymd(approved.expiresOn)}` : ''}. Ask your store if it needs changing.`);
        }
      }
      // Pending / rejected uploads give way; an approval stays in force until the new one is approved.
      await tx.riderDocument.updateMany({ where: { riderId, typeId: type.id, supersededAt: null, status: { not: 'APPROVED' } }, data: { supersededAt: new Date() } });
      return tx.riderDocument.create({
        data: {
          riderId, typeId: type.id, fileUrls: dto.fileUrls, documentNumber: number?.toUpperCase() ?? null, issuedBy: issuer,
          issuedOn: dto.issuedOn ? new Date(`${dto.issuedOn.slice(0, 10)}T00:00:00Z`) : null,
          expiresOn: dto.expiresOn ? new Date(`${dto.expiresOn.slice(0, 10)}T00:00:00Z`) : null,
        },
        select: DOC_SELECT,
      });
    });
    await this.recompute([riderId]);
    return this.view(created);
  }

  async approve(docId: string, dto: ReviewDocumentDto, userId: string) {
    const doc = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM rider_documents WHERE id = ${docId} FOR UPDATE`;
      const d = await tx.riderDocument.findUnique({ where: { id: docId }, include: { type: true } });
      if (!d) throw new NotFoundException('Document not found');
      if (d.supersededAt) throw new ConflictException('The rider has uploaded a newer copy - review that one');
      if (d.status !== 'PENDING') throw new ConflictException(`This document is already ${d.status.toLowerCase()}`);
      if (d.expiresOn && endOfExpiryDay(d.expiresOn) <= new Date()) throw new BadRequestException('This document has expired - reject it so the rider uploads a valid one');
      if (d.type.requiresExpiry && !d.expiresOn) throw new BadRequestException('No expiry date on this upload - reject it and ask for one');
      // The new approval replaces every older upload of the type, including an earlier approval.
      await tx.riderDocument.updateMany({ where: { riderId: d.riderId, typeId: d.typeId, supersededAt: null, id: { not: d.id } }, data: { supersededAt: new Date() } });
      return tx.riderDocument.update({
        where: { id: docId },
        data: { status: RiderDocumentStatus.APPROVED, reviewedById: userId, reviewedAt: new Date(), reviewNote: dto.note?.trim() || null, rejectionReason: null },
        include: { type: true },
      });
    });
    await this.dispatch.notify(doc.riderId, 'VERIFICATION', `${doc.type.name} approved`, `Your ${doc.type.name} has been verified.`).catch(() => undefined);
    await this.recompute([doc.riderId]);
    return this.summary(doc.riderId);
  }

  /** Reject a pending upload, or withdraw an approval (the rider then has to upload again). */
  async reject(docId: string, dto: RejectDocumentDto, userId: string) {
    const doc = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM rider_documents WHERE id = ${docId} FOR UPDATE`;
      const d = await tx.riderDocument.findUnique({ where: { id: docId }, include: { type: true } });
      if (!d) throw new NotFoundException('Document not found');
      if (d.supersededAt) throw new ConflictException('This upload has been replaced by a newer one');
      if (d.status === 'REJECTED') throw new ConflictException('This document is already rejected');
      return tx.riderDocument.update({
        where: { id: docId },
        data: { status: RiderDocumentStatus.REJECTED, rejectionReason: dto.reason.trim(), reviewNote: dto.note?.trim() || null, reviewedById: userId, reviewedAt: new Date() },
        include: { type: true },
      });
    });
    await this.dispatch.notify(doc.riderId, 'VERIFICATION', `${doc.type.name} rejected`, `${dto.reason.trim()} - please upload it again.`).catch(() => undefined);
    await this.recompute([doc.riderId], `${doc.type.name} was rejected`);
    return this.summary(doc.riderId);
  }

  // ---------------------------------------------------------------- document types (Super Admin)

  listTypes(activeOnly = false) {
    return this.prisma.riderDocumentType.findMany({ where: activeOnly ? { OR: [{ isActive: true }, { isSystem: true }] } : {}, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  }

  async createType(dto: DocumentTypeDto) {
    try {
      const t = await this.prisma.riderDocumentType.create({ data: { ...dto, name: dto.name.trim(), description: dto.description?.trim() || null } });
      await this.recomputeAll(`New document required: ${t.name}`);
      return t;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException(`Document code ${dto.code} exists`);
      throw e;
    }
  }

  async updateType(id: string, dto: Partial<DocumentTypeDto>) {
    const t = await this.prisma.riderDocumentType.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Document type not found');
    if (dto.code && dto.code !== t.code) throw new BadRequestException('A document code cannot be changed; switch it off and add a new one');
    if (t.isSystem && (dto.isMandatory === false || dto.isActive === false)) {
      throw new BadRequestException(`${t.name} is always required and cannot be made optional or switched off`);
    }
    const { code: _code, ...rest } = dto;
    const updated = await this.prisma.riderDocumentType.update({ where: { id }, data: { ...rest, ...(rest.name ? { name: rest.name.trim() } : {}) } });
    if (dto.isMandatory !== undefined || dto.isActive !== undefined) await this.recomputeAll(`Document rules changed (${updated.name})`);
    return updated;
  }

  // ================================================================ security deposit

  async deposit(riderId: string) {
    const rider = await this.prisma.rider.findUnique({ where: { id: riderId }, select: { id: true } });
    if (!rider) throw new NotFoundException('Rider not found');
    const [{ a }, entries] = await Promise.all([
      this.recompute([riderId]).then((m) => m.get(riderId)!),
      this.prisma.riderDepositEntry.findMany({ where: { riderId }, orderBy: { createdAt: 'desc' }, take: 300, include: { recordedBy: { select: { fullName: true } } } }),
    ]);
    return {
      ...a.deposit,
      entries: entries.map((e) => ({
        id: e.id, type: e.type, amount: Number(e.amount), method: e.method, reference: e.reference, note: e.note, createdAt: e.createdAt,
        recordedBy: e.recordedBy?.fullName ?? null, online: Boolean(e.gatewayPaymentId),
      })),
    };
  }

  /** Staff record money received, refunded or kept. Refunds and forfeits cannot exceed what was paid. */
  async recordDeposit(riderId: string, dto: RecordDepositDto, userId: string) {
    if (dto.amount === 0) throw new BadRequestException('Enter an amount');
    if (dto.type !== 'ADJUSTMENT' && dto.amount < 0) throw new BadRequestException('Enter the amount as a positive number');
    const signed = dto.type === 'PAYMENT' || dto.type === 'ADJUSTMENT' ? dto.amount : -dto.amount;
    if ((dto.type === 'REFUND' || dto.type === 'FORFEIT' || dto.type === 'ADJUSTMENT') && !dto.note?.trim()) throw new BadRequestException('Say why in the note');
    await this.prisma.$transaction(async (tx) => {
      const found = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM riders WHERE id = ${riderId} FOR UPDATE`;
      if (!found.length) throw new NotFoundException('Rider not found');
      const paid = Number((await tx.riderDepositEntry.aggregate({ where: { riderId }, _sum: { amount: true } }))._sum.amount ?? 0);
      if (Math.round((paid + signed) * 100) < 0) throw new BadRequestException(`The rider has only ₹${paid.toFixed(2)} on deposit`);
      await tx.riderDepositEntry.create({
        data: {
          riderId, type: dto.type, amount: signed, method: dto.method ?? (dto.type === 'PAYMENT' ? 'CASH' : null),
          reference: dto.reference?.trim() || null, note: dto.note?.trim() || null, recordedById: userId,
        },
      });
    });
    await this.recompute([riderId], dto.type === 'PAYMENT' ? undefined : 'Your security deposit changed');
    return this.deposit(riderId);
  }

  /** The rider pays (part of) what is pending online. The amount is fixed here, not by the browser. */
  async createDepositOrder(riderId: string, dto: CreateDepositOrderDto) {
    const { a } = (await this.recompute([riderId])).get(riderId)!;
    if (!a.deposit.required) throw new BadRequestException('No security deposit is required right now');
    if (a.deposit.pending <= 0) throw new BadRequestException('Your security deposit is already fully paid');
    const amount = Math.round((dto.amount ?? a.deposit.pending) * 100) / 100;
    if (amount > a.deposit.pending) throw new BadRequestException(`Only ₹${a.deposit.pending.toFixed(2)} is pending`);
    const gateway = createPaymentGateway();
    const order = await gateway.createOrder({ amountRupees: amount, receipt: `RDR-DEP-${riderId.slice(0, 8)}-${Date.now()}` });
    await this.prisma.riderDepositOrder.create({ data: { riderId, gatewayOrderId: order.gatewayOrderId, amount } });
    return { gatewayOrderId: order.gatewayOrderId, clientConfig: order.clientConfig, amount, pending: a.deposit.pending };
  }

  /** Idempotent: verifying the same payment twice credits it once. */
  async verifyDepositPayment(riderId: string, dto: VerifyDepositPaymentDto) {
    const gateway = createPaymentGateway();
    if (!gateway.verifyPayment({ gatewayOrderId: dto.gatewayOrderId, paymentId: dto.paymentId, signature: dto.signature })) {
      throw new BadRequestException('Payment could not be verified');
    }
    const credited = await this.prisma.$transaction(async (tx) => {
      const order = await tx.riderDepositOrder.findUnique({ where: { gatewayOrderId: dto.gatewayOrderId } });
      if (!order || order.riderId !== riderId) throw new NotFoundException('Payment not found');
      await tx.$queryRaw`SELECT id FROM rider_deposit_orders WHERE id = ${order.id} FOR UPDATE`;
      const fresh = await tx.riderDepositOrder.findUnique({ where: { id: order.id } });
      if (fresh!.paidAt) {
        if (fresh!.paymentId !== dto.paymentId) throw new ConflictException('This payment order was already paid');
        return { amount: Number(fresh!.amount), duplicate: true };
      }
      await tx.riderDepositEntry.create({
        data: { riderId, type: 'PAYMENT', amount: fresh!.amount, method: 'ONLINE', reference: dto.paymentId, gatewayPaymentId: dto.paymentId, note: 'Paid online from the rider app' },
      });
      await tx.riderDepositOrder.update({ where: { id: order.id }, data: { paidAt: new Date(), paymentId: dto.paymentId } });
      return { amount: Number(fresh!.amount), duplicate: false };
    });
    await this.recompute([riderId]);
    return { ...credited, paymentId: dto.paymentId, deposit: await this.deposit(riderId) };
  }

  /** Paid on deposit per rider, for the riders list. */
  async depositPaidBy(riderIds: string[]) {
    const g = await this.prisma.riderDepositEntry.groupBy({ by: ['riderId'], where: { riderId: { in: riderIds } }, _sum: { amount: true } });
    return new Map(g.map((x) => [x.riderId, Number(x._sum.amount ?? 0)]));
  }
}
