import type { BentoBlock } from './schema';
import styles from './bento.module.scss';

export function Bento({ heading, intro, tiles }: BentoBlock) {
  return (
    <section className={styles['section']} data-block="blocks.bento">
      <div className={styles['inner']}>
        {heading === undefined ? null : <h2 className={styles['heading']}>{heading}</h2>}
        {intro === undefined ? null : <p className={styles['intro']}>{intro}</p>}
        <ul className={styles['grid']}>
          {tiles.map((tile) => (
            <li className={styles['tile']} data-size={tile.size ?? 'standard'} key={tile.title}>
              <h3 className={styles['title']}>{tile.title}</h3>
              {tile.body === undefined ? null : <p className={styles['body']}>{tile.body}</p>}
              {tile.cta === undefined ? null : (
                <a className={styles['cta']} href={tile.cta.href}>
                  {tile.cta.label}
                </a>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
