import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { renderBlocks } from '../../blocks/block-renderer';
import { sitePages, siteSettings } from '../../content/site-pages';
import type { Page } from '../../blocks/page-schema';

type RouteParams = Readonly<{ params: Promise<{ slug?: string[] }> }>;

/** Корень страницы — тот же путь, просто пустой: слаг главной равен `home`. */
function pathOf(slug: string[] | undefined): string {
  const path = (slug ?? []).join('/');

  return path.length === 0 ? 'home' : path;
}

async function loadPage(slug: string[] | undefined): Promise<Page> {
  const page = await sitePages.getPage(pathOf(slug));
  if (page === undefined) {
    notFound();
  }

  return page;
}

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const [page, settings] = await Promise.all([
    loadPage((await params).slug),
    siteSettings.get()
  ]);
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
  const page = await loadPage((await params).slug);

  return <>{renderBlocks(page.blocks)}</>;
}
