import React, { useState, useEffect } from 'react';

// ============================================
// CONFIGURATION
// ============================================

// Update this with your Client Apps Script Web App URL
const CLIENT_API_URL = 'https://script.google.com/macros/s/AKfycbzRLIS_HkRzFI9wlm_tvE1ccfQTeDUqqPSrTwCVbtmKtJuoVJWyZQORG6z6_B40bxCU/exec';

// Shopify Storefront API Configuration
const SHOPIFY_STORE = 'maykerevents';
const SHOPIFY_STOREFRONT_TOKEN = 'c5d91c74423126f87956f6f32d050878';
const SHOPIFY_API_URL = `https://${SHOPIFY_STORE}.myshopify.com/api/2024-01/graphql.json`;

// Admin Proposal App URL - Links to the admin proposal creation app
const ADMIN_PROPOSAL_APP_URL = 'https://app.maykerevents.com';

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
          fullName: data.fullName || `${data.firstName || ''} ${data.lastName || ''}`.trim(),
          firstName: data.firstName || '',
          lastName: data.lastName || '',
          title: data.title || ''
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
// SHOPIFY SERVICE
// ============================================

const shopifyService = {
  // Fetch products tagged with "Mayker Reserve Product"
  async getFeaturedProducts() {
    try {
      const query = `
        query getProducts($tag: String!) {
          products(first: 10, query: $tag) {
            edges {
              node {
                id
                title
                description
                handle
                images(first: 1) {
                  edges {
                    node {
                      url
                      altText
                    }
                  }
                }
                priceRange {
                  minVariantPrice {
                    amount
                    currencyCode
                  }
                }
              }
            }
          }
        }
      `;
      
      const variables = {
        tag: 'tag:"Mayker Reserve Product"'
      };
      
      const response = await fetch(SHOPIFY_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Storefront-Access-Token': SHOPIFY_STOREFRONT_TOKEN
        },
        body: JSON.stringify({ query, variables })
      });
      
      if (!response.ok) {
        throw new Error(`Shopify API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.errors) {
        console.error('Shopify GraphQL errors:', data.errors);
        return [];
      }
      
      // Transform Shopify data to our format
      return data.data.products.edges.map(edge => {
        const product = edge.node;
        const image = product.images.edges[0]?.node;
        const price = parseFloat(product.priceRange.minVariantPrice.amount);
        
        return {
          id: product.id,
          title: product.title,
          description: product.description || '',
          handle: product.handle,
          imageUrl: image?.url || '',
          imageAlt: image?.altText || product.title,
          price: price,
          currencyCode: product.priceRange.minVariantPrice.currencyCode,
          url: `https://${SHOPIFY_STORE}.myshopify.com/products/${product.handle}`
        };
      });
    } catch (error) {
      console.error('Error fetching Shopify products:', error);
      return [];
    }
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

// Shared utility function to get a sortable date from a proposal
// Returns a Date object that can be used for sorting (most recent first)
function getSortableDateFromProposal(proposal) {
  // For historical projects, try to parse eventDate first (it has the actual event date)
  // Only use timestamp if eventDate can't be parsed
  if (proposal.isHistorical) {
    // Try eventDate first for historical projects (it contains the actual event date)
    if (proposal.eventDate) {
      if (proposal.eventDate instanceof Date) {
        if (!isNaN(proposal.eventDate.getTime())) {
          return proposal.eventDate;
        }
      } else if (typeof proposal.eventDate === 'string') {
        const eventDateStr = proposal.eventDate.trim();
        
        // Try parsing GMT date strings first (e.g., "Tue Aug 19 2025 00:00:00 GMT-0500")
        // Handle strings like "Tue Aug 19 2025 00:00:00 GMT-0500 (Central Daylight Time)"
        // Remove timezone name in parentheses if present, as it can cause parsing issues
        let cleanDateStr = eventDateStr;
        // Remove timezone name in parentheses: "(Central Daylight Time)" or "(Central Standard Time)"
        cleanDateStr = cleanDateStr.replace(/\s*\([^)]+\)\s*$/, '');
        
        const dateObj = new Date(cleanDateStr);
        if (!isNaN(dateObj.getTime())) {
          const year = dateObj.getFullYear();
          // Only use if it's a reasonable date (not year 1970 from failed parse)
          if (year >= 2000 && year <= 2100) {
            return dateObj;
          }
        }
        
        // Try parsing formatted strings like "April 5 - 13, 2025" or "April 5, 2025"
        const monthMap = {
          'january': 0, 'february': 1, 'march': 2, 'april': 3, 'may': 4, 'june': 5,
          'july': 6, 'august': 7, 'september': 8, 'october': 9, 'november': 10, 'december': 11
        };
        
        // Pattern 1: "Month Day - Day, Year" or "Month Day-Day, Year" (date range)
        // Also handles "March 29 - April 3, 2026" (cross-month ranges)
        let match = eventDateStr.match(/(\w+)\s+(\d+)\s*-\s*(\d+),?\s+(\d{4})/i);
        if (!match) {
          // Try cross-month: "March 29 - April 3, 2026"
          match = eventDateStr.match(/(\w+)\s+(\d+)\s*-\s*(\w+)\s+(\d+),?\s+(\d{4})/i);
          if (match) {
            const startMonthName = match[1].toLowerCase();
            const startMonth = monthMap[startMonthName];
            const startDay = parseInt(match[2]);
            const year = parseInt(match[5]);
            if (startMonth !== undefined && startDay && year) {
              const parsed = new Date(year, startMonth, startDay);
              if (!isNaN(parsed.getTime())) {
                return parsed;
              }
            }
          }
        } else {
          const monthName = match[1].toLowerCase();
          const month = monthMap[monthName];
          const day = parseInt(match[2]); // Use first date for sorting
          const year = parseInt(match[4]);
          if (month !== undefined && day && year) {
            const parsed = new Date(year, month, day);
            if (!isNaN(parsed.getTime())) {
              return parsed;
            }
          }
        }
        
        // Pattern 2: "Month Day, Year" (single date)
        match = eventDateStr.match(/(\w+)\s+(\d+),?\s+(\d{4})/i);
        if (match) {
          const monthName = match[1].toLowerCase();
          const month = monthMap[monthName];
          const day = parseInt(match[2]);
          const year = parseInt(match[3]);
          if (month !== undefined && day && year) {
            const parsed = new Date(year, month, day);
            if (!isNaN(parsed.getTime())) {
              return parsed;
            }
          }
        }
      }
    }
    
    // Fallback to timestamp for historical projects only if eventDate parsing failed
    if (proposal.timestamp) {
      const ts = new Date(proposal.timestamp);
      if (!isNaN(ts.getTime())) {
        return ts;
      }
    }
  }
  
  // Debug: Log if we can't find a date
  if (!proposal.startDate && !proposal.eventDate && !proposal.endDate) {
    console.warn('Proposal has no date fields:', proposal.projectNumber || 'unknown', proposal);
  }
  
  // Priority 2: Use startDate if available
  if (proposal.startDate) {
    if (proposal.startDate instanceof Date) {
      if (!isNaN(proposal.startDate.getTime())) {
        return proposal.startDate;
      }
    } else if (typeof proposal.startDate === 'string') {
      // Try YYYY-MM-DD format first
      if (/^\d{4}-\d{2}-\d{2}/.test(proposal.startDate.trim())) {
        const parsed = parseDateSafely(proposal.startDate);
        if (parsed && !isNaN(parsed.getTime())) {
          return parsed;
        }
      }
      // Try parsing as-is
      const parsed = new Date(proposal.startDate);
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
    }
  }
  
  // Priority 3: Try to parse eventDate (can be in many formats)
  if (proposal.eventDate) {
    if (proposal.eventDate instanceof Date) {
      if (!isNaN(proposal.eventDate.getTime())) {
        return proposal.eventDate;
      }
    } else if (typeof proposal.eventDate === 'string') {
      const eventDateStr = proposal.eventDate.trim();
      
      // Try parsing as Date object first (handles GMT strings and ISO dates)
      const dateObj = new Date(eventDateStr);
      if (!isNaN(dateObj.getTime())) {
        // Only use this if it's a reasonable date (not year 1970 or 1900 from failed parse)
        const year = dateObj.getFullYear();
        if (year >= 2000 && year <= 2100) {
          return dateObj;
        }
      }
      
      // Try parsing formatted strings like "April 5 - 13, 2025" or "April 5, 2025"
      const monthMap = {
        'january': 0, 'february': 1, 'march': 2, 'april': 3, 'may': 4, 'june': 5,
        'july': 6, 'august': 7, 'september': 8, 'october': 9, 'november': 10, 'december': 11
      };
      
      // Pattern 1: "Month Day - Day, Year" or "Month Day-Day, Year" (date range)
      // Also handles "March 29 - April 3, 2026" (cross-month ranges)
      let match = eventDateStr.match(/(\w+)\s+(\d+)\s*-\s*(\d+),?\s+(\d{4})/i);
      if (!match) {
        // Try cross-month: "March 29 - April 3, 2026"
        match = eventDateStr.match(/(\w+)\s+(\d+)\s*-\s*(\w+)\s+(\d+),?\s+(\d{4})/i);
        if (match) {
          const startMonthName = match[1].toLowerCase();
          const startMonth = monthMap[startMonthName];
          const startDay = parseInt(match[2]);
          const year = parseInt(match[5]);
          if (startMonth !== undefined && startDay && year) {
            const parsed = new Date(year, startMonth, startDay);
            if (!isNaN(parsed.getTime())) {
              return parsed;
            }
          }
        }
      } else {
        const monthName = match[1].toLowerCase();
        const month = monthMap[monthName];
        const day = parseInt(match[2]); // Use first date for sorting
        const year = parseInt(match[4]);
        if (month !== undefined && day && year) {
          const parsed = new Date(year, month, day);
          if (!isNaN(parsed.getTime())) {
            return parsed;
          }
        }
      }
      
      // Pattern 2: "Month Day, Year" (single date)
      match = eventDateStr.match(/(\w+)\s+(\d+),?\s+(\d{4})/i);
      if (match) {
        const monthName = match[1].toLowerCase();
        const month = monthMap[monthName];
        const day = parseInt(match[2]);
        const year = parseInt(match[3]);
        if (month !== undefined && day && year) {
          const parsed = new Date(year, month, day);
          if (!isNaN(parsed.getTime())) {
            return parsed;
          }
        }
      }
      
      // Pattern 3: MM/DD/YYYY format
      match = eventDateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (match) {
        const month = parseInt(match[1]) - 1;
        const day = parseInt(match[2]);
        const year = parseInt(match[3]);
        const parsed = new Date(year, month, day);
        if (!isNaN(parsed.getTime())) {
          return parsed;
        }
      }
      
      // Pattern 4: YYYY-MM-DD format
      match = eventDateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (match) {
        const year = parseInt(match[1]);
        const month = parseInt(match[2]) - 1;
        const day = parseInt(match[3]);
        const parsed = new Date(year, month, day);
        if (!isNaN(parsed.getTime())) {
          return parsed;
        }
      }
    }
  }
  
  // Priority 4: Try endDate as last resort
  if (proposal.endDate) {
    if (proposal.endDate instanceof Date && !isNaN(proposal.endDate.getTime())) {
      return proposal.endDate;
    } else if (typeof proposal.endDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(proposal.endDate.trim())) {
      const parsed = parseDateSafely(proposal.endDate);
      if (parsed && !isNaN(parsed.getTime())) {
        return parsed;
      }
    }
  }
  
  // If we can't parse anything, return a very old date so it sorts to the bottom
  return new Date(0);
}

// Sort proposals by date (most recent first)
function sortProposalsByDate(proposals) {
  return [...proposals].sort((a, b) => {
    const dateA = getSortableDateFromProposal(a);
    const dateB = getSortableDateFromProposal(b);
    const timeA = dateA.getTime();
    const timeB = dateB.getTime();
    
    // Primary sort: by date (descending - newest first)
    if (timeB !== timeA) {
      return timeB - timeA;
    }
    
    // Secondary sort: by projectNumber (descending) if dates are equal
    const projectNumA = parseInt(a.projectNumber) || 0;
    const projectNumB = parseInt(b.projectNumber) || 0;
    return projectNumB - projectNumA;
  });
}

function formatDateRange(proposal) {
  // First priority: Use eventDate if available (it's already formatted from the backend)
  // This works for both historical and regular projects that have eventDate set
  // Check eventDate first - this should be set for all projects (historical and regular)
  if (proposal.eventDate) {
    let eventDateStr = '';
    
    // Handle Date objects - convert to formatted string
    if (proposal.eventDate instanceof Date) {
      // If it's a Date object, format it properly
      eventDateStr = proposal.eventDate.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
    } else if (typeof proposal.eventDate === 'string') {
      // Check if it's a Date string (like "Wed Mar 19 2025 00:00:00 GMT-0500")
      // If it looks like a Date string, try to parse and format it
      if (proposal.eventDate.includes('GMT') || proposal.eventDate.match(/^\w{3}\s+\w{3}\s+\d{1,2}\s+\d{4}/)) {
        const parsedDate = new Date(proposal.eventDate);
        if (!isNaN(parsedDate.getTime())) {
          eventDateStr = parsedDate.toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          });
        } else {
          eventDateStr = proposal.eventDate.trim();
        }
      } else {
        // It's already a formatted string
        eventDateStr = proposal.eventDate.trim();
      }
    }
    
    if (eventDateStr) {
      // Normalize spacing around hyphens to be consistent (spaces around dash)
      // This handles both "April 5-13, 2025" and "April 5 - 13, 2025"
      return eventDateStr.replace(/\s*-\s*/g, ' - ');
    }
  }
  
  // Second priority: Try to use startDate and endDate if available
  // Only parse if they exist and are valid date strings (YYYY-MM-DD format)
  let start = null;
  let end = null;
  
  if (proposal.startDate && typeof proposal.startDate === 'string' && proposal.startDate.trim()) {
    // Only parse if it looks like a date string (YYYY-MM-DD), not a formatted string
    const startDateStr = proposal.startDate.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(startDateStr)) {
      start = parseDateSafely(startDateStr);
      if (start && isNaN(start.getTime())) {
        start = null; // Invalid date
      }
    }
  }
  
  if (proposal.endDate && typeof proposal.endDate === 'string' && proposal.endDate.trim()) {
    // Only parse if it looks like a date string (YYYY-MM-DD), not a formatted string
    const endDateStr = proposal.endDate.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(endDateStr)) {
      end = parseDateSafely(endDateStr);
      if (end && isNaN(end.getTime())) {
        end = null; // Invalid date
      }
    }
  }
  
  // If we have a start date but no end date, format as single date
  if (start && !end) {
    return start.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  }
  
  // If we have both dates, format showing all dates
  if (start && end) {
    return formatAllDates(start, end);
  }
  
  // If we have nothing, return empty string (will show as 'N/A' in the table)
  return '';
}

// Helper function to format date ranges in the correct format
// Examples: "March 1, 2026" / "March 1-3, 2026" / "March 29 - April 3, 2026"
function formatAllDates(start, end) {
  if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime())) {
    return '';
  }
  
  const startMonth = start.toLocaleDateString('en-US', { month: 'long' });
  const endMonth = end.toLocaleDateString('en-US', { month: 'long' });
  const startDay = start.getDate();
  const endDay = end.getDate();
  const year = start.getFullYear();
  
  // Same day
  if (startMonth === endMonth && startDay === endDay && start.getFullYear() === end.getFullYear()) {
    return `${startMonth} ${startDay}, ${year}`;
  }
  
  // Same month, different days - format as range
  if (startMonth === endMonth && start.getFullYear() === end.getFullYear()) {
    return `${startMonth} ${startDay}-${endDay}, ${year}`;
  }
  
  // Different months - format as range with both months
  return `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${year}`;
}

