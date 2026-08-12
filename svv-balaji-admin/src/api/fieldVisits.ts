import { api } from './client';
import { pruneEmpty, unwrap, unwrapList, type Paginated } from './envelope';
import type {
  AddFieldVisitDocumentInput,
  CreateFieldVisitInput,
  FieldVisit,
  FieldVisitDetail,
  FieldVisitDocument,
} from './types';

export const fieldVisitsApi = {
  async list(farmerId?: string): Promise<Paginated<FieldVisit>> {
    const response = await api.get<FieldVisit[]>('/field-visits', {
      params: pruneEmpty({ farmerId }),
    });
    return unwrapList<FieldVisit>(response.data);
  },

  async get(id: string): Promise<FieldVisitDetail> {
    const response = await api.get<FieldVisitDetail>(`/field-visits/${id}`);
    return unwrap<FieldVisitDetail>(response.data);
  },

  /**
   * The expert is taken from the bearer token server-side, not from the body —
   * a visit is always recorded as made by whoever is signed in.
   */
  async create(input: CreateFieldVisitInput): Promise<FieldVisit> {
    const response = await api.post<FieldVisit>('/field-visits', pruneEmpty(input));
    return unwrap<FieldVisit>(response.data);
  },

  async addDocument(id: string, input: AddFieldVisitDocumentInput): Promise<FieldVisitDocument> {
    const response = await api.post<FieldVisitDocument>(
      `/field-visits/${id}/documents`,
      pruneEmpty(input),
    );
    return unwrap<FieldVisitDocument>(response.data);
  },
};
