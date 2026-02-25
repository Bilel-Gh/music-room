import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import passport from './config/passport.js';
import { swaggerSpec } from './config/swagger.js';
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import { errorHandler } from './middleware/error.middleware.js';

const app = express();

app.use(cors());
app.use(helmet());
app.use(express.json());
app.use(passport.initialize());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);

app.use(errorHandler);

export default app;
