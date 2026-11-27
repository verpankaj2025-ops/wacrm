import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';

const button = cva('button', {
  variants: { variant: { primary: 'button-primary', outline: 'button-outline' } },
  defaultVariants: { variant: 'primary' },
});

export function Button({ variant, className, ...props }: ComponentProps<'button'> & VariantProps<typeof button>) {
  return <button data-slot="button" className={cn(button({ variant }), className)} {...props} />;
}
