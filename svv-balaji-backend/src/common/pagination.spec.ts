import { BadRequestException } from '@nestjs/common';
import { listPage, pageArray, pageRequest } from './pagination';

describe('pageRequest', () => {
  it('no page and no limit = not paged (bare array stays the default)', () => {
    expect(pageRequest()).toBeNull();
    expect(pageRequest('', '')).toBeNull();
  });

  it('defaults the missing half', () => {
    expect(pageRequest('3')).toEqual({ page: 3, limit: 20 });
    expect(pageRequest(undefined, '50')).toEqual({ page: 1, limit: 50 });
  });

  it.each([
    ['0', '20'], ['-1', '20'], ['1.5', '20'], ['abc', '20'],
    ['1', '0'], ['1', '101'], ['1', '999999'],
  ])('rejects page=%s limit=%s', (p, l) => {
    expect(() => pageRequest(p, l)).toThrow(BadRequestException);
  });

  it('accepts the cap exactly', () => {
    expect(pageRequest('1', '100')).toEqual({ page: 1, limit: 100 });
  });
});

describe('listPage', () => {
  const rows = Array.from({ length: 45 }, (_, i) => i);
  const find = jest.fn(async (w: { skip?: number; take?: number }) => rows.slice(w.skip ?? 0, w.take === undefined ? undefined : (w.skip ?? 0) + w.take));
  const count = jest.fn(async () => rows.length);

  beforeEach(() => jest.clearAllMocks());

  it('unpaged: the whole list, and no count query', async () => {
    expect(await listPage(null, count, find)).toEqual(rows);
    expect(find).toHaveBeenCalledWith({});
    expect(count).not.toHaveBeenCalled();
  });

  it('paged: skip/take in the database plus the matching total', async () => {
    const r = await listPage({ page: 3, limit: 20 }, count, find);
    expect(find).toHaveBeenCalledWith({ skip: 40, take: 20 });
    expect(r).toEqual({ data: [40, 41, 42, 43, 44], meta: { total: 45, page: 3, limit: 20 } });
  });

  it('a page past the end is empty, not an error', async () => {
    expect(await listPage({ page: 9, limit: 20 }, count, find)).toEqual({ data: [], meta: { total: 45, page: 9, limit: 20 } });
  });
});

describe('pageArray', () => {
  it('pages an in-memory list the same way', () => {
    expect(pageArray({ page: 2, limit: 2 }, ['a', 'b', 'c'])).toEqual({ data: ['c'], meta: { total: 3, page: 2, limit: 2 } });
    expect(pageArray(null, ['a'])).toEqual(['a']);
  });
});
