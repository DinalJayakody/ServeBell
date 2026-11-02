import { Body, Controller, Delete, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { createFloorPlanSchema, detectLayoutSchema, saveDraftSchema, type FloorPlanDraft, floorReferenceSchema, Permission, saveLayoutSchema, tableDetailsSchema, tableInputSchema, type SaveLayoutInput, type TableInput } from '@servebell/shared';
import { LayoutDetectService } from './layout-detect.service.js';
import { FloorPlansService } from './floor-plans.service.js';
import { ZodPipe } from '../common/pipes/zod-validation.pipe.js';
import { CurrentUser, RequirePermission } from '../common/decorators/auth.decorators.js';
import { Public } from '../common/decorators/public.decorator.js';
import type { AuthUser } from '../common/request-context.js';

const A = (u: AuthUser, rid: string) => ({ userId: u.id, restaurantId: rid });
const publishSchema = z.object({ publish: z.boolean() });
const printQuery = z.object({ tables: z.string().max(4000).optional() });

@ApiTags('floor-plans')
@Controller({ version: '1' })
export class FloorPlansController {
  constructor(private readonly fp: FloorPlansService, private readonly detector: LayoutDetectService) {}

  @Public() @Get('restaurants/:idOrSlug/floor-plans')
  @ApiOperation({ summary: 'Published floor plans with live table status (public)' })
  publicPlans(@Param('idOrSlug') idOrSlug: string) { return this.fp.publicPlans(idOrSlug); }

  @Public() @Get('restaurants/:idOrSlug/tables/:tableId')
  @ApiOperation({ summary: 'Table details: capacity, photos, zone, nearby features, status (public)' })
  table(@Param('idOrSlug') idOrSlug: string, @Param('tableId', ParseUUIDPipe) tableId: string) { return this.fp.tableDetail(idOrSlug, tableId); }

  @RequirePermission(Permission.RESTAURANT_READ) @Get('restaurants/:restaurantId/manage/floor-plans')
  @ApiOperation({ summary: 'All floor plans incl. drafts (staff)' })
  manage(@Param('restaurantId') rid: string) { return this.fp.managePlans(rid); }

  @RequirePermission(Permission.FLOORPLAN_MANAGE) @Post('restaurants/:restaurantId/manage/floor-plans')
  @ApiOperation({ summary: 'Create an empty floor plan (OWNER/ADMIN)' })
  create(@CurrentUser() u: AuthUser, @Param('restaurantId') rid: string, @Body(new ZodPipe(createFloorPlanSchema)) b: z.infer<typeof createFloorPlanSchema>) { return this.fp.create(A(u, rid), b); }

  @RequirePermission(Permission.FLOORPLAN_MANAGE) @Put('restaurants/:restaurantId/manage/floor-plans/:id')
  @ApiOperation({ summary: 'Save full layout (tables + objects) with expectedVersion (OWNER/ADMIN)' })
  save(@CurrentUser() u: AuthUser, @Param('restaurantId') rid: string, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(saveLayoutSchema)) b: SaveLayoutInput) { return this.fp.save(A(u, rid), id, b); }

  @RequirePermission(Permission.FLOORPLAN_MANAGE) @Put('restaurants/:restaurantId/manage/floor-plans/:id/draft')
  @ApiOperation({ summary: 'Save work in progress as a draft; the live layout is unchanged (OWNER/ADMIN)' })
  saveDraft(@CurrentUser() u: AuthUser, @Param('restaurantId') rid: string, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(saveDraftSchema)) b: FloorPlanDraft) { return this.fp.saveDraft(A(u, rid), id, b); }

  @RequirePermission(Permission.FLOORPLAN_MANAGE) @HttpCode(204) @Delete('restaurants/:restaurantId/manage/floor-plans/:id/draft')
  @ApiOperation({ summary: 'Discard the draft (OWNER/ADMIN)' })
  async discardDraft(@CurrentUser() u: AuthUser, @Param('restaurantId') rid: string, @Param('id', ParseUUIDPipe) id: string) { await this.fp.discardDraft(A(u, rid), id); }

  @RequirePermission(Permission.FLOORPLAN_MANAGE) @Post('restaurants/:restaurantId/manage/floor-plans/:id/publish')
  @ApiOperation({ summary: 'Publish or unpublish a floor plan (OWNER/ADMIN)' })
  publish(@CurrentUser() u: AuthUser, @Param('restaurantId') rid: string, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(publishSchema)) b: z.infer<typeof publishSchema>) { return this.fp.setPublished(A(u, rid), id, b.publish); }

  @RequirePermission(Permission.FLOORPLAN_MANAGE) @Put('restaurants/:restaurantId/manage/floor-plans/:id/reference')
  @ApiOperation({ summary: 'Set or clear the reference photo traced in the editor (OWNER/ADMIN)' })
  reference(@CurrentUser() u: AuthUser, @Param('restaurantId') rid: string, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(floorReferenceSchema)) b: z.infer<typeof floorReferenceSchema>) { return this.fp.setReference(A(u, rid), id, b.fileId); }

  @RequirePermission(Permission.FLOORPLAN_MANAGE) @Throttle({ default: { limit: 6, ttl: 60_000 } }) @Post('restaurants/:restaurantId/manage/floor-plans/:id/detect')
  @ApiOperation({ summary: 'Suggest tables and landmarks from an uploaded room photo (OWNER/ADMIN). Nothing is saved.' })
  detect(@Param('restaurantId') rid: string, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(detectLayoutSchema)) b: z.infer<typeof detectLayoutSchema>) { return this.detector.detect(rid, id, b.fileId); }

  @RequirePermission(Permission.RESTAURANT_READ) @Get('restaurants/:restaurantId/manage/tables')
  @ApiOperation({ summary: 'All tables, with or without a floor plan (staff)' })
  tables(@Param('restaurantId') rid: string) { return this.fp.listTables(rid); }

  @RequirePermission(Permission.FLOORPLAN_MANAGE) @Post('restaurants/:restaurantId/manage/tables')
  @ApiOperation({ summary: 'Add a table without a floor plan; its QR code is created (OWNER/ADMIN)' })
  createTable(@CurrentUser() u: AuthUser, @Param('restaurantId') rid: string, @Body(new ZodPipe(tableInputSchema)) b: TableInput) { return this.fp.createTable(A(u, rid), b); }

  @RequirePermission(Permission.FLOORPLAN_MANAGE) @Put('restaurants/:restaurantId/manage/tables/:tableId/basics')
  @ApiOperation({ summary: 'Rename / resize a table (OWNER/ADMIN)' })
  updateTable(@CurrentUser() u: AuthUser, @Param('restaurantId') rid: string, @Param('tableId', ParseUUIDPipe) tid: string, @Body(new ZodPipe(tableInputSchema)) b: TableInput) { return this.fp.updateTable(A(u, rid), tid, b); }

  @RequirePermission(Permission.FLOORPLAN_MANAGE) @HttpCode(204) @Delete('restaurants/:restaurantId/manage/tables/:tableId')
  @ApiOperation({ summary: 'Remove a table; its QR stops working (OWNER/ADMIN)' })
  async deleteTable(@CurrentUser() u: AuthUser, @Param('restaurantId') rid: string, @Param('tableId', ParseUUIDPipe) tid: string) { await this.fp.deleteTable(A(u, rid), tid); }

  @RequirePermission(Permission.FLOORPLAN_MANAGE) @Put('restaurants/:restaurantId/manage/tables/:tableId')
  @ApiOperation({ summary: 'Table description, features and photos (OWNER/ADMIN)' })
  tableDetails(@CurrentUser() u: AuthUser, @Param('restaurantId') rid: string, @Param('tableId', ParseUUIDPipe) tid: string, @Body(new ZodPipe(tableDetailsSchema)) b: z.infer<typeof tableDetailsSchema>) { return this.fp.updateTableDetails(A(u, rid), tid, b); }

  @RequirePermission(Permission.QR_MANAGE) @Get('restaurants/:restaurantId/manage/qr-codes')
  @ApiOperation({ summary: 'QR code per table with SVG preview (OWNER/ADMIN)' })
  qr(@Param('restaurantId') rid: string) { return this.fp.listQr(rid); }

  @RequirePermission(Permission.QR_MANAGE) @Get('restaurants/:restaurantId/manage/qr-codes/print')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @ApiOperation({ summary: 'Print-ready HTML sheet of table QR codes (OWNER/ADMIN)' })
  print(@Param('restaurantId') rid: string, @Query(new ZodPipe(printQuery)) q: z.infer<typeof printQuery>) { return this.fp.printSheet(rid, q.tables?.split(',').filter(Boolean)); }

  @RequirePermission(Permission.QR_MANAGE) @Post('restaurants/:restaurantId/manage/tables/:tableId/qr/regenerate')
  @ApiOperation({ summary: 'Issue a new QR (old one stops working) (OWNER/ADMIN)' })
  regenerate(@CurrentUser() u: AuthUser, @Param('restaurantId') rid: string, @Param('tableId', ParseUUIDPipe) tid: string) { return this.fp.regenerateQr(A(u, rid), tid); }

  @RequirePermission(Permission.QR_MANAGE) @HttpCode(204) @Post('restaurants/:restaurantId/manage/tables/:tableId/qr/deactivate')
  @ApiOperation({ summary: 'Deactivate the table QR (OWNER/ADMIN)' })
  async deactivate(@CurrentUser() u: AuthUser, @Param('restaurantId') rid: string, @Param('tableId', ParseUUIDPipe) tid: string) { await this.fp.deactivateQr(A(u, rid), tid); }
}
