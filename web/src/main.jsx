import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/unifrakturmaguntia';
import '@fontsource-variable/source-serif-4/opsz.css';
import '@fontsource-variable/source-serif-4/opsz-italic.css';
import '@fontsource-variable/libre-franklin';
import './styles.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(<App />);
