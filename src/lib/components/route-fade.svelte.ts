/**
 * Whether route changes fade the new page in. It turns on at the first client-side navigation to
 * another path, so a full load paints at full opacity. It lives outside `RouteMain` because the root
 * layout's locale key remounts that component on a client-side locale switch, which should still
 * fade.
 */
class RouteFade {
  active = $state(false);

  reset(): void {
    this.active = false;
  }
}

export const routeFade = new RouteFade();
