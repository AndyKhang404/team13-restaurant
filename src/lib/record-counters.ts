export type CountedResource = 'dish' | 'chef' | 'ingredient';

interface CounterState {
  total: number | null;
  version: number;
  loading: Promise<number> | null;
}

function emptyCounter(): CounterState {
  return { total: null, version: 0, loading: null };
}

const counters: Record<CountedResource, CounterState> = {
  dish: emptyCounter(),
  chef: emptyCounter(),
  ingredient: emptyCounter(),
};

async function queryDatabaseCount(resource: CountedResource): Promise<number> {
  const { prisma } = await import('./prisma.js');
  const where = { deletedAt: null };
  switch (resource) {
    case 'dish':
      return prisma.dish.count({ where });
    case 'chef':
      return prisma.chef.count({ where });
    case 'ingredient':
      return prisma.ingredient.count({ where });
  }
}

export function getVisibleRecordCount(resource: CountedResource): Promise<number> {
  const counter = counters[resource];
  if (counter.total !== null) return Promise.resolve(counter.total);

  if (!counter.loading) {
    const version = counter.version;
    counter.loading = queryDatabaseCount(resource)
      .then((total) => {
        if (counter.version === version) counter.total = total;
        return counter.total ?? total;
      })
      .finally(() => {
        counter.loading = null;
      });
  }

  return counter.loading;
}

export function bumpVisibleRecordCount(resource: CountedResource, delta: number): void {
  const counter = counters[resource];
  counter.version += 1;
  if (counter.total !== null) {
    counter.total = Math.max(0, counter.total + delta);
  }
}

export function resetRecordCounters(): void {
  for (const counter of Object.values(counters)) {
    counter.total = null;
    counter.version += 1;
    counter.loading = null;
  }
}
