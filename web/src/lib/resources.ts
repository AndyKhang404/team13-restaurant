import { apiFetch, loadSession, setAuthToken } from './api';
import type {
  AuthUser,
  Chef,
  ChefInput,
  ChefQueryParams,
  Dish,
  DishChef,
  DishFilterOptions,
  DishIngredientLine,
  DishInput,
  DishQueryParams,
  Ingredient,
  IngredientInput,
  IngredientQueryParams,
  UserItem,
  UserQueryParams,
  UserRole,
} from './types';

function buildQuery(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const term = value?.trim();
    if (term) sp.set(key, term);
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

function toParamsRecord(
  input?: string | Record<string, string | undefined>,
): Record<string, string | undefined> {
  if (!input) return {};
  if (typeof input === 'string') return { q: input };
  return input;
}

/** Follows `pagination` and collects every page (admin lists render 10/page server-side). */
async function fetchAllPagesWithMeta<T>(
  path: string,
  key: string,
): Promise<{ items: T[]; firstPage: Record<string, unknown> }> {
  const first = await apiFetch<Record<string, unknown> & { pagination?: { totalPages?: number } }>(
    path,
  );
  const items = [...((first[key] as T[] | undefined) ?? [])];
  const totalPages = first.pagination?.totalPages ?? 1;
  if (totalPages > 1) {
    const rest = await Promise.all(
      Array.from({ length: totalPages - 1 }, (_, i) => {
        const sep = path.includes('?') ? '&' : '?';
        return apiFetch<Record<string, unknown>>(`${path}${sep}page=${i + 2}`);
      }),
    );
    for (const page of rest) items.push(...((page[key] as T[] | undefined) ?? []));
  }
  return { items, firstPage: first };
}

async function fetchAllPages<T>(path: string, key: string): Promise<T[]> {
  const { items } = await fetchAllPagesWithMeta<T>(path, key);
  return items;
}

function num(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

interface RawDishIngredient {
  ingredientId: string;
  quantity: number | string;
  unit?: string | null;
  name?: string | null;
  ingredient?: { name: string } | null;
}

interface RawDish extends Omit<Dish, 'price' | 'ingredients' | 'chef'> {
  price: number | string;
  ingredients?: RawDishIngredient[];
  chef?: DishChef | null;
}

function normalizeDishLine(line: RawDishIngredient): DishIngredientLine {
  return {
    ingredientId: line.ingredientId,
    quantity: num(line.quantity),
    unit: line.unit ?? null,
    name: line.name ?? line.ingredient?.name ?? null,
  };
}

function normalizeDish(raw: RawDish): Dish {
  return {
    ...raw,
    price: num(raw.price),
    chef: raw.chef ?? null,
    ingredients: (raw.ingredients ?? []).map(normalizeDishLine),
  };
}

/** Appends primitives to FormData; arrays/objects are JSON-encoded. */
function toFormData(
  input: Record<string, unknown>,
  file?: File | null,
  fileField = 'image',
): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) continue;
    fd.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
  }
  if (file) fd.append(fileField, file);
  return fd;
}

export const dishesApi = {
  /** Public menu / dishes (visible dishes only). */
  listPublic: async (
    qOrParams?: string | DishQueryParams,
    category?: string,
    sort?: string,
  ) => {
    const params: Record<string, string | undefined> =
      typeof qOrParams === 'object' && qOrParams !== null
        ? { ...qOrParams }
        : { q: qOrParams, category, sort };
    const query = buildQuery(params);
    const data = await apiFetch<RawDish[] | { dishes: RawDish[] }>(`/dishes${query}`);
    const list = Array.isArray(data) ? data : data.dishes;
    return list.map(normalizeDish);
  },
  /** Public filter options (chefs, ingredients, categories, priceRange). */
  filterOptions: async (): Promise<DishFilterOptions> => {
    return apiFetch<DishFilterOptions>('/dishes/filter-options');
  },
  /** Featured dishes for the home page. */
  featured: async () => {
    const data = await apiFetch<{ featured: RawDish[] }>('/');
    return data.featured.map(normalizeDish);
  },
  /** Public detail by id or slug. */
  getPublic: async (idOrSlug: string) => {
    const data = await apiFetch<{ dish: RawDish; chef: DishChef | null } | RawDish>(
      `/dishes/${encodeURIComponent(idOrSlug)}`,
    );
    if ('dish' in data) {
      return normalizeDish({ ...data.dish, chef: data.chef });
    }
    return normalizeDish(data);
  },

  /** Admin list (paginated, 10/page server-side). */
  list: async (qOrParams?: string | DishQueryParams) => {
    const query = buildQuery(toParamsRecord(qOrParams as Record<string, string | undefined>));
    const dishes = await fetchAllPages<RawDish>(`/dishes${query}`, 'dishes');
    return dishes.map(normalizeDish);
  },
  get: async (id: string) => {
    const data = await apiFetch<{ dish: RawDish }>(`/dishes/${id}`);
    return normalizeDish(data.dish);
  },
  create: async (input: DishInput, image?: File | null) => {
    const data = await apiFetch<{ dish: RawDish }>('/dishes', {
      method: 'POST',
      body: toFormData({ ...input }, image),
    });
    return normalizeDish(data.dish);
  },
  update: async (id: string, input: DishInput, image?: File | null, removeImage?: boolean) => {
    const data = await apiFetch<{ dish: RawDish }>(`/dishes/${id}`, {
      method: 'PATCH',
      body: toFormData({ ...input, removeImage }, image),
    });
    return normalizeDish(data.dish);
  },
  remove: async (id: string) => {
    await apiFetch<{ id: string }>(`/dishes/${id}`, { method: 'DELETE' });
  },
};

