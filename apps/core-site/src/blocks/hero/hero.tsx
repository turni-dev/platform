import { Button } from '@turni/ui';
import type { HeroBlock } from './schema.js';
import styles from './hero.module.scss';

export function Hero({ heading, subheading, primaryCta, secondaryCta, media }: HeroBlock) {
  return (
    <section className={styles['hero']} data-block="blocks.hero">
      <div className={styles['inner']}>
        <div className={styles['copy']}>
          <h1 className={styles['heading']}>{heading}</h1>
          <p className={styles['subheading']}>{subheading}</p>
          <div className={styles['actions']}>
            <Button asChild>
              <a href={primaryCta.href}>{primaryCta.label}</a>
            </Button>
            {secondaryCta ? (
              <a className={styles['ghost']} href={secondaryCta.href}>
                {secondaryCta.label}
              </a>
            ) : null}
          </div>
        </div>
        {media ? (
          <img
            className={styles['media']}
            src={media.src}
            alt={media.alt}
            width={media.width}
            height={media.height}
            decoding="async"
            fetchPriority="high"
          />
        ) : null}
      </div>
    </section>
  );
}
