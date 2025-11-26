import React, { useState, useEffect } from 'react';

// ============================================
// CONFIGURATION
// ============================================

// Update this with your Client Apps Script Web App URL
const CLIENT_API_URL = 'https://script.google.com/macros/s/AKfycbyQ3SzfXgsnm0lxsBZvVpqSF5L-kUtnmT6x7S9kXRGdfocxFBLzDeF3PvrSEGZ8LoxL/exec';

// ============================================
// AUTHENTICATION SERVICE
// ============================================

const authService = {
  // Login
  async login(email, password) {
    try {
      const response = await fetch(CLIENT_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          action: 'login',
          email: email,
          password: password
        }),
        mode: 'cors'
      });
      
      if (!response.ok) {
        console.error('Login HTTP error:', response.status, response.statusText);
        return { success: false, error: `Server error: ${response.status}` };
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
    return !!localStorage.getItem('clientToken');
  }
};

// ============================================
// API SERVICE
// ============================================

const apiService = {
  // Make authenticated request
  async request(action, params = {}) {
    const session = authService.getSession();
    if (!session) {
      throw new Error('Not authenticated');
    }
    
    const url = new URL(CLIENT_API_URL);
    url.searchParams.set('action', action);
    url.searchParams.set('token', session.token);
    
    Object.keys(params).forEach(key => {
      url.searchParams.set(key, params[key]);
    });
    
    // Add a small delay to ensure session is stored (Apps Script can be slow)
    await new Promise(resolve => setTimeout(resolve, 100));
    
    console.log('Making API request:', { action, token: session.token.substring(0, 20) + '...', url: url.toString().substring(0, 100) + '...' });
    
    const response = await fetch(url.toString(), {
      method: 'GET',
      mode: 'cors',
      cache: 'no-cache',
      headers: {
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      console.error('HTTP error:', response.status, response.statusText);
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    let data;
    let text;
    try {
      text = await response.text();
      console.log('API response text (full):', text);
      console.log('Response length:', text.length);
      console.log('Response starts with:', text.substring(0, 50));
      
      // Google Apps Script Web Apps sometimes wrap JSON in HTML comments
      // Try to extract JSON if wrapped
      let jsonText = text.trim();
      if (jsonText.startsWith('<!--') && jsonText.includes('-->')) {
        const jsonMatch = jsonText.match(/<!--([\s\S]*?)-->/);
        if (jsonMatch) {
          jsonText = jsonMatch[1].trim();
          console.log('Extracted JSON from HTML comment:', jsonText.substring(0, 100));
        }
      }
      
      data = JSON.parse(jsonText);
    } catch (error) {
      console.error('Failed to parse response:', error);
      console.error('Response text that failed to parse:', text);
      console.error('Response type:', typeof text);
      throw new Error('Invalid response from server: ' + error.message);
    }
    
    console.log('API response data:', data);
    console.log('Response success:', data.success);
    console.log('Response error:', data.error);
    
    if (!data || typeof data !== 'object') {
      console.error('Invalid response format:', data);
      throw new Error('Invalid response format from server');
    }
    
    if (!data.success) {
      // Log the error for debugging
      const errorMsg = data.error || data.message || data.toString() || 'Request failed';
      console.error('API Error Details:', {
        error: errorMsg,
        action: action,
        token: session.token.substring(0, 10) + '...',
        fullResponse: data,
        responseKeys: Object.keys(data)
      });
      throw new Error(errorMsg);
    }
    
    return data;
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
      
      if (result.success) {
        console.log('Setting authentication state');
        setClientInfo({
          email: result.data.email,
          clientCompanyName: result.data.clientCompanyName,
          fullName: result.data.fullName
        });
        setIsAuthenticated(true);
        console.log('Authentication state set, isAuthenticated should be true');
        
        // Wait a moment, then validate the session to ensure it's stored
        setTimeout(async () => {
          try {
            console.log('Validating session...');
            await apiService.validateSession();
            console.log('Session validated successfully');
          } catch (err) {
            console.error('Session validation failed:', err);
          }
        }, 500);
        
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
          font-family: 'NeueHaasUnica', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
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
              alt="MAYKER Reserve" 
              style={{ height: '60px', width: 'auto', marginBottom: '24px' }}
              onError={(e) => {
                // Fallback if image not found
                e.target.style.display = 'none';
              }}
            />
            {/* Logo Text */}
            <img 
              src="/Mayker Reserve - Black - 2.png" 
              alt="MAYKER Reserve" 
              style={{ height: '50px', width: 'auto', marginBottom: '16px' }}
              onError={(e) => {
                // Fallback to text if image not found
                e.target.style.display = 'none';
                const fallback = e.target.nextElementSibling;
                if (fallback) fallback.style.display = 'block';
              }}
            />
            <h1 style={{ 
              fontSize: '32px', 
              fontWeight: '600', 
              color: brandCharcoal, 
              margin: '0 0 8px 0',
              letterSpacing: '0.5px',
              display: 'none', // Hidden by default, shown as fallback
              fontFamily: "'Domaine Text', serif"
            }}>
              Mayker Reserve
            </h1>
            <p style={{ 
              fontSize: '16px', 
              color: '#666', 
              margin: '0',
              fontWeight: '400',
              textTransform: 'lowercase',
              fontFamily: "'NeueHaasUnica', sans-serif"
            }}>
              Client portal
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
                  padding: '14px',
                  backgroundColor: 'transparent',
                  color: brandCharcoal,
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '15px',
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
                  padding: '14px',
                  backgroundColor: brandCharcoal,
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '15px',
                  fontWeight: '500',
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
// DASHBOARD VIEW
// ============================================

function DashboardView({ clientInfo, onLogout }) {
  const [proposals, setProposals] = useState([]);
  const [spendData, setSpendData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('active');
  const [selectedProposal, setSelectedProposal] = useState(null);
  
  useEffect(() => {
    fetchData();
  }, []);
  
  const fetchData = async (retryCount = 0) => {
    let isRetrying = false;
    
    try {
      setLoading(true);
      setError(null);
      
      // Add a longer delay on first fetch to ensure Apps Script session is ready
      if (retryCount === 0) {
        console.log('Waiting for session to be ready...');
        const session = authService.getSession();
        console.log('Current session from localStorage:', {
          token: session?.token?.substring(0, 20) + '...',
          hasToken: !!session?.token,
          clientInfo: session?.clientInfo
        });
        
        await new Promise(resolve => setTimeout(resolve, 3000)); // Increased delay
        
        // First, validate the session before fetching data
        try {
          console.log('Validating session before fetching data...');
          const validationResult = await apiService.validateSession();
          console.log('Session validated successfully:', validationResult);
        } catch (validationError) {
          console.error('Session validation failed:', validationError);
          console.error('Validation error details:', {
            message: validationError.message,
            stack: validationError.stack
          });
          throw validationError;
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
      if (err.message && (err.message.includes('Invalid or expired session') || err.message.includes('Not authenticated'))) {
        if (retryCount === 0) {
          // Retry once after a longer delay
          isRetrying = true;
          console.log('Session error, retrying after longer delay...');
          setTimeout(() => {
            console.log('Retrying fetch...');
            fetchData(1);
          }, 2000);
          return;
        } else {
          // Second failure - show error instead of redirecting
          console.error('Session invalid after retry');
          setError('Session expired. Please log out and log back in.');
          setLoading(false);
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
  const brandTaupe = '#545142';
  
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
  
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#fafaf8' }}>
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap');
        * { font-family: 'Inter', sans-serif; }
      ` }} />
      
      {/* Header */}
      <div style={{ backgroundColor: 'white', borderBottom: '1px solid #e5e7eb', padding: '16px 24px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <img 
              src="/mayker_wordmark-events-black.svg" 
              alt="MAYKER EVENTS" 
              style={{ height: '32px', width: 'auto' }}
              onError={(e) => {
                if (!e.target.src.includes('/assets/')) {
                  e.target.src = '/assets/mayker_wordmark-events-black.svg';
                } else {
                  e.target.style.display = 'none';
                }
              }}
            />
            <div>
              <div style={{ fontSize: '18px', fontWeight: '600', color: brandCharcoal }}>{clientInfo?.clientCompanyName}</div>
              <div style={{ fontSize: '12px', color: '#666' }}>Welcome, {clientInfo?.fullName}</div>
            </div>
          </div>
          <button 
            onClick={onLogout}
            style={{ padding: '8px 16px', backgroundColor: '#f3f4f6', color: brandCharcoal, border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}
          >
            Sign Out
          </button>
        </div>
      </div>
      
      {/* Main Content */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 24px' }}>
        {/* Yearly Spend Card */}
        <div style={{ backgroundColor: 'white', padding: '32px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)', marginBottom: '32px' }}>
          <h2 style={{ fontSize: '14px', fontWeight: '500', color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '16px' }}>
            Year-to-Date Spend ({new Date().getFullYear()})
          </h2>
          <div style={{ fontSize: '48px', fontWeight: '600', color: brandCharcoal }}>
            ${spendData?.totalSpend?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
          </div>
          <div style={{ fontSize: '14px', color: '#666', marginTop: '8px' }}>
            {spendData?.proposalCount || 0} {spendData?.proposalCount === 1 ? 'proposal' : 'proposals'}
          </div>
        </div>
        
        {/* Proposal Tabs */}
        <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb' }}>
            <button
              onClick={() => setActiveTab('active')}
              style={{
                flex: 1,
                padding: '16px',
                backgroundColor: activeTab === 'active' ? '#f9fafb' : 'white',
                border: 'none',
                borderBottom: activeTab === 'active' ? '2px solid ' + brandCharcoal : '2px solid transparent',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: activeTab === 'active' ? '600' : '400',
                color: activeTab === 'active' ? brandCharcoal : '#666'
              }}
            >
              Active ({activeProposals.length})
            </button>
            <button
              onClick={() => setActiveTab('completed')}
              style={{
                flex: 1,
                padding: '16px',
                backgroundColor: activeTab === 'completed' ? '#f9fafb' : 'white',
                border: 'none',
                borderBottom: activeTab === 'completed' ? '2px solid ' + brandCharcoal : '2px solid transparent',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: activeTab === 'completed' ? '600' : '400',
                color: activeTab === 'completed' ? brandCharcoal : '#666'
              }}
            >
              Completed ({completedProposals.length})
            </button>
            <button
              onClick={() => setActiveTab('cancelled')}
              style={{
                flex: 1,
                padding: '16px',
                backgroundColor: activeTab === 'cancelled' ? '#f9fafb' : 'white',
                border: 'none',
                borderBottom: activeTab === 'cancelled' ? '2px solid ' + brandCharcoal : '2px solid transparent',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: activeTab === 'cancelled' ? '600' : '400',
                color: activeTab === 'cancelled' ? brandCharcoal : '#666'
              }}
            >
              Cancelled ({cancelledProposals.length})
            </button>
          </div>
          
          {/* Proposal List */}
          <div style={{ padding: '24px' }}>
            {(() => {
              const currentProposals = activeTab === 'active' ? activeProposals :
                                     activeTab === 'completed' ? completedProposals :
                                     cancelledProposals;
              
              if (currentProposals.length === 0) {
                return (
                  <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
                    No {activeTab} proposals found.
                  </div>
                );
              }
              
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {currentProposals.map((proposal, index) => (
                    <div
                      key={index}
                      onClick={() => setSelectedProposal(proposal)}
                      style={{
                        padding: '20px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        backgroundColor: 'white'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = brandCharcoal;
                        e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = '#e5e7eb';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '18px', fontWeight: '600', color: brandCharcoal, marginBottom: '8px' }}>
                            {proposal.venueName || 'Untitled Proposal'}
                          </div>
                          <div style={{ fontSize: '14px', color: '#666', marginBottom: '4px' }}>
                            {formatDateRange(proposal)}
                          </div>
                          <div style={{ fontSize: '14px', color: '#666' }}>
                            {proposal.city}, {proposal.state}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '20px', fontWeight: '600', color: brandCharcoal, marginBottom: '4px' }}>
                            ${calculateTotal(proposal).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                          <div style={{ 
                            display: 'inline-block',
                            padding: '4px 12px',
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: '500',
                            backgroundColor: proposal.status === 'Approved' ? '#d1fae5' : 
                                           proposal.status === 'Pending' ? '#fef3c7' : '#fee2e2',
                            color: proposal.status === 'Approved' ? '#065f46' :
                                   proposal.status === 'Pending' ? '#92400e' : '#991b1b'
                          }}>
                            {proposal.status}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
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

