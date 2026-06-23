import express from 'express';
import cors from 'cors';
import apiRoutes from './routes/api.js';

const app = express();

// Enable CORS so the React app (on its port) can make API calls to the server
app.use(cors());
app.use(express.json());

// Main entry prefix for all REST API endpoints
app.use('/api', apiRoutes);

// Centralized Express Exception Handler Middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(700).json({ error: 'Internal Server Error', details: err.message });
});

export default app;