function calculateTotal(proposal) {
  // If this is a historical project, use the pre-calculated invoice total
  if (proposal.isHistorical && proposal.historicalInvoiceTotal) {
    return parseFloat(proposal.historicalInvoiceTotal) || 0;
  }
  
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

function formatNumber(num) {
  return (parseFloat(num) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function calculateDetailedTotals(proposal) {
  // If this is a historical project, use pre-calculated values
  if (proposal.isHistorical && proposal.historicalInvoiceTotal) {
    return {
      rentalMultiplier: 1.0,
      productSubtotal: parseFloat(proposal.historicalProductTotal || 0) || 0,
      standardRateDiscount: 0,
      rentalTotal: parseFloat(proposal.historicalProductTotal || 0) || 0,
      productCare: 0,
      serviceFee: 0,
      delivery: 0,
      discount: 0,
      subtotal: parseFloat(proposal.historicalInvoiceTotal || 0) || 0,
      tax: 0,
      total: parseFloat(proposal.historicalInvoiceTotal || 0) || 0
    };
  }
  
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
    const start = parseDateSafely(proposal.startDate);
    const end = parseDateSafely(proposal.endDate);
    if (start && end) {
      const diffTime = end.getTime() - start.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
      rentalMultiplier = getRentalMultiplier(diffDays);
    }
  }
  
  const extendedProductTotal = baseProductTotal * rentalMultiplier;
  const productSubtotal = extendedProductTotal;
  
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
  let waiveProductCare = proposal.waiveProductCare === true || proposal.waiveProductCare === 'true' || String(proposal.waiveProductCare || '').toLowerCase() === 'true';
  if (proposal.discountName && proposal.discountName.includes('WAIVE:PC')) {
    waiveProductCare = true;
  }
  const productCare = waiveProductCare ? 0 : productCareAmount;
  
  const delivery = parseFloat(proposal.deliveryFee) || 0;
  
  const serviceFeeAmount = (rentalTotal + productCare + delivery) * 0.05;
  let waiveServiceFee = proposal.waiveServiceFee === true || proposal.waiveServiceFee === 'true' || String(proposal.waiveServiceFee || '').toLowerCase() === 'true';
  if (proposal.discountName && proposal.discountName.includes('WAIVE:SF')) {
    waiveServiceFee = true;
  }
  const serviceFee = waiveServiceFee ? 0 : serviceFeeAmount;
  
  const subtotal = rentalTotal + productCare + serviceFee + delivery;
  
  // Tax
  const taxExempt = proposal.taxExempt === true || proposal.taxExempt === 'true' || String(proposal.taxExempt || '').toLowerCase() === 'true';
  const tax = taxExempt ? 0 : subtotal * 0.0975;
  
  const total = subtotal + tax;
  
  return {
    rentalMultiplier,
    productSubtotal,
    standardRateDiscount,
    rentalTotal,
    productCare,
    serviceFee,
    delivery,
    discount: standardRateDiscount,
    subtotal,
    tax,
    total
  };
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

// Calculate product spend for a proposal (used for points calculation)
function calculateProductSpend(proposal) {
  try {
    if (proposal.isHistorical && proposal.historicalProductTotal) {
      return parseFloat(proposal.historicalProductTotal) || 0;
    }
    
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
    
    const duration = proposal.startDate && proposal.endDate ? 
      Math.ceil((new Date(proposal.endDate) - new Date(proposal.startDate)) / (1000 * 60 * 60 * 24)) + 1 : 1;
    const rentalMultiplier = proposal.customRentalMultiplier ? 
      parseFloat(proposal.customRentalMultiplier) : 
      (duration <= 1 ? 1 : duration <= 3 ? 1.5 : duration <= 7 ? 2 : 2.5);
    
    const extendedProductTotal = productSpend * rentalMultiplier;
    
    const discountValue = parseFloat(proposal.discountValue || proposal.discount || 0) || 0;
    let discountType = 'percentage';
    if (proposal.discountName && proposal.discountName.startsWith('TYPE:')) {
      const match = proposal.discountName.match(/^TYPE:(\w+)/);
      if (match) discountType = match[1];
    }
    
    const discount = discountType === 'dollar' 
      ? discountValue 
      : extendedProductTotal * (discountValue / 100);
    
    const rentalTotal = extendedProductTotal - discount;
    const productCareFee = extendedProductTotal * 0.1;
    const serviceFee = (rentalTotal + productCareFee) * 0.05;
    
    return rentalTotal + productCareFee + serviceFee;
  } catch (e) {
    console.error('Error calculating product spend:', e);
    return 0;
  }
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
  
  // Scroll to top when authentication state changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [isAuthenticated]);
  
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

function ProfileSection({ clientInfo, profileData, editingProfile, setEditingProfile, onLogout, brandCharcoal = '#2C2C2C', brandBrown = '#603f27', brandBlue = '#7693a9' }) {
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
    photo: null,
    preferredCommunication: clientInfo?.preferredCommunication || '',
    preferredPaymentMethod: clientInfo?.preferredPaymentMethod || '',
    taxExempt: clientInfo?.taxExempt || 'Not Exempt',
    taxExemptDocument: null,
    taxExemptDocumentUrl: clientInfo?.taxExemptDocumentUrl || ''
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
        favoriteColor: clientInfo.favoriteColor || prev.favoriteColor,
        preferredCommunication: clientInfo.preferredCommunication || prev.preferredCommunication,
        preferredPaymentMethod: clientInfo.preferredPaymentMethod || prev.preferredPaymentMethod,
        taxExempt: clientInfo.taxExempt || prev.taxExempt,
        taxExemptDocumentUrl: clientInfo.taxExemptDocumentUrl || prev.taxExemptDocumentUrl
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
      <div style={{ display: 'flex', gap: '64px', marginTop: '0', justifyContent: 'flex-start' }} className="profile-section-container">
        {/* Left Column - Profile Icon */}
        <div style={{ flex: '0 0 240px', flexShrink: 0 }} className="profile-section-left">
          <h2 style={{ 
            fontSize: '20px', 
            fontWeight: '300', 
            color: brandCharcoal,
            fontFamily: "'Domaine Text', serif",
            marginBottom: '32px',
            letterSpacing: '-0.01em',
            textAlign: 'center'
          }} className="profile-title">
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
          }} className="profile-image-container">
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
        <div style={{ flex: '1', maxWidth: '600px', marginLeft: '120px' }} className="profile-section-right">
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

          {/* Professional Preferences Section */}
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
              PROFESSIONAL PREFERENCES
            </h3>
            
            {/* Preferred Method of Communication */}
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
                Preferred Method of Communication
              </label>
              {editingProfile ? (
                <select
                  value={formData.preferredCommunication || ''}
                  onChange={(e) => setFormData({ ...formData, preferredCommunication: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 0',
                    border: 'none',
                    borderBottom: '1px solid #d1d5db',
                    borderRadius: '0',
                    fontSize: '15px',
                    fontFamily: "'NeueHaasUnica', sans-serif",
                    backgroundColor: 'transparent',
                    color: brandCharcoal,
                    boxSizing: 'border-box',
                    outline: 'none',
                    cursor: 'pointer',
                    transition: 'border-color 0.2s'
                  }}
                >
                  <option value="">Select...</option>
                  <option value="Phone Call">Phone Call</option>
                  <option value="Email">Email</option>
                  <option value="Text">Text</option>
                </select>
              ) : (
                <div style={{ 
                  fontSize: '15px', 
                  color: brandCharcoal, 
                  padding: '8px 0',
                  borderBottom: '1px solid #e5e7eb',
                  minHeight: '23px'
                }}>
                  {formData.preferredCommunication || 'Not set'}
                </div>
              )}
            </div>

            {/* Preferred Payment Method */}
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
                Preferred Payment Method
              </label>
              {editingProfile ? (
                <select
                  value={formData.preferredPaymentMethod || ''}
                  onChange={(e) => setFormData({ ...formData, preferredPaymentMethod: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 0',
                    border: 'none',
                    borderBottom: '1px solid #d1d5db',
                    borderRadius: '0',
                    fontSize: '15px',
                    fontFamily: "'NeueHaasUnica', sans-serif",
                    backgroundColor: 'transparent',
                    color: brandCharcoal,
                    boxSizing: 'border-box',
                    outline: 'none',
                    cursor: 'pointer',
                    transition: 'border-color 0.2s'
                  }}
                >
                  <option value="">Select...</option>
                  <option value="ACH/Wire">ACH/Wire</option>
                  <option value="Check">Check</option>
                  <option value="Credit Card (3% Fee)">Credit Card (3% Fee)</option>
                </select>
              ) : (
                <div style={{ 
                  fontSize: '15px', 
                  color: brandCharcoal, 
                  padding: '8px 0',
                  borderBottom: '1px solid #e5e7eb',
                  minHeight: '23px'
                }}>
                  {formData.preferredPaymentMethod || 'Not set'}
                </div>
              )}
            </div>

            {/* Tax Exempt */}
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
                Tax Exempt
              </label>
              {editingProfile ? (
                <select
                  value={formData.taxExempt || 'Not Exempt'}
                  onChange={(e) => setFormData({ ...formData, taxExempt: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 0',
                    border: 'none',
                    borderBottom: '1px solid #d1d5db',
                    borderRadius: '0',
                    fontSize: '15px',
                    fontFamily: "'NeueHaasUnica', sans-serif",
                    backgroundColor: 'transparent',
                    color: brandCharcoal,
                    boxSizing: 'border-box',
                    outline: 'none',
                    cursor: 'pointer',
                    transition: 'border-color 0.2s'
                  }}
                >
                  <option value="Not Exempt">Not Exempt</option>
                  <option value="Exempt">Exempt</option>
                </select>
              ) : (
                <div style={{ 
                  fontSize: '15px', 
                  color: brandCharcoal, 
                  padding: '8px 0',
                  borderBottom: '1px solid #e5e7eb',
                  minHeight: '23px'
                }}>
                  {formData.taxExempt || 'Not Exempt'}
                </div>
              )}
            </div>

            {/* Tax Exempt Document Upload */}
            {formData.taxExempt === 'Exempt' && (
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
                  Tax Exempt Document
                </label>
                {editingProfile ? (
                  <div>
                    {formData.taxExemptDocumentUrl && (
                      <div style={{ 
                        marginBottom: '12px',
                        fontSize: '13px',
                        color: '#666',
                        fontFamily: "'NeueHaasUnica', sans-serif"
                      }}>
                        Current document: <a 
                          href={formData.taxExemptDocumentUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          style={{ color: '#6b7d47', textDecoration: 'underline' }}
                        >
                          View Document
                        </a>
                      </div>
                    )}
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={(e) => {
                        const file = e.target.files[0];
                        if (file) {
                          // In a real implementation, this would upload to a server
                          // For now, we'll store the file name and create a preview
                          const reader = new FileReader();
                          reader.onload = (event) => {
                            setFormData({ 
                              ...formData, 
                              taxExemptDocument: file,
                              taxExemptDocumentUrl: event.target.result // In production, this would be a server URL
                            });
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                      style={{ 
                        fontSize: '13px', 
                        fontFamily: "'NeueHaasUnica', sans-serif",
                        padding: '8px 0',
                        borderBottom: '1px solid #d1d5db',
                        width: '100%',
                        cursor: 'pointer'
                      }}
                    />
                    <div style={{ 
                      marginTop: '8px',
                      fontSize: '12px',
                      color: '#666',
                      fontFamily: "'NeueHaasUnica', sans-serif",
                      fontStyle: 'italic'
                    }}>
                      Accepted formats: PDF, JPG, PNG
                    </div>
                  </div>
                ) : (
                  <div style={{ 
                    fontSize: '15px', 
                    color: brandCharcoal, 
                    padding: '8px 0',
                    borderBottom: '1px solid #e5e7eb',
                    minHeight: '23px'
                  }}>
                    {formData.taxExemptDocumentUrl ? (
                      <a 
                        href={formData.taxExemptDocumentUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        style={{ color: '#6b7d47', textDecoration: 'underline' }}
                      >
                        View Tax Exempt Document
                      </a>
                    ) : (
                      'No document uploaded'
                    )}
                  </div>
                )}
              </div>
            )}
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

      {/* Action Buttons - Soho House/Flamingo Estate Style */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'flex-end', 
        gap: '16px', 
        marginTop: '72px',
        paddingTop: '32px',
        borderTop: '1px solid #e8e8e3'
      }}>
        {!editingProfile ? (
          <>
            {/* Edit Button */}
            <button
              onClick={() => setEditingProfile(true)}
              style={{
                padding: '14px 28px',
                backgroundColor: '#fafaf8',
                color: brandCharcoal,
                border: '1px solid #e8e8e3',
                borderRadius: '12px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: '500',
                fontFamily: "'NeueHaasUnica', sans-serif",
                letterSpacing: '0.02em',
                textTransform: 'uppercase',
                transition: 'all 0.3s ease',
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.02)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#f5f5f2';
                e.currentTarget.style.borderColor = '#d1d5db';
                e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.04)';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#fafaf8';
                e.currentTarget.style.borderColor = '#e8e8e3';
                e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.02)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              Edit
            </button>
            
            {/* Password Reset Button */}
            <button
              onClick={() => {
                const newPassword = prompt('Enter your new password (minimum 8 characters):');
                if (newPassword && newPassword.length >= 8) {
                  // TODO: Implement password reset API call
                  alert('Password reset requested. Please contact support to complete the password change.');
                } else if (newPassword) {
                  alert('Password must be at least 8 characters long.');
                }
              }}
              style={{
                padding: '14px 28px',
                backgroundColor: '#fafaf8',
                color: brandCharcoal,
                border: '1px solid #e8e8e3',
                borderRadius: '12px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: '500',
                fontFamily: "'NeueHaasUnica', sans-serif",
                letterSpacing: '0.02em',
                textTransform: 'uppercase',
                transition: 'all 0.3s ease',
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.02)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#f5f5f2';
                e.currentTarget.style.borderColor = '#d1d5db';
                e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.04)';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#fafaf8';
                e.currentTarget.style.borderColor = '#e8e8e3';
                e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.02)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              Reset Password
            </button>
            
            {/* Logout Button */}
            <button
              onClick={() => {
                if (window.confirm('Are you sure you want to log out?')) {
                  onLogout();
                }
              }}
              style={{
                padding: '14px 28px',
                backgroundColor: brandCharcoal,
                color: '#fafaf8',
                border: 'none',
                borderRadius: '12px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: '500',
                fontFamily: "'NeueHaasUnica', sans-serif",
                letterSpacing: '0.02em',
                textTransform: 'uppercase',
                transition: 'all 0.3s ease',
                boxShadow: '0 2px 6px rgba(0, 0, 0, 0.08)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#1a1a1a';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.12)';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = brandCharcoal;
                e.currentTarget.style.boxShadow = '0 2px 6px rgba(0, 0, 0, 0.08)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              Logout
            </button>
          </>
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
                padding: '14px 28px',
                backgroundColor: '#fafaf8',
                color: brandCharcoal,
                border: '1px solid #e8e8e3',
                borderRadius: '12px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: '500',
                fontFamily: "'NeueHaasUnica', sans-serif",
                letterSpacing: '0.02em',
                textTransform: 'uppercase',
                transition: 'all 0.3s ease',
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.02)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#f5f5f2';
                e.currentTarget.style.borderColor = '#d1d5db';
                e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.04)';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#fafaf8';
                e.currentTarget.style.borderColor = '#e8e8e3';
                e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.02)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              style={{
                padding: '14px 28px',
                backgroundColor: brandCharcoal,
                color: '#fafaf8',
                border: 'none',
                borderRadius: '12px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: '500',
                fontFamily: "'NeueHaasUnica', sans-serif",
                letterSpacing: '0.02em',
                textTransform: 'uppercase',
                transition: 'all 0.3s ease',
                boxShadow: '0 2px 6px rgba(0, 0, 0, 0.08)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#1a1a1a';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.12)';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = brandCharcoal;
                e.currentTarget.style.boxShadow = '0 2px 6px rgba(0, 0, 0, 0.08)';
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

// ============================================
// OVERVIEW SECTION
// ============================================

function OverviewSection({ clientInfo, spendData, proposals = [], setSelectedProposal, brandCharcoal = '#2C2C2C' }) {
  const [shopifyProducts, setShopifyProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  
  // Fetch Shopify products on mount
  useEffect(() => {
    const fetchProducts = async () => {
      setLoadingProducts(true);
      const products = await shopifyService.getFeaturedProducts();
      setShopifyProducts(products);
      setLoadingProducts(false);
    };
    fetchProducts();
  }, []);
  
  const currentYear = new Date().getFullYear();
  const yearProposals = proposals.filter(p => {
    if (p.status === 'Cancelled') return false;
    
    // For historical projects, check eventDate or use timestamp
    if (p.isHistorical) {
      if (p.eventDate) {
        // Try to extract year from eventDate string (e.g., "April 5, 2025" or "April 5-13, 2025")
        const yearMatch = p.eventDate.match(/\d{4}/);
        if (yearMatch) {
          return parseInt(yearMatch[0]) === currentYear;
        }
      }
      // Fall back to timestamp if available
      if (p.timestamp) {
        const proposalYear = new Date(p.timestamp).getFullYear();
        return proposalYear === currentYear;
      }
      return false;
    }
    
    // For regular projects, use startDate
    if (!p.startDate) return false;
    const start = parseDateSafely(p.startDate);
    if (!start || isNaN(start.getTime())) return false;
    const proposalYear = start.getFullYear();
    return proposalYear === currentYear;
  }).sort((a, b) => {
    // Use shared utility function for consistent sorting
    const dateA = getSortableDateFromProposal(a);
    const dateB = getSortableDateFromProposal(b);
    const timeA = dateA.getTime();
    const timeB = dateB.getTime();
    
    // Primary sort: by date (descending - newest first)
    if (timeB !== timeA) {
      return timeB - timeA;
    }
    
    // Secondary sort: by projectNumber (descending) if dates are equal
    const projectNumA = parseInt(a.projectNumber) || 0;
    const projectNumB = parseInt(b.projectNumber) || 0;
    return projectNumB - projectNumA;
  });
  
  const currentYearSpend = yearProposals.reduce((total, proposal) => {
    return total + calculateProductSpend(proposal);
  }, 0);
  
  let tierBaseSpend = currentYearSpend;
  let carriedOverTier = null;
  
  if (currentYear >= 2026) {
    const year2025Proposals = proposals.filter(p => {
      if (p.status === 'Cancelled') return false;
      
      // For historical projects, check eventDate or use timestamp
      if (p.isHistorical) {
        if (p.eventDate) {
          const yearMatch = p.eventDate.match(/\d{4}/);
          if (yearMatch) {
            return parseInt(yearMatch[0]) === 2025;
          }
        }
        if (p.timestamp) {
          const proposalYear = new Date(p.timestamp).getFullYear();
          return proposalYear === 2025;
        }
        return false;
      }
      
      // For regular projects, use startDate
      if (!p.startDate) return false;
      const start = parseDateSafely(p.startDate);
      if (!start || isNaN(start.getTime())) return false;
      const proposalYear = start.getFullYear();
      return proposalYear === 2025;
    });
    
    const year2025Spend = year2025Proposals.reduce((total, proposal) => {
      return total + calculateProductSpend(proposal);
    }, 0);
    
    if (year2025Spend >= 100000) {
      carriedOverTier = { discount: 25, tier: 'Founders Estate', baseSpend: year2025Spend };
    } else if (year2025Spend >= 50000) {
      carriedOverTier = { discount: 20, tier: 'Inner Circle', baseSpend: year2025Spend };
    } else {
      carriedOverTier = { discount: 15, tier: 'House Member', baseSpend: year2025Spend };
    }
    
    tierBaseSpend = carriedOverTier.baseSpend;
  }
  
  const getCurrentTier = () => {
    if (carriedOverTier) {
      const tier = carriedOverTier.tier;
      if (tier === 'Founders Estate') {
        return { discount: 25, tier: 'Founders Estate', nextTier: null, progress: 100, nextTierName: null };
      } else if (tier === 'Inner Circle') {
        const progress = Math.min((currentYearSpend / 50000) * 100, 100);
        return { discount: 20, tier: 'Inner Circle', nextTier: 'Founders Estate (25%)', progress: progress, nextTierName: 'Founders Estate' };
      } else {
        const progress = Math.min((currentYearSpend / 50000) * 100, 100);
        return { discount: 15, tier: 'House Member', nextTier: 'Inner Circle (20%)', progress: progress, nextTierName: 'Inner Circle' };
      }
    }
    
    if (tierBaseSpend >= 100000) {
      return { discount: 25, tier: 'Founders Estate', nextTier: null, progress: 100, nextTierName: null };
    } else if (tierBaseSpend >= 50000) {
      return { discount: 20, tier: 'Inner Circle', nextTier: 'Founders Estate (25%)', progress: ((tierBaseSpend - 50000) / 50000) * 100, nextTierName: 'Founders Estate' };
    } else {
      return { discount: 15, tier: 'House Member', nextTier: 'Inner Circle (20%)', progress: (tierBaseSpend / 50000) * 100, nextTierName: 'Inner Circle' };
    }
  };

  const tier = getCurrentTier();
  
  // Calculate progress details
  let pointsToNextTier = 0;
  let nextTierPoints = 0;
  
  if (tier.nextTier) {
    if (tier.tier === 'House Member') {
      nextTierPoints = 50000;
      pointsToNextTier = Math.ceil(50000 - currentYearSpend);
    } else if (tier.tier === 'Inner Circle') {
      nextTierPoints = 100000;
      if (carriedOverTier) {
        pointsToNextTier = Math.ceil(50000 - currentYearSpend);
      } else {
        pointsToNextTier = Math.ceil(100000 - currentYearSpend);
      }
    }
  }
  
  const currentPoints = Math.round(currentYearSpend);
  const progressPercent = Math.round(tier.progress);
  
  // Get active proposals (up to 3) - most recent first
  const activeProposals = proposals.filter(p => 
    p.status === 'Pending' || p.status === 'Active' || (p.status === 'Approved' && isFutureDate(p.startDate)) || (p.status === 'Confirmed' && isFutureDate(p.startDate))
  )
  .sort((a, b) => {
    // Get dates for sorting - most recent first
    let dateA = null;
    if (a.isHistorical && a.timestamp) {
      dateA = new Date(a.timestamp);
    } else if (a.startDate) {
      dateA = parseDateSafely(a.startDate);
    } else if (a.eventDate) {
      if (typeof a.eventDate === 'string' && a.eventDate.includes('GMT')) {
        dateA = new Date(a.eventDate);
      } else if (a.eventDate instanceof Date) {
        dateA = a.eventDate;
      }
    }
    
    let dateB = null;
    if (b.isHistorical && b.timestamp) {
      dateB = new Date(b.timestamp);
    } else if (b.startDate) {
      dateB = parseDateSafely(b.startDate);
    } else if (b.eventDate) {
      if (typeof b.eventDate === 'string' && b.eventDate.includes('GMT')) {
        dateB = new Date(b.eventDate);
      } else if (b.eventDate instanceof Date) {
        dateB = b.eventDate;
      }
    }
    
    const timeA = dateA ? dateA.getTime() : 0;
    const timeB = dateB ? dateB.getTime() : 0;
    return timeB - timeA; // Descending: newest first
  })
  .slice(0, 3);
  
  // Get greeting based on time of day
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };
  
  const firstName = clientInfo?.firstName || clientInfo?.fullName?.split(' ')[0] || '';
  const currentMonth = new Date().toLocaleString('en-US', { month: 'long' });
  
  // Panel styling (reused throughout)
  const panelStyle = {
    backgroundColor: '#fafaf8',
    border: 'none',
    padding: '64px 48px',
    borderRadius: '20px',
    marginBottom: '48px',
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.06)'
  };
  
  const smallerPanelStyle = {
    backgroundColor: '#fafaf8',
    border: 'none',
    padding: '32px',
    borderRadius: '20px',
    marginBottom: '48px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)'
  };

  return (
    <div>
      {/* Autographer Font */}
      <style dangerouslySetInnerHTML={{ __html: `
        @font-face {
          font-family: 'Autographer';
          src: url('/Autographer.woff') format('woff');
          font-weight: normal;
          font-style: normal;
          font-display: swap;
        }
      ` }} />
      
      {/* 1. Welcome Header with Logo and Signature */}
      <style dangerouslySetInnerHTML={{ __html: `
        .overview-hero {
          padding: 80px 96px 64px;
          background-color: transparent;
          margin-bottom: 48px;
          text-align: center;
        }
        .overview-hero__logo {
          width: 120px;
          height: 120px;
          margin: 0 auto 32px;
          display: block;
        }
        .overview-hero__title {
          font-family: 'Domaine Text', serif;
          font-size: 36px;
          line-height: 1.3;
          font-weight: 400;
          letter-spacing: -0.01em;
          color: #3A3632;
          margin-bottom: 16px;
        }
        .overview-hero__subtitle {
          font-family: 'NeueHaasUnica', sans-serif;
          font-size: 16px;
          line-height: 1.6;
          color: rgba(58, 54, 50, 0.75);
          max-width: 600px;
          margin: 0 auto 40px;
        }
        .overview-hero__signature {
          font-family: 'Autographer', cursive;
          font-size: 18px;
          color: #3A3632;
          margin-top: 40px;
        }
        .overview-hero__signature-line {
          font-family: 'NeueHaasUnica', sans-serif;
          font-size: 14px;
          color: rgba(58, 54, 50, 0.7);
          margin-bottom: 8px;
        }
        @media (max-width: 768px) {
          .overview-hero {
            padding: 64px 48px 48px;
          }
          .overview-hero__logo {
            width: 100px;
            height: 100px;
            margin-bottom: 24px;
          }
          .overview-hero__title {
            font-size: 32px;
          }
          .overview-hero__subtitle {
            font-size: 15px;
            max-width: 100%;
          }
        }
        @media (max-width: 480px) {
          .overview-hero {
            padding: 48px 24px 40px;
          }
          .overview-hero__logo {
            width: 80px;
            height: 80px;
            margin-bottom: 20px;
          }
          .overview-hero__title {
            font-size: 28px;
          }
          .overview-hero__subtitle {
            font-size: 14px;
          }
          .overview-hero__signature {
            font-size: 16px;
          }
        }
      ` }} />
      <div className="overview-hero">
        {/* Logo Mark */}
        <img 
          src="/mayker_round-stamp-lines-black.png" 
          alt="Mayker" 
          className="overview-hero__logo"
          onError={(e) => {
            // Fallback if image doesn't exist
            e.target.style.display = 'none';
          }}
        />
        
        {/* Headline */}
        <div className="overview-hero__title">
          {getGreeting()}, {firstName ? firstName : 'there'}.
        </div>
        
        {/* Sub-head */}
        <div className="overview-hero__subtitle">
          Welcome to your Mayker Reserve portal. A curated landing spot of your membership, projects, and benefits.
        </div>
      </div>

      {/* 2. Membership Status + Monthly Perk (Side by Side) */}
      <div style={{
        marginBottom: '48px'
      }}>
        {/* Section Label */}
        <div style={{
          fontSize: '11px',
          fontWeight: '400',
          color: '#6b6b6b',
          fontFamily: "'NeueHaasUnica', sans-serif",
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          marginBottom: '16px',
          textAlign: 'left'
        }}>
          Your Reserve Highlights
        </div>
        
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '48px'
        }} className="grid-2-col">
        {/* Membership Status (Medallion Panel) */}
        <div style={{
          ...panelStyle,
          position: 'relative',
          marginBottom: 0,
          background: `
            radial-gradient(circle at center, rgba(250, 250, 248, 0.4) 0%, rgba(250, 250, 248, 0.8) 50%, #fafaf8 100%),
            url("data:image/svg+xml,%3Csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3E%3Cdefs%3E%3Cpattern id='linen' x='0' y='0' width='100' height='100' patternUnits='userSpaceOnUse'%3E%3Cpath d='M0 0h100v100H0z' fill='%23fafaf8'/%3E%3Cpath d='M0 0h1v100H0z' fill='%23f5f5f0' opacity='0.3'/%3E%3Cpath d='M0 0h100v1H0z' fill='%23f5f5f0' opacity='0.3'/%3E%3C/pattern%3E%3C/defs%3E%3Crect width='100' height='100' fill='url(%23linen)'/%3E%3C/svg%3E") repeat
          `,
          backgroundSize: 'auto, 100px 100px'
        }}>
          {/* Icon watermark */}
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '280px',
            height: '280px',
            opacity: 0.03,
            pointerEvents: 'none',
            zIndex: 0
          }}>
            <img 
              src="/mayker_icon-black.svg" 
              alt=""
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain'
              }}
              onError={(e) => {
                if (!e.target.src.includes('/assets/')) {
                  e.target.src = '/assets/mayker_icon-black.svg';
                } else {
                  e.target.style.display = 'none';
                }
              }}
            />
          </div>
        
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          zIndex: 1
        }}>
          {/* Status Medallion - Reduced size */}
          <div style={{
            position: 'relative',
            width: '200px',
            height: '200px',
            marginBottom: '40px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            {/* Radial gradient behind medallion */}
            <div style={{
              position: 'absolute',
              width: '240px',
              height: '240px',
              borderRadius: '50%',
              background: `radial-gradient(circle, rgba(${tier.tier === 'House Member' ? '107, 125, 71' : tier.tier === 'Inner Circle' ? '212, 175, 55' : '44, 44, 44'}, 0.08) 0%, transparent 70%)`,
              zIndex: 0
            }} />
            <div style={{
              position: 'absolute',
              width: '200px',
              height: '200px',
              borderRadius: '50%',
              border: tier.tier === 'House Member' ? '3px solid #6b7d47' : tier.tier === 'Inner Circle' ? '3px solid #d4af37' : '3px solid #2C2C2C',
              backgroundColor: 'transparent',
              zIndex: 1
            }} />
            <div style={{
              textAlign: 'center',
              zIndex: 2,
              position: 'relative'
            }}>
              <div style={{
                fontSize: '34px',
                fontWeight: '300',
                color: brandCharcoal,
                fontFamily: "'Domaine Text', serif",
                letterSpacing: '-0.02em',
                lineHeight: '1.2',
                marginBottom: '10px'
              }}>
                {tier.tier}
              </div>
              <div style={{
                fontSize: '18px',
                fontWeight: '300',
                color: '#8b8b8b',
                fontFamily: "'NeueHaasUnica', sans-serif",
                letterSpacing: '-0.01em'
              }}>
                {tier.discount}% Off
              </div>
            </div>
          </div>

          {/* Progress Section */}
          {tier.nextTier && (
            <div style={{
              width: '100%',
              maxWidth: '500px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center'
            }}>
              {/* Thin horizontal olive rule */}
              <div style={{
                width: '60px',
                height: '1px',
                backgroundColor: '#6b7d47',
                marginBottom: '20px',
                opacity: 0.3
              }} />
              <div style={{
                fontSize: '10px',
                color: '#8b8b8b',
                fontFamily: "'NeueHaasUnica', sans-serif",
                fontWeight: '500',
                textTransform: 'uppercase',
                letterSpacing: '0.15em',
                marginBottom: '20px',
                textAlign: 'center'
              }}>
                PROGRESS TOWARD {tier.nextTierName.toUpperCase()}
              </div>
              
              <div style={{
                width: '65%',
                height: '3px',
                backgroundColor: '#e8e8e3',
                borderRadius: '2px',
                marginBottom: '20px',
                overflow: 'hidden',
                position: 'relative'
              }}>
                <div style={{
                  width: `${Math.min(tier.progress, 100)}%`,
                  height: '100%',
                  backgroundColor: tier.tier === 'House Member' ? '#6b7d47' : tier.tier === 'Inner Circle' ? '#d4af37' : '#2C2C2C',
                  transition: 'width 0.8s ease',
                  borderRadius: '2px'
                }} />
              </div>
              
              <div style={{
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                <div style={{
                  fontSize: '16px',
                  color: brandCharcoal,
                  fontFamily: "'NeueHaasUnica', sans-serif",
                  fontWeight: '500',
                  lineHeight: '1.4'
                }}>
                  {pointsToNextTier.toLocaleString()} pts to {tier.nextTierName}
                </div>
                
                <div style={{
                  fontSize: '12px',
                  color: '#8b8b8b',
                  fontFamily: "'NeueHaasUnica', sans-serif",
                  fontWeight: '400',
                  lineHeight: '1.5'
                }}>
                  Progress: {progressPercent}% complete  •  {currentPoints.toLocaleString()} pts earned  •  {nextTierPoints.toLocaleString()} pts required
                </div>
              </div>
            </div>
          )}
          
          {/* Founders Estate Additional Info */}
          {tier.tier === 'Founders Estate' && (
            <div style={{
              marginTop: '32px',
              paddingTop: '32px',
              borderTop: '1px solid #e5e7eb',
              width: '100%',
              maxWidth: '500px'
            }}>
              <div style={{
                fontSize: '14px',
                color: brandCharcoal,
                fontFamily: "'NeueHaasUnica', sans-serif",
                fontWeight: '400',
                lineHeight: '1.6',
                marginBottom: '16px'
              }}>
                As a Founders Estate member, you receive 25% off all rental orders.
              </div>
              <div style={{
                fontSize: '13px',
                color: '#8b8b8b',
                fontFamily: "'NeueHaasUnica', sans-serif",
                fontWeight: '400',
                lineHeight: '1.6'
              }}>
                Points YTD: {Math.round(currentYearSpend).toLocaleString()}
              </div>
              <div style={{
                fontSize: '13px',
                color: '#8b8b8b',
                fontFamily: "'NeueHaasUnica', sans-serif",
                fontWeight: '400',
                lineHeight: '1.6',
                marginTop: '4px'
              }}>
                Projects YTD: {yearProposals.length}
              </div>
            </div>
          )}
        </div>
        </div>

        {/* Monthly Perk - Square with text overlay */}
        <div style={{
          ...panelStyle,
          marginBottom: 0,
          position: 'relative',
          padding: 0,
          aspectRatio: '1 / 1',
          overflow: 'hidden',
          borderRadius: '20px'
        }}>
          <img 
            src="/december-perk.jpg" 
            alt={`${currentMonth} Member Perk`}
            loading="lazy"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              position: 'absolute',
              top: 0,
              left: 0
            }}
            onError={(e) => {
              if (!e.target.src.includes('/assets/')) {
                e.target.src = '/assets/december-perk.jpg';
              } else if (!e.target.src.includes('december-perk')) {
                e.target.src = '/december-perk.png';
              } else {
                e.target.style.display = 'none';
              }
            }}
          />
          {/* Text overlay - moved up for better balance */}
          <div style={{
            position: 'absolute',
            top: '35%',
            left: 0,
            right: 0,
            transform: 'translateY(-50%)',
            background: 'linear-gradient(to bottom, rgba(250, 248, 243, 0.82) 0%, rgba(250, 248, 243, 0.78) 40%, rgba(250, 248, 243, 0.00) 100%)',
            padding: '48px',
            color: brandCharcoal
          }}>
            {/* Thin olive rule above title */}
            <div style={{
              width: '60px',
              height: '1px',
              backgroundColor: '#6b7d47',
              marginBottom: '12px',
              opacity: 0.4
            }} />
            <div style={{
              fontSize: '34px',
              fontWeight: '300',
              color: '#080808',
              fontFamily: "'Domaine Text', serif",
              letterSpacing: '0.4px',
              lineHeight: '1.2',
              marginBottom: '10px'
            }}>
              {currentMonth} Member Perk
            </div>
            <div style={{
              fontSize: '15px',
              color: '#2a2a2a',
              fontFamily: "'NeueHaasUnica', sans-serif",
              fontWeight: '400',
              lineHeight: '1.5',
              marginBottom: '14px'
            }}>
              A year-end thank you: Reserve Members receive 25% off all rental products.
            </div>
            <div style={{
              fontSize: '11px',
              color: '#5a5a5a',
              fontFamily: "'NeueHaasUnica', sans-serif",
              fontWeight: '400',
              lineHeight: '1.6',
              letterSpacing: '0.01em'
            }}>
              <div style={{ marginBottom: '4px' }}>Projects opened + closed between Dec 1–31, 2025</div>
              <div style={{ marginBottom: '4px' }}>Events occurring between Dec 1, 2025 – Mar 31, 2026</div>
              <div style={{ marginBottom: '4px' }}>Applies to rental products only</div>
              <div>Excludes custom fabrication + procurement</div>
            </div>
          </div>
        </div>
        </div>
      </div>

      {/* 4. Featured Products from Shopify */}
      {shopifyProducts.length > 0 && (
        <div style={panelStyle}>
          <div style={{
            fontSize: '18px',
            fontWeight: '300',
            color: brandCharcoal,
            fontFamily: "'Domaine Text', serif",
            letterSpacing: '-0.01em',
            marginBottom: '32px'
          }}>
            Discover the Newest Releases
          </div>
          
          {loadingProducts ? (
            <div style={{
              textAlign: 'center',
              padding: '48px',
              color: '#8b8b8b',
              fontFamily: "'NeueHaasUnica', sans-serif",
              fontSize: '14px'
            }}>
              Loading products...
            </div>
          ) : shopifyProducts.length === 1 ? (
            // Single product - large featured layout
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '48px',
              alignItems: 'center'
            }}>
              <div>
                {shopifyProducts[0].imageUrl && (
                  <img 
                    src={shopifyProducts[0].imageUrl} 
                    alt={shopifyProducts[0].imageAlt}
                    loading="lazy"
                    style={{
                      width: '100%',
                      borderRadius: '12px',
                      aspectRatio: '1',
                      objectFit: 'cover'
                    }}
                  />
                )}
              </div>
              <div>
                <h3 style={{
                  fontSize: '20px',
                  fontWeight: '300',
                  color: brandCharcoal,
                  fontFamily: "'Domaine Text', serif",
                  letterSpacing: '-0.01em',
                  marginBottom: '16px'
                }}>
                  {shopifyProducts[0].title}
                </h3>
                {shopifyProducts[0].description && (
                  <p style={{
                    fontSize: '14px',
                    color: '#8b8b8b',
                    fontFamily: "'NeueHaasUnica', sans-serif",
                    lineHeight: '1.6',
                    marginBottom: '24px'
                  }}>
                    {shopifyProducts[0].description.length > 150 
                      ? shopifyProducts[0].description.substring(0, 150) + '...'
                      : shopifyProducts[0].description}
                  </p>
                )}
                <a
                  href={shopifyProducts[0].url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-block',
                    padding: '12px 24px',
                    backgroundColor: '#6b7d47',
                    color: 'white',
                    textDecoration: 'none',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontFamily: "'NeueHaasUnica', sans-serif",
                    fontWeight: '500',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.backgroundColor = '#5a6b3a';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.backgroundColor = '#6b7d47';
                  }}
                >
                  View Product
                </a>
              </div>
            </div>
          ) : (
            // Multiple products - grid layout
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '24px'
            }}>
              {shopifyProducts.map((product) => (
                <div
                  key={product.id}
                  style={{
                    backgroundColor: 'white',
                    borderRadius: '12px',
                    padding: '24px',
                    border: '1px solid #e8e8e3',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    flexDirection: 'column'
                  }}
                >
                  {product.imageUrl && (
                    <img 
                      src={product.imageUrl} 
                      alt={product.imageAlt}
                      loading="lazy"
                      style={{
                        width: '100%',
                        borderRadius: '8px',
                        aspectRatio: '1',
                        objectFit: 'cover',
                        marginBottom: '16px'
                      }}
                    />
                  )}
                  <h3 style={{
                    fontSize: '16px',
                    fontWeight: '500',
                    color: brandCharcoal,
                    fontFamily: "'NeueHaasUnica', sans-serif",
                    marginBottom: '8px'
                  }}>
                    {product.title}
                  </h3>
                  {product.description && (
                    <p style={{
                      fontSize: '12px',
                      color: '#8b8b8b',
                      fontFamily: "'NeueHaasUnica', sans-serif",
                      lineHeight: '1.5',
                      marginBottom: '16px',
                      flex: 1
                    }}>
                      {product.description.length > 100 
                        ? product.description.substring(0, 100) + '...'
                        : product.description}
                    </p>
                  )}
                  <a
                    href={product.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-block',
                      padding: '10px 20px',
                      backgroundColor: 'transparent',
                      color: '#6b7d47',
                      border: '1px solid #6b7d47',
                      textDecoration: 'none',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontFamily: "'NeueHaasUnica', sans-serif",
                      fontWeight: '500',
                      textAlign: 'center',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.backgroundColor = '#6b7d47';
                      e.target.style.color = 'white';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.backgroundColor = 'transparent';
                      e.target.style.color = '#6b7d47';
                    }}
                  >
                    View Product
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 5. Active Projects Snapshot */}
      {activeProposals.length > 0 && (
        <div style={{
          ...panelStyle,
          backgroundColor: '#E8E3DD'
        }}>
          <div style={{
            fontSize: '18px',
            fontWeight: '300',
            color: brandCharcoal,
            fontFamily: "'Domaine Text', serif",
            letterSpacing: '-0.01em',
            marginBottom: '24px'
          }}>
            Your Active Projects
          </div>
          
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            {activeProposals.map((proposal, index) => (
              <div
                key={index}
                style={{
                  backgroundColor: 'white',
                  padding: '20px',
                  borderRadius: '12px',
                  border: '1px solid #e8e8e3',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  transition: 'all 0.2s ease'
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: '16px',
                    fontWeight: '500',
                    color: brandCharcoal,
                    fontFamily: "'NeueHaasUnica', sans-serif",
                    marginBottom: '8px'
                  }}>
                    {proposal.venueName || 'Untitled Project'}
                  </div>
                  <div style={{
                    fontSize: '12px',
                    color: '#8b8b8b',
                    fontFamily: "'NeueHaasUnica', sans-serif",
                    marginBottom: '4px'
                  }}>
                    {proposal.eventDate || (proposal.startDate ? new Date(proposal.startDate).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric'
                    }) : 'Date TBD')}
                  </div>
                  <div style={{
                    fontSize: '12px',
                    color: '#8b8b8b',
                    fontFamily: "'NeueHaasUnica', sans-serif"
                  }}>
                    {proposal.city}, {proposal.state}
                  </div>
                </div>
                
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px'
                }}>
                  <span style={{
                    display: 'inline-block',
                    padding: '4px 12px',
                    borderRadius: '12px',
                    fontSize: '11px',
                    fontWeight: '500',
                    backgroundColor: proposal.status === 'Pending' ? '#f5f1e6' : proposal.status === 'Approved' ? '#e8f5e9' : '#f3f4f6',
                    color: proposal.status === 'Pending' ? '#b8860b' : proposal.status === 'Approved' ? '#2e7d32' : '#666',
                    fontFamily: "'NeueHaasUnica', sans-serif"
                  }}>
                    {proposal.status || 'Pending'}
                  </span>
                  
                  {/* View Project button temporarily disabled */}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 8. Featured Member Section - Editorial Block */}
      <div 
        className="featured-member-section"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          marginBottom: '48px',
          borderRadius: '20px',
          overflow: 'hidden',
          backgroundColor: '#FAF8F3',
          alignItems: 'stretch'
        }}
      >
        {/* Left: Image - 50% width, maintains aspect ratio like Member Perk */}
        <div style={{
          position: 'relative',
          overflow: 'hidden',
          borderRadius: '20px 0 0 20px',
          backgroundColor: '#DED6CE',
          padding: 0,
          aspectRatio: '4 / 3'
        }}>
          <img 
            src="/featured-member.jpg" 
            alt="Hill & Co. Creative"
            loading="lazy"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              position: 'absolute',
              top: 0,
              left: 0
            }}
            onError={(e) => {
              if (!e.target.src.includes('/assets/')) {
                e.target.src = '/assets/featured-member.jpg';
              } else {
                e.target.style.display = 'none';
              }
            }}
          />
        </div>
        
        {/* Right: Editorial Text Block - 50% width, matches image height */}
        <div style={{
          backgroundColor: '#DED6CE',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '80px 60px',
          borderRadius: '0 20px 20px 0',
          height: '100%',
          minHeight: '100%'
        }}>
          <div style={{
            width: '100%',
            maxWidth: '560px'
          }}>
            {/* Label */}
            <div style={{
              fontSize: '10px',
              fontWeight: '500',
              color: '#6b6b6b',
              fontFamily: "'NeueHaasUnica', sans-serif",
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              marginBottom: '32px',
              lineHeight: '1.4'
            }}>
              FEATURED MEMBER
            </div>
            
            {/* Headline */}
            <div style={{
              fontSize: '42px',
              fontWeight: '300',
              color: '#1a1a1a',
              fontFamily: "'Domaine Text', serif",
              letterSpacing: '-0.02em',
              lineHeight: '1.2',
              marginBottom: '12px'
            }}>
              Hill and Co.
            </div>
            
            {/* Subheadline */}
            <div style={{
              fontSize: '11px',
              fontWeight: '400',
              color: '#6b6b6b',
              fontFamily: "'NeueHaasUnica', sans-serif",
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              marginBottom: '40px',
              lineHeight: '1.5'
            }}>
              CHARLESTON, SC
            </div>
            
            {/* Body Copy */}
            <div style={{
              fontSize: '14px',
              fontWeight: '400',
              color: '#2a2a2a',
              fontFamily: "'NeueHaasUnica', sans-serif",
              lineHeight: '1.8',
              letterSpacing: '0.01em',
              marginBottom: '32px'
            }}>
              Hill and Co. brings a quiet confidence to color, pattern, and texture—spaces that feel considered, layered, and beautifully lived in.
            </div>
            
            {/* Link */}
            <a 
              href="https://www.hillandcocreative.com/"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: '14px',
                color: '#6b7d47',
                fontFamily: "'NeueHaasUnica', sans-serif",
                textDecoration: 'none',
                fontWeight: '400',
                letterSpacing: '0.01em',
                transition: 'all 0.2s ease',
                display: 'inline-block'
              }}
              onMouseEnter={(e) => {
                e.target.style.textDecoration = 'underline';
                e.target.style.color = '#5a6b3a';
              }}
              onMouseLeave={(e) => {
                e.target.style.textDecoration = 'none';
                e.target.style.color = '#6b7d47';
              }}
            >
              hillandcocreative.com
            </a>
          </div>
        </div>
      </div>
      
      {/* Responsive Styles for Featured Member Section */}
      <style dangerouslySetInnerHTML={{ __html: `
        .featured-member-section {
          display: grid !important;
          grid-template-columns: 1fr 1fr !important;
          align-items: stretch !important;
        }
        .featured-member-section > div:first-child {
          position: relative !important;
          overflow: hidden !important;
          aspect-ratio: 4 / 3 !important;
        }
        .featured-member-section > div:first-child img {
          width: 100% !important;
          height: 100% !important;
          object-fit: cover !important;
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
        }
        .featured-member-section > div:last-child {
          height: 100% !important;
          min-height: 100% !important;
        }
        @media (max-width: 900px) {
          /* Tablet and below: Stack vertically for better readability */
          .featured-member-section {
            grid-template-columns: 1fr !important;
            grid-template-rows: auto auto !important;
          }
          .featured-member-section > div:first-child {
            border-radius: 20px 20px 0 0 !important;
            aspect-ratio: 4 / 3 !important;
            width: 100% !important;
          }
          .featured-member-section > div:first-child img {
            width: 100% !important;
            height: 100% !important;
            object-fit: cover !important;
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
          }
          .featured-member-section > div:last-child {
            border-radius: 0 0 20px 20px !important;
            padding: 64px 40px !important;
            height: auto !important;
            min-height: auto !important;
          }
        }
      ` }} />

      {/* 9. Concierge Section - Editorial 3-Column Layout */}
      <div style={{
        backgroundColor: '#F2F1ED',
        padding: '64px 48px',
        marginBottom: '48px',
        borderRadius: '20px'
      }} className="concierge-section">
        <div style={{
          fontSize: '18px',
          fontWeight: '300',
          color: brandCharcoal,
          fontFamily: "'Domaine Text', serif",
          letterSpacing: '-0.01em',
          marginBottom: '24px'
        }}>
          Concierge
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: '32px',
          maxWidth: '1200px',
          margin: '0 auto'
        }} className="concierge-grid">
          {/* Column 1: General Inquiries */}
          <div style={{
            textAlign: 'center'
          }}>
            <div style={{
              width: '100%',
              aspectRatio: '3/4',
              marginBottom: '32px',
              overflow: 'hidden'
            }}>
              <img 
                src="/concierge-1.jpg" 
                alt="General Inquiries"
                loading="lazy"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: 'block'
                }}
                onError={(e) => {
                  if (!e.target.src.includes('/assets/')) {
                    e.target.src = '/assets/concierge-1.jpg';
                  } else {
                    e.target.style.display = 'none';
                  }
                }}
              />
            </div>
            <div style={{
              fontSize: '16px',
              fontWeight: '300',
              fontStyle: 'italic',
              color: '#6b6b6b',
              fontFamily: "'Domaine Text', serif",
              letterSpacing: '-0.01em',
              lineHeight: '1.4',
              marginBottom: '4px'
            }}>
              General
            </div>
            <div style={{
              fontSize: '24px',
              fontWeight: '300',
              color: '#1a1a1a',
              fontFamily: "'Domaine Text', serif",
              letterSpacing: '-0.01em',
              lineHeight: '1.3',
              marginBottom: '24px'
            }}>
              Inquiries
            </div>
            <a 
              href="mailto:events@mayker.com"
              style={{
                fontSize: '12px',
                color: '#6b7d47',
                fontFamily: "'NeueHaasUnica', sans-serif",
                textDecoration: 'none',
                fontWeight: '400',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.target.style.textDecoration = 'underline';
                e.target.style.color = '#5a6b3a';
              }}
              onMouseLeave={(e) => {
                e.target.style.textDecoration = 'none';
                e.target.style.color = '#6b7d47';
              }}
            >
              EVENTS@MAYKER.COM
            </a>
          </div>

          {/* Column 2: Custom Project Inquiries */}
          <div style={{
            textAlign: 'center'
          }}>
            <div style={{
              width: '100%',
              aspectRatio: '3/4',
              marginBottom: '32px',
              overflow: 'hidden'
            }}>
              <img 
                src="/concierge-2.jpg" 
                alt="Custom Project Inquiries"
                loading="lazy"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: 'block'
                }}
                onError={(e) => {
                  if (!e.target.src.includes('/assets/')) {
                    e.target.src = '/assets/concierge-2.jpg';
                  } else {
                    e.target.style.display = 'none';
                  }
                }}
              />
            </div>
            <div style={{
              fontSize: '16px',
              fontWeight: '300',
              fontStyle: 'italic',
              color: '#6b6b6b',
              fontFamily: "'Domaine Text', serif",
              letterSpacing: '-0.01em',
              lineHeight: '1.4',
              marginBottom: '4px'
            }}>
              Custom Project
            </div>
            <div style={{
              fontSize: '24px',
              fontWeight: '300',
              color: '#1a1a1a',
              fontFamily: "'Domaine Text', serif",
              letterSpacing: '-0.01em',
              lineHeight: '1.3',
              marginBottom: '24px'
            }}>
              Inquiries
            </div>
            <a 
              href="mailto:noelle@mayker.com"
              style={{
                fontSize: '12px',
                color: '#6b7d47',
                fontFamily: "'NeueHaasUnica', sans-serif",
                textDecoration: 'none',
                fontWeight: '400',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.target.style.textDecoration = 'underline';
                e.target.style.color = '#5a6b3a';
              }}
              onMouseLeave={(e) => {
                e.target.style.textDecoration = 'none';
                e.target.style.color = '#6b7d47';
              }}
            >
              NOELLE@MAYKER.COM
            </a>
          </div>

          {/* Column 3: Partnership Inquiries */}
          <div style={{
            textAlign: 'center'
          }}>
            <div style={{
              width: '100%',
              aspectRatio: '3/4',
              marginBottom: '32px',
              overflow: 'hidden'
            }}>
              <img 
                src="/concierge-3.jpg" 
                alt="Partnership Inquiries"
                loading="lazy"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: 'block'
                }}
                onError={(e) => {
                  if (!e.target.src.includes('/assets/')) {
                    e.target.src = '/assets/concierge-3.jpg';
                  } else {
                    e.target.style.display = 'none';
                  }
                }}
              />
            </div>
            <div style={{
              fontSize: '16px',
              fontWeight: '300',
              fontStyle: 'italic',
              color: '#6b6b6b',
              fontFamily: "'Domaine Text', serif",
              letterSpacing: '-0.01em',
              lineHeight: '1.4',
              marginBottom: '4px'
            }}>
              Partnership
            </div>
            <div style={{
              fontSize: '24px',
              fontWeight: '300',
              color: '#1a1a1a',
              fontFamily: "'Domaine Text', serif",
              letterSpacing: '-0.01em',
              lineHeight: '1.3',
              marginBottom: '24px'
            }}>
              Inquiries
            </div>
            <a 
              href="mailto:constance@mayker.com"
              style={{
                fontSize: '12px',
                color: '#6b7d47',
                fontFamily: "'NeueHaasUnica', sans-serif",
                textDecoration: 'none',
                fontWeight: '400',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.target.style.textDecoration = 'underline';
                e.target.style.color = '#5a6b3a';
              }}
              onMouseLeave={(e) => {
                e.target.style.textDecoration = 'none';
                e.target.style.color = '#6b7d47';
              }}
            >
              CONSTANCE@MAYKER.COM
            </a>
          </div>
        </div>
      </div>

      {/* 10. Footer Band */}
      <div style={{
        width: '100%',
        padding: '60px 48px',
        backgroundColor: 'transparent',
        marginTop: '48px',
        textAlign: 'center'
      }}>
        <div style={{
          fontSize: '12px',
          color: '#2a2a2a',
          fontFamily: "'NeueHaasUnica', sans-serif",
          fontWeight: '400',
          letterSpacing: '0.05em',
          lineHeight: '1.6',
          textTransform: 'uppercase'
        }}>
          THANK YOU FOR BEING PART OF MAYKER RESERVE.
        </div>
      </div>
    </div>
  );
}

