exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  };
  try {
    const birdeyeKey = process.env.BIRDEYE_API_KEY;
    if (birdeyeKey) {
      try {
        const res = await fetch(
          'https://public-api.birdeye.so/defi/v2/tokens/new_listing?limit=20',
          { headers: { 'X-API-KEY': birdeyeKey, 'x-chain': 'solana' } }
        );
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.data?.items?.length) {
            const tokens = data.data.items.map(t => ({
              address: t.address,
              symbol: t.symbol || 'UNKNOWN',
              name: t.name || 'Unknown',
              launchedAt: t.liquidityAddedAt
                ? new Date(t.liquidityAddedAt * 1000).toISOString()
                : new Date().toISOString(),
              liquidityUSD: t.liquidity || 0,
              source: 'birdeye'
            }));
            return { statusCode: 200, headers, body: JSON.stringify({ tokens, source: 'birdeye' }) };
          }
        }
      } catch (e) {}
    }
    const res = await fetch('https://api.dexscreener.com/latest/dex/search?q=solana');
    const data = await res.json();
    const now = Date.now();
    const tokens = (data.pairs || [])
      .filter(p => p.chainId === 'solana' && p.pairCreatedAt && (now - p.pairCreatedAt) < 48 * 3600000)
      .sort((a, b) => b.pairCreatedAt - a.pairCreatedAt)
      .slice(0, 15)
      .map(p => ({
        address: p.baseToken?.address || '',
        symbol: p.baseToken?.symbol || '?',
        name: p.baseToken?.name || '',
        launchedAt: new Date(p.pairCreatedAt).toISOString(),
        liquidityUSD: p.liquidity?.usd || 0,
        volume24h: p.volume?.h24 || 0,
        priceUsd: p.priceUsd || '0',
        priceChange24h: p.priceChange?.h24 || 0,
        dex: p.dexId,
        source: 'dexscreener'
      }));
    return { statusCode: 200, headers, body: JSON.stringify({ tokens, source: 'dexscreener' }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed' }) };
  }
};
