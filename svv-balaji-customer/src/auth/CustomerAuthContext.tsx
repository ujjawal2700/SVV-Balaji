import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { refreshOnce } from '../api/client';
import { storefrontAuthApi } from '../api/storefrontAuth';
import { tokenStore } from '../api/tokenStore';
import type {
  RegisterRetailerPayload,
  RegisterRetailerResponse,
  RequestOtpResponse,
  StorefrontAccountSummary,
} from '../api/types';
import { isStorefrontSession } from '../api/types';

export type UserRole = 'GUEST' | 'CUSTOMER' | 'RETAILER';

export interface CustomerUserProfile {
  name: string;
  phone: string;
  email?: string;
  memberSince: string;
  savedAddressesCount: number;
  totalOrders: number;
  walletBalance: number;
  couponsCount: number;
  /** This account's own shareable refer-a-friend code. Undefined until the account has a Customer row. */
  referralCode?: string;
}

export interface RetailerUserProfile {
  storeName: string;
  ownerName: string;
  phone: string;
  email: string;
  gstin: string;
  panNumber?: string;
  category: string;
  address: string;
  pincode: string;
  memberSince: string;
  kycStatus: 'VERIFIED' | 'PENDING' | 'REJECTED';
  totalOrders: number;
  totalSavings: number;
  walletBalance: number;
  creditLimit: number;
  creditUsed: number;
  /** This account's own shareable refer-a-friend code. Undefined until the account has a Customer row. */
  referralCode?: string;
}

/** Outcome of a real OTP verification — the caller (LoginPage) branches on this. */
export type VerifyOtpOutcome =
  | { status: 'signedIn'; channel: 'B2C' | 'B2B' }
  | { status: 'pending'; message: string };

export interface CustomerAuthContextType {
  role: UserRole;
  isLoggedIn: boolean;
  /** True until the boot-time session restore has settled, either way. */
  initialising: boolean;
  customerProfile: CustomerUserProfile | null;
  retailerProfile: RetailerUserProfile | null;
  requestOtp: (phone: string) => Promise<RequestOtpResponse>;
  verifyOtp: (phone: string, code: string, fullName?: string, referralCode?: string) => Promise<VerifyOtpOutcome>;
  registerRetailer: (payload: RegisterRetailerPayload) => Promise<RegisterRetailerResponse>;
  logout: () => void;
  /** Front-end-only preview toggle for the demo "view as Customer/Retailer" affordances — not a real account switch. */
  switchRole: (newRole: UserRole) => void;
}

const defaultCustomer: CustomerUserProfile = {
  name: 'Rahul Sharma',
  phone: '+91 98765 43210',
  email: 'rahul.sharma@example.com',
  memberSince: 'Aug 2024',
  savedAddressesCount: 2,
  totalOrders: 4,
  walletBalance: 250,
  couponsCount: 3,
};

const defaultRetailer: RetailerUserProfile = {
  storeName: 'Sri Balaji Provision Store',
  ownerName: 'Ramesh Kumar',
  phone: '+91 98765 43210',
  email: 'ramesh.balaji@example.com',
  gstin: '36AABCU9603R1ZM',
  panNumber: 'AABCU9603R',
  category: 'Kirana & General Store',
  address: 'Shop #14, Main Market, Hanamkonda, Warangal, TS - 506001',
  pincode: '506001',
  memberSince: 'Aug 2024',
  kycStatus: 'VERIFIED',
  totalOrders: 12,
  totalSavings: 4320,
  walletBalance: 895,
  creditLimit: 50000,
  creditUsed: 14500,
};

function formatPhone(phone: string): string {
  return phone.startsWith('+91') ? phone : `+91 ${phone}`;
}

/**
 * Maps a real `CustomerAccount` (from the API) onto the profile shapes the
 * rest of the app already reads. Numeric commerce fields (wallet, orders,
 * credit) are zeroed rather than borrowing the demo defaults — those
 * subsystems have no backend yet, and showing a fabricated ₹50,000 credit
 * limit against a real account would be actively misleading. Screens that
 * read these fields fall back to demo numbers via `??`/`||`, which is a
 * pre-existing gap in those screens, not fixed here.
 */
function toCustomerProfile(account: StorefrontAccountSummary): CustomerUserProfile {
  return {
    name: account.fullName,
    phone: formatPhone(account.phone),
    email: account.email ?? undefined,
    memberSince: 'Just joined',
    savedAddressesCount: 0,
    totalOrders: 0,
    walletBalance: 0,
    couponsCount: 0,
    referralCode: account.referralCode ?? undefined,
  };
}

