const express = require('express');
const axios = require('axios');
require('dotenv/config');
const qs = require('qs');

const port = process.env.PORT || 4000;
const app = express();

app.get('/api/auth/callback/discord', async (req, res) => {
    const { code } = req.query;

    if (code) {
        const data = {
            client_id: process.env.DISCORD_CLIENT_ID,
            client_secret: process.env.DISCORD_CLIENT_SECRET,
            grant_type: 'authorization_code',
            code: code.toString(),
            redirect_uri: process.env.DISCORD_REDIRECT_URI,
        };

        const tokenResponse = await axios.post(
          'https://discord.com/api/v10/oauth2/token',
          qs.stringify(data), 
          {
              headers: {
                  'Content-Type': 'application/x-www-form-urlencoded',
              },
          }
      );
        let access_token = null; 
        let userResponse = null;

        if (tokenResponse.data && tokenResponse.data.access_token) {
            access_token = tokenResponse.data.access_token;

            userResponse = await axios.get(
                'https://discord.com/api/v10/users/@me',
                {
                    headers: {
                        'Authorization': `Bearer ${access_token}`,
                    },
                }
            );
        } else {
            console.error("Erreur: Le jeton d'accès n'a pas été reçu.");
            return res.status(500).send("Erreur d'authentification.");
        }
        
        console.log('ACCESS TOKEN:', access_token);
        console.log('USER DATA:', userResponse.data);

        return res.redirect('http://localhost:3000');
    } else {
        return res.status(400).send("Code d'autorisation Discord manquant.");
    }
});

app.listen(port, () => {
    console.log(`Backend Server démarré sur http://localhost:${port}`);
    console.log('Attente de la connexion Discord...');
});
