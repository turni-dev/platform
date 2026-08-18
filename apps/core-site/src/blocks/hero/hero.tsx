import { Button } from 'antd';
import Image from 'next/image';
import type { HeroBlock } from './schema';
import styles from './hero.module.scss';

export function Hero({ heading, subheading, primaryCta, secondaryCta, media }: HeroBlock) {
  return (
    <section className={styles['hero']} data-block="blocks.hero">
      <div className={styles['inner']}>
        <div className={styles['copy']}>
          <h1 className={styles['heading']}>{heading}</h1>
          <p className={styles['subheading']}>{subheading}</p>
          <div className={styles['actions']}>
            <Button type="primary" size="large" href={primaryCta.href}>
              {primaryCta.label}
            </Button>
            {secondaryCta ? (
              <a className={styles['ghost']} href={secondaryCta.href}>
                {secondaryCta.label}
              </a>
            ) : null}
          </div>
        </div>
        {media ? (
          // Иллюстрация первого экрана — LCP-элемент страницы: она грузится
          // с приоритетом, а не откладывается как обычная картинка ниже сгиба.
          <Image
            className={styles['media']}
            src={media.src}
            alt={media.alt}
            width={media.width}
            height={media.height}
            priority
            fetchPriority="high"
          />
        ) : null}
      </div>
    </section>
  );
}
