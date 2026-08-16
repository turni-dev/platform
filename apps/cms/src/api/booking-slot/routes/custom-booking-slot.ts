/**
 * Собственные маршруты рядом со стандартным core-router: `available` отдаёт
 * только пригодные для записи слоты (сервер сам решает, что показать, а не
 * права токена), `reserve`/`release` — атомарные операции над `bookedCount`.
 * Доступ по-прежнему решает роль/токен в админке — как и у остальных
 * маршрутов `content-api` в этом проекте.
 */
export default {
  type: 'content-api',
  routes: [
    {
      method: 'GET',
      path: '/booking-slots/available',
      handler: 'booking-slot.available'
    },
    {
      method: 'POST',
      path: '/booking-slots/:id/reserve',
      handler: 'booking-slot.reserve'
    },
    {
      method: 'POST',
      path: '/booking-slots/:id/release',
      handler: 'booking-slot.release'
    }
  ]
};
