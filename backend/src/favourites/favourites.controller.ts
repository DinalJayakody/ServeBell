import { Controller, Delete, Get, HttpCode, Module, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FavouriteView } from '@servebell/shared';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { CurrentUser } from '../common/decorators/auth.decorators.js';
import { Errors } from '../common/errors.js';
import { fileUrl } from '../common/files.js';
import type { AuthUser } from '../common/request-context.js';

@ApiTags('favourites')
@ApiBearerAuth()
@Controller({ path: 'favourites', version: '1' })
class FavouritesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'My favourite restaurants' })
  async list(@CurrentUser() u: AuthUser): Promise<FavouriteView[]> {
    const rows = await this.prisma.favourite.findMany({ where: { userId: u.id, restaurant: { status: 'ACTIVE', deletedAt: null } }, include: { restaurant: { include: { cover: true } } }, orderBy: { createdAt: 'desc' } });
    return rows.map((f) => ({ restaurantId: f.restaurantId, slug: f.restaurant.slug, name: f.restaurant.name, city: f.restaurant.city, coverUrl: f.restaurant.cover ? fileUrl(f.restaurant.cover.storageKey) : null, createdAt: f.createdAt.toISOString() }));
  }

  @HttpCode(204) @Put(':restaurantId')
  @ApiOperation({ summary: 'Add a favourite (idempotent)' })
  async add(@CurrentUser() u: AuthUser, @Param('restaurantId', ParseUUIDPipe) rid: string) {
    const r = await this.prisma.restaurant.findFirst({ where: { id: rid, status: 'ACTIVE', deletedAt: null }, select: { id: true } });
    if (!r) throw Errors.notFound('Restaurant');
    await this.prisma.favourite.upsert({ where: { userId_restaurantId: { userId: u.id, restaurantId: rid } }, create: { userId: u.id, restaurantId: rid }, update: {} });
  }

  @HttpCode(204) @Delete(':restaurantId')
  @ApiOperation({ summary: 'Remove a favourite (idempotent)' })
  async remove(@CurrentUser() u: AuthUser, @Param('restaurantId', ParseUUIDPipe) rid: string) {
    await this.prisma.favourite.deleteMany({ where: { userId: u.id, restaurantId: rid } });
  }
}

@Module({ controllers: [FavouritesController] })
export class FavouritesModule {}
