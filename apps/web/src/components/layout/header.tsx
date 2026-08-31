"use client";
import { AnimatedMenuIcon } from "@sparkyidea/ui/components/animated-menu-icon";
import { Button } from "@sparkyidea/ui/components/button";
import { Icons } from "@sparkyidea/ui/icons";
import type { Route } from "next";
import Link from "next/link";
import React from "react";
import { DynamicLink } from "@/components/layout/dynamic-link";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { MenuItems, SIGN_UP_URL } from "@/configs/routes.config";

interface HeaderProps {
  className?: string;
}

export const Header = ({ className }: HeaderProps) => {
  const [menuState, setMenuState] = React.useState(false);

  return (
    <header className={className}>
      <nav
        className="fixed top-0 z-50 w-full px-2"
        data-state={menuState && "active"}
      >
        <div
          className={
            "container mx-auto mt-2 rounded-2xl bg-secondary px-3 shadow-sm backdrop-blur-2xl transition-all duration-300 lg:rounded-3xl lg:bg-background/50 lg:px-12 lg:shadow-none"
          }
        >
          {/* Header Section */}
          <div className="relative flex items-center justify-between gap-6 py-2 duration-200 lg:gap-0 lg:py-4">
            <div className="flex w-full items-center gap-2 lg:w-auto">
              <DynamicLink
                aria-label="home"
                className="flex items-center"
                href="/"
              >
                <Icons.logo className="h-5 w-5" />
                <span className="font-bold text-xl">ashseller</span>
              </DynamicLink>
              <div className="hidden lg:ml-8 lg:block">
                <ul className="flex gap-8">
                  {MenuItems.map((item, index) => (
                    <li key={index}>
                      <Link
                        className="block font-medium duration-150 hover:text-accent-foreground"
                        href={item.href as Route}
                      >
                        <span>{item.title}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <Button
                aria-label={menuState ? "Close menu" : "Open menu"}
                className="rounded-full lg:hidden"
                onClick={() => setMenuState(!menuState)}
                size="icon"
                variant="outline"
              >
                <AnimatedMenuIcon isOpen={menuState} />
              </Button>
              <div className="hidden items-center gap-4 lg:flex">
                <ThemeSwitcher mode="icon" />
                <Button
                  className="rounded-full bg-[#5865f2] text-palette-white hover:bg-[#5865f2]/80!"
                  nativeButton={false}
                  render={
                    <Link
                      href={
                        (process.env.NEXT_PUBLIC_DISCORD_URL || "#") as Route
                      }
                      rel="noopener noreferrer"
                      target="_blank"
                    />
                  }
                  size="icon"
                >
                  <Icons.discord className="h-4 w-4 text-white" />
                </Button>
                <Button
                  nativeButton={false}
                  render={<Link href={"#" as Route} />}
                  variant="outline"
                >
                  Contact Sales
                </Button>
                <Button
                  nativeButton={false}
                  render={<Link href={SIGN_UP_URL as Route} />}
                >
                  Get Started
                </Button>
              </div>
            </div>
          </div>

          {/* Mobile Menu */}
          <div
            className={`grid transition-all duration-300 ease-in-out lg:hidden ${
              menuState
                ? "grid-rows-[1fr] opacity-100"
                : "grid-rows-[0fr] opacity-0"
            }`}
          >
            <div className="overflow-hidden">
              <div className="px-2 pt-3 pb-5">
                <ul className="flex flex-col gap-4">
                  {MenuItems.map((item, index) => (
                    <li
                      className={`transition-all duration-300 ${menuState ? "translate-x-0 opacity-100" : "-translate-x-4 opacity-0"}`}
                      key={index}
                      style={{ transitionDelay: `${index * 50}ms` }}
                    >
                      <Link
                        className="block font-medium text-xl duration-150 hover:text-accent-foreground"
                        href={item.href as Route}
                        onClick={() => setMenuState(false)}
                      >
                        <span>{item.title}</span>
                      </Link>
                    </li>
                  ))}
                  <div className="flex flex-col gap-2 border-border border-y py-4">
                    <Button
                      nativeButton={false}
                      render={<Link href={SIGN_UP_URL as Route} />}
                    >
                      Get Started
                    </Button>
                    <Button
                      nativeButton={false}
                      render={<Link href={"#" as Route} />}
                      variant="outline"
                    >
                      Contact Sales
                    </Button>
                    <Button
                      className="bg-[#5865f2] text-palette-white hover:bg-[#5865f2]/80! lg:hidden"
                      nativeButton={false}
                      render={
                        <Link
                          href={
                            (process.env.NEXT_PUBLIC_DISCORD_URL ||
                              "#") as Route
                          }
                          rel="noopener noreferrer"
                          target="_blank"
                        />
                      }
                    >
                      <Icons.discord className="h-4 w-4" />
                      <span>Discord</span>
                    </Button>
                  </div>
                  <div className="flex flex-col">
                    <ThemeSwitcher mode="button" variant="ghost" />
                  </div>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </nav>
    </header>
  );
};
