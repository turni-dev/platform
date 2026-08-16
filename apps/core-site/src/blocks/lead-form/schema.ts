import { z } from 'zod';
import { LinkSchema } from '../shared';

/**
 * Варианты приходят списком строк (семя) либо повторяемым компонентом CMS,
 * где у каждого варианта своё поле. Компоненту в обоих случаях достаются
 * строки — редактору не приходится править json-поле в админке.
 */
const OptionSchema = z.union([
  z.string().min(1),
  z.object({ value: z.string().min(1) }).transform((option) => option.value)
]);

const ChoiceGroupSchema = z.object({
  legend: z.string().min(1),
  options: z.array(OptionSchema).min(1)
});

export const LeadFormBlockSchema = z.object({
  __component: z.literal('blocks.lead-form'),
  heading: z.string().min(1),
  note: z.string().min(1).optional(),
  submitLabel: z.string().min(1),
  /** Подписи полей — тоже контент: редактор меняет их, не трогая код. */
  labels: z.object({
    name: z.string().min(1),
    contact: z.string().min(1),
    company: z.string().min(1),
    task: z.string().min(1)
  }),
  groups: z.object({
    channels: ChoiceGroupSchema,
    hasServer: ChoiceGroupSchema,
    timeline: ChoiceGroupSchema,
    /** Необязательный вопрос: часть клиентов не может размещать данные за
     * пределами РФ, и это нужно знать до брифа — но склеивать это с согласием
     * на обработку персональных данных юридически некорректно. */
    foreignHosting: ChoiceGroupSchema.optional()
  }),
  /** Согласие на обработку персональных данных обязательно по 152-ФЗ. */
  consent: LinkSchema
});

export type LeadFormBlock = z.infer<typeof LeadFormBlockSchema>;
