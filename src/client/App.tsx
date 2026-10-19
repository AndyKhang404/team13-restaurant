import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { PublicLayout } from './components/layouts/PublicLayout.js';
import { AdminLayout } from './components/layouts/AdminLayout.js';
import { RequireAuth } from './components/shared/RequireAuth.js';

// Public pages
import { HomePage } from './pages/public/HomePage.js';
import { MenuPage } from './pages/public/MenuPage.js';
import { DishDetailPage } from './pages/public/DishDetailPage.js';

// Auth pages
import { LoginPage } from './pages/auth/LoginPage.js';
import { RegisterPage } from './pages/auth/RegisterPage.js';
import { AuthCallbackPage } from './pages/auth/AuthCallbackPage.js';

// Admin pages
import { DashboardPage } from './pages/admin/DashboardPage.js';
import { DishesListPage } from './pages/admin/dishes/DishesListPage.js';
import { DishFormPage } from './pages/admin/dishes/DishFormPage.js';
import { ChefsListPage } from './pages/admin/chefs/ChefsListPage.js';
import { ChefFormPage } from './pages/admin/chefs/ChefFormPage.js';
import { IngredientsListPage } from './pages/admin/ingredients/IngredientsListPage.js';
import { IngredientFormPage } from './pages/admin/ingredients/IngredientFormPage.js';
import { UsersListPage } from './pages/admin/users/UsersListPage.js';

// Error pages
import { NotFoundPage } from './pages/errors/NotFoundPage.js';

export const App: React.FC = () => {
  return (
    <Routes>
      {/* Public Routes */}
      <Route element={<PublicLayout />}>
        <Route index element={<HomePage />} />
        <Route path="menu" element={<MenuPage />} />
        <Route path="dishes/:slug" element={<DishDetailPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="auth/callback" element={<AuthCallbackPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      {/* Admin Routes */}
      <Route
        path="admin"
        element={
          <RequireAuth permission="admin:access">
            <AdminLayout />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="dishes" element={<DishesListPage />} />
        <Route path="dishes/new" element={<DishFormPage />} />
        <Route path="dishes/:id/edit" element={<DishFormPage />} />
        <Route path="chefs" element={<ChefsListPage />} />
        <Route path="chefs/new" element={<ChefFormPage />} />
        <Route path="chefs/:id/edit" element={<ChefFormPage />} />
        <Route path="ingredients" element={<IngredientsListPage />} />
        <Route path="ingredients/new" element={<IngredientFormPage />} />
        <Route path="ingredients/:id/edit" element={<IngredientFormPage />} />
        <Route
          path="users"
          element={
            <RequireAuth permission="user:manage">
              <UsersListPage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
};
