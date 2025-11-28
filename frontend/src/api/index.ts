const axios = require('axios');

const apiClient = axios.create({
  baseURL: 'http://localhost:4000', 
  
  withCredentials: true,
});

module.exports = apiClient;
