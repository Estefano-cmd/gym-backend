import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@gimnasio.local' })
  @IsEmail({}, { message: 'Ingrese un correo electrónico válido' })
  @IsNotEmpty({ message: 'El correo es obligatorio' })
  email!: string;

  @ApiProperty({ example: 'Admin123*' })
  @IsString()
  @IsNotEmpty({ message: 'La contraseña es obligatoria' })
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  password!: string;
}
