import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import './tokens.scss';
import './primitives.scss';

function classes(base: string, custom: string | undefined): string {
  return custom ? `${base} ${custom}` : base;
}

export type ButtonProps = ComponentPropsWithoutRef<'button'> & {
  variant?: 'primary' | 'secondary';
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, type = 'button', variant = 'primary', ...props }, ref) => (
    <button
      {...props}
      ref={ref}
      type={type}
      className={classes('turni-button', className)}
      data-variant={variant}
    />
  )
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
      className={classes('turni-input', className)}
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
      className={classes('turni-badge', className)}
      data-tone={tone}
    />
  )
);
Badge.displayName = 'Badge';
