# Homie

AI-powered home maintenance diagnostic and service provider matching platform.

## Tech Stack

- **Backend:** Node.js, Express, TypeScript
- **Frontend:** React, TypeScript, Tailwind CSS
- **Database:** PostgreSQL with Drizzle ORM
- **Cache/Real-time:** Redis
- **Infrastructure:** AWS

## Key Commands

```bash
npm run dev    # Start development server
npm run build  # Build for production
npm test       # Run tests
npm run lint   # Lint code
```

## Conventions

- TypeScript strict mode everywhere — no `any` types
- React: functional components with hooks only
- All API responses follow `{ data, error, meta }` format
- Database access only through Drizzle ORM
- Commit messages in imperative mood, under 72 characters
