import type { ReactElement } from "react";
import { Squirrel404 } from "../assets/svg/squirrel-404";
import { cn } from "../lib/utils";
import { Button } from "./button";

interface NotFoundProps {
  buttonLabel?: string;
  className?: string;
  description?: string;
  homeLink: ReactElement;
  title?: string;
}

export function NotFound({
  homeLink,
  title = "Page Not Found",
  description = "We couldn't find the page you are looking for",
  buttonLabel = "Back to home page",
  className,
}: NotFoundProps) {
  return (
    <div
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-8 px-6 py-12",
        className
      )}
    >
      <Squirrel404
        aria-label={title}
        className="h-48 w-auto text-foreground sm:h-56 md:h-64"
        role="img"
      />

      <div className="text-center">
        <h4 className="mb-1.5 font-semibold text-2xl">{title}</h4>
        <p className="mb-5">{description}</p>
        <Button nativeButton={false} render={homeLink} size="lg">
          {buttonLabel}
        </Button>
      </div>
    </div>
  );
}
