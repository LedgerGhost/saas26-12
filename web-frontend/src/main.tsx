import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import App from './App';
import 'leaflet/dist/leaflet.css';
import './styles.css';

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

const tree = (
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

ReactDOM.createRoot(document.getElementById('root')!).render(
  googleClientId
    ? <GoogleOAuthProvider clientId={googleClientId}>{tree}</GoogleOAuthProvider>
    : tree
);
