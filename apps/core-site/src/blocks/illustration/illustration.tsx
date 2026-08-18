import Image from 'next/image';
import type { IllustrationBlock } from './schema';
import styles from './illustration.module.scss';

export function Illustration({ media, caption }: IllustrationBlock) {
  return (
    <figure className={styles['section']} data-block="blocks.illustration">
      <div className={styles['inner']}>
        {/* Иллюстрация стоит ниже сгиба: в отличие от первого экрана она
            грузится лениво и не отбирает канал у LCP-элемента. */}
        <Image
          className={styles['media']}
          src={media.src}
          alt={media.alt}
          width={media.width}
          height={media.height}
          sizes="(min-width: 1120px) 1120px, 100vw"
        />
        {caption === undefined ? null : (
          <figcaption className={styles['caption']}>{caption}</figcaption>
        )}
      </div>
    </figure>
  );
}
