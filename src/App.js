import React, { useState, useEffect } from 'react';

// ============================================
// CONFIGURATION
// ============================================

// Update this with your Client Apps Script Web App URL
const CLIENT_API_URL = 'https://script.google.com/macros/s/AKfycbzRLIS_HkRzFI9wlm_tvE1ccfQTeDUqqPSrTwCVbtmKtJuoVJWyZQORG6z6_B40bxCU/exec';

// ============================================
// AUTHENTICATION SERVICE
// ============================================

const authService = {
  // Login
  async login(email, password) {
    try {
      // Use GET request instead of POST (more reliable for Apps Script Web Apps)
      const url = new URL(CLIENT_API_URL);
      url.searchParams.set('action', 'login');
      url.searchParams.set('email', email);
      url.searchParams.set('password', password);
      
      console.log('Making login GET request to:', url.toString().replace(/password=[^&]+/, 'password=***'));
      
      const response = await fetch(url.toString(), {
        method: 'GET',
        mode: 'cors',
        redirect: 'follow'
      });
      
      console.log('Login response status:', response.status);
      console.log('Login response statusText:', response.statusText);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Login HTTP error:', response.status, response.statusText);
        console.error('Error response text:', errorText);
        return { success: false, error: `Server error: ${response.status} - ${errorText}` };
      }
      
      let data;
      try {
        const text = await response.text();
        console.log('Login response text:', text);
        data = JSON.parse(text);
      } catch (parseError) {
        console.error('Failed to parse login response:', parseError);
        return { success: false, error: 'Invalid response from server' };
      }
      
      console.log('Login response data:', data);
      
      if (data.success && data.token) {
        // Store session in localStorage
        const token = data.token;
        console.log('Login successful, storing token:', token);
        console.log('Token length:', token.length);
        console.log('Full token:', token);
        
        localStorage.setItem('clientToken', token);
        localStorage.setItem('clientInfo', JSON.stringify({
          email: data.email,
          clientCompanyName: data.clientCompanyName,
          fullName: data.fullName
        }));
        
        // Verify token was stored
        const storedToken = localStorage.getItem('clientToken');
        console.log('Token stored verification:', storedToken === token ? 'SUCCESS' : 'FAILED');
        console.log('Stored token:', storedToken);
        
        return { success: true, data };
      } else {
        console.error('Login failed:', data.error || 'Unknown error');
        return { success: false, error: data.error || 'Login failed' };
      }
    } catch (error) {
      console.error('Login exception:', error);
      return { success: false, error: error.message || 'Network error' };
    }
  },
  
  // Logout
  logout() {
    const token = localStorage.getItem('clientToken');
    if (token) {
      // Call logout endpoint (optional - session will expire anyway)
      fetch(CLIENT_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          action: 'logout',
          token: token
        }),
        mode: 'cors'
      }).catch(() => {}); // Ignore errors
    }
    
    localStorage.removeItem('clientToken');
    localStorage.removeItem('clientInfo');
  },
  
  // Get current session
  getSession() {
    const token = localStorage.getItem('clientToken');
    const clientInfo = localStorage.getItem('clientInfo');
    
    if (token && clientInfo) {
      return {
        token: token,
        clientInfo: JSON.parse(clientInfo)
      };
    }
    return null;
  },
  
  // Check if logged in
  isAuthenticated() {
    const token = localStorage.getItem('clientToken');
    console.log('Checking authentication, token in localStorage:', token ? token.substring(0, 20) + '...' : 'null');
    return !!token;
  },
  
  // Get current token (for debugging)
  getCurrentToken() {
    return localStorage.getItem('clientToken');
  },
  
  // Diagnostic function to check token format
  diagnoseToken() {
    const token = localStorage.getItem('clientToken');
    if (!token) {
      return { error: 'No token found in localStorage' };
    }
    
    return {
      token: token,
      length: token.length,
      trimmed: token.trim(),
      trimmedLength: token.trim().length,
      hasWhitespace: token !== token.trim(),
      format: token.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i) ? 'UUID' : 'OTHER',
      firstChars: token.substring(0, 20),
      lastChars: token.substring(Math.max(0, token.length - 10))
    };
  }
};

// ============================================
// API SERVICE
// ============================================

const apiService = {
  // Make authenticated request
  async request(action, params = {}) {
    const session = authService.getSession();
    if (!session || !session.token) {
      console.error('No session found in request');
      throw new Error('Not authenticated');
    }
    
    // Ensure token is clean (trim whitespace)
    const cleanToken = String(session.token).trim();
    if (!cleanToken) {
      console.error('Token is empty after trimming');
      throw new Error('Not authenticated');
    }
    
    console.log('Making API request:', {
      action: action,
      tokenLength: cleanToken.length,
      tokenPreview: cleanToken.substring(0, 20) + '...',
      params: params
    });
    
    const url = new URL(CLIENT_API_URL);
    url.searchParams.set('action', action);
    url.searchParams.set('token', cleanToken); // Use cleaned token
    
    Object.keys(params).forEach(key => {
      url.searchParams.set(key, params[key]);
    });
    
    // Log the URL (without full token for security)
    const urlForLogging = url.toString().replace(/token=[^&]+/, 'token=***');
    console.log('Request URL:', urlForLogging);
    
    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        mode: 'cors',
        cache: 'no-cache',
        headers: {
          'Accept': 'application/json'
        }
      });
      
      console.log('Response status:', response.status, response.statusText);
      
      if (!response.ok) {
        console.error('HTTP error:', response.status, response.statusText);
        const errorText = await response.text();
        console.error('Error response text:', errorText);
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      let data;
      let text;
      try {
        text = await response.text();
        console.log('API response text length:', text.length);
        console.log('Response starts with:', text.substring(0, 100));
        
        // Google Apps Script Web Apps sometimes wrap JSON in HTML comments
        // Try to extract JSON if wrapped
        let jsonText = text.trim();
        if (jsonText.startsWith('<!--') && jsonText.includes('-->')) {
          const jsonMatch = jsonText.match(/<!--([\s\S]*?)-->/);
          if (jsonMatch) {
            jsonText = jsonMatch[1].trim();
            console.log('Extracted JSON from HTML comment');
          }
        }
        
        data = JSON.parse(jsonText);
      } catch (error) {
        console.error('Failed to parse response:', error);
        console.error('Response text that failed to parse:', text?.substring(0, 500));
        throw new Error('Invalid response from server: ' + error.message);
      }
      
      console.log('API response success:', data.success);
      if (data.error) {
        console.error('API response error:', data.error);
      }
      
      if (!data || typeof data !== 'object') {
        console.error('Invalid response format:', data);
        throw new Error('Invalid response format from server');
      }
      
      if (!data.success) {
        // Log the error for debugging
        const errorMsg = data.error || data.message || 'Request failed';
        console.error('API Error Details:', {
          error: errorMsg,
          action: action,
          tokenLength: cleanToken.length,
          tokenPreview: cleanToken.substring(0, 10) + '...',
          fullResponse: data
        });
        
        // If it's a session error, provide more context
        if (errorMsg.includes('Invalid or expired session') || errorMsg.includes('No session token')) {
          console.error('Session validation failed. Token being used:', cleanToken.substring(0, 20) + '...');
          console.error('Check if this token exists in the Clients sheet, column J');
        }
        
        throw new Error(errorMsg);
      }
      
      return data;
    } catch (error) {
      // Re-throw with more context if it's a network error
      if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        console.error('Network error:', error);
        throw new Error('Network error. Please check your internet connection and try again.');
      }
      throw error;
    }
  },
  
  // Get client proposals
  async getProposals() {
    return this.request('proposals');
  },
  
  // Get yearly spend
  async getSpend(year) {
    return this.request('spend', { year: year });
  },
  
  // Get single proposal
  async getProposal(proposalId) {
    return this.request('proposal', { id: proposalId });
  },
  
  // Validate session
  async validateSession() {
    return this.request('validate');
  }
};

// ============================================
// HELPER FUNCTIONS
// ============================================

function parseDateSafely(dateStr) {
  if (!dateStr) return null;
  if (dateStr instanceof Date) return dateStr;
  const dateMatch = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateMatch) {
    const year = parseInt(dateMatch[1], 10);
    const month = parseInt(dateMatch[2], 10) - 1;
    const day = parseInt(dateMatch[3], 10);
    return new Date(year, month, day);
  }
  return new Date(dateStr);
}

function formatDateRange(proposal) {
  const start = parseDateSafely(proposal.startDate);
  const end = parseDateSafely(proposal.endDate);
  if (!start || !end) return '';
  
  const startMonth = start.toLocaleDateString('en-US', { month: 'long' });
  const endMonth = end.toLocaleDateString('en-US', { month: 'long' });
  const startDay = start.getDate();
  const endDay = end.getDate();
  const year = start.getFullYear();
  
  if (startMonth === endMonth && startDay === endDay) {
    return `${startMonth} ${startDay}, ${year}`;
  } else if (startMonth === endMonth) {
    return `${startMonth} ${startDay}-${endDay}, ${year}`;
  } else {
    return `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${year}`;
  }
}

