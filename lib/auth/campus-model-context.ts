import { AsyncLocalStorage } from 'node:async_hooks';

type CampusModelContext = { modelString: string; apiKey: string };
const context = new AsyncLocalStorage<CampusModelContext>();

export function currentCampusModelContext(): CampusModelContext | undefined {
  return context.getStore();
}

export async function withCampusModelContext<T>(
  settings: CampusModelContext,
  work: () => Promise<T>,
): Promise<T> {
  return context.run(settings, work);
}
