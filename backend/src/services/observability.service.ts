/** Minimal dependency-free counters. Export through the health endpoint and
 * scrape/process them into the deployment's metrics backend. */
const counters = new Map<string, number>();

export function incrementMetric(name: string): void {
  counters.set(name, (counters.get(name) ?? 0) + 1);
}

export function publicMetrics(): Record<string, number> {
  return Object.fromEntries([...counters.entries()].sort(([a], [b]) => a.localeCompare(b)));
}
