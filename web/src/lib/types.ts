export type UserRole = 'ADMIN' | 'STAFF' | 'CUSTOMER';

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

export interface DishFilterOptions {
  chefs: Array<{ id: string; name: string; specialty: string | null }>;
  ingredients: Array<{ id: string; name: string; unit: string }>;
  categories: Array<{ key: string; label: string }>;
  priceRange: { min: number; max: number };
}

export interface DishQueryParams {
  q?: string;
  category?: string;
  minPrice?: string;
  maxPrice?: string;
  chefId?: string;
  withIngredients?: string;
  withoutIngredients?: string;
  available?: string;
  featured?: string;
  maxPrepTime?: string;
  unassignedChef?: string;
  deleted?: string;
  sort?: string;
}

export interface ChefQueryParams {
  q?: string;
  isActive?: string;
  specialty?: string;
  minExperience?: string;
  hasActiveDishes?: string;
  sort?: string;
}

export interface IngredientQueryParams {
  q?: string;
  stock?: string;
  isAvailable?: string;
  unit?: string;
  usage?: string;
  sort?: string;
}

export interface UserQueryParams {
  q?: string;
  role?: string;
  createdFrom?: string;
  createdTo?: string;
}