function calculateTotal(proposal) {
  // Simplified calculation - matches Apps Script logic
  const sections = JSON.parse(proposal.sectionsJSON || '[]');
  
  let baseProductTotal = 0;
  sections.forEach(section => {
    if (section.products && Array.isArray(section.products)) {
      section.products.forEach(product => {
        const quantity = parseFloat(product.quantity) || 0;
        const price = parseFloat(product.price) || 0;
        baseProductTotal += quantity * price;
      });
    }
  });
  
  // Get rental multiplier
  let rentalMultiplier = 1.0;
  if (proposal.customRentalMultiplier && proposal.customRentalMultiplier.trim() !== '') {
    const parsed = parseFloat(proposal.customRentalMultiplier);
    if (!isNaN(parsed) && parsed > 0) {
      rentalMultiplier = parsed;
    }
  } else {
    // Calculate from duration
    const start = parseDateSafely(proposal.startDate);
    const end = parseDateSafely(proposal.endDate);
    if (start && end) {
      const diffTime = end.getTime() - start.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
      rentalMultiplier = getRentalMultiplier(diffDays);
    }
  }
  
  const extendedProductTotal = baseProductTotal * rentalMultiplier;
  
  // Calculate discount
  const discountValue = parseFloat(proposal.discountValue || proposal.discount || 0) || 0;
  let discountType = 'percentage';
  if (proposal.discountName && proposal.discountName.startsWith('TYPE:')) {
    const match = proposal.discountName.match(/^TYPE:(\w+)/);
    if (match) discountType = match[1];
  }
  
  const standardRateDiscount = discountType === 'dollar' 
    ? discountValue 
    : extendedProductTotal * (discountValue / 100);
  
  const rentalTotal = extendedProductTotal - standardRateDiscount;
  
  // Calculate fees
  const productCareAmount = extendedProductTotal * 0.10;
  let waiveProductCare = false;
  if (proposal.discountName && proposal.discountName.includes('WAIVE:PC')) {
    waiveProductCare = true;
  }
  const productCare = waiveProductCare ? 0 : productCareAmount;
  
  const delivery = parseFloat(proposal.deliveryFee) || 0;
  
  const serviceFeeAmount = (rentalTotal + productCare + delivery) * 0.05;
  let waiveServiceFee = false;
  if (proposal.discountName && proposal.discountName.includes('WAIVE:SF')) {
    waiveServiceFee = true;
  }
  const serviceFee = waiveServiceFee ? 0 : serviceFeeAmount;
  
  const subtotal = rentalTotal + productCare + serviceFee + delivery;
  
  // Tax
  const taxExempt = proposal.taxExempt === true || proposal.taxExempt === 'true';
  const tax = taxExempt ? 0 : subtotal * 0.0975;
  
  const total = subtotal + tax;
  
  return total;
}

function getRentalMultiplier(duration) {
  if (duration <= 1) return 1.0;
  if (duration === 2) return 1.1;
  if (duration === 3) return 1.2;
  if (duration === 4) return 1.3;
  if (duration === 5) return 1.4;
  if (duration === 6) return 1.5;
  if (duration >= 7 && duration <= 14) return 2.0;
  if (duration >= 15 && duration <= 21) return 3.0;
  if (duration >= 22 && duration <= 28) return 4.0;
  return 4.0;
}

function isFutureDate(dateStr) {
  const date = parseDateSafely(dateStr);
  if (!date) return false;
  return date > new Date();
}

function isPastDate(dateStr) {
  const date = parseDateSafely(dateStr);
  if (!date) return false;
  return date < new Date();
}

// ============================================
// MAIN APP COMPONENT
// ============================================

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [clientInfo, setClientInfo] = useState(null);
  
  useEffect(() => {
    // Check if user is already logged in
    const checkAuth = () => {
      if (authService.isAuthenticated()) {
        const session = authService.getSession();
        if (session && session.clientInfo) {
          console.log('Session found on mount:', session.clientInfo);
          setClientInfo(session.clientInfo);
          setIsAuthenticated(true);
        } else {
          console.log('Session invalid on mount, clearing...');
          authService.logout();
        }
      } else {
        console.log('No session found on mount');
      }
    };
    
    // Small delay to ensure localStorage is ready
    setTimeout(checkAuth, 100);
  }, []);
  
  const handleLogin = async (email, password) => {
    try {
      console.log('Attempting login for:', email);
      const result = await authService.login(email, password);
      console.log('Login result:', result);
      
      if (result.success && result.data.token) {
        console.log('Login successful, token received:', result.data.token.substring(0, 20) + '...');
        
        // Verify token was stored in localStorage
        const storedToken = localStorage.getItem('clientToken');
        if (!storedToken || storedToken !== result.data.token) {
          console.error('Token storage verification failed!');
          console.error('Expected:', result.data.token);
          console.error('Stored:', storedToken);
          return { success: false, error: 'Failed to store session. Please try again.' };
        }
        
        console.log('Token stored successfully in localStorage');
        console.log('Setting authentication state');
        
        setClientInfo({
          email: result.data.email,
          clientCompanyName: result.data.clientCompanyName,
          fullName: result.data.fullName
        });
        setIsAuthenticated(true);
        console.log('Authentication state set, isAuthenticated should be true');
        
        // Wait longer for Apps Script to write the session to the sheet
        // Apps Script can be slow, especially on first write
        // Google Sheets writes can take 1-3 seconds, so we wait longer
        console.log('Waiting for Apps Script to store session in sheet...');
        console.log('Token that should be stored:', result.data.token);
        await new Promise(resolve => setTimeout(resolve, 4000)); // 4 second delay for Apps Script
        
        // Try to validate the session (with retries)
        let validationSuccess = false;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            console.log(`Validating session (attempt ${attempt + 1}/3)...`);
            await apiService.validateSession();
            console.log('Session validated successfully');
            validationSuccess = true;
            break;
          } catch (err) {
            console.error(`Session validation attempt ${attempt + 1} failed:`, err);
            if (attempt < 2) {
              // Wait before retrying (exponential backoff)
              const delay = 1000 * (attempt + 1);
              console.log(`Retrying validation in ${delay}ms...`);
              await new Promise(resolve => setTimeout(resolve, delay));
            }
          }
        }
        
        if (!validationSuccess) {
          console.warn('Session validation failed after retries, but login was successful');
          console.warn('The session may still work - Apps Script might be slow');
          // Don't fail the login, just warn - the session might still work
        }
        
        return { success: true };
      } else {
        console.error('Login failed:', result.error);
        return { success: false, error: result.error };
      }
    } catch (error) {
      console.error('Login handler error:', error);
      return { success: false, error: error.message || 'Login failed' };
    }
  };
  
  const handleLogout = () => {
    authService.logout();
    setIsAuthenticated(false);
    setClientInfo(null);
  };
  
  if (!isAuthenticated) {
    return <LoginView onLogin={handleLogin} />;
  }
  
  return <DashboardView clientInfo={clientInfo} onLogout={handleLogout} />;
}

// ============================================
// LOGIN VIEW
// ============================================

