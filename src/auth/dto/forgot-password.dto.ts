import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'admin@gimnasio.local' })
  @IsEmail({}, { message: 'Ingrese un correo electrónico válido' })
  @IsNotEmpty()
  email!: string;
}
