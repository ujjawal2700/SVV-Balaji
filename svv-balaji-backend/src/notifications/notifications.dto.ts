import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PushApp, UserRole } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export enum BroadcastAudienceType {
  EVERYONE = 'EVERYONE',
  CUSTOMERS = 'CUSTOMERS',
  RETAILERS = 'RETAILERS',
  RIDERS = 'RIDERS',
  STAFF = 'STAFF',
  SPECIFIC = 'SPECIFIC',
}

export enum RecipientKind {
  STAFF = 'STAFF',
  CUSTOMER = 'CUSTOMER',
  RIDER = 'RIDER',
}

export class RecipientRefDto {
  @ApiProperty({ enum: RecipientKind }) @IsEnum(RecipientKind) kind!: RecipientKind;
  @ApiProperty() @IsUUID() id!: string;
}

/**
 * Who to send to. Filters apply to the chosen `type` only; with EVERYONE and SPECIFIC they
 * are ignored. Filters of the same kind are OR'd (city A or city B), different kinds AND'd.
 */
export class AudienceDto {
  @ApiProperty({ enum: BroadcastAudienceType }) @IsEnum(BroadcastAudienceType) type!: BroadcastAudienceType;

  @ApiPropertyOptional({ enum: UserRole, isArray: true, description: 'STAFF: roles. SALES_TEAM = sales executives. Empty = all staff.' })
  @IsOptional() @IsArray() @IsEnum(UserRole, { each: true })
  roles?: UserRole[];

  @ApiPropertyOptional({ type: [String], description: 'STAFF: branches' })
  @IsOptional() @IsArray() @IsUUID('all', { each: true })
  branchIds?: string[];

  @ApiPropertyOptional({ type: [String], description: 'CUSTOMERS / RETAILERS / RIDERS: city' })
  @IsOptional() @IsArray() @IsString({ each: true }) @ArrayMaxSize(100)
  cities?: string[];

  @ApiPropertyOptional({ type: [String], description: 'CUSTOMERS / RETAILERS: state' })
  @IsOptional() @IsArray() @IsString({ each: true }) @ArrayMaxSize(50)
  states?: string[];

  @ApiPropertyOptional({ type: [String], description: 'CUSTOMERS / RETAILERS: pincode' })
  @IsOptional() @IsArray() @IsString({ each: true }) @ArrayMaxSize(500)
  pincodes?: string[];

  @ApiPropertyOptional({ type: [String], description: 'RETAILERS: owned by these sales executives' })
  @IsOptional() @IsArray() @IsUUID('all', { each: true })
  salesExecutiveIds?: string[];

  @ApiPropertyOptional({ type: [String], description: 'RIDERS: home outlet' })
  @IsOptional() @IsArray() @IsUUID('all', { each: true })
  warehouseIds?: string[];

  @ApiPropertyOptional({ description: 'RIDERS: only those online right now' })
  @IsOptional() @IsBoolean()
  onlineOnly?: boolean;

  @ApiPropertyOptional({ type: [RecipientRefDto], description: 'SPECIFIC: the people' })
  @IsOptional() @IsArray() @ArrayMaxSize(1000) @ValidateNested({ each: true }) @Type(() => RecipientRefDto)
  recipients?: RecipientRefDto[];
}

export class SendBroadcastDto {
  @ApiProperty({ maxLength: 80 }) @IsString() @MinLength(2) @MaxLength(80) title!: string;
  @ApiProperty({ maxLength: 400 }) @IsString() @MinLength(2) @MaxLength(400) body!: string;

  @ApiPropertyOptional({ description: 'Large picture shown in the notification (https URL)' })
  @IsOptional() @IsString() @Matches(/^(https?:\/\/\S+)?$/, { message: 'imageUrl must be an http(s) URL' })
  imageUrl?: string;

  @ApiPropertyOptional({ description: 'Path inside the app opened on tap, e.g. /offers' })
  @IsOptional() @IsString() @MaxLength(300) @Matches(/^(\/\S*)?$/, { message: 'link must be a path starting with /' })
  link?: string;

  @ApiProperty({ type: AudienceDto }) @ValidateNested() @Type(() => AudienceDto) audience!: AudienceDto;
}

export class RegisterDeviceDto {
  @ApiProperty({ description: 'FCM registration token from getToken()' }) @IsString() @MinLength(20) @MaxLength(4096) token!: string;
  @ApiProperty({ enum: PushApp }) @IsEnum(PushApp) app!: PushApp;
}

export class UnregisterDeviceDto {
  @ApiProperty() @IsString() @MinLength(20) @MaxLength(4096) token!: string;
}

export class MarkReadDto {
  @ApiPropertyOptional({ type: [String], description: 'Omit to mark everything read' })
  @IsOptional() @IsArray() @IsUUID('all', { each: true })
  ids?: string[];
}
