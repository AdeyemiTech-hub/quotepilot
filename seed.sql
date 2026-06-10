-- QuotePilot seed data — AdeyemiTech
-- Run in the Supabase SQL editor, then: npx tsx embed.ts
-- Review the prices before running and tweak to what you actually charge.

-- ── Service catalog ──────────────────────────────────────
INSERT INTO service_catalog (name, description, base_price_min, base_price_max, unit) VALUES
('Business landing page',
 'Single-page responsive website for a local business or brand: hero section, services, testimonials, WhatsApp and contact integration, basic SEO, fast load on mobile data.',
 150, 450, 'project'),

('Multi-page business website',
 'Up to 6 pages built with React and a CMS so the owner can edit content themselves. Contact forms, Google Maps and Business profile integration, analytics.',
 500, 1500, 'project'),

('E-commerce store',
 'Online store with product catalog, cart and checkout, Paystack or Stripe payments, order notifications, basic inventory management. Built on a modern stack, not a page builder.',
 1000, 3500, 'project'),

('Mobile app (React Native + Expo)',
 'Cross-platform iOS and Android app with authentication, core feature set, push notifications, Supabase backend, and app store submission support.',
 2000, 7000, 'project'),

('AI chatbot or assistant integration',
 'Custom AI assistant added to a website, WhatsApp, or Telegram: answers customer questions from business data, captures leads, hands off to a human when needed. Built on LLM APIs with usage cost controls.',
 400, 2000, 'project'),

('Business workflow automation',
 'Automating repetitive processes: lead capture to spreadsheet to email follow-up, order alerts, report generation, connecting tools the business already uses.',
 300, 1500, 'project'),

('Telegram bot or mini app',
 'Custom Telegram bot or mini app for communities and businesses: commands, payments, user management, integration with external APIs.',
 250, 1200, 'project'),

('Web3 / crypto application',
 'Wallet-connected web or mobile application: token dashboards, exchange-style interfaces, NFT integration, smart contract interaction on EVM chains.',
 1500, 6000, 'project'),

('Maintenance and feature updates',
 'Ongoing updates, bug fixes, new features, and performance work on an existing website or app I built or inherited.',
 20, 50, 'hour');

-- ── Past projects ────────────────────────────────────────
INSERT INTO past_projects (title, description, final_price, duration_days, tags) VALUES
('QNTMEX crypto exchange app',
 'Designed and built a mobile crypto exchange application in React Native and Expo with TypeScript: live market data, wallet views, buy and sell flows, secure auth, Supabase backend. Full product built end to end as founder and sole developer.',
 6000, 90, ARRAY['mobile_app','web3','react_native','fintech']),

('Restaurant web presence package',
 'Landing page for a Lagos restaurant: menu, gallery, opening hours, WhatsApp ordering button, Google Business setup. Optimized to load fast on mobile data. Delivered as part of local business outreach.',
 250, 6, ARRAY['web_app','landing_page','local_business']),

('Boutique e-commerce store',
 'Online store for a fashion retailer: 60 plus products, Paystack checkout, delivery fee logic by zone, WhatsApp order notifications, admin panel for stock updates.',
 1400, 25, ARRAY['ecommerce','payments','local_business']),

('AI customer support chatbot for service business',
 'Built an AI assistant trained on the business services and pricing, embedded on their site and connected to WhatsApp. Answers common questions, qualifies leads, forwards serious inquiries to the owner with a summary.',
 800, 14, ARRAY['ai_integration','chatbot','automation']),

('Trivia quiz mobile app',
 'Cross-platform quiz application in React Native: timed questions, categories, leaderboards, ad integration, offline question packs. Delivered for a client building an education product.',
 1800, 30, ARRAY['mobile_app','react_native','education']),

('Telegram community bot with payments',
 'Telegram bot for a paid community: subscription payments, automatic member access control, broadcast announcements, referral tracking.',
 600, 12, ARRAY['telegram','automation','payments']),

('NFT game frontend',
 'Web frontend for an NFT based game: wallet connect, NFT minting flow, inventory display pulling on-chain data, marketplace listing interface.',
 2200, 35, ARRAY['web3','nft','web_app']),

('Lead capture automation for an agency',
 'Automated pipeline taking leads from a website form into a structured sheet, sending instant personalized follow-up emails, and alerting the team on Telegram for hot leads.',
 450, 8, ARRAY['automation','lead_generation','email']);