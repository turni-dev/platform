import { z } from 'zod';

/** Every call to action and menu entry on the site looks like this. */
export const LinkSchema = z.object({
  label: z.string().min(1),
  href: z.string().min(1)
});

export type BlockLink = z.infer<typeof LinkSchema>;

/**
 * Картинка из медиатеки Strapi. Размеры и адрес приходят из библиотеки, а не
 * вводятся редактором: опечатка в ширине означает прыгающий макет, а его
 * никто не заметит до продакшена. Alt остаётся полем компонента — одна и та
 * же иллюстрация в разных местах описывается по-разному, и пустой она быть
 * не может.
 */
export const MediaSchema = z
  .object({
    file: z.object({
      url: z.string().min(1),
      width: z.number().int().positive(),
      height: z.number().int().positive()
    }),
    alt: z.string().min(1)
  })
  .transform(({ file, alt }) => ({
    src: file.url,
    alt,
    width: file.width,
    height: file.height
  }));

export type BlockMedia = z.infer<typeof MediaSchema>;
