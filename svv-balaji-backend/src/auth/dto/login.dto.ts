import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'admin@svvbalaji.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'ChangeMe@123' })
  @IsString()
  @MinLength(6)
  password: string;
}