function toRetailerProfile(account: StorefrontAccountSummary): RetailerUserProfile {
  return {
    storeName: account.businessName || 'My Store',
    ownerName: account.fullName,
    phone: formatPhone(account.phone),
    email: account.email ?? '',
    gstin: account.gstin ?? '',
    category: 'Kirana & General Store',
    address: '',
    pincode: '',
    memberSince: 'Just joined',
    kycStatus: account.status === 'ACTIVE' ? 'VERIFIED' : account.status === 'REJECTED' ? 'REJECTED' : 'PENDING',
    totalOrders: 0,
    totalSavings: 0,
    walletBalance: 0,
    creditLimit: 0,
    creditUsed: 0,
    referralCode: account.referralCode ?? undefined,
  };
}

const CustomerAuthContext = createContext<CustomerAuthContextType | undefined>(undefined);

export function CustomerAuthProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<UserRole>('GUEST');
  const [initialising, setInitialising] = useState(true);
  const [customerProfile, setCustomerProfile] = useState<CustomerUserProfile | null>(null);
  const [retailerProfile, setRetailerProfile] = useState<RetailerUserProfile | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const applyAccount = useCallback((account: StorefrontAccountSummary) => {
    if (account.channel === 'B2B') {
      setRole('RETAILER');
      setRetailerProfile(toRetailerProfile(account));
    } else {
      setRole('CUSTOMER');
      setCustomerProfile(toCustomerProfile(account));
    }
  }, []);

  const clearSession = useCallback(() => {
    setRole('GUEST');
    setCustomerProfile(null);
    setRetailerProfile(null);
  }, []);

  // Boot-time session restore — mirrors @shared/auth/AuthProvider's pattern,
  // against the storefront's own refresh token instead of the staff one.
  useEffect(() => {
    let cancelled = false;

    async function restore() {
      if (!tokenStore.getRefreshToken()) {
        if (!cancelled) setInitialising(false);
        return;
      }
      try {
        await refreshOnce();
        const account = await storefrontAuthApi.me();
        if (!cancelled) applyAccount(account);
      } catch {
        tokenStore.clear();
        if (!cancelled) clearSession();
      } finally {
        if (!cancelled) setInitialising(false);
      }
    }

    void restore();
    return () => {
      cancelled = true;
    };
  }, [applyAccount, clearSession]);

  useEffect(() => {
    tokenStore.onSessionLost(() => {
      if (mounted.current) clearSession();
    });
  }, [clearSession]);

  const requestOtp = useCallback((phone: string) => storefrontAuthApi.requestOtp(phone), []);

  const verifyOtp = useCallback(
    async (phone: string, code: string, fullName?: string, referralCode?: string): Promise<VerifyOtpOutcome> => {
      const response = await storefrontAuthApi.verifyOtp(phone, code, fullName, referralCode);

      if (!isStorefrontSession(response)) {
        return { status: 'pending', message: response.message };
      }

      tokenStore.set({ accessToken: response.accessToken, refreshToken: response.refreshToken });
      applyAccount(response.account);
      return { status: 'signedIn', channel: response.account.channel };
    },
    [applyAccount],
  );

  const registerRetailer = useCallback(
    (payload: RegisterRetailerPayload) => storefrontAuthApi.registerRetailer(payload),
    [],
  );

  const logout = useCallback(() => {
    void storefrontAuthApi.logout().catch(() => {
      // A failed logout call must not strand the user in a signed-in shell.
    });
    tokenStore.clear();
    clearSession();
  }, [clearSession]);

  /**
   * Front-end-only preview toggle used by a few demo screens (ProfilePage,
   * ProductDetailPage) to show what the storefront looks like for the other
   * role. It does not touch the server or the real session — a genuinely
   * signed-in account's role is decided by the backend, not this switch.
   */
  const switchRole = useCallback(
    (newRole: UserRole) => {
      if (newRole === 'RETAILER' && !retailerProfile) {
        setRetailerProfile(defaultRetailer);
      }
      if (newRole === 'CUSTOMER' && !customerProfile) {
        setCustomerProfile(defaultCustomer);
      }
      setRole(newRole);
    },
    [customerProfile, retailerProfile],
  );

  const value = useMemo<CustomerAuthContextType>(
    () => ({
      role,
      isLoggedIn: role !== 'GUEST',
      initialising,
      customerProfile,
      retailerProfile,
      requestOtp,
      verifyOtp,
      registerRetailer,
      logout,
      switchRole,
    }),
    [role, initialising, customerProfile, retailerProfile, requestOtp, verifyOtp, registerRetailer, logout, switchRole],
  );

  return <CustomerAuthContext.Provider value={value}>{children}</CustomerAuthContext.Provider>;
}

export function useCustomerAuth(): CustomerAuthContextType {
  const context = useContext(CustomerAuthContext);
  if (!context) {
    throw new Error('useCustomerAuth must be used within a CustomerAuthProvider');
  }
  return context;
}
