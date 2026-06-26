const { supabase } = require('./utils/db');

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // Get Facebook Pixel ID from DB
    const { data: pixelData } = await supabase.from('settings').select('value').eq('key', 'fb_pixel_id');
    const pixelId = pixelData && pixelData.length > 0 ? pixelData[0].value : '';

    // Get card_enabled from DB
    const { data: cardData } = await supabase.from('settings').select('value').eq('key', 'card_enabled');
    const cardEnabled = cardData && cardData.length > 0 ? cardData[0].value : 'false';

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        fb_pixel_id: pixelId,
        card_enabled: cardEnabled === 'true'
      })
    };
  } catch (error) {
    console.error('Config Function Exception:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Erro interno do servidor.' })
    };
  }
};
