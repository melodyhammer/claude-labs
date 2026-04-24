let latestValue = 0;

  export default function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST,
  OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method === 'POST') {
      latestValue = Number(req.body?.value ?? 0);
      return res.status(200).json({ ok: true });
    }

    return res.status(200).json({ value: latestValue });
  }
