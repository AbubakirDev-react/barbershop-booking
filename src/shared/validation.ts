import { z } from 'zod'

/** Российский номер: +7 или 8 и 10 цифр, допускаются пробелы, скобки и дефисы */
export const phoneSchema = z
  .string()
  .trim()
  .min(1, 'Укажите телефон')
  .refine((v) => /^(\+7|8)\d{10}$/.test(v.replace(/[\s()-]/g, '')), 'Номер в формате +7 900 123-45-67')

export const nameSchema = z.string().trim().min(2, 'Минимум 2 символа').max(60, 'Слишком длинное имя')

export const profileSchema = z.object({
  name: nameSchema,
  surname: z.string().trim().max(60, 'Слишком длинная фамилия').optional(),
  phone: phoneSchema,
  email: z.union([z.literal(''), z.string().trim().email('Проверьте email')]).optional(),
})
export type ProfileForm = z.infer<typeof profileSchema>

export const normalizePhone = (v: string) => {
  const digits = v.replace(/\D/g, '')
  const ten = digits.slice(-10)
  return ten.length === 10
    ? `+7 ${ten.slice(0, 3)} ${ten.slice(3, 6)}-${ten.slice(6, 8)}-${ten.slice(8)}`
    : v.trim()
}
