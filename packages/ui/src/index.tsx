import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import { Slot } from '@radix-ui/react-slot';
import './tokens.scss';
import './tailwind.css';

function classes(base: string, custom: string | undefined): string {
  return custom ? `${base} ${custom}` : base;
}

type ButtonVariantProps = { variant?: 'primary' | 'secondary' };
type NativeButtonProps = ComponentPropsWithoutRef<'button'> &
  ButtonVariantProps & { asChild?: false };
type ComposedButtonProps = Omit<
  ComponentPropsWithoutRef<'button'>,
  'disabled'
> &
  ButtonVariantProps & { asChild: true; disabled?: never };
export type ButtonProps = NativeButtonProps | ComposedButtonProps;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ asChild = false, className, type, variant = 'primary', ...props }, ref) => {
    const classNames = classes(
      `inline-flex min-h-[var(--turni-control-height)] cursor-pointer items-center justify-center rounded-[var(--turni-radius-md)] border px-[var(--turni-space-4)] font-[inherit] focus-visible:outline-[var(--turni-focus-width)] focus-visible:outline-turni-focus-ring focus-visible:outline-offset-[var(--turni-focus-offset)] disabled:cursor-not-allowed disabled:opacity-[var(--turni-disabled-opacity)] ${variant === 'primary' ? 'border-turni-accent bg-turni-accent text-turni-accent-contrast' : 'border-turni-border bg-turni-surface text-turni-text'}`,
      className
    );

    if (asChild) {
      return (
        <Slot
          {...props}
          ref={ref}
          className={classNames}
          data-variant={variant}
        />
      );
    }

    return (
      <button
        {...props}
        ref={ref}
        type={type ?? 'button'}
        className={classNames}
        data-variant={variant}
      />
    );
  }
);
Button.displayName = 'Button';

export type InputProps = ComponentPropsWithoutRef<'input'> & {
  invalid?: boolean;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid = false, ...props }, ref) => (
    <input
      {...props}
      ref={ref}
      className={classes(
        'min-h-[var(--turni-control-height)] w-full rounded-[var(--turni-radius-sm)] border border-turni-border bg-turni-surface px-[var(--turni-space-3)] font-[inherit] text-turni-text focus-visible:outline-[var(--turni-focus-width)] focus-visible:outline-turni-focus-ring focus-visible:outline-offset-[var(--turni-focus-offset)] aria-[invalid=true]:border-turni-danger',
        className
      )}
      aria-invalid={invalid || undefined}
    />
  )
);
Input.displayName = 'Input';

export type TextareaProps = ComponentPropsWithoutRef<'textarea'> & {
  invalid?: boolean;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, invalid = false, ...props }, ref) => (
    <textarea
      {...props}
      ref={ref}
      className={classes(
        'min-h-[var(--turni-control-height)] w-full rounded-[var(--turni-radius-sm)] border border-turni-border bg-turni-surface px-[var(--turni-space-3)] py-[var(--turni-space-2)] font-[inherit] text-turni-text focus-visible:outline-[var(--turni-focus-width)] focus-visible:outline-turni-focus-ring focus-visible:outline-offset-[var(--turni-focus-offset)] aria-[invalid=true]:border-turni-danger',
        className
      )}
      aria-invalid={invalid || undefined}
    />
  )
);
Textarea.displayName = 'Textarea';

export type BadgeProps = ComponentPropsWithoutRef<'span'> & {
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
};

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, tone = 'neutral', ...props }, ref) => (
    <span
      {...props}
      ref={ref}
      className={classes(
        'inline-flex rounded-[var(--turni-radius-sm)] bg-turni-surface-subtle px-[var(--turni-space-2)] py-[var(--turni-space-1)] font-[inherit] text-(length:--turni-font-size-sm) text-turni-text data-[tone=success]:text-turni-success data-[tone=warning]:text-turni-warning data-[tone=danger]:text-turni-danger',
        className
      )}
      data-tone={tone}
    />
  )
);
Badge.displayName = 'Badge';
