const { Connection, PublicKey } = require('@solana/web3.js');
const { getMint, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } = require('@solana/spl-token');

const connection = new Connection(
  process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'
);

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  let tokenAddress;
  try {
    tokenAddress = JSON.parse(event.body).tokenAddress;
    new PublicKey(tokenAddress);
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Valid Solana address required' }) };
  }

  const flags = [];
  let riskScore = 0;
  let mintData = null;
  let marketData = null;

  try {
    const info = await connection.getAccountInfo(new PublicKey(tokenAddress));
    const programId = info?.owner?.equals(TOKEN_2022_PROGRAM_ID) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
    const mint = await getMint(connection, new PublicKey(tokenAddress), undefined, programId);
    mintData = {
      decimals: mint.decimals,
      supply: (Number(mint.supply) / Math.pow(10, mint.decimals)).toString(),
      mintAuthorityRenounced: mint.mintAuthority === null,
      freezeAuthorityRenounced: mint.freezeAuthority === null
    };
    if (!mintData.mintAuthorityRenounced) {
      flags.push({ severity: 'high', message: 'Mint authority NOT renounced — creator can print unlimited tokens.' });
      riskScore += 35;
    } else {
      flags.push({ severity: 'info', message: 'Mint authority renounced ✓' });
    }
    if (!mintData.freezeAuthorityRenounced) {
      flags.push({ severity: 'high', message: 'Freeze authority active — creator can freeze your wallet.' });
      riskScore += 30;
    } else {
      flags.push({ severity: 'info', message: 'Freeze authority renounced ✓' });
    }
  } catch (e) {
    flags.push({ severity: 'medium', message: 'Could not read on-chain mint data — RPC may be rate-limited.' });
    riskScore += 10;
  }

  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`);
    const data = await res.json();
    const pairs = data.pairs || [];
    if (!pairs.length) {
      flags.push({ severity: 'high', message: 'No DEX trading pair found — token may not be tradeable.' });
      riskScore += 25;
    } else {
      const top = pairs.reduce((b, p) => (p.liquidity?.usd || 0) > (b.liquidity?.usd || 0) ? p : b, pairs[0]);
      const liq = top.liquidity?.usd || 0;
      const ageH = top.pairCreatedAt ? (Date.now() - top.pairCreatedAt) / 3600000 : null;
      marketData = {
        liquidityUsd: liq,
        volume24h: top.volume?.h24 || 0,
        priceUsd: top.priceUsd,
        priceChange24h: top.priceChange?.h24 || 0,
        ageHours: ageH,
        dex: top.dexId,
        website: top.info?.websites?.[0]?.url || null,
        socials: (top.info?.socials || []).map(s => ({ type: s.type, url: s.url }))
      };
      if (liq < 1000) { flags.push({ severity: 'high', message: `Only $${liq.toFixed(0)} liquidity — extreme rug risk.` }); riskScore += 25; }
      else if (liq < 10000) { flags.push({ severity: 'medium', message: `Low liquidity $${liq.toLocaleString()} — high slippage.` }); riskScore += 10; }
      else { flags.push({ severity: 'info', message: `Liquidity $${liq.toLocaleString()} ✓` }); }
      if (ageH && ageH < 24) { flags.push({ severity: 'medium', message: `Pool only ${ageH.toFixed(1)}h old — most rugs happen in first 24h.` }); riskScore += 10; }
      if (!marketData.website && !marketData.socials.length) { flags.push({ severity: 'medium', message: 'No website or socials found.' }); riskScore += 8; }
      else { flags.push({ severity: 'info', message: `Found ${marketData.socials.length} social(s)${marketData.website ? ' + website' : ''} ✓` }); }
    }
  } catch (e) {
    flags.push({ severity: 'low', message: 'Could not fetch market data from DexScreener.' });
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      tokenAddress,
      riskScore: Math.min(riskScore, 100),
      verdict: riskScore >= 60 ? 'high_risk' : riskScore >= 30 ? 'caution' : 'lower_risk',
      flags,
      mint: mintData,
      market: marketData,
      timestamp: new Date().toISOString()
    })
  };
};
