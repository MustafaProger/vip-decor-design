import { createContext, useContext, useState, type ReactNode } from "react";
import type { SiteContent } from "./content";
import { parseSourcePrice } from "./commerce";
export type CartItem = {
  productId: string;
  quantity: number;
  variantKey: string;
  variantLabel: string;
  unitPrice: number | null;
};
type Store = {
  data: SiteContent;
  favorites: string[];
  toggleFavorite: (id: string) => void;
  cart: CartItem[];
  addToCart: (item: Omit<CartItem, "quantity">, qty?: number) => void;
  setQuantity: (key: string, quantity: number) => void;
  removeFromCart: (key: string) => void;
  discuss: (context?: string) => void;
};
const StoreContext = createContext<Store | null>(null);
export const cartKey = (item: Pick<CartItem, "productId" | "variantKey">) =>
  item.productId + "::" + item.variantKey;
function read<T>(key: string, fallback: T): T {
  try {
    const val = JSON.parse(localStorage.getItem(key) || "null");
    return Array.isArray(val) ? (val as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* in private mode the current session remains usable */
  }
}
export function StoreProvider({
  data,
  discuss,
  children,
}: {
  data: SiteContent;
  discuss: (context?: string) => void;
  children: ReactNode;
}) {
  const [favorites, setFavorites] = useState<string[]>(() =>
    read<string[]>("vip:favorites", []).filter((id) => typeof id === "string"),
  );
  const [cart, setCart] = useState<CartItem[]>(() =>
    read<CartItem[]>("vip:cart", []).filter(
      (i) =>
        i &&
        typeof i.productId === "string" &&
        Number.isInteger(i.quantity) &&
        i.quantity > 0,
    ),
  );
  const stockLimit = (item: Pick<CartItem, "productId" | "variantKey">) => {
    try {
      const editionId = JSON.parse(item.variantKey).edition;
      const product = data.products.find((p) => p.id === item.productId);
      const edition = product?.variants?.editions?.find(
        (e) => String(e.uid) === String(editionId),
      );
      const stock = parseSourcePrice(edition?.quantity);
      return stock === null ? 99 : Math.max(1, Math.min(99, Math.floor(stock)));
    } catch {
      return 99;
    }
  };
  const toggleFavorite = (id: string) =>
    setFavorites((old) => {
      const next = old.includes(id)
        ? old.filter((x) => x !== id)
        : [...old, id];
      save("vip:favorites", next);
      return next;
    });
  const updateCart = (fn: (old: CartItem[]) => CartItem[]) =>
    setCart((old) => {
      const next = fn(old);
      save("vip:cart", next);
      return next;
    });
  return (
    <StoreContext.Provider
      value={{
        data,
        favorites,
        toggleFavorite,
        cart,
        discuss,
        addToCart: (item, qty = 1) =>
          updateCart((old) => {
            const exists = old.find((x) => cartKey(x) === cartKey(item));
            return exists
              ? old.map((x) =>
                  cartKey(x) === cartKey(item)
                    ? {
                        ...x,
                        quantity: Math.min(stockLimit(x), x.quantity + qty),
                      }
                    : x,
                )
              : [
                  ...old,
                  {
                    ...item,
                    quantity: Math.min(stockLimit(item), Math.max(1, qty)),
                  },
                ];
          }),
        setQuantity: (key, quantity) =>
          updateCart((old) =>
            old.map((x) =>
              cartKey(x) === key
                ? {
                    ...x,
                    quantity: Math.min(
                      stockLimit(x),
                      Math.max(1, Math.floor(quantity) || 1),
                    ),
                  }
                : x,
            ),
          ),
        removeFromCart: (key) =>
          updateCart((old) => old.filter((x) => cartKey(x) !== key)),
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}
export function useStore() {
  const store = useContext(StoreContext);
  if (!store) throw new Error("StoreProvider is required");
  return store;
}
