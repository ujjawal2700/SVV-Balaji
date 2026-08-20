import { IsString, IsNotEmpty, Length, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyTwoFactorLoginDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  @IsString()
  @IsNotEmpty()
  twoFactorToken: string;

  @ApiProperty({ example: '123456', description: '6-digit TOTP or 8-character recovery code' })
  @IsString()
  @IsNotEmpty()
  code: string;
}

export class EnableTwoFactorDto {
  @ApiProperty({ example: '123456' })
  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  @Matches(/^\d+$/, { message: 'Code must be numeric' })
  code: string;
}

export class DisableTwoFactorDto {
  @ApiProperty({ example: 'MyStrongPassword123' })
  @IsString()
  @IsNotEmpty()
  password: string;
}
