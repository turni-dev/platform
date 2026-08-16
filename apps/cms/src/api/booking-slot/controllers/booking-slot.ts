import { factories } from '@strapi/strapi';
import type { Core } from '@strapi/strapi';
import type { Context } from 'koa';

const UID = 'api::booking-slot.booking-slot';

interface BookingSlotRow {
  readonly id: number;
  readonly startsAt: Date | string;
  readonly durationMinutes: number;
  readonly capacity: number;
  readonly bookedCount: number;
}

/** Публичная форма слота: время известно, кухня с местами — нет. */
interface PublicSlot {
  readonly id: number;
  readonly startsAt: string;
  readonly durationMinutes: number;
}

const AVAILABLE_LIMIT = 20;
// Кандидатов читаем с запасом: движок запросов умеет сравнить `startsAt` с
// точкой во времени, но не умеет сравнить `bookedCount` с `capacity` — это
// сравнение двух полей одной строки, а не поля со значением. Поэтому по
// вместимости фильтруем уже в памяти, после чтения.
const CANDIDATE_LIMIT = 100;

function toPublicSlot(row: BookingSlotRow): PublicSlot {
  return {
    id: row.id,
    startsAt: row.startsAt instanceof Date ? row.startsAt.toISOString() : row.startsAt,
    durationMinutes: row.durationMinutes
  };
}

/** Реальное имя столбца для атрибута: Strapi хранит их в snake_case. */
function columnName(strapi: Core.Strapi, attribute: string): string {
  const meta = strapi.db.metadata.get(UID);
  const found = meta.attributes[attribute];

  return found !== undefined && 'columnName' in found && typeof found.columnName === 'string'
    ? found.columnName
    : attribute;
}

function parseId(raw: string | undefined): number | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const id = Number.parseInt(raw, 10);

  return Number.isInteger(id) && id > 0 ? id : undefined;
}

/**
 * Koa не типизирует `params` в базовом `Context` — их кладёт туда роутер
 * Strapi во время матчинга маршрута, уже после того, как типы описаны.
 * Достаём id тем же способом, что и остальные кастомные контроллеры Strapi.
 */
function routeId(ctx: Context): string | undefined {
  const params = (ctx as unknown as { params?: Readonly<Record<string, string | undefined>> })
    .params;

  return params?.['id'];
}

export default factories.createCoreController(UID, ({ strapi }: { strapi: Core.Strapi }) => ({
  /**
   * Публичный список слотов: только будущие и только те, где ещё есть место.
   * Точные числа `capacity`/`bookedCount` наружу не идут — это внутренняя
   * кухня, клиенту нужно только «свободно/занято».
   */
  async available(ctx: Context): Promise<void> {
    const now = new Date().toISOString();
    const rows = (await strapi.db.query(UID).findMany({
      where: { startsAt: { $gt: now } },
      orderBy: { startsAt: 'asc' },
      limit: CANDIDATE_LIMIT
    })) as readonly BookingSlotRow[];

    const slots = rows
      .filter((row) => row.bookedCount < row.capacity)
      .slice(0, AVAILABLE_LIMIT)
      .map(toPublicSlot);

    ctx.status = 200;
    ctx.body = { data: slots };
  },

  /**
   * Атомарно бронирует слот: инкремент `bookedCount` проходит одним UPDATE с
   * условием `bookedCount < capacity` прямо в БД, поэтому два одновременных
   * запроса не могут оба решить, что место ещё есть — гонки чтение-изменение-
   * запись здесь просто нет.
   */
  async reserve(ctx: Context): Promise<void> {
    const id = parseId(routeId(ctx));
    if (id === undefined) {
      ctx.throw(400, 'Некорректный идентификатор слота');

      return;
    }

    const meta = strapi.db.metadata.get(UID);
    const knex = strapi.db.connection;
    const bookedCountColumn = columnName(strapi, 'bookedCount');
    const capacityColumn = columnName(strapi, 'capacity');

    const affected: number = await knex(meta.tableName)
      .where('id', id)
      .andWhere(bookedCountColumn, '<', knex.ref(capacityColumn))
      .update({ [bookedCountColumn]: knex.raw('?? + 1', [bookedCountColumn]) });

    if (affected > 0) {
      ctx.status = 200;
      ctx.body = { status: 'reserved' };

      return;
    }

    const exists = await strapi.db.query(UID).findOne({ where: { id }, select: ['id'] });
    if (exists === null) {
      ctx.throw(404, 'Слот не найден');

      return;
    }

    ctx.throw(409, 'Слот уже занят');
  },

  /**
   * Симметричный атомарный откат брони на будущее (полный сценарий отмены
   * заявки — вне скоупа этой задачи, вызывать сейчас неоткуда). Нижняя
   * граница — 0: декремент не выполняется, если бронировать уже нечего.
   */
  async release(ctx: Context): Promise<void> {
    const id = parseId(routeId(ctx));
    if (id === undefined) {
      ctx.throw(400, 'Некорректный идентификатор слота');

      return;
    }

    const meta = strapi.db.metadata.get(UID);
    const knex = strapi.db.connection;
    const bookedCountColumn = columnName(strapi, 'bookedCount');

    const affected: number = await knex(meta.tableName)
      .where('id', id)
      .andWhere(bookedCountColumn, '>', 0)
      .update({ [bookedCountColumn]: knex.raw('?? - 1', [bookedCountColumn]) });

    if (affected > 0) {
      ctx.status = 200;
      ctx.body = { status: 'released' };

      return;
    }

    const exists = await strapi.db.query(UID).findOne({ where: { id }, select: ['id'] });
    if (exists === null) {
      ctx.throw(404, 'Слот не найден');

      return;
    }

    ctx.throw(409, 'Слот уже свободен');
  }
}));
