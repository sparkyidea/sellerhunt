import { afterEach, describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

let pathname = "/explorer/listings";

mock.module("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: () => undefined }),
  // A static prerender cannot know search params. Reading them anywhere in
  // the shell would bail the whole tree out to the client.
  useSearchParams: () => {
    throw new Error("shell must not read search params");
  },
}));
const { NavigationAreaProvider, useNavigationArea } = await import(
  "../navigation-area"
);

function Probe() {
  return <span data-area={useNavigationArea()}>shell</span>;
}

function render() {
  return renderToStaticMarkup(
    <NavigationAreaProvider>
      <Probe />
    </NavigationAreaProvider>
  );
}

afterEach(() => {
  pathname = "/explorer/listings";
});

describe("navigation area shell", () => {
  it("prerenders app and admin shells from the pathname alone", () => {
    expect(render()).toBe('<span data-area="app">shell</span>');
    pathname = "/admin/mobile-profiles";
    expect(render()).toBe('<span data-area="admin">shell</span>');
  });

  it("prerenders settings in the app area when no origin is remembered", () => {
    pathname = "/settings/security";
    expect(render()).toBe('<span data-area="app">shell</span>');
  });
});
