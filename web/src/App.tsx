import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { AdminLayout } from './components/AdminLayout';
import { NotFoundState } from './components/StateViews';
import { RequireAuth } from './auth/RequireAuth';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import AuthCallback from './pages/AuthCallback';
import DishList from './pages/dishes/DishList';
import DishDetail from './pages/dishes/DishDetail';
import DishAdminList from './pages/admin/dishes/DishAdminList';
import DishForm from './pages/admin/dishes/DishForm';
import DishDelete from './pages/admin/dishes/DishDelete';
import ChefAdminList from './pages/admin/chefs/ChefAdminList';
import ChefForm from './pages/admin/chefs/ChefForm';
import ChefDelete from './pages/admin/chefs/ChefDelete';
import IngredientAdminList from './pages/admin/ingredients/IngredientAdminList';
import IngredientForm from './pages/admin/ingredients/IngredientForm';
import IngredientDelete from './pages/admin/ingredients/IngredientDelete';

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/dishes" element={<DishList />} />
        <Route path="/dishes/:slug" element={<DishDetail />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="*" element={<NotFoundState message="Trang không tồn tại." />} />
      </Route>

      <Route
        path="/admin"
        element={
          <RequireAuth>
            <AdminLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/admin/dishes" replace />} />
        <Route path="dishes" element={<DishAdminList />} />
        <Route path="dishes/new" element={<DishForm mode="new" />} />
        <Route path="dishes/:id/edit" element={<DishForm mode="edit" />} />
        <Route path="dishes/:id/delete" element={<DishDelete />} />
        <Route path="chefs" element={<ChefAdminList />} />
        <Route path="chefs/new" element={<ChefForm mode="new" />} />
        <Route path="chefs/:id/edit" element={<ChefForm mode="edit" />} />
        <Route path="chefs/:id/delete" element={<ChefDelete />} />
        <Route path="ingredients" element={<IngredientAdminList />} />
        <Route path="ingredients/new" element={<IngredientForm mode="new" />} />
        <Route path="ingredients/:id/edit" element={<IngredientForm mode="edit" />} />
        <Route path="ingredients/:id/delete" element={<IngredientDelete />} />
      </Route>
    </Routes>
  );
}
