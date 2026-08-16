import type { Core } from '@strapi/strapi';

const allowedMediaTypes = [
  'image/*',
  'video/*',
  'audio/*',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.*',
  'text/plain',
  'text/csv',
];

const deniedExecutableTypes = [
  'application/vnd.microsoft.portable-executable',
  'application/x-msdownload',
  'application/x-msdos-program',
  'application/x-executable',
  'application/x-dosexec',
  'application/x-sh',
  'text/x-shellscript',
  'application/x-mach-binary',
];

// Сайт ходит в CMS только по API-токенам, поэтому users-permissions с его
// публичной ролью и пользовательскими JWT не нужен, а plugin-cloud относится
// к Strapi Cloud, которым мы не пользуемся.
const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Plugin => ({
  // Письмо о новой заявке уходит отсюда. В деве адресат — mailpit из
  // compose.site.yml, поэтому ничего наружу не улетает.
  email: {
    config: {
      provider: 'nodemailer',
      providerOptions: {
        host: env('SMTP_HOST', 'mailpit'),
        port: env.int('SMTP_PORT', 1025),
        secure: env.bool('SMTP_SECURE', false),
        ignoreTLS: env.bool('SMTP_IGNORE_TLS', true),
      },
      settings: {
        defaultFrom: env('EMAIL_FROM', 'site@turni.ru'),
        defaultReplyTo: env('EMAIL_FROM', 'site@turni.ru'),
      },
    },
  },
  upload: {
    config: {
      security: {
        allowedTypes: allowedMediaTypes,
        deniedTypes: deniedExecutableTypes,
      },
    },
  },
});

export default config;
