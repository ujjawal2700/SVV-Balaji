import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { refreshOnce } from '../api/client';
import { storefrontAuthApi, type AuthAudience, type RegistrationStatus } from '../api/storefrontAuth';
import { tokenStore } from '../api/tokenStore';
import type {
  RegisterRetailerPayload,
  RegisterRetailerResponse,
  RequestOtpResponse,
  StorefrontAccountSummary,
  UpdateStorefrontProfilePayload,
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
  profilePhoto?: string;
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
  /** Set when Super Admin rejected the registration. */
  rejectionReason?: string | null;
  totalOrders: number;
  totalSavings: number;
  walletBalance: number;
  creditLimit: number;
  creditUsed: number;
  /** Always PREPAID since 10 Oct 2026 (no credit for retailers). */
  paymentTerms: string;
  profilePhoto?: string;
  /** This account's own shareable refer-a-friend code. Undefined until the account has a Customer row. */
  referralCode?: string;
}

/** Outcome of a real OTP verification — the caller (LoginPage) branches on this. */
export type VerifyOtpOutcome =
  | { status: 'signedIn'; channel: 'B2C' | 'B2B'; isNewAccount: boolean }
  | { status: 'pending'; message: string };

export interface CustomerAuthContextType {
  role: UserRole;
  isLoggedIn: boolean;
  /** True until the boot-time session restore has settled, either way. */
  initialising: boolean;
  customerProfile: CustomerUserProfile | null;
  retailerProfile: RetailerUserProfile | null;
  requestOtp: (phone: string, audience?: AuthAudience) => Promise<RequestOtpResponse>;
  verifyOtp: (phone: string, code: string, audience: AuthAudience, fullName?: string, referralCode?: string) => Promise<VerifyOtpOutcome>;
  registerRetailer: (payload: RegisterRetailerPayload) => Promise<RegisterRetailerResponse>;
  refreshProfile: () => Promise<void>;
  uploadProfilePhoto: (file: File) => Promise<string>;
  removeProfilePhoto: () => Promise<void>;
  updateProfileData: (data: UpdateStorefrontProfilePayload) => Promise<void>;
  /**
   * A pending retailer's registration status, applied to the profile: approval
   * loads the full account, rejection records the reason. Null when it could
   * not be read (offline, or the session has ended).
   */
  checkRegistration: () => Promise<RegistrationStatus | null>;
  logout: () => void;
}

function formatMemberSince(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

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
    memberSince: formatMemberSince(account.memberSince),
    savedAddressesCount: 0,
    totalOrders: 0,
    walletBalance: 0,
    couponsCount: 0,
    profilePhoto: account.profilePhoto ?? undefined,
    referralCode: account.referralCode ?? undefined,
  };
}

function toRetailerProfile(account: StorefrontAccountSummary): RetailerUserProfile {
  return {
    storeName: account.businessName || '',
    ownerName: account.fullName,
    phone: formatPhone(account.phone),
    email: account.email ?? '',
    gstin: account.gstin ?? '',
    category: '',
    address: [account.addressLine, account.city, account.state].filter(Boolean).join(', '),
    pincode: account.pincode ?? '',
    memberSince: formatMemberSince(account.memberSince),
    kycStatus: account.status === 'ACTIVE' ? 'VERIFIED' : account.status === 'REJECTED' ? 'REJECTED' : 'PENDING',
    totalOrders: 0,
    totalSavings: 0,
    walletBalance: 0,
    creditLimit: account.creditLimit ?? 0,
    creditUsed: account.creditUsed ?? 0,
    paymentTerms: account.paymentTerms ?? 'PREPAID',
    profilePhoto: account.profilePhoto ?? undefined,
    referralCode: account.referralCode ?? undefined,
  };
}

