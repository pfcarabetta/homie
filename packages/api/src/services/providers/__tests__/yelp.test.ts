import { searchNearby } from '../yelp';

const PARAMS = {
  lat: 34.05,
  lng: -118.24,
  radiusMeters: 24140,
  category: 'plumbing',
  minRating: 4.0,
  limit: 10,
};

const MOCK_BUSINESS = {
  name: 'Best Plumbing',
  phone: '+13105551234',
  rating: 4.5,
  review_count: 80,
  is_closed: false,
  coordinates: { latitude: 34.06, longitude: -118.25 },
};

// ─── fetch mock ───────────────────────────────────────────────────────────────

global.fetch = jest.fn();

function mockFetch(body: unknown, ok = true, status = 200) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok,
    status,
    statusText: ok ? 'OK' : 'Bad Request',
    json: () => Promise.resolve(body),
  });
}

beforeEach(() => {
  jest.resetAllMocks();
  process.env.YELP_API_KEY = 'test-yelp-key';
});

afterEach(() => {
  delete process.env.YELP_API_KEY;
});

// ─── searchNearby ─────────────────────────────────────────────────────────────

describe('yelp.searchNearby', () => {
  it('returns empty array and warns when YELP_API_KEY is not set', async () => {
    delete process.env.YELP_API_KEY;
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const results = await searchNearby(PARAMS);

    expect(results).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('YELP_API_KEY'));
    warnSpy.mockRestore();
  });

  it('calls Yelp API with Authorization Bearer header', async () => {
    mockFetch({ businesses: [] });

    await searchNearby(PARAMS);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('api.yelp.com'),
      expect.objectContaining({
        headers: { Authorization: 'Bearer test-yelp-key' },
      }),
    );
  });

  it('maps Homie category to Yelp term in query string', async () => {
    mockFetch({ businesses: [] });

    await searchNearby({ ...PARAMS, category: 'plumbing' });

    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain('term=plumbers');
  });

  it('uses unknown category as-is when not in mapping', async () => {
    mockFetch({ businesses: [] });

    await searchNearby({ ...PARAMS, category: 'custom_trade' });

    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain('term=custom_trade');
  });

  it('caps radius at 40000 meters', async () => {
    mockFetch({ businesses: [] });

    await searchNearby({ ...PARAMS, radiusMeters: 99_000 });

    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain('radius=40000');
  });

  it('caps limit at 50', async () => {
    mockFetch({ businesses: [] });

    await searchNearby({ ...PARAMS, limit: 100 });

    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain('limit=50');
  });

  it('maps Yelp business to YelpBusiness shape', async () => {
    mockFetch({ businesses: [MOCK_BUSINESS] });

    const results = await searchNearby(PARAMS);

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      name: 'Best Plumbing',
      phone: '+13105551234',
      rating: 4.5,
      reviewCount: 80,
      lat: 34.06,
      lng: -118.25,
    });
  });

  it('filters out permanently closed businesses', async () => {
    mockFetch({ businesses: [{ ...MOCK_BUSINESS, is_closed: true }] });

    const results = await searchNearby(PARAMS);

    expect(results).toHaveLength(0);
  });

  it('filters out businesses below minRating', async () => {
    mockFetch({ businesses: [{ ...MOCK_BUSINESS, rating: 3.5 }] });

    const results = await searchNearby({ ...PARAMS, minRating: 4.0 });

    expect(results).toHaveLength(0);
  });

  it('returns null phone when phone is empty string', async () => {
    mockFetch({ businesses: [{ ...MOCK_BUSINESS, phone: '' }] });

    const results = await searchNearby(PARAMS);

    expect(results[0].phone).toBeNull();
  });

  it('throws when Yelp API returns non-ok status', async () => {
    mockFetch({}, false, 429);

    await expect(searchNearby(PARAMS)).rejects.toThrow('Yelp search failed: 429');
  });
});
