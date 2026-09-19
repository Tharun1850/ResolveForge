interface RenderSummary {
  components: Record<string, number>;
  total: number;
}

declare global {
  interface Window {
    __RESOLVEFORGE_RENDERS__?: RenderSummary;
  }
}

export function recordRender(component: string): void {
  const current = window.__RESOLVEFORGE_RENDERS__ ?? { components: {}, total: 0 };
  const componentCount = current.components[component] ?? 0;
  window.__RESOLVEFORGE_RENDERS__ = {
    components: { ...current.components, [component]: componentCount + 1 },
    total: current.total + 1,
  };
}
