import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

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
}

export interface CustomerAuthContextType {
  role: UserRole;
  isLoggedIn: boolean;
  customerProfile: CustomerUserProfile | null;
  retailerProfile: RetailerUserProfile | null;
  login: (phone: string, otp: string, selectedRole?: UserRole) => boolean;
  logout: () => void;
  switchRole: (newRole: UserRole) => void;
  registerPartner: (partnerData: Partial<RetailerUserProfile>) => void;
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

const CustomerAuthContext = createContext<CustomerAuthContextType | undefined>(undefined);

const AUTH_STORAGE_KEY = 'desi_tokri_auth_state';

export function CustomerAuthProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<UserRole>('CUSTOMER');
  const [customerProfile, setCustomerProfile] = useState<CustomerUserProfile | null>(defaultCustomer);
  const [retailerProfile, setRetailerProfile] = useState<RetailerUserProfile | null>(null);

  // Initialize from localStorage if exists
  useEffect(() => {
    try {
      const saved = localStorage.getItem(AUTH_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.role) setRole(parsed.role);
        if (parsed.customerProfile) setCustomerProfile(parsed.customerProfile);
        if (parsed.retailerProfile) setRetailerProfile(parsed.retailerProfile);
      }
    } catch (e) {
      console.warn('Failed to parse saved auth state', e);
    }
  }, []);

  const saveState = (newRole: UserRole, cust: CustomerUserProfile | null, ret: RetailerUserProfile | null) => {
    try {
      localStorage.setItem(
        AUTH_STORAGE_KEY,
        JSON.stringify({
          role: newRole,
          customerProfile: cust,
          retailerProfile: ret,
        })
      );
    } catch (e) {
      console.warn('Failed to save auth state to localStorage', e);
    }
  };

  const login = (phone: string, otp: string, selectedRole: UserRole = 'CUSTOMER'): boolean => {
    if (otp !== '1234' && otp.length !== 4) {
      return false;
    }

    if (selectedRole === 'RETAILER') {
      const ret = { ...defaultRetailer, phone: phone.startsWith('+91') ? phone : `+91 ${phone}` };
      setRole('RETAILER');
      setRetailerProfile(ret);
      saveState('RETAILER', customerProfile, ret);
    } else {
      const cust = { ...defaultCustomer, phone: phone.startsWith('+91') ? phone : `+91 ${phone}` };
      setRole('CUSTOMER');
      setCustomerProfile(cust);
      saveState('CUSTOMER', cust, retailerProfile);
    }
    return true;
  };

  const logout = () => {
    setRole('GUEST');
    saveState('GUEST', customerProfile, retailerProfile);
  };

  const switchRole = (newRole: UserRole) => {
    if (newRole === 'RETAILER' && !retailerProfile) {
      setRetailerProfile(defaultRetailer);
    }
    setRole(newRole);
    saveState(newRole, customerProfile, newRole === 'RETAILER' ? retailerProfile || defaultRetailer : retailerProfile);
  };

  const registerPartner = (partnerData: Partial<RetailerUserProfile>) => {
    const newProfile: RetailerUserProfile = {
      ...defaultRetailer,
      storeName: partnerData.storeName || 'My Kirana Store',
      ownerName: partnerData.ownerName || customerProfile?.name || 'Store Owner',
      phone: partnerData.phone || customerProfile?.phone || '+91 98765 43210',
      email: partnerData.email || 'partner@example.com',
      gstin: partnerData.gstin || '36AABCU9603R1ZM',
      panNumber: partnerData.panNumber || 'AABCU9603R',
      category: partnerData.category || 'Kirana & Grocery',
      address: partnerData.address || 'Main Road, Market Hub',
      pincode: partnerData.pincode || '506001',
      kycStatus: 'VERIFIED',
      totalOrders: 0,
      totalSavings: 0,
      walletBalance: 500, // Welcome B2B wallet credit
      creditLimit: 50000,
      creditUsed: 0,
    };
    setRetailerProfile(newProfile);
    setRole('RETAILER');
    saveState('RETAILER', customerProfile, newProfile);
  };

  return (
    <CustomerAuthContext.Provider
      value={{
        role,
        isLoggedIn: role !== 'GUEST',
        customerProfile,
        retailerProfile,
        login,
        logout,
        switchRole,
        registerPartner,
      }}
    >
      {children}
    </CustomerAuthContext.Provider>
  );
}

export function useCustomerAuth(): CustomerAuthContextType {
  const context = useContext(CustomerAuthContext);
  if (!context) {
    throw new Error('useCustomerAuth must be used within a CustomerAuthProvider');
  }
  return context;
}