/** How often a pending retailer's registration is re-checked. */
const REGISTRATION_POLL_MS = 30_000;

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

  const refreshProfile = useCallback(async () => {
    if (!tokenStore.getAccessToken()) return;
    try {
      const account = await storefrontAuthApi.me();
      applyAccount(account);
    } catch {
      // ignore
    }
  }, [applyAccount]);

  const checkRegistration = useCallback(async (): Promise<RegistrationStatus | null> => {
    if (!tokenStore.getAccessToken()) return null;
    try {
      const result = await storefrontAuthApi.registrationStatus();
      if (result.status === 'ACTIVE') {
        // Approved: the regular session now works, so load the full account.
        await refreshProfile();
      } else if (result.status === 'REJECTED' || result.status === 'SUSPENDED') {
        setRetailerProfile((p) => (p ? { ...p, kycStatus: 'REJECTED', rejectionReason: result.rejectionReason } : p));
      }
      return result;
    } catch {
      return null;
    }
  }, [refreshProfile]);

  // While a retailer waits for review: check now, then every 30 s. (Was /me every 4 s, which the server
  // refuses for a pending account - each tick was a failed call, a token refresh and a second failed call.)
  useEffect(() => {
    if (role !== 'RETAILER' || retailerProfile?.kycStatus !== 'PENDING') return;
    void checkRegistration();
    const timer = setInterval(() => void checkRegistration(), REGISTRATION_POLL_MS);
    return () => clearInterval(timer);
  }, [role, retailerProfile?.kycStatus, checkRegistration]);

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

  const requestOtp = useCallback(
    (phone: string, audience?: AuthAudience) => storefrontAuthApi.requestOtp(phone, audience),
    [],
  );

  const verifyOtp = useCallback(
    async (phone: string, code: string, audience: AuthAudience, fullName?: string, referralCode?: string): Promise<VerifyOtpOutcome> => {
      const response = await storefrontAuthApi.verifyOtp(phone, code, audience, fullName, referralCode);

      if (!isStorefrontSession(response)) {
        return { status: 'pending', message: response.message };
      }

      tokenStore.set({ accessToken: response.accessToken, refreshToken: response.refreshToken });
      applyAccount(response.account);
      return { status: 'signedIn', channel: response.account.channel, isNewAccount: Boolean(response.isNewAccount) };
    },
    [applyAccount],
  );

  const registerRetailer = useCallback(
    async (payload: RegisterRetailerPayload) => {
      const response = await storefrontAuthApi.registerRetailer(payload);
      if (isStorefrontSession(response)) {
        tokenStore.set({ accessToken: response.accessToken, refreshToken: response.refreshToken });
        applyAccount(response.account);
      }
      return response;
    },
    [applyAccount],
  );

  const uploadProfilePhoto = useCallback(
    async (file: File): Promise<string> => {
      const result = await storefrontAuthApi.uploadProfilePhoto(file);
      applyAccount(result.account);
      return result.url;
    },
    [applyAccount],
  );

  const removeProfilePhoto = useCallback(async (): Promise<void> => {
    const updated = await storefrontAuthApi.removeProfilePhoto();
    applyAccount(updated);
  }, [applyAccount]);

  const updateProfileData = useCallback(
    async (data: UpdateStorefrontProfilePayload): Promise<void> => {
      const updated = await storefrontAuthApi.updateProfile(data);
      applyAccount(updated);
    },
    [applyAccount],
  );

  const logout = useCallback(() => {
    // Capture the tokens BEFORE clearing: the request is sent asynchronously and would otherwise go
    // out unauthenticated, leaving the server-side session alive.
    const tokens = { accessToken: tokenStore.getAccessToken(), refreshToken: tokenStore.getRefreshToken() };
    void storefrontAuthApi.logout(tokens).catch(() => {
      // A failed logout call must not strand the user in a signed-in shell.
    });
    tokenStore.clear();
    clearSession();
  }, [clearSession]);

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
      refreshProfile,
      uploadProfilePhoto,
      removeProfilePhoto,
      updateProfileData,
      checkRegistration,
      logout,
    }),
    [
      role,
      initialising,
      customerProfile,
      retailerProfile,
      requestOtp,
      verifyOtp,
      registerRetailer,
      refreshProfile,
      uploadProfilePhoto,
      removeProfilePhoto,
      updateProfileData,
      checkRegistration,
      logout,
    ],
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
