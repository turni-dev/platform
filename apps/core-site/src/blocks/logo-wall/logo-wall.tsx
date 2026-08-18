import { availableIntegrations, CATALOG_PATH } from '../../integrations/integration-catalog';
import type { Integration } from '../../integrations/integration-schema';
import type { LogoWallBlock } from './schema';
import styles from './logo-wall.module.scss';

type LogoWallProps = LogoWallBlock &
  Readonly<{
    /** Каталог целиком: стена сама отбирает из него работающие интеграции. */
    integrations: readonly Integration[];
  }>;

/**
 * Стена логотипов. Список берётся из каталога интеграций, поэтому смена статуса
 * в CMS меняет главную без деплоя; пустой каталог убирает секцию целиком —
 * пустая полоса выглядит как поломка.
 */
export function LogoWall({ heading, note, cta, integrations }: LogoWallProps) {
  const shown = availableIntegrations(integrations);
  if (shown.length === 0) {
    return null;
  }

  return (
    <section className={styles['section']} data-block="blocks.logo-wall" id="integrations">
      <div className={styles['inner']}>
        <h2 className={styles['heading']}>{heading}</h2>
        {note === undefined ? null : <p className={styles['note']}>{note}</p>}
        <ul className={styles['wall']}>
          {shown.map((integration) => (
            <li className={styles['item']} key={integration.slug}>
              <a className={styles['link']} href={`${CATALOG_PATH}/${integration.slug}`}>
                {integration.logo === undefined ? null : (
                  // Логотип подписан именем рядом, поэтому сам он декоративный.
                  <img alt="" className={styles['logo']} src={integration.logo} />
                )}
                <span className={styles['name']}>{integration.name}</span>
              </a>
            </li>
          ))}
        </ul>
        {cta === undefined ? null : (
          <a className={styles['cta']} href={cta.href}>
            {cta.label}
          </a>
        )}
      </div>
    </section>
  );
}