function LoginView({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      const result = await onLogin(email, password);
      
      if (!result.success) {
        setError(result.error || 'Login failed');
        setLoading(false);
      } else {
        // Login successful - loading will be handled by parent component
        // Don't set loading to false here, let the redirect happen
        console.log('Login form submitted successfully');
      }
    } catch (error) {
      console.error('Login form error:', error);
      setError(error.message || 'Login failed');
      setLoading(false);
    }
  };
  
  const brandCharcoal = '#2C2C2C';
  
  return (
    <div style={{ minHeight: '100vh', display: 'flex' }}>
      <style dangerouslySetInnerHTML={{ __html: `
        @font-face {
          font-family: 'NeueHaasUnica';
          src: url('/NeueHaasUnica-Regular.woff2') format('woff2');
          font-weight: 400;
          font-style: normal;
          font-display: swap;
        }
        @font-face {
          font-family: 'NeueHaasUnica';
          src: url('/NeueHaasUnica-Light.woff2') format('woff2');
          font-weight: 300;
          font-style: normal;
          font-display: swap;
        }
        @font-face {
          font-family: 'NeueHaasUnica';
          src: url('/NeueHaasUnica-Medium.woff2') format('woff2');
          font-weight: 500;
          font-style: normal;
          font-display: swap;
        }
        @font-face {
          font-family: 'NeueHaasUnica';
          src: url('/NeueHaasUnica-Bold.woff2') format('woff2');
          font-weight: 600;
          font-style: normal;
          font-display: swap;
        }
        @font-face {
          font-family: 'Domaine Text';
          src: url('/test-domaine-text-light.woff2') format('woff2');
          font-weight: 300;
          font-style: normal;
          font-display: swap;
        }
        @font-face {
          font-family: 'Domaine Text';
          src: url('/test-domaine-text-medium.woff2') format('woff2');
          font-weight: 400;
          font-style: normal;
          font-display: swap;
        }
        @font-face {
          font-family: 'Domaine Text';
          src: url('/test-domaine-text-bold.woff2') format('woff2');
          font-weight: 600;
          font-style: normal;
          font-display: swap;
        }
        body, * {
          font-family: 'NeueHaasUnica', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif !important;
        }
        h1, h2, h3, h4, h5, h6 {
          font-family: 'Domaine Text', 'Georgia', serif !important;
        }
      ` }} />
      
      {/* Left Side - Login Form */}
      <div style={{ 
        flex: '0 0 50%', 
        backgroundColor: '#fafaf8', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        padding: '40px'
      }}>
        <div style={{ maxWidth: '400px', width: '100%' }}>
          {/* Brand Mark */}
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            {/* Icon/Brand Mark */}
            <img 
              src="/mayker_icon-black.png" 
              alt="Mayker Reserve" 
              style={{ height: '60px', width: 'auto', marginBottom: '24px', display: 'block', margin: '0 auto 24px auto' }}
              onLoad={() => console.log('✅ Icon loaded:', '/mayker_icon-black.png')}
              onError={(e) => {
                console.error('❌ Icon failed to load:', e.target.src);
                // Try alternative path if image not found
                if (!e.target.src.includes('/assets/')) {
                  e.target.src = '/assets/mayker_icon-black.png';
                } else {
                  console.error('Icon image not found - all paths failed');
                }
              }}
            />
            {/* Mayker Reserve Logo */}
            <img 
              src={encodeURI('/Mayker Reserve - Black – 2.png')}
              alt="Mayker Reserve" 
              style={{ 
                maxHeight: '50px', 
                height: 'auto', 
                width: 'auto', 
                maxWidth: '300px',
                marginBottom: '16px', 
                display: 'block', 
                margin: '0 auto 16px auto',
                objectFit: 'contain'
              }}
              onLoad={() => console.log('✅ Logo loaded')}
              onError={(e) => {
                console.error('❌ Logo failed to load:', e.target.src);
                // Try alternative paths if image not found
                const alternatives = [
                  '/Mayker Reserve - Black - 2.png', // Regular hyphen
                  '/mayker_icon-black.png', // Icon as fallback
                ];
                const currentSrc = e.target.src;
                const triedIndex = alternatives.findIndex(alt => currentSrc.includes(alt.replace(/\s+/g, ' ')));
                if (triedIndex < alternatives.length - 1) {
                  console.log('Trying alternative:', alternatives[triedIndex + 1]);
                  e.target.src = alternatives[triedIndex + 1];
                } else {
                  console.error('All logo paths failed');
                }
              }}
            />
            <p style={{ 
              fontSize: '16px', 
              color: '#666', 
              margin: '0',
              fontWeight: '400',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              fontFamily: "'NeueHaasUnica', sans-serif"
            }}>
              CLIENT PORTAL
            </p>
          </div>
          
          <form onSubmit={handleSubmit}>
            {error && (
              <div style={{ 
                backgroundColor: '#fee2e2', 
                color: '#dc2626', 
                padding: '12px', 
                borderRadius: '6px', 
                marginBottom: '24px', 
                fontSize: '14px' 
              }}>
                {error}
              </div>
            )}
            
            <div style={{ marginBottom: '24px' }}>
              <label style={{ 
                display: 'block', 
                fontSize: '14px', 
                fontWeight: '500', 
                marginBottom: '8px', 
                color: brandCharcoal 
              }}>
                Email:
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{ 
                  width: '100%', 
                  padding: '14px', 
                  border: '1px solid #d1d5db', 
                  borderRadius: '6px', 
                  fontSize: '15px', 
                  boxSizing: 'border-box',
                  backgroundColor: 'white'
                }}
                placeholder="Enter your email"
              />
            </div>
            
            <div style={{ marginBottom: '32px' }}>
              <label style={{ 
                display: 'block', 
                fontSize: '14px', 
                fontWeight: '500', 
                marginBottom: '8px', 
                color: brandCharcoal 
              }}>
                Password:
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{ 
                  width: '100%', 
                  padding: '14px', 
                  border: '1px solid #d1d5db', 
                  borderRadius: '6px', 
                  fontSize: '15px', 
                  boxSizing: 'border-box',
                  backgroundColor: 'white'
                }}
                placeholder="Enter your password"
              />
            </div>
            
            {/* Buttons Row */}
            <div style={{ 
              display: 'flex', 
              gap: '12px', 
              marginBottom: '24px' 
            }}>
              <button
                type="button"
                onClick={() => {
                  // TODO: Implement forgot password functionality
                  alert('Forgot password functionality coming soon');
                }}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  backgroundColor: 'transparent',
                  color: brandCharcoal,
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = brandCharcoal;
                  e.currentTarget.style.backgroundColor = '#f9fafb';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#d1d5db';
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                Forgot Your Password
              </button>
              
              <button
                type="submit"
                disabled={loading}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  backgroundColor: brandCharcoal,
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.7 : 1,
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  if (!loading) {
                    e.currentTarget.style.opacity = '0.9';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!loading) {
                    e.currentTarget.style.opacity = '1';
                  }
                }}
              >
                {loading ? 'Signing in...' : 'Login'}
              </button>
            </div>
          </form>
        </div>
      </div>
      
      {/* Right Side - Background Image */}
      <div style={{ 
        flex: '0 0 50%', 
        backgroundColor: '#2C2C2C',
        backgroundImage: 'url(/login-background.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        position: 'relative'
      }}>
        {/* Optional overlay for better text contrast if needed */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.1)' // Subtle dark overlay
        }} />
      </div>
    </div>
  );
}

// ============================================
// DASHBOARD SECTIONS
// ============================================