export const chefsApi = {
  list: async (qOrParams?: string | ChefQueryParams) => {
    const query = buildQuery(toParamsRecord(qOrParams as Record<string, string | undefined>));
    const chefs = await fetchAllPages<Chef>(`/chefs${query}`, 'chefs');
    return chefs;
  },
  listWithMeta: async (params?: ChefQueryParams) => {
    const query = buildQuery(toParamsRecord(params as Record<string, string | undefined>));
    const { items, firstPage } = await fetchAllPagesWithMeta<Chef>(`/chefs${query}`, 'chefs');
    const specialties = Array.isArray(firstPage['specialties'])
      ? (firstPage['specialties'] as string[])
      : [];
    return { chefs: items, specialties };
  },
  get: async (id: string) => {
    const data = await apiFetch<{ chef: Chef }>(`/chefs/${id}`);
    return data.chef;
  },
  create: async (input: ChefInput, avatar?: File | null) => {
    const data = await apiFetch<{ chef: Chef }>('/chefs', {
      method: 'POST',
      body: toFormData({ ...input }, avatar, 'avatar'),
    });
    return data.chef;
  },
  update: async (id: string, input: ChefInput, avatar?: File | null, removeImage?: boolean) => {
    const data = await apiFetch<{ chef: Chef }>(`/chefs/${id}`, {
      method: 'PATCH',
      body: toFormData({ ...input, removeImage }, avatar, 'avatar'),
    });
    return data.chef;
  },
  remove: async (id: string) => {
    await apiFetch<{ id: string }>(`/chefs/${id}`, { method: 'DELETE' });
  },
};

export const ingredientsApi = {
  list: async (qOrParams?: string | IngredientQueryParams) => {
    const query = buildQuery(toParamsRecord(qOrParams as Record<string, string | undefined>));
    const ingredients = await fetchAllPages<Ingredient>(
      `/ingredients${query}`,
      'ingredients',
    );
    return ingredients;
  },
  listWithMeta: async (params?: IngredientQueryParams) => {
    const query = buildQuery(toParamsRecord(params as Record<string, string | undefined>));
    const { items, firstPage } = await fetchAllPagesWithMeta<Ingredient>(
      `/ingredients${query}`,
      'ingredients',
    );
    const units = Array.isArray(firstPage['units']) ? (firstPage['units'] as string[]) : [];
    return { ingredients: items, units };
  },
  get: async (id: string) => {
    const data = await apiFetch<{ ingredient: Ingredient }>(`/ingredients/${id}`);
    return data.ingredient;
  },
  create: async (input: IngredientInput, image?: File | null) => {
    const data = await apiFetch<{ ingredient: Ingredient }>('/ingredients', {
      method: 'POST',
      body: toFormData({ ...input }, image),
    });
    return data.ingredient;
  },
  update: async (
    id: string,
    input: IngredientInput,
    image?: File | null,
    removeImage?: boolean,
  ) => {
    const data = await apiFetch<{ ingredient: Ingredient }>(`/ingredients/${id}`, {
      method: 'PATCH',
      body: toFormData({ ...input, removeImage }, image),
    });
    return data.ingredient;
  },
  remove: async (id: string) => {
    await apiFetch<{ id: string }>(`/ingredients/${id}`, { method: 'DELETE' });
  },
};

export interface LoginResult {
  user: AuthUser | null;
  token?: string | null;
  accessToken?: string | null;
  redirectTo: string;
  message?: string;
}

export interface RegisterResult {
  requiresEmailConfirmation: boolean;
  email: string;
  user?: AuthUser | null;
  token?: string | null;
  accessToken?: string | null;
  redirectTo?: string;
  message?: string;
}

export const authApi = {
  me: () => loadSession(),
  login: async (email: string, password: string) => {
    await loadSession();
    const result = await apiFetch<LoginResult>('/auth/login', { method: 'POST', body: { email, password } });
    const token = result.token ?? result.accessToken;
    if (token) {
      setAuthToken(token);
    }
    return result;
  },
  register: async (input: {
    displayName?: string;
    email: string;
    password: string;
    confirmPassword: string;
  }) => {
    await loadSession();
    const result = await apiFetch<RegisterResult>('/auth/register', { method: 'POST', body: input });
    const token = result.token ?? result.accessToken;
    if (token) {
      setAuthToken(token);
    }
    return result;
  },
  logout: async () => {
    try {
      await loadSession();
      await apiFetch<{ message: string }>('/auth/logout', { method: 'POST' });
    } finally {
      setAuthToken(null);
    }
    return loadSession();
  },
  callback: async (search: string) => {
    const result = await apiFetch<LoginResult>(`/auth/callback${search}`, {}, false);
    const token = result.token ?? result.accessToken;
    if (token) {
      setAuthToken(token);
    }
    return result;
  },
};

export const statsApi = {
  get: () => apiFetch<{ stats: Record<string, number>; recentDishes: unknown[] }>('/stats'),
};

export const usersApi = {
  list: (qOrParams?: string | UserQueryParams) => {
    const query = buildQuery(toParamsRecord(qOrParams as Record<string, string | undefined>));
    return fetchAllPages<UserItem>(`/users${query}`, 'users');
  },
  updateRole: (id: string, role: UserRole) =>
    apiFetch<{ user: UserItem; message: string }>(`/users/${id}/role`, {
      method: 'PATCH',
      body: { role },
    }),
};
