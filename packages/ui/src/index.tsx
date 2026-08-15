import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import { Slot } from '@radix-ui/react-slot';
import './tokens.scss';
import './tailwind.css';

function classes(base: string, custom: string | undefined): string {
  return custom ? `${base} ${custom}` : base;
}

export type ButtonProps = ComponentPropsWithoutRef<'button'> & {
  asChild?: boolean;
  variant?: 'primary' | 'secondary';
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ asChild = false, className, type, variant = 'primary', ...props }, ref) => {
    const classNames = classes(
      'inline-flex min-h-[var(--turni-control-height)] cursor-pointer items-center justify-center rounded-[var(--turni-radius-md)] border border-turni-accent px-[var(--turni-space-4)] font-[inherit] tracking-normal focus-visible:outline-[var(--turni-focus-width)] focus-visible:outline-turni-focus-ring focus-visible:outline-offset-[var(--turni-focus-offset)] disabled:cursor-not-allowed disabled:opacity-[var(--turni-disabled-opacity)] data-[variant=primary]:bg-turni-accent data-[variant=primary]:text-turni-accent-contrast data-[variant=secondary]:border-turni-border data-[variant=secondary]:bg-turni-surface data-[variant=secondary]:text-turni-text',
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
        'min-h-[var(--turni-control-height)] w-full rounded-[var(--turni-radius-sm)] border border-turni-border bg-turni-surface px-[var(--turni-space-3)] font-[inherit] tracking-normal text-turni-text focus-visible:outline-[var(--turni-focus-width)] focus-visible:outline-turni-focus-ring focus-visible:outline-offset-[var(--turni-focus-offset)] aria-[invalid=true]:border-turni-danger',
        className
      )}
      aria-invalid={invalid || undefined}
    />
  )
);
Input.displayName = 'Input';

export type BadgeProps = ComponentPropsWithoutRef<'span'> & {
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
};

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, tone = 'neutral', ...props }, ref) => (
    <span
      {...props}
      ref={ref}
      className={classes(
        'inline-flex rounded-[var(--turni-radius-sm)] bg-turni-surface-subtle px-[var(--turni-space-2)] py-[var(--turni-space-1)] font-[inherit] text-[var(--turni-font-size-sm)] tracking-normal text-turni-text data-[tone=success]:text-turni-success data-[tone=warning]:text-turni-warning data-[tone=danger]:text-turni-danger',
        className
      )}
      data-tone={tone}
    />
  )
);
Badge.displayName = 'Badge';
