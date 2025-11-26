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
      
      const data = await response.json();
      
      if (data.success) {
        // Store session in localStorage
        localStorage.setItem('clientToken', data.token);
        localStorage.setItem('clientInfo', JSON.stringify({
          email: data.email,
          clientCompanyName: data.clientCompanyName,
          fullName: data.fullName
        }));
        return { success: true, data };
      } else {
        return { success: false, error: data.error || 'Login failed' };
      }
    } catch (error) {
      return { success: false, error: error.message };
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
    
    const response = await fetch(url.toString(), {
      method: 'GET',
      mode: 'cors',
      cache: 'no-cache'
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    let data;
    try {
      data = await response.json();
    } catch (error) {
      throw new Error('Invalid response from server');
    }
    
    if (!data.success) {
      throw new Error(data.error || 'Request failed');
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
    if (authService.isAuthenticated()) {
      const session = authService.getSession();
      setClientInfo(session.clientInfo);
      setIsAuthenticated(true);
    }
  }, []);
  
  const handleLogin = async (email, password) => {
      const result = await authService.login(email, password);
      if (result.success) {
        setClientInfo({
          email: result.data.email,
          clientCompanyName: result.data.clientCompanyName,
          fullName: result.data.fullName
        });
        setIsAuthenticated(true);
        return { success: true };
      } else {
        return { success: false, error: result.error };
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
    
    const result = await onLogin(email, password);
    
    if (!result.success) {
      setError(result.error || 'Login failed');
      setLoading(false);
    }
  };
  
  const brandCharcoal = '#2C2C2C';
  
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#fafaf8', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap');
        * { font-family: 'Inter', sans-serif; }
      ` }} />
      
      <div style={{ backgroundColor: 'white', padding: '40px', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)', maxWidth: '400px', width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <img 
            src="/mayker_wordmark-events-black.svg" 
            alt="MAYKER EVENTS" 
            style={{ height: '40px', width: 'auto', marginBottom: '16px' }}
            onError={(e) => {
              if (!e.target.src.includes('/assets/')) {
                e.target.src = '/assets/mayker_wordmark-events-black.svg';
              } else {
                e.target.style.display = 'none';
              }
            }}
          />
          <h1 style={{ fontSize: '24px', fontWeight: '600', color: brandCharcoal, margin: '0' }}>Client Portal</h1>
          <p style={{ fontSize: '14px', color: '#666', marginTop: '8px' }}>Sign in to view your proposals</p>
        </div>
        
        <form onSubmit={handleSubmit}>
          {error && (
            <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '12px', borderRadius: '4px', marginBottom: '20px', fontSize: '14px' }}>
              {error}
            </div>
          )}
          
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px', color: brandCharcoal }}>
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{ width: '100%', padding: '12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' }}
              placeholder="your@email.com"
            />
          </div>
          
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px', color: brandCharcoal }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{ width: '100%', padding: '12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' }}
              placeholder="Enter your password"
            />
          </div>
          
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              backgroundColor: brandCharcoal,
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '16px',
              fontWeight: '500',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1
            }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
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
  
  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Fetch proposals and spend data in parallel
      const [proposalsResult, spendResult] = await Promise.all([
        apiService.getProposals(),
        apiService.getSpend(new Date().getFullYear())
      ]);
      
      setProposals(proposalsResult.proposals || []);
      setSpendData(spendResult);
    } catch (err) {
      setError(err.message || 'Failed to load data');
      console.error('Error fetching data:', err);
    } finally {
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

