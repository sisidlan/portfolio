// ============================================================================
// Shared button attribute contract
// ============================================================================
import type { HTMLAttributes } from 'astro/types';

/** Link styled as a button; supports class, target, aria-label, and other anchor attributes. */
export type ButtonLinkProps = HTMLAttributes<'a'> & {
    href: string;
};
