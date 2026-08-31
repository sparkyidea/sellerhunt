import { Card, CardContent } from "@sparkyidea/ui/components/card";
import Image from "next/image";
import type { ScanListingData } from "../types";

export function ScanListingInfoCard({ listing }: { listing: ScanListingData }) {
  const images = listing.imageUrls ?? [];
  const categoryPath = listing.categoryPath ?? [];

  return (
    <Card>
      <CardContent className="flex flex-col gap-5">
        {images.length > 0 && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {images.map((url, idx) => (
              <div
                className="relative aspect-square overflow-hidden rounded-md border bg-muted"
                key={url}
              >
                <Image
                  alt={`${listing.title} image ${idx + 1}`}
                  className="object-cover"
                  fill
                  sizes="(max-width: 768px) 50vw, 33vw"
                  src={url}
                />
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
            Title
          </span>
          <h2 className="font-semibold text-base leading-snug">
            {listing.title}
          </h2>
        </div>

        {categoryPath.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
              Category
            </span>
            <div className="flex flex-wrap items-center gap-1 text-sm">
              {categoryPath.map((segment, idx) => (
                <span
                  className="flex items-center gap-1"
                  key={`${segment}-${idx}`}
                >
                  <span>{segment}</span>
                  {idx < categoryPath.length - 1 && (
                    <span className="text-muted-foreground">/</span>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}

        {listing.description && (
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
              Description
            </span>
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
              {listing.description}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