function ProfileSection({ clientInfo, profileData, editingProfile, setEditingProfile, brandCharcoal = '#2C2C2C', brandBrown = '#603f27', brandBlue = '#7693a9' }) {
  // Generate Member ID from email hash (or use existing ID if available)
  const generateMemberID = () => {
    if (clientInfo?.memberId) return clientInfo.memberId;
    if (clientInfo?.email) {
      // Simple hash-based ID generation (in production, this should come from backend)
      let hash = 0;
      for (let i = 0; i < clientInfo.email.length; i++) {
        hash = ((hash << 5) - hash) + clientInfo.email.charCodeAt(i);
        hash = hash & hash;
      }
      return 'MR' + Math.abs(hash).toString().padStart(6, '0');
    }
    return 'MR000000';
  };

  const memberId = generateMemberID();

  const [formData, setFormData] = useState({
    fullName: clientInfo?.fullName || '',
    companyName: clientInfo?.clientCompanyName || '',
    email: clientInfo?.email || '',
    phone: '',
    mailingAddress: '',
    birthday: '',
    favoriteRestaurant: '',
    favoriteBrand: '',
    favoriteFlower: '',
    favoriteColor: '',
    photo: null
  });

  // Update formData when clientInfo changes
  useEffect(() => {
    if (clientInfo) {
      setFormData(prev => ({
        ...prev,
        fullName: clientInfo.fullName || prev.fullName,
        companyName: clientInfo.clientCompanyName || prev.companyName,
        email: clientInfo.email || prev.email,
        phone: clientInfo.phone || prev.phone,
        mailingAddress: clientInfo.mailingAddress || prev.mailingAddress,
        birthday: clientInfo.birthday || prev.birthday,
        favoriteRestaurant: clientInfo.favoriteRestaurant || prev.favoriteRestaurant,
        favoriteBrand: clientInfo.favoriteBrand || prev.favoriteBrand,
        favoriteFlower: clientInfo.favoriteFlower || prev.favoriteFlower,
        favoriteColor: clientInfo.favoriteColor || prev.favoriteColor
      }));
    }
  }, [clientInfo]);

  const handleSave = async () => {
    // TODO: Implement API call to save profile
    console.log('Saving profile:', formData);
    setEditingProfile(false);
  };

  const InputField = ({ label, value, onChange, type = 'text', readOnly = false, placeholder = '', displayValue }) => {
    const inputStyle = {
      width: '100%',
      padding: '8px 0',
      border: 'none',
      borderBottom: editingProfile && !readOnly ? '1px solid #d1d5db' : '1px solid #e5e7eb',
      borderRadius: '0',
      fontSize: '15px',
      fontFamily: "'NeueHaasUnica', sans-serif",
      backgroundColor: 'transparent',
      color: readOnly ? '#999' : brandCharcoal,
      boxSizing: 'border-box',
      outline: 'none',
      transition: 'border-color 0.2s'
    };

    return (
      <div style={{ marginBottom: '24px' }}>
        <label style={{ 
          display: 'block', 
          fontSize: '13px', 
          fontWeight: '600', 
          marginBottom: '8px', 
          color: brandCharcoal,
          fontFamily: "'NeueHaasUnica', sans-serif",
          textTransform: 'uppercase',
          letterSpacing: '0.05em'
        }}>
          {label}
        </label>
        {editingProfile && !readOnly ? (
          type === 'textarea' ? (
            <textarea
              value={value || ''}
              onChange={onChange}
              rows={3}
              style={{
                ...inputStyle,
                resize: 'vertical',
                minHeight: '60px'
              }}
              placeholder={placeholder}
            />
          ) : (
            <input
              type={type}
              value={value || ''}
              onChange={onChange}
              style={inputStyle}
              placeholder={placeholder}
            />
          )
        ) : (
          <div style={{ 
            fontSize: '15px', 
            color: readOnly ? '#999' : brandCharcoal, 
            padding: '8px 0',
            borderBottom: '1px solid #e5e7eb',
            minHeight: '23px',
            whiteSpace: type === 'textarea' ? 'pre-line' : 'normal'
          }}>
            {displayValue !== undefined ? displayValue : (value || (readOnly ? memberId : 'Not set'))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: '64px', marginTop: '0', justifyContent: 'flex-start' }}>
        {/* Left Column - Profile Icon */}
        <div style={{ flex: '0 0 240px', flexShrink: 0 }}>
          <h2 style={{ 
            fontSize: '20px', 
            fontWeight: '300', 
            color: brandCharcoal,
            fontFamily: "'Domaine Text', serif",
            marginBottom: '32px',
            letterSpacing: '-0.01em'
          }}>
            Your Account
          </h2>
          <div style={{ 
            width: '240px', 
            height: '240px', 
            borderRadius: '8px', 
            backgroundColor: '#f3f4f6',
            border: '1px solid #e5e7eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden'
          }}>
            {formData.photo ? (
              <img src={formData.photo} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <svg width="140" height="140" viewBox="0 0 140 140" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="140" height="140" rx="8" fill="#f3f4f6"/>
                <circle cx="70" cy="55" r="22" stroke="#999" strokeWidth="2" fill="none"/>
                <path d="M35 110 Q35 85 70 85 Q105 85 105 110" stroke="#999" strokeWidth="2" fill="none"/>
              </svg>
            )}
          </div>
          {editingProfile && (
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onload = (event) => {
                    setFormData({ ...formData, photo: event.target.result });
                  };
                  reader.readAsDataURL(file);
                }
              }}
              style={{ 
                fontSize: '13px', 
                marginTop: '16px',
                fontFamily: "'NeueHaasUnica', sans-serif"
              }}
            />
          )}
        </div>

        {/* Right Column - Form Fields */}
        <div style={{ flex: '1', maxWidth: '600px', marginLeft: '120px' }}>
          {/* Reserve Member Details Section */}
          <div style={{ marginBottom: '48px' }}>
            <h3 style={{ 
              fontSize: '13px', 
              fontWeight: '600', 
              color: brandCharcoal,
              fontFamily: "'NeueHaasUnica', sans-serif",
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              marginBottom: '24px'
            }}>
              RESERVE MEMBER DETAILS
            </h3>
            
            <InputField
              label="Member ID"
              value={memberId}
              readOnly={true}
              displayValue={memberId}
            />
            
            <InputField
              label="Full Name"
              value={formData.fullName}
              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
            />
            
            <InputField
              label="Company Name"
              value={formData.companyName}
              onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
            />
            
            <InputField
              label="Email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              type="email"
            />
            
            <InputField
              label="Phone"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              type="tel"
            />
            
            <InputField
              label="Mailing Address"
              value={formData.mailingAddress}
              onChange={(e) => setFormData({ ...formData, mailingAddress: e.target.value })}
              type="textarea"
            />
            
            <InputField
              label="Birthday"
              value={formData.birthday}
              onChange={(e) => setFormData({ ...formData, birthday: e.target.value })}
              type="date"
            />
          </div>

          {/* Personal Interests Section */}
          <div>
            <h3 style={{ 
              fontSize: '13px', 
              fontWeight: '600', 
              color: brandCharcoal,
              fontFamily: "'NeueHaasUnica', sans-serif",
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              marginBottom: '24px'
            }}>
              PERSONAL INTERESTS
            </h3>
            
            <InputField
              label="Favorite Restaurant"
              value={formData.favoriteRestaurant}
              onChange={(e) => setFormData({ ...formData, favoriteRestaurant: e.target.value })}
            />
            
            <InputField
              label="Favorite Brand / Shop"
              value={formData.favoriteBrand}
              onChange={(e) => setFormData({ ...formData, favoriteBrand: e.target.value })}
            />
            
            <InputField
              label="Favorite Flower"
              value={formData.favoriteFlower}
              onChange={(e) => setFormData({ ...formData, favoriteFlower: e.target.value })}
            />
            
            <InputField
              label="Favorite Color"
              value={formData.favoriteColor}
              onChange={(e) => setFormData({ ...formData, favoriteColor: e.target.value })}
            />
          </div>
        </div>
      </div>

      {/* Edit/Save Buttons */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'flex-end', 
        gap: '12px', 
        marginTop: '64px',
        paddingTop: '0'
      }}>
        {!editingProfile ? (
            <button
              onClick={() => setEditingProfile(true)}
              style={{
                padding: '12px 24px',
                backgroundColor: brandBrown,
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600',
                fontFamily: "'NeueHaasUnica', sans-serif",
                letterSpacing: '-0.01em',
                transition: 'all 0.2s'
              }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = '0.9';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '1';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            Edit Profile
          </button>
        ) : (
          <>
            <button
              onClick={() => {
                setEditingProfile(false);
                setFormData({
                  fullName: clientInfo?.fullName || '',
                  companyName: clientInfo?.clientCompanyName || '',
                  email: clientInfo?.email || '',
                  phone: clientInfo?.phone || '',
                  mailingAddress: clientInfo?.mailingAddress || '',
                  birthday: clientInfo?.birthday || '',
                  favoriteRestaurant: clientInfo?.favoriteRestaurant || '',
                  favoriteBrand: clientInfo?.favoriteBrand || '',
                  favoriteFlower: clientInfo?.favoriteFlower || '',
                  favoriteColor: clientInfo?.favoriteColor || '',
                  photo: formData.photo
                });
              }}
              style={{
                padding: '12px 24px',
                backgroundColor: 'transparent',
                color: brandCharcoal,
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600',
                fontFamily: "'NeueHaasUnica', sans-serif",
                letterSpacing: '-0.01em',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = brandCharcoal;
                e.currentTarget.style.backgroundColor = '#f9fafb';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#d1d5db';
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              style={{
                padding: '12px 24px',
                backgroundColor: brandBrown,
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600',
                fontFamily: "'NeueHaasUnica', sans-serif",
                letterSpacing: '-0.01em',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = '0.9';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = '1';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              Save Changes
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function PerformanceSection({ spendData, proposals = [], brandCharcoal = '#2C2C2C' }) {
  const currentSpend = spendData?.totalSpend || 0;
  
  // Calculate product spend for each proposal (rental products + product care + service fees, excluding delivery and tax)
  const calculateProductSpend = (proposal) => {
    try {
      const sections = JSON.parse(proposal.sectionsJSON || '[]');
      let productSpend = 0;
      
      sections.forEach(section => {
        if (section.products && Array.isArray(section.products)) {
          section.products.forEach(product => {
            const quantity = parseFloat(product.quantity) || 0;
            const price = parseFloat(product.price) || 0;
            productSpend += quantity * price;
          });
        }
      });
      
      // Apply rental multiplier if available
      const duration = proposal.startDate && proposal.endDate ? 
        Math.ceil((new Date(proposal.endDate) - new Date(proposal.startDate)) / (1000 * 60 * 60 * 24)) + 1 : 1;
      const rentalMultiplier = proposal.customRentalMultiplier ? 
        parseFloat(proposal.customRentalMultiplier) : 
        (duration <= 1 ? 1 : duration <= 3 ? 1.5 : duration <= 7 ? 2 : 2.5);
      
      const extendedProductTotal = productSpend * rentalMultiplier;
      
      // Calculate discount first (applied to product total)
      const discountValue = parseFloat(proposal.discountValue || proposal.discount || 0) || 0;
      let discountType = 'percentage';
      if (proposal.discountName && proposal.discountName.startsWith('TYPE:')) {
        const match = proposal.discountName.match(/^TYPE:(\w+)/);
        if (match) discountType = match[1];
      }
      
      const discount = discountType === 'dollar' 
        ? discountValue 
        : extendedProductTotal * (discountValue / 100);
      
      // Apply discount to get rental total
      const rentalTotal = extendedProductTotal - discount;
      
      // Add product care fees (10% of extended product total)
      const productCareFee = extendedProductTotal * 0.1;
      
      // Add service fees (5% of rental total + product care, excluding delivery for product spend)
      const serviceFee = (rentalTotal + productCareFee) * 0.05;
      
      // Product spend = product total + product care + service fee - discount
      // This simplifies to: rentalTotal + productCareFee + serviceFee
      return rentalTotal + productCareFee + serviceFee;
    } catch (e) {
      console.error('Error calculating product spend:', e);
      return 0;
    }
  };
  
  // Get current year proposals for contributing projects
  const currentYear = new Date().getFullYear();
  const yearProposals = proposals.filter(p => {
    if (!p.startDate || p.status === 'Cancelled') return false;
    const proposalYear = new Date(p.startDate).getFullYear();
    return proposalYear === currentYear;
  }).sort((a, b) => new Date(b.startDate) - new Date(a.startDate));
  
  // Tier system: 15% at start, 20% at $50k, 25% at $100k
  const getCurrentTier = () => {
    if (currentSpend >= 100000) {
      return { discount: 25, tier: 'Founders Estate', nextTier: null, progress: 100 };
    } else if (currentSpend >= 50000) {
      return { discount: 20, tier: 'Inner Circle', nextTier: 'Founders Estate (25%)', progress: ((currentSpend - 50000) / 50000) * 100 };
    } else {
      return { discount: 15, tier: 'House Member', nextTier: 'Inner Circle (20%)', progress: (currentSpend / 50000) * 100 };
    }
  };

  const tier = getCurrentTier();

  return (
    <div>
      <h2 style={{ 
        fontSize: '28px', 
        fontWeight: '300', 
        color: brandCharcoal, 
        marginBottom: '32px',
        fontFamily: "'Domaine Text', serif",
        letterSpacing: '-0.02em'
      }}>
        Performance & Annual Spend
      </h2>
      
      {/* YTD Spend Card */}
      <div style={{ 
        backgroundColor: '#f9fafb', 
        padding: '28px', 
        borderRadius: '12px', 
        marginBottom: '32px',
        border: '1px solid #e5e7eb'
      }}>
        <div style={{ 
          fontSize: '11px', 
          fontWeight: '600', 
          color: '#666', 
          textTransform: 'uppercase', 
          letterSpacing: '0.1em', 
          marginBottom: '10px',
          fontFamily: "'NeueHaasUnica', sans-serif"
        }}>
          Year-to-Date Spend ({new Date().getFullYear()})
        </div>
        <div style={{ 
          fontSize: '48px', 
          fontWeight: '700', 
          color: brandCharcoal, 
          marginBottom: '10px',
          fontFamily: "'Domaine Text', serif",
          letterSpacing: '-0.03em',
          lineHeight: '1.1'
        }}>
          ${currentSpend.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        <div style={{ 
          fontSize: '14px', 
          color: '#666',
          fontFamily: "'NeueHaasUnica', sans-serif",
          fontWeight: '500'
        }}>
          {spendData?.proposalCount || 0} {spendData?.proposalCount === 1 ? 'proposal' : 'proposals'}
        </div>
      </div>

      {/* Tier Status */}
      <div style={{ 
        backgroundColor: 'white', 
        border: '2px solid #e5e7eb', 
        padding: '28px', 
        borderRadius: '12px', 
        marginBottom: '32px' 
      }}>
        <div style={{ 
          fontSize: '12px', 
          fontWeight: '600', 
          color: '#666',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          marginBottom: '10px',
          fontFamily: "'NeueHaasUnica', sans-serif"
        }}>
          Current Tier
        </div>
        <div style={{ 
          fontSize: '18px', 
          fontWeight: '600', 
          color: brandCharcoal, 
          marginBottom: '16px',
          fontFamily: "'NeueHaasUnica', sans-serif"
        }}>
          <span style={{ color: '#059669', fontSize: '20px' }}>{tier.tier}</span>
        </div>
        <div style={{ 
          fontSize: '36px', 
          fontWeight: '700', 
          color: brandCharcoal, 
          marginBottom: '10px',
          fontFamily: "'Domaine Text', serif",
          letterSpacing: '-0.02em'
        }}>
          {tier.discount}% Discount
        </div>
        {tier.nextTier && (
          <>
            <div style={{ 
              fontSize: '14px', 
              color: '#666', 
              marginBottom: '20px',
              fontFamily: "'NeueHaasUnica', sans-serif",
              fontWeight: '500'
            }}>
              Next Tier: <span style={{ color: brandCharcoal, fontWeight: '600' }}>{tier.nextTier}</span>
            </div>
            <div style={{ marginBottom: '12px' }}>
              <div style={{ 
                width: '100%', 
                height: '16px', 
                backgroundColor: '#e5e7eb', 
                borderRadius: '8px',
                overflow: 'hidden'
              }}>
                <div style={{
                  width: `${Math.min(tier.progress, 100)}%`,
                  height: '100%',
                  backgroundColor: brandCharcoal,
                  transition: 'width 0.5s ease',
                  borderRadius: '8px'
                }} />
              </div>
            </div>
            <div style={{ 
              fontSize: '13px', 
              color: '#666', 
              display: 'flex', 
              justifyContent: 'space-between',
              fontFamily: "'NeueHaasUnica', sans-serif",
              fontWeight: '500'
            }}>
              <span>${currentSpend.toLocaleString()}</span>
              <span>
                {tier.tier === 'House Member' ? '$50,000' : '$100,000'}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Tier Benefits */}
      <div>
        <h3 style={{ 
          fontSize: '18px', 
          fontWeight: '300', 
          color: brandCharcoal, 
          marginBottom: '24px',
          fontFamily: "'Domaine Text', serif",
          letterSpacing: '-0.01em'
        }}>
          Tier Benefits
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
          <div style={{ 
            padding: '28px', 
            backgroundColor: '#f9fafb', 
            borderRadius: '12px', 
            border: tier.tier === 'House Member' ? '2px solid ' + brandCharcoal : '1px solid #e5e7eb',
            transition: 'all 0.2s'
          }}>
            <div style={{ 
              fontSize: '13px', 
              fontWeight: '600', 
              color: brandCharcoal, 
              marginBottom: '12px',
              fontFamily: "'NeueHaasUnica', sans-serif",
              textTransform: 'uppercase',
              letterSpacing: '0.1em'
            }}>
              House Member
            </div>
            <div style={{ 
              fontSize: '28px', 
              fontWeight: '700', 
              color: brandCharcoal,
              fontFamily: "'Domaine Text', serif",
              letterSpacing: '-0.02em',
              marginBottom: '8px'
            }}>
              15%
            </div>
            <div style={{ 
              fontSize: '13px', 
              color: '#666',
              fontFamily: "'NeueHaasUnica', sans-serif"
            }}>
              Starting tier
            </div>
          </div>
          <div style={{ 
            padding: '28px', 
            backgroundColor: '#f9fafb', 
            borderRadius: '12px', 
            border: tier.tier === 'Inner Circle' ? '2px solid ' + brandCharcoal : '1px solid #e5e7eb',
            transition: 'all 0.2s'
          }}>
            <div style={{ 
              fontSize: '13px', 
              fontWeight: '600', 
              color: brandCharcoal, 
              marginBottom: '12px',
              fontFamily: "'NeueHaasUnica', sans-serif",
              textTransform: 'uppercase',
              letterSpacing: '0.1em'
            }}>
              Inner Circle
            </div>
            <div style={{ 
              fontSize: '28px', 
              fontWeight: '700', 
              color: brandCharcoal,
              fontFamily: "'Domaine Text', serif",
              letterSpacing: '-0.02em',
              marginBottom: '8px'
            }}>
              20%
            </div>
            <div style={{ 
              fontSize: '13px', 
              color: '#666',
              fontFamily: "'NeueHaasUnica', sans-serif"
            }}>
              At $50k spend
            </div>
          </div>
          <div style={{ 
            padding: '28px', 
            backgroundColor: '#f9fafb', 
            borderRadius: '12px', 
            border: tier.tier === 'Founders Estate' ? '2px solid ' + brandCharcoal : '1px solid #e5e7eb',
            transition: 'all 0.2s'
          }}>
            <div style={{ 
              fontSize: '13px', 
              fontWeight: '600', 
              color: brandCharcoal, 
              marginBottom: '12px',
              fontFamily: "'NeueHaasUnica', sans-serif",
              textTransform: 'uppercase',
              letterSpacing: '0.1em'
            }}>
              Founders Estate
            </div>
            <div style={{ 
              fontSize: '28px', 
              fontWeight: '700', 
              color: brandCharcoal,
              fontFamily: "'Domaine Text', serif",
              letterSpacing: '-0.02em',
              marginBottom: '8px'
            }}>
              25%
            </div>
            <div style={{ 
              fontSize: '13px', 
              color: '#666',
              fontFamily: "'NeueHaasUnica', sans-serif"
            }}>
              At $100k spend
            </div>
          </div>
        </div>
      </div>
      
      {/* Contributing Projects */}
      <div style={{ marginTop: '48px' }}>
        <h3 style={{ 
          fontSize: '20px', 
          fontWeight: '300', 
          color: brandCharcoal, 
          marginBottom: '24px',
          fontFamily: "'Domaine Text', serif",
          letterSpacing: '-0.01em'
        }}>
          Contributing Projects
        </h3>
        
        {yearProposals.length === 0 ? (
          <div style={{ 
            textAlign: 'center', 
            padding: '48px', 
            color: '#999',
            fontFamily: "'NeueHaasUnica', sans-serif",
            fontSize: '14px'
          }}>
            No projects found for {currentYear}.
          </div>
        ) : (
          <>
            <div style={{ 
              overflowX: 'auto',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              backgroundColor: 'white'
            }}>
              <table style={{ 
                width: '100%', 
                borderCollapse: 'collapse',
                fontFamily: "'NeueHaasUnica', sans-serif"
              }}>
                <thead>
                  <tr style={{ 
                    backgroundColor: '#f9fafb',
                    borderBottom: '2px solid #e5e7eb'
                  }}>
                    <th style={{ 
                      padding: '14px 16px', 
                      textAlign: 'left', 
                      fontSize: '12px',
                      fontWeight: '600',
                      color: brandCharcoal,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em'
                    }}>
                      Project Date
                    </th>
                    <th style={{ 
                      padding: '14px 16px', 
                      textAlign: 'left', 
                      fontSize: '12px',
                      fontWeight: '600',
                      color: brandCharcoal,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em'
                    }}>
                      Venue
                    </th>
                    <th style={{ 
                      padding: '14px 16px', 
                      textAlign: 'right', 
                      fontSize: '12px',
                      fontWeight: '600',
                      color: brandCharcoal,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em'
                    }}>
                      Total Invoice
                    </th>
                    <th style={{ 
                      padding: '14px 16px', 
                      textAlign: 'right', 
                      fontSize: '12px',
                      fontWeight: '600',
                      color: brandCharcoal,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em'
                    }}>
                      Product Spend
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {yearProposals.map((proposal, index) => {
                    const productSpend = calculateProductSpend(proposal);
                    const totalInvoice = calculateTotal(proposal);
                    return (
                      <tr 
                        key={index}
                        style={{ 
                          borderBottom: index < yearProposals.length - 1 ? '1px solid #e5e7eb' : 'none'
                        }}
                      >
                        <td style={{ 
                          padding: '14px 16px', 
                          fontSize: '14px',
                          color: brandCharcoal
                        }}>
                          {proposal.eventDate || (proposal.startDate ? new Date(proposal.startDate).toLocaleDateString('en-US', { 
                            year: 'numeric', 
                            month: 'short', 
                            day: 'numeric' 
                          }) : 'N/A')}
                        </td>
                        <td style={{ 
                          padding: '14px 16px', 
                          fontSize: '14px',
                          color: brandCharcoal,
                          fontWeight: '500'
                        }}>
                          {proposal.venueName || 'N/A'}
                        </td>
                        <td style={{ 
                          padding: '14px 16px', 
                          fontSize: '14px',
                          color: brandCharcoal,
                          textAlign: 'right',
                          fontFamily: "'NeueHaasUnica', sans-serif"
                        }}>
                          ${totalInvoice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td style={{ 
                          padding: '14px 16px', 
                          fontSize: '14px',
                          color: brandCharcoal,
                          textAlign: 'right',
                          fontFamily: "'NeueHaasUnica', sans-serif"
                        }}>
                          ${productSpend.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            
            {/* Footnote */}
            <div style={{ 
              marginTop: '20px',
              paddingTop: '16px',
              borderTop: '1px solid #e5e7eb'
            }}>
              <p style={{ 
                fontSize: '12px',
                color: '#666',
                fontFamily: "'NeueHaasUnica', sans-serif",
                lineHeight: '1.6',
                margin: 0,
                fontStyle: 'italic'
              }}>
                Total spend is compiled from rental product, product care fees, and service fees. It does not include delivery fees or tax.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ProposalsSection({ proposals, proposalTab, setProposalTab, setSelectedProposal, brandCharcoal = '#2C2C2C' }) {
  // Use same filtering logic as DashboardView - match how Contributing Projects filters
  const activeProposals = proposals.filter(p => 
    p.status === 'Pending' || p.status === 'Active' || (p.status === 'Approved' && isFutureDate(p.startDate)) || (p.status === 'Confirmed' && isFutureDate(p.startDate))
  );
  const completedProposals = proposals.filter(p => 
    (p.status === 'Approved' && isPastDate(p.startDate)) || (p.status === 'Completed') || (p.status === 'Confirmed' && isPastDate(p.startDate))
  );
  const cancelledProposals = proposals.filter(p => 
    p.status === 'Cancelled'
  );

  const getProposalsForTab = () => {
    switch (proposalTab) {
      case 'active': return activeProposals;
      case 'completed': return completedProposals;
      case 'cancelled': return cancelledProposals;
      default: return [];
    }
  };

  return (
    <div>
      <h2 style={{ 
        fontSize: '32px', 
        fontWeight: '300', 
        color: brandCharcoal, 
        marginBottom: '32px',
        fontFamily: "'Domaine Text', serif",
        letterSpacing: '-0.02em'
      }}>
        Proposals
      </h2>
      
      {/* Proposal Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', marginBottom: '24px' }}>
        {['active', 'completed', 'cancelled'].map((tab) => {
          const count = tab === 'active' ? activeProposals.length : tab === 'completed' ? completedProposals.length : cancelledProposals.length;
          return (
            <button
              key={tab}
              onClick={() => setProposalTab(tab)}
              style={{
                padding: '12px 24px',
                backgroundColor: proposalTab === tab ? '#f9fafb' : 'transparent',
                border: 'none',
                borderBottom: proposalTab === tab ? '2px solid ' + brandCharcoal : '2px solid transparent',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: proposalTab === tab ? '600' : '400',
                color: proposalTab === tab ? brandCharcoal : '#666',
                textTransform: 'capitalize'
              }}
            >
              {tab} ({count})
            </button>
          );
        })}
      </div>

      {/* Proposal List */}
      <div>
        {getProposalsForTab().length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px', color: '#999' }}>
            No {proposalTab} proposals found.
          </div>
        ) : (
          <div style={{ 
            overflowX: 'auto',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            backgroundColor: 'white'
          }}>
            <table style={{ 
              width: '100%', 
              borderCollapse: 'collapse',
              fontFamily: "'NeueHaasUnica', sans-serif"
            }}>
              <thead>
                <tr style={{ 
                  backgroundColor: '#f9fafb',
                  borderBottom: '2px solid #e5e7eb'
                }}>
                  <th style={{ 
                    padding: '14px 16px', 
                    textAlign: 'left', 
                    fontSize: '12px',
                    fontWeight: '600',
                    color: brandCharcoal,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>
                    Project Date(s)
                  </th>
                  <th style={{ 
                    padding: '14px 16px', 
                    textAlign: 'left', 
                    fontSize: '12px',
                    fontWeight: '600',
                    color: brandCharcoal,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>
                    Venue
                  </th>
                  <th style={{ 
                    padding: '14px 16px', 
                    textAlign: 'right', 
                    fontSize: '12px',
                    fontWeight: '600',
                    color: brandCharcoal,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>
                    Project Total
                  </th>
                  <th style={{ 
                    padding: '14px 16px', 
                    textAlign: 'left', 
                    fontSize: '12px',
                    fontWeight: '600',
                    color: brandCharcoal,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {getProposalsForTab().map((proposal, index) => {
                  const total = calculateTotal(proposal);
                  const dateRange = formatDateRange(proposal);
                  return (
                    <tr 
                      key={proposal.id || index}
                      onClick={() => setSelectedProposal(proposal)}
                      style={{ 
                        borderBottom: index < getProposalsForTab().length - 1 ? '1px solid #e5e7eb' : 'none',
                        cursor: 'pointer',
                        transition: 'background-color 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#f9fafb';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'white';
                      }}
                    >
                      <td style={{ 
                        padding: '14px 16px', 
                        fontSize: '14px',
                        color: brandCharcoal
                      }}>
                        {dateRange || (proposal.startDate ? new Date(proposal.startDate).toLocaleDateString('en-US', { 
                          year: 'numeric', 
                          month: 'short', 
                          day: 'numeric' 
                        }) : 'N/A')}
                      </td>
                      <td style={{ 
                        padding: '14px 16px', 
                        fontSize: '14px',
                        color: brandCharcoal,
                        fontWeight: '500'
                      }}>
                        {proposal.venueName || 'N/A'}
                      </td>
                      <td style={{ 
                        padding: '14px 16px', 
                        fontSize: '14px',
                        color: brandCharcoal,
                        textAlign: 'right',
                        fontFamily: "'NeueHaasUnica', sans-serif"
                      }}>
                        ${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td style={{ 
                        padding: '14px 16px', 
                        fontSize: '14px'
                      }}>
                        <span style={{ 
                          display: 'inline-block',
                          padding: '6px 12px',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: '500',
                          backgroundColor: proposal.status === 'Approved' || proposal.status === 'Confirmed' ? '#d1fae5' : 
                                         proposal.status === 'Pending' ? '#fef3c7' : 
                                         proposal.status === 'Cancelled' ? '#fee2e2' : '#e5e7eb',
                          color: proposal.status === 'Approved' || proposal.status === 'Confirmed' ? '#065f46' :
                                 proposal.status === 'Pending' ? '#92400e' : 
                                 proposal.status === 'Cancelled' ? '#991b1b' : '#666'
                        }}>
                          {proposal.status || 'Pending'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function ResourcesSection({ brandCharcoal = '#2C2C2C' }) {
  // TODO: Fetch resources from API
  const resources = [
    { name: 'Rental Product Catalog', type: 'PNG', category: 'Products' },
    // Add more resources as needed
  ];

  return (
    <div>
      <h2 style={{ 
        fontSize: '32px', 
        fontWeight: '300', 
        color: brandCharcoal, 
        marginBottom: '32px',
        fontFamily: "'Domaine Text', serif",
        letterSpacing: '-0.02em'
      }}>
        Resources
      </h2>
      
      <div style={{ marginBottom: '24px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: '300', color: brandCharcoal, marginBottom: '16px', fontFamily: "'Domaine Text', serif" }}>Downloadable Product Images</h3>
        <p style={{ fontSize: '14px', color: '#666', marginBottom: '24px' }}>
          Download PNG images of all rental products for your reference.
        </p>
        
        {resources.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px', color: '#999' }}>
            No resources available at this time.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '16px' }}>
            {resources.map((resource, index) => (
              <div
                key={index}
                style={{
                  padding: '20px',
                  backgroundColor: '#f9fafb',
                  borderRadius: '8px',
                  border: '1px solid #e5e7eb',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div>
                  <div style={{ fontSize: '16px', fontWeight: '600', color: brandCharcoal, marginBottom: '4px' }}>
                    {resource.name}
                  </div>
                  <div style={{ fontSize: '14px', color: '#666' }}>
                    {resource.type} • {resource.category}
                  </div>
                </div>
                <button
                  style={{
                    padding: '10px 20px',
                    backgroundColor: brandCharcoal,
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500'
                  }}
                >
                  Download
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// DASHBOARD VIEW
// ============================================

function DashboardView({ clientInfo, onLogout }) {
  const [proposals, setProposals] = useState([]);
  const [spendData, setSpendData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeSection, setActiveSection] = useState('profile'); // 'profile', 'performance', 'proposals', 'resources', 'activity', 'contact'
  const [proposalTab, setProposalTab] = useState('active'); // For proposals section
  const [selectedProposal, setSelectedProposal] = useState(null);
  const [profileData, setProfileData] = useState(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [logoError, setLogoError] = useState(false);
  
  useEffect(() => {
    fetchData();
  }, []);
  
  const fetchData = async (retryCount = 0) => {
    try {
      setLoading(true);
      setError(null);
      
      // Get current session from localStorage
      const session = authService.getSession();
      if (!session || !session.token) {
        console.error('No session found in localStorage');
        setError('Not authenticated. Please log in again.');
        setLoading(false);
        // Clear invalid session
        authService.logout();
        return;
      }
      
      // Diagnostic information about the token
      const tokenDiagnostics = authService.diagnoseToken();
      console.log('Token Diagnostics:', tokenDiagnostics);
      console.log('Current session from localStorage:', {
        token: session.token.substring(0, 20) + '...',
        tokenLength: session.token.length,
        hasToken: !!session.token,
        clientInfo: session.clientInfo
      });
      
      // Log the full token for debugging (only in development)
      if (process.env.NODE_ENV === 'development') {
        console.log('Full token for debugging:', session.token);
      }
      
      // Add delay on first fetch to ensure Apps Script has written the session
      if (retryCount === 0) {
        console.log('Waiting for session to be ready in Apps Script...');
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
      }
      
      // Validate session first (with retry logic)
      let validationSuccess = false;
      let validationAttempts = 0;
      const maxValidationAttempts = 3;
      
      while (!validationSuccess && validationAttempts < maxValidationAttempts) {
        try {
          console.log(`Validating session (attempt ${validationAttempts + 1}/${maxValidationAttempts})...`);
          const validationResult = await apiService.validateSession();
          console.log('Session validated successfully:', validationResult);
          validationSuccess = true;
        } catch (validationError) {
          validationAttempts++;
          console.error(`Session validation failed (attempt ${validationAttempts}):`, validationError);
          
          if (validationAttempts < maxValidationAttempts) {
            // Wait before retrying (exponential backoff)
            const delay = Math.min(1000 * Math.pow(2, validationAttempts), 5000);
            console.log(`Retrying validation in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          } else {
            // All validation attempts failed
            console.error('All session validation attempts failed');
            const tokenDiagnostics = authService.diagnoseToken();
            console.error('=== TOKEN DIAGNOSTICS ===');
            console.error('Token being used:', tokenDiagnostics.token);
            console.error('Token length:', tokenDiagnostics.length);
            console.error('Token format:', tokenDiagnostics.format);
            console.error('Has whitespace:', tokenDiagnostics.hasWhitespace);
            console.error('========================');
            console.error('TROUBLESHOOTING STEPS:');
            console.error('1. Open your Google Sheet (Clients sheet)');
            console.error('2. Check column J (SessionToken) for the row matching your email');
            console.error('3. Verify the token matches exactly:', tokenDiagnostics.token);
            console.error('4. Check Apps Script execution logs for any errors during login');
            console.error('5. Try logging out and logging back in');
            throw new Error('Session validation failed. Please log out and log back in.');
          }
        }
      }
      
      console.log('Fetching proposals and spend data...');
      // Fetch proposals and spend data in parallel
      const [proposalsResult, spendResult] = await Promise.all([
        apiService.getProposals(),
        apiService.getSpend(new Date().getFullYear())
      ]);
      
      console.log('Data fetched successfully:', { 
        proposalsCount: proposalsResult.proposals?.length || 0,
        spendTotal: spendResult.totalSpend 
      });
      
      setProposals(proposalsResult.proposals || []);
      setSpendData(spendResult);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching data:', err);
      
      // If session expired or invalid, try once more after a longer delay
      if (err.message && (err.message.includes('Invalid or expired session') || err.message.includes('Not authenticated') || err.message.includes('Session validation failed'))) {
        if (retryCount === 0) {
          // Retry once after a longer delay
          console.log('Session error, retrying after longer delay...');
          setTimeout(() => {
            console.log('Retrying fetch...');
            fetchData(1);
          }, 3000);
          return;
        } else {
          // Second failure - show error with diagnostic info
          console.error('Session invalid after retry');
          const tokenDiagnostics = authService.diagnoseToken();
          console.error('Token diagnostics:', tokenDiagnostics);
          console.error('This token should be in the Clients sheet, column J (SessionToken)');
          console.error('Please check:');
          console.error('1. Is the token in column J of the Clients sheet?');
          console.error('2. Does it match exactly (including dashes)?');
          console.error('3. Is there any whitespace around it?');
          console.error('4. Check Apps Script execution logs for errors during login');
          
          setError(
            'Session validation failed. The token may not have been saved correctly. ' +
            'Please log out and log back in. If the problem persists, check the Apps Script logs.'
          );
          setLoading(false);
          // Clear invalid session
          authService.logout();
          return;
        }
      }
      
      setError(err.message || 'Failed to load data');
      setLoading(false);
    }
  };
  
  // Filter proposals by status
  const activeProposals = proposals.filter(p => 
    p.status === 'Pending' || (p.status === 'Approved' && isFutureDate(p.startDate))
  );
  
  const completedProposals = proposals.filter(p => 
    p.status === 'Approved' && isPastDate(p.startDate)
  );
  
  const cancelledProposals = proposals.filter(p => 
    p.status === 'Cancelled'
  );
  
  const brandCharcoal = '#2C2C2C';
  const brandBrown = '#603f27';
  const brandBlue = '#7693a9';
  
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#fafaf8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontSize: '16px', color: brandCharcoal }}>Loading...</p>
      </div>
    );
  }
  
  if (error) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#fafaf8', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <div style={{ backgroundColor: 'white', padding: '32px', borderRadius: '8px', maxWidth: '500px', textAlign: 'center' }}>
          <p style={{ fontSize: '16px', color: '#dc2626', marginBottom: '16px' }}>Error: {error}</p>
          <button onClick={fetchData} style={{ padding: '10px 20px', backgroundColor: brandCharcoal, color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
            Retry
          </button>
        </div>
      </div>
    );
  }
  
  if (selectedProposal) {
    return (
      <ProposalDetailView 
        proposal={selectedProposal} 
        onBack={() => setSelectedProposal(null)}
        onLogout={onLogout}
      />
    );
  }
  
  // Map navigation sections
  const navigationSections = [
    { key: 'overview', label: 'OVERVIEW', section: 'performance' },
    { key: 'activity', label: 'ACTIVITY', section: 'activity' },
    { key: 'projects', label: 'PROJECTS', section: 'proposals' },
    { key: 'account', label: 'ACCOUNT', section: 'profile' },
    { key: 'resources', label: 'RESOURCES', section: 'resources' },
    { key: 'contact', label: 'CONTACT', section: 'contact' }
  ];

  const getCurrentNavKey = () => {
    const navItem = navigationSections.find(nav => nav.section === activeSection);
    return navItem ? navItem.key : 'account';
  };

  const handleNavClick = (section) => {
    if (section === 'contact') {
      // TODO: Implement contact section
      alert('Contact section coming soon');
      return;
    }
    if (section === 'activity') {
      // TODO: Implement activity section
      alert('Activity section coming soon');
      return;
    }
    setActiveSection(section);
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#fafaf8', display: 'flex', flexDirection: 'column' }}>
      {/* Fonts are loaded via index.css */}
      
      {/* Header */}
      <div style={{ backgroundColor: 'white', borderBottom: '1px solid #e5e7eb', padding: '20px 32px' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
            {/* Mayker Reserve Logo */}
            {logoError ? (
              <div style={{ 
                fontSize: '18px', 
                fontWeight: '400', 
                color: brandCharcoal,
                fontFamily: "'NeueHaasUnica', sans-serif",
                letterSpacing: '-0.01em'
              }}>
                MAYKER <span style={{ fontStyle: 'italic', fontFamily: "'Domaine Text', serif" }}>reserve</span>
              </div>
            ) : (
              <img 
                src={encodeURI('/Mayker Reserve - Black – 2.png')}
                alt="MAYKER reserve" 
                style={{ 
                  height: '48px', 
                  width: 'auto',
                  maxWidth: '300px',
                  display: 'block'
                }}
                onLoad={() => {
                  console.log('✅ Logo loaded successfully');
                }}
                onError={(e) => {
                  console.error('❌ Logo failed to load:', e.target.src);
                  console.log('Trying fallback paths...');
                  // Try alternative paths
                  const alternatives = [
                    '/Mayker Reserve - Black - 2.png', // Regular hyphen
                    '/mayker_icon-black.png', // Icon as fallback
                  ];
                  const currentSrc = e.target.src;
                  const triedIndex = alternatives.findIndex(alt => currentSrc.includes(alt.replace(/\s+/g, ' ')));
                  if (triedIndex < alternatives.length - 1) {
                    e.target.src = alternatives[triedIndex + 1];
                    console.log('Trying:', alternatives[triedIndex + 1]);
                  } else {
                    console.log('All logo paths failed, showing text fallback');
                    setLogoError(true);
                  }
                }}
              />
            )}
          </div>
          <div style={{ 
            fontSize: '16px', 
            fontWeight: '500', 
            color: brandCharcoal,
            fontFamily: "'NeueHaasUnica', sans-serif",
            letterSpacing: '0.05em',
            textTransform: 'uppercase'
          }}>
            MEMBER PORTAL
          </div>
        </div>
      </div>
      
      {/* Main Content */}
      <div style={{ flex: '1', maxWidth: '1400px', margin: '0 auto', width: '100%', padding: '48px 32px' }}>
        {/* Content Area */}
        <div style={{ 
          backgroundColor: 'white', 
          borderRadius: '0', 
          padding: '48px', 
          minHeight: '500px',
          marginBottom: '48px'
        }}>
          {activeSection === 'profile' && (
            <ProfileSection 
              clientInfo={clientInfo} 
              profileData={profileData}
              editingProfile={editingProfile}
              setEditingProfile={setEditingProfile}
              brandCharcoal={brandCharcoal}
              brandBrown={brandBrown}
              brandBlue={brandBlue}
            />
          )}
          
          {activeSection === 'performance' && (
            <PerformanceSection 
              spendData={spendData}
              proposals={proposals}
              brandCharcoal={brandCharcoal}
            />
          )}
          
          {activeSection === 'proposals' && (
            <ProposalsSection
              proposals={proposals}
              proposalTab={proposalTab}
              setProposalTab={setProposalTab}
              setSelectedProposal={setSelectedProposal}
              brandCharcoal={brandCharcoal}
            />
          )}
          
          {activeSection === 'resources' && (
            <ResourcesSection brandCharcoal={brandCharcoal} />
          )}
        </div>

        {/* Navigation Buttons - Bottom of Page */}
        <div style={{ 
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '12px',
          maxWidth: '800px',
          margin: '0 auto'
        }}>
          {navigationSections.map((nav) => {
            const isActive = getCurrentNavKey() === nav.key;
            return (
              <button
                key={nav.key}
                onClick={() => handleNavClick(nav.section)}
                style={{
                  padding: '16px 24px',
                  backgroundColor: isActive ? brandBlue : '#e8eef4',
                  color: isActive ? 'white' : brandCharcoal,
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: '600',
                  fontFamily: "'NeueHaasUnica', sans-serif",
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = '#d4dfe8';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = '#e8eef4';
                  }
                }}
              >
                {nav.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div style={{ 
        backgroundColor: brandBrown,
        padding: '32px',
        marginTop: 'auto'
      }}>
        <div style={{ 
          maxWidth: '1400px', 
          margin: '0 auto', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center' 
        }}>
          <div style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '8px',
            color: 'white',
            fontFamily: "'NeueHaasUnica', sans-serif",
            fontSize: '14px',
            fontWeight: '500'
          }}>
            <div>EVENTS@MAYKER.COM</div>
            <div>(615) 970-1244</div>
          </div>
          <img 
            src="/mayker_icon-whisper.png" 
            alt="Mayker Reserve" 
            style={{ 
              width: '60px', 
              height: '60px',
              objectFit: 'contain'
            }}
            onLoad={() => {
              console.log('✅ Footer icon loaded successfully');
            }}
            onError={(e) => {
              console.error('❌ Footer icon failed to load:', e.target.src);
              // Fallback to text if image fails
              e.target.style.display = 'none';
              const fallback = document.createElement('div');
              fallback.style.cssText = 'width: 60px; height: 60px; background-color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: 600; color: ' + brandBrown + '; font-family: "Domaine Text", serif;';
              fallback.textContent = 'M';
              e.target.parentElement.appendChild(fallback);
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ============================================
// PROPOSAL DETAIL VIEW
// ============================================

function ProposalDetailView({ proposal, onBack, onLogout }) {
  const brandCharcoal = '#2C2C2C';
  
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#fafaf8' }}>
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap');
        * { font-family: 'Inter', sans-serif; }
      ` }} />
      
      {/* Header */}
      <div style={{ backgroundColor: 'white', borderBottom: '1px solid #e5e7eb', padding: '16px 24px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button 
            onClick={onBack}
            style={{ padding: '8px 16px', backgroundColor: '#f3f4f6', color: brandCharcoal, border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}
          >
            ← Back to Dashboard
          </button>
          <button 
            onClick={onLogout}
            style={{ padding: '8px 16px', backgroundColor: '#f3f4f6', color: brandCharcoal, border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}
          >
            Sign Out
          </button>
        </div>
      </div>
      
      {/* Proposal Content */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ backgroundColor: 'white', padding: '32px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)' }}>
          <h1 style={{ fontSize: '24px', fontWeight: '600', color: brandCharcoal, marginBottom: '24px' }}>
            {proposal.venueName || 'Proposal Details'}
          </h1>
          
          <div style={{ marginBottom: '24px' }}>
            <div style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>Event Date</div>
            <div style={{ fontSize: '16px', color: brandCharcoal }}>{formatDateRange(proposal)}</div>
          </div>
          
          <div style={{ marginBottom: '24px' }}>
            <div style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>Location</div>
            <div style={{ fontSize: '16px', color: brandCharcoal }}>{proposal.venueName}, {proposal.city}, {proposal.state}</div>
          </div>
          
          <div style={{ marginBottom: '24px' }}>
            <div style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>Status</div>
            <div style={{ 
              display: 'inline-block',
              padding: '6px 16px',
              borderRadius: '4px',
              fontSize: '14px',
              fontWeight: '500',
              backgroundColor: proposal.status === 'Approved' ? '#d1fae5' : 
                             proposal.status === 'Pending' ? '#fef3c7' : '#fee2e2',
              color: proposal.status === 'Approved' ? '#065f46' :
                     proposal.status === 'Pending' ? '#92400e' : '#991b1b'
            }}>
              {proposal.status}
            </div>
          </div>
          
          <div style={{ marginTop: '32px', paddingTop: '24px', borderTop: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: '18px', fontWeight: '600', color: brandCharcoal, marginBottom: '16px' }}>Total</div>
            <div style={{ fontSize: '32px', fontWeight: '600', color: brandCharcoal }}>
              ${calculateTotal(proposal).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          
          <div style={{ marginTop: '32px', padding: '16px', backgroundColor: '#f9fafb', borderRadius: '6px', fontSize: '14px', color: '#666' }}>
            Full proposal details view coming soon. This will show the complete proposal similar to the admin view.
          </div>
        </div>
      </div>
    </div>
  );
}