function PerformanceSection({ spendData, proposals = [], brandCharcoal = '#2C2C2C' }) {
  // Calculate product spend for each proposal (rental products + product care + service fees, excluding delivery and tax)
  const calculateProductSpend = (proposal) => {
    try {
      // If this is a historical project, use the pre-calculated product total
      if (proposal.isHistorical && proposal.historicalProductTotal) {
        return parseFloat(proposal.historicalProductTotal) || 0;
      }
      
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
  
  // Get current year proposals for YTD points
  const currentYear = new Date().getFullYear();
  // Filter and sort year proposals (most recent first)
  const yearProposals = proposals.filter(p => {
    if (p.status === 'Cancelled') return false;
    
    // For historical projects, check eventDate or use timestamp
    if (p.isHistorical) {
      if (p.eventDate) {
        // Try to extract year from eventDate string (e.g., "April 5, 2025" or "April 5-13, 2025")
        const yearMatch = p.eventDate.match(/\d{4}/);
        if (yearMatch) {
          return parseInt(yearMatch[0]) === currentYear;
        }
      }
      // Fall back to timestamp if available
      if (p.timestamp) {
        const proposalYear = new Date(p.timestamp).getFullYear();
        return proposalYear === currentYear;
      }
      return false;
    }
    
    // For regular projects, use startDate
    if (!p.startDate) return false;
    const start = parseDateSafely(p.startDate);
    if (!start || isNaN(start.getTime())) return false;
    const proposalYear = start.getFullYear();
    return proposalYear === currentYear;
  }).sort((a, b) => {
    // Use shared utility function for consistent sorting
    const dateA = getSortableDateFromProposal(a);
    const dateB = getSortableDateFromProposal(b);
    const timeA = dateA.getTime();
    const timeB = dateB.getTime();
    
    // Primary sort: by date (descending - newest first)
    if (timeB !== timeA) {
      return timeB - timeA;
    }
    
    // Secondary sort: by projectNumber (descending) if dates are equal
    const projectNumA = parseInt(a.projectNumber) || 0;
    const projectNumB = parseInt(b.projectNumber) || 0;
    return projectNumB - projectNumA;
  });
  
  // Calculate current year YTD spend from product spend (not invoice total)
  const currentYearSpend = yearProposals.reduce((total, proposal) => {
    return total + calculateProductSpend(proposal);
  }, 0);
  
  // Calculate total money saved (discounts) for current year
  // Include: historical projects (Column G discount) + confirmed/approved projects (from proposal portal)
  const currentYearMoneySaved = yearProposals.reduce((total, proposal) => {
    try {
      // For historical projects, use historicalDiscount from Column G
      if (proposal.isHistorical) {
        // Check multiple possible property names for the discount
        let histDiscount = 0;
        if (proposal.historicalDiscount !== undefined && proposal.historicalDiscount !== null) {
          // Handle both string and number values
          const discountStr = String(proposal.historicalDiscount).trim();
          if (discountStr !== '' && discountStr !== 'undefined' && discountStr !== 'null') {
            histDiscount = parseFloat(discountStr);
            if (isNaN(histDiscount)) {
              histDiscount = 0;
            }
          }
        }
        console.log(`[Money Saved] Historical project ${proposal.projectNumber || 'N/A'}: raw historicalDiscount="${proposal.historicalDiscount}" (type: ${typeof proposal.historicalDiscount}), parsed=${histDiscount}`);
        if (histDiscount > 0) {
          return total + histDiscount;
        }
        // If no historicalDiscount, return total (no discount for this project)
        return total;
      }
      
      // For regular projects, only calculate discount for confirmed/approved/completed projects
      // (not pending, as those haven't been finalized yet)
      if (proposal.status === 'Pending' || proposal.status === 'Active') {
        console.log(`[Money Saved] Skipping ${proposal.status} project ${proposal.projectNumber || 'N/A'}`);
        return total; // Don't count pending/active projects
      }
      
      // For regular projects (Confirmed, Approved, Completed), use the same logic as calculateDetailedTotals
      const sections = JSON.parse(proposal.sectionsJSON || '[]');
      
      // Calculate base product total
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
      
      // Get rental multiplier (same logic as calculateDetailedTotals)
      let rentalMultiplier = 1.0;
      if (proposal.customRentalMultiplier && proposal.customRentalMultiplier.trim() !== '') {
        const parsed = parseFloat(proposal.customRentalMultiplier);
        if (!isNaN(parsed) && parsed > 0) {
          rentalMultiplier = parsed;
        }
      } else {
        const start = parseDateSafely(proposal.startDate);
        const end = parseDateSafely(proposal.endDate);
        if (start && end) {
          const diffTime = end.getTime() - start.getTime();
          const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
          rentalMultiplier = getRentalMultiplier(diffDays);
        }
      }
      
      const extendedProductTotal = baseProductTotal * rentalMultiplier;
      
      // Calculate discount (same logic as calculateDetailedTotals)
      const discountValue = parseFloat(proposal.discountValue || proposal.discount || 0) || 0;
      let discountType = 'percentage';
      if (proposal.discountName && proposal.discountName.startsWith('TYPE:')) {
        const match = proposal.discountName.match(/^TYPE:(\w+)/);
        if (match) discountType = match[1];
      }
      
      const standardRateDiscount = discountType === 'dollar' 
        ? discountValue 
        : extendedProductTotal * (discountValue / 100);
      
      console.log(`[Money Saved] Regular project ${proposal.projectNumber || 'N/A'} (${proposal.status}): baseTotal=${baseProductTotal}, extendedTotal=${extendedProductTotal}, discountValue=${discountValue}, discountType=${discountType}, discount=${standardRateDiscount}`);
      
      return total + standardRateDiscount;
    } catch (e) {
      console.error('Error calculating discount for proposal:', e, proposal);
      return total;
    }
  }, 0);
  
  console.log(`[Money Saved] Total for ${new Date().getFullYear()}: $${currentYearMoneySaved.toFixed(2)}`);
  
  // For 2026+, calculate 2025 total to determine tier status (carryover)
  // For 2025, use current year spend
  let tierBaseSpend = currentYearSpend;
  let carriedOverTier = null;
  
  if (currentYear >= 2026) {
    // Calculate 2025 total spend to determine tier status
    const year2025Proposals = proposals.filter(p => {
      if (!p.startDate || p.status === 'Cancelled') return false;
      const proposalYear = new Date(p.startDate).getFullYear();
      return proposalYear === 2025;
    });
    
    const year2025Spend = year2025Proposals.reduce((total, proposal) => {
      return total + calculateProductSpend(proposal);
    }, 0);
    
    // Determine tier based on 2025 achievement
    if (year2025Spend >= 100000) {
      carriedOverTier = { discount: 25, tier: 'Founders Estate', baseSpend: year2025Spend };
    } else if (year2025Spend >= 50000) {
      carriedOverTier = { discount: 20, tier: 'Inner Circle', baseSpend: year2025Spend };
    } else {
      carriedOverTier = { discount: 15, tier: 'House Member', baseSpend: year2025Spend };
    }
    
    // Use carried over tier, but progress is based on current year points
    tierBaseSpend = carriedOverTier.baseSpend;
  }
  
  // Tier system: 15% at start, 20% at $50k, 25% at $100k
  const getCurrentTier = () => {
    // If we have a carried over tier (2026+), use that tier but calculate progress from current year
    if (carriedOverTier) {
      const tier = carriedOverTier.tier;
      if (tier === 'Founders Estate') {
        return { discount: 25, tier: 'Founders Estate', nextTier: null, progress: 100, nextTierName: null };
      } else if (tier === 'Inner Circle') {
        // Progress toward Founders Estate based on current year points
        // They need 100k total, already have 50k+ from 2025, so need (100k - 50k) = 50k more
        const progress = Math.min((currentYearSpend / 50000) * 100, 100);
        return { discount: 20, tier: 'Inner Circle', nextTier: 'Founders Estate (25%)', progress: progress, nextTierName: 'Founders Estate' };
      } else {
        // House Member - progress toward Inner Circle (50k total needed)
        const progress = Math.min((currentYearSpend / 50000) * 100, 100);
        return { discount: 15, tier: 'House Member', nextTier: 'Inner Circle (20%)', progress: progress, nextTierName: 'Inner Circle' };
      }
    }
    
    // For 2025 or before, use standard logic
    if (tierBaseSpend >= 100000) {
      return { discount: 25, tier: 'Founders Estate', nextTier: null, progress: 100, nextTierName: null };
    } else if (tierBaseSpend >= 50000) {
      return { discount: 20, tier: 'Inner Circle', nextTier: 'Founders Estate (25%)', progress: ((tierBaseSpend - 50000) / 50000) * 100, nextTierName: 'Founders Estate' };
    } else {
      return { discount: 15, tier: 'House Member', nextTier: 'Inner Circle (20%)', progress: (tierBaseSpend / 50000) * 100, nextTierName: 'Inner Circle' };
    }
  };

  const tier = getCurrentTier();

  return (
    <div>
      {/* Image Banner */}
      <div style={{
        width: '100%',
        height: '320px',
        marginBottom: '56px',
        borderRadius: '12px',
        overflow: 'hidden',
        position: 'relative',
        backgroundColor: '#1a1a1a',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)'
      }}>
        <img 
          src="/account-banner.jpg" 
          alt="Your Reserve Status" 
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            filter: 'brightness(0.7) contrast(1.1) saturate(1.2)',
            opacity: '0.9'
          }}
          onError={(e) => {
            // Fallback if image doesn't exist yet
            e.target.style.display = 'none';
          }}
        />
        {/* Dark overlay for richer look */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'linear-gradient(to bottom, rgba(0, 0, 0, 0.3), rgba(0, 0, 0, 0.5))'
        }} />
        {/* Text Overlay */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '48px',
          zIndex: 1
        }}>
          <div style={{
            fontSize: '52px',
            fontWeight: '300',
            fontFamily: "'Domaine Text', serif",
            color: 'white',
            marginBottom: '20px',
            textAlign: 'center',
            letterSpacing: '-0.02em',
            textShadow: '0 2px 8px rgba(0, 0, 0, 0.3)'
          }}>
            Your Reserve Status
          </div>
          <div style={{
            width: '60px',
            height: '1px',
            background: 'rgba(255, 255, 255, 0.6)',
            margin: '0 auto 24px'
          }} />
          <div style={{
            fontSize: '11px',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: 'rgba(255, 255, 255, 0.9)',
            fontFamily: "'NeueHaasUnica', sans-serif",
            textAlign: 'center',
            lineHeight: '1.6',
            fontWeight: '400'
          }}>
            A LOOK AT YOUR COLLABORATION, EXCLUSIVES, AND MEMBER BENEFITS.
          </div>
        </div>
      </div>
      
      {/* Tier Status - Medallion with Progress Bar */}
      <div style={{ 
        backgroundColor: '#fafaf8', 
        border: 'none',
        padding: '64px 48px', 
        borderRadius: '20px', 
        marginBottom: '48px',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.06)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        {/* Status Medallion */}
        <div style={{ 
          position: 'relative',
          width: '240px',
          height: '240px',
          marginBottom: '56px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          {/* Circle with olive trim */}
          <div style={{
            position: 'absolute',
            width: '240px',
            height: '240px',
            borderRadius: '50%',
            border: tier.tier === 'House Member' ? '3px solid #6b7d47' : tier.tier === 'Inner Circle' ? '3px solid #d4af37' : '3px solid #2C2C2C',
            backgroundColor: 'transparent'
          }} />
          {/* Center content */}
          <div style={{
            textAlign: 'center',
            zIndex: 1
          }}>
            <div style={{ 
              fontSize: '40px', 
              fontWeight: '300', 
              color: brandCharcoal,
              fontFamily: "'Domaine Text', serif",
              letterSpacing: '-0.02em',
              lineHeight: '1.2',
              marginBottom: '12px'
            }}>
              {tier.tier}
            </div>
            <div style={{ 
              fontSize: '20px', 
              fontWeight: '300', 
              color: '#8b8b8b',
              fontFamily: "'NeueHaasUnica', sans-serif",
              letterSpacing: '-0.01em'
            }}>
              {tier.discount}% Off
            </div>
          </div>
        </div>

        {/* Progress Section */}
        {tier.nextTier && (() => {
          // Calculate points to next tier based on current year spend and tier
          let pointsToNextTier = 0;
          let nextTierPoints = 0;
          
          if (tier.tier === 'House Member') {
            // Need 50k total to reach Inner Circle
            // If carried over, they start at 0 for current year, so need full 50k
            // If not carried over, use current year spend
            nextTierPoints = 50000;
            if (carriedOverTier) {
              // Carried over from 2025, so need 50k in current year
              pointsToNextTier = Math.ceil(50000 - currentYearSpend);
            } else {
              // 2025 or earlier, use current year spend
              pointsToNextTier = Math.ceil(50000 - currentYearSpend);
            }
          } else if (tier.tier === 'Inner Circle') {
            // Need 100k total to reach Founders Estate
            // If carried over, they already have 50k+ from 2025, so need remaining 50k
            nextTierPoints = 100000;
            if (carriedOverTier) {
              // Already have 50k+ from 2025, need 50k more in current year
              pointsToNextTier = Math.ceil(50000 - currentYearSpend);
            } else {
              // 2025 or earlier, use current year spend
              pointsToNextTier = Math.ceil(100000 - currentYearSpend);
            }
          }
          
          const currentPoints = Math.round(currentYearSpend);
          const progressPercent = Math.round(tier.progress);
          
          return (
            <div style={{ 
              width: '100%',
              maxWidth: '500px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center'
            }}>
              {/* Label */}
              <div style={{ 
                fontSize: '10px', 
                color: '#8b8b8b',
                fontFamily: "'NeueHaasUnica', sans-serif",
                fontWeight: '500',
                textTransform: 'uppercase',
                letterSpacing: '0.15em',
                marginBottom: '20px',
                textAlign: 'center'
              }}>
                PROGRESS TOWARD {tier.nextTierName.toUpperCase()}
              </div>
              
              {/* Progress Bar */}
              <div style={{ 
                width: '65%', 
                height: '3px', 
                backgroundColor: '#e8e8e3', 
                borderRadius: '2px',
                marginBottom: '20px',
                overflow: 'hidden',
                position: 'relative'
              }}>
                <div style={{
                  width: `${Math.min(tier.progress, 100)}%`,
                  height: '100%',
                  backgroundColor: tier.tier === 'House Member' ? '#6b7d47' : tier.tier === 'Inner Circle' ? '#d4af37' : '#2C2C2C',
                  transition: 'width 0.8s ease',
                  borderRadius: '2px'
                }} />
              </div>
              
              {/* Progress Copy */}
              <div style={{ 
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                {/* Line 1 - Primary */}
                <div style={{ 
                  fontSize: '16px', 
                  color: brandCharcoal, 
                  fontFamily: "'NeueHaasUnica', sans-serif",
                  fontWeight: '500',
                  lineHeight: '1.4'
                }}>
                  {pointsToNextTier.toLocaleString()} pts to {tier.nextTierName}
                </div>
                
                {/* Line 2 - Secondary */}
                <div style={{ 
                  fontSize: '12px', 
                  color: '#8b8b8b', 
                  fontFamily: "'NeueHaasUnica', sans-serif",
                  fontWeight: '400',
                  lineHeight: '1.5'
                }}>
                  Progress: {progressPercent}% complete  •  {currentPoints.toLocaleString()} pts earned  •  {nextTierPoints.toLocaleString()} pts required
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* YTD Stats Card */}
      <div style={{ 
        backgroundColor: '#fafaf8', 
        padding: '32px', 
        borderRadius: '16px', 
        marginBottom: '40px',
        border: 'none',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
        display: 'flex',
        gap: '48px',
        alignItems: 'flex-start'
      }} className="ytd-stats-card">
        {/* YTD Points */}
        <div style={{ flex: '1' }}>
          <div style={{ 
            fontSize: '11px', 
            fontWeight: '500', 
            color: '#8b8b8b', 
            textTransform: 'uppercase', 
            letterSpacing: '0.15em', 
            marginBottom: '16px',
            fontFamily: "'NeueHaasUnica', sans-serif"
          }}>
            Year-to-Date Points ({new Date().getFullYear()})
          </div>
          <div style={{ 
            fontSize: '56px', 
            fontWeight: '300', 
            color: brandCharcoal, 
            marginBottom: '12px',
            fontFamily: "'Domaine Text', serif",
            letterSpacing: '-0.03em',
            lineHeight: '1.1'
          }}>
            {Math.round(currentYearSpend).toLocaleString()}
          </div>
        </div>
        
        {/* YTD Projects */}
        <div style={{ flex: '1' }}>
          <div style={{ 
            fontSize: '11px', 
            fontWeight: '500', 
            color: '#8b8b8b', 
            textTransform: 'uppercase', 
            letterSpacing: '0.15em', 
            marginBottom: '16px',
            fontFamily: "'NeueHaasUnica', sans-serif"
          }}>
            Year-to-Date Projects ({new Date().getFullYear()})
          </div>
          <div style={{ 
            fontSize: '56px', 
            fontWeight: '300', 
            color: brandCharcoal, 
            marginBottom: '12px',
            fontFamily: "'Domaine Text', serif",
            letterSpacing: '-0.03em',
            lineHeight: '1.1'
          }}>
            {yearProposals.length}
          </div>
        </div>
        
        {/* Money Saved This Year */}
        <div style={{ flex: '1' }}>
          <div style={{ 
            fontSize: '11px', 
            fontWeight: '500', 
            color: '#8b8b8b', 
            textTransform: 'uppercase', 
            letterSpacing: '0.15em', 
            marginBottom: '16px',
            fontFamily: "'NeueHaasUnica', sans-serif"
          }}>
            Money Saved This Year ({new Date().getFullYear()})
          </div>
          <div style={{ 
            fontSize: '56px', 
            fontWeight: '300', 
            color: brandCharcoal, 
            marginBottom: '12px',
            fontFamily: "'Domaine Text', serif",
            letterSpacing: '-0.03em',
            lineHeight: '1.1'
          }}>
            ${Math.round(currentYearMoneySaved).toLocaleString('en-US')}
          </div>
        </div>
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px' }} className="tier-benefits-grid">
          {/* House Member - Olive */}
          <div className={tier.tier === 'House Member' ? 'tier-card-selected' : ''} style={{ 
            padding: '32px', 
            backgroundColor: '#fafaf8', 
            borderRadius: '16px', 
            border: tier.tier === 'House Member' ? '1px solid #6b7d47' : '1px solid #e8e8e3',
            transition: 'all 0.3s ease',
            boxShadow: tier.tier === 'House Member' 
              ? '0 4px 12px rgba(107, 125, 71, 0.15)' 
              : '0 2px 6px rgba(0, 0, 0, 0.04)',
            position: 'relative',
            overflow: 'hidden'
          }}>
            {tier.tier === 'House Member' && (
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: '3px',
                backgroundColor: '#6b7d47'
              }} />
            )}
            <div style={{ 
              fontSize: '11px', 
              fontWeight: '500', 
              color: '#8b8b8b',
              marginBottom: '16px',
              fontFamily: "'NeueHaasUnica', sans-serif",
              textTransform: 'uppercase',
              letterSpacing: '0.15em'
            }}>
              House Member
            </div>
            <div style={{ 
              fontSize: '36px', 
              fontWeight: '300', 
              color: brandCharcoal,
              fontFamily: "'Domaine Text', serif",
              letterSpacing: '-0.03em',
              marginBottom: '12px',
              lineHeight: '1.1'
            }}>
              15% off
            </div>
            <div style={{ 
              fontSize: '12px', 
              color: '#8b8b8b',
              fontFamily: "'NeueHaasUnica', sans-serif",
              fontWeight: '400',
              lineHeight: '1.5'
            }}>
              Your Current Standing
            </div>
          </div>
          
          {/* Inner Circle - Soft Gold */}
          <div className={tier.tier === 'Inner Circle' ? 'tier-card-selected' : ''} style={{ 
            padding: '32px', 
            backgroundColor: '#fafaf8', 
            borderRadius: '16px', 
            border: tier.tier === 'Inner Circle' ? '1px solid #d4af37' : '1px solid #e8e8e3',
            transition: 'all 0.3s ease',
            boxShadow: tier.tier === 'Inner Circle' 
              ? '0 4px 12px rgba(212, 175, 55, 0.15)' 
              : '0 2px 6px rgba(0, 0, 0, 0.04)',
            position: 'relative',
            overflow: 'hidden'
          }}>
            {tier.tier === 'Inner Circle' && (
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: '3px',
                backgroundColor: '#d4af37'
              }} />
            )}
            <div style={{ 
              fontSize: '11px', 
              fontWeight: '500', 
              color: '#8b8b8b',
              marginBottom: '16px',
              fontFamily: "'NeueHaasUnica', sans-serif",
              textTransform: 'uppercase',
              letterSpacing: '0.15em'
            }}>
              Inner Circle
            </div>
            <div style={{ 
              fontSize: '36px', 
              fontWeight: '300', 
              color: brandCharcoal,
              fontFamily: "'Domaine Text', serif",
              letterSpacing: '-0.03em',
              marginBottom: '12px',
              lineHeight: '1.1'
            }}>
              20% off
            </div>
            <div style={{ 
              fontSize: '12px', 
              color: '#8b8b8b',
              fontFamily: "'NeueHaasUnica', sans-serif",
              fontWeight: '400',
              lineHeight: '1.5'
            }}>
              At 50,000 points
            </div>
          </div>
          
          {/* Founders Estate - Charcoal with Olive accent */}
          <div className={tier.tier === 'Founders Estate' ? 'tier-card-selected' : ''} style={{ 
            padding: '32px', 
            backgroundColor: '#fafaf8', 
            borderRadius: '16px', 
            border: tier.tier === 'Founders Estate' ? '1px solid #2C2C2C' : '1px solid #e8e8e3',
            transition: 'all 0.3s ease',
            boxShadow: tier.tier === 'Founders Estate' 
              ? '0 4px 12px rgba(107, 125, 71, 0.15)' 
              : '0 2px 6px rgba(0, 0, 0, 0.04)',
            position: 'relative',
            overflow: 'hidden'
          }}>
            {tier.tier === 'Founders Estate' && (
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: '3px',
                backgroundColor: '#6b7d47'
              }} />
            )}
            <div style={{ 
              fontSize: '11px', 
              fontWeight: '500', 
              color: '#8b8b8b',
              marginBottom: '16px',
              fontFamily: "'NeueHaasUnica', sans-serif",
              textTransform: 'uppercase',
              letterSpacing: '0.15em'
            }}>
              Founders Estate
            </div>
            <div style={{ 
              fontSize: '36px', 
              fontWeight: '300', 
              color: brandCharcoal,
              fontFamily: "'Domaine Text', serif",
              letterSpacing: '-0.03em',
              marginBottom: '12px',
              lineHeight: '1.1'
            }}>
              25% off
            </div>
            <div style={{ 
              fontSize: '12px', 
              color: '#8b8b8b',
              fontFamily: "'NeueHaasUnica', sans-serif",
              fontWeight: '400',
              lineHeight: '1.5'
            }}>
              At 100,000 points
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
            <div className="table-wrapper" style={{ 
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
                      textAlign: 'left', 
                      fontSize: '12px',
                      fontWeight: '600',
                      color: brandCharcoal,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em'
                    }}>
                      Status
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
                      Points Earned
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {yearProposals.map((proposal, index) => {
                    const productSpend = calculateProductSpend(proposal);
                    // Determine status: Pending, Confirmed, or Completed
                    let status = 'Pending';
                    const eventDate = proposal.eventDate || proposal.startDate;
                    if (proposal.status === 'Pending') {
                      status = 'Pending';
                    } else if (proposal.status === 'Confirmed' || (proposal.status === 'Approved' && eventDate && isFutureDate(eventDate))) {
                      status = 'Confirmed';
                    } else if (proposal.status === 'Completed' || (eventDate && isPastDate(eventDate))) {
                      status = 'Completed';
                    }
                    
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
                          {formatDateRange(proposal) || 'N/A'}
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
                          color: brandCharcoal
                        }}>
                          {status}
                        </td>
                        <td style={{ 
                          padding: '14px 16px', 
                          fontSize: '14px',
                          color: brandCharcoal,
                          textAlign: 'right',
                          fontFamily: "'NeueHaasUnica', sans-serif"
                        }}>
                          {Math.round(productSpend).toLocaleString()} pts
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
                Points are calculated from your invoice total, excluding delivery fees and tax.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ProposalsSection({ proposals, proposalTab, setProposalTab, setSelectedProposal, brandCharcoal = '#2C2C2C' }) {
  // Helper function to get sortable date from proposal (most recent first)
  const getSortableDate = (proposal) => {
    if (proposal.isHistorical && proposal.timestamp) {
      return new Date(proposal.timestamp);
    } else if (proposal.startDate) {
      return parseDateSafely(proposal.startDate);
    } else if (proposal.eventDate) {
      if (typeof proposal.eventDate === 'string' && proposal.eventDate.includes('GMT')) {
        return new Date(proposal.eventDate);
      } else if (proposal.eventDate instanceof Date) {
        return proposal.eventDate;
      }
    }
    return new Date(0);
  };
  
  // Use same filtering logic as DashboardView - match how Contributing Projects filters
  const activeProposals = proposals.filter(p => 
    p.status === 'Pending' || p.status === 'Active' || (p.status === 'Approved' && isFutureDate(p.startDate)) || (p.status === 'Confirmed' && isFutureDate(p.startDate))
  ).sort((a, b) => {
    const dateA = getSortableDate(a);
    const dateB = getSortableDate(b);
    return dateB.getTime() - dateA.getTime(); // Most recent first
  });
  
  const completedProposals = proposals.filter(p => 
    (p.status === 'Approved' && isPastDate(p.startDate)) || (p.status === 'Completed') || (p.status === 'Confirmed' && isPastDate(p.startDate))
  ).sort((a, b) => {
    const dateA = getSortableDate(a);
    const dateB = getSortableDate(b);
    return dateB.getTime() - dateA.getTime(); // Most recent first
  });
  
  const cancelledProposals = proposals.filter(p => 
    p.status === 'Cancelled'
  ).sort((a, b) => {
    const dateA = getSortableDate(a);
    const dateB = getSortableDate(b);
    return dateB.getTime() - dateA.getTime(); // Most recent first
  });

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
      {/* Image Banner */}
      <div style={{
        width: '100%',
        height: '320px',
        marginBottom: '56px',
        marginTop: '0',
        borderRadius: '12px',
        overflow: 'hidden',
        position: 'relative',
        backgroundColor: '#1a1a1a',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)'
      }}>
        <img 
          src="/projects-banner.jpg" 
          alt="Projects" 
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            filter: 'brightness(0.7) contrast(1.1) saturate(1.2)',
            opacity: '0.9'
          }}
          onError={(e) => {
            // Fallback if image doesn't exist yet
            e.target.style.display = 'none';
          }}
        />
        {/* Dark overlay for richer look */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'linear-gradient(to bottom, rgba(0, 0, 0, 0.3), rgba(0, 0, 0, 0.5))'
        }} />
        {/* Text Overlay */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '48px',
          zIndex: 1
        }}>
          <div style={{
            fontSize: '52px',
            fontWeight: '300',
            fontFamily: "'Domaine Text', serif",
            color: 'white',
            marginBottom: '20px',
            textAlign: 'center',
            letterSpacing: '-0.02em',
            textShadow: '0 2px 8px rgba(0, 0, 0, 0.3)'
          }}>
            Projects
          </div>
          <div style={{
            width: '60px',
            height: '1px',
            background: 'rgba(255, 255, 255, 0.6)',
            margin: '0 auto 24px'
          }} />
          <div style={{
            fontSize: '11px',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: 'rgba(255, 255, 255, 0.9)',
            fontFamily: "'NeueHaasUnica', sans-serif",
            textAlign: 'center',
            lineHeight: '1.6',
            fontWeight: '400'
          }}>
            An overview of your active completed, and cancelled projects.
          </div>
        </div>
      </div>
      
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
                    textAlign: 'right', 
                    fontSize: '12px',
                    fontWeight: '600',
                    color: brandCharcoal,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>
                    Points
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
                  const productSpend = calculateProductSpend(proposal);
                  const points = Math.round(productSpend);
                  return (
                    <tr 
                      key={proposal.id || index}
                      style={{ 
                        borderBottom: index < getProposalsForTab().length - 1 ? '1px solid #e5e7eb' : 'none'
                      }}
                    >
                      <td style={{ 
                        padding: '14px 16px', 
                        fontSize: '14px',
                        color: brandCharcoal
                      }}>
                        {dateRange || 'N/A'}
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
                        fontSize: '14px',
                        color: brandCharcoal,
                        textAlign: 'right',
                        fontFamily: "'NeueHaasUnica', sans-serif"
                      }}>
                        + {points.toLocaleString()} points
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

