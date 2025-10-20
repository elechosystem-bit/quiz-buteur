# Quiz Buteur Live

## Overview
Quiz Buteur Live is an interactive real-time quiz application for sports bars and fans. Users can join live quizzes during football matches, answer questions, and compete with others.

## Project Architecture
- **Frontend Framework**: React 18.2 with Vite 5.0
- **Authentication & Database**: Firebase (Realtime Database + Auth)
- **External API**: API-Football for live match data
- **UI Libraries**: Tailwind CSS (via CDN), Lucide React icons
- **State Management**: React hooks (useState, useEffect, useRef)

## Key Features
- Real-time quiz system with auto-generated questions
- Multi-screen support (TV display, mobile player interface, admin panel)
- Live match integration with API-Football
- Firebase Realtime Database for real-time synchronization
- Wake Lock API to keep screens active during matches
- Player scoring and leaderboards
- Bar-based quiz rooms with unique codes

## Recent Changes (October 2025)
- **Security Enhancement**: Moved all API keys and Firebase configuration to environment variables
- **Replit Migration**: Configured Vite to run on port 5000 with host 0.0.0.0 for Replit compatibility
- **Package Management**: Updated scripts for development and preview modes

## Environment Variables Required
See `.env.example` for the full list:
- Firebase configuration (8 variables)
- API-Football API key

## Development
- Run `npm run dev` to start the development server on port 5000
- The app supports multiple screens: home, TV display, mobile player, admin panel
- Bar IDs can be passed via URL query parameter: `?bar=YOUR_BAR_ID`

## User Preferences
None recorded yet.

## Technology Stack
- React + Vite
- Firebase Realtime Database & Authentication
- API-Football (RapidAPI)
- Tailwind CSS
- Lucide React
