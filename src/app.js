const path = require('path');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const config = require('./config/env');
const apiRoutes = require('./routes');
const { apiNoEncontrada, errorHandler } = require('./middlewares/errorHandler');

// Construye la aplicación Express (sin abrir el puerto ni tocar la base de
// datos): así se puede probar y reutilizar. El arranque está en server.js.
const app = express();

if (config.confiarEnProxy) app.set('trust proxy', 1);

app.use(cors(config.corsOrigenes.length ? { origin: config.corsOrigenes } : undefined));
// Límite amplio: la importación masiva de libros (CSV) puede enviar miles de filas.
app.use(express.json({ limit: '15mb' }));
app.use(cookieParser());

// Vistas: el cliente web (panel del administrador y catálogo del estudiante).
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api', apiRoutes);
app.use('/api', apiNoEncontrada);
app.use(errorHandler);

module.exports = app;