function ContactSection({ brandCharcoal = '#2C2C2C' }) {
  const teamMembers = [
    {
      name: 'Megan Proby',
      title: 'Founder & CEO',
      email: 'Megan@Mayker.com',
      photo: '/megan-proby.jpg',
      firstName: 'Megan'
    },
    {
      name: 'Noelle Powell',
      title: 'Client Services Director',
      email: 'Noelle@Mayker.com',
      photo: '/noelle-powell.jpg',
      firstName: 'Noelle'
    },
    {
      name: 'Constance Farro',
      title: 'Partnerships Manager',
      email: 'Constance@Mayker.com',
      photo: '/constance-farro.jpg',
      firstName: 'Constance'
    },
    {
      name: 'Lindsey Soklin',
      title: 'Client Coordinator',
      email: 'Lindsey@Mayker.com',
      photo: '/lindsey-soklin.jpg',
      firstName: 'Lindsey'
    },
    {
      name: 'Mara Meisberger',
      title: 'Administrative Associate',
      email: 'Mara@Mayker.com',
      photo: '/mara-meisberger.jpg',
      firstName: 'Mara'
    },
    {
      name: 'Becca Farris',
      title: 'Warehouse Manager',
      email: 'Becca@Mayker.com',
      photo: '/becca-farris.jpg',
      firstName: 'Becca'
    },
    {
      name: 'Robert Hamm',
      title: 'Inventory Manager',
      email: 'Robert@mayker.com',
      photo: '/robert-hamm.jpg',
      firstName: 'Robert'
    }
  ];

  // Helper to get initials
  const getInitials = (name) => {
    return name.split(' ').map(n => n[0]).join('');
  };

  return (
    <div>
      {/* Image Banner */}
      <div style={{
        width: '100%',
        height: '320px',
        marginBottom: '56px',
        borderRadius: '12px',
        overflow: 'hidden',
        position: 'relative',
        backgroundColor: '#1a1a1a',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)'
      }}>
        <img 
          src="/contact-banner.jpg" 
          alt="Contact" 
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            filter: 'brightness(0.7) contrast(1.1) saturate(1.2)',
            opacity: '0.9'
          }}
          onError={(e) => {
            // Fallback if image doesn't exist yet
            e.target.style.display = 'none';
          }}
        />
        {/* Dark overlay for richer look */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'linear-gradient(to bottom, rgba(0, 0, 0, 0.3), rgba(0, 0, 0, 0.5))'
        }} />
        {/* Text Overlay */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '48px',
          zIndex: 1
        }}>
          <div style={{
            fontSize: '52px',
            fontWeight: '300',
            fontFamily: "'Domaine Text', serif",
            color: 'white',
            marginBottom: '20px',
            textAlign: 'center',
            letterSpacing: '-0.02em',
            textShadow: '0 2px 8px rgba(0, 0, 0, 0.3)'
          }}>
            Contact
          </div>
          <div style={{
            width: '60px',
            height: '1px',
            background: 'rgba(255, 255, 255, 0.6)',
            margin: '0 auto 24px'
          }} />
          <div style={{
            fontSize: '11px',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: 'rgba(255, 255, 255, 0.9)',
            fontFamily: "'NeueHaasUnica', sans-serif",
            textAlign: 'center',
            lineHeight: '1.6',
            fontWeight: '400'
          }}>
            Your dedicated Mayker Reserve team is here to support your projects, partnerships, and events.
          </div>
        </div>
      </div>

      {/* Team Section */}
      <div style={{ marginBottom: '64px' }}>
        <h3 style={{ 
          fontSize: '13px', 
          fontWeight: '500', 
          color: brandCharcoal,
          fontFamily: "'NeueHaasUnica', sans-serif",
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          marginBottom: '32px'
        }}>
          Our Team
        </h3>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '32px'
        }}>
          {teamMembers.map((member, index) => {
            const initials = getInitials(member.name);
            return (
              <div
                key={index}
                style={{
                  backgroundColor: '#fafaf8',
                  borderRadius: '16px',
                  padding: '40px 32px',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.06), 0 0 0 1px rgba(0, 0, 0, 0.04)',
                  border: '1px solid #e8e8e3',
                  transition: 'all 0.4s ease',
                  textAlign: 'center',
                  position: 'relative'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.06)';
                  e.currentTarget.style.transform = 'translateY(-4px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.06), 0 0 0 1px rgba(0, 0, 0, 0.04)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                {/* Photo Container with Low-Opacity Initials Background */}
                <div style={{
                  width: '180px',
                  height: '180px',
                  borderRadius: '50%',
                  margin: '0 auto 28px',
                  overflow: 'hidden',
                  backgroundColor: '#f5f4f0',
                  border: '2px solid #e8e8e3',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)'
                }}>
                  {/* Low-opacity initials background (Soho vibe) */}
                  <div 
                    className="bg-initials"
                    style={{
                      position: 'absolute',
                      width: '100%',
                      height: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '120px',
                      fontWeight: '300',
                      color: 'rgba(139, 139, 139, 0.15)',
                      fontFamily: "'Domaine Text', serif",
                      zIndex: 0,
                      pointerEvents: 'none'
                    }}
                  >
                    {initials}
                  </div>
                  
                  {/* Photo */}
                  <img
                    src={member.photo}
                    alt={member.name}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      position: 'relative',
                      zIndex: 1,
                      borderRadius: '50%'
                    }}
                    onError={(e) => {
                      // Hide image and show initials prominently if it fails
                      e.target.style.display = 'none';
                      const parent = e.target.parentElement;
                      const bgInitials = parent.querySelector('.bg-initials');
                      if (bgInitials) {
                        bgInitials.style.color = 'rgba(139, 139, 139, 0.4)';
                        bgInitials.style.fontSize = '80px';
                        bgInitials.style.zIndex = '2';
                      }
                    }}
                  />
                </div>

                {/* Name */}
                <div style={{
                  fontSize: '22px',
                  fontWeight: '300',
                  color: brandCharcoal,
                  fontFamily: "'Domaine Text', serif",
                  marginBottom: '10px',
                  letterSpacing: '-0.01em'
                }}>
                  {member.name}
                </div>

                {/* Title */}
                <div style={{
                  fontSize: '12px',
                  fontWeight: '400',
                  color: '#8b8b8b',
                  fontFamily: "'NeueHaasUnica', sans-serif",
                  marginBottom: '24px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em'
                }}>
                  {member.title}
                </div>

                {/* Contact Buttons */}
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  marginTop: '24px'
                }}>
                  <a
                    href={`mailto:${member.email}`}
                    style={{
                      padding: '12px 20px',
                      backgroundColor: '#f5f4f0',
                      color: brandCharcoal,
                      border: '1px solid #e8e8e3',
                      borderRadius: '10px',
                      fontSize: '12px',
                      fontWeight: '500',
                      fontFamily: "'NeueHaasUnica', sans-serif",
                      textDecoration: 'none',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      transition: 'all 0.3s ease',
                      display: 'block',
                      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = brandCharcoal;
                      e.currentTarget.style.color = '#fafaf8';
                      e.currentTarget.style.borderColor = brandCharcoal;
                      e.currentTarget.style.boxShadow = '0 2px 6px rgba(0, 0, 0, 0.08)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#f5f4f0';
                      e.currentTarget.style.color = brandCharcoal;
                      e.currentTarget.style.borderColor = '#e8e8e3';
                      e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.04)';
                    }}
                  >
                    Email {member.firstName}
                  </a>
                  
                  <a
                    href={`mailto:${member.email}?subject=Schedule a Call`}
                    style={{
                      padding: '12px 20px',
                      backgroundColor: 'transparent',
                      color: brandCharcoal,
                      border: '1px solid #e8e8e3',
                      borderRadius: '10px',
                      fontSize: '12px',
                      fontWeight: '500',
                      fontFamily: "'NeueHaasUnica', sans-serif",
                      textDecoration: 'none',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      transition: 'all 0.3s ease',
                      display: 'block'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#f5f4f0';
                      e.currentTarget.style.borderColor = brandCharcoal;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.borderColor = '#e8e8e3';
                    }}
                  >
                    Schedule a Call
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Contact Information */}
      <div style={{
        backgroundColor: '#fafaf8',
        borderRadius: '16px',
        padding: '40px',
        border: '1px solid #e8e8e3',
        boxShadow: '0 2px 6px rgba(0, 0, 0, 0.04)'
      }}>
        <h3 style={{ 
          fontSize: '13px', 
          fontWeight: '500', 
          color: brandCharcoal,
          fontFamily: "'NeueHaasUnica', sans-serif",
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          marginBottom: '24px'
        }}>
          General Inquiries
        </h3>
        <div style={{
          fontSize: '16px',
          fontWeight: '400',
          color: brandCharcoal,
          fontFamily: "'NeueHaasUnica', sans-serif",
          lineHeight: '1.8'
        }}>
          <div style={{ marginBottom: '12px' }}>
            <strong>Email:</strong>{' '}
            <a
              href="mailto:events@mayker.com"
              style={{
                color: brandCharcoal,
                textDecoration: 'none',
                borderBottom: '1px solid transparent',
                transition: 'border-color 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderBottomColor = brandCharcoal;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderBottomColor = 'transparent';
              }}
            >
              events@mayker.com
            </a>
          </div>
          <div>
            <strong>Phone:</strong>{' '}
            <a
              href="tel:+16159701244"
              style={{
                color: brandCharcoal,
                textDecoration: 'none',
                borderBottom: '1px solid transparent',
                transition: 'border-color 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderBottomColor = brandCharcoal;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderBottomColor = 'transparent';
              }}
            >
              (615) 970-1244
            </a>
          </div>
          <div>
            <a
              href="https://maykerevents.com"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: brandCharcoal,
                textDecoration: 'none',
                borderBottom: '1px solid transparent',
                transition: 'border-color 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderBottomColor = brandCharcoal;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderBottomColor = 'transparent';
              }}
            >
              maykerevents.com
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function ResourcesSection({ brandCharcoal = '#2C2C2C' }) {
  const [searchQuery, setSearchQuery] = useState('');
  
  // Product library - images should be in /public/products/ folder
  // Helper function to convert filename to product name (removes "- 1", "- 2", etc.)
  const filenameToProductName = (filename) => {
    // Remove .png extension
    let name = filename.replace(/\.png$/i, '');
    // Remove " - 1", " - 2", etc. patterns
    name = name.replace(/\s*-\s*\d+$/, '');
    return name;
  };
  
  // Product library - list all products here
  // Products with "- 1", "- 2" etc. in filename should be listed with clean name (without the number)
  const products = [
    { id: 'aaron-chair', name: 'Aaron Chair', image: '/products/Aaron Chair.png' },
    { id: 'aberdeen-swivel-chair', name: 'Aberdeen Swivel Chair', image: '/products/Aberdeen Swivel Chair.png' },
    { id: 'able-chair', name: 'Able Chair', image: '/products/Able Chair.png' },
    { id: 'agave-side-table', name: 'Agave Side Table', image: '/products/Agave Side Table.png' },
    { id: 'ana-nesting-table-set', name: 'Ana Nesting Table Set', image: '/products/Ana Nesting Table Set.png' },
    { id: 'ana-swivel-chair', name: 'Ana Swivel Chair', image: '/products/Ana Swivel Chair.png' },
    { id: 'anita-chair', name: 'Anita Chair', image: '/products/Anita Chair.png' },
    { id: 'ansel-end-table', name: 'Ansel End Table', image: '/products/Ansel End Table.png' },
    { id: 'baker-drinks-table', name: 'Baker Drinks Table', image: '/products/Baker Drinks Table.png' },
    { id: 'baz-accent-table', name: 'Baz Accent Table', image: '/products/Baz Accent Table - 1.png' },
    // Add more products as images are uploaded
    // For products with multiple photos (e.g., "Product - 1.png", "Product - 2.png"),
    // only list the base product name once using the "- 1" image
  ];

  // Filter products based on search query
  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(searchQuery.toLowerCase())
  ).sort((a, b) => a.name.localeCompare(b.name)); // Alphabetize

  const handleDownload = async (product) => {
    try {
      // Fetch the image as a blob
      const response = await fetch(product.image);
      const blob = await response.blob();
      
      // Create a blob URL
      const blobUrl = window.URL.createObjectURL(blob);
      
      // Create a temporary anchor element to trigger download
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `${product.name} - Mayker Events.png`;
      document.body.appendChild(link);
      link.click();
      
      // Clean up
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('Error downloading image:', error);
      // Fallback to direct link
      const link = document.createElement('a');
      link.href = product.image;
      link.download = `${product.name} - Mayker Events.png`;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
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
        Resources
      </h2>
      
      <div style={{ marginBottom: '32px' }}>
        <h3 style={{ 
          fontSize: '18px', 
          fontWeight: '300', 
          color: brandCharcoal, 
          marginBottom: '16px',
          fontFamily: "'Domaine Text', serif"
        }}>
          Product Visual Library
        </h3>
        <p style={{ 
          fontSize: '14px', 
          color: '#666', 
          marginBottom: '24px',
          fontFamily: "'NeueHaasUnica', sans-serif",
          lineHeight: '1.6'
        }}>
          Search and download PNG images of all rental products for your reference.
        </p>
        
        {/* Search Bar */}
        <div style={{ marginBottom: '32px' }}>
          <input
            type="text"
            placeholder="Search products..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              maxWidth: '500px',
              padding: '12px 16px',
              fontSize: '14px',
              fontFamily: "'NeueHaasUnica', sans-serif",
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              backgroundColor: '#fff',
              color: brandCharcoal,
              outline: 'none',
              transition: 'border-color 0.2s'
            }}
            onFocus={(e) => {
              e.target.style.borderColor = '#6b7d47';
            }}
            onBlur={(e) => {
              e.target.style.borderColor = '#e5e7eb';
            }}
          />
        </div>

        {/* Product Grid */}
        {filteredProducts.length === 0 ? (
          <div style={{ 
            textAlign: 'center', 
            padding: '48px', 
            color: '#999',
            fontFamily: "'NeueHaasUnica', sans-serif",
            fontSize: '14px'
          }}>
            {searchQuery ? `No products found matching "${searchQuery}"` : 'No products available at this time.'}
          </div>
        ) : (
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: '32px',
            marginBottom: '48px'
          }}>
            {filteredProducts.map((product) => (
              <div
                key={product.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  cursor: 'pointer',
                  transition: 'transform 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-4px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
                onClick={() => handleDownload(product)}
              >
                {/* Product Image */}
                <div style={{
                  width: '100%',
                  aspectRatio: '1 / 1',
                  backgroundColor: '#f9fafb',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  marginBottom: '12px',
                  border: '1px solid #e5e7eb',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative'
                }}>
                  <img 
                    src={product.image}
                    alt={product.name}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                      padding: '12px'
                    }}
                    onError={(e) => {
                      // Show placeholder if image doesn't exist
                      e.target.style.display = 'none';
                      const placeholder = e.target.parentElement;
                      placeholder.innerHTML = '<div style="color: #999; font-size: 12px; text-align: center; padding: 20px;">Image not found</div>';
                    }}
                  />
                  {/* Download overlay on hover */}
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.6)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: 0,
                    transition: 'opacity 0.2s ease',
                    borderRadius: '12px'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.opacity = 1;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.opacity = 0;
                  }}
                  >
                    <div style={{
                      color: 'white',
                      fontSize: '12px',
                      fontWeight: '500',
                      fontFamily: "'NeueHaasUnica', sans-serif",
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em'
                    }}>
                      Click to Download
                    </div>
                  </div>
                </div>
                
                {/* Product Name */}
                <div style={{
                  fontSize: '13px',
                  fontWeight: '400',
                  color: brandCharcoal,
                  fontFamily: "'NeueHaasUnica', sans-serif",
                  textAlign: 'center',
                  lineHeight: '1.4'
                }}>
                  {product.name}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FAQSection({ brandCharcoal = '#2C2C2C' }) {
  const [openItems, setOpenItems] = useState({});
  const [activeSectionId, setActiveSectionId] = useState(null);
  const maykerOlive = '#6b7d47';
  const warmIvory = '#FAF8F3';
  const warmCharcoal = '#2A2925';
  const warmGrey = '#8D8A81';
  const mediumGrey = '#6B6B6B'; // Slightly darker for better contrast

  const faqData = {
    'reserve-membership': {
      title: 'Reserve Membership',
      intro: '',
      items: [
        {
          question: 'What are the membership tiers?',
          answer: 'Mayker Reserve has three tiers designed to reward your partnership. When you join, you\'re automatically a House Member and receive 15% off all rental orders. Reach 50,000 points in a year and you\'ll join our Inner Circle with 20% off. Achieve 100,000 points annually and you become a Founders Circle member, enjoying 25% off.'
        },
        {
          question: 'How do I earn points?',
          answer: 'Every dollar you spend on invoices earns you a point (delivery fees and taxes excluded). We also offer double point periods throughout the year to help you reach the next tier faster.'
        },
        {
          question: 'Do my points carry over to the next year?',
          answer: 'Your points reset each January 1st, but your tier status stays with you. So if you reach Inner Circle this year, you\'ll begin next year as an Inner Circle member with 20% off already in place. To stay at Inner Circle (or move up to Founders Circle), you\'ll earn points fresh during the new year.'
        },
        {
          question: 'Can multiple people from my company access our Reserve account?',
          answer: 'Yes. Each individual has a personal login, but points are accrued by company, so you\'ll be able to see contributing projects from multiple team members, if applicable.'
        },
        {
          question: 'What perks come with membership beyond the discount?',
          answer: 'Reserve members receive precise 1-hour delivery windows, waived rush fees when timelines shift, and access to our design support team for sourcing and space planning. Founders Circle members also have the opportunity to collaborate on a signature piece—a custom design named after you.'
        },
        {
          question: 'Where can I track my progress?',
          answer: 'Your Activity page shows your current points total, tier status, and project history—everything you need in one place.'
        },
        {
          question: 'When does my discount apply?',
          answer: 'Your discount is applied automatically to your invoice for all standard rental fees. It does not apply to extended rental terms, custom fabrication, or procurement projects.'
        },
        {
          question: 'What\'s the welcome gift about?',
          answer: 'You\'ll receive something good in your mailbox—an actual, physical surprise. Not just another welcome email.'
        }
      ]
    },
    'services-products': {
      title: 'Mayker Services and Products',
      intro: '',
      items: [
        {
          question: 'What does Mayker do?',
          answer: 'We\'re a design resource company. Since 2013, we\'ve provided furniture rentals, custom fabrication, procurement services, and design guidance to brands and individuals. We started in our hometown of Nashville, expanded throughout the Southeast, and now regularly service clients nationwide. We really enjoy getting to know and partnering with the brands, planners, and designers who know that every detail matters.'
        },
        {
          question: 'What can I rent?',
          answer: 'We have six core collections: Bars, Furnishings, Lighting, Upholstery, Seating, and Textiles. We focus on the fundamentals, the statement changers, and lean into quality, design versatility, and lasting impressions.'
        },
        {
          question: 'Can you create something custom for me?',
          answer: 'Absolutely. The most memorable details are always authentic. If you\'re looking for something personalized, our Custom Team concepts and delivers original solutions—custom bars, stage fronts, backdrops, display solutions, signage. We also source hand-selected products, whether you need more of something we carry or something entirely new.'
        },
        {
          question: 'What types of projects does Mayker work on?',
          answer: 'We work across corporate experiences and activations to social gatherings. Whether it\'s an intimate dinner for twenty or a conference for 2,000, we provide the furniture, fabrication, and flexibility to make it happen seamlessly.'
        },
        {
          question: 'What\'s the investment for custom services?',
          answer: 'Custom projects are approached on a case-by-case basis. We have a $2,500 project minimum and provide pricing based on project plan, materials, complexity, and timeline.'
        },
        {
          question: 'How do I get started with a custom project?',
          answer: 'Submit an inquiry online with as much detail as you have—concept, install date, target budget range. If you have dimensions or inspiration photos, send those as well. The more the merrier really rings true here.'
        }
      ]
    },
    'billing-policies': {
      title: 'Billing and Policies',
      intro: '',
      items: [
        {
          question: 'How do I confirm my reservation?',
          answer: 'Services are confirmed with a signed service agreement and, at minimum, a 50% deposit. The balance is due 30 days prior to your event. For projects booked within 45 days of your event date, full payment is due at contract signing.'
        },
        {
          question: 'What payment methods do you accept?',
          answer: 'We accept all payment methods. A 3% processing fee applies to credit card transactions.'
        },
        {
          question: 'What\'s your cancellation policy?',
          answer: 'Services are non-cancellable and non-refundable. When we reserve products for your project, we remove them from circulation for other clients. This policy protects the integrity of our inventory and ensures availability for all confirmed events.'
        },
        {
          question: 'What happens if a product is damaged during my event?',
          answer: 'Normal wear and tear is expected and covered by your Product Care Fee. However, significant damage, loss, or theft will result in replacement or repair charges. We\'ll work with you to assess any issues and determine appropriate charges. All items are inspected before and after each event.'
        },
        {
          question: 'Are there delivery and setup fees?',
          answer: 'Standard delivery (between 10:00 AM - 10:00 PM) is complimentary in the Nashville area. For events outside Nashville, delivery is based on location, event size, and timing. Your proposal will include a detailed breakdown of all delivery-related charges.'
        },
        {
          question: 'Are there additional fees?',
          answer: 'We charge additional fees for out-of-hours deliveries or challenging load-in conditions that require extra crew and time. Our goal is to keep fees minimal so your budget goes toward product, not process—while still covering what it actually takes to get the job done right.'
        },
        {
          question: 'Do I need insurance for my event?',
          answer: 'We require proof of general liability insurance for all events. Your policy should name Mayker as an additional insured. We can provide the specific certificate language if needed.'
        },
        {
          question: 'What if I need to add or remove items close to my event date?',
          answer: 'We do our best to accommodate changes, but inventory availability becomes limited as your event approaches. Contact us as early as possible, and we\'ll work with you to adjust your order within what\'s feasible.'
        }
      ]
    }
  };

  const toggleItem = (sectionId, itemIndex) => {
    const key = `${sectionId}-${itemIndex}`;
    setOpenItems(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const scrollToSection = (sectionId) => {
    setActiveSectionId(sectionId);
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.history.pushState(null, '', `#${sectionId}`);
    }
  };

  // Initialize with all items closed
  useEffect(() => {
    // Set active section from URL hash if present
    const hash = window.location.hash.replace('#', '');
    if (hash && faqData[hash]) {
      setActiveSectionId(hash);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ backgroundColor: warmIvory, minHeight: '100vh', padding: '0' }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '48px 24px' }}>
        {/* Image Banner */}
        <div style={{
          width: '100%',
          height: '320px',
          marginBottom: '56px',
          marginTop: '0',
          borderRadius: '12px',
          overflow: 'hidden',
          position: 'relative',
          backgroundColor: '#1a1a1a',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)'
        }}>
          <img 
            src="/faq-banner.jpg" 
            alt="FAQ" 
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              filter: 'brightness(0.7) contrast(1.1) saturate(1.2)',
              opacity: '0.9'
            }}
            onError={(e) => {
              // Fallback if image doesn't exist yet
              e.target.style.display = 'none';
            }}
          />
          {/* Dark overlay for richer look */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'linear-gradient(to bottom, rgba(0, 0, 0, 0.3), rgba(0, 0, 0, 0.5))'
          }} />
          {/* Text Overlay */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '48px',
            zIndex: 1
          }}>
            <div style={{
              fontSize: '52px',
              fontWeight: '300',
              fontFamily: "'Domaine Text', serif",
              color: 'white',
              marginBottom: '20px',
              textAlign: 'center',
              letterSpacing: '-0.02em',
              textShadow: '0 2px 8px rgba(0, 0, 0, 0.3)'
            }}>
              Mayker FAQ
            </div>
            <div style={{
              width: '60px',
              height: '1px',
              background: 'rgba(255, 255, 255, 0.6)',
              margin: '0 auto 24px'
            }} />
            <div style={{
              fontSize: '11px',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: 'rgba(255, 255, 255, 0.9)',
              fontFamily: "'NeueHaasUnica', sans-serif",
              textAlign: 'center',
              lineHeight: '1.6',
              fontWeight: '400'
            }}>
              A curated guide to your membership, services, billing, and support with Mayker Reserve.
            </div>
          </div>
        </div>

        {/* Chapter Navigation */}
        <nav style={{
          padding: '16px 0 32px',
          borderBottom: '1px solid rgba(0, 0, 0, 0.08)',
          marginBottom: '56px'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '40px',
            flexWrap: 'wrap'
          }}>
            {Object.keys(faqData).map((sectionId) => {
              const isActive = activeSectionId === sectionId;
              return (
                <a
                  key={sectionId}
                  href={`#${sectionId}`}
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToSection(sectionId);
                  }}
                  style={{
                    fontSize: '13px',
                    fontWeight: '400',
                    fontFamily: "'NeueHaasUnica', sans-serif",
                    color: isActive ? maykerOlive : mediumGrey,
                    textDecoration: 'none',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    paddingBottom: '8px',
                    borderBottom: isActive ? `2px solid ${maykerOlive}` : '2px solid transparent',
                    transition: 'all 0.3s ease',
                    cursor: 'pointer'
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.color = maykerOlive;
                      e.currentTarget.style.borderBottomColor = maykerOlive;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.color = mediumGrey;
                      e.currentTarget.style.borderBottomColor = 'transparent';
                    }
                  }}
                >
                  {faqData[sectionId].title}
                </a>
              );
            })}
          </div>
        </nav>

        {/* FAQ Sections */}
        {Object.entries(faqData).map(([sectionId, section], sectionIndex) => (
          <section
            key={sectionId}
            id={sectionId}
            style={{
              marginBottom: sectionIndex < Object.keys(faqData).length - 1 ? '80px' : '80px',
              scrollMarginTop: '80px',
              paddingTop: '32px',
              paddingLeft: '48px',
              paddingRight: '48px'
            }}
          >
            <h2 style={{
              fontSize: '36px',
              fontWeight: '300',
              fontFamily: "'Domaine Text', serif",
              color: warmCharcoal,
              marginBottom: '12px',
              letterSpacing: '-0.02em'
            }}>
              {section.title}
            </h2>
            <p style={{
              fontSize: '14px',
              fontWeight: '400',
              fontFamily: "'NeueHaasUnica', sans-serif",
              color: mediumGrey, // Slightly darker for better readability
              fontStyle: 'italic',
              marginBottom: '40px',
              lineHeight: '1.7', // Increased line height
              textAlign: 'left' // Left-aligned for book-like feel
            }}>
              {section.intro}
            </p>

            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0' // No gap, using dividers instead
            }}>
              {section.items.map((item, itemIndex) => {
                const itemKey = `${sectionId}-${itemIndex}`;
                const isOpen = openItems[itemKey];
                const isLast = itemIndex === section.items.length - 1;

                return (
                  <div key={itemIndex}>
                    <div
                      style={{
                        backgroundColor: isOpen ? '#BDB6A8' : '#FFFFFF',
                        borderRadius: '8px',
                        border: '1px solid #E4E1D8', // Soft warm-grey border
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.03)', // Very subtle shadow
                        overflow: 'hidden',
                        transition: 'all 0.25s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#BDB6A8';
                      }}
                      onMouseLeave={(e) => {
                        if (!isOpen) {
                          e.currentTarget.style.backgroundColor = '#FFFFFF';
                        } else {
                          e.currentTarget.style.backgroundColor = '#BDB6A8';
                        }
                      }}
                    >
                      <button
                        onClick={() => toggleItem(sectionId, itemIndex)}
                        role="button"
                        aria-expanded={isOpen}
                        style={{
                          width: '100%',
                          padding: '20px 30px', // Increased horizontal padding
                          backgroundColor: 'transparent',
                          border: 'none',
                          textAlign: 'left',
                          cursor: 'pointer',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '16px'
                        }}
                      >
                        <span style={{
                          fontSize: '16px',
                          fontWeight: '500',
                          fontFamily: "'NeueHaasUnica', sans-serif",
                          color: warmCharcoal,
                          lineHeight: '1.5',
                          flex: 1
                        }}>
                          {item.question}
                        </span>
                        {/* Plus/Minus symbol */}
                        <div style={{
                          fontSize: '20px',
                          fontWeight: '300',
                          fontFamily: "'NeueHaasUnica', sans-serif",
                          color: isOpen ? maykerOlive : mediumGrey,
                          lineHeight: '1',
                          width: '20px',
                          height: '20px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'color 0.2s ease'
                        }}>
                          {isOpen ? '−' : '+'}
                        </div>
                      </button>
                      <div
                        style={{
                          maxHeight: isOpen ? '1000px' : '0',
                          overflow: 'hidden',
                          transition: 'max-height 0.25s ease',
                          padding: isOpen ? '0 30px 20px' : '0 30px',
                          opacity: isOpen ? 1 : 0,
                          transitionProperty: 'max-height, padding, opacity'
                        }}
                      >
                        <div style={{
                          paddingTop: '4px',
                          fontSize: '15px',
                          fontWeight: '400',
                          fontFamily: "'NeueHaasUnica', sans-serif",
                          color: warmCharcoal,
                          lineHeight: '1.7'
                        }}>
                          {item.answer.split('\n').map((paragraph, pIndex) => (
                            <p key={pIndex} style={{ marginBottom: pIndex < item.answer.split('\n').length - 1 ? '8px' : '0' }}>
                              {paragraph}
                            </p>
                          ))}
                        </div>
                      </div>
                    </div>
                    {/* Soft divider between items */}
                    {!isLast && (
                      <div style={{
                        height: '1px',
                        backgroundColor: '#EAE7DF',
                        margin: '16px 0'
                      }} />
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
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
  const [activeSection, setActiveSection] = useState('performance'); // 'profile', 'performance', 'proposals', 'resources', 'activity', 'faq', 'contact'
  const [proposalTab, setProposalTab] = useState('active'); // For proposals section
  const [selectedProposal, setSelectedProposal] = useState(null);
  const [profileData, setProfileData] = useState(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  useEffect(() => {
    fetchData();
  }, []);
  
  // Close mobile menu when section changes
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [activeSection]);
  
  // Scroll to top when navigating between sections or views
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeSection, selectedProposal]);
  
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
      
      // Sort proposals by date (most recent first) before setting state
      const rawProposals = proposalsResult.proposals || [];
      console.log('Raw proposals count:', rawProposals.length);
      
      // Debug: Log first few raw proposals
      console.log('First 5 RAW proposals (before sorting):');
      rawProposals.slice(0, 5).forEach((p, i) => {
        console.log(`${i + 1}. Project ${p.projectNumber || 'N/A'}:`, {
          eventDate: p.eventDate,
          startDate: p.startDate,
          timestamp: p.timestamp,
          isHistorical: p.isHistorical,
          historicalDiscount: p.historicalDiscount,
          hasHistoricalDiscount: 'historicalDiscount' in p
        });
      });
      
      // Debug: Check all historical proposals for historicalDiscount
      const historicalProposals = rawProposals.filter(p => p.isHistorical);
      console.log(`Found ${historicalProposals.length} historical proposals`);
      historicalProposals.forEach((p, i) => {
        console.log(`Historical ${i + 1}: historicalDiscount=${p.historicalDiscount}, type=${typeof p.historicalDiscount}, hasProperty=${'historicalDiscount' in p}`);
      });
      
      const sortedProposals = sortProposalsByDate(rawProposals);
      console.log('Proposals sorted:', sortedProposals.length, 'proposals');
      
      // Debug: Log first few proposals with their dates AFTER sorting
      console.log('First 5 proposals AFTER sorting:');
      sortedProposals.slice(0, 5).forEach((p, i) => {
        const sortDate = getSortableDateFromProposal(p);
        console.log(`${i + 1}. Project ${p.projectNumber || 'N/A'}:`, {
          eventDate: p.eventDate,
          startDate: p.startDate,
          timestamp: p.timestamp,
          sortDate: sortDate.toISOString(),
          sortTime: sortDate.getTime()
        });
      });
      
      setProposals(sortedProposals);
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
  
  // If a proposal is selected and has a projectNumber, redirect to admin app
  if (selectedProposal && selectedProposal.projectNumber) {
    const adminUrl = `${ADMIN_PROPOSAL_APP_URL}?projectNumber=${encodeURIComponent(selectedProposal.projectNumber)}${selectedProposal.version ? `&version=${encodeURIComponent(selectedProposal.version)}` : ''}&clientView=true`;
    window.open(adminUrl, '_blank');
    setSelectedProposal(null); // Clear selection after opening
    return null; // Don't render anything while redirecting
  }
  
  // Fallback: if proposal selected but no projectNumber, show local view
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
    { key: 'faq', label: 'FAQ', section: 'faq' },
    { key: 'contact', label: 'CONTACT', section: 'contact' }
  ];

  const getCurrentNavKey = () => {
    const navItem = navigationSections.find(nav => nav.section === activeSection);
    return navItem ? navItem.key : 'account';
  };

  const handleNavClick = (section) => {
    if (section === 'contact') {
      setActiveSection('contact');
      return;
    }
    if (section === 'activity') {
      setActiveSection('activity');
      return;
    }
    setActiveSection(section);
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#fafaf8', display: 'flex', flexDirection: 'column' }}>
      {/* Fonts are loaded via index.css */}
      
      {/* Global Mobile Styles */}
      <style dangerouslySetInnerHTML={{ __html: `
        /* Mobile Menu Button - Show on mobile, hide on desktop */
        .mobile-menu-button {
          display: flex !important;
        }
        @media (min-width: 769px) {
          .mobile-menu-button {
            display: none !important;
          }
        }
        
        /* Desktop Navigation - Hide on mobile, show on desktop */
        .desktop-nav {
          display: none !important;
        }
        @media (min-width: 769px) {
          .desktop-nav {
            display: block !important;
          }
        }
        
        /* Desktop-only elements */
        .desktop-only {
          display: block;
        }
        @media (max-width: 768px) {
          .desktop-only {
            display: none !important;
          }
        }
        
        /* Mobile-specific styles */
        @media (max-width: 768px) {
          /* Ensure proper box-sizing and prevent overflow */
          * {
            box-sizing: border-box;
          }
          
          body {
            overflow-x: hidden;
            width: 100%;
            max-width: 100vw;
          }
          
          /* Ensure touch targets are at least 44px */
          button, a, input, select, textarea {
            min-height: 44px;
            min-width: 44px;
          }
          
          /* Prevent text size adjustment on iOS */
          input, select, textarea {
            font-size: 16px !important;
          }
          
          /* Smooth scrolling */
          html {
            scroll-behavior: smooth;
            -webkit-overflow-scrolling: touch;
            overflow-x: hidden;
          }
          
          /* Main content padding */
          .main-content {
            padding: 16px 12px !important;
            width: 100%;
            max-width: 100vw;
            overflow-x: hidden;
          }
          
          /* Content area padding */
          .content-area {
            padding: 20px 16px !important;
            width: 100%;
            max-width: 100%;
            overflow-x: hidden;
          }
          
          /* Ensure all containers respect viewport width */
          div {
            max-width: 100%;
          }
          
          /* Make tables horizontally scrollable */
          .table-wrapper {
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
            margin: 0 -16px;
            padding: 0 16px;
          }
          
          .table-wrapper table {
            min-width: 600px;
          }
          
          /* Responsive grid layouts - stack on mobile */
          .grid-2-col {
            grid-template-columns: 1fr !important;
            gap: 24px !important;
          }
          
          .grid-3-col {
            grid-template-columns: 1fr !important;
            gap: 24px !important;
          }
          
          /* Concierge section mobile redesign */
          .concierge-section {
            padding: 32px 20px !important;
            margin-bottom: 32px !important;
            border-radius: 16px !important;
          }
          
          .concierge-grid {
            grid-template-columns: 1fr !important;
            gap: 40px !important;
          }
          
          .concierge-grid > div {
            text-align: center !important;
          }
          
          .concierge-grid img {
            border-radius: 12px !important;
          }
          
          /* Flex layouts - stack on mobile */
          .flex-row {
            flex-direction: column !important;
          }
          
          /* Profile section mobile redesign */
          .profile-section-container {
            flex-direction: column !important;
            gap: 32px !important;
          }
          
          .profile-section-left {
            flex: 1 1 100% !important;
            max-width: 100% !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
          }
          
          .profile-section-right {
            flex: 1 1 100% !important;
            max-width: 100% !important;
            margin-left: 0 !important;
          }
          
          .profile-image-container {
            width: 200px !important;
            height: 200px !important;
            margin: 0 auto 24px !important;
          }
          
          .profile-title {
            text-align: center !important;
            font-size: 24px !important;
            margin-bottom: 24px !important;
          }
          
          /* YTD Stats Card - Stack on mobile */
          .ytd-stats-card {
            flex-direction: column !important;
            gap: 32px !important;
            padding: 24px 20px !important;
            align-items: center !important;
          }
          
          .ytd-stats-card > div {
            flex: 1 1 100% !important;
            text-align: center !important;
            width: 100% !important;
            max-width: 100% !important;
          }
          
          .ytd-stats-card > div > div:first-child {
            font-size: 10px !important;
            margin-bottom: 12px !important;
            text-align: center !important;
          }
          
          .ytd-stats-card > div > div:last-child {
            font-size: 42px !important;
            text-align: center !important;
          }
          
          /* Tier Benefits - Stack on mobile */
          .tier-benefits-grid {
            grid-template-columns: 1fr !important;
            gap: 20px !important;
          }
          
          .tier-benefits-grid > div {
            padding: 24px 20px !important;
          }
          
          .tier-benefits-grid > div > div:first-child {
            font-size: 10px !important;
            margin-bottom: 12px !important;
          }
          
          .tier-benefits-grid > div > div:nth-child(2) {
            font-size: 32px !important;
            margin-bottom: 8px !important;
          }
          
          .tier-benefits-grid > div > div:last-child {
            font-size: 11px !important;
          }
          
          /* Tier Benefits - Mobile-specific styling for selected tier */
          .tier-benefits-grid .tier-card-selected {
            background-color: rgba(107, 125, 71, 0.05) !important;
            border-color: #6b7d47 !important;
          }
          
          /* Override top accent bar to olive on mobile for all selected tiers */
          .tier-benefits-grid .tier-card-selected > div[style*="position: 'absolute'"] {
            background-color: #6b7d47 !important;
          }
          
          /* Ensure all images respect container width */
          img {
            max-width: 100%;
            height: auto;
          }
          
          /* Stack side-by-side layouts */
          .side-by-side {
            flex-direction: column !important;
          }
          
          /* Reduce font sizes */
          h1 { font-size: 28px !important; }
          h2 { font-size: 24px !important; }
          h3 { font-size: 20px !important; }
          
          /* Adjust spacing */
          .spacing-large {
            margin: 24px 0 !important;
          }
          
          .spacing-medium {
            margin: 16px 0 !important;
          }
          
          /* Hide bottom navigation on mobile (use hamburger menu instead) */
          .bottom-nav {
            display: none !important;
          }
        }
        
        /* Tablet styles (768px - 1024px) */
        @media (min-width: 769px) and (max-width: 1024px) {
          .main-content {
            padding: 32px 24px !important;
          }
          
          .content-area {
            padding: 32px 24px !important;
          }
        }
      ` }} />
      
      {/* Header */}
      <div style={{ 
        backgroundColor: 'white', 
        borderBottom: '1px solid #e5e7eb', 
        padding: '16px 20px',
        position: 'sticky',
        top: 0,
        zIndex: 1000
      }}>
        <div style={{ 
          maxWidth: '1400px', 
          margin: '0 auto', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1 }}>
            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              style={{
                display: 'none',
                flexDirection: 'column',
                gap: '4px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '8px',
                minWidth: '44px',
                minHeight: '44px',
                justifyContent: 'center',
                alignItems: 'center'
              }}
              className="mobile-menu-button"
            >
              <div style={{
                width: '24px',
                height: '2px',
                backgroundColor: brandCharcoal,
                transition: 'all 0.3s ease',
                transform: mobileMenuOpen ? 'rotate(45deg) translateY(8px)' : 'none'
              }} />
              <div style={{
                width: '24px',
                height: '2px',
                backgroundColor: brandCharcoal,
                transition: 'all 0.3s ease',
                opacity: mobileMenuOpen ? 0 : 1
              }} />
              <div style={{
                width: '24px',
                height: '2px',
                backgroundColor: brandCharcoal,
                transition: 'all 0.3s ease',
                transform: mobileMenuOpen ? 'rotate(-45deg) translateY(-8px)' : 'none'
              }} />
            </button>
            
            {/* Mayker Reserve Logo */}
            {logoError ? (
              <div style={{ 
                fontSize: '16px', 
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
                onClick={() => setActiveSection('performance')}
                style={{ 
                  height: '40px', 
                  width: 'auto',
                  maxWidth: '200px',
                  display: 'block',
                  cursor: 'pointer'
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
            fontSize: '14px', 
            fontWeight: '500', 
            color: brandCharcoal,
            fontFamily: "'NeueHaasUnica', sans-serif",
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            display: 'none'
          }} className="desktop-only">
            MEMBER PORTAL
          </div>
        </div>
        
        {/* Mobile Navigation Menu */}
        <div style={{
          display: mobileMenuOpen ? 'block' : 'none',
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          backgroundColor: 'white',
          borderBottom: '1px solid #e5e7eb',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
          maxHeight: 'calc(100vh - 73px)',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch'
        }} className="mobile-menu">
          {navigationSections.map((nav) => (
            <button
              key={nav.key}
              onClick={() => handleNavClick(nav.section)}
              style={{
                width: '100%',
                padding: '16px 20px',
                textAlign: 'left',
                background: 'none',
                border: 'none',
                borderBottom: '1px solid #f0f0f0',
                fontSize: '14px',
                fontWeight: '500',
                color: activeSection === nav.section ? brandCharcoal : '#666',
                fontFamily: "'NeueHaasUnica', sans-serif",
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                backgroundColor: activeSection === nav.section ? '#fafaf8' : 'white',
                transition: 'all 0.2s ease',
                minHeight: '44px'
              }}
            >
              {nav.label}
            </button>
          ))}
        </div>
      </div>
      
      {/* Desktop Navigation - Hidden on Mobile */}
      <div style={{
        backgroundColor: 'white',
        borderBottom: '1px solid #e5e7eb',
        padding: '0 32px',
        display: 'none'
      }} className="desktop-nav">
        <div style={{ 
          maxWidth: '1400px', 
          margin: '0 auto', 
          display: 'flex', 
          justifyContent: 'center',
          gap: '8px',
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch'
        }}>
          {navigationSections.map((nav) => (
            <button
              key={nav.key}
              onClick={() => handleNavClick(nav.section)}
              style={{
                padding: '16px 24px',
                background: 'none',
                border: 'none',
                borderBottom: activeSection === nav.section ? `2px solid ${brandCharcoal}` : '2px solid transparent',
                fontSize: '12px',
                fontWeight: '500',
                color: activeSection === nav.section ? brandCharcoal : '#666',
                fontFamily: "'NeueHaasUnica', sans-serif",
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.2s ease',
                minHeight: '44px'
              }}
            >
              {nav.label}
            </button>
          ))}
        </div>
      </div>
      
      {/* Main Content */}
      <div style={{ 
        flex: '1', 
        maxWidth: '1400px', 
        margin: '0 auto', 
        width: '100%', 
        padding: '24px 16px'
      }} className="main-content">
        {/* Content Area */}
        <div style={{ 
          backgroundColor: 'white', 
          borderRadius: '0', 
          padding: '24px', 
          minHeight: '500px',
          marginBottom: '24px'
        }} className="content-area">
          {activeSection === 'profile' && (
            <ProfileSection 
              clientInfo={clientInfo} 
              profileData={profileData}
              editingProfile={editingProfile}
              setEditingProfile={setEditingProfile}
              onLogout={onLogout}
              brandCharcoal={brandCharcoal}
              brandBrown={brandBrown}
              brandBlue={brandBlue}
            />
          )}
          
          {activeSection === 'performance' && (
            <OverviewSection 
              clientInfo={clientInfo}
              spendData={spendData}
              proposals={proposals}
              setSelectedProposal={setSelectedProposal}
              brandCharcoal={brandCharcoal}
            />
          )}
          
          {activeSection === 'activity' && (
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
          
          {activeSection === 'faq' && (
            <FAQSection brandCharcoal={brandCharcoal} />
          )}
          
          {activeSection === 'contact' && (
            <ContactSection brandCharcoal={brandCharcoal} />
          )}
        </div>

        {/* Navigation - Elevated Soho House Style (Desktop Only) */}
        <div style={{ 
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '2px',
          marginTop: '64px',
          padding: '8px',
          backgroundColor: '#fafaf8',
          borderRadius: '12px',
          maxWidth: '900px',
          marginLeft: 'auto',
          marginRight: 'auto',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)'
        }} className="bottom-nav">
          {navigationSections.map((nav, index) => {
            const isActive = getCurrentNavKey() === nav.key;
            return (
              <button
                key={nav.key}
                onClick={() => handleNavClick(nav.section)}
                style={{
                  padding: '14px 28px',
                  backgroundColor: isActive ? brandCharcoal : 'transparent',
                  color: isActive ? 'white' : '#8b8b8b',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: isActive ? '500' : '400',
                  fontFamily: "'NeueHaasUnica', sans-serif",
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  transition: 'all 0.3s ease',
                  position: 'relative',
                  whiteSpace: 'nowrap'
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.color = brandCharcoal;
                    e.currentTarget.style.backgroundColor = '#f5f5f0';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.color = '#8b8b8b';
                    e.currentTarget.style.backgroundColor = 'transparent';
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
            <div>
              <a
                href="https://maykerevents.com"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: 'white',
                  textDecoration: 'none',
                  borderBottom: '1px solid transparent',
                  transition: 'border-color 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderBottomColor = 'white';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderBottomColor = 'transparent';
                }}
              >
                maykerevents.com
              </a>
            </div>
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
  const brandTaupe = '#545142';
  const brandCharcoal = '#2C2C2C';
  
  // Scroll to top when this view mounts
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);
  
  const sections = JSON.parse(proposal.sectionsJSON || '[]');
  const totals = calculateDetailedTotals(proposal);
  
  const handlePrintDownload = () => {
    window.print();
  };
  
  return (
    <div data-proposal-view="true" style={{ minHeight: '100vh', backgroundColor: 'white' }}>
      {/* Print styles */}
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Inter', sans-serif; background: white; }
        @media print {
          .no-print { display: none !important; }
          @page { 
            size: letter; 
            margin: 0.5in;
          }
          body { 
            -webkit-print-color-adjust: exact; 
            print-color-adjust: exact;
            background: white;
          }
          div[data-proposal-view="true"] {
            background: white !important;
          }
          div[style*="background-color: #545142"] {
            background-color: #545142 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      ` }} />
      
      {/* Navigation bar - hidden when printing */}
      <div className="no-print" style={{ position: 'fixed', top: 0, left: 0, right: 0, backgroundColor: 'white', borderBottom: '1px solid #e5e7eb', zIndex: 1000, padding: '16px 24px' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
          <button onClick={onBack} style={{ color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', fontFamily: "'Neue Haas Unica', 'Inter', sans-serif" }}>
            ← Back to Dashboard
          </button>
          <div style={{ display: 'flex', gap: '12px' }}>
            {ADMIN_PROPOSAL_APP_URL && proposal.projectNumber && (
              <a
                href={`${ADMIN_PROPOSAL_APP_URL}?projectNumber=${encodeURIComponent(proposal.projectNumber)}${proposal.version ? `&version=${encodeURIComponent(proposal.version)}` : ''}&clientView=true`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ padding: '8px 20px', backgroundColor: '#059669', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '14px', fontFamily: "'Neue Haas Unica', 'Inter', sans-serif", textDecoration: 'none', display: 'inline-block' }}
              >
                View Full Proposal
              </a>
            )}
            <button onClick={handlePrintDownload} style={{ padding: '8px 20px', backgroundColor: brandCharcoal, color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '14px', fontFamily: "'Neue Haas Unica', 'Inter', sans-serif" }}>
              Print / Export as PDF
            </button>
            <button onClick={onLogout} style={{ padding: '8px 20px', backgroundColor: '#f3f4f6', color: brandCharcoal, border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '14px', fontFamily: "'Neue Haas Unica', 'Inter', sans-serif" }}>
            Sign Out
          </button>
          </div>
        </div>
      </div>
      
      {/* COVER PAGE */}
      <div style={{ backgroundColor: brandTaupe, minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '60px 48px', pageBreakAfter: 'always' }}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '80px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
            <img src="/mayker_wordmark-events-whisper.svg" alt="MAYKER EVENTS" style={{ height: '32px', marginBottom: '24px' }} onError={(e) => { e.target.style.display = 'none'; }} />
            <div style={{ width: '60px', height: '0.5px', backgroundColor: 'rgba(255,255,255,0.4)', marginBottom: '24px' }}></div>
            <p style={{ fontSize: '14px', color: 'white', letterSpacing: '0.1em', marginBottom: '16px', fontFamily: "'Neue Haas Unica', 'Inter', sans-serif", textTransform: 'uppercase' }}>Product Selections</p>
            <p style={{ fontSize: '18px', color: 'white', marginBottom: '6px', fontWeight: '300', fontFamily: "'Domaine Text', serif" }}>{proposal.clientName ? proposal.clientName.replace(/\s*\(V\d+\)\s*$/, '') : 'Proposal'}{proposal.status === 'Approved' ? ' (Final)' : ''}</p>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.9)', marginBottom: '4px', fontFamily: "'Neue Haas Unica', 'Inter', sans-serif" }}>{proposal.venueName}</p>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.9)', fontFamily: "'Neue Haas Unica', 'Inter', sans-serif" }}>{formatDateRange(proposal)}</p>
          </div>
          <img src="/mayker_icon-whisper.svg" alt="Mayker Events" style={{ width: '60px', height: '60px' }} onError={(e) => { e.target.style.display = 'none'; }} />
        </div>
          </div>
          
      {/* PRODUCT SECTIONS */}
      {sections.map((section, sectionIndex) => (
        <div key={sectionIndex} style={{ minHeight: '100vh', padding: '30px 60px 40px', pageBreakAfter: 'always' }}>
          <div style={{ marginBottom: '20px', paddingBottom: '15px', borderBottom: '1px solid #e5e7eb' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <img src="/mayker_wordmark-events-black.svg" alt="Mayker Events" style={{ height: '22px', marginTop: '4px' }} onError={(e) => { e.target.style.display = 'none'; }} />
              <div style={{ textAlign: 'right', display: 'flex', alignItems: 'flex-start', gap: '20px' }}>
                <div style={{ fontSize: '9px', color: '#666', fontFamily: "'Neue Haas Unica', 'Inter', sans-serif", lineHeight: '1.4', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                  <div>{proposal.clientName || ''}</div>
                  <div>{formatDateRange(proposal)}</div>
                  <div>{proposal.venueName || ''}</div>
                </div>
                <img src="/mayker_icon-black.svg" alt="M" style={{ height: '38px' }} onError={(e) => { e.target.style.display = 'none'; }} />
              </div>
            </div>
          </div>
          
          <h2 style={{ fontSize: '18px', fontWeight: '400', color: brandCharcoal, marginBottom: '20px', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: "'Domaine Text', serif" }}>
            {section.name}
          </h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
            {section.products && section.products.map((product, productIndex) => (
              <div key={productIndex} style={{ backgroundColor: '#f9f9f9', padding: '15px', borderRadius: '4px' }}>
                <div style={{ aspectRatio: '1', backgroundColor: '#e5e5e5', marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: '#999', overflow: 'hidden', borderRadius: '2px' }}>
                  {product.imageUrl ? (
                    <img src={product.imageUrl} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.target.style.display = 'none'; }} />
                  ) : (
                    '[Product Image]'
                  )}
            </div>
                <h3 style={{ fontSize: '11px', fontWeight: '500', color: brandCharcoal, textTransform: 'uppercase', marginBottom: '4px', fontFamily: "'Neue Haas Unica', 'Inter', sans-serif" }}>
                  {product.name}
                </h3>
                <p style={{ fontSize: '10px', color: '#666', marginBottom: '4px', fontFamily: "'Neue Haas Unica', 'Inter', sans-serif" }}>Quantity: {product.quantity}</p>
                {product.dimensions && (
                  <p style={{ fontSize: '10px', color: '#666', fontFamily: "'Neue Haas Unica', 'Inter', sans-serif" }}>{product.dimensions}</p>
                )}
          </div>
            ))}
          </div>
        </div>
      ))}

      {/* INVOICE & PROJECT DETAILS PAGE (Combined) */}
      <div style={{ minHeight: '100vh', padding: '30px 60px 40px', pageBreakAfter: 'always' }}>
        <div style={{ marginBottom: '20px', paddingBottom: '15px', borderBottom: '1px solid #e5e7eb' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <img src="/mayker_wordmark-events-black.svg" alt="Mayker Events" style={{ height: '22px', marginTop: '4px' }} onError={(e) => { e.target.style.display = 'none'; }} />
            <div style={{ textAlign: 'right', display: 'flex', alignItems: 'flex-start', gap: '20px' }}>
              <div style={{ fontSize: '9px', color: '#666', fontFamily: "'Neue Haas Unica', 'Inter', sans-serif", lineHeight: '1.4', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                <div>{proposal.clientName || ''}</div>
                <div>{formatDateRange(proposal)}</div>
                <div>{proposal.venueName || ''}</div>
              </div>
              <img src="/mayker_icon-black.svg" alt="M" style={{ height: '38px' }} onError={(e) => { e.target.style.display = 'none'; }} />
            </div>
            </div>
          </div>
          
        <h2 style={{ fontSize: '18px', fontWeight: '400', color: brandCharcoal, marginBottom: '20px', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center', fontFamily: "'Domaine Text', serif" }}>Invoice</h2>
        
        {/* Invoice table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '30px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
              <th style={{ padding: '8px 0', fontSize: '9px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#666', textAlign: 'left', fontFamily: "'Neue Haas Unica', 'Inter', sans-serif" }}>Section</th>
              <th style={{ padding: '8px 0', fontSize: '9px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#666', textAlign: 'left', fontFamily: "'Neue Haas Unica', 'Inter', sans-serif" }}>Product</th>
              <th style={{ padding: '8px 0', fontSize: '9px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#666', textAlign: 'center', fontFamily: "'Neue Haas Unica', 'Inter', sans-serif" }}>Qty</th>
              <th style={{ padding: '8px 0', fontSize: '9px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#666', textAlign: 'right', fontFamily: "'Neue Haas Unica', 'Inter', sans-serif" }}>Unit Price</th>
              <th style={{ padding: '8px 0', fontSize: '9px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#666', textAlign: 'right', fontFamily: "'Neue Haas Unica', 'Inter', sans-serif" }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {sections.flatMap((section, sectionIndex) =>
              section.products && section.products.map((product, productIndex) => {
                const extendedPrice = product.price * totals.rentalMultiplier;
                const lineTotal = extendedPrice * product.quantity;
                
                return (
                  <tr key={`${sectionIndex}-${productIndex}`} style={{ borderBottom: '1px solid #f8f8f8' }}>
                    <td style={{ padding: '10px 0', fontSize: '11px', color: '#888', fontStyle: 'italic', fontFamily: "'Neue Haas Unica', 'Inter', sans-serif" }}>
                      {productIndex === 0 ? section.name : ''}
                    </td>
                    <td style={{ padding: '10px 0', fontSize: '11px', color: brandCharcoal, fontFamily: "'Neue Haas Unica', 'Inter', sans-serif" }}>
                      {product.name}
                    </td>
                    <td style={{ padding: '10px 0', fontSize: '11px', color: brandCharcoal, textAlign: 'center', fontFamily: "'Neue Haas Unica', 'Inter', sans-serif" }}>
                      {product.quantity}
                    </td>
                    <td style={{ padding: '10px 0', fontSize: '11px', color: brandCharcoal, textAlign: 'right', fontFamily: "'Neue Haas Unica', 'Inter', sans-serif", whiteSpace: 'nowrap' }}>
                      ${formatNumber(extendedPrice)}
                    </td>
                    <td style={{ padding: '10px 0', fontSize: '11px', color: brandCharcoal, textAlign: 'right', fontFamily: "'Neue Haas Unica', 'Inter', sans-serif", whiteSpace: 'nowrap' }}>
                      ${formatNumber(lineTotal)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        
        {/* Totals section - Combined with Project Details */}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '60px', marginTop: '40px' }}>
          {/* Invoice Totals - Left Side */}
          <div style={{ flex: '1' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '20px' }}>
              <tbody>
                <tr>
                  <td style={{ padding: '8px 0', fontSize: '11px', color: '#666', fontFamily: "'Neue Haas Unica', 'Inter', sans-serif", textAlign: 'right', width: '50%' }}>Product Subtotal</td>
                  <td style={{ padding: '8px 0', fontSize: '11px', color: brandCharcoal, textAlign: 'right', fontFamily: "'Neue Haas Unica', 'Inter', sans-serif", width: '50%' }}>
                    ${formatNumber(totals.productSubtotal)}
                  </td>
                </tr>
                {totals.standardRateDiscount > 0 && (
                  <tr>
                    <td style={{ padding: '8px 0', fontSize: '11px', color: '#059669', fontFamily: "'Neue Haas Unica', 'Inter', sans-serif", textAlign: 'right' }}>
                      Discount ({proposal.discount || proposal.discountValue || 0}% off)
                    </td>
                    <td style={{ padding: '8px 0', fontSize: '11px', color: '#059669', textAlign: 'right', fontFamily: "'Neue Haas Unica', 'Inter', sans-serif" }}>
                      -${formatNumber(totals.standardRateDiscount)}
                    </td>
                  </tr>
                )}
                <tr style={{ borderTop: '1px solid #e5e7eb', borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '10px 0', fontSize: '11px', fontWeight: '500', color: brandCharcoal, fontFamily: "'Neue Haas Unica', 'Inter', sans-serif", textAlign: 'right' }}>Rental Total</td>
                  <td style={{ padding: '10px 0', fontSize: '11px', fontWeight: '500', color: brandCharcoal, textAlign: 'right', fontFamily: "'Neue Haas Unica', 'Inter', sans-serif" }}>${formatNumber(totals.rentalTotal)}</td>
                </tr>
                <tr>
                  <td style={{ padding: '8px 0', fontSize: '11px', color: '#666', fontFamily: "'Neue Haas Unica', 'Inter', sans-serif", textAlign: 'right' }}>Product Care (10%)</td>
                  <td style={{ padding: '8px 0', fontSize: '11px', color: brandCharcoal, textAlign: 'right', fontFamily: "'Neue Haas Unica', 'Inter', sans-serif" }}>${formatNumber(totals.productCare)}</td>
                </tr>
                <tr>
                  <td style={{ padding: '8px 0', fontSize: '11px', color: '#666', fontFamily: "'Neue Haas Unica', 'Inter', sans-serif", textAlign: 'right' }}>Service Fee (5%)</td>
                  <td style={{ padding: '8px 0', fontSize: '11px', color: brandCharcoal, textAlign: 'right', fontFamily: "'Neue Haas Unica', 'Inter', sans-serif" }}>${formatNumber(totals.serviceFee)}</td>
                </tr>
                <tr>
                  <td style={{ padding: '8px 0', fontSize: '11px', color: '#666', fontFamily: "'Neue Haas Unica', 'Inter', sans-serif", textAlign: 'right' }}>Delivery</td>
                  <td style={{ padding: '8px 0', fontSize: '11px', color: brandCharcoal, textAlign: 'right', fontFamily: "'Neue Haas Unica', 'Inter', sans-serif" }}>${formatNumber(totals.delivery)}</td>
                </tr>
                <tr style={{ borderTop: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '10px 0', fontSize: '11px', fontWeight: '500', color: brandCharcoal, fontFamily: "'Neue Haas Unica', 'Inter', sans-serif", textAlign: 'right' }}>Subtotal</td>
                  <td style={{ padding: '10px 0', fontSize: '11px', fontWeight: '500', color: brandCharcoal, textAlign: 'right', fontFamily: "'Neue Haas Unica', 'Inter', sans-serif" }}>${formatNumber(totals.subtotal)}</td>
                </tr>
                <tr>
                  <td style={{ padding: '8px 0', fontSize: '11px', color: '#666', fontFamily: "'Neue Haas Unica', 'Inter', sans-serif", textAlign: 'right' }}>Tax (9.75%)</td>
                  <td style={{ padding: '8px 0', fontSize: '11px', color: brandCharcoal, textAlign: 'right', fontFamily: "'Neue Haas Unica', 'Inter', sans-serif" }}>${formatNumber(totals.tax)}</td>
                </tr>
                <tr style={{ borderTop: '2px solid ' + brandCharcoal }}>
                  <td style={{ padding: '14px 0', fontSize: '14px', fontWeight: '600', color: brandCharcoal, fontFamily: "'Neue Haas Unica', 'Inter', sans-serif", textAlign: 'right' }}>TOTAL</td>
                  <td style={{ padding: '14px 0', fontSize: '14px', fontWeight: '600', color: brandCharcoal, textAlign: 'right', fontFamily: "'Neue Haas Unica', 'Inter', sans-serif" }}>${formatNumber(totals.total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          
          {/* Project Details - Right Side */}
          <div style={{ flex: '1' }}>
            <h2 style={{ fontSize: '16px', fontWeight: '400', color: brandCharcoal, marginBottom: '20px', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: "'Domaine Text', serif" }}>Project Details</h2>
            
            <p style={{ marginBottom: '24px', fontSize: '12px', lineHeight: '1.6', color: '#444', fontFamily: "'Neue Haas Unica', 'Inter', sans-serif" }}>
              The project fee quoted is based on the current scope of rentals, as well as the delivery details below. If your requirements change, delivery fees may adjust accordingly:
            </p>
            
            <ul style={{ fontSize: '12px', lineHeight: '1.8', marginBottom: '20px', color: '#222', listStyle: 'none', padding: 0, fontFamily: "'Neue Haas Unica', 'Inter', sans-serif" }}>
              <li style={{ marginBottom: '8px' }}><strong>Project Location:</strong> {proposal.venueName}, {proposal.city}, {proposal.state}</li>
              <li style={{ marginBottom: '8px' }}><strong>Delivery Date:</strong> {parseDateSafely(proposal.startDate)?.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) || ''}</li>
              <li style={{ marginBottom: '8px' }}><strong>Preferred Delivery Window:</strong> {proposal.deliveryTime || 'TBD'}</li>
              <li style={{ marginBottom: '8px' }}><strong>Pick-Up Date:</strong> {parseDateSafely(proposal.endDate)?.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) || ''}</li>
              <li style={{ marginBottom: '8px' }}><strong>Preferred Pick-Up Window:</strong> {proposal.strikeTime || 'TBD'}</li>
            </ul>
          </div>
        </div>
        
        {/* Footer */}
        <div style={{ marginTop: '60px', paddingTop: '20px', borderTop: '1px solid #e5e7eb', textAlign: 'center' }}>
          <p style={{ fontSize: '9px', color: '#999', fontFamily: "'Neue Haas Unica', 'Inter', sans-serif", letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Mayker Events • events@mayker.com
          </p>
        </div>
      </div>
    </div>
  );
}

