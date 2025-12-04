'use client';

import React, { useState, useEffect } from 'react';

// ============================================
// CONFIGURATION
// ============================================

// Update this with your Client Apps Script Web App URL
const CLIENT_API_URL = 'https://script.google.com/macros/s/AKfycbyQ3SzfXgsnm0lxsBZvVpqSF5L-kUtnmT6x7S9kXRGdfocxFBLzDeF3PvrSEGZ8LoxL/exec';

// Update this with your main proposals API URL (for fetching proposals and submitting change requests)
const PROPOSALS_API_URL = 'https://script.google.com/macros/s/AKfycbzB7gHa5o-gBep98SJgQsG-z2EsEspSWC6NXvLFwurYBGpxpkI-weD-HVcfY2LDA4Yz/exec';

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
    
    const data = await response.json();
    
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
  },
  
  // Submit change request
  async submitChangeRequest(changeRequestData) {
    const response = await fetch(PROPOSALS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(changeRequestData),
      mode: 'cors'
    });
    
    const result = await response.json();
    
    if (result.success === false) {
      throw new Error(result.error || 'Failed to submit change request');
    }
    
    return result;
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

function calculateDetailedTotals(proposal) {
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
  let waiveProductCare = proposal.waiveProductCare === true || proposal.waiveProductCare === 'true';
  if (proposal.discountName && proposal.discountName.includes('WAIVE:PC')) {
    waiveProductCare = true;
  }
  const productCare = waiveProductCare ? 0 : productCareAmount;
  
  const delivery = parseFloat(proposal.deliveryFee) || 0;
  
  const serviceFeeAmount = (rentalTotal + productCare + delivery) * 0.05;
  let waiveServiceFee = proposal.waiveServiceFee === true || proposal.waiveServiceFee === 'true';
  if (proposal.discountName && proposal.discountName.includes('WAIVE:SF')) {
    waiveServiceFee = true;
  }
  const serviceFee = waiveServiceFee ? 0 : serviceFeeAmount;
  
  // Calculate miscellaneous fees
  let miscFeesTotal = 0;
  try {
    const miscFees = typeof proposal.miscFees === 'string' ? JSON.parse(proposal.miscFees) : (proposal.miscFees || []);
    if (Array.isArray(miscFees)) {
      miscFeesTotal = miscFees.reduce((sum, fee) => {
        if (fee.hasOwnProperty('checked')) {
          return fee.checked ? sum + (parseFloat(fee.amount) || 0) : sum;
        }
        return sum + (parseFloat(fee.amount) || 0);
      }, 0);
    }
  } catch (e) {
    console.warn('Error parsing miscFees:', e);
  }
  
  const subtotal = rentalTotal + productCare + serviceFee + delivery + miscFeesTotal;
  
  // Tax
  const taxExempt = proposal.taxExempt === true || proposal.taxExempt === 'true';
  const tax = taxExempt ? 0 : subtotal * 0.0975;
  
  const total = subtotal + tax;
  
  return {
    rentalMultiplier,
    productSubtotal: extendedProductTotal,
    standardRateDiscount,
    rentalTotal,
    productCare,
    serviceFee,
    delivery,
    miscFees: miscFeesTotal,
    subtotal,
    tax,
    total,
    waiveProductCare,
    waiveServiceFee,
    taxExempt
  };
}

