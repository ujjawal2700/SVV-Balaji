import { useQuery } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../api/client';

/** A recalled pack resolves to this and nothing else - never vouch for it. */
export interface RecalledPackTrace {
  status: 'RECALLED';
  fgBatchNumber: string;
  product: { name: string; category: string | null };
  notice: string;
}

/** Mirrors `StorefrontTraceService.trace` - the public projection, no farmer identity. */
export interface PackTrace {
  status: 'VERIFIED' | 'ON_HOLD';
  fgBatchNumber: string;
  product: { name: string; category: string | null };
  pack: {
    netWeight: string;
    packagingType: string;
    manufacturingDate: string;
    packagingDate: string;
    expiryDate: string | null;
  };
  origin: {
    crops: string[];
    regions: Array<{ village: string; district: string; state: string }>;
    growerCount: number;
    firstHarvest: string | null;
    lastHarvest: string | null;
  };
  quality: {
    moisturePercent: number | null;
    purityPercent: number | null;
    foreignMatterPercent: number | null;
    rawMaterialPassed: boolean;
    inProcessPassed: boolean;
    finishedGoodsPassed: boolean;
    shelfLifeVerified: boolean;
    qaReleased: boolean;
  };
  processing: { facility: string | null; milledOn: string; packedOn: string };
}

export function usePackTrace(fgBatchNumber: string | undefined) {
  return useQuery({
    queryKey: ['storefront', 'trace', fgBatchNumber],
    enabled: Boolean(fgBatchNumber),
    retry: false, // a 404 means "no such batch", not a blip
    staleTime: 0, // a recall must show on the very next scan, never from cache
    queryFn: async () => {
      try {
        const { data } = await api.get<PackTrace | RecalledPackTrace>(
          `/storefront/trace/${encodeURIComponent(fgBatchNumber as string)}`,
        );
        return data;
      } catch (error) {
        throw new Error(apiErrorMessage(error, 'Could not look up that batch'));
      }
    },
  });
}
