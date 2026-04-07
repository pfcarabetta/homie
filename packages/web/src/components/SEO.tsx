import { Helmet } from 'react-helmet-async';

interface SEOProps {
  title: string;
  description: string;
  canonical: string;
  ogImage?: string;
  ogType?: string;
  noindex?: boolean;
}

const BASE_URL = 'https://homiepro.ai';

export default function SEO({
  title,
  description,
  canonical,
  ogImage = `${BASE_URL}/og-image.png`,
  ogType = 'website',
  noindex = false,
}: SEOProps) {
  const fullTitle = `${title} — Homie`;
  const canonicalUrl = `${BASE_URL}${canonical}`;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonicalUrl} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:type" content={ogType} />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />
      {noindex && <meta name="robots" content="noindex" />}
    </Helmet>
  );
}
