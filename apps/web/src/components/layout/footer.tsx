import { Icons } from "@sparkyidea/ui/icons";
import type { Route } from "next";
import Link from "next/link";
import { LegalLinks, MenuItems } from "@/configs/routes.config";

const socialLinks = [
  { label: "X/Twitter", icon: Icons.twitter, href: "#" },
  { label: "LinkedIn", icon: Icons.linkedin, href: "#" },
  { label: "Facebook", icon: Icons.facebook.mono, href: "#" },
  { label: "Threads", icon: Icons.threads, href: "#" },
  { label: "Instagram", icon: Icons.instagram, href: "#" },
  { label: "TikTok", icon: Icons.tiktok.mono, href: "#" },
];

export function Footer() {
  return (
    <footer className="pb-16 md:pb-32">
      <div className="mx-auto max-w-5xl px-6">
        <div className="my-8 flex flex-wrap justify-center gap-6 text-sm">
          {MenuItems.map((item) => (
            <Link
              className="block text-muted-foreground duration-150 hover:text-primary"
              href={item.href as Route}
              key={item.title}
            >
              <span>{item.title}</span>
            </Link>
          ))}
        </div>
        <div className="my-8 flex flex-wrap justify-center gap-6 text-sm">
          {LegalLinks.map((item) => (
            <Link
              className="block text-muted-foreground duration-150 hover:text-primary"
              href={item.href as Route}
              key={item.title}
            >
              <span>{item.title}</span>
            </Link>
          ))}
        </div>
        <div className="my-8 flex flex-wrap justify-center gap-6 text-sm">
          {socialLinks.map((social) => (
            <Link
              aria-label={social.label}
              className="block text-muted-foreground hover:text-primary"
              href={social.href as Route}
              key={social.label}
              rel="noopener noreferrer"
              target="_blank"
            >
              <social.icon className="size-6" />
            </Link>
          ))}
        </div>
        <span className="block text-center text-muted-foreground text-sm">
          {" "}
          Copyright © {new Date().getFullYear()} Sparky Idea Inc. All rights
          reserved.
        </span>
      </div>
    </footer>
  );
}
