import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { successResponse } from '../common/utils/response.util';

@ApiTags('Usuarios')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('users')
  @Permissions('users.manage')
  @ApiOperation({ summary: 'Listar usuarios' })
  async findAll(@Query() query: PaginationDto) {
    return this.usersService.findAll(query);
  }

  @Post('users')
  @Permissions('users.manage')
  @ApiOperation({ summary: 'Crear usuario' })
  async create(@Body() dto: CreateUserDto, @CurrentUser() user: { id: string }) {
    const data = await this.usersService.create(dto, user.id);
    return successResponse(data);
  }

  @Get('users/:id')
  @Permissions('users.manage')
  @ApiOperation({ summary: 'Detalle de usuario' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.usersService.findOne(id);
    return successResponse(data);
  }

  @Patch('users/:id')
  @Permissions('users.manage')
  @ApiOperation({ summary: 'Actualizar usuario' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: { id: string },
  ) {
    const data = await this.usersService.update(id, dto, user.id);
    return successResponse(data);
  }

  @Delete('users/:id')
  @Permissions('users.manage')
  @ApiOperation({ summary: 'Desactivar usuario' })
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: { id: string }) {
    const data = await this.usersService.deactivate(id, user.id);
    return successResponse(data);
  }

  @Get('roles')
  @Permissions('users.manage')
  @ApiOperation({ summary: 'Listar roles' })
  async findRoles() {
    const data = await this.usersService.findRoles();
    return successResponse(data);
  }
}
