import { afterEach, describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

let pathname = "/explorer/listings";

mock.module("next/navigation", () => ({
  usePathname: () => pathname,
  // A static prerender cannot know search params. Reading them anywhere in
  // the shell would bail the whole tree out to the client.
  useSearchParams: () => {
    throw new Error("shell must not read search params");
  },
}));
const { useNavigationArea } = await import("../use-navigation-area");

function Probe() {
  return <span data-area={useNavigationArea()}>shell</span>;
}

afterEach(() => {
  pathname = "/explorer/listings";
});

describe("useNavigationArea", () => {
  it("prerenders app, admin and settings shells from the pathname alone", () => {
    expect(renderToStaticMarkup(<Probe />)).toBe(
      '<span data-area="app">shell</span>'
    );
    pathname = "/admin/mobile-profiles";
    expect(renderToStaticMarkup(<Probe />)).toBe(
      '<span data-area="admin">shell</span>'
    );
    pathname = "/settings/security";
    expect(renderToStaticMarkup(<Probe />)).toBe(
      '<span data-area="app">shell</span>'
    );
  });
});