function calculateTotal(proposal) {
  const totals = calculateDetailedTotals(proposal);
  return totals.total;
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

export default function ClientPortalApp() {
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
      setClientInfo(result.data);
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
// PROPOSAL DETAIL VIEW (with change request functionality)
// ============================================

function ProposalDetailView({ proposal, onBack, onLogout }) {
  const [isChangeRequestMode, setIsChangeRequestMode] = useState(false);
  const [catalog, setCatalog] = useState([]);
  
  useEffect(() => {
    // Fetch catalog for new product requests
    fetch(PROPOSALS_API_URL, {
      method: 'GET',
      mode: 'cors',
      cache: 'no-cache'
    })
      .then(res => res.json())
      .then(data => {
        if (data && data.catalog) {
          setCatalog(data.catalog);
        }
      })
      .catch(err => console.error('Error fetching catalog:', err));
  }, []);
  
  const rawSections = JSON.parse(proposal.sectionsJSON || '[]');
  const sections = rawSections.map(section => {
    if (section.products && Array.isArray(section.products)) {
      return {
        ...section,
        products: section.products.map(product => ({
          ...product,
          note: product.note || ''
        }))
      };
    }
    return section;
  });
  
  if (isChangeRequestMode) {
    return (
      <ChangeRequestView 
        proposal={proposal}
        sections={sections}
        onCancel={() => setIsChangeRequestMode(false)}
        catalog={catalog}
      />
    );
  }
  
  return (
    <ViewProposalView 
      proposal={proposal}
      sections={sections}
      onBack={onBack}
      onLogout={onLogout}
      onRequestChanges={() => setIsChangeRequestMode(true)}
    />
  );
}

// ============================================
// VIEW PROPOSAL VIEW (with print/PDF export)
// ============================================

function ViewProposalView({ proposal, sections, onBack, onLogout, onRequestChanges }) {
  const totals = calculateDetailedTotals(proposal);
  const brandTaupe = '#545142';
  const brandCharcoal = '#2C2C2C';
  
  const handlePrintDownload = () => {
    window.print();
  };
  
  return (
    <div data-proposal-view="true" style={{ minHeight: '100vh', backgroundColor: 'white' }}>
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Inter', sans-serif; }
        @media print {
          .no-print { display: none !important; }
          @page { size: letter; margin: 0.5in; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      ` }} />

      {/* Navigation bar - hidden when printing */}
      <div className="no-print" style={{ position: 'fixed', top: 0, left: 0, right: 0, backgroundColor: 'white', borderBottom: '1px solid #e5e7eb', zIndex: 1000, padding: '16px 24px' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
          <button onClick={onBack} style={{ color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px' }}>
            ← Back to Dashboard
          </button>
          <div style={{ display: 'flex', gap: '12px' }}>
            {onRequestChanges && (
              <button onClick={onRequestChanges} style={{ padding: '8px 20px', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '14px' }}>
                Request Changes
              </button>
            )}
            <button onClick={handlePrintDownload} style={{ padding: '8px 20px', backgroundColor: brandCharcoal, color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '14px' }}>
              Print / Export as PDF
            </button>
            {onLogout && (
              <button onClick={onLogout} style={{ padding: '8px 20px', backgroundColor: '#f3f4f6', color: brandCharcoal, border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '14px' }}>
                Sign Out
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Cover Page */}
      <div className="print-break-after" style={{ backgroundColor: brandTaupe, height: '100vh', width: '100%', maxWidth: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '60px 48px', position: 'relative', boxSizing: 'border-box', margin: 0, pageBreakAfter: 'always', pageBreakBefore: 'auto', overflow: 'hidden' }}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '80px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
            <img src="/mayker_wordmark-events-whisper.svg" alt="MAYKER EVENTS" style={{ height: '32px', marginBottom: '24px' }} />
            <div style={{ width: '60px', height: '0.5px', backgroundColor: 'rgba(255,255,255,0.4)', marginBottom: '24px' }}></div>
            <p style={{ fontSize: '14px', color: 'white', letterSpacing: '0.1em', marginBottom: '16px', fontFamily: "'Neue Haas Unica', 'Inter', sans-serif", textTransform: 'uppercase' }}>Product Selections</p>
            <p style={{ fontSize: '18px', color: 'white', marginBottom: '6px', fontWeight: '300', fontFamily: "'Domaine Text', serif" }}>{proposal.clientName?.replace(/\s*\(V\d+\)\s*$/, '') || 'Proposal'}{proposal.status === 'Approved' ? ' (Final)' : ''}</p>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.9)', marginBottom: '4px', fontFamily: "'Neue Haas Unica', 'Inter', sans-serif" }}>{proposal.venueName}</p>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.9)', fontFamily: "'Neue Haas Unica', 'Inter', sans-serif" }}>{formatDateRange(proposal)}</p>
          </div>
          <img src="/mayker_icon-whisper.svg" alt="Mayker Events" style={{ width: '60px', height: '60px', marginTop: '40px' }} />
        </div>
      </div>

      {/* Product Sections */}
      {sections.map((section, sectionIndex) => {
        if (!section.products || section.products.length === 0) return null;
        
        return (
          <div key={sectionIndex} style={{ minHeight: '100vh', padding: '40px 60px', pageBreakBefore: sectionIndex > 0 ? 'always' : 'auto' }}>
            {section.name && (
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: brandCharcoal, marginBottom: '24px', fontFamily: "'Inter', sans-serif" }}>
                {section.name}
              </h2>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
              {section.products.map((product, productIndex) => (
                <div key={productIndex} style={{ backgroundColor: '#f9f9f9', padding: '16px', borderRadius: '6px' }}>
                  {product.imageUrl && (
                    <img src={product.imageUrl} alt={product.name} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: '4px', marginBottom: '12px' }} />
                  )}
                  <h3 style={{ fontSize: '14px', fontWeight: '600', color: brandCharcoal, marginBottom: '8px', fontFamily: "'Inter', sans-serif" }}>
                    {product.name}
                  </h3>
                  <p style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Quantity: {product.quantity}</p>
                  {product.dimensions && (
                    <p style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Size: {product.dimensions}</p>
                  )}
                  {product.note && product.note.trim() && (
                    <p style={{ fontSize: '12px', color: '#666', marginTop: '8px', fontStyle: 'italic' }}>{product.note}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Totals Page */}
      <div style={{ minHeight: '100vh', padding: '50px 80px', pageBreakBefore: 'always', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ maxWidth: '700px', margin: '0 auto', border: '1px solid ' + brandCharcoal, padding: '40px', backgroundColor: 'white' }}>
          <h2 style={{ fontSize: '24px', fontWeight: '600', color: brandCharcoal, marginBottom: '32px', fontFamily: "'Inter', sans-serif" }}>
            Proposal Summary
          </h2>
          
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '32px' }}>
            <tbody>
              <tr>
                <td style={{ padding: '8px 0', fontSize: '14px', color: '#666' }}>Product Subtotal</td>
                <td style={{ padding: '8px 0', fontSize: '14px', color: brandCharcoal, textAlign: 'right' }}>
                  ${totals.productSubtotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
              {totals.standardRateDiscount > 0 && (
                <tr>
                  <td style={{ padding: '8px 0', fontSize: '14px', color: '#059669' }}>Discount</td>
                  <td style={{ padding: '8px 0', fontSize: '14px', color: '#059669', textAlign: 'right' }}>
                    -${totals.standardRateDiscount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              )}
              <tr style={{ borderTop: '1px solid #e5e7eb', borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '12px 0', fontSize: '14px', fontWeight: '600', color: brandCharcoal }}>Rental Total</td>
                <td style={{ padding: '12px 0', fontSize: '14px', fontWeight: '600', color: brandCharcoal, textAlign: 'right' }}>
                  ${totals.rentalTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
              <tr>
                <td style={{ padding: '8px 0', fontSize: '14px', color: '#666' }}>Product Care (10%)</td>
                <td style={{ padding: '8px 0', fontSize: '14px', color: brandCharcoal, textAlign: 'right' }}>
                  {totals.waiveProductCare ? (
                    <span style={{ color: '#059669' }}>Waived</span>
                  ) : (
                    `$${totals.productCare.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  )}
                </td>
              </tr>
              <tr>
                <td style={{ padding: '8px 0', fontSize: '14px', color: '#666' }}>Service Fee (5%)</td>
                <td style={{ padding: '8px 0', fontSize: '14px', color: brandCharcoal, textAlign: 'right' }}>
                  {totals.waiveServiceFee ? (
                    <span style={{ color: '#059669' }}>Waived</span>
                  ) : (
                    `$${totals.serviceFee.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  )}
                </td>
              </tr>
              <tr>
                <td style={{ padding: '8px 0', fontSize: '14px', color: '#666' }}>Delivery</td>
                <td style={{ padding: '8px 0', fontSize: '14px', color: brandCharcoal, textAlign: 'right' }}>
                  ${totals.delivery.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
              {totals.miscFees > 0 && (
                <tr>
                  <td style={{ padding: '8px 0', fontSize: '14px', color: '#666' }}>Miscellaneous Fees</td>
                  <td style={{ padding: '8px 0', fontSize: '14px', color: brandCharcoal, textAlign: 'right' }}>
                    ${totals.miscFees.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              )}
              <tr style={{ borderTop: '1px solid #e5e7eb' }}>
                <td style={{ padding: '8px 0', fontSize: '14px', color: '#666' }}>Subtotal</td>
                <td style={{ padding: '8px 0', fontSize: '14px', color: brandCharcoal, textAlign: 'right' }}>
                  ${totals.subtotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
              <tr>
                <td style={{ padding: '8px 0', fontSize: '14px', color: '#666' }}>
                  {totals.taxExempt ? 'Tax' : 'Tax (9.75%)'}
                </td>
                <td style={{ padding: '8px 0', fontSize: '14px', color: totals.taxExempt ? '#059669' : brandCharcoal, textAlign: 'right' }}>
                  {totals.taxExempt ? 'Exempt' : `$${totals.tax.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                </td>
              </tr>
              <tr style={{ borderTop: '2px solid ' + brandCharcoal }}>
                <td style={{ padding: '16px 0', fontSize: '18px', fontWeight: '600', color: brandCharcoal }}>Total</td>
                <td style={{ padding: '16px 0', fontSize: '18px', fontWeight: '600', color: brandCharcoal, textAlign: 'right' }}>
                  ${totals.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            </tbody>
          </table>

          <div style={{ marginTop: '32px', paddingTop: '24px', borderTop: '1px solid #e5e7eb' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', color: brandCharcoal, marginBottom: '16px', fontFamily: "'Inter', sans-serif" }}>
              Project Details
            </h3>
            <div style={{ fontSize: '14px', color: '#666', lineHeight: '1.8' }}>
              <p><strong>Venue:</strong> {proposal.venueName}</p>
              <p><strong>Location:</strong> {proposal.city}, {proposal.state}</p>
              <p><strong>Event Dates:</strong> {formatDateRange(proposal)}</p>
              {proposal.deliveryTime && <p><strong>Load-In Time:</strong> {proposal.deliveryTime}</p>}
              {proposal.strikeTime && <p><strong>Strike Time:</strong> {proposal.strikeTime}</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// CHANGE REQUEST VIEW
// ============================================

function ChangeRequestView({ proposal, sections, onCancel, catalog }) {
  const [changeRequest, setChangeRequest] = useState({
    quantityChanges: {},
    dateTimeChanges: {
      startDate: proposal.startDate || '',
      endDate: proposal.endDate || '',
      deliveryTime: proposal.deliveryTime || '',
      strikeTime: proposal.strikeTime || ''
    },
    newProducts: []
  });
  const [submitting, setSubmitting] = useState(false);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [newProduct, setNewProduct] = useState({
    section: '',
    name: '',
    quantity: 1,
    notes: ''
  });

  const brandTaupe = '#545142';
  const brandCharcoal = '#2C2C2C';

  const handleQuantityChange = (sectionIdx, productIdx, newQuantity) => {
    const key = `${sectionIdx}-${productIdx}`;
    const originalQuantity = sections[sectionIdx]?.products[productIdx]?.quantity || 0;
    
    if (parseInt(newQuantity) === parseInt(originalQuantity)) {
      const newChanges = { ...changeRequest.quantityChanges };
      delete newChanges[key];
      setChangeRequest({ ...changeRequest, quantityChanges: newChanges });
    } else {
      setChangeRequest({
        ...changeRequest,
        quantityChanges: {
          ...changeRequest.quantityChanges,
          [key]: {
            sectionIdx,
            productIdx,
            originalQuantity,
            newQuantity: parseInt(newQuantity) || 0,
            productName: sections[sectionIdx]?.products[productIdx]?.name || ''
          }
        }
      });
    }
  };

  const handleDateTimeChange = (field, value) => {
    setChangeRequest({
      ...changeRequest,
      dateTimeChanges: {
        ...changeRequest.dateTimeChanges,
        [field]: value
      }
    });
  };

  const handleAddNewProduct = () => {
    if (!newProduct.name.trim() || !newProduct.section) {
      alert('Please select a section and enter a product name');
      return;
    }
    
    setChangeRequest({
      ...changeRequest,
      newProducts: [...changeRequest.newProducts, { ...newProduct }]
    });
    
    setNewProduct({ section: '', name: '', quantity: 1, notes: '' });
    setShowAddProduct(false);
  };

  const handleRemoveNewProduct = (index) => {
    setChangeRequest({
      ...changeRequest,
      newProducts: changeRequest.newProducts.filter((_, i) => i !== index)
    });
  };

  const handleSubmit = async () => {
    const hasQuantityChanges = Object.keys(changeRequest.quantityChanges).length > 0;
    const hasDateTimeChanges = 
      changeRequest.dateTimeChanges.startDate !== (proposal.startDate || '') ||
      changeRequest.dateTimeChanges.endDate !== (proposal.endDate || '') ||
      changeRequest.dateTimeChanges.deliveryTime !== (proposal.deliveryTime || '') ||
      changeRequest.dateTimeChanges.strikeTime !== (proposal.strikeTime || '');
    const hasNewProducts = changeRequest.newProducts.length > 0;

    if (!hasQuantityChanges && !hasDateTimeChanges && !hasNewProducts) {
      alert('Please make at least one change before submitting');
      return;
    }

    if (!confirm('Are you sure you want to submit this change request? The team will review and respond to your request.')) {
      return;
    }

    setSubmitting(true);
    try {
      const changeRequestData = {
        type: 'changeRequest',
        projectNumber: proposal.projectNumber,
        version: proposal.version,
        timestamp: new Date().toISOString(),
        changes: {
          quantityChanges: changeRequest.quantityChanges,
          dateTimeChanges: changeRequest.dateTimeChanges,
          newProducts: changeRequest.newProducts
        },
        originalProposal: {
          projectNumber: proposal.projectNumber,
          version: proposal.version,
          clientName: proposal.clientName
        }
      };

      await apiService.submitChangeRequest(changeRequestData);
      alert('Change request submitted successfully! The team will review your request and get back to you.');
      onCancel();
    } catch (err) {
      alert('Error submitting change request: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const hasChanges = 
    Object.keys(changeRequest.quantityChanges).length > 0 ||
    changeRequest.dateTimeChanges.startDate !== (proposal.startDate || '') ||
    changeRequest.dateTimeChanges.endDate !== (proposal.endDate || '') ||
    changeRequest.dateTimeChanges.deliveryTime !== (proposal.deliveryTime || '') ||
    changeRequest.dateTimeChanges.strikeTime !== (proposal.strikeTime || '') ||
    changeRequest.newProducts.length > 0;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#fafaf8', paddingTop: '80px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 24px' }}>
        <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '32px', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)' }}>
          <div style={{ marginBottom: '32px' }}>
            <h1 style={{ fontSize: '28px', fontWeight: '600', color: brandCharcoal, marginBottom: '8px', fontFamily: "'Inter', sans-serif" }}>
              Request Changes
            </h1>
            <p style={{ fontSize: '14px', color: '#6b7280', fontFamily: "'Inter', sans-serif" }}>
              Please review the proposal below and indicate any changes you'd like to request. The team will review and respond to your request.
            </p>
          </div>

          {/* Date/Time Changes */}
          <div style={{ marginBottom: '40px', padding: '24px', backgroundColor: '#f9fafb', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', color: brandCharcoal, marginBottom: '20px', fontFamily: "'Inter', sans-serif" }}>
              Event Dates & Times
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '8px', color: '#888888', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: "'Inter', sans-serif" }}>
                  Event Start Date
                </label>
                <input
                  type="date"
                  value={changeRequest.dateTimeChanges.startDate}
                  onChange={(e) => handleDateTimeChange('startDate', e.target.value)}
                  style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '14px', fontFamily: "'Inter', sans-serif" }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '8px', color: '#888888', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: "'Inter', sans-serif" }}>
                  Event End Date
                </label>
                <input
                  type="date"
                  value={changeRequest.dateTimeChanges.endDate}
                  onChange={(e) => handleDateTimeChange('endDate', e.target.value)}
                  style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '14px', fontFamily: "'Inter', sans-serif" }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '8px', color: '#888888', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: "'Inter', sans-serif" }}>
                  Load-In Time
                </label>
                <input
                  type="time"
                  value={changeRequest.dateTimeChanges.deliveryTime}
                  onChange={(e) => handleDateTimeChange('deliveryTime', e.target.value)}
                  style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '14px', fontFamily: "'Inter', sans-serif" }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '8px', color: '#888888', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: "'Inter', sans-serif" }}>
                  Strike Time
                </label>
                <input
                  type="time"
                  value={changeRequest.dateTimeChanges.strikeTime}
                  onChange={(e) => handleDateTimeChange('strikeTime', e.target.value)}
                  style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '14px', fontFamily: "'Inter', sans-serif" }}
                />
              </div>
            </div>
          </div>

          {/* Quantity Changes */}
          <div style={{ marginBottom: '40px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', color: brandCharcoal, marginBottom: '20px', fontFamily: "'Inter', sans-serif" }}>
              Product Quantities
            </h2>
            {sections.map((section, sectionIdx) => (
              section.products && section.products.length > 0 && (
                <div key={sectionIdx} style={{ marginBottom: '32px', padding: '20px', backgroundColor: '#f9fafb', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: '600', color: brandCharcoal, marginBottom: '16px', fontFamily: "'Inter', sans-serif" }}>
                    {section.name || 'Unnamed Section'}
                  </h3>
                  {section.products.map((product, productIdx) => {
                    const key = `${sectionIdx}-${productIdx}`;
                    const change = changeRequest.quantityChanges[key];
                    const currentQuantity = change ? change.newQuantity : (product.quantity || 0);
                    const originalQuantity = product.quantity || 0;
                    const hasChange = change && change.newQuantity !== originalQuantity;

                    return (
                      <div key={productIdx} style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '12px', padding: '12px', backgroundColor: hasChange ? '#fef3c7' : 'white', borderRadius: '4px', border: hasChange ? '1px solid #fbbf24' : '1px solid #e5e7eb' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '14px', fontWeight: '500', color: brandCharcoal, marginBottom: '4px', fontFamily: "'Inter', sans-serif" }}>
                            {product.name}
                          </div>
                          {hasChange && (
                            <div style={{ fontSize: '12px', color: '#92400e', fontFamily: "'Inter', sans-serif" }}>
                              Original: {originalQuantity} → New: {change.newQuantity}
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <button
                            onClick={() => handleQuantityChange(sectionIdx, productIdx, Math.max(0, currentQuantity - 1))}
                            style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '4px', cursor: 'pointer', fontSize: '18px', color: brandCharcoal }}
                          >
                            −
                          </button>
                          <input
                            type="number"
                            value={currentQuantity}
                            onChange={(e) => handleQuantityChange(sectionIdx, productIdx, e.target.value)}
                            min="0"
                            style={{ width: '80px', padding: '6px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '14px', textAlign: 'center', fontFamily: "'Inter', sans-serif" }}
                          />
                          <button
                            onClick={() => handleQuantityChange(sectionIdx, productIdx, currentQuantity + 1)}
                            style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '4px', cursor: 'pointer', fontSize: '18px', color: brandCharcoal }}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ))}
          </div>

          {/* New Products */}
          <div style={{ marginBottom: '40px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: brandCharcoal, fontFamily: "'Inter', sans-serif" }}>
                Request New Products
              </h2>
              {!showAddProduct && (
                <button
                  onClick={() => setShowAddProduct(true)}
                  style={{ padding: '8px 16px', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '14px', fontFamily: "'Inter', sans-serif" }}
                >
                  + Add Product Request
                </button>
              )}
            </div>

            {showAddProduct && (
              <div style={{ padding: '20px', backgroundColor: '#f9fafb', borderRadius: '6px', border: '1px solid #e5e7eb', marginBottom: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '8px', color: '#888888', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: "'Inter', sans-serif" }}>
                      Section
                    </label>
                    <select
                      value={newProduct.section}
                      onChange={(e) => setNewProduct({ ...newProduct, section: e.target.value })}
                      style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '14px', fontFamily: "'Inter', sans-serif" }}
                    >
                      <option value="">Select section...</option>
                      {sections.map((section, idx) => (
                        <option key={idx} value={section.name || `Section ${idx + 1}`}>
                          {section.name || `Section ${idx + 1}`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '8px', color: '#888888', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: "'Inter', sans-serif" }}>
                      Product Name
                    </label>
                    <input
                      type="text"
                      value={newProduct.name}
                      onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                      placeholder="Enter product name..."
                      style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '14px', fontFamily: "'Inter', sans-serif" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '8px', color: '#888888', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: "'Inter', sans-serif" }}>
                      Quantity
                    </label>
                    <input
                      type="number"
                      value={newProduct.quantity}
                      onChange={(e) => setNewProduct({ ...newProduct, quantity: parseInt(e.target.value) || 1 })}
                      min="1"
                      style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '14px', fontFamily: "'Inter', sans-serif" }}
                    />
                  </div>
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '8px', color: '#888888', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: "'Inter', sans-serif" }}>
                    Notes (optional)
                  </label>
                  <textarea
                    value={newProduct.notes}
                    onChange={(e) => setNewProduct({ ...newProduct, notes: e.target.value })}
                    placeholder="Any additional details about this product..."
                    rows="3"
                    style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '14px', fontFamily: "'Inter', sans-serif", resize: 'vertical' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={handleAddNewProduct}
                    style={{ padding: '8px 16px', backgroundColor: '#059669', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '14px', fontFamily: "'Inter', sans-serif" }}
                  >
                    Add Product
                  </button>
                  <button
                    onClick={() => {
                      setShowAddProduct(false);
                      setNewProduct({ section: '', name: '', quantity: 1, notes: '' });
                    }}
                    style={{ padding: '8px 16px', backgroundColor: '#6b7280', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '14px', fontFamily: "'Inter', sans-serif" }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {changeRequest.newProducts.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {changeRequest.newProducts.map((product, idx) => (
                  <div key={idx} style={{ padding: '16px', backgroundColor: '#fef3c7', borderRadius: '6px', border: '1px solid #fbbf24', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: '500', color: brandCharcoal, marginBottom: '4px', fontFamily: "'Inter', sans-serif" }}>
                        {product.name} (Qty: {product.quantity})
                      </div>
                      <div style={{ fontSize: '12px', color: '#92400e', fontFamily: "'Inter', sans-serif" }}>
                        Section: {product.section}
                        {product.notes && ` • ${product.notes}`}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveNewProduct(idx)}
                      style={{ padding: '6px 12px', backgroundColor: '#dc2626', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontFamily: "'Inter', sans-serif" }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', paddingTop: '24px', borderTop: '1px solid #e5e7eb' }}>
            <button
              onClick={onCancel}
              disabled={submitting}
              style={{ padding: '12px 24px', backgroundColor: '#f3f4f6', color: brandCharcoal, border: 'none', borderRadius: '4px', cursor: submitting ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: '500', fontFamily: "'Inter', sans-serif" }}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || !hasChanges}
              style={{ padding: '12px 24px', backgroundColor: hasChanges && !submitting ? '#2563eb' : '#9ca3af', color: 'white', border: 'none', borderRadius: '4px', cursor: (submitting || !hasChanges) ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: '500', fontFamily: "'Inter', sans-serif" }}
            >
              {submitting ? 'Submitting...' : 'Submit Change Request'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
