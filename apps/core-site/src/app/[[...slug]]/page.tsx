import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { renderBlocks } from '../../blocks/block-renderer';
import { sitePages, siteSettings } from '../../content/site-pages';
import type { Page } from '../../blocks/page-schema';

type RouteParams = Readonly<{ params: Promise<{ slug?: string[] }> }>;

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

export default async function SitePage({ params }: RouteParams) {
  const slug = (await params).slug;
  redirectRootToOffer(slug);

  const page = await loadPage(slug);

  return <>{renderBlocks(page.blocks)}</>;
}
