import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

const LEGAL_PAGES = {
  privacy: {
    file: "privacy.md",
    title: "Privacy Policy",
    description: "How Dashseller collects, uses, and protects your data.",
  },
  terms: {
    file: "terms.md",
    title: "Terms of Service",
    description: "The terms that govern your use of Dashseller.",
  },
  cookies: {
    file: "cookies.md",
    title: "Cookie Policy",
    description: "How Dashseller uses cookies and similar technologies.",
  },
} as const;

type LegalSlug = keyof typeof LEGAL_PAGES;

const isLegalSlug = (slug: string): slug is LegalSlug =>
  Object.hasOwn(LEGAL_PAGES, slug);

interface LegalPageProps {
  params: Promise<{ slug: string }>;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(LEGAL_PAGES).map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: LegalPageProps): Promise<Metadata> {
  const { slug } = await params;
  if (!isLegalSlug(slug)) {
    return {};
  }
  const { title, description } = LEGAL_PAGES[slug];
  return { title: `${title} · Dashseller`, description };
}

async function loadContent(slug: LegalSlug) {
  const filePath = path.join(
    process.cwd(),
    "src",
    "content",
    "legal",
    LEGAL_PAGES[slug].file
  );
  return readFile(filePath, "utf-8");
}

export default async function LegalPage({ params }: LegalPageProps) {
  const { slug } = await params;
  if (!isLegalSlug(slug)) {
    notFound();
  }

  const content = await loadContent(slug);

  return (
    <main className="container mx-auto px-6 py-16 md:py-24">
      <article className="mx-auto max-w-3xl">
        <Markdown
          components={{
            h1: (props) => (
              <h1
                className="mb-8 font-semibold text-4xl tracking-tight md:text-5xl"
                {...props}
              />
            ),
            h2: (props) => (
              <h2
                className="mt-12 mb-4 font-semibold text-2xl tracking-tight md:text-3xl"
                {...props}
              />
            ),
            h3: (props) => (
              <h3
                className="mt-8 mb-3 font-semibold text-lg tracking-tight md:text-xl"
                {...props}
              />
            ),
            p: (props) => (
              <p
                className="my-4 text-base text-foreground/80 leading-relaxed"
                {...props}
              />
            ),
            ul: (props) => (
              <ul
                className="my-4 ml-6 list-disc space-y-2 text-foreground/80"
                {...props}
              />
            ),
            ol: (props) => (
              <ol
                className="my-4 ml-6 list-decimal space-y-2 text-foreground/80"
                {...props}
              />
            ),
            li: (props) => <li className="leading-relaxed" {...props} />,
            a: (props) => (
              <a
                className="text-primary underline-offset-4 hover:underline"
                {...props}
              />
            ),
            strong: (props) => (
              <strong className="font-semibold text-foreground" {...props} />
            ),
            code: (props) => (
              <code
                className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm"
                {...props}
              />
            ),
            hr: (props) => <hr className="my-10 border-border" {...props} />,
            table: (props) => (
              <div className="my-6 overflow-x-auto">
                <table
                  className="w-full border-collapse text-left text-sm"
                  {...props}
                />
              </div>
            ),
            thead: (props) => (
              <thead className="border-b bg-muted/50" {...props} />
            ),
            th: (props) => (
              <th
                className="px-4 py-2 font-semibold text-foreground"
                {...props}
              />
            ),
            td: (props) => (
              <td
                className="border-b px-4 py-2 align-top text-foreground/80"
                {...props}
              />
            ),
          }}
          remarkPlugins={[remarkGfm]}
        >
          {content}
        </Markdown>
      </article>
    </main>
  );
}
