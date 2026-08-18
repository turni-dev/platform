import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { renderBlocks } from '../../blocks/block-renderer';
import {
  parseRequestedIntegration,
  REQUESTED_INTEGRATION_PARAM
} from '../../integrations/integration-catalog';
import { sitePages, siteSettings, siteBookingSlots, siteIntegrations } from '../../content/site-pages';
import type { Page } from '../../blocks/page-schema';

type RouteParams = Readonly<{ params: Promise<{ slug?: string[] }> }>;

type SearchParams = Readonly<Record<string, string | string[] | undefined>>;

type PageProps = RouteParams & Readonly<{ searchParams: Promise<SearchParams> }>;

/** Оффер живёт на своём адресе — корень домена его больше не показывает. */
const OFFER_PATH = 'products/private-agent';

function pathOf(slug: string[] | undefined): string {
  return (slug ?? []).join('/');
}

/**
 * Корень домена ждёт будущую главную корп-сайта. Контента на нём нет — только
 * временный (307) редирект на оффер, чтобы не терять посетителей и не терять
 * возможность позже отдать корень чему-то другому без склейки контента.
 */
function redirectRootToOffer(slug: string[] | undefined): void {
  if (pathOf(slug).length === 0) {
    redirect(`/${OFFER_PATH}`);
  }
}

async function loadPage(slug: string[] | undefined): Promise<Page> {
  const page = await sitePages.getPage(pathOf(slug));
  if (page === undefined) {
    notFound();
  }

  return page;
}

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const slug = (await params).slug;
  redirectRootToOffer(slug);

  const [page, settings] = await Promise.all([loadPage(slug), siteSettings.get()]);
  // Страница уточняет то, что задано для сайта целиком, а не повторяет его.
  const title = page.seo?.metaTitle ?? page.title ?? settings.defaultSeo?.metaTitle;
  const description =
    page.seo?.metaDescription ?? page.description ?? settings.defaultSeo?.metaDescription;
  const image = page.seo?.metaImage ?? settings.defaultSeo?.metaImage;
  const canonical = page.seo?.canonicalURL;

  return {
    ...(title === undefined ? {} : { title }),
    ...(description === undefined ? {} : { description }),
    ...(canonical === undefined ? {} : { alternates: { canonical } }),
    ...(page.seo?.metaRobots === undefined ? {} : { robots: page.seo.metaRobots }),
    openGraph: {
      ...(title === undefined ? {} : { title }),
      ...(description === undefined ? {} : { description }),
      ...(image === undefined ? {} : { images: [image] })
    }
  };
}

export default async function SitePage({ params, searchParams }: PageProps) {
  const slug = (await params).slug;
  redirectRootToOffer(slug);

  // Каталог интеграций нужен только стене логотипов, но грузится он рядом со
  // страницей: блок серверный, своего запроса сделать не может.
  const [page, slots, integrations, query] = await Promise.all([
    loadPage(slug),
    siteBookingSlots.get(),
    siteIntegrations.list(),
    searchParams
  ]);

  // Пришли из каталога по кнопке «Нужна эта интеграция» — форма отправит слаг
  // скрытым полем. Значение проверяется здесь, на сервере: разметка страницы
  // не должна зависеть от того, что кто-то дописал в адрес.
  const requestedIntegration = parseRequestedIntegration(query[REQUESTED_INTEGRATION_PARAM]);

  return (
    <>
      {renderBlocks(page.blocks, {
        ...(slots.length === 0 ? {} : { slots }),
        ...(integrations.length === 0 ? {} : { integrations }),
        ...(requestedIntegration === undefined ? {} : { requestedIntegration })
      })}
    </>
  );
}
