#!/usr/bin/env node
/**
 * Seed jobs script
 * Seeds the database with mock job data via the API
 */

import axios from 'axios';

async function seedJobs() {
  // Try multiple endpoints - gateway (port 3000) or direct API (port 3002)
  const endpoints = [
    'http://localhost:3000/api/jobs/seed', // Through API gateway
    'http://localhost:3002/api/jobs/seed', // Direct to analytics API
  ];

  for (const endpoint of endpoints) {
    try {
      console.log(`Attempting to seed jobs via ${endpoint}...`);

      const response = await axios.post(
        endpoint,
        {},
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        }
      );

      if (response.status === 200 || response.status === 201) {
        console.log('✅ Jobs seeded successfully!');
        console.log(`   Count: ${response.data.count || response.data.jobs?.length || 'unknown'}`);
        console.log(`   Endpoint used: ${endpoint}`);
        return;
      }
    } catch (error) {
      if (error.response) {
        console.log(
          `   ❌ ${endpoint}: ${error.response.status} - ${error.response.data?.error || error.message}`
        );
      } else if (error.request) {
        console.log(`   ⚠️  ${endpoint}: No response (service may not be running)`);
      } else {
        console.log(`   ❌ ${endpoint}: ${error.message}`);
      }
      continue;
    }
  }

  console.error('\n❌ Failed to seed jobs. Please ensure:');
  console.error('   1. Analytics API is running (port 3002)');
  console.error('   2. API Gateway is running (port 3000)');
  console.error('   3. Database is accessible');
  console.error('\nYou can also seed jobs manually via:');
  console.error('   curl -X POST http://localhost:3002/api/jobs/seed');
  process.exit(1);
}

seedJobs();
