require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Sample route
app.get('/', (req, res) => {
  res.send('Profast Server Running');
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Profast server running on port ${port}`);
});