import { lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import { RequireAccount } from './auth/RequireAccount';
import { StoreShell } from './layout/StoreShell';

/**
 * The storefront's routes — WS3.5, FRD sections 29 and 30.
 *
 * Read this alongside `vite.config.ts`: this build is served from the domain
 * root, so every path below is a bare path and there is no `basename` in
 * main.tsx. The other two apps are the opposite — /admin and /field, each with a
 * matching basename. Changing one without the other produces a white screen with
 * "Unexpected token '<'" in the console, because the browser gets somebody
 * else's index.html where it expected a script.
 *
 * ---------------------------------------------------------------------------
 * Public and private
 *
 * Almost everything here is public, which is the reverse of both staff apps.
 * Browsing, product detail, the cart and — above all — pack tracing must work
 * with no account: the QR code on a bag is scanned by strangers in shops.
 *
 * Only three screens need to know who you are, and they are wrapped in
 * RequireAccount rather than the whole tree being wrapped and holes punched in
 * it. Gating by default is right in a staff app, where a missed route leaks; it
 * is wrong here, where a missed route locks a customer out of a shop.
 * ---------------------------------------------------------------------------
 */

const HomePage = lazy(() => import('./pages/HomePage').then((m) => ({ default: m.HomePage })));
const ProductsPage = lazy(() =>
  import('./pages/ProductsPage').then((m) => ({ default: m.ProductsPage })),
);
const CategoriesPage = lazy(() =>
  import('./pages/CategoriesPage').then((m) => ({ default: m.CategoriesPage })),
);
const ProductDetailPage = lazy(() =>
  import('./pages/ProductDetailPage').then((m) => ({ default: m.ProductDetailPage })),
);
const CartPage = lazy(() => import('./pages/CartPage').then((m) => ({ default: m.CartPage })));
const CheckoutPage = lazy(() =>
  import('./pages/CheckoutPage').then((m) => ({ default: m.CheckoutPage })),
);
const OrdersPage = lazy(() => import('./pages/OrdersPage').then((m) => ({ default: m.OrdersPage })));
const OrderTrackingPage = lazy(() =>
  import('./pages/OrderTrackingPage').then((m) => ({ default: m.OrderTrackingPage })),
);
const AddressesPage = lazy(() => import('./pages/AddressesPage').then((m) => ({ default: m.AddressesPage })));
const WishlistPage = lazy(() => import('./pages/WishlistPage').then((m) => ({ default: m.WishlistPage })));
const WalletPage = lazy(() => import('./pages/WalletPage').then((m) => ({ default: m.WalletPage })));
const TracePage = lazy(() => import('./pages/TracePage').then((m) => ({ default: m.TracePage })));
const ProfilePage = lazy(() =>
  import('./pages/ProfilePage').then((m) => ({ default: m.ProfilePage })),
);
const LoginPage = lazy(() => import('./pages/LoginPage').then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() =>
  import('./pages/RegisterPage').then((m) => ({ default: m.RegisterPage })),
);
const NotFoundPage = lazy(() =>
  import('./pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })),
);

export function App() {
  return (
    <Routes>
      <Route element={<StoreShell />}>
        {/* --- Public ------------------------------------------------------ */}
        <Route index element={<HomePage />} />
        <Route path="categories" element={<CategoriesPage />} />
        <Route path="products/:categoryId" element={<ProductsPage />} />
        <Route path="product-detail/:productId" element={<ProductDetailPage />} />
        <Route path="cart" element={<CartPage />} />

        {/*
          The QR destination. Both forms exist on purpose: `/trace` is for
          somebody who typed the domain and needs to enter the number by hand,
          `/trace/:fgBatchNumber` is what the code on the pack encodes.

          This path is fixed by printed packaging. It cannot move.
        */}
        <Route path="trace" element={<TracePage />} />
        <Route path="trace/:fgBatchNumber" element={<TracePage />} />

        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />

        {/*
          Mock-data only for now — matches Home/BottomNav, which read the same
          static retailer profile rather than `useAuth()`. See ProfilePage.
        */}
        <Route path="profile" element={<ProfilePage />} />

        {/* --- Needs an account -------------------------------------------- */}
        <Route
          path="checkout"
          element={
            <RequireAccount>
              <CheckoutPage />
            </RequireAccount>
          }
        />
        <Route path="orders" element={<OrdersPage />} />
        <Route path="orders/:orderId" element={<OrderTrackingPage />} />
        <Route path="addresses" element={<AddressesPage />} />
        <Route path="wishlist" element={<WishlistPage />} />
        <Route path="wallet" element={<WalletPage />} />

        {/*
          A real 404, not a redirect home. This app is public and reached from
          printed packaging, so a wrong URL is usually a mistyped batch number —
          worth saying so rather than silently landing somebody on the shop.

          Note that /admin and /field never reach this: they are separate builds
          served by nginx (and by the dev proxy), so the browser never hands
          those paths to this router.
        */}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
