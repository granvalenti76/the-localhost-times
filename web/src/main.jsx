import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/unifrakturmaguntia';
import '@fontsource-variable/fraunces/full.css';
import '@fontsource-variable/fraunces/full-italic.css';
import '@fontsource/libre-caslon-text/400.css';
import '@fontsource/libre-caslon-text/400-italic.css';
import '@fontsource/libre-caslon-text/700.css';
import '@fontsource-variable/libre-franklin';
import './styles.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(<App />);
