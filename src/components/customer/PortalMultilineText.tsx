import { Fragment, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Renders multi-line text the same way as office textareas: each `\n` becomes a line break
 * (via `<br />`). Safe inside `<p>`; long lines still wrap with `break-words`.
 */
export function PortalMultilineText({
  text,
  className,
}: {
  text: string | null | undefined;
  className?: string;
}): ReactNode {
  const raw = String(text ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\u2028/g, '\n')
    .replace(/\u2029/g, '\n');
  if (!raw.trim()) return null;
  const lines = raw.split('\n');
  return (
    <span className={cn('inline-block max-w-full whitespace-normal break-words', className)}>
      {lines.map((line, i) => (
        <Fragment key={i}>
          {i > 0 ? <br /> : null}
          {line}
        </Fragment>
      ))}
    </span>
  );
}
