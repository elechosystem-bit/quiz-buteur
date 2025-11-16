/**
 * API Route Vercel - Proxy pour API Football
 * Contourne les problèmes CORS en faisant les requêtes depuis le serveur
 */

export default async function handler(req, res) {
  // CORS headers pour permettre les requêtes depuis le frontend
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-rapidapi-key, x-rapidapi-host');

  // Gérer les requêtes OPTIONS (preflight)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Seulement GET pour l'instant
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { endpoint, ...queryParams } = req.query;

    if (!endpoint) {
      return res.status(400).json({ error: 'Endpoint parameter is required' });
    }

    // Récupérer la clé API depuis les variables d'environnement
    // Sur Vercel, utiliser API_FOOTBALL_KEY (sans VITE_ pour les serverless functions)
    const apiKey = process.env.API_FOOTBALL_KEY || process.env.VITE_API_FOOTBALL_KEY;

    if (!apiKey) {
      console.error('❌ API_FOOTBALL_KEY not configured');
      return res.status(500).json({ error: 'API key not configured' });
    }

    // Construire l'URL de l'API Football
    const baseUrl = 'https://v3.football.api-sports.io';
    const queryString = new URLSearchParams(queryParams).toString();
    const url = `${baseUrl}/${endpoint}${queryString ? `?${queryString}` : ''}`;

    console.log('🔄 Proxy request to:', url);

    // Faire la requête vers l'API Football
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-rapidapi-key': apiKey,
        'x-rapidapi-host': 'v3.football.api-sports.io'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ API Football error:', response.status, errorText);
      return res.status(response.status).json({ 
        error: `API Football error: ${response.status}`,
        details: errorText 
      });
    }

    const data = await response.json();
    
    // Retourner les données
    return res.status(200).json(data);

  } catch (error) {
    console.error('❌ Proxy error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}

