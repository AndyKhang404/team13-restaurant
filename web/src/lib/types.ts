export type UserRole = 'ADMIN' | 'STAFF' | 'CUSTOMER';

export type PagingMode = 'infinite' | 'loadMore' | 'pages';

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
  prevPage: number;
  nextPage: number;
}

export interface Paged<T> {
  items: T[];
  pagination: Pagination;
}

export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export interface UserItem {
  id: string;
  email: string;
  displayName: string | null;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export interface DishChef {
  id: string;
  name: string;
  specialty: string | null;
  avatarUrl: string | null;
}

export interface DishIngredientLine {
  ingredientId: string;
  quantity: number;
  unit: string | null;
  name: string | null;
}

export interface Dish {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  price: number;
  category: string;
  isAvailable: boolean;
  isFeatured: boolean;
  prepTimeMinutes: number | null;
  chefId: string | null;
  createdAt: string;
  updatedAt: string;
  chef: DishChef | null;
  ingredients: DishIngredientLine[];
}

export interface Chef {
  id: string;
  name: string;
  avatarUrl: string | null;
  specialty: string | null;
  bio: string | null;
  experienceYears: number;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Ingredient {
  id: string;
  name: string;
  unit: string;
  stockQuantity: number;
  pricePerUnit: number;
  imageUrl: string | null;
  isAvailable: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DishIngredientInput {
  ingredientId: string;
  quantity: number;
  unit: string;
}

export interface DishInput {
  name: string;
  slug?: string;
  description?: string;
  price: number;
  category: string;
  isAvailable: boolean;
  isFeatured: boolean;
  prepTimeMinutes?: number;
  chefId?: string;
  imageUrl?: string;
  ingredients: DishIngredientInput[];
}

export interface ChefInput {
  name: string;
  specialty?: string;
  bio?: string;
  experienceYears: number;
  phone?: string;
  isActive: boolean;
  avatarUrl?: string;
}

export interface IngredientInput {
  name: string;
  unit: string;
  stockQuantity: number;
  pricePerUnit: number;
  isAvailable: boolean;
  imageUrl?: string;
}

export const CATEGORIES = ['appetizer', 'main', 'dessert', 'drink', 'combo'] as const;

export const CATEGORY_LABELS: Record<string, string> = {
  appetizer: 'Khai vị',
  main: 'Món chính',
  dessert: 'Tráng miệng',
  drink: 'Đồ uống',
  combo: 'Combo',
};

export function categoryLabel(key: string): string {
  return CATEGORY_LABELS[key] ?? key;
}
