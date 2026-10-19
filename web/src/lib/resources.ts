import { apiFetch, loadSession } from './api';
import type {
  AuthUser,
  Chef,
  ChefInput,
  Dish,
  DishChef,
  DishIngredientLine,
  DishInput,
  Ingredient,
  IngredientInput,
} from './types';

function qs(q?: string): string {
  const term = q?.trim();
  return term ? `?q=${encodeURIComponent(term)}` : '';
}

function buildQuery(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const term = value?.trim();
    if (term) sp.set(key, term);
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

/** Follows `pagination` and collects every page (admin lists render 10/page server-side). */
async function fetchAllPages<T>(
  path: string,
  key: string,
): Promise<T[]> {
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
  listPublic: async (q?: string, category?: string, sort?: string) => {
    const query = buildQuery({ q, category, sort });
    const data = await apiFetch<RawDish[] | { dishes: RawDish[] }>(`/dishes${query}`);
    const list = Array.isArray(data) ? data : data.dishes;
    return list.map(normalizeDish);
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
  list: async (q?: string) => {
    const dishes = await fetchAllPages<RawDish>(`/admin/dishes${qs(q)}`, 'dishes');
    return dishes.map(normalizeDish);
  },
  get: async (id: string) => {
    const data = await apiFetch<{ dish: RawDish }>(`/admin/dishes/${id}`);
    return normalizeDish(data.dish);
  },
  create: async (input: DishInput, image?: File | null) => {
    const data = await apiFetch<{ dish: RawDish }>('/admin/dishes', {
      method: 'POST',
      body: toFormData({ ...input }, image),
    });
    return normalizeDish(data.dish);
  },
  update: async (id: string, input: DishInput, image?: File | null, removeImage?: boolean) => {
    const data = await apiFetch<{ dish: RawDish }>(`/admin/dishes/${id}`, {
      method: 'PATCH',
      body: toFormData({ ...input, removeImage }, image),
    });
    return normalizeDish(data.dish);
  },
  remove: async (id: string) => {
    await apiFetch<{ id: string }>(`/admin/dishes/${id}`, { method: 'DELETE' });
  },
};

export const chefsApi = {
  list: async (q?: string) => {
    const chefs = await fetchAllPages<Chef>(`/admin/chefs${qs(q)}`, 'chefs');
    return chefs;
  },
  get: async (id: string) => {
    const data = await apiFetch<{ chef: Chef }>(`/admin/chefs/${id}`);
    return data.chef;
  },
  create: async (input: ChefInput, avatar?: File | null) => {
    const data = await apiFetch<{ chef: Chef }>('/admin/chefs', {
      method: 'POST',
      body: toFormData({ ...input }, avatar, 'avatar'),
    });
    return data.chef;
  },
  update: async (id: string, input: ChefInput, avatar?: File | null, removeImage?: boolean) => {
    const data = await apiFetch<{ chef: Chef }>(`/admin/chefs/${id}`, {
      method: 'PATCH',
      body: toFormData({ ...input, removeImage }, avatar, 'avatar'),
    });
    return data.chef;
  },
  remove: async (id: string) => {
    await apiFetch<{ id: string }>(`/admin/chefs/${id}`, { method: 'DELETE' });
  },
};

export const ingredientsApi = {
  list: async (q?: string) => {
    const ingredients = await fetchAllPages<Ingredient>(
      `/admin/ingredients${qs(q)}`,
      'ingredients',
    );
    return ingredients;
  },
  get: async (id: string) => {
    const data = await apiFetch<{ ingredient: Ingredient }>(`/admin/ingredients/${id}`);
    return data.ingredient;
  },
  create: async (input: IngredientInput, image?: File | null) => {
    const data = await apiFetch<{ ingredient: Ingredient }>('/admin/ingredients', {
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
    const data = await apiFetch<{ ingredient: Ingredient }>(`/admin/ingredients/${id}`, {
      method: 'PATCH',
      body: toFormData({ ...input, removeImage }, image),
    });
    return data.ingredient;
  },
  remove: async (id: string) => {
    await apiFetch<{ id: string }>(`/admin/ingredients/${id}`, { method: 'DELETE' });
  },
};

export interface LoginResult {
  user: AuthUser | null;
  redirectTo: string;
  message?: string;
}

export interface RegisterResult {
  requiresEmailConfirmation: boolean;
  email: string;
  user?: AuthUser | null;
  redirectTo?: string;
  message?: string;
}

export const authApi = {
  me: () => loadSession(),
  login: async (email: string, password: string) => {
    await loadSession();
    return apiFetch<LoginResult>('/auth/login', { method: 'POST', body: { email, password } });
  },
  register: async (input: {
    displayName?: string;
    email: string;
    password: string;
    confirmPassword: string;
  }) => {
    await loadSession();
    return apiFetch<RegisterResult>('/auth/register', { method: 'POST', body: input });
  },
  logout: async () => {
    await loadSession();
    await apiFetch<{ message: string }>('/auth/logout', { method: 'POST' });
    return loadSession();
  },
  callback: (search: string) =>
    apiFetch<LoginResult>(`/auth/callback${search}`, {}, false),
};
