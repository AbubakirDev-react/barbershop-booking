import { TZDate } from '@date-fns/tz'
import { format, startOfDay } from 'date-fns'

/**
 * Часовой пояс барбершопа. Расписание, слоты и даты в интерфейсе считаются
 * в нём, а не во времени устройства: клиент из другого пояса видит часы
 * работы такими, какие они в барбершопе, и выбирает то же время, что
 * проверит сервер. Значение приходит из shop_settings.
 */
let shopTz = 'Europe/Moscow'

export const setShopTimezone = (tz: string) => {
  shopTz = tz
}
export const getShopTimezone = () => shopTz

/** Тот же момент времени, но с календарём и часами пояса барбершопа */
export const inShopTz = (d: Date | string | number) => new TZDate(new Date(d).getTime(), shopTz)

export const shopNow = () => TZDate.tz(shopTz)
export const shopToday = () => startOfDay(shopNow())

/** Календарная дата 'yyyy-MM-dd' в поясе барбершопа */
export const dayKey = (d: Date | string | number) => format(inShopTz(d), 'yyyy-MM-dd')

/** Начало дня 'yyyy-MM-dd' в поясе барбершопа */
export function fromDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new TZDate(y!, (m ?? 1) - 1, d ?? 1, shopTz)
}
